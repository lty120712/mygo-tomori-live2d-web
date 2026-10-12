import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKGROUND_CLIP_LIMIT, backgroundClipLimit, backgroundAtTime, backgroundGaps, createColorBackgroundClip, createImageBackgroundClip, planBackgroundAdd, migrateLegacyBackground, paintBackground } from '../src/mediaTracks.js'
import { planClipMove, applyClipStarts } from '../src/clipSelection.js'
import { createProject } from '../src/sceneProject.js'

const asset = { id: 'bg-image', name: '天空.png', kind: 'image' }

test('背景片段保存类型、素材引用与全屏铺满标记，不占视觉图层', () => {
  const color = createColorBackgroundClip('#123456', 2, 4), image = createImageBackgroundClip(asset, 0, 10)
  assert.deepEqual({ ...color, id: undefined }, { id: undefined, kind: 'color', color: '#123456', assetId: '', name: '纯色背景', start: 2, duration: 4, fit: 'fill' })
  assert.deepEqual({ ...image, id: undefined }, { id: undefined, kind: 'image', color: '', assetId: 'bg-image', name: '天空.png', start: 0, duration: 10, fit: 'fill' })
  assert.equal(color.track, undefined)
  assert.notEqual(color.id, image.id)
  assert.equal(createColorBackgroundClip('red').color, '#00b140')
})

test('背景上限 64 个', () => {
  assert.equal(BACKGROUND_CLIP_LIMIT, 64)
  assert.equal(backgroundClipLimit(Array.from({ length: 63 }, () => createColorBackgroundClip('#000000'))), '')
  assert.match(backgroundClipLimit(Array.from({ length: 64 }, () => createColorBackgroundClip('#000000'))), /64/)
})

test('按播放头解析背景：片段覆盖优先，其次 legacy 图片，最后纯色', () => {
  const clips = [{ id: 'a', kind: 'color', color: '#111111', start: 0, duration: 2 }, { id: 'b', kind: 'image', assetId: 'bg-image', name: '天空.png', start: 2, duration: 3 }]
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140', image: 'data:image/png;base64,AA' }, 0), { kind: 'color', color: '#111111' })
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140', image: 'data:image/png;base64,AA' }, 1.99), { kind: 'color', color: '#111111' })
  assert.deepEqual(backgroundAtTime(clips, {}, 2), { kind: 'image', assetId: 'bg-image', name: '天空.png' })
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140', image: 'data:image/png;base64,AA' }, 5), { kind: 'legacy-image', image: 'data:image/png;base64,AA' })
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140' }, 5), { kind: 'color', color: '#00b140' })
  assert.deepEqual(backgroundAtTime([], { color: '#00b140' }, 3), { kind: 'color', color: '#00b140' })
})

test('添加背景片段限制越界并拒绝重叠', () => {
  const existing = createColorBackgroundClip('#111111', 4, 3)
  const free = planBackgroundAdd([existing], createColorBackgroundClip('#222222', 3, 1), { duration: 10, fps: 30 })
  assert.equal(free.error, undefined)
  assert.equal(free.clip.start, 3)
  assert.equal(free.clip.duration, 1)
  assert.match(planBackgroundAdd([existing], createColorBackgroundClip('#222222', 5, 6), { duration: 10, fps: 30 }).error, /重叠|越界/)
  const clamped = planBackgroundAdd([], createColorBackgroundClip('#222222', 99, 99), { duration: 10, fps: 30 })
  assert.equal(clamped.error, undefined)
  assert.ok(Math.abs(clamped.clip.start - (10 - 1 / 30)) < 1e-9)
  assert.ok(Math.abs(clamped.clip.duration - 1 / 30) < 1e-9)
  assert.match(planBackgroundAdd(Array.from({ length: 64 }, () => createColorBackgroundClip('#000000')), createColorBackgroundClip('#000000'), { duration: 10, fps: 30 }).error, /64/)
})

