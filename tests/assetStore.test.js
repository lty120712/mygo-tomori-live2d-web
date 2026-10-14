import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSET_LIMITS, kindOfFile, sizeOk } from '../src/assetStore.js'

const fakeFile = (type, name, size) => ({ type, name, size })

test('按 MIME 与扩展名识别图片、音频与视频素材', () => {
  assert.equal(kindOfFile(fakeFile('image/png', 'a.png', 1)), 'image')
  assert.equal(kindOfFile(fakeFile('audio/mpeg', 'a.mp3', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('', 'B.JPG', 1)), 'image')
  assert.equal(kindOfFile(fakeFile('', 'c.opus', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('video/mp4', 'd.mp4', 1)), 'video')
  assert.equal(kindOfFile(fakeFile('video/quicktime', 'e.mov', 1)), 'video')
  assert.equal(kindOfFile(fakeFile('', 'F.WEBM', 1)), 'video')
  assert.equal(kindOfFile(fakeFile('', 'g.mkv', 1)), 'video')
  assert.equal(kindOfFile(fakeFile('audio/mp4', 'h.mp4', 1)), 'audio', 'MIME 优先，音频容器不会被扩展名抢成视频')
  assert.equal(kindOfFile(fakeFile('', 'i.m4a', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('application/zip', 'j.zip', 1)), null)
})

test('大小上限：图片 64MB、音频与视频 512MB', () => {
  assert.equal(ASSET_LIMITS.image, 64 * 1024 * 1024)
  assert.equal(ASSET_LIMITS.audio, 512 * 1024 * 1024)
  assert.equal(ASSET_LIMITS.video, 512 * 1024 * 1024)
  assert.equal(sizeOk(fakeFile('image/png', 'a.png', 64 * 1024 * 1024), 'image'), true)
  assert.equal(sizeOk(fakeFile('image/png', 'a.png', 64 * 1024 * 1024 + 1), 'image'), false)
  assert.equal(sizeOk(fakeFile('audio/mpeg', 'a.mp3', 512 * 1024 * 1024), 'audio'), true)
  assert.equal(sizeOk(fakeFile('audio/mpeg', 'a.mp3', 512 * 1024 * 1024 + 1), 'audio'), false)
  assert.equal(sizeOk(fakeFile('video/mp4', 'a.mp4', 512 * 1024 * 1024), 'video'), true)
  assert.equal(sizeOk(fakeFile('video/mp4', 'a.mp4', 512 * 1024 * 1024 + 1), 'video'), false)
})

import { createAssetStore, memoryBackend, resolveWebmDuration } from '../src/assetStore.js'

/** 媒体元素替身：跳转时间时可自定义行为，用来模拟浏览器回填 WebM 时长。 */
function mediaStub(onSeek) {
  const listeners = {}
  const el = {
    duration: Infinity,
    _time: 0,
    listeners,
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler) },
    removeEventListener(type, handler) { listeners[type] = (listeners[type] || []).filter(item => item !== handler) },
    fire(type) { for (const handler of [...(listeners[type] || [])]) handler() },
  }
  Object.defineProperty(el, 'currentTime', {
    get() { return el._time },
    set(value) { el._time = value; if (!onSeek) throw new Error('no seek'); onSeek(el) },
  })
  return el
}

test('MediaRecorder 录出的 WebM 没有时长：定位到末尾后回填真实时长', async () => {
  const el = mediaStub(self => { self.duration = 12.5; self.fire('durationchange') })
  assert.equal(await resolveWebmDuration(el), 12.5)
  assert.equal(el.listeners.durationchange.length, 0, '拿到结果后要摘掉监听，避免重复触发')
  assert.ok(el.currentTime > 1e6, '通过跳到最后逼浏览器扫完整段')
})

test('扫不出时长时按未知处理，跳转报错也不阻塞导入', async () => {
  assert.equal(await resolveWebmDuration(mediaStub(() => {}), 20), 0)
  assert.equal(await resolveWebmDuration(mediaStub(null), 20), 0)
})

test('没有事件回调时超时返回当下可读的时长', async () => {
  assert.equal(await resolveWebmDuration(mediaStub(self => { self.duration = 7 }), 20), 7)
})

const noProbe = {
  probeImage: async () => ({ width: 0, height: 0, thumb: '' }),
  probeAudio: async () => ({ duration: 0 }),
  probeVideo: async () => ({ width: 0, height: 0, duration: 0, thumb: '' }),
}

test('导入图片素材后可列出、读取、删除', async () => {
  const store = createAssetStore(memoryBackend(), noProbe)
  const file = { type: 'image/png', name: 'a.png', size: 10 }
  const meta = await store.importFile(file)
  assert.equal(meta.kind, 'image')
  assert.equal(meta.name, 'a.png')
  assert.ok(meta.id)
  assert.equal((await store.list()).length, 1)
  assert.equal(await store.blob(meta.id), file)
  await store.remove(meta.id)
  assert.equal((await store.list()).length, 0)
})

test('拒绝不支持类型与超限文件', async () => {
  const store = createAssetStore(memoryBackend(), noProbe)
  await assert.rejects(() => store.importFile({ type: 'application/zip', name: 'v.zip', size: 10 }), /不支持/)
  await assert.rejects(() => store.importFile({ type: 'image/png', name: 'a.png', size: 65 * 1024 * 1024 }), /64MB/)
  await assert.rejects(() => store.importFile({ type: 'audio/mpeg', name: 'a.mp3', size: 512 * 1024 * 1024 + 1 }), /512MB/)
  await assert.rejects(() => store.importFile({ type: 'video/mp4', name: 'a.mp4', size: 512 * 1024 * 1024 + 1 }), /512MB/)
})

test('导入视频素材：写入宽高、时长与首帧缩略图', async () => {
  const store = createAssetStore(memoryBackend(), {
    ...noProbe,
    probeVideo: async () => ({ width: 1280, height: 720, duration: 12.5, thumb: 'data:image/webp;base64,xx' }),
  })
  const meta = await store.importFile({ type: 'video/mp4', name: 'clip.mp4', size: 1024 })
  assert.equal(meta.kind, 'video')
  assert.equal(meta.width, 1280)
  assert.equal(meta.height, 720)
  assert.equal(meta.duration, 12.5)
  assert.ok(meta.thumb.startsWith('data:image/webp'))
  assert.equal(meta.peaks, undefined, '视频不生成波形')
})

test('按 ID 读取素材元数据：命中缓存，删除后失效', async () => {
  const backend = memoryBackend()
  const store = createAssetStore(backend, noProbe)
  const meta = await store.importFile({ type: 'video/mp4', name: 'clip.mp4', size: 8 })
  assert.equal((await store.meta(meta.id)).name, 'clip.mp4')
  await backend.put(meta.id, { ...meta, name: '改动.mp4' }, new Blob(['video']))
  assert.equal((await store.meta(meta.id)).name, 'clip.mp4', '命中内存缓存不再回查后端')
  assert.equal(await store.meta('missing'), null)
  await store.remove(meta.id)
  assert.equal(await store.meta(meta.id), null)
})

test('按创建时间倒序列出', async () => {
  const store = createAssetStore(memoryBackend(), noProbe)
  await store.importFile({ type: 'image/png', name: 'a.png', size: 1 })
  await new Promise(r => setTimeout(r, 5))
  await store.importFile({ type: 'audio/mpeg', name: 'b.mp3', size: 1 })
  const list = await store.list()
  assert.equal(list[0].name, 'b.mp3')
})

test('波形按素材缓存：并发只解码一次并写回元数据，非音频或缺失返回 null，删除后失效', async () => {
  const backend = memoryBackend()
  await backend.put('audio-1', { id: 'audio-1', kind: 'audio', name: 'a.wav', duration: 4 }, new Blob(['audio']))
  await backend.put('image-1', { id: 'image-1', kind: 'image', name: 'a.png' }, new Blob(['image']))
  let calls = 0
  const store = createAssetStore(backend, {
    probeImage: async () => ({ width: 1, height: 1 }),
    probeAudio: async () => ({ duration: 4 }),
    decodeWaveform: async () => { calls++; return { peaks: [0, .5, 1], duration: 4 } },
  })
  const [first, second] = await Promise.all([store.waveform('audio-1'), store.waveform('audio-1')])
  assert.equal(calls, 1, '并发请求共用一次解码')
  assert.deepEqual(first.peaks, [0, .5, 1])
  assert.equal(second, first, '同一素材命中同一缓存')
  assert.deepEqual((await backend.get('audio-1')).meta.peaks, [0, .5, 1], '解码结果写回素材元数据')
  assert.equal(await store.waveform('image-1'), null, '图片素材没有波形')
  assert.equal(await store.waveform('missing'), null, '缺失素材返回 null')
  await store.remove('audio-1')
  assert.equal(await store.waveform('audio-1'), null, '删除后缓存失效')
  assert.equal(calls, 1)
})

test('导入时解码失败仍保留素材，首次显示波形时按需补算', async () => {
  let calls = 0
  const store = createAssetStore(memoryBackend(), {
    probeAudio: async () => ({ duration: 2 }),
    decodeWaveform: async () => { calls++; if (calls === 1) throw new Error('解码失败'); return { peaks: [1, 0], duration: 2 } },
  })
  const meta = await store.importFile({ type: 'audio/wav', name: 'a.wav', size: 8 })
  assert.equal(calls, 1)
  assert.equal(meta.peaks, undefined)
  assert.deepEqual((await store.waveform(meta.id)).peaks, [1, 0])
  assert.equal(calls, 2)
})
