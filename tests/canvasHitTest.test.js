import test from 'node:test'
import assert from 'node:assert/strict'
import {hitSceneClip,paintedPose} from '../src/canvasHitTest.js'
import {createTextClip,createImageClip} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip} from '../src/sceneProject.js'
import {packProject,unpackProject,restoreBundle} from '../src/projectBundle.js'
import {resizeTextBox} from '../src/textBoxTransform.js'

const base={x:0,y:0,scale:1,scaleX:1,scaleY:1,rotation:0,opacity:1,width:200,height:20}
test('滑入文字已离开原命中框时，仍可点击实际绘制位置',()=>{
  const clip=createTextClip();clip.textStyle.enterAnimation='slide-up';clip.textStyle.enterDuration=1
  assert.equal(hitSceneClip([clip],()=>base,{x:0,y:44},.1,30),clip)
  assert.equal(hitSceneClip([clip],()=>base,{x:0,y:0},.1,30),undefined)
})
test('缩放入场的空白区域命中后方图层，透明文字不会挡住其他素材',()=>{
  const text=createTextClip(),image=createImageClip({id:'image'},0,5,1)
  text.textStyle.enterAnimation='zoom';text.textStyle.enterDuration=1
  assert.equal(hitSceneClip([image,text],()=>base,{x:95,y:0},.1,30),image)
  assert.equal(hitSceneClip([image,text],()=>base,{x:0,y:0},.1,30),text)
  assert.equal(hitSceneClip([image,text],()=>base,{x:0,y:0},0,30),image)
})
test('命中位置按旋转及 Y 轴缩放换算，原变换和关键帧采样不被修改',()=>{
  const clip=createTextClip();clip.textStyle.enterAnimation='slide-up';clip.textStyle.enterDuration=1
  const pose={...base,x:10,y:20,rotation:90,scale:1.5,scaleX:2,scaleY:2}
  const original=structuredClone(pose),painted=paintedPose(clip,pose,.25,60)
  assert.equal(painted.x,10-25.3125*3);assert.ok(Math.abs(painted.y-20)<1e-8)
  assert.equal(hitSceneClip([clip],()=>pose,{x:painted.x,y:painted.y},.25,60),clip)
  assert.deepEqual(pose,original)
  const image=createImageClip({id:'img'});assert.equal(paintedPose(image,pose,.25,60),pose)
})

test('编辑正文、重排框宽和切割后，.tomori 打包恢复保留可点击的动画位置',async()=>{
  const clip=createTextClip();clip.text='开源字体与动画工程回归\n第二行';clip.textStyle={...clip.textStyle,fontFamily:'Long Cang',enterAnimation:'slide-up',enterDuration:1}
  const patch=resizeTextBox(clip,{...base,...clip.transform},{x:0,y:0},{x:-120,y:0})
  clip.textStyle.width=patch.width;Object.assign(clip.transform,{x:patch.x,y:patch.y})
  const right=splitClip(clip,.5),p=createProject();p.imageClips=[clip,right]
  const store={list:async()=>[],blob:async()=>{throw new Error('纯文字不应读取素材')},importFile:async()=>{throw new Error('纯文字不应导入素材')}}
  const bundle=await unpackProject(await packProject(p,store)),restored=readProject(await restoreBundle(bundle,store),[])
  assert.deepEqual(restored.imageClips.map(c=>[c.text,c.textStyle,c.textAnimationEnd]),p.imageClips.map(c=>[c.text,c.textStyle,c.textAnimationEnd]))
  const source=restored.imageClips[1],pose={...base,...source.transform},painted=paintedPose(source,pose,.6,30)
  assert.equal(hitSceneClip([source],()=>pose,{x:painted.x,y:painted.y},.6,30),source)
})
