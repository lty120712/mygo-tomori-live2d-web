import test from 'node:test'
import assert from 'node:assert/strict'
import { recordingFormats } from '../src/recordingFormats.js'

test('MP4 优先且音视频编码、容器一致，WebM 可显式选择', () => {
  const formats = recordingFormats(() => true)
  assert.equal(formats[0].id, 'mp4')
  assert.match(formats[0].mimeType, /mp4.*avc1.*mp4a/)
  assert.equal(formats[1].id, 'webm')
  assert.match(formats[1].mimeType, /webm.*opus/)
})
test('WebM-only 浏览器仍提供真实转码的 MP4，完全不支持录制时禁用', () => {
  const formats=recordingFormats(t => t === 'video/webm')
  assert.deepEqual(formats.map(f => f.id), ['mp4','webm'])
  assert.equal(formats[0].transcode,true)
  assert.equal(formats[0].mimeType,'video/webm')
  assert.deepEqual(recordingFormats(() => false), [])
  assert.equal(recordingFormats(t => t === 'video/mp4')[0].mimeType, 'video/mp4')
})