test('背景片段共用一条轨道，移动受 0 与工程时长限制', () => {
  const clips = [createColorBackgroundClip('#111111', 0, 2), createColorBackgroundClip('#222222', 3, 2)]
  const plan = planClipMove(clips, [clips[1]], 5, { duration: 10, fps: 30 })
  assert.equal(plan.entries[0].start, 8)
  assert.equal(applyClipStarts(clips, plan.entries, 10, 30), true)
  assert.equal(clips[1].start, 8)
  assert.equal(applyClipStarts(clips, [{ id: clips[1].id, start: 1 }], 10, 30), false)
  assert.equal(clips[1].start, 8)
})

test('legacy 背景图迁入素材库后生成全长片段并清空旧字段', () => {
  const project = createProject()
  project.backgroundImage = 'data:image/png;base64,AA'
  project.backgroundImageName = '旧背景.png'
  project.duration = 12
  const clips = migrateLegacyBackground(project, { id: 'migrated', name: '旧背景.png' })
  assert.equal(project.backgroundImage, '')
  assert.equal(project.backgroundImageName, '')
  assert.equal(project.backgroundClips.length, 1)
  assert.equal(clips.length, 1)
  assert.equal(clips[0].assetId, 'migrated')
  assert.equal(clips[0].duration, 12)
  assert.equal(clips[0].start, 0)
})

test('背景空档计算与迁移只填空档，不与已有或同一步新增片段重叠', () => {
  const clips = [{ start: 1, duration: 2 }, { start: 5, duration: 2 }]
  assert.deepEqual(backgroundGaps(clips, 10, 30), [{ start: 0, duration: 1 }, { start: 3, duration: 2 }, { start: 7, duration: 3 }])
  assert.deepEqual(backgroundGaps([], 10, 30), [{ start: 0, duration: 10 }])
  const project = createProject()
  project.backgroundImage = 'data:image/png;base64,AA'
  project.duration = 10
  const added = createColorBackgroundClip('#00ffff', 6, 4)
  const migrated = migrateLegacyBackground(project, { id: 'migrated', name: '旧背景.png' }, added)
  assert.equal(migrated.length, 1)
  assert.deepEqual({ start: migrated[0].start, duration: migrated[0].duration }, { start: 0, duration: 6 })
  project.backgroundClips.push(added)
  assert.equal(project.backgroundClips.filter(c => c.start < 6 && c.start + c.duration > 6).length, 0)
  assert.equal(project.backgroundImage, '')
})

test('背景绘制：纯色填充、图片拉伸、素材缺失回退纯色', () => {
  const calls = []
  const ctx = { set fillStyle(value) { calls.push(['fillStyle', value]) }, fillRect: (...args) => calls.push(['fillRect', ...args]), drawImage: (...args) => calls.push(['drawImage', ...args]) }
  const size = { width: 960, height: 540 }
  assert.equal(paintBackground(ctx, { kind: 'color', color: '#00b140' }, { ...size, fallback: '#000000' }), 'color')
  assert.deepEqual(calls, [['fillStyle', '#00b140'], ['fillRect', 0, 0, 960, 540]])
  calls.length = 0
  const bitmap = { width: 10, height: 10 }
  assert.equal(paintBackground(ctx, { kind: 'image', assetId: 'bg-image' }, { ...size, bitmap, fallback: '#000000' }), 'image')
  assert.deepEqual(calls, [['drawImage', bitmap, 0, 0, 960, 540]])
  calls.length = 0
  assert.equal(paintBackground(ctx, { kind: 'image', assetId: 'bg-image' }, { ...size, fallback: '#00b140' }), 'fallback')
  assert.deepEqual(calls, [['fillStyle', '#00b140'], ['fillRect', 0, 0, 960, 540]])
  calls.length = 0
  const legacy = { width: 4, height: 4 }
  assert.equal(paintBackground(ctx, { kind: 'legacy-image', image: 'data:image/png;base64,AA' }, { ...size, legacyImage: legacy, fallback: '#00b140' }), 'legacy-image')
  assert.deepEqual(calls, [['drawImage', legacy, 0, 0, 960, 540]])
})
