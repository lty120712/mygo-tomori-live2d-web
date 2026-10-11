import test from 'node:test'
import assert from 'node:assert/strict'
import { changeProjectFps, stepFrameTime } from '../src/sceneFrameRate.js'
import { createProject, createClip, sampleClip } from '../src/sceneProject.js'
import { useRecorder } from '../src/composables/useRecorder.js'

test('24/30/60 FPS 切换保持镜头秒数、姿态、事件和缓动', () => {
  const project = createProject(), clip = createClip({ category: 'tomori', name: 'a' }, 1, 5)
  project.clips = [clip]
  clip.offset = .5
  clip.keyframes['@x'] = [{ frame: 30, value: -200, easing: 'easeIn' }, { frame: 90, value: 100, easing: 'linear' }]
  clip.events = [{ type: 'motion', frame: 60, duration: 2 }, { type: 'expression', frame: 90 }]
  let frame = 75
  const pose = sampleClip(clip, 2.5, 30).transform.x
  for (const fps of [24, 60, 30]) {
    frame = changeProjectFps(project, frame, fps)
    assert.equal(frame / fps, 2.5)
    assert.deepEqual(clip.keyframes['@x'].map(k => k.frame), [fps, fps * 3])
    assert.equal(clip.keyframes['@x'][0].easing, 'easeIn')
    assert.deepEqual(clip.events.map(e => e.frame), [fps * 2, fps * 3])
    assert.equal(clip.events[0].duration, 2)
    assert.equal(sampleClip(clip, 2.5, fps).transform.x, pose)
    assert.deepEqual([clip.start, clip.duration, clip.offset, project.duration], [1, 5, .5, 10])
  }
})
test('降帧率合并同帧保留后一个值，事件按最近帧对齐', () => {
  const project = createProject(), clip = createClip({ category: 'a', name: 'b' })
  project.fps = 60; project.clips = [clip]
  clip.keyframes['@x'] = [{ frame: 1, value: 1, easing: 'linear' }, { frame: 2, value: 2, easing: 'easeOut' }]
  clip.events = [{ frame: 7 }]
  changeProjectFps(project, 7, 24)
  assert.deepEqual(clip.keyframes['@x'], [{ frame: 0, value: 1, easing: 'linear' }, { frame: 1, value: 2, easing: 'easeOut' }])
  assert.equal(clip.events[0].frame, 3)
  clip.keyframes['@x'] = [{ frame: 1, value: 1, easing: 'linear' }, { frame: 2, value: 2, easing: 'easeOut' }]
  project.fps = 60
  changeProjectFps(project, 7, 30)
  assert.deepEqual(clip.keyframes['@x'], [{ frame: 1, value: 2, easing: 'easeOut' }])
})
test('逐帧移动按工程 FPS，连续步进无浮点累计漂移且不越界', () => {
  for (const fps of [24, 30, 60]) {
    let time = 0
    for (let i = 0; i < fps; i++) time = stepFrameTime(time, fps, 1, 2)
    assert.equal(time, 1)
    assert.equal(stepFrameTime(time, fps, -1, 2), (fps - 1) / fps)
    assert.equal(stepFrameTime(0, fps, -1, 2), 0)
    assert.equal(stepFrameTime(2, fps, 1, 2), 2)
  }
})
test('录制真实传入所选捕获 FPS；旧版调用默认 30 FPS', t => {
  const captured = []
  class Canvas {
    getContext() { return { fillRect() {}, drawImage() {} } }
    captureStream(fps) { captured.push(fps); return {} }
  }
  class Recorder {
    static isTypeSupported() { return true }
    state = 'inactive'
    start() { this.state = 'recording' }
    stop() { this.state = 'inactive' }
  }
  for (const [key, value] of Object.entries({ HTMLCanvasElement: Canvas, MediaRecorder: Recorder, document: { createElement: () => new Canvas() }, requestAnimationFrame: () => 1, cancelAnimationFrame: () => {} })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key])
  }
  for (const fps of [24, 30, 60, undefined]) {
    const recorder = useRecorder()
    assert.equal(recorder.start({ width: 960, height: 540 }, null, 'canvas', null, null, fps), true)
    recorder.destroy()
  }
  assert.deepEqual(captured, [24, 30, 60, 30])
})
