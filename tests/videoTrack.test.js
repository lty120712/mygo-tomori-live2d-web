import test from 'node:test'
import assert from 'node:assert/strict'
import { VIDEO_CLIP_LIMIT, appendVisualClips, createImageClip, createVideoClip, isImageClip, isMediaClip, isVideoClip, mediaClipPlacement, mediaDimensions, visualClipLimit, visualPose } from '../src/mediaTracks.js'
import { createProject, createClip, splitClip } from '../src/sceneProject.js'
import { sceneDrawOrder } from '../src/sceneLayers.js'

const model = { category: 'tomori', name: 'test' }
const image = { id: 'pic', name: '图片', kind: 'image', width: 800, height: 200 }
const video = { id: 'vid', name: '视频.mp4', kind: 'video', width: 1280, height: 720, duration: 12 }

test('图片与视频片段靠 media 标记区分，视频沿用图片片段结构', () => {
  const picture = createImageClip(image), clip = createVideoClip(video)
  assert.equal(isImageClip(picture), true)
  assert.equal(isVideoClip(picture), false)
  assert.equal(isImageClip(clip), false, '视频不能再按图片分支渲染')
  assert.equal(isVideoClip(clip), true)
  assert.equal(isMediaClip(clip), true)
  assert.equal(isMediaClip(createClip(model)), false)
  assert.equal(clip.width, 1280)
  assert.equal(clip.media, 'video')
  assert.notEqual(clip.id, picture.id)
})

test('视频片段与图片、模型共享图层排序但存进 imageClips', () => {
  const project = createProject(), m = createClip(model), clip = createVideoClip(video)
  appendVisualClips(project, [m, clip])
  assert.equal(project.clips.length, 1)
  assert.equal(project.imageClips.length, 1)
  assert.equal(project.imageClips[0].media, 'video')
  assert.deepEqual(sceneDrawOrder([m, clip]), [m, clip])
})

test('图片 64、视频 32、模型 16 各自计数', () => {
  const picture = createImageClip(image), clip = createVideoClip(video)
  assert.equal(visualClipLimit([...Array.from({ length: 64 }, () => picture), ...Array.from({ length: 32 }, () => clip)]), '')
  assert.match(visualClipLimit([...Array.from({ length: 33 }, () => clip)]), /32 个视频/)
  assert.match(visualClipLimit([...Array.from({ length: 65 }, () => picture)]), /64 个图片/)
  assert.match(visualClipLimit([...Array.from({ length: 17 }, () => createClip(model))]), /16 个模型/)
  assert.equal(VIDEO_CLIP_LIMIT, 32)
})

test('视频时长与工程时长沿用素材放置规则：超长补足工程，上限 600 秒', () => {
  assert.deepEqual(mediaClipPlacement(12, 0, 10, 30), { duration: 12, projectDuration: 12, truncated: false })
  assert.deepEqual(mediaClipPlacement(3, 0, 10, 30), { duration: 3, projectDuration: 10, truncated: false })
  assert.deepEqual(mediaClipPlacement(4, 8, 10, 30), { duration: 4, projectDuration: 12, truncated: false })
  assert.equal(mediaClipPlacement(900, 0, 10, 30).projectDuration, 600)
  assert.equal(mediaClipPlacement(900, 0, 10, 30).truncated, true)
})

test('视频尺寸按参考画布等比缩放，切割后右半段推进源时间', () => {
  const clip = createVideoClip(video, 0, 10)
  assert.deepEqual(mediaDimensions(clip), { width: 960, height: 540 })
  assert.equal(visualPose(clip, clip.transform).width, 960)
  clip.offset = 1
  const right = splitClip(clip, 4)
  assert.equal(right.offset, 5)
  assert.equal(right.media, 'video')
  assert.equal(right.duration, 6)
  assert.equal(clip.duration, 4)
})
