import test from 'node:test'
import assert from 'node:assert/strict'
import {eventRange,activeEvent,planEventEdit,normalizeMotionEvents,eventProgress} from '../src/timelineEvents.js'
import {createEditHistory} from '../src/editHistory.js'
import {playTimelineMotion} from '../src/live2dSceneAdapter.js'
const clip=()=>({start:2,duration:6,offset:1,events:[{id:'m',type:'motion',name:'nod',frame:60,duration:2,sourceDuration:3,offset:.5},{id:'e',type:'expression',name:'smile',frame:30,duration:0},{id:'e2',type:'expression',name:'idle',frame:120,duration:0}]})
test('表情忽略旧时长并持续到下一次切换，最后一帧保持到模型结束',()=>{
  const c=clip();assert.deepEqual(eventRange(c,c.events[1],30),{start:2,end:5,sourceStart:2,duration:3})
  assert.equal(activeEvent(c,'expression',4.99,30).name,'smile')
  c.events[1].duration=1;assert.equal(activeEvent(c,'expression',3.5,30).name,'smile');assert.equal(activeEvent(c,'expression',7.99,30).name,'idle');assert.equal(activeEvent(c,'expression',8,30),undefined)
  assert.equal(activeEvent(c,'motion',3.5,30).name,'nod');assert.equal(activeEvent(c,'motion',5,30),undefined)
})
test('24/30/60 FPS 移动保持源入点，裁剪验证源长度、同帧冲突和模型范围',()=>{
  for(const fps of [24,30,60]){const c=clip(),m=c.events[0];m.frame=fps*2
    const moved=planEventEdit(c,m,{start:4,duration:2},fps);assert.equal(moved.patch.frame,fps*3);assert.equal(moved.patch.offset,.5)
    const trimmed=planEventEdit(c,m,{start:3.5,duration:1.5,offset:1},fps);assert.equal(trimmed.patch.offset,1)
    assert.ok(planEventEdit(c,m,{duration:3},fps).error)
    assert.ok(planEventEdit(c,m,{start:7,duration:2},fps).error)
    assert.ok(planEventEdit(c,m,{start:1},fps).error)
    c.events.push({...m,id:'other',frame:fps*3});assert.ok(planEventEdit(c,m,{start:4},fps).error)
  }
})
test('恢复旧重叠动作时显式裁短上一动作，保留源长度',()=>{
  const c=clip();c.events[0].frame=0;c.events[0].duration=5
  c.events.push({id:'next',type:'motion',frame:90,duration:1})
  normalizeMotionEvents(c,30)
  assert.equal(c.events[0].duration,3)
  assert.deepEqual(eventRange(c,c.events[0],30),{start:2,end:4,sourceStart:1,duration:2})
  assert.equal(activeEvent(c,'motion',4,30).id,'next')
})
test('动作裁剪、粘贴和删除的历史可以完整往返',()=>{
  let c=clip();const h=createEditHistory({capture:()=>({project:structuredClone(c)}),restore:v=>{c=v.project}})
  h.begin();h.edit(()=>Object.assign(c.events[0],planEventEdit(c,c.events[0],{duration:1,offset:1},30).patch));h.edit(()=>c.events[0].duration=.5);h.end()
  h.undo();assert.equal(c.events[0].duration,2);h.redo();assert.equal(c.events[0].duration,.5)
  h.edit(()=>c.events.push({...c.events[0],id:'copy',frame:180}));h.undo();assert.equal(c.events.length,3);h.redo();assert.equal(c.events.length,4)
  h.edit(()=>c.events=c.events.filter(e=>e.id!=='copy'));h.undo();assert.equal(c.events.length,4)
})
test('现代模型动作队列从裁剪入点开始，调整淡入和结束时间',()=>{
  const entry={start:10,fade:10,end:13,_motion:{setupMotionQueueEntry(){}},getStartTime(){return this.start},setStartTime(v){this.start=v},getFadeInStartTime(){return this.fade},setFadeInStartTime(v){this.fade=v},getEndTime(){return this.end},setEndTime(v){this.end=v}}
  const manager={_userTimeSeconds:10,_motions:[],stopAllMotions(){this._motions=[]}}
  const sdk={_state:{l2d6Model:{_subdelegates:[{getLive2DManager:()=>({_models:[{_motionManager:manager}]})}]}},playMotion(){manager._motions.push(entry)}}
  playTimelineMotion(sdk,'nod',1);assert.deepEqual([entry.start,entry.fade,entry.end],[9,9,12])
})

test('动作区间禁止交叠，首尾相接合法；移动、延长和粘贴使用同一检查',()=>{
  for(const fps of [24,30,60]){const c={start:0,duration:10,offset:0,events:[{id:'a',type:'motion',name:'first',frame:fps,duration:2,sourceDuration:4}]},newEvent={id:'b',type:'motion',name:'second',frame:0,duration:2,sourceDuration:4}
    assert.ok(planEventEdit(c,newEvent,{start:2},fps).error)
    assert.ok(planEventEdit(c,newEvent,{start:0},fps).error)
    assert.ok(planEventEdit(c,newEvent,{start:3},fps).patch)
    c.events.push({...newEvent,frame:4*fps})
    assert.ok(planEventEdit(c,c.events[0],{duration:4},fps).error)
    assert.ok(planEventEdit(c,c.events[0],{start:3},fps).error)
    assert.ok(planEventEdit(c,{...newEvent,id:'paste'},{start:4.5},fps).error)
  }
})
test('动作倒计时开始前显示全长，到终点归零',()=>{
  const c=clip(),m=c.events[0]
  assert.deepEqual(eventProgress(c,m,2,30),{remaining:2,ratio:0})
  assert.deepEqual(eventProgress(c,m,4,30),{remaining:1,ratio:.5})
  assert.deepEqual(eventProgress(c,m,6,30),{remaining:0,ratio:1})
})

test('表情同帧替换计划不拒绝冲突，不保留时长和源入点',()=>{
  const c=clip(),e={id:'new',type:'expression',name:'angry',frame:30,duration:999,offset:8,sourceDuration:999}
  assert.deepEqual(planEventEdit(c,e,{start:2,duration:500},30).patch,{frame:30,duration:0,offset:0,sourceDuration:0})
  assert.ok(planEventEdit(c,e,{start:7.9},30).patch)
})
