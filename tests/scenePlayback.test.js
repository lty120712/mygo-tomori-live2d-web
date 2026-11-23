import test from 'node:test'
import assert from 'node:assert/strict'
import { playbackFrame } from '../src/scenePlayback.js'
test('24/30/60 FPS 在末尾准确循环且没有空白终点帧',()=>{
  for(const fps of [24,30,60]){
    const total=5*fps
    assert.equal(playbackFrame(total-.1,total,true).frame,total-1)
    assert.deepEqual(playbackFrame(total,total,true),{frame:0,wrapped:true,ended:false,remainder:0})
    assert.deepEqual(playbackFrame(total+2.5,total,true),{frame:2,wrapped:true,ended:false,remainder:2.5})
  }
})
test('后台延迟跨多个循环时保持当前相位，重建时钟后继续且关闭循环走完当前轮',()=>{
  const delayed=playbackFrame(903.25,300,true)
  assert.equal(delayed.frame,3);assert.equal(delayed.remainder,3.25)
  assert.equal(playbackFrame(delayed.remainder+1,300,true).frame,4)
  assert.equal(playbackFrame(delayed.remainder+1,300,false).ended,false)
  assert.equal(playbackFrame(300,300,false).ended,true)
})
test('关闭循环和录制均到末尾停止，录制覆盖循环开关',()=>{
  for(const loop of [false,true])assert.deepEqual(playbackFrame(305,300,loop,true),{frame:300,wrapped:false,ended:true,remainder:0})
  assert.equal(playbackFrame(300,300,false).ended,true)
  assert.equal(playbackFrame(-1,300,true).frame,0)
})

test('范围预览从入点计时，循环回到同一入点并保留跨多圈后的相位',()=>{
  for(const fps of [24,30,60]){
    const start=2*fps,end=5*fps,span=end-start
    assert.equal(playbackFrame(start-10,end,true,false,start).frame,start)
    assert.equal(playbackFrame(end-.1,end,true,false,start).frame,end-1)
    assert.deepEqual(playbackFrame(end,end,true,false,start),{frame:start,wrapped:true,ended:false,remainder:0})
    assert.deepEqual(playbackFrame(end+span*3+4.5,end,true,false,start),{frame:start+4,wrapped:true,ended:false,remainder:4.5})
    assert.deepEqual(playbackFrame(end,end,false,false,start),{frame:end,wrapped:false,ended:true,remainder:0})
  }
  assert.equal(playbackFrame(9,9,true,false,8).frame,8)
})
