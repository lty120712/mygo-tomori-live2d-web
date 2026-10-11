// Event times are stored in source-model frames, like parameter keyframes.
export function eventRange(clip,event,fps) {
  const start=clip.start+event.frame/fps-clip.offset
  const next=event.type==='expression' ? clip.events.filter(e=>e.type===event.type && e.frame>event.frame).sort((a,b)=>a.frame-b.frame)[0] : null
  const limit=next ? clip.start+next.frame/fps-clip.offset : clip.start+clip.duration
  const end=Math.min(clip.start+clip.duration,limit,event.type==='motion' && event.duration>0 ? start+event.duration : limit)
  return {start:Math.max(clip.start,start),end,sourceStart:start,duration:Math.max(0,end-Math.max(clip.start,start))}
}
export function eventProgress(clip,event,time,fps) {
  const r=eventRange(clip,event,fps),elapsed=Math.max(0,Math.min(r.duration,time-r.start))
  return {remaining:Math.max(0,r.duration-elapsed),ratio:r.duration ? elapsed/r.duration : 0}
}
// Earlier versions interrupted overlapping actions. Keep that visible result
// when restoring them, but save explicit, non-overlapping playback lengths.
export function normalizeMotionEvents(clip,fps) {
  const motions=clip.events.filter(e=>e.type==='motion').sort((a,b)=>a.frame-b.frame)
  for(let i=0;i<motions.length;i++) {
    const e=motions[i],next=motions[i+1]
    e.sourceDuration ||= e.duration || 2
    e.duration ||= e.sourceDuration
    if(next)e.duration=Math.min(e.duration,Math.max(0,(next.frame-e.frame)/fps))
  }
  clip.events=clip.events.filter(e=>e.type!=='motion' || e.duration>0)
}
export function activeEvent(clip,type,time,fps) {
  return clip.events.filter(e=>e.type===type).sort((a,b)=>b.frame-a.frame).find(e=>{const r=eventRange(clip,e,fps);return time>=r.start && time<r.end})
}
export function planEventEdit(clip,event,patch,fps) {
  const step=1/fps,round=v=>Math.round(v*fps)/fps
  const at=patch.start ?? (clip.start+event.frame/fps-clip.offset)
  if(!Number.isFinite(at) || at<clip.start-1e-7 || at>=clip.start+clip.duration-1e-7)return {error:'起点必须位于模型片段内'}
  const frame=Math.round((at-clip.start+clip.offset)*fps)
  if(event.type==='expression')return {patch:{frame,duration:0,offset:0,sourceDuration:0}}
  if(clip.events.some(e=>e.id!==event.id && e.type===event.type && e.frame===frame))return {error:'该帧已有同类片段，请选择其他位置'}
  const offset=round(patch.offset ?? event.offset ?? 0)
  const sourceDuration=round(event.sourceDuration || event.duration || step)
  const duration=round(patch.duration ?? event.duration ?? 0)
  if(!Number.isFinite(offset) || !Number.isFinite(duration) || offset<0 || (event.type==='motion' && (duration<step || offset+duration>sourceDuration+1e-7)))return {error:'裁剪范围超出源动作时长'}
  if(duration>0 && at+duration>clip.start+clip.duration+1e-7)return {error:'结束时间超出模型片段'}
  if(event.type==='motion') {
    const start=clip.start+frame/fps-clip.offset,end=start+duration
    const conflict=clip.events.find(e=>{if(e===event || (event.id && e.id===event.id) || e.type!=='motion')return false;const r=eventRange(clip,e,fps);return start<r.end-1e-7 && end>r.start+1e-7})
    if(conflict)return {error:'动作区间与“'+conflict.name+'”重叠，请移到空闲区间'}
  }
  return {patch:{frame,offset,duration,sourceDuration}}
}
