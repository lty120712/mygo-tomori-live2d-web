import test from 'node:test'
import assert from 'node:assert/strict'
import {subtitleRows,patchSubtitleContent,selectSubtitleResults} from '../src/subtitleList.js'
import {createTextClip,createImageClip} from '../src/mediaTracks.js'
import {createProject,readProject,setClipKeyframe} from '../src/sceneProject.js'
import {createEditHistory} from '../src/editHistory.js'

test('字幕列表跨轨按开始时间排序，同时间按轨道再按 ID 排序，不改变源数组',()=>{
  const a=createTextClip(5,2,0),b=createTextClip(1,2,2),c=createTextClip(1,2,0),d=createTextClip(1,2,0)
  c.id='a';d.id='b';const image=createImageClip({id:'img'},0,5,0),clips=[a,b,d,image,c]
  assert.deepEqual(subtitleRows(clips),[c,d,b,a]);assert.deepEqual(clips,[a,b,d,image,c])
})
test('支持正文、说话人、片段和图层搜索及轨道交集筛选，忽略大小写',()=>{
  const a=createTextClip(0,2,0),b=createTextClip(2,2,1)
  a.text='Morning 第一行\n第二行';a.speaker='高松灯';a.name='序章';a.layerName='主字幕'
  b.text='Morning B'
  for(const query of ['morning','高松灯','序章','主字幕','第二行'])assert.ok(subtitleRows([a,b],{query}).includes(a))
  assert.deepEqual(subtitleRows([a,b],{query:'MORNING',track:'1'}),[b])
  assert.deepEqual(subtitleRows([a,b],{query:'没有'}),[])
  assert.deepEqual(subtitleRows([a,b],{query:'  '}),[a,b])
})
test('正在编辑的行保留在搜索结果中，结束编辑后恢复筛选',()=>{
  const a=createTextClip();a.text='原句'
  a.text='改后的正文'
  assert.deepEqual(subtitleRows([a],{query:'原句',editingId:a.id}),[a])
  assert.deepEqual(subtitleRows([a],{query:'原句'}),[])
})
test('全选及取消结果只改变结果内的选择，保留筛选外和其他媒体选择',()=>{
  const a=createTextClip(),b=createTextClip(2),c=createTextClip(4)
  assert.deepEqual(selectSubtitleResults([a.id,'image',c.id],[a,b],true),[a.id,'image',c.id,b.id])
  assert.deepEqual(selectSubtitleResults([a.id,'image',c.id,b.id],[a,b],false),['image',c.id])
})
test('列表独立编辑一条内容，不覆盖多选其他条、时间、样式或关键帧',()=>{
  const a=createTextClip(),b=createTextClip(5,2,1);setClipKeyframe(b,'@x',30,20)
  const before=structuredClone(b)
  patchSubtitleContent(b,{text:'新正文\r\n下一行',speaker:'高松\t灯',start:99,textStyle:{fontSize:99}})
  assert.deepEqual(b,{...before,text:'新正文\n下一行',speaker:'高松 灯'})
  assert.equal(a.text,'请输入文字')
  assert.equal(patchSubtitleContent(createImageClip({id:'img'}),{text:'忽略'}),false)
})
test('锁定内容原子拒绝，输入长度遵守现有规范',()=>{
  const a=createTextClip();a.layerLocked=true;const before=structuredClone(a)
  assert.throws(()=>patchSubtitleContent(a,{text:'不能修改'}),/锁定/);assert.deepEqual(a,before)
  a.layerLocked=false;patchSubtitleContent(a,{text:'字'.repeat(2100),speaker:'名'.repeat(90)})
  assert.equal(a.text.length,2000);assert.equal(a.speaker.length,80)
})
test('一次正文输入可一步撤销重做，独立编辑下一条且工程读回保留内容',()=>{
  let p=createProject();p.imageClips=[createTextClip(),createTextClip(5)]
  const history=createEditHistory({capture:()=>({project:structuredClone(p)}),restore:s=>{p=s.project}})
  history.begin();for(const text of ['第','第一','第一句'])history.edit(()=>patchSubtitleContent(p.imageClips[0],{text}));history.end()
  history.begin();history.edit(()=>patchSubtitleContent(p.imageClips[1],{speaker:'旁白'}));history.end()
  history.undo();assert.equal(p.imageClips[1].speaker,'');assert.equal(p.imageClips[0].text,'第一句')
  history.undo();assert.equal(p.imageClips[0].text,'请输入文字')
  history.redo();history.redo()
  const restored=readProject(JSON.parse(JSON.stringify(p)),[])
  assert.equal(restored.imageClips[0].text,'第一句');assert.equal(restored.imageClips[1].speaker,'旁白')
})
