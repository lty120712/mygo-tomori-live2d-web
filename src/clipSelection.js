import { normalizeMotionEvents } from './timelineEvents.js'
import { splitClip } from './sceneProject.js'
const clone=value=>JSON.parse(JSON.stringify(value))
export function copyClips(clips,ids,fps){
  const selected=clips.filter(c=>ids.includes(c.id) && !c.layerLocked)
  return selected.length ? {fps,clips:clone(selected),anchor:Math.min(...selected.map(c=>c.start))} : null
}
export function planClipSplit(clips,ids,time){
  const selected=clips.filter(c=>ids.includes(c.id))
  if(selected.some(c=>c.layerLocked))return {error:'图层已锁定，请先解锁后切割'}
  const eligible=selected.filter(c=>time>c.start+1e-8 && time<c.start+c.duration-1e-8)
  if(!eligible.length)return {error:'播放头必须位于所选片段内部'}
  if(clips.length+eligible.length>16)return {error:'切割后超过 16 个模型片段，无法执行整组切割'}
  const left=eligible.map(clone),right=left.map(c=>splitClip(c,time))
  return {left,right}
}
export function planClipMove(clips,original,delta,{duration,fps,targets=[],tolerance=0}){
  if(!original.length || original.some(c=>clips.find(v=>v.id===c.id)?.layerLocked))return {entries:[],delta:0,snapTime:null}
  const ids=new Set(original.map(c=>c.id)),round=v=>Math.round(v*fps)/fps
  let low=Math.max(...original.map(c=>-c.start)),high=Math.min(...original.map(c=>duration-c.start-c.duration))
  for(const c of original)for(const other of clips.filter(v=>v.track===c.track && !ids.has(v.id))){
    if(other.start+other.duration<=c.start+1e-8)low=Math.max(low,other.start+other.duration-c.start)
    else if(other.start>=c.start+c.duration-1e-8)high=Math.min(high,other.start-c.start-c.duration)
    else return {entries:[],delta:0,snapTime:null}
  }
  low=Math.ceil((low-1e-8)*fps)/fps;high=Math.floor((high+1e-8)*fps)/fps
  const requested=Math.max(low,Math.min(high,round(delta)))
  let value=requested,snapTime=null,gap=Infinity
  for(const c of original)for(const edge of [c.start,c.start+c.duration])for(const target of targets){
    const candidate=round(target-edge),distance=Math.abs(candidate-requested)
    if(candidate>=low && candidate<=high && distance<=tolerance && distance<gap){gap=distance;value=candidate;snapTime=round(target)}
  }
  return {delta:value,snapTime,entries:original.map(c=>({id:c.id,start:round(c.start+value)}))}
}
export function applyClipStarts(clips,entries,duration,fps){
  if(!entries.length || new Set(entries.map(e=>e.id)).size!==entries.length)return false
  const result=clips.map(c=>({...c})),ids=new Set(entries.map(e=>e.id))
  for(const entry of entries){const c=result.find(c=>c.id===entry.id);if(!c || c.layerLocked || !Number.isFinite(entry.start))return false;c.start=Math.round(entry.start*fps)/fps;if(c.start<0 || c.start+c.duration>duration+1e-8)return false}
  for(const c of result.filter(c=>ids.has(c.id)))if(result.some(v=>v.id!==c.id && v.track===c.track && c.start<v.start+v.duration-1e-8 && c.start+c.duration>v.start+1e-8))return false
  for(const c of clips)if(ids.has(c.id))c.start=result.find(v=>v.id===c.id).start
  return true
}
export function planClipPaste(clips,clipboard,time,duration,fps){
  if(!clipboard?.clips?.length)return {error:'请先复制模型片段'}
  if(clips.length+clipboard.clips.length>16)return {error:'单个工程最多 16 个模型片段'}
  const existing=[...new Set(clips.map(c=>c.track))].sort((a,b)=>a-b),tracks=[...new Set(clipboard.clips.map(c=>c.track))].sort((a,b)=>a-b)
  const copies=clone(clipboard.clips),at=Math.round(time*fps)/fps,ratio=fps/clipboard.fps
  for(const c of copies){
    c.start=Math.round((at+c.start-clipboard.anchor)*fps)/fps
    if(c.start<0 || c.start+c.duration>duration+1e-8)return {error:'粘贴的整组片段超出工程时长，请移动播放头或延长工程'}
    c.id='clip-'+crypto.randomUUID();c.track=tracks.indexOf(c.track);c.layerLocked=false;c.name+=' · 副本'
    for(const [name,keys] of Object.entries(c.keyframes)){const frames=new Map();for(const key of keys){key.frame=Math.round(key.frame*ratio);frames.set(key.frame,key)}c.keyframes[name]=[...frames.values()].sort((a,b)=>a.frame-b.frame)}
    for(const event of c.events){event.id='event-'+crypto.randomUUID();event.frame=Math.round(event.frame*ratio)}
    normalizeMotionEvents(c,fps)
  }
  return {clips:copies,tracks:existing.map((track,index)=>({track,to:index+tracks.length}))}
}
