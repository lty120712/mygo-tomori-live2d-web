import test from 'node:test'
import assert from 'node:assert/strict'
import { isolateModelDisposal, renderModelNow, stopModelMotion, isolateModelTiming, resetModelPose } from '../src/live2dSceneAdapter.js'
test('删除场景模型仅释放自身，不调用会销毁其他模型的 SDK 全局 release',()=>{
  const calls=[]
  const manager={_models:[{release(){calls.push('model')}}]}
  const modern={_subdelegates:[{getLive2DManager:()=>manager,release(){calls.push('delegate')}}],stop(){calls.push('stop')},releaseEventListener(){calls.push('listeners')},release(){throw new Error('global dispose')}}
  const sdk={_state:{l2d6Model:modern}}
  isolateModelDisposal(sdk)
  modern.release();modern.release()
  assert.deepEqual(calls,['stop','listeners','model','delegate'])
  assert.deepEqual(manager._models,[])
  assert.deepEqual(modern._subdelegates,[])
})

test('暂停编辑主动绘制当前实例，已释放实例不会被更新',()=>{
  let rendered=0
  const modern={_subdelegates:[{update(){rendered++}}],_released:false}
  const sdk={_state:{l2d6Model:modern}}
  renderModelNow(sdk)
  modern._released=true
  renderModelNow(sdk)
  assert.equal(rendered,1)
})

test('结束预览仅停止当前实例的新旧动作管理器',()=>{
  const calls=[]
  const sdk={_state:{l2d2Model:{live2DMgr:{getModel:()=>({mainMotionManager:{stopAllMotions:()=>calls.push('legacy')}})}},l2d6Model:{_subdelegates:[{getLive2DManager:()=>({_models:[{_motionManager:{stopAllMotions:()=>calls.push('modern')}}]})}]}}}
  stopModelMotion(sdk);stopModelMotion({})
  assert.deepEqual(calls,['legacy','modern'])
})

test('实例计时驱动动作与表情，同帧重复绘制不推进且长暂停限制步长',()=>{
  let now=0;const deltas=[]
  const model={_userTimeSeconds:0,_motionManager:{updateMotion:(_,d)=>deltas.push(d)},_updateScheduler:{onLateUpdate:(_,d)=>deltas.push(d)},update(){this._userTimeSeconds+=99;this._motionManager.updateMotion({},0);this._updateScheduler.onLateUpdate({},0)}}
  const sdk={_state:{l2d6Model:{_subdelegates:[{getLive2DManager:()=>({_models:[model]})}]}}}
  isolateModelTiming(sdk,()=>now);isolateModelTiming(sdk,()=>now)
  now=16;model.update();model.update();now=2016;model.update()
  assert.deepEqual(deltas,[.016,.016,0,0,.1,.1]);assert.equal(model._userTimeSeconds,.116)
})

test('重置动作恢复并保存默认姿态，而非仅停止动作',()=>{
  const calls=[],model={getParameterCount:()=>2,getParameterDefaultValue:i=>i===0?0:1,setParameterValueByIndex:(i,value)=>calls.push([i,value]),saveParameters:()=>calls.push('save')}
  const instance={_model:model,_motionManager:{stopAllMotions:()=>calls.push('stop')}}
  resetModelPose({_state:{l2d6Model:{_subdelegates:[{getLive2DManager:()=>({_models:[instance]})}]}}})
  assert.deepEqual(calls,['stop',[0,0],[1,1],'save'])
})
