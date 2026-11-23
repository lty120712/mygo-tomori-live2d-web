import test from 'node:test'
import assert from 'node:assert/strict'
import {planPlayheadTrim,trimProjectAtPlayhead} from '../src/playheadTrim.js'
import {createProject,createClip,readProject,setClipKeyframe,sampleClip} from '../src/sceneProject.js'
import {createImageClip,createVideoClip,createTextClip,createColorBackgroundClip,createAudioClip} from '../src/mediaTracks.js'
import {createEditHistory} from '../src/editHistory.js'

const model={category:'内置',name:'角色'},asset={id:'asset',name:'素材',width:320,height:180,duration:20}
const examples=()=>[
  {kind:'visual',clip:createClip(model,2,8)},
  {kind:'visual',clip:createImageClip(asset,2,8)},
  {kind:'visual',clip:createVideoClip(asset,2,8)},
  {kind:'visual',clip:createTextClip(2,8)},
  {kind:'background',clip:createColorBackgroundClip('#8844cc',2,8)},
  {kind:'audio',clip:createAudioClip(asset,2,8)}
]
function projectWith(kind,clip){const project=createProject();project.duration=20;project[kind==='background' ? 'backgroundClips' : kind==='audio' ? 'audioClips' : clip.model ? 'clips' : 'imageClips']=[clip];return project}

test('六类片段裁掉左侧时保持原出点，视觉和音频源入点前移；规划不修改输入',()=>{
  for(const {kind,clip} of examples()){
    if(kind!=='background')clip.offset=1
    const before=structuredClone(clip),plan=planPlayheadTrim([clip],[clip.id],5,{fps:30,side:'left',kind})
    assert.deepEqual(clip,before);assert.equal(plan.entries.length,1)
    const patch=plan.entries[0].patch
    assert.equal(patch.start,5);assert.equal(patch.duration,5)
    if(kind==='background')assert.equal(Object.hasOwn(patch,'offset'),false)
    else assert.equal(patch.offset,4)
  }
})

test('六类片段裁掉右侧时仅缩短时长，原起点和素材入点保持不变',()=>{
  for(const {kind,clip} of examples()){
    if(kind!=='background')clip.offset=3
    const p=projectWith(kind,clip),plan=trimProjectAtPlayhead(p,{kind,ids:[clip.id],time:7,side:'right'})
    assert.equal(plan.error,undefined);assert.equal(clip.start,2);assert.equal(clip.duration,5)
    if(kind!=='background')assert.equal(clip.offset,3)
    assert.equal(p.duration,20)
  }
})

test('多选只修剪播放头经过的片段，后续同轨片段、背景、音频和标记不移动',()=>{
  const p=createProject();p.duration=20
  const a=createTextClip(2,8,0),b=createTextClip(3,6,1),later=createTextClip(12,3,0)
  p.imageClips=[a,b,later];p.backgroundClips=[createColorBackgroundClip('#ffffff',0,20)];p.audioClips=[createAudioClip(asset,0,20)]
  p.markers=[{id:'cue',name:'对白',time:5,color:'#ff0000'}]
  const preserved=structuredClone({later,background:p.backgroundClips,audio:p.audioClips,markers:p.markers})
  const plan=trimProjectAtPlayhead(p,{ids:[a.id,b.id,later.id,a.id],time:5,side:'left'})
  assert.equal(plan.entries.length,2);assert.equal(a.start,5);assert.equal(a.duration,5);assert.equal(b.duration,4)
  assert.deepEqual({later,background:p.backgroundClips,audio:p.audioClips,markers:p.markers},preserved)
})

test('按 24/30/60 FPS 定位，端点、片段外和不足一帧时不修剪，至少可保留一帧',()=>{
  for(const fps of [24,30,60]){
    const clip=createTextClip(0,2/fps)
    for(const time of [-1,0,.49/fps,2/fps,1])assert.ok(planPlayheadTrim([clip],[clip.id],time,{fps,side:'left'}).error)
    for(const side of ['left','right']){
      const plan=planPlayheadTrim([clip],[clip.id],1.1/fps,{fps,side})
      assert.equal(plan.time,1/fps);assert.ok(Math.abs(plan.entries[0].patch.duration-1/fps)<1e-9)
    }
  }
})

