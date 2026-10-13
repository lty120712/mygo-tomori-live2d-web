import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSET_LIMITS, kindOfFile, sizeOk } from '../src/assetStore.js'

const fakeFile = (type, name, size) => ({ type, name, size })

test('按 MIME 与扩展名识别图片与音频素材', () => {
  assert.equal(kindOfFile(fakeFile('image/png', 'a.png', 1)), 'image')
  assert.equal(kindOfFile(fakeFile('audio/mpeg', 'a.mp3', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('', 'B.JPG', 1)), 'image')
  assert.equal(kindOfFile(fakeFile('', 'c.opus', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('video/mp4', 'd.mp4', 1)), null)
})

test('大小上限：图片 64MB、音频 512MB', () => {
  assert.equal(ASSET_LIMITS.image, 64 * 1024 * 1024)
  assert.equal(ASSET_LIMITS.audio, 512 * 1024 * 1024)
  assert.equal(sizeOk(fakeFile('image/png', 'a.png', 64 * 1024 * 1024), 'image'), true)
  assert.equal(sizeOk(fakeFile('image/png', 'a.png', 64 * 1024 * 1024 + 1), 'image'), false)
  assert.equal(sizeOk(fakeFile('audio/mpeg', 'a.mp3', 512 * 1024 * 1024), 'audio'), true)
  assert.equal(sizeOk(fakeFile('audio/mpeg', 'a.mp3', 512 * 1024 * 1024 + 1), 'audio'), false)
})

import { createAssetStore, memoryBackend } from '../src/assetStore.js'

const noProbe = {
  probeImage: async () => ({ width: 0, height: 0, thumb: '' }),
  probeAudio: async () => ({ duration: 0 }),
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
  await assert.rejects(() => store.importFile({ type: 'video/mp4', name: 'v.mp4', size: 10 }), /不支持/)
  await assert.rejects(() => store.importFile({ type: 'image/png', name: 'a.png', size: 65 * 1024 * 1024 }), /64MB/)
  await assert.rejects(() => store.importFile({ type: 'audio/mpeg', name: 'a.mp3', size: 512 * 1024 * 1024 + 1 }), /512MB/)
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
