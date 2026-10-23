import { normalizeMotionEvents } from './timelineEvents.js'
import { applyKeyEasing,normalizeEasing } from './keyframeEasing.js'
import { normalizeParamValues } from './params.js'
import { VISUAL_TRACK_LIMIT, AUDIO_CLIP_LIMIT, AUDIO_TRACK_LIMIT, BACKGROUND_CLIP_LIMIT, VIDEO_CLIP_LIMIT, createAudioClip, createColorBackgroundClip, createImageBackgroundClip, createImageClip, visualClips } from './mediaTracks.js'
import { normalizeVolumeKeyframes } from './audioVolume.js'
import { normalizeAudioFilter } from './audioFilters.js'
import { normalizeBlendMode } from './visualComposite.js'
import { isTextClip, normalizeText, normalizeTextStyle, TEXT_CLIP_LIMIT } from './textTracks.js'

export const SCENE_VERSION = 4
export const SCENE_WIDTH = 960
export const SCENE_HEIGHT = 540
export function sceneSize(aspectRatio){return aspectRatio==='9:16' ? {width:540,height:960} : {width:960,height:540}}
export function uid(prefix = 'clip') {
  return prefix + '-' + crypto.randomUUID()
}
export function createProject() {
  return { version: SCENE_VERSION, aspectRatio:'16:9', fps: 30, duration: 10, background: '#00b140', backgroundImage: '', backgroundImageName: '', clips: [], imageClips: [], backgroundClips: [], audioClips: [], audioTrackState: {}, assets: {} }
}
export function createClip(model, start = 0, duration = 5, track = 0) {
  return {
    id: uid(), model: model.category + '/' + model.name, entry: model.entry || 'model.json',
    name: model.name, layerName:model.name, layerLocked:false, layerHidden:false, layerSolo:false, track, start, duration, offset: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    mouseTrack: true, blendMode:'source-over', params: {}, keyframes: {}, events: [],
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
  // 用 JSON 深拷贝：调用方传进来的常是 Vue 响应式对象，structuredClone 在 Proxy 上会抛错。
  const right = JSON.parse(JSON.stringify(clip))
  right.id = uid()
  right.start = time
  right.duration -= elapsed
  // 只有带源偏移的片段（模型 / 图片 / 音频）才推进偏移；背景片段没有这个字段。
  if (typeof right.offset === 'number') right.offset += elapsed
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
  if (data.version !== 3 && data.version !== SCENE_VERSION) throw new Error('无法识别工程版本，仅支持多模型场景工程')
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
    clip.blendMode = normalizeBlendMode(raw.blendMode)
    clip.layerLocked = raw.layerLocked === true
    clip.layerHidden = raw.layerHidden === true
    clip.layerSolo = raw.layerSolo === true
    clip.track = Math.round(number(raw.track, index, 0, VISUAL_TRACK_LIMIT-1))
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
  if (data.version === 4 && data.imageClips != null) {
    if (!Array.isArray(data.imageClips)) throw new Error('图片片段列表无效')
    if (data.imageClips.length > 64+VIDEO_CLIP_LIMIT+TEXT_CLIP_LIMIT) throw new Error('单个工程的视觉素材片段过多')
    if (data.imageClips.filter(c=>!isTextClip(c)).length > 96) throw new Error('单个工程的图片与视频片段过多')
    project.imageClips = data.imageClips.map((raw, index) => {
      const text=isTextClip(raw)
      if (!raw || (!text && (typeof raw.assetId !== 'string' || !raw.assetId.trim()))) throw new Error('图片片段缺少素材引用')
      const video = raw.media === 'video'
      const clip = createImageClip({ id: raw.assetId, name: typeof raw.name === 'string' ? raw.name : (video ? '视频' : '图片'), width: number(raw.width, 320, 1, 65536), height: number(raw.height, 180, 1, 65536) })
      clip.blendMode = normalizeBlendMode(raw.blendMode)
      if(text){delete clip.assetId;clip.media='text';clip.text=normalizeText(raw.text);clip.textStyle=normalizeTextStyle(raw.textStyle)}
      if (video) {
        clip.media = 'video'
        clip.videoMuted = raw.videoMuted === true
        clip.videoVolume = number(raw.videoVolume, 1, 0, 1)
      }
      clip.track = Math.round(number(raw.track, project.clips.length + index, 0, VISUAL_TRACK_LIMIT-1))
      clip.start = number(raw.start, 0, 0, project.duration - 1 / project.fps)
      clip.duration = number(raw.duration, project.duration - clip.start, 1 / project.fps, project.duration - clip.start)
      clip.offset = number(raw.offset, 0, 0, 600)
      clip.layerName = typeof raw.layerName === 'string' && raw.layerName.trim() ? raw.layerName.trim().slice(0,100) : clip.name
      clip.layerLocked = raw.layerLocked === true
      clip.layerHidden = raw.layerHidden === true
      clip.layerSolo = raw.layerSolo === true
      for (const [key, min, max] of [['x', -1920, 1920], ['y', -1080, 1080], ['scale', .1, 5], ['rotation', -180, 180], ['opacity', 0, 1]]) {
        clip.transform[key] = number(raw.transform?.[key], clip.transform[key], min, max)
        for (const k of Array.isArray(raw.keyframes?.['@'+key]) ? raw.keyframes['@'+key] : []) {
          if (!k || !Number.isFinite(k.frame) || k.frame < 0 || !Number.isFinite(k.value)) continue
          const at = Math.round(k.frame)
          setClipKeyframe(clip, '@'+key, at, number(k.value, 0, min, max))
          clip.keyframes['@'+key].find(v => v.frame === at).easing = normalizeEasing(k.easing)
        }
      }
      return clip
    })
    if (project.imageClips.filter(c => c.media === 'video').length > VIDEO_CLIP_LIMIT) throw new Error('单个工程最多 32 个视频片段')
    if (project.imageClips.filter(c => c.media !== 'video' && !isTextClip(c)).length > 64) throw new Error('单个工程最多 64 个图片片段')
    if (project.imageClips.filter(isTextClip).length > TEXT_CLIP_LIMIT) throw new Error(`单个工程最多 ${TEXT_CLIP_LIMIT} 个文字片段`)
  }
  if (data.version === 4 && data.audioTrackState != null) {
    if (typeof data.audioTrackState !== 'object' || Array.isArray(data.audioTrackState)) throw new Error('音频轨道状态无效')
    for (const [key, state] of Object.entries(data.audioTrackState)) {
      const track = Number(key)
      if (!Number.isInteger(track) || track < 0 || track >= AUDIO_TRACK_LIMIT || !state || typeof state !== 'object') continue
      project.audioTrackState[track] = { muted: state.muted === true, solo: state.solo === true }
    }
  }
  if (data.version === 4 && data.backgroundClips != null) {
    if (!Array.isArray(data.backgroundClips)) throw new Error('背景片段列表无效')
    if (data.backgroundClips.length > BACKGROUND_CLIP_LIMIT) throw new Error('单个工程最多 64 个背景片段')
    project.backgroundClips = data.backgroundClips.map(raw => {
      if (!raw || (raw.kind !== 'color' && raw.kind !== 'image')) throw new Error('背景片段类型无效')
      const assetId = typeof raw.assetId === 'string' ? raw.assetId.trim() : ''
      if (raw.kind === 'image' && !assetId) throw new Error('背景片段缺少素材引用')
      const clip = raw.kind === 'image'
        ? createImageBackgroundClip({ id: assetId, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 200) : '背景图片' })
        : createColorBackgroundClip(raw.color)
      clip.start = number(raw.start, 0, 0, project.duration - 1 / project.fps)
      clip.duration = number(raw.duration, project.duration - clip.start, 1 / project.fps, project.duration - clip.start)
      clip.layerHidden = raw.layerHidden === true
      clip.layerSolo = raw.layerSolo === true
      return clip
    })
  }
  if (data.version === 4 && data.audioClips != null) {
    if (!Array.isArray(data.audioClips)) throw new Error('音频片段列表无效')
    if (data.audioClips.length > AUDIO_CLIP_LIMIT) throw new Error('单个工程最多 32 个音频片段')
    project.audioClips = data.audioClips.map(raw => {
      if (!raw || typeof raw.assetId !== 'string' || !raw.assetId.trim()) throw new Error('音频片段缺少素材引用')
      const clip = createAudioClip({ id: raw.assetId.trim(), name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 200) : '' })
      clip.track = Math.round(number(raw.track, 0, 0, AUDIO_TRACK_LIMIT - 1))
      clip.start = number(raw.start, 0, 0, project.duration - 1 / project.fps)
      clip.duration = number(raw.duration, project.duration - clip.start, 1 / project.fps, project.duration - clip.start)
      clip.offset = number(raw.offset, 0, 0, 6000)
      clip.volume = number(raw.volume, 1, 0, 1)
      clip.fadeIn = number(raw.fadeIn, 0, 0, clip.duration)
      clip.fadeOut = number(raw.fadeOut, 0, 0, clip.duration)
      clip.filter = normalizeAudioFilter(raw.filter)
      clip.volumeKeyframes = normalizeVolumeKeyframes(raw.volumeKeyframes)
      return clip
    })
  }
  const all = visualClips(project)
  for(const track of new Set(all.map(c=>c.track))){const first=all.find(c=>c.track===track);for(const clip of all.filter(c=>c.track===track)){clip.layerName=first.layerName;clip.layerLocked=first.layerLocked;clip.layerHidden=first.layerHidden}}
  // Packed assets (assets) are reserved for later.
  if (data.version === 3) {
    project.imageClips = []
    project.backgroundClips = []
    project.audioClips = []
    project.assets = {}
  }
  return project
}
