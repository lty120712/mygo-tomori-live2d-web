import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, createClip, clipVisible, localFrame, setClipKeyframe, removeClipKeyframe, sampleClip, splitClip, motionEventsAtTick, readProject } from '../src/sceneProject.js'
import { buildParamGroups } from '../src/params.js'
const models=[{category:'tomori',name:'a',entry:'model3.json'},{category:'anon',name:'b'}]
const groups=buildParamGroups([{id:'ParamMouthOpenY',min:0,max:1,default:0}])

test('图层锁定与隐藏随工程往返，锁定保持可见，隐藏不破坏时间与关键帧',()=>{
  const p=createProject(),clip=createClip(models[0],0,4)
  assert.equal(clip.layerLocked,false);assert.equal(clip.layerHidden,false)
  clip.layerLocked=true;setClipKeyframe(clip,'@x',30,100)
  assert.equal(clipVisible(clip,1),true)
  clip.layerHidden=true;p.clips=[clip]
  const restored=readProject(JSON.parse(JSON.stringify(p)),models).clips[0]
  assert.equal(restored.layerLocked,true);assert.equal(clipVisible(restored,1),false)
  restored.layerHidden=false;assert.equal(clipVisible(restored,1),true)
  assert.equal(sampleClip(restored,1,30,groups).transform.x,100)
  const old={...clip};delete old.layerLocked;delete old.layerHidden
  const legacy=readProject({...p,clips:[old]},models).clips[0]
  assert.equal(legacy.layerLocked,false);assert.equal(legacy.layerHidden,false)
})

test('图层默认模型名称，自定义名称随工程和分割保存，兼容旧工程',()=>{
  const p=createProject(),clip=createClip(models[0],0,4)
  assert.equal(clip.layerName,models[0].name)
  clip.layerName='对话主角';clip.name='片段一'
  const right=splitClip(clip,2)
  assert.equal(right.layerName,'对话主角')
  p.clips=[clip,right]
  const restored=readProject(JSON.parse(JSON.stringify(p)),models)
  assert.deepEqual(restored.clips.map(c=>c.layerName),['对话主角','对话主角'])
  delete clip.layerName;delete right.layerName
  assert.deepEqual(readProject(p,models).clips.map(c=>c.layerName),['a','a'])
})

test('背景默认绿幕，图片随工程往返，旧工程兼容且拒绝临时地址',()=>{
  const original=createProject()
  assert.equal(original.background,'#00b140')
  original.backgroundImage='data:image/webp;base64,UklGRg=='
  original.backgroundImageName='背景.webp'
  const loaded=readProject(JSON.parse(JSON.stringify(original)),models)
  assert.equal(loaded.backgroundImage,original.backgroundImage)
  assert.equal(loaded.backgroundImageName,original.backgroundImageName)
  const old=readProject({version:3,clips:[]},models)
  assert.equal(old.backgroundImage,'');assert.equal(old.background,'#00b140')
  assert.throws(()=>readProject({...original,backgroundImage:'blob:expired'},models),/背景图片/)
  assert.throws(()=>readProject({...original,backgroundImage:'data:image/svg+xml;base64,AAA='},models),/背景图片/)
})

test('片段入场跳过几帧仍触发起点动作；继续播放不重复，过期动作不重播',()=>{
  const clip=createClip(models[0],3,5)
  clip.events=[{type:'motion',name:'wave',frame:0,duration:2}]
  assert.equal(motionEventsAtTick(clip,-1,3,true,30).length,1)
  assert.equal(motionEventsAtTick(clip,3,4,false,30).length,0)
  assert.equal(motionEventsAtTick(clip,-1,90,true,30).length,0)
})

test('同素材片段独立，显示区间左闭右开，模型按区间入场离场',()=>{
  const a=createClip(models[0],0,5,0),b=createClip(models[0],3,5,1)
  assert.notEqual(a.id,b.id)
  a.params.ParamMouthOpenY=1
  assert.equal(b.params.ParamMouthOpenY,undefined)
  assert.equal(clipVisible(a,0),true)
  assert.equal(clipVisible(b,0),false)
  assert.equal(clipVisible(a,4),true)
  assert.equal(clipVisible(b,4),true)
  assert.equal(clipVisible(a,5),false)
  assert.equal(clipVisible(b,8),false)
})
test('片段移动携带关键帧；参数和画面变换统一按本地时间插值',()=>{
  const clip=createClip(models[0],2,4)
  setClipKeyframe(clip,'ParamMouthOpenY',0,0)
  setClipKeyframe(clip,'ParamMouthOpenY',60,1)
  setClipKeyframe(clip,'@x',0,-100)
  setClipKeyframe(clip,'@x',60,100)
  const state=sampleClip(clip,3,30,groups)
  assert.equal(state.params.ParamMouthOpenY,.5)
  assert.equal(state.transform.x,0)
  clip.start=5
  assert.equal(sampleClip(clip,6,30,groups).params.ParamMouthOpenY,.5)
  assert.equal(localFrame(clip,6,30),30)
})
test('切割保留源时间，分割点前后动画连续，修改副本不影响原片段',()=>{
  const clip=createClip(models[0],1,4)
  setClipKeyframe(clip,'ParamMouthOpenY',0,0)
  setClipKeyframe(clip,'ParamMouthOpenY',120,1)
  const original=sampleClip(clip,3,30,groups).params.ParamMouthOpenY
  const right=splitClip(clip,3)
  assert.equal(clip.duration,2)
  assert.equal(right.start,3)
  assert.equal(right.duration,2)
  assert.equal(right.offset,2)
  assert.equal(clipVisible(clip,3),false)
  assert.equal(sampleClip(right,3,30,groups).params.ParamMouthOpenY,original)
  right.keyframes.ParamMouthOpenY[0].value=1
  assert.equal(clip.keyframes.ParamMouthOpenY[0].value,0)
  assert.equal(splitClip(clip,1),null)
})
test('单项重置移除当前帧，不删除其他参数和其他帧',()=>{
  const clip=createClip(models[0])
  setClipKeyframe(clip,'ParamMouthOpenY',0,0)
  setClipKeyframe(clip,'ParamMouthOpenY',30,1)
  setClipKeyframe(clip,'@x',30,20)
  removeClipKeyframe(clip,'ParamMouthOpenY',30)
  assert.equal(clip.keyframes.ParamMouthOpenY.length,1)
  assert.equal(clip.keyframes['@x'].length,1)
  removeClipKeyframe(clip,'ParamMouthOpenY',0)
  assert.equal(clip.keyframes.ParamMouthOpenY,undefined)
})
test('v2 工程往返保留片段、源偏移、关键帧、表情和动作',()=>{
  const p=createProject(),clip=createClip(models[0],2,5,1)
  clip.offset=1;clip.transform.x=100
  setClipKeyframe(clip,'@opacity',30,.5)
  clip.events.push({type:'expression',name:'smile',frame:30,duration:0})
  p.clips.push(clip)
  const restored=readProject(JSON.parse(JSON.stringify(p)),models)
  const {id,...data}=restored.clips[0],{id:oldId,...expected}=clip
  assert.ok(data.events[0].id)
  data.events=data.events.map(({id,offset,sourceDuration,...event})=>event)
  assert.deepEqual(data,expected)
  assert.notEqual(id,oldId)
})
test('移除单模型工程迁移，缺失素材或未知格式明确报错',()=>{
  assert.throws(()=>readProject({version:2,model:'anon/b',keyframes:{}},models),/版本/)
  assert.throws(()=>readProject({version:3,clips:[{model:'missing/model'}]},models),/不存在/)
  assert.throws(()=>readProject({},models),/版本/)
})
