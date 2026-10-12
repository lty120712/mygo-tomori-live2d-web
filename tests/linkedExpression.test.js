import test from 'node:test'
import assert from 'node:assert/strict'
import {activeEvent,eventRange} from '../src/timelineEvents.js'
import {createClip,createProject,readProject} from '../src/sceneProject.js'
const model={category:'tomori',name:'test',entry:'model.json'}
function clip(){const c=createClip(model,0,10);c.events=[{id:'before',type:'expression',name:'exp_sad01.exp3',frame:0,motionLinked:false},{id:'motion',type:'motion',name:'mtn_angry01_C',frame:30,duration:2},{id:'paired',type:'expression',name:'exp_angry01.exp3',frame:30,motionLinked:true}];return c}
test('配套表情随动作结束，恢复动作前的独立表情；旧同帧同名联动兼容',()=>{
  for(const legacy of [false,true]){const c=clip();if(legacy)delete c.events[2].motionLinked
    assert.equal(activeEvent(c,'expression',2,30).id,'paired')
    assert.equal(activeEvent(c,'expression',3,30).id,'before')
    assert.equal(eventRange(c,c.events[2],30).end,3)
  }
})
test('手动添加的同名表情保持，联动期间新表情可替换',()=>{
  const c=clip();c.events[2].motionLinked=false
  assert.equal(activeEvent(c,'expression',4,30).id,'paired')
  c.events[2].motionLinked=true;c.events.push({id:'manual',type:'expression',name:'exp_smile01.exp3',frame:60,motionLinked:false})
  assert.equal(activeEvent(c,'expression',2,30).id,'manual');assert.equal(activeEvent(c,'expression',4,30).id,'manual')
})
test('联动归属随工程往返保留，无独立表情时结束后不再覆盖身体',()=>{
  const c=clip();c.events.shift();const p={...createProject(),clips:[c]}
  const restored=readProject(p,[model]).clips[0]
  assert.equal(restored.events[1].motionLinked,true);assert.equal(activeEvent(restored,'expression',3,30),undefined)
})
