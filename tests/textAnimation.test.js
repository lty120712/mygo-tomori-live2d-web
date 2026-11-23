import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeTextAnimation,sampleTextAnimation,textGraphemes,TEXT_ENTER_ANIMATIONS,TEXT_EXIT_ANIMATIONS} from '../src/textAnimation.js'
import {createTextClip} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip,setClipKeyframe} from '../src/sceneProject.js'
import {paintText,normalizeTextStyle} from '../src/textTracks.js'
import {copyClips,planClipPaste,planClipSplit} from '../src/clipSelection.js'
import {patchTextStyles} from '../src/textBatchStyle.js'
import {createTextPresetStore} from '../src/textPresetStore.js'
import {createLocalStore,memoryDocumentBackend} from '../src/localStore.js'

test('旧工程默认无动画，无效值回退，时长限为 0–10 秒',()=>{
  assert.equal(normalizeTextAnimation(null).enterAnimation,'none')
  const style=normalizeTextStyle({enterAnimation:'bad',exitAnimation:'bad',enterDuration:-1,exitDuration:999})
  assert.equal(style.enterAnimation,'none');assert.equal(style.exitAnimation,'none');assert.equal(style.enterDuration,0);assert.equal(style.exitDuration,10)
  assert.deepEqual(sampleTextAnimation(createTextClip(),1),{opacity:1,y:0,scale:1,reveal:Infinity})
})
test('所有入出场效果边界确定，结束恢复基础变换，缩放滑动同时淡入淡出',()=>{
  for(const enter of TEXT_ENTER_ANIMATIONS.filter(a=>a.value!=='none')){
    const clip=createTextClip();clip.textStyle={...clip.textStyle,enterAnimation:enter.value,enterDuration:1}
    const first=sampleTextAnimation(clip,0),middle=sampleTextAnimation(clip,.5),end=sampleTextAnimation(clip,1)
    assert.deepEqual(sampleTextAnimation(clip,.5),middle)
    assert.equal(end.opacity,1);assert.equal(end.y,0);assert.equal(end.scale,1)
    if(enter.value==='typewriter'){assert.equal(first.reveal,0);assert.equal(middle.reveal,.5);assert.equal(end.reveal,1)}else{assert.equal(first.opacity,0);assert.ok(middle.opacity>0 && middle.opacity<1)}
  }
  for(const exit of TEXT_EXIT_ANIMATIONS.filter(a=>a.value!=='none')){
    const clip=createTextClip();clip.textStyle={...clip.textStyle,exitAnimation:exit.value,exitDuration:1}
    assert.equal(sampleTextAnimation(clip,4).opacity,1)
    assert.equal(sampleTextAnimation(clip,5).opacity,0)
  }
})
test('极短片段自动按比例压缩入出场，零时长不会出现 NaN',()=>{
  const clip=createTextClip(0,.2);clip.textStyle={...clip.textStyle,enterAnimation:'fade',exitAnimation:'fade',enterDuration:10,exitDuration:10}
  assert.equal(sampleTextAnimation(clip,.1,60).opacity,1)
  for(const time of [0,.05,.1,.15,.2])assert.ok(Number.isFinite(sampleTextAnimation(clip,time,60).opacity))
  clip.textStyle.enterDuration=0;clip.textStyle.exitDuration=0
  assert.equal(sampleTextAnimation(clip,0).opacity,1)
})
test('切割前后逐帧动画一致，重复切割和工程恢复保留源动画进度',()=>{
  const clip=createTextClip(2,5);clip.textStyle={...clip.textStyle,enterAnimation:'typewriter',exitAnimation:'slide-up',enterDuration:2,exitDuration:1}
  const original=structuredClone(clip),right=splitClip(clip,3),last=splitClip(right,5)
  for(let frame=0;frame<150;frame++){
    const time=2+frame/30,part=time<3 ? clip : time<5 ? right : last
    assert.deepEqual(sampleTextAnimation(part,time),sampleTextAnimation(original,time))
  }
  const p=createProject();p.imageClips=[clip,right,last]
  const read=readProject(JSON.parse(JSON.stringify(p)),[])
  assert.equal(read.imageClips[1].textAnimationEnd,5)
  assert.deepEqual(sampleTextAnimation(read.imageClips[1],4),sampleTextAnimation(original,4))
  const pasted=planClipPaste([],copyClips([last],[last.id],30),0,10,30).clips[0]
  assert.equal(pasted.textAnimationEnd,last.textAnimationEnd);assert.equal(pasted.textStyle.exitAnimation,'slide-up')
})
test('打字机以完整字素显示，换行及居中起点不随显示进度移动，底框及说话人保持',()=>{
  const text='你👨‍👩‍👧‍👦好';assert.equal(textGraphemes(text).length,3)
  const clip=createTextClip();clip.text=text;clip.speaker='旁白';clip.textStyle={...clip.textStyle,layout:'dialogue',align:'center',strokeWidth:0}
  const calls=[],ctx={globalAlpha:1,save(){},restore(){},beginPath(){},roundRect(){calls.push('box')},fill(){},stroke(){},moveTo(){},lineTo(){},measureText:t=>({width:textGraphemes(t).length*10}),fillText(text,x,y){calls.push({text,x,y})}}
  paintText(ctx,clip,{reveal:2/3});const partial=calls.find(c=>c.text==='你👨‍👩‍👧‍👦')
  assert.ok(partial);assert.ok(calls.some(c=>c.text==='旁白'));assert.ok(calls.includes('box'))
  calls.length=0;paintText(ctx,clip,{reveal:1});assert.equal(calls.find(c=>c.text===text).x,partial.x)
})
test('批量修改与自定义预设可保存动画，配置不覆盖文字和关键帧',async()=>{
  const clips=[createTextClip(),createTextClip(5)],text=clips.map(c=>c.text)
  setClipKeyframe(clips[0],'@opacity',15,.5);const keys=structuredClone(clips[0].keyframes)
  patchTextStyles(clips,{enterAnimation:'zoom',exitAnimation:'fade',enterDuration:.8})
  assert.deepEqual(clips.map(c=>c.text),text);assert.equal(clips[1].textStyle.enterAnimation,'zoom')
  assert.deepEqual(clips[0].keyframes,keys)
  const repo=createTextPresetStore(createLocalStore(memoryDocumentBackend()))
  await repo.save('动画字幕',clips[0].textStyle)
  assert.equal((await repo.list())[0].style.enterAnimation,'zoom')
})

test('时间线切割计划为左右片段都提供原动画终点，左半段不提前淡出',()=>{
  const clip=createTextClip();clip.textStyle={...clip.textStyle,enterAnimation:'typewriter',enterDuration:2,exitAnimation:'fade',exitDuration:1}
  const plan=planClipSplit([clip],[clip.id],1)
  assert.equal(plan.left[0].textAnimationEnd,5);assert.equal(plan.right[0].textAnimationEnd,5)
  assert.deepEqual(sampleTextAnimation(plan.left[0],.5),sampleTextAnimation(clip,.5))
  assert.equal(clip.duration,5)
})
