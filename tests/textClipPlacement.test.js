import test from 'node:test'
import assert from 'node:assert/strict'
import {textPlacement,planTextAdd,planTextTransfer,applyTextTransfer} from '../src/textClipPlacement.js'
import {createEditHistory} from '../src/editHistory.js'
import {createProject,readProject} from '../src/sceneProject.js'
import {createTextClip} from '../src/mediaTracks.js'

const text=(id,track,start,duration=2)=>({id,media:'text',track,start,duration,text:'原文字',offset:1,textStyle:{fontSize:48},keyframes:{'@opacity':[{frame:30,value:.4}]},layerName:'文字层'+track})
const options={duration:20,fps:30}
test('选中文字轨时忽略播放头，在整条轨道最后追加并延长工程',()=>{
  const clips=[text('a',0,0),text('b',0,8),text('c',1,0)]
  const plan=planTextAdd(clips,0,{selectedTrack:0,duration:10,fps:30})
  assert.equal(plan.track,0);assert.equal(plan.start,10);assert.equal(plan.duration,5);assert.equal(plan.projectDuration,15)
  assert.equal(plan.layer.layerName,'文字层0')
  const other=planTextAdd(clips,4,{selectedTrack:1,duration:20,fps:30})
  assert.equal(other.track,1);assert.equal(other.start,2)
})
test('选中锁定文字轨拒绝追加，600秒末尾截断或提示而不另建一行',()=>{
  const clips=[{...text('a',0,0),layerLocked:true}]
  assert.ok(planTextAdd(clips,0,{selectedTrack:0,duration:10}).error)
  clips[0].layerLocked=false;clips[0].start=597
  const plan=planTextAdd(clips,0,{selectedTrack:0,duration:600})
  assert.equal(plan.start,599);assert.equal(plan.duration,1)
  clips[0].duration=3
  assert.ok(planTextAdd(clips,0,{selectedTrack:0,duration:600}).error)
})
test('未选文字轨时保留播放头放置规则，不把文字追加到模型轨',()=>{
  const clips=[text('a',0,0),{id:'m',model:'m',track:1,start:0,duration:10}]
  const plan=planTextAdd(clips,4,{selectedTrack:1,duration:10})
  assert.equal(plan.start,4);assert.equal(plan.track,0)
  const occupied=planTextAdd(clips,1,{duration:10})
  assert.equal(occupied.track,undefined);assert.equal(occupied.start,1)
})
test('添加文字复用空档，优先选中轨道，遇到下一片段缩短时长',()=>{
  const clips=[text('a',0,0),text('b',0,6),text('c',1,0)]
  assert.equal(textPlacement(clips,3,5).track,0)
  assert.equal(textPlacement(clips,3,5).duration,3)
  assert.equal(textPlacement(clips,3,5,{preferredTrack:1}).track,1)
  assert.equal(textPlacement(clips,1,5),null)
  clips[0].layerLocked=true
  assert.equal(textPlacement(clips,3,5).track,1)
  clips.push({id:'image',track:1,start:10,duration:2})
  assert.equal(textPlacement(clips,3,5),null)
})
test('跨轨仅移动指定文字并继承目标图层状态，完整保留内容与动画',()=>{
  const clips=[text('a',0,0),text('b',0,5),{id:'image',track:1,start:8,duration:2,layerHidden:true,layerSolo:true,layerName:'目标'}]
  const original=structuredClone(clips[0])
  assert.ok(!applyTextTransfer(clips,{id:'a',start:1,track:1},options).error)
  assert.deepEqual(clips[0],{...original,start:1,track:1,layerName:'目标',layerHidden:true,layerSolo:true,layerLocked:undefined})
  assert.equal(clips[1].track,0)
})
test('碰撞与锁定拒绝，失败完全不修改工程',()=>{
  const clips=[text('a',0,0),text('b',1,2)]
  const before=structuredClone(clips)
  assert.ok(applyTextTransfer(clips,{id:'a',start:3,track:1},options).error)
  assert.deepEqual(clips,before)
  clips[1].layerLocked=true
  assert.ok(applyTextTransfer(clips,{id:'a',start:8,track:1},options).error)
  assert.ok(planTextTransfer(clips,'a',{start:1,track:99},options).error)
})
test('边缘新建层允许时段重叠，空源轨压紧且保持上下顺序',()=>{
  for(const insert of ['before','after']){
    const clips=[text('a',0,0),text('b',1,0),text('c',2,0)]
    assert.ok(!applyTextTransfer(clips,{id:'a',start:0,track:1,insert},options).error)
    assert.deepEqual(clips.map(c=>c.track),insert==='before' ? [0,1,2] : [1,0,2])
  }
  const clips=[text('a',0,0),text('b',1,4)]
  applyTextTransfer(clips,{id:'a',start:0,track:1},options)
  assert.deepEqual(clips.map(c=>c.track),[0,0])
})
test('吸附可使用尾端，关闭吸附保持帧量化，预览不修改数据',()=>{
  const clips=[text('a',0,0)]
  const original=structuredClone(clips)
  assert.equal(planTextTransfer(clips,'a',{start:2.94,track:0},{...options,targets:[5],tolerance:.1}).start,3)
  assert.equal(planTextTransfer(clips,'a',{start:2.94,track:0},options).start,88/30)
  assert.deepEqual(clips,original)
})
test('多次预览后松开提交一次，单步撤销恢复轨道与起点',()=>{
  let clips=[text('a',0,0),text('b',1,0)]
  const before=structuredClone(clips)
  const history=createEditHistory({capture:()=>({project:structuredClone(clips)}),restore:s=>{clips=s.project}})
  history.begin()
  for(let start=1;start<5;start++)planTextTransfer(clips,'a',{start,track:1,insert:'after'},options)
  history.end()
  assert.equal(history.canUndo,false)
  history.edit(()=>applyTextTransfer(clips,{id:'a',start:4,track:1,insert:'after'},options))
  history.undo()
  assert.deepEqual(clips,before)
  assert.equal(history.canUndo,false)
  history.redo()
  assert.equal(clips[0].start,4)
  assert.equal(clips[0].track,1)
})
test('多个文字共轨保存读回后保持时间位置与内容',()=>{
  const project=createProject();project.duration=12
  project.imageClips=[createTextClip(0,2,0),createTextClip(5,2,0),createTextClip(0,3,1)]
  project.imageClips[1].text='第二句'
  const restored=readProject(JSON.parse(JSON.stringify(project)),[])
  assert.deepEqual(restored.imageClips.map(c=>[c.track,c.start,c.duration,c.text]),project.imageClips.map(c=>[c.track,c.start,c.duration,c.text]))
})
