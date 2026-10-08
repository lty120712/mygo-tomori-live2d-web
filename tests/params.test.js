import test from 'node:test'
import assert from 'node:assert/strict'
import { buildParamGroups, initParamValues, normalizeParamValues, resolveParamId } from '../src/params.js'
import { useKeyframeAnimation } from '../src/composables/useKeyframeAnimation.js'

const modern = buildParamGroups([
  { id: 'ParamMouthOpenY', min: 0, max: 1, default: 0 },
  { id: 'ParamEyeLOpen', min: 0, max: 1, default: 1 },
  { id: 'ParamAngleX', min: -30, max: 30, default: 0 },
  { id: 'ParamArmL12', min: -5, max: 5, default: 2 },
  { id: 'CustomVisibility', min: 0, max: 1, default: 1 },
])

test('Cubism 2 的 ParamID 对象可生成旧模型参数面板', () => {
  const groups = buildParamGroups([{ id: { toString: () => 'PARAM_MOUTH_OPEN_Y' }, min: 0, max: 2, default: 0 }])
  assert.equal(groups[0].params[0].key, 'PARAM_MOUTH_OPEN_Y')
  assert.equal(groups[0].params[0].max, 2)
  assert.equal(resolveParamId('ParamMouthOpenY', groups), 'PARAM_MOUTH_OPEN_Y')
})

test('动态面板使用真实范围与默认值，常用中文参数和高级参数均可访问', () => {
  const mouth = modern.find(g => g.key === 'mouth').params[0]
  assert.equal(mouth.key, 'ParamMouthOpenY')
  assert.equal(mouth.label, '张嘴')
  assert.equal(mouth.common, true)
  const arm = modern.find(g => g.key === 'arms').params[0]
  assert.equal(arm.common, false)
  assert.equal(arm.min, -5)
  assert.equal(initParamValues(modern).ParamArmL12, 2)
  assert.equal(initParamValues(modern).CustomVisibility, 1)
})

test('参数兼容仅转换实际存在的别名，真实 ID 优先，越界值被限制', () => {
  assert.equal(resolveParamId('PARAM_EYE_L_OPEN', modern), 'ParamEyeLOpen')
  assert.equal(resolveParamId('PARAM_HAIR_FRONT', modern), null)
  assert.deepEqual(normalizeParamValues({ PARAM_EYE_L_OPEN: 2, ParamEyeLOpen: 0.5, ParamArmL12: -99, unknown: 1 }, modern), {
    ParamEyeLOpen: 0.5, ParamArmL12: -5,
  })
  assert.deepEqual(normalizeParamValues({ ParamEyeLOpen: NaN, ParamMouthOpenY: null }, modern), {})
})

test('缺失、固定范围、重复参数不会生成无效滑条', () => {
  const groups = buildParamGroups([
    { id: 'fixed', min: 1, max: 1, default: 1 },
    { id: 'invalid', min: NaN, max: 1 },
    { id: 'ParamEyeLOpen', min: 0, max: 2, default: 1 },
    { id: 'ParamEyeLOpen', min: 0, max: 1, default: 0 },
  ])
  assert.equal(groups.flatMap(g => g.params).length, 1)
  assert.equal(groups[0].params[0].max, 2)
})

test('旧工程迁移到新模型，保留缓动和未对应轨道，可切回旧模型', () => {
  const kf = useKeyframeAnimation()
  kf.fromJSON({ keyframes: {
    PARAM_MOUTH_OPEN_Y: [{ frame: 0, value: 0, easing: 'easeIn' }, { frame: 90, value: 1 }],
    PARAM_HAIR_FRONT: [{ frame: 0, value: 0.5 }],
  } })
  kf.remapParameters(modern)
  assert.equal(kf.getValueAtFrame('ParamMouthOpenY', 45), 0.125)
  assert.equal(kf.getValueAtFrame('PARAM_HAIR_FRONT', 0), 0.5)
  const old = buildParamGroups([{ id: 'PARAM_MOUTH_OPEN_Y', min: 0, max: 1, default: 0 }])
  kf.remapParameters(old)
  assert.equal(kf.getValueAtFrame('PARAM_MOUTH_OPEN_Y', 45), 0.125)
  assert.equal(kf.keyframes.ParamMouthOpenY, undefined)
})

test('工程含新旧两种命名时，合并轨道且同帧保留真实 ID 的值', () => {
  const kf = useKeyframeAnimation()
  kf.setKeyframe('PARAM_MOUTH_OPEN_Y', 0, 0.2)
  kf.setKeyframe('PARAM_MOUTH_OPEN_Y', 90, 1)
  kf.setKeyframe('ParamMouthOpenY', 0, 0.8)
  kf.remapParameters(modern)
  assert.deepEqual(kf.getKeyframesForParam('ParamMouthOpenY').map(k => [k.frame, k.value]), [[0, 0.8], [90, 1]])
})
