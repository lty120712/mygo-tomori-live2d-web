import { uid, clipVisible, splitClip } from './sceneProject.js'
import { audioGainAt, normalizeVolumeKeyframes, splitVolumeKeyframes, volumeAutomationPoints } from './audioVolume.js'
import { normalizeAudioFilter } from './audioFilters.js'

export { audioGainAt, normalizeVolumeKeyframes } from './audioVolume.js'
export { AUDIO_FILTER_PRESETS, audioFilterLabel, audioFilterSpec, normalizeAudioFilter } from './audioFilters.js'

export const isImageClip = clip => !!clip?.assetId && !clip.model
export const visualClips = project => [...project.clips, ...(project.imageClips || [])]
export const imageClipVisible = clipVisible
export function visualClipLimit(clips) {
  if (clips.filter(c => !isImageClip(c)).length > 16) return '单个工程最多 16 个模型片段'
  if (clips.filter(isImageClip).length > 64) return '单个工程最多 64 个图片片段'
  return ''
}
export function appendVisualClips(project, clips) {
  project.clips.push(...clips.filter(c => !isImageClip(c)))
  project.imageClips.push(...clips.filter(isImageClip))
}
export function createImageClip(asset, start = 0, duration = 5, track = 0) {
  return {
    id: uid('image'), assetId: asset.id, name: asset.name, track, start, duration, offset: 0,
    width: asset.width, height: asset.height,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    keyframes: {}, params: {}, events: [],
    layerName: asset.name, layerLocked: false, layerHidden: false, layerSolo: false,
  }
}
// A scale of 100% fits the original aspect ratio inside the 960×540 reference canvas.
// Store source dimensions on the clip so geometry survives missing local assets.
export function imageDimensions(clip) {
  const width = clip.width > 0 ? clip.width : 320, height = clip.height > 0 ? clip.height : 180
  const ratio = Math.min(1, 960 / width, 540 / height)
  return { width: width * ratio, height: height * ratio }
}
export function visualPose(clip, transform) {
  return isImageClip(clip) ? { ...transform, ...imageDimensions(clip) } : transform
}

export const BACKGROUND_CLIP_LIMIT = 64
const BACKGROUND_COLOR = /^#[0-9a-f]{6}$/i

export function backgroundClipLimit(clips) {
  return clips.length >= BACKGROUND_CLIP_LIMIT ? '单个工程最多 64 个背景片段' : ''
}
export function createColorBackgroundClip(color, start = 0, duration = 5) {
  return { id: uid('bg'), kind: 'color', color: BACKGROUND_COLOR.test(color || '') ? color : '#00b140', assetId: '', name: '纯色背景', start, duration, fit: 'fill', layerHidden: false, layerSolo: false }
}
export function createImageBackgroundClip(asset, start = 0, duration = 5) {
  return { id: uid('bg'), kind: 'image', color: '', assetId: asset.id, name: asset.name || '背景图片', start, duration, fit: 'fill', layerHidden: false, layerSolo: false }
}
/** 背景是全屏铺满的单层：有片段就按片段，其次 legacy 图片，最后工程纯色兜底。 */
export function backgroundAtTime(clips, { color, image } = {}, time = 0) {
  // 隐藏的背景轨道按「没有片段覆盖」处理，继续回退旧背景图与兜底色。
  const clip = (clips || []).find(c => !c.layerHidden && time >= c.start - 1e-9 && time < c.start + c.duration - 1e-9)
  if (clip?.kind === 'image' && clip.assetId) return { kind: 'image', assetId: clip.assetId, name: clip.name }
  if (clip?.kind === 'color') return { kind: 'color', color: clip.color }
  if (image) return { kind: 'legacy-image', image }
  return { kind: 'color', color }
}
/**
 * 视觉层可见性（模型 / 图片 / 背景共用一个规则）：
 * 隐藏的轨道不画；任一视觉轨道（含背景）开启独见时，只画开启独见的轨道。
 */
