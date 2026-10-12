import test from 'node:test'
import assert from 'node:assert/strict'
import {sampleTimelinePose,sourceMotionTime} from '../src/timelinePose.js'
import {buildParamGroups} from '../src/params.js'
import {collectMotionInfo} from '../src/motions.js'
const groups=buildParamGroups([{id:'ParamAngleX',min:-30,max:30,default:0},{id:'ParamMouthOpenY',min:0,max:1,default:0}])
const id=s=>({getString:()=>s})
function fixture(){
 const calls=[]
 const model={getParameterCount:()=>2,getParameterId:i=>id(['ParamAngleX','ParamMouthOpenY'][i]),getParameterDefaultValue:()=>0}
 const motion={getLoopDuration:()=>4,updateParameters(target,entry,t){calls.push(t);target.setParameterValueByIndex(0,t*5);target.setParameterValueById(id('ParamMouthOpenY'),.2)}}
 const expression={getFadeInTime:()=>0,doUpdateParameters(target,t,w){target.addParameterValueById(id('ParamMouthOpenY'),.5,w)}}
 const instance={_model:model,_motions:new Map([['nod_0',motion]]),_expressions:new Map([['smile',expression]])}
 return {calls,sdk:{_state:{l2d6Model:{_subdelegates:[{getLive2DManager:()=>({_models:[instance]})}]}}}}
}
test('源时间结合片段源偏移、事件起点及裁剪入点，24/30/60 FPS 对应同一姿态',()=>{
 for(const fps of [24,30,60])assert.equal(sourceMotionTime({frame:fps,offset:.5},fps*2,fps),1.5)
})
test('现代 SDK 曲线离屏采样可正向、反向及重复定位，表情叠加后不改变真实模型参数',()=>{
 const {sdk,calls}=fixture(),event={name:'nod',frame:30,offset:.5}
 const sample=frame=>sampleTimelinePose(sdk,{},event,'smile',1,frame,30,groups)
 assert.deepEqual(sample(60),{ParamAngleX:7.5,ParamMouthOpenY:.7})
 assert.equal(sample(90).ParamAngleX,12.5)
 assert.deepEqual(sample(60),sample(60))
 assert.deepEqual(calls,[1.5,2.5,1.5,1.5])
})
test('无动作时不输出旧动作参数，独立表情可继续叠加，身体基础值保持独立',()=>{
 const {sdk}=fixture()
 assert.deepEqual(sampleTimelinePose(sdk,{},null,'',0,0,30,groups,{ParamAngleX:10}),{})
 assert.deepEqual(sampleTimelinePose(sdk,{},null,'smile',1,0,30,groups,{ParamMouthOpenY:.2}),{ParamMouthOpenY:.7})
})
test('旧模型 MTN 精确插值支持非整数源帧及淡入淡出，重复定位无累积漂移',()=>{
 const info={nod:{samples:[{fps:2,curves:{PARAM_ANGLE_X:[0,10,20,0]},duration:2,fadeIn:0,fadeOut:0}]}},event={name:'nod',frame:0,offset:.25}
 const sample=frame=>sampleTimelinePose({},info,event,'',0,frame,30,groups)
 assert.equal(sample(0).ParamAngleX,5)
 assert.equal(sample(15).ParamAngleX,15)
 assert.equal(sample(0).ParamAngleX,5)
 info.nod.samples[0].fadeIn=1
 assert.ok(Math.abs(sample(0).ParamAngleX-5*(1-Math.cos(Math.PI*.25))/2)<1e-10)
})
test('旧模型素材采集保留源曲线、采样率与淡入淡出，用于实际源时间定位',async()=>{
 const fetchBefore=globalThis.fetch
 globalThis.fetch=async()=>({ok:true,text:async()=>'$fps=2\n$fadein=500\n$fadeout=250\nPARAM_ANGLE_X=0,10,20,0'})
 try{const info=await collectMotionInfo('/model/',{nod:['nod.mtn']});assert.equal(info.nod.samples[0].fps,2);assert.equal(info.nod.samples[0].fadeIn,.5);assert.equal(info.nod.samples[0].fadeOut,.25);assert.equal(info.nod.samples[0].duration,2)}finally{globalThis.fetch=fetchBefore}
})
