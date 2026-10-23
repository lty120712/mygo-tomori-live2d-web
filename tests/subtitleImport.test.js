import test from 'node:test'
import assert from 'node:assert/strict'
import {parseSrt,decodeSubtitleFile,linesToCues,batchTextStart,planTextBatch,buildTextBatch} from '../src/subtitleImport.js'
import {createTextClip,createImageClip} from '../src/mediaTracks.js'
import {applyTextPreset} from '../src/textPresets.js'
import {layoutText,TEXT_CLIP_LIMIT} from '../src/textTracks.js'
import {createProject,readProject} from '../src/sceneProject.js'
import {createEditHistory} from '../src/editHistory.js'
const srt='1\n00:00:01,250 --> 00:00:03,500\n第一行\n第二行\n\n2\n00:00:02.500 --> 00:00:04.000\n<i>另一句</i>'
test('SRT 支持 BOM、CRLF、逗号和点的毫秒，保留正文换行并去除字体标签',()=>{
  const parsed=parseSrt('\ufeff'+srt.replace(/\n/g,'\r\n'))
  assert.deepEqual(parsed.cues,[{text:'第一行\n第二行',start:1.25,duration:2.25},{text:'另一句',start:2.5,duration:1.5}])
  assert.equal(parseSrt(srt.replace('\n\n','\n \n \n')).cues.length,2)
  assert.equal(parseSrt('00:00:00,500 --> 00:00:01,000\n未编号').cues[0].start,.5)
  assert.equal(parseSrt('00:00:00,000 --> 00:00:01,000\nA &amp; B<br>C').cues[0].text,'A & B\nC')
})
test('SRT 严格拒绝坏时间、空正文、倒置、超长正文，绝不静默漏条',()=>{
  for(const value of ['garbage','1\n00:61:00,000 --> 00:62:00,000\n文本','1\n00:00:03,000 --> 00:00:02,000\n文本','1\n00:00:01,000 --> 00:00:02,000','1\n00:00:01,000 --> 00:00:02,000\n'+ '文'.repeat(2001),srt+'\n\n3\n坏的条目'])assert.ok(parseSrt(value).error)
})
test('读取 UTF-8、UTF-16 BOM 和常见中文 GB 编码，拒绝超大文件',()=>{
  assert.equal(decodeSubtitleFile(new TextEncoder().encode(srt)).text,srt)
  const utf16=new Uint8Array(2+srt.length*2);utf16.set([255,254]);for(let i=0;i<srt.length;i++){utf16[2+i*2]=srt.charCodeAt(i)&255;utf16[3+i*2]=srt.charCodeAt(i)>>8}
  assert.equal(decodeSubtitleFile(utf16).text,srt)
  assert.equal(decodeSubtitleFile(new Uint8Array([0xc4,0xe3,0xba,0xc3])).text,'你好')
  assert.ok(decodeSubtitleFile(new Uint8Array(4*1024*1024+1)).error)
})
test('批量行文本忽略空行，按起点和每条时长连续排布，默认接到所选文字轨末尾',()=>{
  const parsed=linesToCues(' 第一行\r\n\r\n 第二行 ',{start:7,duration:2.5})
  assert.deepEqual(parsed.cues,[{text:'第一行',start:7,duration:2.5},{text:'第二行',start:9.5,duration:2.5}])
  const clips=[createTextClip(0,2,0),createTextClip(5,2,0),createImageClip({id:'i'},0,10,1)]
  assert.equal(batchTextStart(clips,1,0),7);assert.equal(batchTextStart(clips,1,1),1)
  assert.ok(linesToCues('文',{duration:0}).error);assert.ok(linesToCues(' \n ').error)
  assert.ok(linesToCues('文',{duration:.02,fps:30}).error)
  assert.equal(linesToCues('文',{duration:.02,fps:60}).cues[0].duration,1/60)
  const frames=linesToCues('a\nb\nc',{duration:2.55,fps:30}).cues
  assert.equal(frames[0].duration,77/30);assert.equal(frames[1].start,frames[0].start+frames[0].duration)
})
test('SRT 重叠自动分轨，非重叠复用同轨，规划不改变已有工程',()=>{
  const existing=[createTextClip(0,2,0)],before=structuredClone(existing)
  const plan=planTextBatch(existing,parseSrt(srt).cues,{duration:3,fps:30,selectedTrack:0})
  assert.equal(plan.newTracks,1);assert.equal(plan.projectDuration,4)
  assert.equal(plan.entries[0].track,0);assert.equal(plan.entries[1].track,1)
  assert.deepEqual(existing,before)
  const sequential=planTextBatch([],linesToCues('a\nb\nc').cues,{duration:6})
  assert.equal(sequential.newTracks,1);assert.ok(sequential.entries.every(c=>c.track===0));assert.equal(sequential.projectDuration,9)
})
test('优先所选文字轨，锁定时拒绝，避开其他隐藏轨和非文字轨',()=>{
  const a=createTextClip(0,1,0),b=createTextClip(0,1,1),image=createImageClip({id:'i'},0,10,2)
  const cues=[{text:'字幕',start:2,duration:2}]
  assert.equal(planTextBatch([a,b,image],cues,{selectedTrack:1}).entries[0].track,1)
  b.layerLocked=true;assert.ok(planTextBatch([a,b],cues,{selectedTrack:1}).error)
  a.layerHidden=true
  const plan=planTextBatch([a,b,image],cues)
  assert.equal(plan.newTracks,1);assert.equal(plan.entries[0].track,0)
})
test('对齐不同帧率且极短字幕至少一帧，超出工程或数量上限整批拒绝',()=>{
  for(const fps of [24,30,60]){
    const plan=planTextBatch([],[{text:'极短',start:.01,duration:.001}],{fps,duration:1})
    assert.equal(plan.entries[0].duration,1/fps);assert.equal(Math.round(plan.entries[0].start*fps),plan.entries[0].start*fps)
  }
  assert.ok(planTextBatch([],[{text:'超限',start:599,duration:2}]).error)
  assert.ok(planTextBatch([],[{text:'bad',start:-1,duration:2}]).error)
  assert.ok(planTextBatch([],Array.from({length:TEXT_CLIP_LIMIT+1},()=>({text:'文',start:0,duration:1}))).error)
  const existing=Array.from({length:TEXT_CLIP_LIMIT},()=>createTextClip())
  assert.match(planTextBatch(existing,[{text:'文',start:0,duration:1}]).error,/还可添加 0 个/)
})
test('所选文字样式深复制，保留说话人及轴缩放，生成独立片段不带源关键帧',()=>{
  const template=applyTextPreset(createTextClip(),'dialogue-light');template.speaker='高松灯';template.transform.scaleX=.8;template.keyframes={'@opacity':[{frame:0,value:0}]};template.offset=2
  const plan=planTextBatch([],linesToCues('第一句\n第二句').cues)
  const added=buildTextBatch(plan,{template})
  assert.equal(added[0].speaker,'高松灯');assert.equal(added[0].transform.scaleX,.8);assert.equal(added[0].offset,0);assert.deepEqual(added[0].keyframes,{})
  assert.notEqual(added[0].id,added[1].id);added[0].textStyle.boxRadius=60
  assert.equal(added[1].textStyle.boxRadius,12);assert.equal(template.textStyle.boxRadius,12)
  for(const canvas of [{width:960,height:540},{width:540,height:960}]){
    const subtitle=buildTextBatch(plan,{canvas})[0],box=layoutText(subtitle)
    assert.ok(box.width<=canvas.width-48);assert.ok(subtitle.transform.y+box.height/2<=canvas.height/2-24+1e-8)
  }
})
test('整批添加、旧轨整体位移和延长可一次撤销重做，工程往返保持字幕',()=>{
  let p=createProject();p.duration=3;p.imageClips=[createTextClip(0,3,0)]
  const before=structuredClone(p),history=createEditHistory({capture:()=>({project:structuredClone(p)}),restore:s=>{p=s.project}})
  const plan=planTextBatch(p.imageClips,parseSrt(srt).cues,{duration:p.duration})
  const added=buildTextBatch(plan)
  history.edit(()=>{for(const clip of p.imageClips)clip.track+=plan.shift;p.imageClips.push(...added);p.duration=plan.projectDuration})
  assert.equal(p.imageClips.length,3);assert.equal(p.duration,4)
  const restored=readProject(JSON.parse(JSON.stringify(p)),[]);assert.deepEqual(restored.imageClips.map(c=>[c.text,c.start,c.duration,c.track]),p.imageClips.map(c=>[c.text,c.start,c.duration,c.track]))
  history.undo();assert.deepEqual(p,before);assert.equal(history.canUndo,false)
  history.redo();assert.equal(p.imageClips.length,3);assert.equal(p.duration,4)
})
