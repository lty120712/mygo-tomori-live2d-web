import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, readProject, SCENE_VERSION } from '../src/sceneProject.js'
import { createColorBackgroundClip, createImageBackgroundClip } from '../src/mediaTracks.js'
import { createAudioClip } from '../src/mediaTracks.js'

const models = [{ category: 'tomori', name: 'chika', entry: 'model.json' }]

test('v4 工程包含图片/背景/音频数组', () => {
  const p = createProject()
  assert.equal(SCENE_VERSION, 4)
  assert.equal(p.version, 4)
  assert.deepEqual(p.imageClips, [])
  assert.deepEqual(p.backgroundClips, [])
  assert.deepEqual(p.audioClips, [])
  assert.deepEqual(p.assets, {})
})

test('v3 旧工程读取后补齐新字段', () => {
  const legacy = {
    version: 3, aspectRatio: '16:9', fps: 30, duration: 10, background: '#00b140',
    clips: [{ model: 'tomori/chika', name: 'chika', track: 0, start: 0, duration: 5 }],
  }
  const p = readProject(legacy, models)
  assert.equal(p.version, 4)
  assert.equal(p.clips.length, 1)
  assert.deepEqual(p.imageClips, [])
  assert.deepEqual(p.backgroundClips, [])
  assert.deepEqual(p.audioClips, [])
  assert.deepEqual(p.assets, {})
})

test('v4 读取图片、背景与音频引用，打包素材的解析留待后续阶段', () => {
  const p = readProject({ version: 4, clips: [], imageClips: [{ assetId: 'x' }], backgroundClips: [{ kind: 'color', color: '#123456', start: 1, duration: 4 }], audioClips: [{ assetId: 'z', name: '配乐.mp3', start: 2, duration: 5, track: 1, volume: .5 }], assets: { a: 1 } }, models)
  assert.equal(p.imageClips[0].assetId, 'x')
  assert.equal(p.backgroundClips[0].color, '#123456')
  assert.equal(p.backgroundClips[0].start, 1)
  assert.equal(p.backgroundClips[0].duration, 4)
  assert.equal(p.audioClips[0].assetId, 'z')
  assert.equal(p.audioClips[0].track, 1)
  assert.equal(p.audioClips[0].volume, .5)
  assert.deepEqual(p.assets, {})
})

test('v4 背景片段往返保留类型、颜色、素材引用与时间', () => {
  const color = createColorBackgroundClip('#80304a', 1, 3), image = createImageBackgroundClip({ id: 'asset-1', name: '天空.png' }, 4, 4)
  const project = { ...createProject(), backgroundClips: [color, image] }
  const parsed = readProject(JSON.parse(JSON.stringify(project)), [])
  assert.equal(parsed.backgroundClips.length, 2)
  assert.deepEqual({ ...parsed.backgroundClips[0], id: color.id }, color)
  assert.deepEqual({ ...parsed.backgroundClips[1], id: image.id }, image)
})

test('v4 校验背景片段：类型、素材引用、上限与越界时间', () => {
  assert.throws(() => readProject({ ...createProject(), backgroundClips: {} }, []), /背景片段列表无效/)
  assert.throws(() => readProject({ ...createProject(), backgroundClips: [{ kind: 'video' }] }, []), /背景片段类型无效/)
  assert.throws(() => readProject({ ...createProject(), backgroundClips: [{ kind: 'image' }] }, []), /背景片段缺少素材引用/)
  assert.throws(() => readProject({ ...createProject(), backgroundClips: Array.from({ length: 65 }, () => ({ kind: 'color', color: '#000000' })) }, []), /64/)
  const parsed = readProject({ ...createProject(), duration: 10, backgroundClips: [{ kind: 'color', color: 'red', start: 7, duration: 99 }] }, [])
  assert.equal(parsed.backgroundClips[0].color, '#00b140')
  assert.equal(parsed.backgroundClips[0].start, 7)
  assert.equal(parsed.backgroundClips[0].duration, 3)
  assert.equal(parsed.backgroundClips[0].fit, 'fill')
})

test('v3 旧工程没有背景片段，legacy 背景字段保留为兜底', () => {
  const legacy = { version: 3, aspectRatio: '16:9', fps: 30, duration: 10, background: '#123456', backgroundImage: 'data:image/png;base64,AA', backgroundImageName: '旧背景.png', clips: [] }
  const parsed = readProject(legacy, [])
  assert.deepEqual(parsed.backgroundClips, [])
  assert.equal(parsed.background, '#123456')
  assert.equal(parsed.backgroundImage, 'data:image/png;base64,AA')
  assert.equal(parsed.backgroundImageName, '旧背景.png')
})

