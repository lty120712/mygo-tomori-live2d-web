import test from 'node:test'
import assert from 'node:assert/strict'
import {MEDIA_ENTER_ANIMATIONS,MEDIA_EXIT_ANIMATIONS,normalizeMediaAnimation,sampleMediaAnimation} from '../src/mediaAnimation.js'
import {createImageClip,createVideoClip,visualPose} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip,setClipKeyframe,sampleClip} from '../src/sceneProject.js'
import {paintedPose,hitSceneClip} from '../src/canvasHitTest.js'
import {copyClips,planClipPaste,planClipSplit} from '../src/clipSelection.js'
import {createEditHistory} from '../src/editHistory.js'

test('图片视频缺省无动画，拒绝打字机与无效类型，时长归一化',()=>{
  const clip=createImageClip({id:'a',width:800,height:400})
  assert.deepEqual(sampleMediaAnimation(clip,1),{opacity:1,y:0,scale:1,reveal:Infinity})
  assert.equal(normalizeMediaAnimation({enterAnimation:'typewriter'}).enterAnimation,'none')
  assert.equal(normalizeMediaAnimation(null).exitAnimation,'none')
  assert.equal(normalizeMediaAnimation({enterDuration:-2,exitDuration:99}).enterDuration,0)
  assert.equal(normalizeMediaAnimation({exitDuration:99}).exitDuration,10)
})
test('所有图片和视频入出场效果边界稳定，叠加而不改写原变换及关键帧',()=>{
  for(const create of [createImageClip,createVideoClip])for(const enter of MEDIA_ENTER_ANIMATIONS){
    const clip=create({id:'a',width:800,height:400});clip.transform.opacity=.7;setClipKeyframe(clip,'@scale',0,1.2)
    clip.animation={enterAnimation:enter.value,enterDuration:1};const before=structuredClone(clip)
    const t=visualPose(clip,sampleClip(clip,.5,30).transform),pose=paintedPose(clip,t,.5,30)
    if(enter.value==='none')assert.equal(pose.opacity,.7)
    else {assert.equal(sampleMediaAnimation(clip,0).opacity,0);assert.ok(pose.opacity>0 && pose.opacity<.7)}
    assert.equal(sampleMediaAnimation(clip,1).scale,1);assert.equal(sampleMediaAnimation(clip,1).opacity,1);assert.equal(sampleMediaAnimation(clip,1).y,0)
    assert.deepEqual(clip,before)
  }
  for(const exit of MEDIA_EXIT_ANIMATIONS.filter(a=>a.value!=='none')){
    const clip=createImageClip({id:'a'});clip.animation={exitAnimation:exit.value,exitDuration:1}
    assert.equal(sampleMediaAnimation(clip,4).opacity,1);assert.equal(sampleMediaAnimation(clip,5).opacity,0)
  }
})
test('短片段压缩时长，零时长立刻完成，源偏移及帧率参与采样',()=>{
  const clip=createVideoClip({id:'v'},0,.2);clip.animation={enterAnimation:'fade',exitAnimation:'fade',enterDuration:10,exitDuration:10}
  assert.equal(sampleMediaAnimation(clip,.1,60).opacity,1)
  for(const time of [0,.05,.1,.15,.2])assert.ok(Number.isFinite(sampleMediaAnimation(clip,time,60).opacity))
  clip.animation.enterDuration=0;clip.animation.exitDuration=0;assert.equal(sampleMediaAnimation(clip,0).opacity,1)
  clip.duration=5;clip.offset=.5;clip.animation={enterAnimation:'slide-up',enterDuration:1}
  for(const fps of [24,30,60])assert.deepEqual(sampleMediaAnimation(clip,0,fps),sampleMediaAnimation({...clip,offset:0},.5,fps))
})
test('连续切割与切割计划逐帧保留原动画，复制和工程读回不重播右半段',()=>{
  for(const create of [createImageClip,createVideoClip]){
    const clip=create({id:'media',width:800,height:400},2,5);clip.animation={enterAnimation:'slide-up',exitAnimation:'zoom',enterDuration:2,exitDuration:1}
    const original=structuredClone(clip),right=splitClip(clip,3),last=splitClip(right,5)
    for(let frame=0;frame<150;frame++){const time=2+frame/30,part=time<3?clip:time<5?right:last;assert.deepEqual(sampleMediaAnimation(part,time),sampleMediaAnimation(original,time))}
    const p=createProject();p.imageClips=[clip,right,last];const read=readProject(JSON.parse(JSON.stringify(p)),[])
    assert.equal(read.imageClips[1].mediaAnimationEnd,5);assert.deepEqual(sampleMediaAnimation(read.imageClips[1],4),sampleMediaAnimation(original,4))
    const pasted=planClipPaste([],copyClips([last],[last.id],30),0,10,30).clips[0];assert.equal(pasted.mediaAnimationEnd,5);assert.equal(pasted.animation.exitAnimation,'zoom')
    const plan=planClipSplit([original],[original.id],3);assert.equal(plan.left[0].mediaAnimationEnd,5);assert.equal(plan.right[0].mediaAnimationEnd,5)
    assert.equal(original.mediaAnimationEnd,undefined)
  }
})
test('按实际动画位置和旋转非等比缩放命中，透明片段不遮挡下层',()=>{
  const front=createImageClip({id:'front',width:100,height:40}),back=createImageClip({id:'back',width:800,height:400},0,5,1)
  front.animation={enterAnimation:'slide-up',enterDuration:1};front.transform.rotation=90;front.transform.scaleY=2
  const poseAt=c=>visualPose(c,c.transform),moving=paintedPose(front,poseAt(front),.1,30)
  assert.ok(moving.x<0);assert.ok(Math.abs(moving.y)<1e-8)
  assert.equal(hitSceneClip([front,back],poseAt,{x:moving.x,y:0},.1,30),front)
  assert.equal(hitSceneClip([front,back],poseAt,{x:0,y:0},0,30),back)
})
test('动画配置和清除各一步撤销，保留裁剪、翻转、调色和时间',()=>{
  let clip=createImageClip({id:'a'});clip.crop={x:.25,y:0,width:.75,height:1};clip.flipX=true;clip.adjustments={brightness:1.2,contrast:1,saturation:0}
  const before=structuredClone(clip),history=createEditHistory({capture:()=>({project:structuredClone(clip)}),restore:s=>{clip=structuredClone(s.project)}})
  history.edit(()=>{clip.animation=normalizeMediaAnimation({enterAnimation:'fade'})});history.edit(()=>{clip.animation=normalizeMediaAnimation()})
  history.undo();assert.equal(clip.animation.enterAnimation,'fade');history.undo();assert.deepEqual(clip,before)
})
