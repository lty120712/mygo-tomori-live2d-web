import test from 'node:test'
import assert from 'node:assert/strict'
import { createImageClip, visualClips, visualClipLimit, appendVisualClips, imageDimensions, visualPose, imageClipVisible } from '../src/mediaTracks.js'
import { createProject, createClip, readProject, sampleClip, setClipKeyframe } from '../src/sceneProject.js'
import { sceneDrawOrder, sceneHitOrder, insertFrontLayer, reorderSceneLayer, setLayerState } from '../src/sceneLayers.js'
import { copyClips, planClipSplit, planClipPaste, planClipMove, applyClipStarts } from '../src/clipSelection.js'
import { changeProjectFps } from '../src/sceneFrameRate.js'
import { modelBounds, snapCanvasPosition } from '../src/canvasPosition.js'
import { beginCanvasTransform, scaleCanvasTransform } from '../src/canvasTransform.js'
import { applyCanvasSelection } from '../src/canvasSelection.js'
import { createEditHistory } from '../src/editHistory.js'
import { createImageSources } from '../src/imageSources.js'

const model = { category: 'tomori', name: 'test' }
const asset = { id: 'picture', name: '透明图片', kind: 'image', width: 800, height: 200 }
const picture = () => createImageClip(asset)

test('图片与模型共享图层顺序，存储保持分离，锁定隐藏覆盖整层', () => {
  const project = createProject(), m = createClip(model), image = picture()
  project.clips.push(m)
  image.track = insertFrontLayer(visualClips(project)); appendVisualClips(project, [image])
  assert.deepEqual(sceneDrawOrder(visualClips(project)), [m,image])
  assert.deepEqual(sceneHitOrder(visualClips(project)), [image,m])
  reorderSceneLayer(visualClips(project), 0, 1)
  assert.deepEqual(sceneDrawOrder(visualClips(project)), [image,m])
  assert.equal(project.clips.length, 1); assert.equal(project.imageClips.length, 1)
  setLayerState(visualClips(project),image.track,{layerLocked:true,layerHidden:true})
  assert.equal(imageClipVisible(image,0),false)
  assert.equal(applyCanvasSelection(visualClips(project),[{id:image.id,patch:{x:20}}],0,30,false),false)
})

test('图片按区间显示，源偏移切割后保留关键帧采样结果', () => {
  const image=picture();image.start=1;image.duration=6;image.offset=1
  setClipKeyframe(image,'@x',30,0);setClipKeyframe(image,'@x',210,600)
  assert.equal(imageClipVisible(image,.99),false)
  assert.equal(imageClipVisible(image,1),true)
  assert.equal(imageClipVisible(image,7),false)
  const plan=planClipSplit([image],[image.id],4)
  assert.equal(plan.right[0].offset,4)
  assert.equal(sampleClip(plan.right[0],5,30).transform.x,sampleClip(image,5,30).transform.x)
  assert.equal(plan.left[0].duration,3)
})

test('混合片段复制跨帧率，保留类型、宽高、相对层级与缓动', () => {
  const image=picture(),m=createClip(model,1,4,1)
  setClipKeyframe(image,'@opacity',30,.5)
  image.keyframes['@opacity'][0].easing='easeIn'
  const copied=copyClips([image,m],[image.id,m.id],30)
  const plan=planClipPaste([m],copied,4,10,60)
  assert.equal(plan.error,undefined)
  assert.equal(plan.clips[0].assetId,asset.id)
  assert.equal(plan.clips[0].width,800)
  assert.equal(plan.clips[0].keyframes['@opacity'][0].frame,60)
  assert.equal(plan.clips[0].keyframes['@opacity'][0].easing,'easeIn')
  assert.equal(plan.clips[1].start,5)
  assert.equal(plan.clips[1].track,1)
  assert.notEqual(plan.clips[0].id,image.id)
  assert.ok(planClipPaste([],copied,8,10,60).error)
})

test('图片和模型分别计数，混合切割超限时整批拒绝', () => {
  const models=Array.from({length:16},()=>createClip(model)),images=Array.from({length:64},picture)
  assert.equal(visualClipLimit([...models,...images]),'')
  assert.match(visualClipLimit([...models,createClip(model)]),/16/)
  assert.match(planClipSplit([...models,...images],[images[0].id],2).error,/64/)
  assert.ok(planClipSplit([...models,picture()],[models[0].id],2).error)
})

test('图片移动与模型边界吸附，同轨重叠与越界移动不生效', () => {
  const image=picture(),m=createClip(model,6,2,1)
  const plan=planClipMove([image,m],[image],.98,{duration:10,fps:30,targets:[6],tolerance:.1})
  assert.equal(plan.delta,1);assert.equal(plan.snapTime,6)
  assert.equal(applyClipStarts([image,m],plan.entries,10,30),true)
  m.track=0
  assert.equal(applyClipStarts([image,m],[{id:image.id,start:2}],10,30),false)
  assert.equal(image.start,1)
})