export function visualLayerFilter(clips, backgroundClips = []) {
  const tracks = new Set((clips || []).filter(c => c.layerSolo).map(c => c.track))
  const background = (backgroundClips || []).some(c => c.layerSolo)
  const solo = tracks.size > 0 || background
  return {
    solo,
    clipVisible: clip => !solo || tracks.has(clip.track),
    backgroundVisible: () => !solo || background,
  }
}
/**
 * 添加背景片段：默认 5 秒，播放头到下一个片段或工程结尾不足 5 秒时自动填充剩余时长。
 * 播放头落在已有片段内部时无法插入（同一条轨道不能重叠）。
 */
export function planBackgroundAdd(clips, clip, { duration, fps, preferred = 5 }) {
  const limit = backgroundClipLimit(clips); if (limit) return { error: limit }
  const frame = 1 / fps, round = value => Math.round(value * fps) / fps
  const start = Math.max(0, Math.min(duration - frame, round(clip.start || 0)))
  if (clips.some(c => start >= c.start - 1e-8 && start < c.start + c.duration - 1e-8))
    return { error: '播放头位于已有背景片段内部，请先调整或删除该片段' }
  const next = clips.reduce((edge, c) => c.start > start + 1e-8 ? Math.min(edge, c.start) : edge, duration)
  const end = Math.min(start + preferred, next, duration)
  const length = Math.max(frame, round(end - start))
  return { clip: { ...clip, start, duration: length } }
}
/** 背景是单层轨道：列出还没有片段覆盖的时间空档，用于填入迁移出来的旧背景图。 */
export function backgroundGaps(clips, duration, fps = 30) {
  const frame = 1 / fps, round = value => Math.round(value * fps) / fps
  const occupied = (clips || []).map(c => ({ start: round(Math.max(0, c.start)), end: round(Math.min(duration, c.start + c.duration)) }))
    .filter(c => c.end > c.start + 1e-9).sort((a, b) => a.start - b.start)
  const gaps = []
  let at = 0
  for (const span of occupied) {
    if (span.start > at + 1e-9) gaps.push({ start: round(at), duration: round(span.start - at) })
    at = Math.max(at, span.end)
  }
  if (duration > at + 1e-9) gaps.push({ start: round(at), duration: round(duration - at) })
  return gaps
}

/** 复制背景片段：带走外观与时长；起点由粘贴时的播放头决定。 */
export function backgroundClipTemplate(clip) {
  const look = clip.kind === 'color'
    ? { kind: 'color', color: clip.color }
    : { kind: 'image', assetId: clip.assetId, name: clip.name }
  return { ...look, duration: clip.duration }
}
export function createClipFromTemplate(template, start = 0, duration = template.duration || 5) {
  return template.kind === 'color'
    ? createColorBackgroundClip(template.color, start, duration)
    : createImageBackgroundClip({ id: template.assetId, name: template.name }, start, duration)
}
/**
 * 把 legacy base64 背景图迁入素材库改写成背景片段并清空旧字段。
 * 只填补空档，因此迁移出来的片段不会和已有（或同一步新增的）片段重叠。
 */
export function migrateLegacyBackground(project, asset, extra = null) {
  const clips = backgroundGaps([...(project.backgroundClips || []), ...(extra ? [extra] : [])], project.duration, project.fps || 30)
    .map(gap => createImageBackgroundClip(asset, gap.start, gap.duration))
  project.backgroundClips = [...(project.backgroundClips || []), ...clips]
  project.backgroundImage = ''
  project.backgroundImageName = ''
  return clips
}
/** 背景绘制：图片拉伸铺满；素材缺失时回退纯色，保证画面不透明。 */
export function paintBackground(ctx, background, { width, height, bitmap, legacyImage, fallback }) {
  if (background?.kind === 'image' && bitmap) { ctx.drawImage(bitmap, 0, 0, width, height); return 'image' }
  if (background?.kind === 'legacy-image' && legacyImage) { ctx.drawImage(legacyImage, 0, 0, width, height); return 'legacy-image' }
  const color = background?.kind === 'color' && background.color ? background.color : fallback
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return background?.kind === 'color' && background.color ? 'color' : 'fallback'
}

