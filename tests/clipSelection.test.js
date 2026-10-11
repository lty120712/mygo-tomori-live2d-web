import test from 'node:test'
import assert from 'node:assert/strict'
import {copyClips,planClipMove,applyClipStarts,planClipPaste,planClipSplit} from '../src/clipSelection.js'
import {createEditHistory} from '../src/editHistory.js'
const clips=()=>[{id:'a',track:0,start:1,duration:2,offset:.5,name:'A',layerName:'人物A',keyframes:{'@x':[{frame:30,value:4,easing:'easeIn'}]},events:[{id:'e',frame:30,name:'wave',duration:1,type:'motion'}]},{id:'b',track:1,start:3,duration:2,offset:0,name:'B',keyframes:{},events:[]},{id:'c',track:0,start:5,duration:1,layerLocked:true}]
test('批量切割仅处理播放头经过的片段，保留源时间和动画，失败不修改原片段',()=>{
 const c=clips();c[1].start=1.5
 const original=structuredClone(c),plan=planClipSplit(c,['a','b'],2)
 assert.deepEqual(plan.left.map(c=>c.duration),[1,.5]);assert.deepEqual(plan.right.map(c=>c.start),[2,2])
 assert.deepEqual(plan.right.map(c=>c.offset),[1.5,.5]);assert.deepEqual(plan.right[0].keyframes,c[0].keyframes)
 assert.deepEqual(c,original);assert.notEqual(plan.right[0].id,c[0].id)
 assert.equal(planClipSplit(c,['a','b'],3.2).right.length,1)
 assert.ok(planClipSplit(c,['a','c'],2).error)
 assert.ok(planClipSplit(c,['a','b'],0).error)
 const full=[...c,...Array.from({length:12},(_,i)=>({id:'extra'+i,track:i+2,start:0,duration:1}))]
 assert.ok(planClipSplit(full,['a','b'],2).error)
})
test('跨轨道整体移动保持间隔，锁定邻片段阻挡且整组不越界',()=>{
 const c=clips(),original=structuredClone(c.slice(0,2))
 let plan=planClipMove(c,original,10,{duration:12,fps:30})
 assert.equal(plan.delta,2);assert.deepEqual(plan.entries.map(e=>e.start),[3,5])
 assert.equal(applyClipStarts(c,plan.entries,12,30),true)
 assert.equal(c[1].start-c[0].start,2);assert.equal(c[0].offset,.5)
 plan=planClipMove(c,original,-10,{duration:12,fps:30});assert.equal(plan.delta,-1)
})
test('以任意选中片段边缘吸附播放头，同组两片段不改变相对位置',()=>{
 const c=clips(),plan=planClipMove(c,c.slice(0,2),.97,{duration:12,fps:30,targets:[4],tolerance:.1})
 assert.equal(plan.delta,1);assert.equal(plan.snapTime,4);assert.deepEqual(plan.entries.map(e=>e.start),[2,4])
 const long=[{id:'a',track:0,start:0,duration:6},{id:'b',track:1,start:0,duration:14.8}]
 assert.equal(planClipMove(long,long,2,{duration:15,fps:30,targets:[0,15],tolerance:.5}).delta,.2)
})
test('批量移动原子验证，锁定、碰撞、越界拒绝且原数据不变',()=>{
 const c=clips(),initial=structuredClone(c)
 for(const entries of [[{id:'a',start:4},{id:'b',start:4}],[{id:'a',start:-1}],[{id:'a',start:2},{id:'c',start:6}]]){assert.equal(applyClipStarts(c,entries,12,30),false);assert.deepEqual(c,initial)}
})
test('复制跳过锁定模型，快照独立；粘贴保留源偏移动画及相对图层并换算帧率',()=>{
 const c=clips(),clipboard=copyClips(c,['a','b','c'],30)
 assert.equal(clipboard.clips.length,2);c[0].keyframes['@x'][0].value=99
 const plan=planClipPaste(c,clipboard,6,12,60)
 assert.deepEqual(plan.clips.map(c=>c.start),[6,8]);assert.deepEqual(plan.clips.map(c=>c.track),[0,1])
 assert.equal(plan.clips[0].offset,.5);assert.equal(plan.clips[0].keyframes['@x'][0].value,4)
 assert.equal(plan.clips[0].keyframes['@x'][0].frame,60);assert.equal(plan.clips[0].events[0].frame,60)
 assert.notEqual(plan.clips[0].id,'a');assert.notEqual(plan.clips[0].events[0].id,'e')
 assert.ok(planClipPaste(c,clipboard,10,12,30).error)
 assert.ok(planClipPaste(Array.from({length:15},(_,track)=>({track})),clipboard,0,12,30).error)
 clipboard.fps=60;clipboard.clips[0].keyframes['@x']=[{frame:1,value:1},{frame:2,value:2}]
 const low=planClipPaste(c,clipboard,0,12,24).clips[0].keyframes['@x']
 assert.deepEqual(low,[{frame:0,value:1},{frame:1,value:2}])
 clipboard.clips[0].keyframes['@x']=[{frame:2,value:1},{frame:3,value:2}]
 assert.deepEqual(planClipPaste(c,clipboard,0,12,24).clips[0].keyframes['@x'],[{frame:1,value:2}])
})
test('整组连续拖动合并为一步历史，撤销重做同时恢复所有片段',()=>{
 let c=clips();const h=createEditHistory({capture:()=>({project:structuredClone(c)}),restore:s=>{c=s.project}})
 const original=structuredClone(c.slice(0,2));h.begin()
 for(const delta of [.5,1])h.edit(()=>applyClipStarts(c,planClipMove(c,original,delta,{duration:12,fps:30}).entries,12,30))
 h.end();h.undo();assert.deepEqual(c.map(c=>c.start),[1,3,5]);h.redo();assert.deepEqual(c.map(c=>c.start),[2,4,5])
})
