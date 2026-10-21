import { isTextClip } from './textTracks.js'

const overlaps=(a,b)=>a.start<b.start+b.duration-1e-8 && a.start+a.duration>b.start+1e-8
const layerFields=['layerName','layerLocked','layerHidden','layerSolo']
export function textPlacement(clips,start,duration,{fps=30,preferredTrack}={}){
  const tracks=[...new Set(clips.filter(isTextClip).map(c=>c.track))].sort((a,b)=>a-b)
  if(tracks.includes(preferredTrack)){tracks.splice(tracks.indexOf(preferredTrack),1);tracks.unshift(preferredTrack)}
  for(const track of tracks){
    const members=clips.filter(c=>c.track===track)
    if(members.some(c=>!isTextClip(c) || c.layerLocked || (start>=c.start-1e-8 && start<c.start+c.duration-1e-8)))continue
    const next=members.filter(c=>c.start>start).sort((a,b)=>a.start-b.start)[0]
    const available=Math.min(duration,next ? next.start-start : duration)
    if(available>=1/fps-1e-8)return {track,duration:available,layer:Object.fromEntries(layerFields.map(key=>[key,members[0][key]]))}
  }
  return null
}

/** 单个文字片段的横向移动与跨轨放置计划，预览时不修改工程。 */
export function planTextTransfer(clips,id,{start,track,insert=null},{duration,fps,targets=[],tolerance=0}){
  const clip=clips.find(c=>c.id===id)
  if(!isTextClip(clip) || clip.layerLocked)return {error:'文字图层已锁定'}
  if(!Number.isFinite(start) || !Number.isInteger(track) || !clips.some(c=>c.track===track) || ![null,'before','after'].includes(insert))return {error:'请拖到视觉轨道或轨道边缘'}
  const round=value=>Math.round(value*fps)/fps
  let at=round(Math.max(0,Math.min(duration-clip.duration,start))),snapTime=null,gap=Infinity,snappedStart=null
  for(const edge of [0,clip.duration])for(const target of targets){
    const candidate=round(target-edge),distance=Math.abs(candidate-at)
    if(candidate>=0 && candidate+clip.duration<=duration+1e-8 && distance<=tolerance && distance<gap){gap=distance;snapTime=target;snappedStart=candidate}
  }
  if(snappedStart!==null)at=snappedStart
  const plan={id,start:at,track,insert,snapTime}
  if(at<0 || at+clip.duration>duration+1e-8)return {...plan,error:'片段不能超出工程范围'}
  const members=clips.filter(c=>c.track===track && c.id!==id)
  if(!insert && members.some(c=>c.layerLocked))return {...plan,error:'目标图层已锁定'}
  if(!insert && members.some(c=>overlaps({...clip,start:at},c)))return {...plan,error:'目标轨道此处已有片段，请拖到空档或轨道边缘新建一层'}
  return plan
}

export function applyTextTransfer(clips,request,options){
  const plan=planTextTransfer(clips,request.id,request,options)
  if(plan.error)return plan
  const clip=clips.find(c=>c.id===request.id)
  if(plan.insert){
    const order=[...new Set(clips.map(c=>c.track))].sort((a,b)=>a-b)
    const marker=Symbol('new-text-layer')
    order.splice(order.indexOf(plan.track)+(plan.insert==='after' ? 1 : 0),0,marker)
    const mapping=new Map(order.map((track,index)=>[track,index]))
    for(const c of clips)c.track=mapping.get(c.track)
    clip.track=mapping.get(marker)
  }else{
    const target=clips.find(c=>c.track===plan.track && c.id!==clip.id)
    if(target)for(const key of layerFields)clip[key]=target[key]
    clip.track=plan.track
  }
  clip.start=plan.start
  const mapping=new Map([...new Set(clips.map(c=>c.track))].sort((a,b)=>a-b).map((track,index)=>[track,index]))
  for(const c of clips)c.track=mapping.get(c.track)
  return plan
}
