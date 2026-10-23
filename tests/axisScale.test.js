import test from 'node:test'
import assert from 'node:assert/strict'
import {beginCanvasTransform,scaleCanvasTransform,scaleCanvasAxis} from '../src/canvasTransform.js'
import {scaleX,scaleY} from '../src/visualScale.js'
import {modelBounds,snapCanvasPosition} from '../src/canvasPosition.js'
import {createProject,createClip,readProject,sampleClip,setClipKeyframe} from '../src/sceneProject.js'
import {createTextClip,createImageClip,createVideoClip} from '../src/mediaTracks.js'
import {applyCanvasSelection} from '../src/canvasSelection.js'
import {copyClips,planClipPaste,planClipSplit} from '../src/clipSelection.js'
import {numericDisplay} from '../src/numericDisplay.js'
import {sceneMouseParams} from '../src/sceneMouseTracking.js'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
const rotate=(x,y,degrees)=>{const a=degrees*Math.PI/180;return {x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)}}
const pose={x:40,y:-12,width:200,height:100,rotation:37,scale:1.5,scaleX:1.3,scaleY:.8}
test('四边单轴拖动固定对侧，旋转和点击偏移不导致跳动，垂直于拖动轴的移动不改变尺寸',()=>{
  for(const edge of ['n','s','e','w']){
    const axis=['e','w'].includes(edge) ? 'x' : 'y',key=axis==='x' ? 'scaleX' : 'scaleY'
    const point={x:13,y:9},drag=beginCanvasTransform(pose,point,edge),unchanged=scaleCanvasAxis(drag,point,axis)
    near(unchanged.x,pose.x);near(unchanged.y,pose.y);near(unchanged[key],pose[key])
    const distance=2*drag.local[axis]*pose.scale*(2.1-pose[key]),delta=rotate(axis==='x' ? distance : 0,axis==='y' ? distance : 0,pose.rotation)
    const result=scaleCanvasAxis(drag,{x:point.x+delta.x,y:point.y+delta.y},axis)
    near(result[key],2.1);assert.equal(result[axis==='x' ? 'scaleY' : 'scaleX'],undefined)
    const vector=rotate(axis==='x' ? drag.local.x*result[key] : 0,axis==='y' ? drag.local.y*result[key] : 0,pose.rotation)
    near(result.x-vector.x*pose.scale,drag.anchor.x);near(result.y-vector.y*pose.scale,drag.anchor.y)
    const perpendicular=rotate(axis==='y' ? 50 : 0,axis==='x' ? 50 : 0,pose.rotation)
    near(scaleCanvasAxis(drag,{x:point.x+perpendicular.x,y:point.y+perpendicular.y},axis)[key],pose[key])
  }
})
test('单轴遵守倍率下限不翻转，角点等比缩放保留已经拉伸的比例',()=>{
  const drag=beginCanvasTransform({...pose,rotation:0},{x:0,y:0},'e')
  assert.equal(scaleCanvasAxis(drag,{x:-1e6,y:0},'x').scaleX,.1)
  assert.equal(scaleCanvasAxis(drag,{x:1e6,y:0},'x').scaleX,5)
  const corner=beginCanvasTransform(pose,{x:0,y:0},'se')
  const patch=scaleCanvasTransform(corner,{x:2*corner.vector.x*pose.scale,y:2*corner.vector.y*pose.scale})
  near(patch.scale,pose.scale*2)
  near(scaleX({...pose,...patch})/scaleY({...pose,...patch}),scaleX(pose)/scaleY(pose))
})
test('旋转后的非等比外框与吸附使用真实宽高',()=>{
  const p={...pose,x:0,y:0,rotation:90,scale:2,scaleX:3,scaleY:.5},bounds=modelBounds(p)
  near(bounds.x[2],50);near(bounds.y[2],600)
  const result=snapCanvasPosition({...p,rotation:0},{x:125,y:0},[],8,false,{width:1460,height:2000})
  near(result.position.x,130)
})
test('模型、图片、视频、文字的轴缩放与关键帧保存读回，旧数据回退等比效果',()=>{
  const model={category:'test',name:'model'},p=createProject();p.duration=10
  p.clips=[createClip(model)];p.imageClips=[createImageClip({id:'i'}),createVideoClip({id:'v'}),createTextClip()]
  for(const c of [...p.clips,...p.imageClips]){
    c.transform.scale=1.5;c.transform.scaleY=.6
    setClipKeyframe(c,'@scaleX',0,1);setClipKeyframe(c,'@scaleX',30,2)
  }
  const read=readProject(JSON.parse(JSON.stringify(p)),[model])
  for(const c of [...read.clips,...read.imageClips]){const t=sampleClip(c,.5,30).transform;near(scaleX(t),2.25);near(scaleY(t),.9)}
  const legacy=createProject();legacy.imageClips=[createTextClip()];delete legacy.imageClips[0].transform.scaleX;delete legacy.imageClips[0].transform.scaleY;legacy.imageClips[0].transform.scale=2
  const t=readProject(legacy,[]).imageClips[0].transform;near(scaleX(t),2);near(scaleY(t),2)
})
test('单轴动画随复制、切割保持源时间，画布编辑遵守锁定且写入正确关键帧',()=>{
  const c=createTextClip();setClipKeyframe(c,'@scaleX',0,1);setClipKeyframe(c,'@scaleX',120,3)
  const right=planClipSplit([c],[c.id],2).right[0];near(sampleClip(right,2,30).transform.scaleX,2)
  const pasted=planClipPaste([],copyClips([right],[right.id],30),0,10,30).clips[0];near(sampleClip(pasted,0,30).transform.scaleX,2)
  assert.ok(applyCanvasSelection([c],[{id:c.id,patch:{scaleX:2.5,x:30}}],1,30,false))
  assert.equal(c.keyframes['@scaleX'].find(k=>k.frame===30).value,2.5)
  assert.equal(c.transform.scaleY,1);c.layerLocked=true
  assert.equal(applyCanvasSelection([c],[{id:c.id,patch:{scaleY:2}}],1,30,true),false)
})
test('轴倍率以百分比编辑，模型鼠标跟随按各轴实际大小归一化',()=>{
  for(const key of ['@scaleX','@scaleY']){const display=numericDisplay(key,{min:.1,max:5,step:.01});assert.equal(display.toDisplay(1.5),150);assert.equal(display.toNative(75),.75)}
  const groups=[{params:[{key:'ParamAngleX',min:-30,max:30,default:0},{key:'ParamEyeBallX',min:-1,max:1,default:0}]}]
  const values=sceneMouseParams({keyframes:{}},{x:160,y:0},{x:0,y:0,rotation:0,scale:2,scaleX:2,scaleY:1},groups)
  near(values.ParamEyeBallX,.25);near(values.ParamAngleX,3.75)
})
