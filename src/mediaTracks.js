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
