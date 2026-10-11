export function visibleClipKeys(clip, fps) {
  return Object.entries(clip.keyframes).flatMap(([key, keys]) => keys.map(k => ({ ...k, key, time: clip.start + k.frame / fps - clip.offset })))
    .filter(k => k.time >= clip.start - 1e-8 && k.time < clip.start + clip.duration - 1e-8)
    .sort((a, b) => a.frame - b.frame || a.key.localeCompare(b.key))
}
export function groupedClipKeys(clip, fps, transforms) {
  const groups = new Map()
  for (const k of visibleClipKeys(clip, fps).filter(k => k.key.startsWith('@') === transforms)) {
    if (!groups.has(k.frame)) groups.set(k.frame, { frame: k.frame, time: k.time, keys: [] })
    groups.get(k.frame).keys.push(k)
  }
  return [...groups.values()]
}
// Keep neighboring keys intact when dragging; do not silently overwrite them.
export function moveClipKey(clip, key, fromFrame, toFrame, fps) {
  const keys = clip.keyframes[key] || [], index = keys.findIndex(k => k.frame === fromFrame)
  if (index < 0 || !Number.isFinite(toFrame)) return fromFrame
  const low = Math.max(Math.ceil(clip.offset * fps - 1e-8), index > 0 ? keys[index - 1].frame + 1 : 0)
  const high = Math.min(Math.ceil((clip.offset + clip.duration) * fps - 1e-8) - 1, index < keys.length - 1 ? keys[index + 1].frame - 1 : Infinity)
  if (high < low) return fromFrame
  const frame = Math.max(low, Math.min(high, Math.round(toFrame)))
  keys[index].frame = frame
  return frame
}

export function uniqueKeyRefs(items) {
  return [...new Map(items.map(item=>[JSON.stringify([item.clipId,item.key,item.frame]),{clipId:item.clipId,key:item.key,frame:item.frame}])).values()]
}
// Apply one shared delta so adjacent selected keys never overwrite each other.
export function planKeyRefMove(clips, items, delta, fps) {
  const refs = uniqueKeyRefs(items).filter(i => clips.find(c => c.id === i.clipId)?.keyframes[i.key]?.some(k => k.frame === i.frame))
  let low = -Infinity, high = Infinity
  for (const item of refs) {
    const clip = clips.find(c => c.id === item.clipId)
    const others = clip.keyframes[item.key].filter(k => !refs.some(i => i.clipId === item.clipId && i.key === item.key && i.frame === k.frame))
    const before = others.filter(k => k.frame < item.frame).at(-1)
    const after = others.find(k => k.frame > item.frame)
    low = Math.max(low, Math.ceil(clip.offset * fps - 1e-8) - item.frame, before ? before.frame + 1 - item.frame : -Infinity)
    high = Math.min(high, Math.ceil((clip.offset + clip.duration) * fps - 1e-8) - 1 - item.frame, after ? after.frame - 1 - item.frame : Infinity)
  }
  const applied = refs.length && Number.isFinite(delta) && low <= 0 && high >= 0 ? Math.max(low, Math.min(high, Math.round(delta))) : 0
  return { delta: applied, items: refs.map(i => ({ ...i, frame: i.frame + applied })) }
}
export function moveKeyRefs(clips, items, delta, fps) {
  const refs = uniqueKeyRefs(items), plan = planKeyRefMove(clips, refs, delta, fps)
  if (!plan.delta) return plan
  const keys = refs.map(i => clips.find(c => c.id === i.clipId)?.keyframes[i.key]?.find(k => k.frame === i.frame)).filter(Boolean)
  for (const key of keys) key.frame += plan.delta
  return plan
}
export function editKeyRefs(clips, items, action, fps) {
  if (action.type === 'paste') {
    for (const entry of action.entries) {
      const clip = clips.find(c => c.id === entry.clipId)
      if (!clip) continue
      const keys = clip.keyframes[entry.key] ||= []
      const existing = keys.find(k => k.frame === entry.frame)
      if (existing) Object.assign(existing, { value: entry.value, easing: entry.easing })
      else keys.push({ frame: entry.frame, value: entry.value, easing: entry.easing })
      keys.sort((a, b) => a.frame - b.frame)
    }
    return
  }
  if (action.type === 'move') return moveKeyRefs(clips, items, action.delta, fps)
  for(const item of uniqueKeyRefs(items)) {
    const clip=clips.find(c=>c.id===item.clipId),keys=clip?.keyframes[item.key]
    const key=keys?.find(k=>k.frame===item.frame)
    if(!key)continue
    if(action.type==='delete') {
      clip.keyframes[item.key]=keys.filter(k=>k!==key)
      if(!clip.keyframes[item.key].length)delete clip.keyframes[item.key]
    } else {
      if(['linear','easeIn','easeOut','easeInOut'].includes(action.easing))key.easing=action.easing
      if(Number.isFinite(action.value))key.value=action.value
      if(Number.isFinite(action.time))moveClipKey(clip,item.key,item.frame,(action.time-clip.start+clip.offset)*fps,fps)
    }
  }
}
