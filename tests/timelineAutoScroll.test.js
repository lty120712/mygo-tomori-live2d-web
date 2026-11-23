import test from 'node:test'
import assert from 'node:assert/strict'
import {edgeScrollStep,createTimelineAutoScroll} from '../src/timelineAutoScroll.js'

const base={active:true,bounds:{left:170,right:1000,top:100,bottom:600}}
test('边缘按靠近程度连续加速，中部不滚动，水平与垂直可分别启用',()=>{
  assert.deepEqual(edgeScrollStep({...base,point:{clientX:500,clientY:300}}),{x:0,y:0})
  const step=x=>edgeScrollStep({...base,point:{clientX:x,clientY:300}}).x
  assert.ok(step(180)<step(200) && step(200)<0)
  assert.ok(step(990)>step(970) && step(970)>0)
  const vertical=edgeScrollStep({...base,horizontal:false,vertical:true,point:{clientX:500,clientY:599}})
  assert.equal(vertical.x,0);assert.ok(vertical.y>0)
  assert.ok(edgeScrollStep({...base,vertical:true,point:{clientX:180,clientY:110}}).y<0)
})
test('离开编辑区、无效边界或未拖动时不滚动，长暂停不会导致跳跃',()=>{
  for(const patch of [{active:false},{point:{clientX:500,clientY:-100}},{point:{clientX:1100,clientY:590}},{bounds:{left:200,right:100,top:100,bottom:200}},{point:{clientX:NaN,clientY:300}}]){
    assert.deepEqual(edgeScrollStep({...base,point:{clientX:990,clientY:599},vertical:true,...patch}),{x:0,y:0})
  }
  const state={...base,point:{clientX:1000,clientY:300}}
  assert.equal(edgeScrollStep(state,10000).x,36)
  assert.equal(edgeScrollStep(state,0).x,0)
  assert.equal(edgeScrollStep(state,16).x*2,edgeScrollStep(state,32).x)
})
function harness(){
  let active=true,pos=0,serial=0,frames=new Map(),replayed=[]
  const controller=createTimelineAutoScroll({getState:()=>({...base,active}),scroll:({x})=>{const before=pos;pos=Math.max(0,Math.min(40,pos+x));return before!==pos},onScroll:p=>replayed.push(p),requestFrame:fn=>{frames.set(++serial,fn);return serial},cancelFrame:id=>frames.delete(id)})
  return {controller,frames,replayed,get pos(){return pos},deactivate(){active=false},frame(time){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time))}}
}
test('鼠标停留边缘仍连续滚动并重算拖动，抵达边界即停止；移回可重新启动',()=>{
  const h=harness(),point={clientX:1000,clientY:300,pointerId:7,altKey:true}
  h.controller.update(point);h.frame(0);h.frame(16)
  assert.ok(h.pos>20);assert.equal(h.replayed[1],point)
  h.frame(32);h.frame(48);h.frame(64)
  assert.equal(h.pos,40);assert.equal(h.frames.size,0)
  h.controller.update({...point,clientX:170});h.frame(80)
  assert.ok(h.pos<40)
})
test('松开、取消和失焦撤销待执行帧，停用后不再回调，不堆积多条循环',()=>{
  const h=harness(),point={clientX:1000,clientY:300}
  h.controller.update(point);h.controller.update(point);assert.equal(h.frames.size,1)
  h.controller.stop();h.frame(0);assert.equal(h.pos,0);assert.equal(h.replayed.length,0)
  h.controller.update(point);h.deactivate();h.frame(16)
  assert.equal(h.frames.size,0);assert.equal(h.pos,0)
})
