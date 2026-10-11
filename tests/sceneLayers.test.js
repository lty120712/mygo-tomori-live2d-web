import test from 'node:test'
import assert from 'node:assert/strict'
import {sceneLayers,reorderSceneLayer,insertFrontLayer,sceneDrawOrder,sceneHitOrder,setLayerState,canEditClips} from '../src/sceneLayers.js'
import {createEditHistory} from '../src/editHistory.js'
const clips=()=>[{id:'a',track:0,start:0,duration:3,keyframes:{'@x':[{frame:30,value:100}]},events:[{type:'expression',frame:0,name:'smile'}]},{id:'b',track:1,start:1,duration:3},{id:'c',track:2,start:0,duration:1},{id:'d',track:0,start:3,duration:2}]

test('锁定与隐藏作用于同层全部片段，混合编辑整批拒绝，隐藏不阻止编辑',()=>{
  const c=clips()
  setLayerState(c,0,{layerLocked:true,layerHidden:true})
  assert.equal(c[0].layerLocked,true);assert.equal(c[3].layerLocked,true)
  assert.equal(c[1].layerLocked,undefined)
  assert.equal(canEditClips(c,['a','b']),false)
  assert.equal(canEditClips(c,['b']),true)
  setLayerState(c,0,{layerLocked:false})
  assert.equal(canEditClips(c,['a','d']),true);assert.equal(c[0].layerHidden,true)
  reorderSceneLayer(c,0,2)
  assert.equal(c[0].layerHidden,true);assert.equal(c[3].layerHidden,true)
})
test('图层状态可单步撤销重做，保留原动画数据',()=>{
  let c=clips();const original=structuredClone(c)
  const h=createEditHistory({capture:()=>({project:structuredClone(c)}),restore:s=>{c=s.project}})
  h.edit(()=>setLayerState(c,0,{layerLocked:true,layerHidden:true}))
  h.undo();assert.deepEqual(c,original)
  h.redo();assert.equal(c[0].layerLocked,true);assert.equal(c[3].layerHidden,true)
  assert.deepEqual(c[0].keyframes,original[0].keyframes)
})
test('图层整组移动到目标位置，同轨道片段同行，时间与动画数据不变',()=>{
  const c=clips(),data=c.map(({track,...rest})=>rest)
  assert.equal(reorderSceneLayer(c,0,2),true)
  assert.deepEqual(c.map(v=>v.track),[2,0,1,2])
  assert.deepEqual(c.map(({track,...rest})=>rest),data)
  assert.equal(reorderSceneLayer(c,2,0),true)
  assert.deepEqual(c.map(v=>v.track),[0,1,2,0])
  assert.equal(reorderSceneLayer(c,0,0),false);assert.equal(reorderSceneLayer(c,99,0),false)
})
test('稀疏轨道可上下相邻调整，新模型插入顶层且不超出16层',()=>{
  const c=[{track:2},{track:7},{track:15}]
  reorderSceneLayer(c,15,7);assert.deepEqual(c.map(v=>v.track),[0,2,1])
  assert.equal(insertFrontLayer(c),0);assert.deepEqual(c.map(v=>v.track),[1,3,2])
  const full=Array.from({length:15},(_,track)=>({track}));insertFrontLayer(full);assert.equal(Math.max(...full.map(v=>v.track)),15)
})
test('合成从底到顶，画布命中从顶到底，排序不改变输入数组顺序',()=>{
  const c=clips();assert.deepEqual(sceneDrawOrder(c).map(v=>v.id),['c','b','a','d'])
  assert.deepEqual(sceneHitOrder(c).map(v=>v.id),['a','d','b','c'])
  assert.deepEqual(c.map(v=>v.id),['a','b','c','d']);assert.deepEqual(sceneLayers(c),[0,1,2])
})
test('一次排序一步撤销重做，恢复整组图层顺序',()=>{
  let c=clips();const h=createEditHistory({capture:()=>({project:structuredClone(c)}),restore:s=>{c=s.project}})
  h.edit(()=>reorderSceneLayer(c,0,2));h.undo();assert.deepEqual(c.map(v=>v.track),[0,1,2,0]);h.redo();assert.deepEqual(c.map(v=>v.track),[2,0,1,2])
})
