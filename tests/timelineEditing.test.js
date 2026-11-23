import test from 'node:test'
import assert from 'node:assert/strict'
import { editTimelineClip, timelineTicks, snapTimelinePoint } from '../src/timelineEditing.js'
import { planClipMove } from '../src/clipSelection.js'
import { planTextTransfer } from '../src/textClipPlacement.js'
import { createClip } from '../src/sceneProject.js'
import { createTextClip,createImageClip,createVideoClip,createColorBackgroundClip,createAudioClip } from '../src/mediaTracks.js'

const settings = { duration: 20, fps: 30, targets: [0, 8, 12, 20], tolerance: .2 }
test('移动可用入点或出点吸附，保持片段时长；关闭吸附仍按帧定位', () => {
  const drag = { mode: 'move', start: 2, duration: 3, offset: 0 }
  assert.deepEqual(editTimelineClip(drag, 2.9, settings), { patch: { start: 5 }, snapTime: 8 })
  assert.equal(editTimelineClip(drag, 5.9, settings).patch.start, 8)
  assert.equal(editTimelineClip(drag, 2.9, { ...settings, targets: [] }).patch.start, 4.9)
})
test('裁剪吸附保持源时间连续，禁止负源偏移与短于一帧', () => {
  const drag = { mode: 'left', start: 5, duration: 5, offset: 1 }
  assert.deepEqual(editTimelineClip(drag, 2.9, settings), { patch: { start: 8, duration: 2, offset: 4 }, snapTime: 8 })
  assert.deepEqual(editTimelineClip(drag, -20, settings).patch, { start: 4, duration: 6, offset: 0 })
  assert.ok(editTimelineClip(drag, 20, settings).patch.duration >= 1 / 30 - 1e-9)
  assert.equal(editTimelineClip({ ...drag, mode: 'right' }, 1.9, settings).patch.duration, 7)
})
test('吸附不突破工程范围，选择最近边界；阈值可随缩放变小', () => {
  const drag = { mode: 'move', start: 17, duration: 3, offset: 0 }
  assert.equal(editTimelineClip(drag, 20, settings).patch.start, 17)
  const moving = { ...drag, start: 2 }
  assert.equal(editTimelineClip(moving, 2.9, { ...settings, tolerance: .02 }).snapTime, null)
  assert.equal(editTimelineClip(moving, 5.9, { ...settings, targets: [8, 7.9] }).snapTime, 7.9)
})
test('快速拖过同轨相邻片段时裁剪停在边界，关闭吸附也不会穿过',()=>{
  const clip={start:5,duration:3,offset:3},neighbors=[{start:0,duration:4},{start:10,duration:2}]
  const options={duration:20,fps:30,neighbors,targets:[]}
  assert.deepEqual(editTimelineClip({...clip,mode:'left'},-9,options).patch,{start:4,duration:4,offset:2})
  assert.deepEqual(editTimelineClip({...clip,mode:'right'},9,options).patch,{duration:5})
  assert.equal(editTimelineClip({...clip,mode:'right'},1,options).patch.duration,4)
  assert.equal(editTimelineClip({...clip,mode:'right'},9,{...options,targets:[12],tolerance:3}).snapTime,null)
})
test('缩放后标尺增加刻度，短工程和长工程不会重复刻度', () => {
  assert.ok(timelineTicks(15, 1600).length > timelineTicks(15, 400).length)
  for (const duration of [.1, 15, 3600]) {
    const ticks = timelineTicks(duration, 600)
    assert.equal(new Set(ticks).size, ticks.length)
    assert.ok(ticks.every(t => t >= 0 && t < duration))
  }
})

test('标记与播放头按 24/30/60 FPS 对齐并限制在工程内，空吸附目标仅对齐帧',()=>{
  for(const fps of [24,30,60]){
    const options={duration:20,fps}
    assert.deepEqual(snapTimelinePoint(-5,options),{time:0,snapTime:null})
    assert.deepEqual(snapTimelinePoint(40,options),{time:20,snapTime:null})
    assert.equal(snapTimelinePoint(2.1234,options).time,Math.round(2.1234*fps)/fps)
  }
})

test('时间点吸附取最近标记或边界，随缩放缩小容差且关闭吸附保留原帧',()=>{
  const options={duration:20,fps:30,targets:[0,8,8.1,20],tolerance:.2}
  assert.deepEqual(snapTimelinePoint(8.07,options),{time:8.1,snapTime:8.1})
  assert.deepEqual(snapTimelinePoint(7.9,options),{time:8,snapTime:8})
  assert.deepEqual(snapTimelinePoint(7.9,{...options,tolerance:.02}),{time:7.9,snapTime:null})
  assert.deepEqual(snapTimelinePoint(7.9,{...options,targets:[]}),{time:7.9,snapTime:null})
  assert.deepEqual(snapTimelinePoint(19.9,options),{time:20,snapTime:20})
})

test('六类片段可将入点出点及裁剪边缘吸附到标记，保留时长与动画源偏移',()=>{
  const asset={id:'fixture',name:'素材',width:320,height:180,duration:20}
  const clips=[createClip({category:'内置',name:'模型'},2,2),createImageClip(asset,2,2),createVideoClip(asset,2,2),createTextClip(2,2),createColorBackgroundClip('#ff0000',2,2),createAudioClip(asset,2,2)]
  for(const clip of clips){
    const snapshot=structuredClone(clip),options={duration:20,fps:30,targets:[8],tolerance:.2}
    const start=clip.media==='text' ? planTextTransfer([clip],clip.id,{start:7.9,track:clip.track},options) : planClipMove([clip],[clip],5.9,options)
    assert.equal(clip.media==='text' ? start.start : start.entries[0].start,8)
    assert.equal(start.snapTime,8)
    const end=planClipMove([clip],[clip],3.9,options)
    assert.equal(end.entries[0].start,6);assert.equal(end.snapTime,8)
    const trim=editTimelineClip({...clip,mode:'right',offset:clip.offset || 0},3.9,options)
    assert.equal(trim.patch.duration,6);assert.equal(trim.snapTime,8)
    assert.deepEqual(clip,snapshot)
  }
})

test('吸附到标记不能穿过同轨片段或突破工程边界',()=>{
  const clip=createTextClip(2,2),blocker=createTextClip(6,2,clip.track)
  const result=planClipMove([clip,blocker],[clip],5.9,{duration:10,fps:30,targets:[8,10],tolerance:.2})
  assert.equal(result.entries[0].start,4);assert.equal(result.snapTime,null)
  const text=planTextTransfer([clip,blocker],clip.id,{start:7.9,track:clip.track},{duration:10,fps:30,targets:[8],tolerance:.2})
  assert.equal(text.start,8);assert.equal(text.error,undefined)
})
