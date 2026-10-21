import test from 'node:test'
import assert from 'node:assert/strict'
import { BLEND_MODES, normalizeBlendMode, applyVisualComposite } from '../src/visualComposite.js'
import { createClip, createProject, readProject, sampleClip, setClipKeyframe } from '../src/sceneProject.js'
import { createImageClip, createVideoClip } from '../src/mediaTracks.js'
import { copyClips, planClipSplit, planClipPaste } from '../src/clipSelection.js'
import { createEditHistory } from '../src/editHistory.js'

const model={category:'test',name:'model',entry:'model.json'}
const asset={id:'image',name:'图片',width:100,height:100}
const factories=[()=>createClip(model),()=>createImageClip(asset),()=>createVideoClip(asset)]

test('混合模式采用白名单，旧工程与无效值回退正常混合',()=>{
  for(const mode of BLEND_MODES)assert.equal(normalizeBlendMode(mode.value),mode.value)
  for(const value of [undefined,null,'normal','destination-out',{},'__proto__'])assert.equal(normalizeBlendMode(value),'source-over')
  for(const factory of factories)assert.equal(factory().blendMode,'source-over')
})
test('模型、图片、视频的混合模式和不透明度关键帧随工程恢复',()=>{
  for(const factory of factories){
    const clip=factory(),p=createProject()
    clip.blendMode='multiply';setClipKeyframe(clip,'@opacity',0,0);setClipKeyframe(clip,'@opacity',30,1)
    if(clip.model)p.clips=[clip];else p.imageClips=[clip]
    const restored=readProject(JSON.parse(JSON.stringify(p)),[model])
    const result=(clip.model ? restored.clips : restored.imageClips)[0]
    assert.equal(result.blendMode,'multiply');assert.equal(sampleClip(result,.5,30).transform.opacity,.5)
    clip.blendMode='invalid'
    assert.equal((clip.model ? readProject(p,[model]).clips : readProject(p,[model]).imageClips)[0].blendMode,'source-over')
  }
})
test('视觉片段切割与复制粘贴保留混合模式和关键帧',()=>{
  for(const factory of factories){
    const clip=factory();clip.blendMode='screen';setClipKeyframe(clip,'@opacity',0,.25)
    const split=planClipSplit([clip],[clip.id],2)
    for(const piece of [...split.left,...split.right])assert.equal(piece.blendMode,'screen')
    const pasted=planClipPaste([],copyClips([clip],[clip.id],30),0,10,30)
    assert.equal(pasted.clips[0].blendMode,'screen');assert.equal(pasted.clips[0].keyframes['@opacity'][0].value,.25)
  }
})
test('不透明度取采样值并限定范围，混合模式可一步撤销重做',()=>{
  const context={}
  applyVisualComposite(context,{blendMode:'multiply'},.5)
  assert.equal(context.globalAlpha,.5);assert.equal(context.globalCompositeOperation,'multiply')
  applyVisualComposite(context,{},Infinity);assert.equal(context.globalAlpha,1)
  applyVisualComposite(context,{},-1);assert.equal(context.globalAlpha,0)
  let state={project:{clip:createClip(model)}}
  const history=createEditHistory({capture:()=>structuredClone(state),restore:value=>state=structuredClone(value)})
  history.edit(()=>state.project.clip.blendMode='overlay')
  history.undo();assert.equal(state.project.clip.blendMode,'source-over')
  history.redo();assert.equal(state.project.clip.blendMode,'overlay')
})
