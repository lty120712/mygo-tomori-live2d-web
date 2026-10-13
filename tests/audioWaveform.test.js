import test from 'node:test'
import assert from 'node:assert/strict'
import { audioPeaks, waveformPath } from '../src/audioWaveform.js'
import { createAssetStore, memoryBackend } from '../src/assetStore.js'

test('波形保留各声道峰值、静音与瞬态', () => {
  const channels = [new Float32Array([0, .2, 0, -.8, 0, 0]), new Float32Array([0, -.9, 0, .1, 0, .4])]
  assert.deepEqual(audioPeaks({ length: 6, numberOfChannels: 2, getChannelData: i => channels[i] }, 3), [.9, .8, .4])
})
test('裁剪和切割后的波形遵守源偏移，越过素材末尾显示静音', () => {
  assert.equal(waveformPath([1, 0], 2, 0, 1, 1), 'M50 2V98')
  assert.equal(waveformPath([1, 0], 2, 1, 1, 1), 'M50 50V50')
  assert.equal(waveformPath([1, 0], 2, 2, 1, 1), 'M50 50V50')
  assert.equal(waveformPath(null, 2, 0, 1), '')
})
test('批量导入中失败不阻断其它文件，波形缓存存入素材元数据', async () => {
  const store = createAssetStore(memoryBackend(), {
    probeAudio: async () => ({ duration: 3 }), decodeWaveform: async () => ({ peaks: [0, 1], duration: 3 }),
  })
  const progress = []
  const result = await store.importFiles([{ name: 'a.wav', type: 'audio/wav', size: 12 }, { name: 'wrong.txt', type: 'text/plain', size: 10 }, { name: 'b.wav', type: 'audio/wav', size: 12 }], n => progress.push(n))
  assert.equal(result.imported.length, 2)
  assert.equal(result.failed.length, 1)
  assert.deepEqual(progress, [1, 2, 3])
  assert.deepEqual((await store.waveform(result.imported[0].id)).peaks, [0, 1])
})
