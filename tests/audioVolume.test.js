import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDIO_VOLUME_KEY_LIMIT, audioGainAt, fadeGainAt, nearestVolumeKeyframe, normalizeVolumeKeyframes, removeVolumeKeyframe, setVolumeKeyframe, sourceAtTimeline, splitVolumeKeyframes, timelineAtSource, visibleVolumeKeys, volumeAutomationPoints, volumeEnvelopeAt } from '../src/audioVolume.js'
import { AUDIO_FILTER_PRESETS, audioFilterLabel, audioFilterSpec, normalizeAudioFilter } from '../src/audioFilters.js'
import { createAudioClip } from '../src/mediaTracks.js'

const asset = { id: 'song', name: '主题曲.mp3', kind: 'audio', duration: 30 }
const clip = (patch = {}) => ({ ...createAudioClip(asset, 0, 10, 0), ...patch })
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, message ?? (actual + ' 应等于 ' + expected))

test('音量关键帧归一化：排序、同刻去重取后者、越界丢弃、数值夹到 0–1', () => {
  const keys = normalizeVolumeKeyframes([
    { time: 3, value: 1.4 },
    { time: 1, value: -.5, easing: 'easeIn' },
    { time: 3, value: .25, easing: 'nonsense' },
    { time: -2, value: .5 },
    { time: 'x', value: .5 },
    { time: 2 },
    null,
  ])
  assert.deepEqual(keys, [
    { time: 1, value: 0, easing: 'easeIn' },
    { time: 3, value: .25, easing: 'linear' },
  ])
  assert.deepEqual(normalizeVolumeKeyframes(null), [])
  assert.equal(normalizeVolumeKeyframes(Array.from({ length: 80 }, (_, index) => ({ time: index, value: .5 }))).length, AUDIO_VOLUME_KEY_LIMIT)
})

test('素材内时间与时间线时间互相换算，带源偏移', () => {
  const source = clip({ start: 4, offset: 2 })
  assert.equal(sourceAtTimeline(source, 4), 2)
  assert.equal(sourceAtTimeline(source, 8), 6)
  assert.equal(timelineAtSource(source, 2), 4)
  assert.equal(timelineAtSource(source, 6), 8)
})

test('包络取值：没有关键帧恒为 1，首尾之外保持不变，中间按左侧缓动插值', () => {
  assert.equal(volumeEnvelopeAt([], 5), 1)
  assert.equal(volumeEnvelopeAt(null, 5), 1)
  const keys = [{ time: 2, value: .4, easing: 'linear' }, { time: 6, value: 1, easing: 'linear' }]
  assert.equal(volumeEnvelopeAt(keys, 0), .4)
  assert.equal(volumeEnvelopeAt(keys, 2), .4)
  assert.equal(volumeEnvelopeAt(keys, 4), .7)
  assert.equal(volumeEnvelopeAt(keys, 6), 1)
  assert.equal(volumeEnvelopeAt(keys, 99), 1)
  assert.equal(volumeEnvelopeAt([{ time: 3, value: .6 }], 9), .6)
  // 缓动只影响区间内的形状：easeIn 让前半段更慢
  const eased = [{ time: 0, value: 0, easing: 'easeIn' }, { time: 2, value: 1, easing: 'linear' }]
  assert.equal(volumeEnvelopeAt(eased, 1), .125)
})

test('音量曲线 = 总音量 × 淡入淡出 × 关键帧包络；没有关键帧时与旧行为一致', () => {
  const plain = clip({ volume: .8, fadeIn: 1, fadeOut: 1 })
  assert.equal(fadeGainAt(plain, .5), .4)
  assert.equal(audioGainAt(plain, .5), .4)
  assert.equal(audioGainAt(plain, 2), .8)
  const keyed = clip({ volume: .8, volumeKeyframes: [{ time: 0, value: 1 }, { time: 4, value: .5 }] })
  assert.equal(audioGainAt(keyed, 0), .8)
  close(audioGainAt(keyed, 2), .6)
  close(audioGainAt(keyed, 4), .4)
  // 包络与淡入相乘：0 秒处淡入为 0，所以整条曲线也是 0
  const both = clip({ volume: 1, fadeIn: 2, volumeKeyframes: [{ time: 0, value: 1 }, { time: 4, value: 1 }] })
  assert.equal(audioGainAt(both, 0), 0)
  assert.equal(audioGainAt(both, 1), .5)
  assert.equal(audioGainAt(both, 3), 1)
})

