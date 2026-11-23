import test from 'node:test'
import assert from 'node:assert/strict'
import {createTextClip,createImageClip} from '../src/mediaTracks.js'
import {selectedTextClips,textClipsOnTrack,mixedTextFields,patchTextStyles} from '../src/textBatchStyle.js'
import {createEditHistory} from '../src/editHistory.js'
import {createProject,readProject,setClipKeyframe} from '../src/sceneProject.js'
import {applyTextPreset} from '../src/textPresets.js'
import {buildTextBatch} from '../src/subtitleImport.js'

test('多选只取文字，整轨选择包含播放头以外的片段并排除其他媒体',()=>{
  const a=createTextClip(0,2,0),b=createTextClip(10,2,0),c=createTextClip(0,2,1),image=createImageClip({id:'img'},0,5,0)
  assert.deepEqual(textClipsOnTrack([a,b,c,image],0),[a,b])
  assert.deepEqual(selectedTextClips([a,b,c,image],[a.id,image.id,a.id],c.id),[a])
  assert.deepEqual(selectedTextClips([a,b,c,image],[],c.id),[c])
})
test('修改单项只统一该字段，保留正文、名称、说话人、位置、关键帧及其余样式',()=>{
  const a=createTextClip(0,2,0),b=applyTextPreset(createTextClip(5,3,1),'dialogue-light')
  a.text='第一句';b.speaker='灯';a.textStyle.color='#ff0000';setClipKeyframe(b,'@x',30,12)
  const before=structuredClone([a,b]);assert.ok(mixedTextFields([a,b]).includes('color'))
  patchTextStyles([a,b],{fontSize:36,unknown:'ignore',text:'不能覆盖'})
  for(let i=0;i<2;i++){
    const expected=before[i];expected.textStyle.fontSize=36
    assert.deepEqual([a,b][i],expected)
  }
  assert.ok(!mixedTextFields([a,b]).includes('fontSize'))
})
test('任一目标锁定则整批拒绝，没有文字或没有已知字段时不修改',()=>{
  const a=createTextClip(),b=createTextClip();b.layerLocked=true
  const before=structuredClone([a,b])
  assert.throws(()=>patchTextStyles([a,b],{color:'#ff0000'}),/锁定/)
  assert.deepEqual([a,b],before)
  assert.equal(patchTextStyles([],{fontSize:30}),false)
  assert.equal(patchTextStyles([a],{text:'无效'}),false)
})
test('连续输入一次手势，整批一步撤销重做且样式可随工程读回',()=>{
  let p=createProject();p.imageClips=[createTextClip(),createTextClip(5)]
  const before=structuredClone(p)
  const history=createEditHistory({capture:()=>({project:structuredClone(p)}),restore:s=>{p=s.project}})
  history.begin();for(const size of [30,35,40])history.edit(()=>patchTextStyles(p.imageClips,{fontSize:size}));history.end()
  const restored=readProject(JSON.parse(JSON.stringify(p)),[]);assert.deepEqual(restored.imageClips.map(c=>c.textStyle.fontSize),[40,40])
  history.undo();assert.deepEqual(p,before);assert.equal(history.canUndo,false)
  history.redo();assert.deepEqual(p.imageClips.map(c=>c.textStyle.fontSize),[40,40])
})
test('自定义预设可用于新片段与字幕批量生成，样式独立复制',()=>{
  const custom=[{id:'custom:test',name:'测试对白',text:'请输入对白',speaker:'说话人',style:{fontFamily:'Long Cang',layout:'dialogue',fontSize:30,color:'#ff0000'}}]
  const a=applyTextPreset(createTextClip(),custom[0].id,undefined,custom)
  const added=buildTextBatch({entries:[{text:'实际字幕',start:1,duration:2,track:0,layer:{}}]},{presetId:custom[0].id,customPresets:custom})
  assert.equal(added[0].text,'实际字幕');assert.equal(added[0].textStyle.fontFamily,'Long Cang')
  a.textStyle.color='#ffffff';assert.equal(custom[0].style.color,'#ff0000');assert.equal(added[0].textStyle.color,'#ff0000')
})
