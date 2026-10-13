import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDIO_CLIP_LIMIT, AUDIO_TRACK_LIMIT, audibleAudioClips, audioClipLimit, audioClipPlacement, audioClipTemplate, audioClipsAtTime, audioGainAt, createAudioClip, createAudioClipFromTemplate, planAudioPlayback, splitAudioClip } from '../src/mediaTracks.js'

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
  assert.deepEqual({ ...rest, id: undefined }, { id: undefined, assetId: 'song', name: '主题曲.mp3', track: 1, offset: 4, duration: 3, delay: 0, volume: .7, fadeIn: 1, fadeOut: 2 })
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

test('切割音频片段：右半段前移源偏移，淡入留前半、淡出留后半，边界外拒绝', () => {
  const clip = { ...createAudioClip(asset, 2, 10, 1), offset: 1, volume: .6, fadeIn: 3, fadeOut: 2 }
  const right = splitAudioClip(clip, 7)
  assert.equal(clip.start, 2); assert.equal(clip.duration, 5)
  assert.equal(clip.offset, 1); assert.equal(clip.fadeIn, 3); assert.equal(clip.fadeOut, 0)
  assert.equal(right.start, 7); assert.equal(right.duration, 5)
  assert.equal(right.offset, 6); assert.equal(right.volume, .6)
  assert.equal(right.fadeIn, 0); assert.equal(right.fadeOut, 2)
  assert.notEqual(right.id, clip.id)
  assert.equal(splitAudioClip(createAudioClip(asset, 2, 5, 0), 2), null)
  assert.equal(splitAudioClip(createAudioClip(asset, 2, 5, 0), 7), null)
  // 切割点落在淡出窗口里时，右半段只保留剩余部分
  const late = { ...createAudioClip(asset, 0, 10, 0), fadeOut: 4 }
  const lateRight = splitAudioClip(late, 7)
  assert.equal(lateRight.duration, 3)
  assert.equal(lateRight.fadeOut, 3)
})

test('音频片段长度按素材决定，超出工程时把工程时长补足到片段结尾', () => {
  assert.deepEqual(audioClipPlacement(3, 0, 10, 30), { duration: 3, projectDuration: 10, truncated: false })
  assert.deepEqual(audioClipPlacement(188.3, 0, 10, 30), { duration: 188.3, projectDuration: 188.3, truncated: false })
  assert.deepEqual(audioClipPlacement(5, 9, 10, 30), { duration: 5, projectDuration: 14, truncated: false })
  const capped = audioClipPlacement(900, 0, 10, 30)
  assert.equal(capped.projectDuration, 600)
  assert.equal(capped.duration, 600)
  assert.equal(capped.truncated, true)
  assert.equal(audioClipPlacement(0, 0, 10, 30).duration, 1 / 30)
  assert.equal(audioClipPlacement(undefined, 2, 4, 30).projectDuration, 4)
})

test('静音与独奏按轨道生效：默认全部参与，有轨道独奏时只播独奏轨道', () => {
  const a = song(0, 5, 0), b = song(0, 5, 1), c = song(0, 5, 2)
  assert.deepEqual(audibleAudioClips([a, b, c]).map(x => x.track), [0, 1, 2])
  assert.deepEqual(audibleAudioClips([a, b, c], { 0: { muted: true } }).map(x => x.track), [1, 2])
  assert.deepEqual(audibleAudioClips([a, b, c], { 1: { solo: true } }).map(x => x.track), [1])
  assert.deepEqual(audibleAudioClips([a, b, c], { 1: { solo: true }, 2: { solo: true } }).map(x => x.track), [1, 2])
  assert.deepEqual(audibleAudioClips([a, b, c], { 1: { solo: true }, 0: { muted: true } }).map(x => x.track), [1])
  assert.deepEqual(audibleAudioClips([], { 0: { muted: true } }), [])
  // 播放计划用同一套轨道状态
  assert.deepEqual(planAudioPlayback([a, b, c], 1, { trackState: { 0: { muted: true } } }).map(p => p.track), [1, 2])
  assert.deepEqual(planAudioPlayback([a, b, c], 1, { trackState: { 2: { solo: true } } }).map(p => p.track), [2])
})
