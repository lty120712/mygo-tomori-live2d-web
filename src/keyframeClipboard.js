import { uniqueKeyRefs } from './timelineKeyframes.js'
import { resolveParamId } from './params.js'

export function copyKeyRefs(clips, items, fps) {
  const keys = uniqueKeyRefs(items).flatMap(item => {
    const clip = clips.find(c => c.id === item.clipId), key = clip?.keyframes[item.key]?.find(k => k.frame === item.frame)
    return key ? [{ clipId: clip.id, key: item.key, value: key.value, easing: key.easing || 'linear', time: clip.start + key.frame / fps - clip.offset }] : []
  }).sort((a, b) => a.time - b.time)
  if (!keys.length) return null
  const origin = keys[0].time
  return { keys: keys.map(({ time, ...key }) => ({ ...key, delay: time - origin })) }
}

export function planKeyPaste(clips, clipboard, selectedId, time, fps, groups = {}) {
  const error = message => ({ entries: [], error: message })
  if (!clipboard?.keys.length) return error('请先复制关键帧')
  const sources = new Set(clipboard.keys.map(k => k.clipId)), single = sources.size === 1
  if (single && !selectedId) return error('请选择要粘贴的模型片段')
  const entries = []
  for (const copied of clipboard.keys) {
    const clip = clips.find(c => c.id === (single ? selectedId : copied.clipId))
    if (!clip) return error('原模型片段已删除，无法粘贴跨模型选择')
    let key = copied.key
    if (single && clip.id !== copied.clipId && !key.startsWith('@')) {
      key = resolveParamId(key, groups[clip.id] || [])
      if (!key) return error('目标模型不支持所复制的参数，未粘贴')
      const field = groups[clip.id].flatMap(g => g.params).find(p => p.key === key)
      if (copied.value < field.min || copied.value > field.max) return error('目标模型参数范围不兼容，未粘贴')
    }
    const frame = Math.round((time + copied.delay - clip.start + clip.offset) * fps)
    const low = Math.ceil(clip.offset * fps - 1e-8), high = Math.ceil((clip.offset + clip.duration) * fps - 1e-8) - 1
    if (frame < low || frame > high) return error('播放头位置或关键帧跨度超出片段，请调整播放头后粘贴')
    entries.push({ clipId: clip.id, key, frame, value: copied.value, easing: copied.easing })
  }
  // Downsampling can place copied keys on the same frame; the later value wins.
  return { entries: [...new Map(entries.map(e => [JSON.stringify([e.clipId, e.key, e.frame]), e])).values()], error: '' }
}
