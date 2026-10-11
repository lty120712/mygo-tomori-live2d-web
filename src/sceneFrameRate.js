import { normalizeMotionEvents } from './timelineEvents.js'
import { setClipKeyframe } from './sceneProject.js'

export function changeProjectFps(project, frame, next) {
  if (![24, 30, 60].includes(next) || next === project.fps) return frame
  const ratio = next / project.fps
  for (const clip of project.clips) {
    for (const [key, keys] of Object.entries(clip.keyframes)) {
      delete clip.keyframes[key]
      for (const k of keys) {
        const at = Math.round(k.frame * ratio)
        setClipKeyframe(clip, key, at, k.value)
        clip.keyframes[key].find(v => v.frame === at).easing = k.easing
      }
    }
    for (const event of clip.events) event.frame = Math.round(event.frame * ratio)
    normalizeMotionEvents(clip,next)
  }
  project.fps = next
  return Math.min(Math.round(project.duration * next), Math.round(frame * ratio))
}

export function stepFrameTime(time, fps, direction, duration) {
  const frame = Math.round(time * fps) + direction
  return Math.max(0, Math.min(Math.round(duration * fps), frame)) / fps
}
