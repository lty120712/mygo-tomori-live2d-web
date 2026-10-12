import { normalizeMotionEvents } from './timelineEvents.js'
import { applyKeyEasing,normalizeEasing } from './keyframeEasing.js'
import { normalizeParamValues } from './params.js'

export const SCENE_VERSION = 3
export const SCENE_WIDTH = 960
export const SCENE_HEIGHT = 540
export function sceneSize(aspectRatio){return aspectRatio==='9:16' ? {width:540,height:960} : {width:960,height:540}}
export function uid(prefix = 'clip') {
  return prefix + '-' + crypto.randomUUID()
}
export function createProject() {
  return { version: SCENE_VERSION, aspectRatio:'16:9', fps: 30, duration: 10, background: '#00b140', backgroundImage: '', backgroundImageName: '', clips: [] }
}
export function createClip(model, start = 0, duration = 5, track = 0) {
  return {
    id: uid(), model: model.category + '/' + model.name, entry: model.entry || 'model.json',
    name: model.name, layerName:model.name, layerLocked:false, layerHidden:false, track, start, duration, offset: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    mouseTrack: true, params: {}, keyframes: {}, events: [],
  }
}
export function clipVisible(clip, time) {
  return !clip.layerHidden && time >= clip.start && time < clip.start + clip.duration
}
export function localFrame(clip, time, fps) {
  return Math.max(0, Math.round((time - clip.start + clip.offset) * fps))
}
export function sampleTrack(keys, frame, fallback) {
  if (!keys?.length) return fallback
  if (frame <= keys[0].frame) return keys[0].value
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i]
    if (frame > b.frame) continue
    let t = (frame - a.frame) / (b.frame - a.frame)
    t = applyKeyEasing(t,a.easing)
    return a.value + (b.value - a.value) * t
  }
  return keys.at(-1).value
}
export function setClipKeyframe(clip, key, frame, value) {
  const list = clip.keyframes[key] ||= []
  const hit = list.find(k => k.frame === frame)
  if (hit) hit.value = value
  else list.push({ frame, value, easing: 'linear' })
  list.sort((a, b) => a.frame - b.frame)
}
export function removeClipKeyframe(clip, key, frame) {
  if (!clip.keyframes[key]) return
  clip.keyframes[key] = clip.keyframes[key].filter(k => k.frame !== frame)
  if (!clip.keyframes[key].length) delete clip.keyframes[key]
}
export function motionEventsAtTick(clip, previousFrame, frame, entering, fps) {
  const previous = entering ? Math.round(clip.offset * fps) - 1 : previousFrame
  return clip.events.filter(e => e.type === 'motion' && e.frame > previous && e.frame <= frame &&
    (!entering || e.frame === frame || e.frame + e.duration * fps > frame))
}
export function sampleClip(clip, time, fps, groups = []) {
  const frame = localFrame(clip, time, fps)
  const params = { ...clip.params }, transform = { ...clip.transform }
  for (const [key, keys] of Object.entries(clip.keyframes)) {
    if (key.startsWith('@')) transform[key.slice(1)] = sampleTrack(keys, frame, transform[key.slice(1)])
    else params[key] = sampleTrack(keys, frame, params[key] ?? 0)
  }
  return { frame, params: normalizeParamValues(params, groups), transform }
}
export function splitClip(clip, time) {
  const elapsed = time - clip.start
  if (elapsed <= 0 || elapsed >= clip.duration) return null
  const right = structuredClone(clip)
  right.id = uid()
  right.start = time
  right.duration -= elapsed
  right.offset += elapsed
  clip.duration = elapsed
  return right
}