test('可见关键帧按裁剪窗口过滤，附带时间线时间', () => {
  const trimmed = clip({ start: 3, offset: 4, duration: 5, volumeKeyframes: [{ time: 4, value: 1 }, { time: 6, value: .5 }, { time: 9, value: .2 }, { time: 20, value: .9 }] })
  assert.deepEqual(visibleVolumeKeys(trimmed), [
    { source: 4, time: 3, value: 1, easing: 'linear' },
    { source: 6, time: 5, value: .5, easing: 'linear' },
    { source: 9, time: 8, value: .2, easing: 'linear' },
  ])
  assert.deepEqual(visibleVolumeKeys(clip()), [])
})

test('新增、覆盖、删除与查找关键帧都在素材内时间上操作', () => {
  let keys = setVolumeKeyframe([], 3, .6)
  assert.deepEqual(keys, [{ time: 3, value: .6, easing: 'linear' }])
  keys = setVolumeKeyframe(keys, 3, .9, 'easeOut')
  assert.deepEqual(keys, [{ time: 3, value: .9, easing: 'easeOut' }])
  keys = setVolumeKeyframe(keys, 1, .2)
  assert.deepEqual(keys.map(key => key.time), [1, 3])
  assert.deepEqual(nearestVolumeKeyframe(keys, 1.00001).time, 1)
  assert.equal(nearestVolumeKeyframe(keys, 2.5), null)
  assert.deepEqual(removeVolumeKeyframe(keys, 1).map(key => key.time), [3])
  assert.deepEqual(removeVolumeKeyframe(keys, 2).map(key => key.time), [1, 3])
})

test('调度折线点：关键帧给折点，缓动区间补插值点，起播之前的点不重复排', () => {
  const holdup = clip({ volumeKeyframes: [{ time: 2, value: .2 }, { time: 6, value: 1 }] })
  assert.deepEqual(volumeAutomationPoints(holdup, 0), [{ time: 2, value: .2 }, { time: 6, value: 1 }])
  assert.deepEqual(volumeAutomationPoints(holdup, 3), [{ time: 6, value: 1 }])
  assert.deepEqual(volumeAutomationPoints(clip(), 0), [])
  const eased = clip({ duration: 10, volumeKeyframes: [{ time: 0, value: 0, easing: 'easeIn' }, { time: 2, value: 1 }] })
  const points = volumeAutomationPoints(eased, 0)
  assert.equal(points.length, 6)
  assert.ok(Math.abs(points[2].time - 1) < 1e-9)
  assert.equal(points[2].value, .125)
  assert.equal(points.at(-1).value, 1)
})

test('切割关键帧：没有关键帧时两边都为空，越界切点也能拆出两侧', () => {
  assert.deepEqual(splitVolumeKeyframes([], 5), { left: [], right: [] })
  const { left, right } = splitVolumeKeyframes([{ time: 4, value: 1 }], 2)
  assert.deepEqual(left, [{ time: 2, value: 1, easing: 'linear' }])
  assert.deepEqual(right, [{ time: 2, value: 1, easing: 'linear' }, { time: 4, value: 1, easing: 'linear' }])
})

test('滤镜预设：未知值回退成无滤镜，预设参数是副本可安全修改', () => {
  assert.equal(normalizeAudioFilter('lowpass'), 'lowpass')
  assert.equal(normalizeAudioFilter('echo'), 'none')
  assert.equal(normalizeAudioFilter(undefined), 'none')
  assert.equal(audioFilterLabel('bandpass'), '带通 · 电话')
  assert.equal(audioFilterSpec('none').type, 'none')
  const spec = audioFilterSpec('highpass')
  spec.frequency = 1
  assert.equal(audioFilterSpec('highpass').frequency, 300)
  assert.equal(AUDIO_FILTER_PRESETS.every(preset => typeof preset.label === 'string' && typeof preset.value === 'string'), true)
})
