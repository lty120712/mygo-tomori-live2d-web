// Track 0 is the front layer. All clips in a track move together.
export function sceneLayers(clips){return [...new Set(clips.map(c=>c.track))].sort((a,b)=>a-b)}
export function reorderSceneLayer(clips,from,to){
  const order=sceneLayers(clips),a=order.indexOf(from),b=order.indexOf(to)
  if(a<0 || b<0 || a===b)return false
  order.splice(a,1);order.splice(b,0,from)
  const mapping=new Map(order.map((track,index)=>[track,index]))
  for(const clip of clips)clip.track=mapping.get(clip.track)
  return true
}
export function insertFrontLayer(clips){
  const mapping=new Map(sceneLayers(clips).map((track,index)=>[track,index+1]))
  for(const clip of clips)clip.track=mapping.get(clip.track)
  return 0
}
export function sceneDrawOrder(clips){return [...clips].sort((a,b)=>b.track-a.track)}
export function sceneHitOrder(clips){return [...clips].sort((a,b)=>a.track-b.track)}

export function setLayerState(clips,track,patch){
  for(const clip of clips.filter(c=>c.track===track)){
    if(typeof patch.layerLocked==='boolean')clip.layerLocked=patch.layerLocked
    if(typeof patch.layerHidden==='boolean')clip.layerHidden=patch.layerHidden
    if(typeof patch.layerSolo==='boolean')clip.layerSolo=patch.layerSolo
  }
}
export function canEditClips(clips,ids){return ids.every(id=>{const clip=clips.find(c=>c.id===id);return !!clip && !clip.layerLocked})}

/** 图层改名同步该轨道的片段名，画布与时间线共用更新后的名称。 */
export function renameSceneLayer(clips,track,value){
  const name=String(value ?? '').trim().slice(0,100)
  const members=clips.filter(clip=>clip.track===track)
  if(!name || !members.length || members.some(clip=>clip.layerLocked))return false
  for(const clip of members){clip.layerName=name;clip.name=name}
  return true
}
