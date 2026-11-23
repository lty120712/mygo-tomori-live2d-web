import {isTextClip,normalizeText,normalizeSpeaker} from './textTracks.js'

export function subtitleRows(clips,{query='',track='',editingId=''}={}){
  const search=String(query).trim().toLocaleLowerCase()
  return clips.filter(isTextClip).filter(c=>{
    if(c.id===editingId)return true // 编辑搜索结果时，保留正在输入的行直到结束。
    return (track==='' || c.track===Number(track)) && (!search || [c.text,c.speaker,c.name,c.layerName].some(v=>String(v || '').toLocaleLowerCase().includes(search)))
  }).sort((a,b)=>a.start-b.start || a.track-b.track || String(a.id).localeCompare(String(b.id)))
}
export function patchSubtitleContent(clip,patch){
  if(!isTextClip(clip))return false
  if(clip.layerLocked)throw new Error('字幕图层已锁定，请先解锁')
  if(Object.hasOwn(patch,'text'))clip.text=normalizeText(patch.text)
  if(Object.hasOwn(patch,'speaker'))clip.speaker=normalizeSpeaker(patch.speaker)
  return true
}
export function selectSubtitleResults(current,rows,checked){
  const ids=new Set(current)
  for(const row of rows)checked ? ids.add(row.id) : ids.delete(row.id)
  return [...ids]
}
