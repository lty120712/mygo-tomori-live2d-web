import test from 'node:test'
import assert from 'node:assert/strict'
import {applyTrackRipple,planTrackRipple} from '../src/trackRipple.js'
import {createProject,syncProjectDuration,createClip} from '../src/sceneProject.js'
import {createTextClip,createImageClip,createVideoClip,createColorBackgroundClip,createAudioClip} from '../src/mediaTracks.js'
import {createEditHistory} from '../src/editHistory.js'
import {exportRange} from '../src/exportRange.js'

const asset={id:'asset',name:'素材',width:320,height:180}
const model={category:'内置',name:'角色'}
const cases=[
  ['visual','clips',(start,duration,track)=>createClip(model,start,duration,track)],
  ['visual','imageClips',(start,duration,track)=>createImageClip(asset,start,duration,track)],
  ['visual','imageClips',(start,duration,track)=>createVideoClip(asset,start,duration,track)],
  ['visual','imageClips',createTextClip],
  ['background','backgroundClips',(start,duration)=>createColorBackgroundClip('#123456',start,duration)],
  ['audio','audioClips',(start,duration,track)=>createAudioClip(asset,start,duration,track)],
]

test('六类片段关闭紧邻的空隙，后续片段同距左移并保留源内容与相对间隔',()=>{
  for(const [kind,key,create] of cases){
    const project=createProject(),before=create(0,2,0),target=create(5,2,0),after=create(9,2,0)
    const other=kind==='background' ? createTextClip(5,2) : create(5,2,1)
    project[key]=[after,before,target]
    if(kind==='background')project.imageClips=[other];else project[key].push(other)
    if(kind!=='background')after.offset=1.25
    if(kind==='audio')after.volumeKeyframes=[{time:1,value:.6}]
    if(kind==='visual')after.keyframes['@x']=[{frame:45,value:20}]
    const saved=structuredClone(after)
    const plan=applyTrackRipple(project,{kind,mode:'gap',id:target.id})
    assert.equal(plan.shift,3)
    assert.equal(before.start,0)
    assert.equal(target.start,2)
    assert.equal(after.start,6)
    assert.equal(other.start,5)
    assert.deepEqual({...after,start:saved.start},saved)
  }
})

test('删除并左移只移除目标，保留原有空隙；删除末段无需后续片段',()=>{
  for(const [kind,key,create] of cases){
    const p=createProject(),early=create(0,1,0),target=create(3,2,0),late=create(6,2,0)
    p[key]=[early,target,late]
    assert.equal(applyTrackRipple(p,{kind,mode:'delete',id:target.id}).shift,2)
    assert.deepEqual(p[key].map(c=>c.id),[early.id,late.id])
    assert.equal(late.start,4)
    assert.equal(applyTrackRipple(p,{kind,mode:'delete',id:late.id}).entries.length,0)
    assert.deepEqual(p[key].map(c=>c.id),[early.id])
  }
})

test('轨首空隙可关闭，锁定、重叠、无空隙及过期目标均不修改数据',()=>{
  const p=createProject(),first=createTextClip(4,3),second=createTextClip(8,2)
  p.imageClips=[first,second]
  assert.equal(applyTrackRipple(p,{kind:'visual',mode:'gap',id:first.id}).shift,4)
  assert.equal(first.start,0)
  const request={kind:'visual',mode:'gap',id:first.id}
  const unchanged=structuredClone(p)
  assert.match(applyTrackRipple(p,request).error,/没有空隙/)
  assert.match(applyTrackRipple(p,{...request,id:'gone'}).error,/有效片段/)
  assert.deepEqual(p,unchanged)
  second.layerLocked=true
  assert.match(applyTrackRipple(p,{...request,mode:'delete'}).error,/锁定/)
  second.layerLocked=false;second.start=2
  assert.match(applyTrackRipple(p,{...request,mode:'delete'}).error,/重叠/)
  assert.equal(p.imageClips.length,2)
  assert.equal(first.start,0)
})

test('左移是一步撤销，工程与全片导出时长随实际片尾更新',()=>{
  let p=createProject()
  const a=createClip(model,0,3),b=createClip(model,5,5)
  p.clips=[a,b];p.audioClips=[createAudioClip(asset,1,6)];syncProjectDuration(p)
  const original=structuredClone(p)
  const history=createEditHistory({
    capture:()=>({project:structuredClone(p)}),
    restore:state=>{p=structuredClone(state.project)},
    finalize:()=>syncProjectDuration(p)
  })
  history.edit(()=>applyTrackRipple(p,{kind:'visual',mode:'delete',id:a.id}))
  assert.equal(p.clips[0].start,2)
  assert.equal(exportRange(p.duration,p.fps).duration,7)
  assert.deepEqual(p.audioClips,original.audioClips)
  history.undo();assert.deepEqual(p,original);assert.equal(history.canUndo,false)
  history.redo();assert.equal(p.duration,7)
  const plan=planTrackRipple(p.clips,{kind:'visual',mode:'gap',id:b.id})
  assert.equal(plan.shift,2)
  assert.equal(p.clips[0].start,2)
})
