import {visualClips} from './mediaTracks.js'

const EPS=1e-8
const fail=error=>({error,entries:[]})

/** A single-track edit. All affected starts move by one delta; source timing stays intact. */
export function planTrackRipple(clips,{kind,id,mode}){
  if(!['visual','background','audio'].includes(kind) || !['gap','delete'].includes(mode))return fail('无法识别轨道操作')
  const target=clips.find(c=>c.id===id)
  if(!target)return fail('请选择一段有效片段')
  const lane=clips.filter(c=>kind==='background' || c.track===target.track).sort((a,b)=>a.start-b.start)
  if(lane.some(c=>c.layerLocked))return fail('轨道已锁定，请先解锁')
  let previousEnd=0
  for(const clip of lane){
    if(![clip.start,clip.duration,clip.start+clip.duration].every(Number.isFinite) || clip.start<previousEnd-EPS || clip.duration<=0)
      return fail('轨道存在重叠或无效片段，无法安全左移')
    previousEnd=clip.start+clip.duration
  }
  const index=lane.indexOf(target),previous=lane[index-1]
  const gap=target.start-(previous ? previous.start+previous.duration : 0)
  if(mode==='gap' && gap<=EPS)return fail('此片段前方没有空隙')
  const shift=mode==='gap' ? gap : target.duration
  const entries=lane.slice(index+(mode==='delete' ? 1 : 0)).map(clip=>({id:clip.id,start:Math.max(0,clip.start-shift)}))
  return {entries,shift,removeId:mode==='delete' ? id : null}
}

export function applyTrackRipple(project,request){
  const clips=request.kind==='visual' ? visualClips(project) : request.kind==='background' ? project.backgroundClips : request.kind==='audio' ? project.audioClips : []
  const plan=planTrackRipple(clips,request)
  if(plan.error)return plan
  const starts=new Map(plan.entries.map(({id,start})=>[id,start]))
  for(const clip of clips)if(starts.has(clip.id))clip.start=starts.get(clip.id)
  if(plan.removeId){
    const collections=request.kind==='visual' ? ['clips','imageClips'] : [request.kind==='background' ? 'backgroundClips' : 'audioClips']
    for(const key of collections)if(project[key].some(clip=>clip.id===plan.removeId))project[key]=project[key].filter(clip=>clip.id!==plan.removeId)
  }
  return plan
}
