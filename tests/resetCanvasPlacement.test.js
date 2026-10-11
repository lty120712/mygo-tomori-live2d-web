import test from 'node:test'
import assert from 'node:assert/strict'
import { createClip,sampleClip } from '../src/sceneProject.js'
import { resetCanvasPlacement } from '../src/resetCanvasPlacement.js'
import { createEditHistory } from '../src/editHistory.js'
const make=()=>{const c=createClip({category:'test',name:'model'});Object.assign(c.transform,{x:123,y:-45,scale:2,rotation:37,opacity:.6});return c}
test('无动画时恢复位置大小，不生成关键帧且保留旋转透明度',()=>{
  const c=make();resetCanvasPlacement(c,30)
  assert.deepEqual(c.transform,{x:0,y:0,scale:1,rotation:37,opacity:.6});assert.deepEqual(c.keyframes,{})
})
test('当前关键帧更新、两帧之间插入重置帧，保留其他帧及缓动',()=>{
  const c=make();c.keyframes={'@x':[{frame:0,value:100,easing:'easeIn'},{frame:60,value:200}], '@y':[{frame:30,value:40,easing:'easeOut'}], '@scale':[{frame:0,value:2},{frame:60,value:3}],mouth:[{frame:30,value:.7}]}
  const before=structuredClone(c.keyframes)
  resetCanvasPlacement(c,30)
  assert.deepEqual(sampleClip(c,1,30).transform,{x:0,y:0,scale:1,rotation:37,opacity:.6})
  assert.deepEqual(c.keyframes['@x'].filter(k=>k.frame!==30),before['@x'])
  assert.equal(c.keyframes['@y'][0].easing,'easeOut');assert.equal(c.keyframes['@y'].length,1)
  assert.deepEqual(c.keyframes.mouth,before.mouth)
})
test('动画范围之外不增加关键帧或改变既有动画，混合参数分别判断',()=>{
  const c=make();c.keyframes['@x']=[{frame:30,value:90},{frame:60,value:190}];c.keyframes['@scale']=[{frame:45,value:3}]
  const keys=structuredClone(c.keyframes)
  resetCanvasPlacement(c,0);assert.deepEqual(c.keyframes,keys);assert.equal(c.transform.x,123);assert.equal(c.transform.y,0)
  resetCanvasPlacement(c,90);assert.deepEqual(c.keyframes,keys)
})
test('裁剪源帧重置和所有参数修改可整体撤销重做',()=>{
  let c=make();c.start=2;c.offset=1;c.keyframes['@x']=[{frame:30,value:10},{frame:90,value:50}]
  const original=structuredClone(c),h=createEditHistory({capture:()=>({project:structuredClone(c)}),restore:s=>{c=structuredClone(s.project)}})
  h.edit(()=>resetCanvasPlacement(c,sampleClip(c,3,30).frame))
  assert.deepEqual(sampleClip(c,3,30).transform,{x:0,y:0,scale:1,rotation:37,opacity:.6})
  h.undo();assert.deepEqual(c,original);h.redo();assert.equal(c.keyframes['@x'].find(k=>k.frame===60).value,0)
})
