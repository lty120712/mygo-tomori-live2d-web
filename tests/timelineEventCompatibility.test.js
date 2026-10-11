import test from 'node:test'
import assert from 'node:assert/strict'
import {playTimelineMotion} from '../src/live2dSceneAdapter.js'
import {readProject,createProject,createClip} from '../src/sceneProject.js'
test('旧模型动作入点使用源时间，不从头播放',()=>{
  const entry={_$w0:{getDurationMSec:()=>3000}},manager={motions:[],stopAllMotions(){this.motions=[]}}
  const sdk={_state:{l2d2Model:{live2DMgr:{getModel:()=>({mainMotionManager:manager})}}},playMotion(){manager.motions.push(entry)}}
  playTimelineMotion(sdk,'nod',1,()=>10000);assert.deepEqual([entry._$z2,entry._$bs,entry._$Do],[9000,9000,12000])
})
test('裁剪动作工程往返保留源入点、源时长和播放时长',()=>{
  const models=[{category:'tomori',name:'a'}],p=createProject(),c=createClip(models[0]);c.events=[{type:'motion',name:'nod',frame:30,duration:1,offset:.5,sourceDuration:3}];p.clips.push(c)
  const e=readProject(JSON.parse(JSON.stringify(p)),models).clips[0].events[0]
  assert.deepEqual([e.frame,e.duration,e.offset,e.sourceDuration],[30,1,.5,3]);assert.ok(e.id)
})

test('旧表情时长在恢复时清除，表情始终作为切换事件',()=>{
  const models=[{category:'tomori',name:'a'}],p=createProject(),c=createClip(models[0]);c.events=[{type:'expression',name:'smile',frame:30,duration:1,offset:.5,sourceDuration:2}];p.clips.push(c)
  const e=readProject(JSON.parse(JSON.stringify(p)),models).clips[0].events[0]
  assert.deepEqual([e.duration,e.offset,e.sourceDuration],[0,0,0])
})
