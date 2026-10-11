import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneMouseParams } from '../src/sceneMouseTracking.js'
import { buildParamGroups } from '../src/params.js'
import { createClip, createProject, readProject } from '../src/sceneProject.js'
const models=[{category:'tomori',name:'a'}]
const groups=buildParamGroups([{id:'ParamAngleX',min:-30,max:30,default:0},{id:'PARAM_ANGLE_Y',min:-10,max:10,default:0},{id:'ParamEyeBallX',min:-1,max:1,default:0}])
const pose={x:0,y:0,scale:1,rotation:0}
test('每个模型独立跟随，默认开启，关闭与关键帧优先且不修改工程',()=>{
  const a=createClip(models[0]),b=createClip(models[0]);b.mouseTrack=false
  const before=JSON.stringify(a)
  assert.deepEqual(sceneMouseParams(a,{x:160,y:-255},pose,groups),{ParamAngleX:15,PARAM_ANGLE_Y:10,ParamEyeBallX:1})
  assert.deepEqual(sceneMouseParams(b,{x:160,y:-255},pose,groups),{ParamAngleX:0,PARAM_ANGLE_Y:0,ParamEyeBallX:0})
  assert.equal(JSON.stringify(a),before)
  a.keyframes.ParamAngleX=[{frame:0,value:3}]
  assert.equal(sceneMouseParams(a,{x:160,y:0},pose,groups).ParamAngleX,undefined)
  assert.deepEqual(sceneMouseParams(a,null,pose,groups),{PARAM_ANGLE_Y:0,ParamEyeBallX:0})
})
test('鼠标按模型位置、旋转、缩放换算；开关随工程往返且旧工程默认开启',()=>{
  const a=createClip(models[0]),project=createProject();project.clips=[a]
  assert.equal(sceneMouseParams(a,{x:480,y:0},{...pose,x:320},groups).ParamAngleX,15)
  assert.equal(sceneMouseParams(a,{x:160,y:0},{...pose,scale:2},groups).ParamAngleX,7.5)
  assert.ok(Math.abs(sceneMouseParams(a,{x:0,y:160},{...pose,rotation:90},groups).ParamAngleX-15)<1e-8)
  a.mouseTrack=false;assert.equal(readProject(project,models).clips[0].mouseTrack,false)
  delete a.mouseTrack;assert.equal(readProject(project,models).clips[0].mouseTrack,true)
})
