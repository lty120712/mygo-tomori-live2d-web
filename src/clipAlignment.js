import {visualClips} from './mediaTracks.js'
import {applyClipStarts} from './clipSelection.js'

/** 对齐的是整组选区的外侧边缘，所有片段保持相同位移。 */
export function planClipAlignment(clips,ids,time,{duration,fps,edge='start',kind='visual'}){
  if(!Array.isArray(ids) || !['start','end'].includes(edge) || !['visual','background','audio'].includes(kind) || ![time,duration,fps].every(Number.isFinite) || duration<=0 || fps<=0)return {error:'对齐参数无效',entries:[]}
  const byId=new Map(clips.map(clip=>[clip.id,clip])),selected=[...new Set(ids)].map(id=>byId.get(id))
  if(!selected.length)return {error:'请先选择片段',entries:[]}
  if(selected.some(clip=>!clip))return {error:'所选片段已不存在',entries:[]}
  if(selected.some(clip=>clip.layerLocked))return {error:'图层已锁定，请先解锁后对齐',entries:[]}
  if(time<0 || time>duration)return {error:'播放头必须位于工程范围内',entries:[]}
  const round=value=>Math.round(value*fps)/fps,at=round(time)
  const anchor=edge==='start' ? Math.min(...selected.map(clip=>clip.start)) : Math.max(...selected.map(clip=>clip.start+clip.duration))
  const delta=at-anchor
  const entries=selected.map(clip=>({id:clip.id,start:round(clip.start+delta)}))
  if(entries.some(entry=>entry.start<0 || entry.start+byId.get(entry.id).duration>duration+1e-8))return {error:'对齐后片段会超出工程范围，请调整播放头',entries:[]}
  // 使用现有时间线提交校验检查最终位置；允许跨过其他片段移动到合法空档。
  if(!applyClipStarts(clips.map(clip=>({...clip})),entries,duration,fps))return {error:'对齐后会与同轨片段重叠，请调整播放头或选择范围',entries:[]}
  const moved=entries.some(entry=>Math.abs(entry.start-byId.get(entry.id).start)>1e-8)
  return moved ? {entries,delta,time:at} : {entries:[],aligned:true,time:at}
}

export function alignProjectAtPlayhead(project,{kind='visual',ids=[],time,edge='start'}){
  const clips=kind==='visual' ? visualClips(project) : kind==='background' ? project.backgroundClips : kind==='audio' ? project.audioClips : []
  const plan=planClipAlignment(clips,ids,time,{duration:project.duration,fps:project.fps,edge,kind})
  if(plan.error || plan.aligned)return plan
  for(const entry of plan.entries)clips.find(clip=>clip.id===entry.id).start=entry.start
  return plan
}
