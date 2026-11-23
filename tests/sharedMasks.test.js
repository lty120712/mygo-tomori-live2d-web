import test from 'node:test'
import assert from 'node:assert/strict'
import {createProject,createClip,readProject,splitClip} from '../src/sceneProject.js'
import {createTextClip,createColorBackgroundClip,createImageBackgroundClip,visualPose,backgroundAtTime,paintBackground,backgroundClipTemplate,createClipFromTemplate} from '../src/mediaTracks.js'
import {normalizeMediaMask} from '../src/mediaMask.js'
import {paintedPose,hitSceneClip} from '../src/canvasHitTest.js'
import {copyClips,planClipPaste} from '../src/clipSelection.js'

const model={category:'builtin',name:'test',entry:'model.json'},mask=normalizeMediaMask({type:'ellipse',x:.1,y:.1,width:.8,height:.8})
test('模型、文字、纯色和图片背景工程读回保留遮罩，旧片段不添加遮罩',()=>{
  const p=createProject();p.clips=[createClip(model)];p.imageClips=[createTextClip()];p.backgroundClips=[createColorBackgroundClip('#ff0000'),createImageBackgroundClip({id:'a'},5,5)]
  for(const clip of [...p.clips,...p.imageClips,...p.backgroundClips])clip.mask=mask
  const restored=readProject(JSON.parse(JSON.stringify(p)),[model]);assert.deepEqual([...restored.clips,...restored.imageClips,...restored.backgroundClips].map(c=>c.mask),[mask,mask,mask,mask])
  delete p.clips[0].mask;delete p.imageClips[0].mask;delete p.backgroundClips[0].mask
  const old=readProject(p,[model]);assert.equal(old.clips[0].mask,undefined);assert.equal(old.imageClips[0].mask,undefined);assert.equal(old.backgroundClips[0].mask,undefined)
})
test('模型和动画文字的遮罩命中按同一局部几何换算，形状外点选下层',()=>{
  for(const front of [createClip(model),createTextClip()]){
    front.mask={type:'ellipse'};front.transform.rotation=30;front.transform.scaleX=1.3;front.transform.scaleY=.7
    if(front.media==='text')front.textStyle.enterAnimation='slide-up'
    const back=createTextClip(0,5,1);back.textStyle.width=1900;back.textStyle.fontSize=200
    const poseAt=c=>visualPose(c,c.transform),pose=paintedPose(front,poseAt(front),.1,30),w=pose.width ?? 320,h=pose.height ?? 510,rad=Math.PI/6
    const world=(x,y)=>({x:pose.x+x*1.3*Math.cos(rad)-y*.7*Math.sin(rad),y:pose.y+x*1.3*Math.sin(rad)+y*.7*Math.cos(rad)})
    assert.equal(hitSceneClip([front,back],poseAt,world(0,0),.1,30),front)
    assert.notEqual(hitSceneClip([front,back],poseAt,world(w*.48,h*.48),.1,30),front)
  }
})
test('模型文字切割复制携带独立遮罩；背景模板复制不丢遮罩且不共享对象',()=>{
  for(const clip of [createClip(model),createTextClip()]){
    clip.mask=structuredClone(mask);const right=splitClip(clip,2),copy=planClipPaste([],copyClips([right],[right.id],30),0,10,30).clips[0]
    assert.deepEqual(copy.mask,mask);copy.mask.x=.3;assert.equal(clip.mask.x,.1)
  }
  const bg=createColorBackgroundClip('#ff0000');bg.mask=structuredClone(mask)
  const right=splitClip(bg,2),template=backgroundClipTemplate(right),copy=createClipFromTemplate(template,5)
  assert.deepEqual(copy.mask,mask);assert.equal(copy.duration,3);copy.mask.x=.3;assert.equal(template.mask.x,.1);template.mask.x=.2;assert.equal(bg.mask.x,.1)
})
test('背景遮罩先画场景兜底再在画布坐标内裁剪，纯色及图片共用流程',()=>{
  for(const bg of [createColorBackgroundClip('#ff0000'),createImageBackgroundClip({id:'a'})]){
    bg.mask=mask;const background=backgroundAtTime([bg],{color:'#00ff00'},1),calls=[],ctx={fillStyle:'',fillRect(){calls.push(['fill',this.fillStyle])},drawImage:image=>calls.push(['image',image]),save:()=>calls.push('save'),restore:()=>calls.push('restore'),translate:(...v)=>calls.push(['translate',...v]),beginPath(){},ellipse:(...v)=>calls.push(['ellipse',...v]),clip:()=>calls.push('clip')}
    assert.deepEqual(background.mask,mask)
    paintBackground(ctx,background,{width:960,height:540,bitmap:'bitmap',legacyImage:'legacy',fallback:'#00ff00',baseBackground:{kind:'legacy-image'}})
    assert.deepEqual(calls.slice(0,2),[['fill','#00ff00'],['image','legacy']]);assert.ok(calls.indexOf('clip')<calls.findIndex(v=>Array.isArray(v) && (v[0]==='fill' && v[1]==='#ff0000' || v[0]==='image' && v[1]==='bitmap')));assert.equal(calls.at(-1),'restore')
  }
})
test('缺失背景图片回退完整兜底，隐藏背景也不保留遮罩',()=>{
  const bg=createImageBackgroundClip({id:'missing'});bg.mask=mask;const background=backgroundAtTime([bg],{color:'#123456'},1),fills=[],ctx={fillRect(){fills.push(this.fillStyle)}}
  assert.equal(paintBackground(ctx,background,{width:960,height:540,fallback:'#123456'}),'fallback');assert.ok(fills.every(c=>c==='#123456'))
  bg.layerHidden=true;assert.deepEqual(backgroundAtTime([bg],{color:'#123456'},1),{kind:'color',color:'#123456'})
})