test('未知版本仍拒绝', () => {
  assert.throws(() => readProject({ version: 9, clips: [] }, models), /版本/)
})

test('v4 音频片段往返保留素材引用、轨道、时间、音量与淡入淡出', () => {
  const clip = createAudioClip({ id: 'song', name: '主题曲.mp3' }, 1, 4, 2)
  clip.offset = .5; clip.volume = .6; clip.fadeIn = .4; clip.fadeOut = .3
  clip.filter = 'bandpass'
  clip.volumeKeyframes = [{ time: 1.5, value: .3, easing: 'easeOut' }, { time: .5, value: .9, easing: 'linear' }]
  const parsed = readProject({ ...createProject(), audioClips: [clip] }, [])
  assert.deepEqual({ ...parsed.audioClips[0], id: clip.id }, { ...clip, volumeKeyframes: [{ time: .5, value: .9, easing: 'linear' }, { time: 1.5, value: .3, easing: 'easeOut' }] })
})

test('v4 校验音频片段：列表、素材引用、上限与数值范围', () => {
  assert.throws(() => readProject({ ...createProject(), audioClips: {} }, []), /音频片段列表无效/)
  assert.throws(() => readProject({ ...createProject(), audioClips: [{ track: 0 }] }, []), /音频片段缺少素材引用/)
  assert.throws(() => readProject({ ...createProject(), audioClips: Array.from({ length: 33 }, () => ({ assetId: 'song' })) }, []), /32/)
  const parsed = readProject({
    ...createProject(), duration: 10,
    audioClips: [{ assetId: 'song', name: '  ', track: 99, start: 7, duration: 99, offset: -3, volume: 5, fadeIn: 99, fadeOut: -1 }],
  }, [])
  const clip = parsed.audioClips[0]
  assert.equal(clip.track, 7)
  assert.equal(clip.name, '音频')
  assert.equal(clip.start, 7)
  assert.equal(clip.duration, 3)
  assert.equal(clip.offset, 0)
  assert.equal(clip.volume, 1)
  assert.equal(clip.fadeIn, 3)
  assert.equal(clip.filter, 'none')
  assert.deepEqual(clip.volumeKeyframes, [])
  assert.equal(clip.fadeOut, 0)
})

test('v3 旧工程没有音频片段', () => {
  const parsed = readProject({ version: 3, aspectRatio: '16:9', fps: 30, duration: 10, clips: [] }, [])
  assert.deepEqual(parsed.audioClips, [])
})

test('v4 音频滤镜与音量关键帧：未知滤镜回退、关键帧过滤越界与非法值', () => {
  const parsed = readProject({
    ...createProject(), duration: 10,
    audioClips: [{
      assetId: 'song', start: 0, duration: 6, filter: 'echo',
      volumeKeyframes: [{ time: 4, value: 2 }, { time: '-1', value: .5 }, { time: 1, value: -.4 }, { time: 1, value: .7, easing: 'custom' }, 'x'],
    }],
  }, [])
  const clip = parsed.audioClips[0]
  assert.equal(clip.filter, 'none')
  assert.deepEqual(clip.volumeKeyframes, [{ time: 1, value: .7, easing: 'linear' }, { time: 4, value: 1, easing: 'linear' }])
})

test('v4 读写轨道开关：视觉独见、背景隐藏与独见、音频轨道静音与独奏', () => {
  const project = createProject()
  project.clips.push({ model: 'tomori/chika', name: 'chika', track: 0, start: 0, duration: 5, layerSolo: true, layerHidden: true })
  project.imageClips.push({ assetId: 'x', layerSolo: true })
  project.backgroundClips.push({ kind: 'color', color: '#123456', start: 0, duration: 4, layerHidden: true, layerSolo: true })
  project.audioClips.push({ assetId: 'song', name: '配乐', start: 0, duration: 4, track: 1 })
  project.audioTrackState = { 1: { muted: true, solo: true }, 3: { muted: false, solo: false }, 9: { muted: true } }
  const parsed = readProject(JSON.parse(JSON.stringify(project)), models)
  assert.equal(parsed.clips[0].layerSolo, true)
  assert.equal(parsed.clips[0].layerHidden, true)
  assert.equal(parsed.imageClips[0].layerSolo, true)
  assert.equal(parsed.backgroundClips[0].layerHidden, true)
  assert.equal(parsed.backgroundClips[0].layerSolo, true)
  // 轨道号超出范围的状态被丢弃
  assert.deepEqual(parsed.audioTrackState, { 1: { muted: true, solo: true }, 3: { muted: false, solo: false } })
  assert.throws(() => readProject({ ...createProject(), audioTrackState: [] }, []), /音频轨道状态无效/)
})
