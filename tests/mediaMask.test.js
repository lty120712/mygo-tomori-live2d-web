import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeMediaMask,mediaMaskGeometry,pointInMediaMask} from '../src/mediaMask.js'
import {paintCroppedMedia} from '../src/mediaCrop.js'
import {createImageClip,createVideoClip,mediaDimensions,visualPose} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip} from '../src/sceneProject.js'
import {hitSceneClip,paintedPose} from '../src/canvasHitTest.js'
import {copyClips,planClipPaste} from '../src/clipSelection.js'
import {packProject,unpackProject,restoreBundle} from '../src/projectBundle.js'
import {createAssetStore,memoryBackend} from '../src/assetStore.js'
import {createEditHistory} from '../src/editHistory.js'

test('旧工程无外观变化，损坏遮罩回退且范围保留至少 1%',()=>{
  assert.equal(normalizeMediaMask().type,'none');assert.equal(mediaMaskGeometry(null,{width:800,height:400}),null)
  assert.equal(normalizeMediaMask({type:'bad'}).type,'none')
  const mask=normalizeMediaMask({type:'rounded',x:99,y:-2,width:99,height:0,radius:99,unknown:true})
  assert.equal(mask.x,.99);assert.equal(mask.y,0);assert.ok(mask.x+mask.width<=1);assert.equal(mask.height,.01);assert.equal(mask.radius,.5);assert.equal(mask.unknown,undefined)
  assert.equal(normalizeMediaMask({x:'0.2',radius:NaN}).x,0)
})
test('三种形状共用裁剪后局部几何，圆角和椭圆透明角不命中',()=>{
  const size={width:800,height:400},base={x:.25,y:.25,width:.5,height:.5}
  assert.deepEqual(mediaMaskGeometry({...base,type:'rounded',radius:.5},size),{type:'rounded',x:-200,y:-100,width:400,height:200,radius:100})
  for(const type of ['rect','rounded','ellipse']){
    const mask={...base,type,radius:.5}
    assert.equal(pointInMediaMask(mask,size,0,0),true);assert.equal(pointInMediaMask(mask,size,200,0),true)
    assert.equal(pointInMediaMask(mask,size,201,0),false);assert.equal(pointInMediaMask(mask,size,-199,-99),type==='rect')
  }
  assert.equal(pointInMediaMask({type:'rounded',radius:0},size,-399,-199),true)
})
test('图片和视频先建立遮罩再翻转、调色，绘制完恢复裁剪状态',()=>{
  for(const source of [{naturalWidth:800,naturalHeight:400},{videoWidth:800,videoHeight:400}])for(const type of ['rect','rounded','ellipse']){
    const calls=[],ctx={save:()=>calls.push('save'),restore:()=>calls.push('restore'),beginPath:()=>calls.push('begin'),rect:(...args)=>calls.push(['rect',...args]),roundRect:(...args)=>calls.push(['rounded',...args]),ellipse:(...args)=>calls.push(['ellipse',...args]),clip:()=>calls.push('clip'),scale:(...args)=>calls.push(['scale',...args]),drawImage:(...args)=>calls.push(['draw',...args])}
    const clip={crop:{x:.25,y:0,width:.75,height:1},mask:{type,x:.25,y:0,width:.5,height:1,radius:.5},flipX:true,adjustments:{saturation:0}}
    paintCroppedMedia(ctx,source,clip,{width:600,height:400})
    assert.equal(calls[0],'save');assert.equal(calls[1],'begin');assert.equal(calls[2][0],type)
    assert.deepEqual(calls.slice(3,5),['clip',['scale',-1,1]]);assert.equal(ctx.filter,'brightness(1) contrast(1) saturate(0)')
    assert.deepEqual(calls.at(-2),['draw',source,200,0,600,400,-300,-200,600,400]);assert.equal(calls.at(-1),'restore')
    if(type!=='ellipse')assert.deepEqual(calls[2].slice(1,5),[-150,-200,300,400])
    else assert.deepEqual(calls[2].slice(1,5),[0,0,150,200])
  }
})
test('遮罩外命中下层，翻转不镜像偏置遮罩，旋转非等比缩放与动画共用命中',()=>{
  const front=createImageClip({id:'front',width:800,height:400}),back=createImageClip({id:'back',width:1600,height:800},0,5,1)
  front.mask={type:'rect',x:0,y:0,width:.25,height:1};front.flipX=true
  const poseAt=c=>visualPose(c,c.transform)
  assert.equal(hitSceneClip([front,back],poseAt,{x:-300,y:0},1,30),front)
  assert.equal(hitSceneClip([front,back],poseAt,{x:300,y:0},1,30),back)
  front.mask={type:'ellipse',x:.25,y:.25,width:.5,height:.5};front.transform.rotation=30;front.transform.scaleX=1.5;front.transform.scaleY=.5;front.animation={enterAnimation:'slide-up',enterDuration:1}
  const pose=paintedPose(front,poseAt(front),.1,30),angle=pose.rotation*Math.PI/180
  const world=(x,y)=>({x:pose.x+x*1.5*Math.cos(angle)-y*.5*Math.sin(angle),y:pose.y+x*1.5*Math.sin(angle)+y*.5*Math.cos(angle)})
  assert.equal(hitSceneClip([front,back],poseAt,world(0,0),.1,30),front)
  assert.equal(hitSceneClip([front,back],poseAt,world(190,90),.1,30),back)
})
test('遮罩保留几何和时间，复制切割及 .tomori 素材往返保留且互不共享',async()=>{
  const assets=createAssetStore(memoryBackend(),{probeImage:async()=>({width:800,height:400})}),asset=await assets.importFile(new File(['original bytes'],'a.png',{type:'image/png'}))
  const clip=createImageClip(asset),size=mediaDimensions(clip);clip.mask=normalizeMediaMask({type:'ellipse',x:.1,y:.2,width:.8,height:.6})
  const right=splitClip(clip,2),pasted=planClipPaste([],copyClips([right],[right.id],30),0,10,30).clips[0]
  assert.deepEqual(mediaDimensions(clip),size);assert.equal(pasted.duration,3);assert.equal(pasted.offset,2);assert.deepEqual(pasted.mask,clip.mask)
  pasted.mask.x=.3;assert.equal(clip.mask.x,.1)
  const p=createProject();p.imageClips=[clip,right];const bundle=await unpackProject(await packProject(p,assets)),target=createAssetStore(memoryBackend(),{probeImage:async()=>({width:800,height:400})})
  const restored=readProject(await restoreBundle(bundle,target),[])
  assert.deepEqual(restored.imageClips.map(c=>c.mask),[clip.mask,clip.mask]);assert.equal(await (await target.blob(restored.imageClips[0].assetId)).text(),'original bytes')
  const video=createVideoClip(asset);video.mask=normalizeMediaMask({type:'rounded'});p.imageClips=[video];assert.deepEqual(readProject(p,[]).imageClips[0].mask,video.mask)
})
test('连续边距调整一步撤销，重置独立，其他外观和关键帧保持',()=>{
  let clip=createImageClip({id:'a'});clip.flipX=true;clip.animation={enterAnimation:'fade'};clip.keyframes={'@opacity':[{frame:0,value:.5,easing:'linear'}]}
  const before=structuredClone(clip),history=createEditHistory({capture:()=>({project:structuredClone(clip)}),restore:s=>{clip=structuredClone(s.project)}})
  history.begin();for(const x of [.1,.2,.3])history.edit(()=>{clip.mask=normalizeMediaMask({type:'ellipse',x,width:.5})});history.end()
  history.edit(()=>{clip.mask=normalizeMediaMask()});history.undo();assert.equal(clip.mask.x,.3);history.undo();assert.deepEqual(clip,before)
  history.redo();history.redo();assert.equal(clip.mask.type,'none')
})
