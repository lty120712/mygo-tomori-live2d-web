import test from 'node:test'
import assert from 'node:assert/strict'
import {paintCroppedMedia,fitMediaToCanvas} from '../src/mediaCrop.js'
import {createImageClip,createVideoClip,mediaDimensions,visualPose} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip} from '../src/sceneProject.js'
import {copyClips,planClipPaste} from '../src/clipSelection.js'
import {hitSceneClip} from '../src/canvasHitTest.js'
import {createEditHistory} from '../src/editHistory.js'

test('翻转裁剪后的图片与视频，局部轴翻转不改变源区域或绘制状态',()=>{
  for(const source of [{naturalWidth:800,naturalHeight:400},{videoWidth:800,videoHeight:400}])for(const [flipX,flipY] of [[true,false],[false,true],[true,true]]){
    const calls=[],ctx={save:()=>calls.push('save'),restore:()=>calls.push('restore'),scale:(...args)=>calls.push(['scale',...args]),drawImage:(...args)=>calls.push(['draw',...args])}
    const clip={crop:{x:.25,y:.1,width:.5,height:.8},flipX,flipY},before=structuredClone(clip)
    paintCroppedMedia(ctx,source,clip,{width:400,height:320})
    assert.deepEqual(calls,['save',['scale',flipX?-1:1,flipY?-1:1],['draw',source,200,40,400,320,-200,-160,400,320],'restore'])
    assert.deepEqual(clip,before)
  }
})
test('翻转保留非等比缩放、旋转、命中几何和画布适应的正倍率',()=>{
  for(const create of [createImageClip,createVideoClip]){
    const clip=create({id:'media',width:800,height:400});clip.crop={x:.25,y:0,width:.5,height:1};clip.transform={...clip.transform,x:30,y:40,rotation:45,scaleX:2,scaleY:.5}
    const pose=visualPose(clip,clip.transform),dimensions=mediaDimensions(clip)
    clip.flipX=true;clip.flipY=true
    assert.deepEqual(visualPose(clip,clip.transform),pose);assert.deepEqual(mediaDimensions(clip),dimensions)
    assert.equal(hitSceneClip([clip],()=>pose,{x:30,y:40},0,30),clip)
    assert.equal(hitSceneClip([clip],()=>pose,{x:1500,y:40},0,30),undefined)
    const fit=fitMediaToCanvas(dimensions,{width:540,height:960},'contain').patch
    assert.ok(fit.scale>0 && fit.scaleX>0 && fit.scaleY>0);assert.equal(clip.flipX,true)
  }
})
test('翻转随切割、复制和工程恢复保留，旧工程完整显示，损坏值不当作开启',()=>{
  const p=createProject(),clip=createVideoClip({id:'v',width:800,height:400});clip.flipX=true;clip.flipY=false;clip.crop={x:.25,y:0,width:.75,height:1};p.imageClips=[clip]
  const right=splitClip(clip,2),pasted=planClipPaste([],copyClips([right],[right.id],30),0,10,30).clips[0]
  assert.equal(pasted.flipX,true);assert.equal(pasted.flipY,false);assert.equal(pasted.offset,2);assert.equal(pasted.duration,3)
  p.imageClips.push(right);assert.deepEqual(readProject(JSON.parse(JSON.stringify(p)),[]).imageClips.map(c=>[c.flipX,c.flipY]),[[true,false],[true,false]])
  const old=createImageClip({id:'old',width:400,height:400});p.imageClips=[old];assert.equal(readProject(p,[]).imageClips[0].flipX,undefined)
  old.flipX='false';old.flipY=1;const restored=readProject(p,[]).imageClips[0];assert.equal(restored.flipX,false);assert.equal(restored.flipY,false)
})
test('独立翻转操作一步撤销重做，不覆盖裁剪、关键帧及片段时间',()=>{
  let clip=createImageClip({id:'a',width:800,height:400});clip.crop={x:.25,y:0,width:.75,height:1};clip.keyframes={'@rotation':[{frame:0,value:25,easing:'linear'}]}
  const original=structuredClone(clip),history=createEditHistory({capture:()=>({project:structuredClone(clip)}),restore:s=>{clip=structuredClone(s.project)}})
  history.begin();history.edit(()=>{clip.flipX=true});history.end();history.begin();history.edit(()=>{clip.flipY=true});history.end()
  history.undo();assert.equal(clip.flipX,true);assert.equal(clip.flipY,undefined);history.undo();assert.deepEqual(clip,original)
  history.redo();history.redo();assert.equal(clip.flipX,true);assert.equal(clip.flipY,true);delete clip.flipX;delete clip.flipY;assert.deepEqual(clip,original)
})
