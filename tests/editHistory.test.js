import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditHistory } from '../src/editHistory.js'
import { createProject, createClip, setClipKeyframe, removeClipKeyframe, splitClip } from '../src/sceneProject.js'

function setup(limit) {
  let state={project:createProject(),overrides:{},selectedId:'',frame:0}, clock=0
  const history=createEditHistory({capture:()=>structuredClone(state),restore:s=>{state=structuredClone(s)},now:()=>clock,limit})
  return {history,get state(){return state},advance:()=>clock+=1000}
}
test('无效编辑和播放头移动不产生记录；撤销后新编辑清空重做',()=>{
  const s=setup(),h=s.history
  h.edit(()=>s.state.frame=30);assert.equal(h.canUndo,false)
  h.edit(()=>s.state.project.background='#ffffff');h.undo();assert.equal(h.canRedo,true)
  h.edit(()=>{});assert.equal(h.canRedo,true)
  h.edit(()=>s.state.project.background='#000000');assert.equal(h.canRedo,false)
  h.undo();assert.equal(s.state.project.background,'#00b140')
})
test('一次拖动合并任意多次更新，撤销重做保留选择和播放头',()=>{
  const s=setup(),h=s.history
  h.begin()
  for(let i=1;i<=50;i++)h.edit(()=>{s.state.project.duration=i;s.state.selectedId='clip';s.state.frame=30})
  assert.equal(h.canUndo,true);h.end();h.undo()
  assert.equal(s.state.project.duration,10);assert.equal(h.canUndo,false)
  h.redo();assert.equal(s.state.project.duration,50);assert.equal(s.state.frame,30);assert.equal(s.state.selectedId,'clip')
})
test('同一字段短时间连续调值合并，不同字段或超时独立；历史有容量上限',()=>{
  const s=setup(2),h=s.history
  h.edit(()=>s.state.project.duration=11,'duration');h.edit(()=>s.state.project.duration=12,'duration')
  h.undo();assert.equal(s.state.project.duration,10);h.redo();s.advance()
  h.edit(()=>s.state.project.duration=13,'duration');h.edit(()=>s.state.project.fps=60,'fps')
  h.undo();assert.equal(s.state.project.fps,30);h.undo();assert.equal(s.state.project.duration,12);assert.equal(h.canUndo,false)
})
test('撤销重置恢复该帧关键帧和预览；切割、删除及导入可往返且 ID 不变',()=>{
  const s=setup(),h=s.history,c=createClip({category:'adv',name:'test',entry:'test'},0,5,0)
  s.state.project.clips.push(c);s.state.selectedId=c.id
  setClipKeyframe(c,'mouth',30,.8);setClipKeyframe(c,'body',30,15)
  h.edit(()=>{removeClipKeyframe(c,'mouth',30);c.params.mouth=0;s.state.overrides[c.id]={frame:30,values:{mouth:0}}})
  h.undo();assert.equal(s.state.project.clips[0].keyframes.mouth[0].value,.8);assert.equal(s.state.project.clips[0].keyframes.body[0].value,15)
  h.redo();assert.equal(s.state.overrides[c.id].values.mouth,0)
  h.edit(()=>{const left=s.state.project.clips[0],right=splitClip(structuredClone(left),2);left.duration=2;s.state.project.clips.push(right)})
  const ids=s.state.project.clips.map(c=>c.id);h.undo();assert.equal(s.state.project.clips.length,1);h.redo();assert.deepEqual(s.state.project.clips.map(c=>c.id),ids)
  h.edit(()=>s.state.project.clips.splice(0,1));h.undo();assert.deepEqual(s.state.project.clips.map(c=>c.id),ids)
  h.edit(()=>s.state.project=createProject());h.undo();assert.deepEqual(s.state.project.clips.map(c=>c.id),ids)
})
