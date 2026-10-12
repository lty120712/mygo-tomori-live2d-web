import { uid, clipVisible } from './sceneProject.js'

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
    layerName: asset.name, layerLocked: false, layerHidden: false,
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
  return { id: uid('bg'), kind: 'color', color: BACKGROUND_COLOR.test(color || '') ? color : '#00b140', assetId: '', name: '纯色背景', start, duration, fit: 'fill' }
}
export function createImageBackgroundClip(asset, start = 0, duration = 5) {
  return { id: uid('bg'), kind: 'image', color: '', assetId: asset.id, name: asset.name || '背景图片', start, duration, fit: 'fill' }
}
/** 背景是全屏铺满的单层：有片段就按片段，其次 legacy 图片，最后工程纯色兜底。 */
export function backgroundAtTime(clips, { color, image } = {}, time = 0) {
  const clip = (clips || []).find(c => time >= c.start - 1e-9 && time < c.start + c.duration - 1e-9)
  if (clip?.kind === 'image' && clip.assetId) return { kind: 'image', assetId: clip.assetId, name: clip.name }
  if (clip?.kind === 'color') return { kind: 'color', color: clip.color }
  if (image) return { kind: 'legacy-image', image }
  return { kind: 'color', color }
}
export function planBackgroundAdd(clips, clip, { duration, fps }) {
  const limit = backgroundClipLimit(clips); if (limit) return { error: limit }
  const frame = 1 / fps, round = value => Math.round(value * fps) / fps
  const start = Math.max(0, Math.min(duration - frame, round(clip.start || 0)))
  const length = Math.max(frame, Math.min(duration - start, round(clip.duration || 0)))
  const placed = { ...clip, start, duration: length }
  if (clips.some(c => placed.start < c.start + c.duration - 1e-8 && placed.start + placed.duration > c.start + 1e-8))
    return { error: '背景片段不能重叠；请先调整相邻片段的时长或位置' }
  return { clip: placed }
}
/** 把 legacy base64 背景图迁入素材库后的元数据，转成一条全长背景片段并清空旧字段。 */
export function migrateLegacyBackground(project, asset) {
  const clip = createImageBackgroundClip(asset, 0, project.duration)
  project.backgroundClips = [...(project.backgroundClips || []), clip]
  project.backgroundImage = ''
  project.backgroundImageName = ''
  return clip
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
