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