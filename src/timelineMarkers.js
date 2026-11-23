export const MARKER_LIMIT=256
export const MARKER_COLOR='#d99b35'
const uid=()=> 'marker-'+crypto.randomUUID()
const color=value=>typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():MARKER_COLOR
const name=(value,index)=>typeof value==='string' && value.trim()?value.trim().slice(0,100):'标记 '+(index+1)
export function normalizeMarkers(value,duration,fps,idFactory=uid){
  const ids=new Set(),last=Math.max(0,Math.round(duration*fps))
  return (Array.isArray(value)?value:[]).slice(0,MARKER_LIMIT).filter(m=>m && Number.isFinite(m.time)).map((m,index)=>{
    let id=typeof m.id==='string' && m.id.trim()?m.id.trim().slice(0,100):idFactory()
    if(ids.has(id))id=idFactory()+'-'+index
    while(ids.has(id))id+='-'+index
    ids.add(id)
    return {id,time:Math.max(0,Math.min(last,Math.round(m.time*fps)))/fps,name:name(m.name,index),color:color(m.color)}
  }).sort((a,b)=>a.time-b.time)
}
export function editTimelineMarkers(markers,request,{duration,fps,idFactory=uid}){
  const list=normalizeMarkers(markers,duration,fps,idFactory)
  if(request.type==='remove')return list.filter(m=>m.id!==request.id)
  if(request.type!=='add' && request.type!=='edit')throw new Error('无法识别标记操作')
  if(!Number.isFinite(request.time) || request.time<0 || request.time>duration)throw new Error('标记时间须在工程范围内')
  const patch={time:Math.round(request.time*fps)/fps,name:name(request.name,list.length),color:color(request.color)}
  if(request.type==='add'){
    if(list.length>=MARKER_LIMIT)throw new Error('每个工程最多 256 个标记')
    let id=idFactory()
    while(list.some(m=>m.id===id))id+='-new'
    list.push({id,...patch})
  }else{
    const marker=list.find(m=>m.id===request.id)
    if(!marker)throw new Error('标记已不存在')
    Object.assign(marker,patch)
  }
  return list.sort((a,b)=>a.time-b.time)
}
export function markerNeighbors(markers,time,fps){
  const at=Math.round(time*fps),list=[...markers].sort((a,b)=>a.time-b.time)
  return {previous:list.filter(m=>Math.round(m.time*fps)<at).at(-1) || null,next:list.find(m=>Math.round(m.time*fps)>at) || null}
}