test('图片宽高决定旋转外框、吸附和固定对角缩放', () => {
  const image=picture(),pose=visualPose(image,image.transform)
  assert.deepEqual(imageDimensions(image),{width:800,height:200})
  assert.deepEqual(imageDimensions({...image,width:2400,height:600}),{width:960,height:240})
  assert.deepEqual(modelBounds(pose),{x:[-400,0,400],y:[-100,0,100]})
  const rotated=modelBounds({...pose,rotation:90})
  assert.ok(Math.abs(rotated.x[2]-100)<1e-6)
  const snapped=snapCanvasPosition(pose,{x:75,y:17},[],8)
  assert.equal(snapped.position.x,80)
  const drag=beginCanvasTransform(pose,{x:400,y:100},'se')
  const result=scaleCanvasTransform(drag,{x:1200,y:300})
  assert.deepEqual(result,{scale:2,x:400,y:100})
  assert.equal(result.x-400*result.scale,drag.anchor.x)
})

test('图片工程往返不依赖素材库，关键帧与图片尺寸保存，FPS 同步转换', () => {
  const p=createProject(),image=picture();p.imageClips.push(image)
  image.offset=2;image.layerHidden=true;image.track=32
  setClipKeyframe(image,'@rotation',30,45)
  image.keyframes['@rotation'][0].easing={type:'bezier',points:[.2,.3,.8,.9]}
  const parsed=readProject(JSON.parse(JSON.stringify(p)),[]),restored=parsed.imageClips[0]
  assert.deepEqual({...restored,id:image.id},image)
  assert.equal(changeProjectFps(parsed,30,60),60)
  assert.equal(restored.keyframes['@rotation'][0].frame,60)
  assert.equal(restored.offset,2)
})

test('v4 拒绝无效图片列表，清理非变换关键帧与非法数值', () => {
  assert.throws(()=>readProject({...createProject(),imageClips:{}},[]),/列表/)
  assert.throws(()=>readProject({...createProject(),imageClips:[null]},[]),/引用/)
  assert.throws(()=>readProject({...createProject(),imageClips:Array.from({length:65},picture)},[]),/64/)
  const image=picture();image.transform.scale=100
  image.keyframes={ParamAngleX:[{frame:0,value:20}], '@opacity':[null,{frame:0,value:8},{frame:-1,value:0},{frame:1,value:NaN}]}
  const p=readProject({...createProject(),imageClips:[image]},[])
  assert.equal(p.imageClips[0].transform.scale,5)
  assert.deepEqual(p.imageClips[0].keyframes,{'@opacity':[{frame:0,value:1,easing:'linear'}]})
})

test('混合图层变换和排序一次撤销恢复，重做保留图片数据', () => {
  let p=createProject();p.clips.push(createClip(model));p.imageClips.push(picture());p.imageClips[0].track=1
  const before=structuredClone(p)
  const history=createEditHistory({capture:()=>({project:structuredClone(p)}),restore:s=>{p=structuredClone(s.project)}})
  history.begin()
  history.edit(()=>applyCanvasSelection(visualClips(p),[{id:p.imageClips[0].id,patch:{x:70,scale:2}}],1,30,true))
  history.edit(()=>reorderSceneLayer(visualClips(p),1,0))
  history.end();history.undo();assert.deepEqual(p,before)
  history.redo();assert.equal(p.imageClips[0].track,0);assert.equal(p.imageClips[0].keyframes['@x'][0].value,70)
})

const flush=()=>new Promise(resolve=>setImmediate(resolve))
test('图片解码复用、缺失标记和释放；失败不阻塞其他图片', async () => {
  let decodes=0,closed=0
  const cache=createImageSources({blob:async id=>id==='missing' ? null : new Blob(['image']),decode:async()=>{decodes++;return {close(){closed++}}}})
  cache.sync(['a','a','missing']);await flush()
  assert.equal(decodes,1);assert.equal(cache.status('a'),'ready');assert.equal(cache.status('missing'),'missing')
  cache.sync(['a']);assert.equal(decodes,1)
  cache.destroy();assert.equal(closed,1);assert.equal(cache.get('a'),undefined)
})

test('已删除图片的异步结果及时释放，不覆盖同 ID 的新请求', async () => {
  const resolvers=[];let closed=0
  const cache=createImageSources({blob:async()=>new Blob(['image']),decode:()=>new Promise(resolve=>resolvers.push(resolve))})
  cache.sync(['a']);await flush();cache.sync([]);cache.sync(['a']);await flush()
  resolvers[0]({close(){closed++}});await flush()
  assert.equal(cache.status('a'),'loading');assert.equal(closed,1)
  resolvers[1]({close(){closed++}});await flush()
  assert.equal(cache.status('a'),'ready');cache.destroy();assert.equal(closed,2)
})
