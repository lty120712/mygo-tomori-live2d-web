import test from 'node:test'
import assert from 'node:assert/strict'
import { editTimelineClip, timelineTicks } from '../src/timelineEditing.js'

const settings = { duration: 20, fps: 30, targets: [0, 8, 12, 20], tolerance: .2 }
test('移动可用入点或出点吸附，保持片段时长；关闭吸附仍按帧定位', () => {
  const drag = { mode: 'move', start: 2, duration: 3, offset: 0 }
  assert.deepEqual(editTimelineClip(drag, 2.9, settings), { patch: { start: 5 }, snapTime: 8 })
  assert.equal(editTimelineClip(drag, 5.9, settings).patch.start, 8)
  assert.equal(editTimelineClip(drag, 2.9, { ...settings, targets: [] }).patch.start, 4.9)
})
test('裁剪吸附保持源时间连续，禁止负源偏移与短于一帧', () => {
  const drag = { mode: 'left', start: 5, duration: 5, offset: 1 }
  assert.deepEqual(editTimelineClip(drag, 2.9, settings), { patch: { start: 8, duration: 2, offset: 4 }, snapTime: 8 })
  assert.deepEqual(editTimelineClip(drag, -20, settings).patch, { start: 4, duration: 6, offset: 0 })
  assert.ok(editTimelineClip(drag, 20, settings).patch.duration >= 1 / 30 - 1e-9)
  assert.equal(editTimelineClip({ ...drag, mode: 'right' }, 1.9, settings).patch.duration, 7)
})
test('吸附不突破工程范围，选择最近边界；阈值可随缩放变小', () => {
  const drag = { mode: 'move', start: 17, duration: 3, offset: 0 }
  assert.equal(editTimelineClip(drag, 20, settings).patch.start, 17)
  const moving = { ...drag, start: 2 }
  assert.equal(editTimelineClip(moving, 2.9, { ...settings, tolerance: .02 }).snapTime, null)
  assert.equal(editTimelineClip(moving, 5.9, { ...settings, targets: [8, 7.9] }).snapTime, 7.9)
})
test('缩放后标尺增加刻度，短工程和长工程不会重复刻度', () => {
  assert.ok(timelineTicks(15, 1600).length > timelineTicks(15, 400).length)
  for (const duration of [.1, 15, 3600]) {
    const ticks = timelineTicks(duration, 600)
    assert.equal(new Set(ticks).size, ticks.length)
    assert.ok(ticks.every(t => t >= 0 && t < duration))
  }
})
