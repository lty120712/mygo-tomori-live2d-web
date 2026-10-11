import test from 'node:test'
import assert from 'node:assert/strict'
import { modelBounds,snapCanvasPosition,nudgeCanvasPosition } from '../src/canvasPosition.js'
const pose={x:100,y:60,scale:1,rotation:0}
test('画布中心、边缘独立吸附，Alt 保留自由位置',()=>{
  assert.deepEqual(snapCanvasPosition(pose,{x:5,y:-4}).position,{x:0,y:0})
  const edge=snapCanvasPosition(pose,{x:317,y:14})
  assert.equal(edge.position.x,320);assert.equal(edge.position.y,15)
  assert.deepEqual(edge.guides,[{axis:'x',value:480},{axis:'y',value:270}])
  assert.deepEqual(snapCanvasPosition(pose,{x:5,y:-4},[],8,true),{position:{x:5,y:-4},guides:[]})
  assert.equal(snapCanvasPosition(pose,{x:10,y:100},[],8).position.x,10)
  assert.equal(snapCanvasPosition(pose,{x:10,y:100},[],16).position.x,0)
})
test('旋转缩放边界与其他模型对齐，使用最近目标',()=>{
  const rotated={...pose,rotation:90,scale:2},b=modelBounds(rotated)
  assert.ok(Math.abs(b.x[0]+410)<1e-9);assert.ok(Math.abs(b.y[2]-380)<1e-9)
  const other={x:123,y:90,rotation:0,scale:.5}
  const out=snapCanvasPosition(pose,{x:126,y:94},[other])
  assert.deepEqual(out.position,{x:123,y:90})
  assert.deepEqual(out.guides,[{axis:'x',value:123},{axis:'y',value:90}])
})
test('方向键在输出像素中微调，不吸附，Shift 十像素且遵守边界',()=>{
  assert.deepEqual(nudgeCanvasPosition(pose,'ArrowLeft'),{x:99,y:60})
  assert.deepEqual(nudgeCanvasPosition(pose,'ArrowRight',true),{x:110,y:60})
  assert.deepEqual(nudgeCanvasPosition(pose,'ArrowUp'),{x:100,y:59})
  assert.deepEqual(nudgeCanvasPosition(pose,'ArrowDown',true),{x:100,y:70})
  assert.deepEqual(nudgeCanvasPosition({...pose,x:1918,y:-1079},'ArrowRight',true),{x:1920,y:-1079})
  assert.deepEqual(nudgeCanvasPosition({...pose,y:-1079},'ArrowUp',true),{x:100,y:-1080})
})
