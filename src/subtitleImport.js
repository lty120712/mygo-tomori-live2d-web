import {isTextClip,normalizeTextStyle,normalizeSpeaker,TEXT_CLIP_LIMIT} from './textTracks.js'
import {createTextClip} from './mediaTracks.js'
import {applyTextPreset,placeTextAtBottom,textPreset} from './textPresets.js'

const MAX_INPUT=2_000_000
const layerFields=['layerName','layerLocked','layerHidden','layerSolo']
const overlap=(a,b)=>a.start<b.start+b.duration-1e-8 && a.start+a.duration>b.start+1e-8
const fail=message=>({error:message})
export function decodeSubtitleFile(buffer){
  const bytes=new Uint8Array(buffer)
  if(bytes.length>4*1024*1024)return fail('SRT 文件不能超过 4 MB，请分批导入')
  try{
    if(bytes[0]===255 && bytes[1]===254)return {text:new TextDecoder('utf-16le',{fatal:true}).decode(bytes)}
    if(bytes[0]===254 && bytes[1]===255)return {text:new TextDecoder('utf-16be',{fatal:true}).decode(bytes)}
    try{return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)}}
    catch{return {text:new TextDecoder('gb18030',{fatal:true}).decode(bytes)}}
  }catch{return fail('字幕编码无法识别，请另存为 UTF-8 后再导入')}
}
function timeValue(value){
  const match=/^(\d{1,3}):([0-5]\d):([0-5]\d)[,.](\d{1,3})$/.exec(value)
  return match ? Number(match[1])*3600+Number(match[2])*60+Number(match[3])+Number(match[4].padEnd(3,'0'))/1000 : null
}
function cueText(value){
  const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}
  return value.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/?(?:b|i|u|s|font)(?:\s[^>]*)?>/gi,'').replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,name)=>entities[name]).trim()
}
export function parseSrt(input){
  if(typeof input!=='string' || input.length>MAX_INPUT)return fail('字幕文本过大，请分批导入')
  const value=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim()
  if(!value)return fail('请选择 SRT 文件或粘贴字幕内容')
  const blocks=value.split(/\n(?:[\t ]*\n)+/),cues=[]
  if(blocks.length>TEXT_CLIP_LIMIT)return fail(`单次最多导入 ${TEXT_CLIP_LIMIT} 条字幕`)
  for(const [index,block] of blocks.entries()){
    const lines=block.split('\n'),at=/^\d+$/.test(lines[0].trim()) ? 1 : 0
    const match=/^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})(?:\s+.*)?$/.exec(lines[at] || '')
    if(!match)return fail(`第 ${index+1} 条字幕时间格式不正确，应为 00:00:01,000 --> 00:00:03,000`)
    const start=timeValue(match[1]),end=timeValue(match[2]),text=cueText(lines.slice(at+1).join('\n'))
    if(start===null || end===null || end<=start)return fail(`第 ${index+1} 条字幕的结束时间必须晚于开始时间，分秒需在 00–59 内`)
    if(!text)return fail(`第 ${index+1} 条字幕没有正文`)
    if(text.length>2000)return fail(`第 ${index+1} 条字幕超过 2000 字，请拆分后导入`)
    cues.push({start,duration:end-start,text})
  }
  return {cues}
}
export function linesToCues(input,{start=0,duration=3,fps=30}={}){
  if(typeof input!=='string' || input.length>MAX_INPUT)return fail('文本过大，请分批添加')
  if(!Number.isFinite(start) || start<0 || !Number.isFinite(duration) || duration<=0)return fail('请输入有效的开始时间和每条时长')
  if(!Number.isFinite(fps) || fps<=0 || duration*fps<1-1e-8)return fail('每条文字时长不能短于工程的一帧')
  const lines=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean)
  if(!lines.length)return fail('请粘贴文字，每行生成一个片段')
  if(lines.length>TEXT_CLIP_LIMIT)return fail(`单次最多添加 ${TEXT_CLIP_LIMIT} 条文字`)
  const long=lines.findIndex(s=>s.length>2000)
  if(long!==-1)return fail(`第 ${long+1} 行超过 2000 字，请拆分后添加`)
  const firstFrame=Math.round(start*fps),length=Math.round(duration*fps)
  return {cues:lines.map((text,i)=>({text,start:(firstFrame+i*length)/fps,duration:length/fps}))}
}
export function batchTextStart(clips,time,selectedTrack){
  const members=clips.filter(c=>c.track===selectedTrack)
  return members.length && members.every(isTextClip) ? Math.max(...members.map(c=>c.start+c.duration)) : time
}
/** 仅规划，不修改工程。相互重叠的字幕自动分配到不同文字轨道。 */
export function planTextBatch(clips,cues,{duration=10,fps=30,selectedTrack}={}){
  if(!Array.isArray(cues) || !cues.length)return fail('没有可添加的字幕')
  const count=clips.filter(isTextClip).length
  if(cues.length+count>TEXT_CLIP_LIMIT)return fail(`工程最多 ${TEXT_CLIP_LIMIT} 个文字片段，当前还可添加 ${TEXT_CLIP_LIMIT-count} 个`)
  if(!Number.isFinite(fps) || fps<=0 || !Number.isFinite(duration))return fail('工程帧率或时长无效')
  const normalized=[]
  for(const [index,cue] of cues.entries()){
    if(!cue || typeof cue.text!=='string' || !cue.text.trim() || cue.text.length>2000 || !Number.isFinite(cue.start) || !Number.isFinite(cue.duration) || cue.start<0 || cue.duration<=0)return fail(`第 ${index+1} 条字幕的内容或时间无效`)
    if(cue.start+cue.duration>600+1e-8)return fail(`第 ${index+1} 条字幕超出 600 秒工程上限，请调整后再添加`)
    const startFrame=Math.min(600*fps-1,Math.round(cue.start*fps)),endFrame=Math.min(600*fps,Math.max(startFrame+1,Math.round((cue.start+cue.duration)*fps)))
    normalized.push({text:cue.text,start:startFrame/fps,duration:(endFrame-startFrame)/fps,index})
  }
  normalized.sort((a,b)=>a.start-b.start || a.index-b.index)
  const lanes=[]
  for(const track of [...new Set(clips.map(c=>c.track))].sort((a,b)=>a-b)){
    const members=clips.filter(c=>c.track===track)
    if(!members.every(isTextClip))continue
    if(track===selectedTrack && members.some(c=>c.layerLocked))return fail('选中的文字轨道已锁定，请先解锁')
    if(members.some(c=>c.layerLocked || (c.layerHidden && track!==selectedTrack)))continue
    lanes.push({track,members:[...members],layer:Object.fromEntries(layerFields.map(key=>[key,members[0][key]]))})
  }
  const preferred=lanes.findIndex(l=>l.track===selectedTrack)
  if(preferred>0)lanes.unshift(...lanes.splice(preferred,1))
  let newTracks=0
  const entries=[]
  for(const cue of normalized){
    let lane=lanes.find(l=>!l.members.some(c=>overlap(cue,c)))
    if(!lane){lane={track:-(++newTracks),members:[],layer:{layerName:'字幕',layerLocked:false,layerHidden:false,layerSolo:false}};lanes.push(lane)}
    lane.members.push(cue);entries.push({...cue,track:lane.track,layer:{...lane.layer}})
  }
  for(const entry of entries)entry.track=entry.track<0 ? -entry.track-1 : entry.track+newTracks
  return {entries,shift:newTracks,newTracks,projectDuration:Math.max(duration,...entries.map(c=>c.start+c.duration))}
}
export function buildTextBatch(plan,{presetId='subtitle',template=null,canvas={width:960,height:540},customPresets=[]}={}){
  if(plan.error)return []
  return plan.entries.map((entry,i)=>{
    const clip=createTextClip(entry.start,entry.duration,entry.track)
    if(template){
      clip.textStyle=normalizeTextStyle(template.textStyle);clip.speaker=normalizeSpeaker(template.speaker)
      clip.transform=JSON.parse(JSON.stringify({...clip.transform,...template.transform}))
    }else applyTextPreset(clip,presetId,canvas,customPresets)
    clip.text=entry.text;clip.name=`字幕 ${i+1}`;Object.assign(clip,entry.layer)
    if(!template && (clip.textStyle.layout==='dialogue' || textPreset(presetId,customPresets).placement==='bottom'))placeTextAtBottom(clip,canvas)
    return clip
  })
}
