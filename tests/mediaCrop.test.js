import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeMediaCrop,cropEdges,cropWithEdge,paintCroppedMedia,fitMediaToCanvas} from '../src/mediaCrop.js'
import {createImageClip,createVideoClip,createTextClip,mediaDimensions,visualPose} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip,sampleClip,setClipKeyframe} from '../src/sceneProject.js'
import {copyClips,planClipPaste} from '../src/clipSelection.js'
import {applyCanvasSelection} from '../src/canvasSelection.js'
import {packProject,unpackProject,restoreBundle} from '../src/projectBundle.js'
import {createAssetStore,memoryBackend} from '../src/assetStore.js'

test('默认无裁剪，损坏及越界配置被限制在源画面内，至少保留 1%',()=>{
  assert.deepEqual(normalizeMediaCrop(),{x:0,y:0,width:1,height:1})
  assert.deepEqual(normalizeMediaCrop(null),{x:0,y:0,width:1,height:1})
  const c=normalizeMediaCrop({x:99,y:-4,width:99,height:NaN})
  assert.equal(c.x,.99);assert.equal(c.y,0);assert.ok(c.x+c.width<=1);assert.equal(c.height,1)
})
test('修改一侧边距保留对侧，输入过量时夹紧，不改变源数据',()=>{
  const original={x:.1,y:.2,width:.7,height:.5},before=structuredClone(original)
  const next=cropWithEdge(original,'left',25),edges=cropEdges(next)
  assert.ok(Math.abs(edges.left-.25)<1e-8);assert.ok(Math.abs(edges.right-.2)<1e-8)
  const limit=cropWithEdge(original,'left',1000)
  assert.ok(Math.abs(limit.width-.01)<1e-8);assert.deepEqual(original,before)
})
test('图片与视频共用裁剪几何，文字不受裁剪字段影响，旧素材尺寸保持',()=>{
  const img=createImageClip({id:'a',width:1600,height:800}),video=createVideoClip({id:'v',width:1600,height:800})
  assert.deepEqual(mediaDimensions(img),{width:960,height:480})
  for(const clip of [img,video]){clip.crop={x:.25,y:0,width:.5,height:1};assert.deepEqual(mediaDimensions(clip),{width:480,height:480});assert.equal(visualPose(clip,clip.transform).width,480)}
  const text=createTextClip(),dimensions=mediaDimensions(text);text.crop={width:.01,height:.01};assert.deepEqual(mediaDimensions(text),dimensions)
})
test('绘制按真实图片或视频尺寸取源区域，缩小目标且不拉伸',()=>{
  const calls=[],ctx={drawImage:(...args)=>calls.push(args)},clip={width:800,height:400,crop:{x:.25,y:.1,width:.5,height:.8}}
  const dimensions={width:400,height:320},image={naturalWidth:1600,naturalHeight:800},video={videoWidth:1600,videoHeight:800}
  for(const source of [image,video]){paintCroppedMedia(ctx,source,clip,dimensions);assert.deepEqual(calls.at(-1),[source,400,80,800,640,-200,-160,400,320])}
})
test('完整显示与铺满画布保持比例，支持横竖画布，并处理缩放范围',()=>{
  const dimensions={width:800,height:400},canvas={width:540,height:960}
  const contain=fitMediaToCanvas(dimensions,canvas,'contain').patch,cover=fitMediaToCanvas(dimensions,canvas,'cover').patch
  assert.equal(contain.scale,.675);assert.equal(cover.scale,2.4)
  assert.equal(cover.scaleX,cover.scaleY);assert.equal(cover.rotation,0);assert.equal(cover.x,0)
  const small=fitMediaToCanvas({width:50,height:50},{width:960,height:540},'cover').patch
  assert.equal(small.scale*small.scaleX,19.2)
  assert.match(fitMediaToCanvas({width:1,height:1},canvas,'cover').error,/缩放范围/)
})
test('适应操作沿用当前变换关键帧规则，保留其它帧及片段时间',()=>{
  const clip=createImageClip({id:'pic',width:800,height:400});setClipKeyframe(clip,'@scale',0,1);setClipKeyframe(clip,'@scale',60,2)
  const patch=fitMediaToCanvas(mediaDimensions(clip),{width:540,height:960},'cover').patch
  assert.equal(applyCanvasSelection([clip],[{id:clip.id,patch}],1,30,false),true)
  assert.equal(sampleClip(clip,1,30).transform.scale,2.4)
  assert.equal(clip.keyframes['@scale'].length,3);assert.equal(clip.duration,5)
})
test('裁剪随切割、复制粘贴和 .tomori 真实素材打包恢复，素材文件未被改写',async()=>{
  const store=createAssetStore(memoryBackend(),{probeImage:async()=>({width:800,height:400})})
  const asset=await store.importFile(new File(['original bytes'],'a.png',{type:'image/png'}))
  const clip=createImageClip(asset),crop={x:.2,y:.1,width:.6,height:.8};clip.crop=crop;clip.flipX=true;clip.adjustments={brightness:1.2,contrast:.8,saturation:0};clip.animation={enterAnimation:'fade',exitAnimation:'zoom',enterDuration:1,exitDuration:1}
  const right=splitClip(clip,2),pasted=planClipPaste([],copyClips([right],[right.id],30),0,10,30).clips[0]
  assert.deepEqual(pasted.crop,crop);pasted.crop.x=.1;assert.equal(clip.crop.x,.2)
  const p=createProject();p.imageClips=[clip,right]
  const bundle=await unpackProject(await packProject(p,store)),target=createAssetStore(memoryBackend(),{probeImage:async()=>({width:800,height:400})})
  const restored=readProject(await restoreBundle(bundle,target),[])
  assert.deepEqual(restored.imageClips.map(c=>c.crop),[crop,crop]);assert.equal(await (await target.blob(restored.imageClips[0].assetId)).text(),'original bytes')
  assert.deepEqual(restored.imageClips.map(c=>c.adjustments),[clip.adjustments,clip.adjustments]);assert.ok(restored.imageClips.every(c=>c.flipX===true))
  assert.deepEqual(restored.imageClips.map(c=>c.animation),[clip.animation,clip.animation]);assert.ok(restored.imageClips.every(c=>c.mediaAnimationEnd===5))
})
