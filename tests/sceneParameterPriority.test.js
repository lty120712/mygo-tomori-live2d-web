import test from 'node:test'
import assert from 'node:assert/strict'
import {sceneParameterOverrides} from '../src/sceneParameterPriority.js'
import {expressionParameterIds,motionEffectParameterIds} from '../src/live2dSceneAdapter.js'
import {collectMotionInfo} from '../src/motions.js'
const groups=[{params:['ParamMouthOpenY','ParamEyeLOpen','ParamAngleX'].map(key=>({key,min:-30,max:30,default:0}))}]
test('动作与表情只覆盖所控制的身体参数，其他参数和原始关键帧值保留',()=>{
  const body={ParamMouthOpenY:1,ParamEyeLOpen:0,ParamAngleX:20},mouse={ParamAngleX:10}
  assert.deepEqual(sceneParameterOverrides(body,mouse,['ParamMouthOpenY','ParamEyeLOpen'],groups),{ParamAngleX:10})
  assert.deepEqual(sceneParameterOverrides(body,{},[],groups),body)
  assert.equal(body.ParamMouthOpenY,1)
  assert.deepEqual(sceneParameterOverrides(body,{},['PARAM_MOUTH_OPEN_Y'],groups),{ParamEyeLOpen:0,ParamAngleX:20})
})
test('新旧 SDK 表情参数与间接眨眼、口型效果都纳入覆盖范围',()=>{
  const id=name=>({getString:()=>({s:name})})
  const instance={_expressions:new Map([['smile',{getExpressionParameters:()=>[{parameterId:id('ParamMouthOpenY')}]}]]),_eyeBlinkIds:[id('ParamEyeLOpen')],_lipSyncIds:[id('ParamMouthOpenY')]}
  const sdk={_state:{l2d2Model:{live2DMgr:{getModel:()=>({expressions:{smile:{paramList:[{id:'PARAM_EYE_L_OPEN'}]}}})}},l2d6Model:{_subdelegates:[{getLive2DManager:()=>({_models:[instance]})}]}}}
  assert.deepEqual(expressionParameterIds(sdk,'smile'),['PARAM_EYE_L_OPEN','ParamMouthOpenY'])
  assert.deepEqual(expressionParameterIds(sdk,'missing'),[])
  assert.deepEqual(motionEffectParameterIds(sdk,['EyeBlink','LipSync']),['ParamEyeLOpen','ParamMouthOpenY'])
  assert.deepEqual(motionEffectParameterIds(sdk),[])
})
test('采集真实动作格式的参数所有权，包含零值曲线并排除部件透明度',async()=>{
  const original=globalThis.fetch
  globalThis.fetch=async url=>({ok:true,json:async()=>({Meta:{Duration:2},Curves:[{Target:'Parameter',Id:'ParamMouthOpenY',Segments:[0,0,0,2,0]},{Target:'Model',Id:'EyeBlink',Segments:[0,1]},{Target:'PartOpacity',Id:'PartArm',Segments:[0,1]}]}),text:async()=>'$fps=30\nPARAM_EYE_L_OPEN=1,0,1\nPARAM_ANGLE_X=0,1,2'})
  try{
    const info=await collectMotionInfo('/models/',{modern:['test.motion3.json'],legacy:['test.mtn']})
    assert.deepEqual(info.modern.parameterIds,['ParamMouthOpenY']);assert.deepEqual(info.modern.effects,['EyeBlink'])
    assert.deepEqual(info.legacy.parameterIds,['PARAM_EYE_L_OPEN','PARAM_ANGLE_X'])
  }finally{globalThis.fetch=original}
})
