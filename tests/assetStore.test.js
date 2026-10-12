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
