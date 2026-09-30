import { ref, reactive, computed } from 'vue'

const DEFAULT_FPS = 30
const DEFAULT_DURATION = 3

const EASING_TYPES = ['linear', 'easeIn', 'easeOut', 'easeInOut']
const EASING_LABELS = { linear: '线性', easeIn: '缓入', easeOut: '缓出', easeInOut: '缓入缓出' }

function applyEasing(t, type) {
  switch (type) {
    case 'easeIn': return t * t * t
    case 'easeOut': return 1 - Math.pow(1 - t, 3)
    case 'easeInOut': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    default: return t
  }
}

export function useKeyframeAnimation() {
  const fps = ref(DEFAULT_FPS)
  const duration = ref(DEFAULT_DURATION)
  const currentFrame = ref(0)
  const isPlaying = ref(false)
  const keyframes = reactive({})

  const isLooping = ref(false)

  const totalFrames = computed(() => Math.floor(fps.value * duration.value))
  const currentTime = computed(() => currentFrame.value / fps.value)

  let animFrameId = null
  let lastTimestamp = null
  let tickCallback = null

  function ensureParam(paramKey) {
    if (!keyframes[paramKey]) {
      keyframes[paramKey] = []
    }
    return keyframes[paramKey]
  }

  function setKeyframe(paramKey, frame, value) {
    const numericFrame = Number(frame)
    const numericValue = Number(value)
    if (!paramKey || !Number.isFinite(numericFrame) || !Number.isFinite(numericValue)) return false
    const f = Math.max(0, Math.min(totalFrames.value, Math.round(numericFrame)))
    const kfs = ensureParam(paramKey)
    const idx = kfs.findIndex(k => k.frame === f)
    if (idx >= 0) {
      kfs[idx].value = numericValue
    } else {
      kfs.push({ frame: f, value: numericValue, easing: 'linear' })
    }
    kfs.sort((a, b) => a.frame - b.frame)
    return true
  }

  function removeKeyframe(paramKey, frame) {
    const f = Math.round(frame)
    if (!keyframes[paramKey]) return
    const idx = keyframes[paramKey].findIndex(k => k.frame === f)
    if (idx >= 0) {
      keyframes[paramKey].splice(idx, 1)
      if (keyframes[paramKey].length === 0) {
        delete keyframes[paramKey]
      }
    }
  }

  function hasKeyframe(paramKey, frame) {
    const f = Math.round(frame)
    return keyframes[paramKey]?.some(k => k.frame === f) ?? false
  }

  function getKfEasing(paramKey, frame) {
    const f = Math.round(frame)
    const kf = keyframes[paramKey]?.find(k => k.frame === f)
    return kf?.easing || 'linear'
  }

  function cycleEasingAtFrame(frame) {
    const f = Math.round(frame)
    for (const paramKey of Object.keys(keyframes)) {
      const kf = keyframes[paramKey].find(k => k.frame === f)
      if (kf) {
        const idx = EASING_TYPES.indexOf(kf.easing || 'linear')
        kf.easing = EASING_TYPES[(idx + 1) % EASING_TYPES.length]
      }
    }
  }

  function getEasingLabel(type) {
    return EASING_LABELS[type] || '线性'
  }

  const events = reactive([])

  // 动作事件会占用一段区间，区间内不能再放别的动作。
  // 这些区间是判断能否放置、画多宽、下一个空位在哪里的公共依据。
  function getMotionRanges(ignoreIndex = -1) {
    const ranges = []
    for (let i = 0; i < events.length; i++) {
      if (i === ignoreIndex) continue
      const e = events[i]
      if (e.type !== 'motion') continue
      const start = e.frame
      const end = start + Math.max(0, e.duration || 0) * fps.value
      ranges.push({ index: i, name: e.name, start, end })
    }
    return ranges.sort((a, b) => a.start - b.start)
  }

  function overlapsOtherMotion(start, end, ignoreIndex) {
    for (const range of getMotionRanges(ignoreIndex)) {
      if (start < range.end && end > range.start) return true
    }
    return false
  }

  /** 从 from 帧往后找第一个没有被动作事件占用的帧 */
  function findFreeFrame(from) {
    const numeric = Number(from)
    let f = Math.max(0, Math.min(totalFrames.value, Number.isFinite(numeric) ? Math.round(numeric) : 0))
    const ranges = getMotionRanges()
    for (let guard = 0; guard < 500; guard++) {
      const hit = ranges.find(r => f >= r.start && f < r.end)
      if (!hit) return f
      const next = Math.ceil(hit.end)
      if (next <= f) return f
      f = Math.min(totalFrames.value, next)
      if (f >= totalFrames.value) return f
    }
    return f
  }

  function canAddMotionEvent(frame, durationSec) {
    const start = Number(frame)
    const duration = Number(durationSec)
    if (totalFrames.value === 0 || !Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) return false
    const clampedStart = Math.max(0, Math.min(totalFrames.value, Math.round(start)))
    const end = clampedStart + duration * fps.value
    return !overlapsOtherMotion(clampedStart, end, -1)
  }

  function addEvent(type, name, frame, durationSec) {
    if (!['motion', 'expression'].includes(type) || typeof name !== 'string' || !name) return false
    const numericFrame = Number(frame)
    if (!Number.isFinite(numericFrame)) return false
    const f = Math.max(0, Math.min(totalFrames.value, Math.round(numericFrame)))
    const duration = Math.max(0, Number(durationSec) || 0)
    if (type === 'motion' && !canAddMotionEvent(f, duration)) return false
    if (type === 'expression' && events.some(e => e.type === 'expression' && e.frame === f)) return false
    events.push({ type, name, frame: f, duration })
    events.sort((a, b) => a.frame - b.frame)
    return true
  }

  function removeEvent(index) {
    events.splice(index, 1)
  }

  /** 把已有事件挪到新的起始帧；与其它动作重叠时拒绝并保持原位 */
  function moveEvent(index, frame) {
    const ev = events[index]
    if (!ev) return false
    const numeric = Number(frame)
    if (!Number.isFinite(numeric)) return false
    let target = Math.max(0, Math.min(totalFrames.value, Math.round(numeric)))
    if (ev.type === 'motion') {
      // 动作不能越过时间轴末尾，往前夹到刚好放得下
      const length = Math.max(0, ev.duration || 0) * fps.value
      target = Math.min(target, Math.max(0, Math.floor(totalFrames.value - length)))
    }
    if (target === ev.frame) return true

    if (ev.type === 'motion') {
      const end = target + Math.max(0, ev.duration || 0) * fps.value
      if (overlapsOtherMotion(target, end, index)) return false
    } else if (events.some((e, i) => i !== index && e.type === 'expression' && e.frame === target)) {
      return false
    }

    ev.frame = target
    events.sort((a, b) => a.frame - b.frame)
    return true
  }

  function getActiveEventsAtFrame(frame) {
    const f = Math.round(frame)
    return events.filter(e => {
      if (e.type === 'expression') return e.frame === f
      const eEnd = e.frame + (e.duration || 0) * fps.value
      return f >= e.frame && f < eEnd
    })
  }

  function getKeyframesForParam(paramKey) {
    return [...(keyframes[paramKey] || [])]
  }

  function getValueAtFrame(paramKey, frame) {
    const kfs = keyframes[paramKey]
    if (!kfs || kfs.length === 0) return null
    if (kfs.length === 1) return kfs[0].value

    const f = Math.max(0, frame)

    if (f <= kfs[0].frame) return kfs[0].value
    if (f >= kfs[kfs.length - 1].frame) return kfs[kfs.length - 1].value

    for (let i = 0; i < kfs.length - 1; i++) {
      if (f >= kfs[i].frame && f <= kfs[i + 1].frame) {
        const range = kfs[i + 1].frame - kfs[i].frame
        if (range === 0) return kfs[i].value
        const t = (f - kfs[i].frame) / range
        const eased = applyEasing(t, kfs[i].easing || 'linear')
        return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * eased
      }
    }
    return null
  }

  function getAllValuesAtFrame(frame, defaults) {
    const result = { ...defaults }
    for (const paramKey of Object.keys(keyframes)) {
      const val = getValueAtFrame(paramKey, frame)
      if (val !== null) {
        result[paramKey] = val
      }
    }
    return result
  }

  function getKeyframedValuesAtFrame(frame) {
    const result = {}
    for (const paramKey of Object.keys(keyframes)) {
      const val = getValueAtFrame(paramKey, frame)
      if (val !== null) {
        result[paramKey] = val
      }
    }
    return result
  }

  function getAllKeyframedParams() {
    return Object.keys(keyframes).filter(k => keyframes[k].length > 0)
  }

  function getAllKeyframes() {
    const result = []
    for (const paramKey of Object.keys(keyframes)) {
      for (const kf of keyframes[paramKey]) {
        result.push({ paramKey, frame: kf.frame, value: kf.value })
      }
    }
    return result
  }

  function getUniqueFramePositions() {
    const frames = new Set()
    for (const paramKey of Object.keys(keyframes)) {
      for (const kf of keyframes[paramKey]) {
        frames.add(kf.frame)
      }
    }
    return [...frames].sort((a, b) => a - b)
  }

  function goToFrame(frame) {
    currentFrame.value = Math.max(0, Math.min(totalFrames.value, Math.round(frame)))
  }

  function goToStart() { goToFrame(0) }
  function goToEnd() { goToFrame(totalFrames.value) }

  function goToPrevKeyframe() {
    const frames = getUniqueFramePositions()
    const cf = Math.floor(currentFrame.value)
    for (let i = frames.length - 1; i >= 0; i--) {
      if (frames[i] < cf) {
        goToFrame(frames[i])
        return
      }
    }
    goToFrame(0)
  }

  function goToNextKeyframe() {
    const frames = getUniqueFramePositions()
    const cf = Math.floor(currentFrame.value)
    for (const f of frames) {
      if (f > cf) {
        goToFrame(f)
        return
      }
    }
    goToFrame(totalFrames.value)
  }

  function play(onTick, onEnd) {
    if (isPlaying.value) return
    if (currentFrame.value >= totalFrames.value) {
      currentFrame.value = 0
    }
    isPlaying.value = true
    lastTimestamp = null
    tickCallback = onTick
    let tickEndCb = onEnd

    function tick(timestamp) {
      if (!isPlaying.value) return
      if (lastTimestamp === null) lastTimestamp = timestamp

      const deltaMs = timestamp - lastTimestamp
      lastTimestamp = timestamp
      const deltaFrames = (deltaMs / 1000) * fps.value
      currentFrame.value = Math.min(totalFrames.value, currentFrame.value + deltaFrames)

      if (tickCallback) tickCallback(currentFrame.value)

      if (currentFrame.value >= totalFrames.value) {
        if (isLooping.value) {
          currentFrame.value = 0
          lastTimestamp = null
          animFrameId = requestAnimationFrame(tick)
        } else {
          stop()
          if (tickEndCb) tickEndCb()
        }
      } else {
        animFrameId = requestAnimationFrame(tick)
      }
    }
    animFrameId = requestAnimationFrame(tick)
  }

  function pause() {
    isPlaying.value = false
    tickCallback = null
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    lastTimestamp = null
  }

  function stop() {
    pause()
    currentFrame.value = 0
  }

  function setDuration(val) {
    const next = Number(val)
    if (!Number.isFinite(next)) return
    duration.value = Math.max(0.1, next)
    if (currentFrame.value > totalFrames.value) {
      currentFrame.value = totalFrames.value
    }
  }

  function setFps(val) {
    const next = Number(val)
    if (!Number.isFinite(next)) return
    fps.value = Math.max(1, Math.min(60, Math.round(next)))
    if (currentFrame.value > totalFrames.value) currentFrame.value = totalFrames.value
  }

  function toJSON() {
    return {
      fps: fps.value,
      duration: duration.value,
      currentFrame: currentFrame.value,
      isLooping: isLooping.value,
      keyframes: JSON.parse(JSON.stringify(keyframes)),
      events: JSON.parse(JSON.stringify(events)),
    }
  }

  function fromJSON(data) {
    if (!data) return
    if (data.fps != null) setFps(data.fps)
    if (data.duration != null) setDuration(data.duration)
    if (data.currentFrame != null && Number.isFinite(Number(data.currentFrame))) {
      currentFrame.value = Math.max(0, Math.min(totalFrames.value, Number(data.currentFrame)))
    }
    if (data.isLooping != null) isLooping.value = data.isLooping
    if (data.keyframes && typeof data.keyframes === 'object') {
      for (const key of Object.keys(keyframes)) delete keyframes[key]
      for (const [paramKey, kfs] of Object.entries(data.keyframes)) {
        if (!Array.isArray(kfs)) continue
        keyframes[paramKey] = kfs
          .filter(kf => Number.isFinite(Number(kf?.frame)) && Number.isFinite(Number(kf?.value)))
          .map(kf => ({ ...kf, frame: Math.max(0, Math.min(totalFrames.value, Math.round(Number(kf.frame)))), value: Number(kf.value), easing: EASING_TYPES.includes(kf.easing) ? kf.easing : 'linear' }))
          .sort((a, b) => a.frame - b.frame)
      }
    }
    if (Array.isArray(data.events)) {
      events.splice(0, events.length, ...data.events.filter(e => e && Number.isFinite(Number(e.frame)) && typeof e.name === 'string').map(e => ({ ...e, frame: Math.max(0, Math.min(totalFrames.value, Math.round(Number(e.frame)))), duration: Math.max(0, Number(e.duration) || 0) })))
    }
  }

  function clearAll() {
    for (const key of Object.keys(keyframes)) delete keyframes[key]
    currentFrame.value = 0
    isPlaying.value = false
    pause()
  }

  return {
    fps, duration, currentFrame, isPlaying, isLooping, keyframes,
    totalFrames, currentTime,
    setKeyframe, removeKeyframe, hasKeyframe,
    getKfEasing, cycleEasingAtFrame, getEasingLabel,
    getKeyframesForParam, getValueAtFrame, getAllValuesAtFrame, getKeyframedValuesAtFrame,
    getAllKeyframedParams, getAllKeyframes, getUniqueFramePositions,
    goToFrame, goToStart, goToEnd,
    goToPrevKeyframe, goToNextKeyframe,
    play, pause, stop, setDuration, setFps,
    toJSON, fromJSON, clearAll,
    events, canAddMotionEvent, addEvent, removeEvent, moveEvent,
    getMotionRanges, findFreeFrame, getActiveEventsAtFrame,
  }
}
