import test from 'node:test'
import assert from 'node:assert/strict'
import { copyKeyRefs, planKeyPaste } from '../src/keyframeClipboard.js'
import { editKeyRefs } from '../src/timelineKeyframes.js'
import { createEditHistory } from '../src/editHistory.js'

const model = (id, start = 0, offset = 0) => ({ id, start, offset, duration: 10, keyframes: { '@x': [{ frame: 30, value: -205.345, easing: 'easeIn' }, { frame: 60, value: 10, easing: 'easeOut' }] } })
const refs = id => [30, 60].map(frame => ({ clipId: id, key: '@x', frame }))

test('复制快照不随源修改，粘贴按播放头对齐并保留数值、间隔和缓动', () => {
  const source = model('a', 5, 1), target = model('b', 2, .5)
  const clipboard = copyKeyRefs([source], [...refs('a'), refs('a')[0]], 30)
  source.keyframes['@x'][0].value = 999
  const plan = planKeyPaste([source, target], clipboard, 'b', 3, 30)
  assert.equal(plan.error, '')
  assert.deepEqual(plan.entries.map(e => e.frame), [45, 75])
  assert.equal(plan.entries[0].value, -205.345)
  assert.equal(plan.entries[0].easing, 'easeIn')
  editKeyRefs([source, target], [], { type: 'paste', entries: plan.entries }, 30)
  assert.deepEqual(target.keyframes['@x'].map(k => k.frame), [30, 45, 60, 75])
})
test('跨模型多选保留归属和全局间距，变帧率按秒换算', () => {
  const a = model('a', 0), b = model('b', 3)
  const clipboard = copyKeyRefs([a, b], [refs('a')[0], refs('b')[0]], 30)
  const plan = planKeyPaste([a, b], clipboard, 'a', 2, 60)
  assert.deepEqual(plan.entries.map(e => [e.clipId, e.frame]), [['a', 120], ['b', 120]])
  assert.equal(plan.entries[1].frame / 60 + b.start - (plan.entries[0].frame / 60 + a.start), 3)
})
test('越界、缺失模型和参数不兼容整批拒绝；跨版本参数可映射', () => {
  const a = model('a'), b = model('b'), clipboard = copyKeyRefs([a], refs('a'), 30)
  assert.equal(planKeyPaste([a], clipboard, 'a', 9.5, 30).entries.length, 0)
  assert.equal(planKeyPaste([a], clipboard, 'a', -1, 30).entries.length, 0)
  a.keyframes.PARAM_ANGLE_X = [{ frame: 30, value: 15, easing: 'linear' }]
  const body = copyKeyRefs([a], [{ clipId: 'a', key: 'PARAM_ANGLE_X', frame: 30 }], 30)
  assert.equal(planKeyPaste([a, b], body, 'b', 2, 30).entries.length, 0)
  const groups = { b: [{ params: [{ key: 'ParamAngleX', min: -30, max: 30 }] }] }
  assert.equal(planKeyPaste([a, b], body, 'b', 2, 30, groups).entries[0].key, 'ParamAngleX')
  groups.b[0].params[0].max = 10
  assert.equal(planKeyPaste([a, b], body, 'b', 2, 30, groups).entries.length, 0)
  const multi = copyKeyRefs([a, b], [refs('a')[0], refs('b')[0]], 30)
  assert.equal(planKeyPaste([a], multi, 'a', 2, 30).entries.length, 0)
})
test('同属性同帧替换、整批撤销重做恢复原值，复制不产生历史', () => {
  let clips = [model('a')]
  const history = createEditHistory({ capture: () => ({ project: structuredClone(clips) }), restore: state => { clips = structuredClone(state.project) }, changed() {} })
  const clipboard = copyKeyRefs(clips, refs('a'), 30)
  assert.equal(history.canUndo, false)
  const before = structuredClone(clips)
  const plan = planKeyPaste(clips, clipboard, 'a', 2, 30)
  history.edit(() => editKeyRefs(clips, [], { type: 'paste', entries: plan.entries }, 30))
  assert.deepEqual(clips[0].keyframes['@x'].map(k => k.frame), [30, 60, 90])
  assert.equal(clips[0].keyframes['@x'][1].value, -205.345)
  history.undo(); assert.deepEqual(clips, before)
  history.redo(); assert.equal(clips[0].keyframes['@x'][1].easing, 'easeIn')
  assert.equal(planKeyPaste(clips, clipboard, 'a', 10, 30).entries.length, 0)
})
