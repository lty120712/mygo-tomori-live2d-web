import test from 'node:test'
import assert from 'node:assert/strict'
import { visibleClipKeys, groupedClipKeys, moveClipKey, uniqueKeyRefs, editKeyRefs, moveKeyRefs } from '../src/timelineKeyframes.js'
const clip=()=>({start:5,duration:2,offset:1,keyframes:{'@x':[{frame:0,value:1},{frame:30,value:2},{frame:60,value:3},{frame:90,value:4}],ParamMouth:[{frame:30,value:.5},{frame:45,value:1}],'@y':[{frame:30,value:8}]}})

test('相邻多选整体左右移动，保留间隔、数值与缓动且不覆盖邻帧',()=>{
  const c={...clip(),id:'a'}
  c.keyframes['@x']=[{frame:40,value:2,easing:'easeIn'},{frame:41,value:3,easing:'easeOut'},{frame:45,value:4}]
  const refs=[40,41].map(frame=>({clipId:'a',key:'@x',frame}))
  const moved=moveKeyRefs([c],refs,20,30)
  assert.equal(moved.delta,3)
  assert.deepEqual(c.keyframes['@x'].map(k=>k.frame),[43,44,45])
  assert.equal(c.keyframes['@x'][0].easing,'easeIn')
  assert.equal(c.keyframes['@x'][1].value,3)
  assert.equal(moveKeyRefs([c],moved.items,-1,30).delta,-1)
  assert.deepEqual(c.keyframes['@x'].map(k=>k.frame),[42,43,45])
})
test('跨模型及参数移动共享边界限制，碰撞时整组停止，缺失选择不误改',()=>{
  const a={...clip(),id:'a'},b={...clip(),id:'b'}
  const refs=[{clipId:'a',key:'@x',frame:60},{clipId:'b',key:'ParamMouth',frame:45},{clipId:'a',key:'@x',frame:60}]
  const moved=moveKeyRefs([a,b],refs,100,30)
  assert.equal(moved.delta,29)
  assert.equal(a.keyframes['@x'][2].frame,89)
  assert.equal(b.keyframes.ParamMouth[1].frame,74)
  assert.equal(moveKeyRefs([a,b],moved.items,1,30).delta,0)
  const left=moveKeyRefs([a,b],moved.items,-100,30)
  assert.equal(left.delta,-43)
  assert.equal(b.keyframes.ParamMouth[1].frame,31)
  editKeyRefs([a,b],left.items,{type:'move',delta:-1},30)
  assert.equal(b.keyframes.ParamMouth[1].frame,31)
  assert.equal(moveKeyRefs([a,b],[{clipId:'missing',key:'@x',frame:0}],1,30).delta,0)
})
test('裁剪与源偏移后仅显示片段内关键帧，保留正确全局时间',()=>{
  const keys=visibleClipKeys(clip(),30)
  assert.deepEqual(keys.filter(k=>k.key==='@x').map(k=>[k.frame,k.time]),[[30,5],[60,6]])
  assert.equal(keys.length,5)
})

test('多选去重并按所属片段删除，保留其他参数和事件',()=>{
  const a={...clip(),id:'a',events:[{frame:30,type:'motion'}]},b={...clip(),id:'b'}
  const items=[{clipId:'a',key:'@x',frame:30},{clipId:'b',key:'ParamMouth',frame:30},{clipId:'a',key:'@x',frame:30}]
  assert.equal(uniqueKeyRefs(items).length,2)
  editKeyRefs([a,b],items,{type:'delete'},30)
  assert.equal(a.keyframes['@x'].length,3);assert.equal(b.keyframes.ParamMouth.length,1)
  assert.equal(a.keyframes.ParamMouth.length,2);assert.equal(a.events.length,1)
})
test('右键编辑支持批量缓动及精确数值时间；删除全部包含裁剪隐藏帧',()=>{
  const a={...clip(),id:'a'},items=a.keyframes['@x'].map(k=>({clipId:'a',key:'@x',frame:k.frame}))
  editKeyRefs([a],items,{type:'edit',easing:'easeInOut'},30)
  assert.ok(a.keyframes['@x'].every(k=>k.easing==='easeInOut'))
  editKeyRefs([a],[items[2]],{type:'edit',value:12,time:6.5},30)
  assert.equal(a.keyframes['@x'][2].frame,75);assert.equal(a.keyframes['@x'][2].value,12)
  editKeyRefs([a],a.keyframes['@x'].map(k=>({clipId:'a',key:'@x',frame:k.frame})),{type:'delete'},30)
  assert.equal(a.keyframes['@x'],undefined);assert.equal(a.keyframes.ParamMouth.length,2)
})
test('同一帧合并菱形，变换和身体参数独立显示，参数和值不丢失',()=>{
  const transforms=groupedClipKeys(clip(),30,true),params=groupedClipKeys(clip(),30,false)
  assert.equal(transforms[0].keys.length,2)
  assert.equal(params[0].keys[0].value,.5)
  assert.deepEqual(params.map(k=>k.time),[5,5.5])
})
test('拖动关键帧保持值与缓动，不覆盖相邻帧且不越过可见片段',()=>{
  const c=clip();c.keyframes['@x'][2].easing='easeIn'
  assert.equal(moveClipKey(c,'@x',60,95,30),89)
  assert.equal(c.keyframes['@x'][2].value,3)
  assert.equal(c.keyframes['@x'][2].easing,'easeIn')
  assert.equal(moveClipKey(c,'@x',89,0,30),31)
  assert.equal(c.keyframes['@x'][1].frame,30)
  assert.equal(moveClipKey(c,'@x',123,50,30),123)
})
