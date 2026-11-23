import test from 'node:test'
import assert from 'node:assert/strict'
import {planClipAlignment,alignProjectAtPlayhead} from '../src/clipAlignment.js'
import {createProject,createClip,setClipKeyframe,sampleClip,readProject} from '../src/sceneProject.js'
import {createImageClip,createVideoClip,createTextClip,createColorBackgroundClip,createAudioClip} from '../src/mediaTracks.js'
import {createEditHistory} from '../src/editHistory.js'

const model={category:'内置',name:'角色'},asset={id:'asset',name:'素材',width:320,height:180}
const options={duration:20,fps:30}
function examples(){return [
  {kind:'visual',clip:createClip(model,2,3)},
  {kind:'visual',clip:createImageClip(asset,2,3)},
  {kind:'visual',clip:createVideoClip(asset,2,3)},
  {kind:'visual',clip:createTextClip(2,3)},
  {kind:'background',clip:createColorBackgroundClip('#8877cc',2,3)},
  {kind:'audio',clip:createAudioClip(asset,2,3)}
]}
function projectWith(kind,clip){const p=createProject();p.duration=20;p[kind==='background' ? 'backgroundClips' : kind==='audio' ? 'audioClips' : clip.model ? 'clips' : 'imageClips']=[clip];return p}

test('六类片段起点和终点可对齐播放头，时长、源入点和其他配置保持不变',()=>{
  for(const {kind,clip} of examples()){
    if(kind!=='background')clip.offset=4
    const p=projectWith(kind,clip),before=structuredClone(clip)
    assert.equal(alignProjectAtPlayhead(p,{kind,ids:[clip.id],time:7,edge:'start'}).error,undefined)
    assert.deepEqual({...clip,start:before.start},before);assert.equal(clip.start,7)
    assert.equal(alignProjectAtPlayhead(p,{kind,ids:[clip.id],time:15,edge:'end'}).error,undefined)
    assert.equal(clip.start,12);assert.deepEqual({...clip,start:before.start},before)
  }
})

test('多选按最早起点或最晚终点整体移动，保留间隔，重复 ID 仅处理一次且规划不修改原值',()=>{
  const a=createTextClip(1,2),b=createTextClip(5,3,1),clips=[b,a],before=structuredClone(clips)
  const start=planClipAlignment(clips,[a.id,b.id,a.id],7,{...options,edge:'start'})
  assert.deepEqual(start.entries,[{id:a.id,start:7},{id:b.id,start:11}]);assert.deepEqual(clips,before)
  const end=planClipAlignment(clips,[a.id,b.id],16,{...options,edge:'end'})
  assert.deepEqual(end.entries,[{id:a.id,start:9},{id:b.id,start:13}]);assert.equal(end.delta,8)
})

test('最终同轨重叠整批拒绝，允许跨过其他片段到合法空档，不改变未选片段',()=>{
  const a=createTextClip(2,4),obstacle=createTextClip(8,2),other=createTextClip(1,2,1)
  const p=createProject();p.duration=20;p.imageClips=[a,obstacle,other]
  const before=structuredClone(p)
  assert.match(alignProjectAtPlayhead(p,{ids:[a.id,other.id],time:7,edge:'start'}).error,/重叠/)
  assert.deepEqual(p,before)
  const plan=alignProjectAtPlayhead(p,{ids:[a.id],time:12,edge:'start'})
  assert.equal(plan.error,undefined);assert.equal(a.start,12);assert.equal(obstacle.start,8);assert.equal(other.start,1)
})

test('工程首尾越界、锁定、缺失选择和无效参数原子拒绝，不缩短片段或偷偷夹到边缘',()=>{
  const a=createTextClip(2,8),b=createTextClip(12,3,1);b.layerLocked=true
  const clips=[a,b],before=structuredClone(clips)
  for(const [ids,time,extra] of [[[a.id],19,{edge:'start'}],[[a.id],1,{edge:'end'}],[[a.id,b.id],5,{}],[[a.id,'missing'],5,{}],[[],5,{}],[[a.id],NaN,{}],[[a.id],5,{edge:'bad'}],[[a.id],5,{fps:0}]]){
    assert.ok(planClipAlignment(clips,ids,time,{...options,...extra}).error)
    assert.deepEqual(clips,before)
  }
})

test('24/30/60 FPS 下按最近帧对齐，已对齐时无编辑，零时刻与工程终点可用',()=>{
  for(const fps of [24,30,60]){
    const clip=createTextClip(2,3)
    const plan=planClipAlignment([clip],[clip.id],7.0123,{...options,fps,edge:'end'})
    assert.ok(Math.abs(plan.entries[0].start+clip.duration-Math.round(7.0123*fps)/fps)<1e-9)
    assert.equal(planClipAlignment([clip],[clip.id],2,{...options,fps,edge:'start'}).aligned,true)
    assert.equal(planClipAlignment([clip],[clip.id],0,{...options,fps,edge:'start'}).entries[0].start,0)
    assert.equal(planClipAlignment([clip],[clip.id],20,{...options,fps,edge:'end'}).entries[0].start,17)
  }
})

test('整组移动携带原源动画时间；不改标记、其他轨道及工程时长，工程读回保留结果',()=>{
  const clip=createClip(model,2,3);clip.offset=4;clip.blendMode='multiply';clip.mask={shape:'ellipse'}
  setClipKeyframe(clip,'@x',0,0);setClipKeyframe(clip,'@x',300,100)
  const p=projectWith('visual',clip);p.markers=[{id:'cue',name:'对白',time:8,color:'#ff0000'}];p.audioClips=[createAudioClip(asset,1,3)]
  const pose=sampleClip(clip,3,30),preserved=structuredClone({markers:p.markers,audio:p.audioClips,duration:p.duration}),animation=structuredClone(clip.keyframes)
  alignProjectAtPlayhead(p,{ids:[clip.id],time:8,edge:'start'})
  assert.deepEqual(sampleClip(clip,9,30),pose);assert.deepEqual(clip.keyframes,animation)
  assert.deepEqual({markers:p.markers,audio:p.audioClips,duration:p.duration},preserved)
  const restored=readProject(JSON.parse(JSON.stringify(p)),[model])
  assert.equal(restored.clips[0].start,8);assert.equal(restored.clips[0].offset,4);assert.equal(restored.clips[0].duration,3)
})

test('一次整组对齐一步撤销重做；已对齐和失败请求不增加历史',()=>{
  let p=createProject();p.duration=20;p.imageClips=[createTextClip(1,2),createTextClip(5,3,1)]
  const ids=p.imageClips.map(clip=>clip.id),original=structuredClone(p)
  const history=createEditHistory({capture:()=>({project:structuredClone(p),overrides:{}}),restore:state=>p=structuredClone(state.project)})
  history.edit(()=>alignProjectAtPlayhead(p,{ids,time:7,edge:'start'}));const moved=structuredClone(p)
  history.edit(()=>alignProjectAtPlayhead(p,{ids,time:7,edge:'start'}))
  history.edit(()=>alignProjectAtPlayhead(p,{ids,time:19,edge:'start'}))
  history.undo();assert.deepEqual(p,original);assert.equal(history.canUndo,false)
  history.redo();assert.deepEqual(p,moved)
})
