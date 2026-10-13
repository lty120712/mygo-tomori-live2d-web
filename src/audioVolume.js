import { applyKeyEasing, normalizeEasing } from './keyframeEasing.js'

/** 单个片段的音量关键帧上限（含切割时自动补的切点关键帧）。 */
export const AUDIO_VOLUME_KEY_LIMIT = 64
/** 缓动区间在调度时按折线逼近的插值点数；线性区间不需要插值。 */
const EASING_SUBSTEPS = 6

const clamp01 = value => Math.max(0, Math.min(1, value))
const round4 = value => Math.round(value * 1e4) / 1e4

/**
 * 音量关键帧：`{ time, value, easing }`，time 是「素材内秒数」，与片段的 offset 同一坐标系
 * （时间线时间 = clip.start + time - clip.offset）。因此移动片段不需要改关键帧，
 * 裁剪也只是让窗口外的关键帧不再显示。
 */
export function normalizeVolumeKeyframes(list) {
  if (!Array.isArray(list)) return []
  const unique = new Map()
  for (const raw of list) {
    const time = Number(raw?.time), value = Number(raw?.value)
    if (!Number.isFinite(time) || !Number.isFinite(value) || time < 0) continue
    unique.set(round4(time), { time: round4(time), value: clamp01(value), easing: normalizeEasing(raw.easing) })
  }
  return [...unique.values()].sort((a, b) => a.time - b.time).slice(0, AUDIO_VOLUME_KEY_LIMIT)
}
export function sourceAtTimeline(clip, time) {
  return (clip.offset || 0) + (time - clip.start)
}
export function timelineAtSource(clip, source) {
  return clip.start + source - (clip.offset || 0)
}
/** 包络取值：关键帧之间按左侧关键帧的缓动插值；范围外保持首尾值；没有关键帧时恒为 1。 */
function envelopeAt(keys, source) {
  if (!keys.length) return 1
  const first = keys[0], last = keys[keys.length - 1]
  if (source <= first.time) return first.value
  if (source >= last.time) return last.value
  for (let index = keys.length - 1; index >= 0; index--) {
    const left = keys[index]
    if (source < left.time) continue
    const right = keys[index + 1]
    if (!right) return left.value
    const span = right.time - left.time
    const progress = span > 0 ? (source - left.time) / span : 1
    return clamp01(left.value + (right.value - left.value) * applyKeyEasing(progress, left.easing))
  }
  return first.value
}
export function volumeEnvelopeAt(keyframes, source) {
  return envelopeAt(normalizeVolumeKeyframes(keyframes), source)
}
/** 总音量与淡入淡出，不含关键帧包络。 */
export function fadeGainAt(clip, time) {
  const volume = clamp01(clip.volume ?? 1)
  const local = time - clip.start
  const fadeIn = Math.max(0, clip.fadeIn || 0), fadeOut = Math.max(0, clip.fadeOut || 0)
  let gain = volume
  if (fadeIn > 0) gain = Math.min(gain, volume * clamp01(local / fadeIn))
  if (fadeOut > 0) gain = Math.min(gain, volume * clamp01((clip.duration - local) / fadeOut))
  return clamp01(gain)
}
/** 音量曲线 = 总音量 × 淡入淡出 × 关键帧包络；没有关键帧时与旧行为完全一致。 */
export function audioGainAt(clip, time) {
  const keys = normalizeVolumeKeyframes(clip.volumeKeyframes)
  if (!keys.length) return fadeGainAt(clip, time)
  return clamp01(fadeGainAt(clip, time) * envelopeAt(keys, sourceAtTimeline(clip, time)))
}
/** 落在裁剪窗口内的关键帧，附带时间线时间，供时间线画菱形。 */
export function visibleVolumeKeys(clip) {
  const end = clip.start + clip.duration
  return normalizeVolumeKeyframes(clip.volumeKeyframes)
    .map(key => ({ source: key.time, time: timelineAtSource(clip, key.time), value: key.value, easing: key.easing }))
    .filter(key => key.time >= clip.start - 1e-8 && key.time <= end + 1e-8)
}
/**
 * 自动化的折线点：每个关键帧一条折点（保持段），缓动区间再补几个插值点，
 * 交给调度器用 setValueAtTime / linearRampToValueAtTime 逼近同一条曲线。
 */
export function volumeAutomationPoints(clip, from) {
  const keys = normalizeVolumeKeyframes(clip.volumeKeyframes)
  if (!keys.length) return []
  const end = clip.start + clip.duration
  const points = []
  const valueAt = time => clamp01(fadeGainAt(clip, time) * envelopeAt(keys, sourceAtTimeline(clip, time)))
  const push = time => {
    if (time > from + 1e-6 && time <= end + 1e-6) points.push({ time, value: valueAt(time) })
  }
  for (const [index, key] of keys.entries()) {
    const at = timelineAtSource(clip, key.time)
    push(at)
    const next = keys[index + 1]
    if (!next) break
    const to = timelineAtSource(clip, next.time)
    const steps = normalizeEasing(key.easing) === 'linear' ? 0 : EASING_SUBSTEPS
    for (let step = 1; step <= steps; step++) push(at + (to - at) * step / steps)
  }
  return points
    .sort((a, b) => a.time - b.time)
    .filter((point, index, all) => !index || point.time - all[index - 1].time > 1e-6)
}
/** 在素材内时间 source 处新增或覆盖关键帧，返回新的关键帧数组。 */
export function setVolumeKeyframe(keyframes, source, value, easing = 'linear') {
  const at = round4(Math.max(0, Number(source) || 0))
  const keys = normalizeVolumeKeyframes(keyframes).filter(key => Math.abs(key.time - at) > 1e-4)
  keys.push({ time: at, value: clamp01(Number(value) || 0), easing: normalizeEasing(easing) })
  return normalizeVolumeKeyframes(keys)
}
export function removeVolumeKeyframe(keyframes, source, tolerance = 1e-4) {
  const at = Number(source) || 0
  return normalizeVolumeKeyframes(keyframes).filter(key => Math.abs(key.time - at) > tolerance)
}
export function nearestVolumeKeyframe(keyframes, source, tolerance = 1e-4) {
  const at = Number(source) || 0
  return normalizeVolumeKeyframes(keyframes).find(key => Math.abs(key.time - at) <= tolerance) || null
}
/**
 * 切割音量关键帧：左段保留切点之前的关键帧，右段保留切点之后的；
 * 两侧都在切点补一个关键帧，因此跨越切点的斜坡在切割前后听感一致。
 */
export function splitVolumeKeyframes(keyframes, source) {
  const keys = normalizeVolumeKeyframes(keyframes)
  if (!keys.length) return { left: [], right: [] }
  const boundary = { time: round4(Math.max(0, source)), value: envelopeAt(keys, source), easing: 'linear' }
  return {
    left: normalizeVolumeKeyframes([...keys.filter(key => key.time < boundary.time - 1e-4), { ...boundary }]),
    right: normalizeVolumeKeyframes([{ ...boundary }, ...keys.filter(key => key.time > boundary.time + 1e-4)]),
  }
}
