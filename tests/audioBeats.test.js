import test from 'node:test'
import assert from 'node:assert/strict'
import { clipBeatTimes, collectBeats, detectBeats, snapToBeats } from '../src/audioBeats.js'
import { createAssetStore, memoryBackend } from '../src/assetStore.js'

// 造一段 100 桶、10 秒的峰值：只有给定下标的桶有声音
function peaksWith(entries) {
  const peaks = new Array(100).fill(0)
  for (const [index, value] of Object.entries(entries)) peaks[Number(index)] = value
  return peaks
}

test('节拍只取高于自适应阈值的局部极大值', () => {
  assert.deepEqual(detectBeats(peaksWith({ 20: 1, 60: 0.8 }), 10), [2, 6])
  assert.deepEqual(detectBeats([0, 0, 0, 1, 0, 0], 6), [3])
})

test('安静或过短的素材不给节拍点', () => {
  assert.deepEqual(detectBeats(peaksWith({ 10: 0.11, 40: 0.05 }), 10), [])
  assert.deepEqual(detectBeats(null, 10), [])
  assert.deepEqual(detectBeats([], 10), [])
  assert.deepEqual(detectBeats([1, 0, 1], 0), [])
})

test('间隔过近的峰值合并成一个点，保留更响的那个', () => {
  // minGap 0.3 秒 → 3 个桶；20 与 22 靠得太近，22 更响所以替换掉 20
  assert.deepEqual(detectBeats(peaksWith({ 20: 0.5, 22: 0.9 }), 10, { minGap: 0.3 }), [2.2])
  // 更轻的后一个点直接丢弃
  assert.deepEqual(detectBeats(peaksWith({ 20: 0.9, 21: 0.4 }), 10, { minGap: 0.3 }), [2])
})

test('节拍数量受上限约束', () => {
  const peaks = new Array(100).fill(0)
  for (let i = 1; i < 100; i += 2) peaks[i] = 1
  assert.deepEqual(detectBeats(peaks, 10, { maxBeats: 5 }), [0.1, 0.3, 0.5, 0.7, 0.9])
})

test('片段内的节拍遵守源偏移，并裁到片段首尾', () => {
  assert.deepEqual(clipBeatTimes([0, 1, 2, 3], { start: 0, duration: 2, offset: 0 }), [0, 1, 2])
  assert.deepEqual(clipBeatTimes([0, 1, 2, 3], { start: 0, duration: 2, offset: 1 }), [0, 1, 2])
  assert.deepEqual(clipBeatTimes([0, 1, 2, 3, 4, 5], { start: 5, duration: 4, offset: 1 }), [5, 6, 7, 8, 9])
  assert.deepEqual(clipBeatTimes([2], { start: 5, duration: 2, offset: 10 }), [])
  assert.deepEqual(clipBeatTimes([12], { start: 5, duration: 2, offset: 10 }), [7])
  assert.deepEqual(clipBeatTimes(null, { start: 5, duration: 2, offset: 0 }), [])
  assert.deepEqual(clipBeatTimes([0, 1], null), [])
})

test('播放头定位吸附到容差内最近的节拍', () => {
  assert.deepEqual(snapToBeats(2.03, [1, 2, 2.2], 0.05), { time: 2, snapped: 2 })
  assert.deepEqual(snapToBeats(2.17, [1, 2, 2.2], 0.05), { time: 2.2, snapped: 2.2 })
  assert.deepEqual(snapToBeats(5, [1, 2], 0.5), { time: 5, snapped: null })
  assert.deepEqual(snapToBeats(2, [], 0.5), { time: 2, snapped: null })
  assert.deepEqual(snapToBeats(2, null, 0.5), { time: 2, snapped: null })
})

test('收集节拍目标时按片段区间取值并可截断', () => {
  const clips = [{ assetId: 'a', start: 0, duration: 4, offset: 0 }, { assetId: 'b', start: 5, duration: 2, offset: 0 }, { assetId: 'missing', start: 0, duration: 2, offset: 0 }]
  const beatsByAsset = { a: [0, 2, 3.5], b: [0, 1.5] }
  assert.deepEqual(collectBeats(clips, beatsByAsset), [0, 2, 3.5, 5, 6.5])
  assert.deepEqual(collectBeats(clips, beatsByAsset, { limit: 3 }), [0, 2, 3.5])
  assert.deepEqual(collectBeats(clips, beatsByAsset, { start: 1, end: 5.5 }), [2, 3.5, 5])
  assert.deepEqual(collectBeats(null, beatsByAsset), [])
})

test('素材节拍由缓存波形推导，只算一次并随素材删除失效', async () => {
  let decoded = 0
  const store = createAssetStore(memoryBackend(), {
    probeAudio: async () => ({ duration: 10 }),
    decodeWaveform: async () => { decoded++; return { peaks: peaksWith({ 20: 1, 60: 0.8 }), duration: 10 } },
  })
  const meta = await store.importFile({ name: 'a.wav', type: 'audio/wav', size: 12 })
  assert.deepEqual(await store.beats(meta.id), [2, 6])
  assert.deepEqual(await store.beats(meta.id), [2, 6])
  assert.equal(decoded, 1)
  await store.remove(meta.id)
  assert.equal(await store.beats(meta.id), null)
})

test('没有波形峰值的素材不产出节拍', async () => {
  const store = createAssetStore(memoryBackend(), {
    probeAudio: async () => ({ duration: 5 }),
    decodeWaveform: async () => { throw new Error('无法解码') },
  })
  const meta = await store.importFile({ name: 'broken.mp3', type: 'audio/mpeg', size: 12 })
  assert.equal(await store.beats(meta.id), null)
  assert.equal(await store.beats('不存在'), null)
})