export const AUDIO_CLIP_LIMIT = 32
export const AUDIO_TRACK_LIMIT = 8

export function audioClipLimit(clips) {
  return clips.length >= AUDIO_CLIP_LIMIT ? '单个工程最多 32 个音频片段' : ''
}
export function createAudioClip(asset, start = 0, duration = 5, track = 0) {
  return {
    id: uid('audio'), assetId: asset.id, name: asset.name || '音频', track: Math.max(0, Math.min(AUDIO_TRACK_LIMIT - 1, Math.round(track) || 0)),
    start, duration, offset: 0, volume: 1, fadeIn: 0, fadeOut: 0, filter: 'none', volumeKeyframes: [],
  }
}
/**
 * 添加音频片段时决定片段长度与工程时长：素材比工程剩余时长长时把工程补足到片段结尾
 * （上限 600 秒），避免长音频一进来就被截成工程剩余时长。
 */
export function audioClipPlacement(assetDuration, start, projectDuration, fps = 30, limit = 600) {
  const frame = 1 / fps, round = value => Math.round(value * fps) / fps
  const wanted = Math.max(frame, Number(assetDuration) || 0)
  const end = start + wanted
  const projectEnd = Math.min(limit, Math.max(projectDuration, end))
  return { duration: Math.max(frame, round(Math.min(end, projectEnd) - start)), projectDuration: projectEnd, truncated: end > projectEnd + 1e-9 }
}
export function audioClipsAtTime(clips, time) {
  return (clips || []).filter(c => time >= c.start - 1e-9 && time < c.start + c.duration - 1e-9)
}
/**
 * 静音与独奏属于轨道而不是片段（空轨道也能静音），存在工程的 audioTrackState 里：
 * `{ [track]: { muted, solo } }`。任一轨道独奏时只播独奏轨道，静音轨道始终不播。
 */
export function audibleAudioClips(clips, trackState = {}) {
  const soloed = new Set(Object.entries(trackState || {}).filter(([, state]) => state?.solo).map(([track]) => Number(track)))
  return (clips || []).filter(c => !trackState?.[c.track]?.muted && (!soloed.size || soloed.has(c.track)))
}
/**
 * 音量自动化点：关键帧折点（含缓动区间的插值点）与淡入淡出边界，
 * 按「相对起播时刻的延后秒数」排好序；调用方只负责按顺序 setValueAtTime / linearRampToValueAtTime。
 * 没有关键帧时只剩原来的淡入淡出行为，没有淡入淡出就是一条 setValueAtTime。
 */
function audioGainCues(clip, resumeAt, remaining, gain) {
  const clampCue = cue => ({ delay: cue.delay, value: Math.max(0, Math.min(1, cue.value)) })
  const cues = volumeAutomationPoints(clip, resumeAt).map(point => clampCue({ delay: point.time - resumeAt, value: point.value }))
  const fadeIn = Math.max(0, (clip.fadeIn || 0) - Math.max(0, resumeAt - clip.start))
  if (fadeIn > 0) {
    // 淡入窗口长于片段时只能升到片段结尾，按那一刻的真实音量收尾。
    const edge = Math.min(clip.start + (clip.fadeIn || 0), clip.start + clip.duration)
    const value = audioGainAt(clip, edge)
    if (value > gain + 1e-9) cues.push(clampCue({ delay: edge - resumeAt, value }))
  }
  const fadeOut = Math.max(0, clip.fadeOut || 0)
  if (fadeOut > 0) {
    const start = clip.start + clip.duration - fadeOut
    if (start > resumeAt + 1e-6) cues.push(clampCue({ delay: start - resumeAt, value: audioGainAt(clip, start) }))
    cues.push(clampCue({ delay: remaining, value: 0 }))
  }
  return cues
    .filter(cue => cue.delay > 1e-6 && cue.delay <= remaining + 1e-6)
    .sort((a, b) => a.delay - b.delay)
    .filter((cue, index, all) => !index || Math.abs(cue.delay - all[index - 1].delay) > 1e-6 || Math.abs(cue.value - all[index - 1].value) > 1e-9)
}
/**
 * 播放计划：给定播放头时间，算出这一刻要启动的音频源。
 * 每个条目带素材内起播秒数（源偏移 + 已播放部分）、剩余时长、剩余淡入淡出窗口、滤镜与音量自动化点，
 * 因此跳帧、循环回绕后重新计算即可，不依赖累计时间，不会漂移。
 */