function number(value, fallback, min, max) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}
export function readProject(data, models) {
  if (!data || typeof data !== 'object') throw new Error('无效工程')
  const project = createProject()
  project.aspectRatio=data.aspectRatio==='9:16' ? '9:16' : '16:9'
  project.fps = Math.round(number(data.fps, 30, 1, 60))
  project.duration = number(data.duration, 10, .5, 600)
  if (typeof data.background === 'string' && /^#[0-9a-f]{6}$/i.test(data.background)) project.background = data.background
  if (typeof data.backgroundImage === 'string' && data.backgroundImage) {
    if(data.backgroundImage.length > 4_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.backgroundImage))throw new Error('背景图片数据无效或过大')
    project.backgroundImage=data.backgroundImage
    project.backgroundImageName=typeof data.backgroundImageName==='string' ? data.backgroundImageName : '背景图片'
  }
  if (data.version !== SCENE_VERSION) throw new Error('无法识别工程版本，仅支持多模型场景工程')
  const source = data.clips
  if (!Array.isArray(source)) throw new Error('缺少模型片段')
  if (source.length > 16) throw new Error('单个工程最多 16 个模型片段')
  project.clips = source.map((raw, index) => {
    const model = models.find(m => m.category + '/' + m.name === raw.model)
    if (!model) throw new Error('模型素材不存在：' + raw.model)
    const clip = createClip(model)
    clip.name = typeof raw.name === 'string' ? raw.name : model.name
    clip.layerName = typeof raw.layerName==='string' && raw.layerName.trim() ? raw.layerName.trim().slice(0,100) : model.name
    clip.mouseTrack = raw.mouseTrack !== false
    clip.layerLocked = raw.layerLocked === true
    clip.layerHidden = raw.layerHidden === true
    clip.track = Math.round(number(raw.track, index, 0, 15))
    clip.start = number(raw.start, 0, 0, project.duration - 1 / project.fps)
    clip.duration = number(raw.duration, project.duration - clip.start, 1 / project.fps, project.duration - clip.start)
    clip.offset = number(raw.offset, 0, 0, 600)
    for (const [key, min, max] of [['x', -1920, 1920], ['y', -1080, 1080], ['scale', .1, 5], ['rotation', -180, 180], ['opacity', 0, 1]]) {
      clip.transform[key] = number(raw.transform?.[key], clip.transform[key], min, max)
    }
    for (const [key, value] of Object.entries(raw.params || {})) if (Number.isFinite(value)) clip.params[key] = value
    for (const [key, keys] of Object.entries(raw.keyframes || {})) {
      if (!Array.isArray(keys)) continue
      for (const k of keys) if (Number.isFinite(k.frame) && k.frame >= 0 && Number.isFinite(k.value)) {
        setClipKeyframe(clip, key, Math.round(k.frame), k.value)
        const easing = normalizeEasing(k.easing)
        clip.keyframes[key].find(v => v.frame === Math.round(k.frame)).easing = easing
      }
    }
    clip.events = (Array.isArray(raw.events) ? raw.events : []).filter(e =>
      ['motion', 'expression'].includes(e.type) && typeof e.name === 'string' && Number.isFinite(e.frame) && e.frame >= 0
    ).map(e => ({ id:uid('event'), type:e.type, name:e.name, frame:Math.round(e.frame), ...(e.type==='expression' && typeof e.motionLinked==='boolean' ? {motionLinked:e.motionLinked} : {}), duration:e.type==='expression' ? 0 : number(e.duration,0,0,600), offset:e.type==='expression' ? 0 : number(e.offset,0,0,600), sourceDuration:e.type==='expression' ? 0 : number(e.sourceDuration,e.duration || 0,0,600) }))
      .sort((a, b) => a.frame - b.frame)
    normalizeMotionEvents(clip,project.fps)
    return clip
  })
  for(const track of new Set(project.clips.map(c=>c.track))){const first=project.clips.find(c=>c.track===track);for(const clip of project.clips.filter(c=>c.track===track)){clip.layerName=first.layerName;clip.layerLocked=first.layerLocked;clip.layerHidden=first.layerHidden}}
  return project
}
