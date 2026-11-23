import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeMediaAdjustments,mediaAdjustmentFilter} from '../src/mediaAdjustments.js'
import {paintCroppedMedia} from '../src/mediaCrop.js'
import {createImageClip,createVideoClip,mediaDimensions} from '../src/mediaTracks.js'
import {createProject,readProject,splitClip} from '../src/sceneProject.js'
import {copyClips,planClipPaste} from '../src/clipSelection.js'
import {createEditHistory} from '../src/editHistory.js'

test('调色缺省和损坏值回退原始值，边界保留零值，未知字段不进入工程',()=>{
  const neutral={brightness:1,contrast:1,saturation:1}
  for(const raw of [undefined,null,{},false])assert.deepEqual(normalizeMediaAdjustments(raw),neutral)
  assert.deepEqual(normalizeMediaAdjustments({brightness:-1,contrast:99,saturation:0,other:2}),{brightness:0,contrast:2,saturation:0})
  assert.deepEqual(normalizeMediaAdjustments({brightness:'0',contrast:NaN,saturation:Infinity}),neutral)
  assert.equal(mediaAdjustmentFilter(), 'none')
  assert.equal(mediaAdjustmentFilter({saturation:0}),'brightness(1) contrast(1) saturate(0)')
})
test('图片和视频裁剪翻转后按独立调色绘制，滤镜与变换不泄漏至下一个图层',()=>{
  const stack=[],calls=[],ctx={filter:'none',save(){stack.push(this.filter)},restore(){this.filter=stack.pop()},scale:(...args)=>calls.push(['scale',...args]),drawImage(...args){calls.push({filter:this.filter,args})}}
  for(const source of [{naturalWidth:800,naturalHeight:400},{videoWidth:800,videoHeight:400}]){
    const clip={crop:{x:.25,y:0,width:.75,height:1},flipX:true,adjustments:{brightness:1.2,contrast:.8,saturation:0}}
    paintCroppedMedia(ctx,source,clip,{width:600,height:400})
    const drawn=calls.at(-1);assert.equal(drawn.filter,'brightness(1.2) contrast(0.8) saturate(0)');assert.deepEqual(drawn.args.slice(1),[200,0,600,400,-300,-200,600,400])
    assert.equal(ctx.filter,'none');assert.equal(stack.length,0)
    paintCroppedMedia(ctx,source,{}, {width:800,height:400});assert.equal(calls.at(-1).filter,'none')
  }
})
test('调色不修改素材几何、时间与关键帧，复制切割工程往返保留但互不共享',()=>{
  const p=createProject()
  p.imageClips=[createImageClip({id:'image',width:800,height:400}),createVideoClip({id:'video',width:800,height:400},0,5,1)]
  for(const clip of p.imageClips){
    const size=mediaDimensions(clip);clip.adjustments={brightness:1.4,contrast:.8,saturation:0};clip.flipX=true
    clip.keyframes={'@opacity':[{frame:0,value:.5,easing:'linear'}]}
    const right=splitClip(clip,2),pasted=planClipPaste([],copyClips([right],[right.id],30),0,10,30).clips[0]
    assert.deepEqual(pasted.adjustments,clip.adjustments);assert.equal(pasted.offset,2);assert.equal(pasted.duration,3);assert.deepEqual(mediaDimensions(clip),size)
    pasted.adjustments.brightness=.2;assert.equal(clip.adjustments.brightness,1.4)
  }
  const restored=readProject(JSON.parse(JSON.stringify(p)),[])
  assert.deepEqual(restored.imageClips.map(c=>c.adjustments),p.imageClips.map(c=>c.adjustments))
  assert.equal(restored.imageClips[0].keyframes['@opacity'][0].value,.5)
})
test('多次连续调色仅提交一步撤销，重置独立撤销，重做保留各项',()=>{
  let clip=createImageClip({id:'a',width:800,height:400})
  const history=createEditHistory({capture:()=>({project:structuredClone(clip)}),restore:s=>{clip=structuredClone(s.project)}})
  history.begin();for(const brightness of [1.1,1.2,1.4])history.edit(()=>{clip.adjustments=normalizeMediaAdjustments({brightness})});history.end()
  history.begin();history.edit(()=>{clip.adjustments=normalizeMediaAdjustments()});history.end()
  history.undo();assert.equal(clip.adjustments.brightness,1.4);history.undo();assert.equal(clip.adjustments,undefined);assert.equal(history.canUndo,false)
  history.redo();history.redo();assert.deepEqual(clip.adjustments,normalizeMediaAdjustments())
})
