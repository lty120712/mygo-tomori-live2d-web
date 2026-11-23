import {isTextClip,normalizeTextStyle} from './textTracks.js'

export function selectedTextClips(clips,ids,primary){
  const selected=new Set(ids?.length ? ids : [primary])
  return clips.filter(c=>selected.has(c.id) && isTextClip(c))
}
export const textClipsOnTrack=(clips,track)=>clips.filter(c=>c.track===track && isTextClip(c))
export function mixedTextFields(clips){
  const styles=clips.map(c=>normalizeTextStyle(c.textStyle))
  return styles.length ? Object.keys(styles[0]).filter(key=>styles.some(s=>s[key]!==styles[0][key])) : []
}
// 原子修改：任一目标锁定时整批拒绝；只修改传入字段，不覆盖其他样式。
export function patchTextStyles(clips,patch){
  const targets=clips.filter(isTextClip)
  if(!targets.length)return false
  if(targets.some(c=>c.layerLocked))throw new Error('所选文字含锁定图层，请先解锁后批量修改')
  const known=normalizeTextStyle(),fields=Object.fromEntries(Object.entries(patch || {}).filter(([key])=>Object.hasOwn(known,key)))
  if(!Object.keys(fields).length)return false
  for(const clip of targets)clip.textStyle=normalizeTextStyle({...clip.textStyle,...fields})
  return true
}