export function planAudioPlayback(clips, time, { trackState = {}, includeFuture = false } = {}) {
  const audible = audibleAudioClips(clips, trackState)
  return (includeFuture ? audible.filter(c => c.start + c.duration > time) : audioClipsAtTime(audible, time))
    .slice()
    .sort((a, b) => a.start - b.start || (a.track ?? 0) - (b.track ?? 0) || String(a.id).localeCompare(String(b.id)))
    .map(clip => {
      const elapsed = Math.max(0, time - clip.start)
      const remaining = Math.max(0, clip.duration - elapsed)
      const resumeAt = Math.max(time, clip.start)
      const gain = audioGainAt(clip, resumeAt)
      return {
        id: clip.id, assetId: clip.assetId, name: clip.name, track: clip.track,
        offset: Math.max(0, (clip.offset || 0) + elapsed),
        duration: remaining,
        delay: Math.max(0, clip.start - time),
        gain,
        volume: Math.max(0, Math.min(1, clip.volume ?? 1)),
        // 淡入是从片段起点开始的窗口，中途起播时只剩没走完的部分；淡出固定在片段末尾。
        fadeIn: Math.max(0, Math.min((clip.fadeIn || 0) - elapsed, remaining)),
        fadeOut: Math.max(0, Math.min(clip.fadeOut || 0, remaining)),
        filter: normalizeAudioFilter(clip.filter),
        cues: audioGainCues(clip, resumeAt, remaining, gain),
      }
    })
}
/** 复制音频片段：带走素材、时长、音量、淡入淡出、滤镜与音量关键帧；轨道与起点由粘贴时决定。 */
export function audioClipTemplate(clip) {
  return {
    assetId: clip.assetId, name: clip.name, duration: clip.duration,
    volume: clip.volume ?? 1, fadeIn: clip.fadeIn || 0, fadeOut: clip.fadeOut || 0, offset: clip.offset || 0,
    filter: normalizeAudioFilter(clip.filter),
    volumeKeyframes: normalizeVolumeKeyframes(clip.volumeKeyframes).map(key => ({ ...key })),
  }
}
export function createAudioClipFromTemplate(template, start = 0, duration = template.duration || 5, track = 0) {
  const clip = createAudioClip({ id: template.assetId, name: template.name }, start, duration, track)
  clip.volume = Math.max(0, Math.min(1, template.volume ?? 1))
  clip.fadeIn = Math.max(0, Math.min(template.fadeIn || 0, duration))
  clip.fadeOut = Math.max(0, Math.min(template.fadeOut || 0, duration))
  clip.offset = Math.max(0, template.offset || 0)
  clip.filter = normalizeAudioFilter(template.filter)
  clip.volumeKeyframes = normalizeVolumeKeyframes(template.volumeKeyframes)
  return clip
}
/**
 * 在播放头切割音频片段：右半段源偏移随切割点前移；淡入留给前半段、淡出留给后半段，
 * 音量关键帧按切点对应的素材时间拆分并在两侧补上切点关键帧，
 * 因此切割不会凭空多出或丢掉淡入淡出与音量包络。播放头不在片段内部时返回 null。
 */
export function splitAudioClip(clip, time) {
  const right = splitClip(clip, time)
  if (!right) return null
  right.fadeIn = 0
  right.fadeOut = Math.min(right.fadeOut || 0, right.duration)
  clip.fadeIn = Math.min(clip.fadeIn || 0, clip.duration)
  clip.fadeOut = 0
  const cut = (clip.offset || 0) + (right.start - clip.start)
  const keys = splitVolumeKeyframes(clip.volumeKeyframes, cut)
  clip.volumeKeyframes = keys.left
  right.volumeKeyframes = keys.right
  return right
}
