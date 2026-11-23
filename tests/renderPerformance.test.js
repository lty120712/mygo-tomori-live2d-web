import test from 'node:test'
import assert from 'node:assert/strict'
import {createFrameTask} from '../src/frameTask.js'
import {capturePausedFrame} from '../src/pausedFrame.js'

test('1000 pointer updates share one display-frame task and use the latest input',()=>{
  const queue=new Map();let id=0,input=0,runs=[]
  const task=createFrameTask(()=>runs.push(input),fn=>{queue.set(++id,fn);return id},id=>queue.delete(id))
  for(input=0;input<1000;input++)task.schedule()
  assert.equal(queue.size,1)
  const callback=queue.values().next().value;queue.clear();callback()
  assert.deepEqual(runs,[1000])
  task.schedule();assert.equal(queue.size,1)
  task.cancel();assert.equal(queue.size,0)
  task.schedule();assert.equal(queue.size,1)
})

test('1000 pose revisions reuse one canvas, recapture changed poses and retain two-frame settling',()=>{
  let allocations=0,draws=0
  const create=()=>{allocations++;return {getContext:()=>({clearRect(){},drawImage(){draws++}})}}
  const cache=new Map(),source={width:960,height:540}
  const first=capturePausedFrame(cache,'model',source,0,create)
  capturePausedFrame(cache,'model',source,0,create);capturePausedFrame(cache,'model',source,0,create)
  assert.equal(draws,2)
  for(let revision=1;revision<=1000;revision++)assert.equal(capturePausedFrame(cache,'model',source,revision,create),first)
  assert.equal(allocations,1);assert.equal(draws,1002)
  assert.notEqual(capturePausedFrame(cache,'model',{width:1920,height:1080},1001,create),first)
  assert.equal(allocations,2)
  capturePausedFrame(cache,'other',source,0,create);assert.equal(allocations,3)
})
