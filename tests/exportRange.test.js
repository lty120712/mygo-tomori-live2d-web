import test from 'node:test'
import assert from 'node:assert/strict'
import {exportRange,timelineExportRange,markTimelineExportEdge,reconcileTimelineExportEdges} from '../src/exportRange.js'

test('默认全片、自定义区间按工程帧率对齐，使用左闭右开的完整帧序列',()=>{
  assert.deepEqual(exportRange(20,30),{startFrame:0,endFrame:600,start:0,end:20,duration:20,frames:600})
  assert.deepEqual(exportRange(20,30,{mode:'custom',start:5,end:7}),{startFrame:150,endFrame:210,start:5,end:7,duration:2,frames:60})
  for(const fps of [24,30,60]){
    const range=exportRange(10,fps,{mode:'custom',start:2/fps,end:3/fps})
    assert.equal(range.frames,1);assert.equal(range.startFrame,2);assert.equal(range.endFrame,3)
  }
  assert.equal(exportRange(.51,30).frames,16)
})
test('拒绝越界、空区间、反向区间和无效数字，不擅自交换起止时间',()=>{
  for(const [start,end] of [[-1,3],[2,21],[4,4],[5,3],[NaN,3],[1,Infinity],[.001,.002]])assert.throws(()=>exportRange(20,30,{mode:'custom',start,end}),/范围|至少保留/)
  assert.throws(()=>exportRange(0,30),/没有/)
})

test('时间线可分别设置入点和出点，单边用工程边界，全片默认不受影响',()=>{
  const start=markTimelineExportEdge(null,'start',2,10,30)
  assert.equal(timelineExportRange(start,10,30).end,10)
  assert.equal(timelineExportRange(start,12,30).end,12)
  const end=markTimelineExportEdge(null,'end',5,10,30)
  assert.equal(timelineExportRange(end,10,30).start,0)
  const both=markTimelineExportEdge(start,'end',5,10,30)
  const range=timelineExportRange(both,10,30)
  assert.deepEqual(range,exportRange(10,30,{mode:'custom',start:2,end:5}))
  assert.equal(range.frames,90)
  assert.equal(timelineExportRange(null,10,30),null)
  assert.equal(exportRange(10,30).frames,300)
})

test('边界交叉拒绝更新，按帧对齐后至少保留一帧',()=>{
  for(const fps of [24,30,60]){
    const points=markTimelineExportEdge(null,'end',5/fps,10,fps)
    assert.equal(markTimelineExportEdge(points,'start',5/fps,10,fps),null)
    assert.equal(markTimelineExportEdge(points,'start',6/fps,10,fps),null)
    assert.equal(markTimelineExportEdge(null,'start',10,10,fps),null)
    const valid=markTimelineExportEdge(points,'start',4.1/fps,10,fps)
    assert.equal(timelineExportRange(valid,10,fps).frames,1)
  }
})

test('工程缩短和切换帧率时重整边界，已不在工程内的区间自动清除',()=>{
  assert.deepEqual(reconcileTimelineExportEdges({start:2,end:8},6,30),{start:2,end:6})
  assert.equal(reconcileTimelineExportEdges({start:7,end:8},6,30),null)
  assert.deepEqual(reconcileTimelineExportEdges({start:2,end:null},6,30),{start:2,end:null})
  assert.deepEqual(reconcileTimelineExportEdges({start:null,end:4/30},6,24),{start:null,end:3/24})
})
