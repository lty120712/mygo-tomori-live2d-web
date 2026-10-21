import test from 'node:test'
import assert from 'node:assert/strict'
import { createTextClip, createImageClip, createVideoClip, isMediaClip, isImageClip, visualClipLimit, visualPose } from '../src/mediaTracks.js'
import { isTextClip, normalizeTextStyle, normalizeText, layoutText } from '../src/textTracks.js'
import { createProject, readProject, setClipKeyframe, sampleClip } from '../src/sceneProject.js'
import { copyClips, planClipSplit, planClipPaste } from '../src/clipSelection.js'
import { projectAssetIds, packProject, unpackProject, restoreBundle } from '../src/projectBundle.js'

test('文字是独立视觉片段，不占图片/模型数量，也不需要素材文件',()=>{
  const text=createTextClip(1,5,2)
  assert.ok(isMediaClip(text));assert.ok(isTextClip(text));assert.equal(isImageClip(text),false)
  assert.equal(text.assetId,undefined);assert.equal(visualClipLimit(Array.from({length:33},()=>createTextClip())),'单个工程最多 32 个文字片段')
  assert.equal(visualClipLimit([text,...Array.from({length:64},()=>createImageClip({id:'pic'}))]),'')
})
test('文字样式校验限制外部数据，中文换行与自动折行保持内容',()=>{
  const style=normalizeTextStyle({fontFamily:'unknown',fontSize:999,color:'red',width:-1,strokeWidth:-10,shadowBlur:100,align:'evil'})
  assert.equal(style.fontFamily,'sans-serif');assert.equal(style.fontSize,200);assert.equal(style.width,80)
  assert.equal(style.color,'#ffffff');assert.equal(style.strokeWidth,0);assert.equal(style.shadowBlur,30);assert.equal(style.align,'center')
  assert.equal(normalizeText('甲\r\n乙\r丙'),'甲\n乙\n丙')
  assert.equal(normalizeText('a'.repeat(3000)).length,2000)
  const layout=layoutText({text:'你好世界\n第二行',textStyle:{width:80,fontSize:20}},s=>[...s].length*30)
  assert.deepEqual(layout.lines,['你好','世界','第二','行'])
  assert.ok(layout.height>4*20);assert.ok(layout.width>=80)
})
test('文字框几何随字号与内容增长，参与位置和不透明度关键帧采样',()=>{
  const text=createTextClip();text.text='字幕\n第二行';text.textStyle.fontSize=60
  const small=visualPose(text,text.transform)
  text.text+='\n第三行';const large=visualPose(text,text.transform)
  assert.ok(large.height>small.height)
  setClipKeyframe(text,'@opacity',0,0);setClipKeyframe(text,'@opacity',30,1)
  assert.equal(sampleClip(text,.5,30).transform.opacity,.5)
})
test('文字内容样式与混合模式随切割、复制、工程往返保留',()=>{
  const clip=createTextClip();clip.text='中文字幕\n第二行';clip.textStyle={...clip.textStyle,bold:true,shadow:true,color:'#ff8800'};clip.blendMode='screen'
  setClipKeyframe(clip,'@x',30,70)
  const split=planClipSplit([clip],[clip.id],2)
  assert.equal(split.right[0].text,clip.text);assert.equal(split.right[0].offset,2);assert.deepEqual(split.right[0].textStyle,clip.textStyle)
  const pasted=planClipPaste([],copyClips([clip],[clip.id],30),0,10,60).clips[0]
  assert.equal(pasted.keyframes['@x'][0].frame,60);assert.equal(pasted.blendMode,'screen')
  const p=createProject();p.imageClips=[clip,createVideoClip({id:'video'})]
  const read=readProject(JSON.parse(JSON.stringify(p)),[])
  assert.equal(read.imageClips[0].media,'text');assert.equal(read.imageClips[0].text,clip.text)
  assert.deepEqual(read.imageClips[0].textStyle,clip.textStyle);assert.equal(read.imageClips[0].assetId,undefined)
  assert.deepEqual(projectAssetIds(p),['video'])
})
test('纯文字 .tomori 工程无需素材即可打包恢复，过量文字片段被拒绝',async()=>{
  const p=createProject();p.imageClips=[createTextClip()]
  const store={list:async()=>[],blob:async()=>{throw new Error('文字不应读取素材')},importFile:async()=>{throw new Error('文字不应导入素材')}}
  const bundle=await unpackProject(await packProject(p,store))
  const restored=readProject(await restoreBundle(bundle,store),[])
  assert.equal(restored.imageClips[0].text,'请输入文字');assert.deepEqual(bundle.assets,[])
  p.imageClips=Array.from({length:33},()=>createTextClip())
  assert.throws(()=>readProject(p,[]),/32 个文字片段/)
})
test('文字混排超过 80 层后，保存恢复不合并高编号图层',()=>{
  const p=createProject();p.imageClips=[createTextClip(0,5,90),createImageClip({id:'pic'},0,5,91)]
  const restored=readProject(p,[])
  assert.deepEqual(restored.imageClips.map(c=>c.track),[90,91])
})
