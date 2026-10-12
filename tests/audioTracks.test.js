import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDIO_CLIP_LIMIT, AUDIO_TRACK_LIMIT, audioClipLimit, audioClipTemplate, audioClipsAtTime, audioGainAt, createAudioClip, createAudioClipFromTemplate, planAudioPlayback } from '../src/mediaTracks.js'

const asset = { id: 'song', name: '主题曲.mp3', kind: 'audio', duration: 12 }
const song = (start = 0, duration = 5, track = 0) => createAudioClip(asset, start, duration, track)

test('音频片段字段与默认值，上限 32 个、轨道 0–7', () => {
  const clip = song(1, 4, 2)
  assert.deepEqual({ ...clip, id: undefined }, { id: undefined, assetId: 'song', name: '主题曲.mp3', track: 2, start: 1, duration: 4, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0 })
  assert.equal(AUDIO_CLIP_LIMIT, 32)
  assert.equal(AUDIO_TRACK_LIMIT, 8)
  assert.equal(audioClipLimit(Array.from({ length: 31 }, () => song())), '')
  assert.match(audioClipLimit(Array.from({ length: 32 }, () => song())), /32/)
})

test('按播放头取当前音频片段，起点命中、终点不命中', () => {
  const clips = [song(0, 2, 0), song(2, 3, 1)]
  assert.deepEqual(audioClipsAtTime(clips, 0).map(c => c.track), [0])
  assert.deepEqual(audioClipsAtTime(clips, 1.99).map(c => c.track), [0])
  assert.deepEqual(audioClipsAtTime(clips, 2).map(c => c.track), [1])
  assert.deepEqual(audioClipsAtTime(clips, 5), [])
})

test('音量曲线：中段为 volume，淡入淡出线性过渡，二者取较小值', () => {
  const clip = { ...song(0, 4), volume: .8, fadeIn: 1, fadeOut: 1 }
  assert.equal(audioGainAt(clip, 0), 0)
  assert.equal(audioGainAt(clip, .5), .4)
  assert.equal(audioGainAt(clip, 1), .8)
  assert.equal(audioGainAt(clip, 2), .8)
  assert.equal(audioGainAt(clip, 3.5), .4)
  assert.equal(audioGainAt(clip, 4), 0)
  const short = { ...song(0, 2), volume: .5, fadeIn: 5 }
  // 淡入窗口长于片段时按声明长度线性推进，因此 1 秒处只到 1/5
  assert.equal(audioGainAt(short, 1), .1)
})

test('播放计划从中点起播时前移源偏移、缩短剩余时长并按剩余时间截断淡入淡出', () => {
  const clip = { ...song(2, 6, 1), volume: .7, fadeIn: 4, fadeOut: 2, offset: 1 }
  const plan = planAudioPlayback([clip], 5, 30)
  assert.equal(plan.length, 1)
  const { gain, ...rest } = plan[0]
  assert.deepEqual({ ...rest, id: undefined }, { id: undefined, assetId: 'song', name: '主题曲.mp3', track: 1, offset: 4, duration: 3, volume: .7, fadeIn: 1, fadeOut: 2 })
  assert.ok(Math.abs(gain - .525) < 1e-9)
  assert.deepEqual(planAudioPlayback([clip], 2, 30)[0].offset, 1)
  assert.deepEqual(planAudioPlayback([clip], 8, 30), [])
  // 已经播完淡入窗口时不再安排淡入
  assert.equal(planAudioPlayback([{ ...clip, fadeIn: 1 }], 5, 30)[0].fadeIn, 0)
})

test('播放计划按时间排序，多个轨道同时出声', () => {
  const late = song(3, 2, 3), early = song(0, 5, 1)
  const plan = planAudioPlayback([late, early], 3.5, 30)
  assert.deepEqual(plan.map(p => p.track), [1, 3])
  assert.equal(plan[0].duration, 1.5)
  assert.equal(plan[1].duration, 1.5)
})

test('复制音频片段带走素材与时长，粘贴可换轨道', () => {
  const template = audioClipTemplate({ ...song(3, 2.5, 1), volume: .6, fadeIn: .5 })
  assert.deepEqual(template, { assetId: 'song', name: '主题曲.mp3', duration: 2.5, volume: .6, fadeIn: .5, fadeOut: 0, offset: 0 })
  const pasted = createAudioClipFromTemplate(template, 6, 2, 2)
  assert.deepEqual({ ...pasted, id: undefined }, { id: undefined, assetId: 'song', name: '主题曲.mp3', track: 2, start: 6, duration: 2, offset: 0, volume: .6, fadeIn: .5, fadeOut: 0 })
})
