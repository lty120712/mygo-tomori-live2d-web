import test from 'node:test'
import assert from 'node:assert/strict'
import {createTextClip} from '../src/mediaTracks.js'
import {applyTextPreset,TEXT_PRESETS} from '../src/textPresets.js'
import {layoutText,paintText,normalizeTextStyle,normalizeSpeaker} from '../src/textTracks.js'
import {createProject,readProject} from '../src/sceneProject.js'
import {copyClips,planClipSplit,planClipPaste} from '../src/clipSelection.js'

test('对白预设在横竖画布内保持边距，独立复制样式且普通文字不受影响',()=>{
  for(const canvas of [{width:960,height:540},{width:540,height:960}]){
    const clip=applyTextPreset(createTextClip(),'dialogue-dark',canvas),box=layoutText(clip)
    assert.equal(clip.speaker,'旁白');assert.equal(box.style.layout,'dialogue')
    assert.ok(box.width<=canvas.width-48+1e-8)
    assert.ok(clip.transform.y+box.height/2<=canvas.height/2-24+1e-8)
    const other=applyTextPreset(createTextClip(),'dialogue-dark',canvas)
    clip.textStyle.boxOpacity=.1;assert.equal(other.textStyle.boxOpacity,.68)
    assert.equal(TEXT_PRESETS[1].style.boxOpacity,.68)
  }
  assert.equal(applyTextPreset(createTextClip(),'basic').textStyle.layout,'plain')
  assert.equal(applyTextPreset(createTextClip(),'basic').transform.y,0)
})
test('说话人栏独立于正文换行，长名称省略，空名称隐藏整栏并重新计算高度',()=>{
  const clip=applyTextPreset(createTextClip(),'dialogue-dark');clip.textStyle.width=100;clip.textStyle.boxMinHeight=40
  clip.text='甲乙丙丁戊己';clip.speaker='很长很长很长很长的角色名称'
  const box=layoutText(clip,s=>[...s].length*30)
  assert.deepEqual(box.lines,['甲乙丙','丁戊己']);assert.ok(box.speaker.endsWith('…'))
  assert.ok(box.headerHeight>0);assert.equal(clip.speaker,'很长很长很长很长的角色名称')
  clip.speaker=' '
  const noName=layoutText(clip,s=>[...s].length*30)
  assert.equal(noName.headerHeight,0);assert.equal(noName.speaker,'');assert.ok(noName.height<box.height)
})
test('对白字段过滤无效样式与过长名称，旧工程仍为普通文字',()=>{
  const style=normalizeTextStyle({layout:'html',boxOpacity:5,boxPadding:-5,speakerSize:999,boxColor:'red',boxBorderWidth:-2})
  assert.equal(style.layout,'plain');assert.equal(style.boxOpacity,1);assert.equal(style.boxPadding,0)
  assert.equal(style.speakerSize,100);assert.equal(style.boxColor,'#17151d');assert.equal(style.boxBorderWidth,0)
  assert.equal(normalizeSpeaker('灯\n同学'),'灯 同学');assert.equal(normalizeSpeaker('灯'.repeat(200)).length,80)
  assert.equal(normalizeSpeaker(null),'')
  const p=createProject();p.imageClips=[createTextClip()];delete p.imageClips[0].speaker;delete p.imageClips[0].textStyle.layout
  const read=readProject(p,[]).imageClips[0];assert.equal(read.speaker,'');assert.equal(read.textStyle.layout,'plain')
})
test('说话人、底框与关键帧随切割、复制和工程往返完整保留',()=>{
  const clip=applyTextPreset(createTextClip(),'dialogue-light');clip.speaker='高松灯';clip.textStyle.boxRadius=18
  clip.keyframes={'@opacity':[{frame:0,value:.5,easing:'linear'}]}
  const right=planClipSplit([clip],[clip.id],2).right[0]
  assert.equal(right.speaker,'高松灯');assert.equal(right.offset,2);assert.deepEqual(right.textStyle,clip.textStyle)
  const paste=planClipPaste([],copyClips([clip],[clip.id],30),0,20,30).clips[0]
  paste.textStyle.boxRadius=7;assert.equal(clip.textStyle.boxRadius,18);assert.equal(paste.speaker,'高松灯')
  const p=createProject();p.imageClips=[clip,right]
  const restored=readProject(JSON.parse(JSON.stringify(p)),[])
  assert.equal(restored.imageClips[0].speaker,'高松灯');assert.deepEqual(restored.imageClips[0].textStyle,clip.textStyle)
  assert.deepEqual(restored.imageClips[1].keyframes,right.keyframes)
})
test('绘制底框透明度只作用于底色，说话人与正文共享片段不透明度并正确排布',()=>{
  const calls=[],stack=[],ctx={globalAlpha:.5,
    save(){stack.push({globalAlpha:this.globalAlpha,font:this.font,fillStyle:this.fillStyle,textAlign:this.textAlign})},
    restore(){Object.assign(this,stack.pop())},beginPath(){},roundRect(...args){calls.push({type:'box',args})},
    fill(){calls.push({type:'fill',alpha:this.globalAlpha})},stroke(){},moveTo(){},lineTo(){},strokeText(){},
    fillText(text,x,y){calls.push({type:'text',text,x,y,alpha:this.globalAlpha,color:this.fillStyle})}
  }
  const clip=applyTextPreset(createTextClip(),'dialogue-dark');paintText(ctx,clip)
  assert.ok(Math.abs(calls.find(c=>c.type==='fill').alpha-.34)<1e-8)
  const texts=calls.filter(c=>c.type==='text');assert.equal(texts[0].text,'旁白')
  assert.ok(texts.slice(1).every(c=>c.y>texts[0].y));assert.ok(texts.every(c=>c.alpha===.5))
  assert.equal(ctx.globalAlpha,.5);assert.equal(stack.length,0)
  calls.length=0;paintText(ctx,createTextClip());assert.ok(!calls.some(c=>c.type==='box'))
})