test('锁定、未知片段与无效请求整批拒绝，不产生部分修改',()=>{
  const p=createProject(),a=createTextClip(0,8),locked=createTextClip(1,8,1);locked.layerLocked=true;p.imageClips=[a,locked]
  const before=structuredClone(p)
  for(const request of [{ids:[a.id,locked.id],time:5,side:'left'},{ids:[a.id,'missing'],time:5,side:'right'},{ids:[],time:5,side:'left'},{ids:[a.id],time:NaN,side:'left'},{ids:[a.id],time:5,side:'bad'},{kind:'unknown',ids:[a.id],time:5,side:'left'}]){
    assert.ok(trimProjectAtPlayhead(p,request).error);assert.deepEqual(p,before)
  }
})

test('源参数、关键帧、遮罩与文字动画配置保留；音频关键帧滤镜保留且淡入淡出限制在新时长内',()=>{
  const clip=createClip(model,2,8);clip.offset=1;clip.mask={shape:'ellipse'};setClipKeyframe(clip,'@x',0,0);setClipKeyframe(clip,'@x',300,100)
  const p=projectWith('visual',clip),before=sampleClip(clip,6,30),keys=structuredClone(clip.keyframes)
  trimProjectAtPlayhead(p,{ids:[clip.id],time:5,side:'left'})
  assert.deepEqual(sampleClip(clip,6,30),before);assert.deepEqual(clip.keyframes,keys);assert.deepEqual(clip.mask,{shape:'ellipse'})
  const text=createTextClip(2,8);text.textAnimationEnd=10;text.textStyle.inAnimation='typewriter';const style=structuredClone(text.textStyle)
  trimProjectAtPlayhead(projectWith('visual',text),{ids:[text.id],time:5,side:'left'})
  assert.deepEqual(text.textStyle,style);assert.equal(text.textAnimationEnd,10)
  const audio=createAudioClip(asset,2,8);audio.offset=3;audio.fadeIn=5;audio.fadeOut=6;audio.filter='lowpass';audio.volumeKeyframes=[{source:3,value:.5,easing:'linear'},{source:9,value:1,easing:'linear'}]
  const automation=structuredClone(audio.volumeKeyframes)
  trimProjectAtPlayhead(projectWith('audio',audio),{kind:'audio',ids:[audio.id],time:4,side:'right'})
  assert.equal(audio.start,2);assert.equal(audio.offset,3);assert.equal(audio.fadeIn,2);assert.equal(audio.fadeOut,2);assert.equal(audio.filter,'lowpass');assert.deepEqual(audio.volumeKeyframes,automation)
})

test('一次批量修剪一步撤销重做，后续修剪独立；工程读回保留起点、时长和源入点',()=>{
  let p=createProject();p.duration=20;p.imageClips=[createTextClip(2,8),createImageClip(asset,2,8,1)]
  const original=structuredClone(p),ids=p.imageClips.map(clip=>clip.id)
  const history=createEditHistory({capture:()=>({project:structuredClone(p),overrides:{}}),restore:state=>p=structuredClone(state.project)})
  history.edit(()=>trimProjectAtPlayhead(p,{ids,time:5,side:'left'}))
  const trimmed=structuredClone(p)
  history.edit(()=>trimProjectAtPlayhead(p,{ids,time:7,side:'right'}))
  history.undo();assert.deepEqual(p,trimmed);history.undo();assert.deepEqual(p,original);assert.equal(history.canUndo,false)
  history.redo();assert.deepEqual(p,trimmed)
  const restored=readProject(JSON.parse(JSON.stringify(p)),[])
  for(let i=0;i<2;i++)for(const key of ['start','duration','offset'])assert.equal(restored.imageClips[i][key],p.imageClips[i][key])
})
