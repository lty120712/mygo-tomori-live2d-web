import {visualClips} from './mediaTracks.js'

/** 只缩短播放头经过的片段；先校验整批，再提交，保留源动画与其他片段位置。 */
export function planPlayheadTrim(clips,ids,time,{fps,side,kind='visual'}){
  if(!Array.isArray(ids) || !['left','right'].includes(side) || !['visual','background','audio'].includes(kind) || !Number.isFinite(time) || !Number.isFinite(fps) || fps<=0)return {error:'修剪参数无效',entries:[]}
  const unique=[...new Set(ids)],selected=unique.map(id=>clips.find(clip=>clip.id===id))
  if(!selected.length)return {error:'请先选择片段',entries:[]}
  if(selected.some(clip=>!clip))return {error:'所选片段已不存在',entries:[]}
  if(selected.some(clip=>clip.layerLocked))return {error:'图层已锁定，请先解锁后修剪',entries:[]}
  const at=Math.round(time*fps)/fps,entries=[]
  for(const clip of selected){
    const end=clip.start+clip.duration
    if(!(at>clip.start+1e-8 && at<end-1e-8))continue
    const duration=side==='left' ? end-at : at-clip.start
    if(duration<1/fps-1e-8)continue
    const patch=side==='left' ? {start:at,duration,...(kind==='background' ? {} : {offset:(clip.offset || 0)+at-clip.start})} : {duration}
    if(kind==='audio'){
      patch.fadeIn=Math.min(duration,clip.fadeIn || 0)
      patch.fadeOut=Math.min(duration,clip.fadeOut || 0)
    }
    entries.push({id:clip.id,patch})
  }
  return entries.length ? {entries,time:at} : {error:'播放头需位于所选片段内部，并至少保留一帧',entries:[]}
}

export function trimProjectAtPlayhead(project,{kind='visual',ids=[],time,side}){
  const clips=kind==='visual' ? visualClips(project) : kind==='background' ? project.backgroundClips : kind==='audio' ? project.audioClips : []
  const plan=planPlayheadTrim(clips,ids,time,{fps:project.fps,side,kind})
  if(plan.error)return plan
  for(const entry of plan.entries)Object.assign(clips.find(clip=>clip.id===entry.id),entry.patch)
  return plan
}
