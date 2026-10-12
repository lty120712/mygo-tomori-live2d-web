import test from 'node:test'
import assert from 'node:assert/strict'
import {isPanButton,panOffset} from '../src/canvasPan.js'
test('仅中键平移，左键和右键不进入视野拖动',()=>{
  assert.equal(isPanButton(1),true);assert.equal(isPanButton(0),false);assert.equal(isPanButton(2),false)
})
test('适应窗口且无滚动空间时也可双向平移，连续移动基于起点避免累计误差',()=>{
  const origin={x:0,y:0},start={x:650,y:260}
  assert.deepEqual(panOffset(origin,start,{x:550,y:200}),{x:-100,y:-60})
  assert.deepEqual(panOffset(origin,start,{x:750,y:320}),{x:100,y:60})
  assert.deepEqual(origin,{x:0,y:0})
})
