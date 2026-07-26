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
    const f = Math.round(frame)
    const kfs = ensureParam(paramKey)
    const idx = kfs.findIndex(k => k.frame === f)
    if (idx >= 0) {
      kfs[idx].value = value
    } else {
      kfs.push({ frame: f, value, easing: 'linear' })
    }
    kfs.sort((a, b) => a.frame - b.frame)
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

  function canAddMotionEvent(frame, durationSec) {
    if (totalFrames.value === 0) return false
    const start = Math.round(frame)
    const end = start + durationSec * fps.value
    for (const e of events) {
      if (e.type !== 'motion') continue
      const eEnd = e.frame + (e.duration || 0) * fps.value
      if (start < eEnd && end > e.frame) return false
    }
    return true
  }

  function addEvent(type, name, frame, durationSec) {
    const f = Math.round(frame)
    if (type === 'motion' && !canAddMotionEvent(f, durationSec)) return false
    events.push({ type, name, frame: f, duration: durationSec || 0 })
    events.sort((a, b) => a.frame - b.frame)
    return true
  }

  function removeEvent(index) {
    events.splice(index, 1)
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

  function play(onTick) {
    if (isPlaying.value) return
    if (currentFrame.value >= totalFrames.value) {
      currentFrame.value = 0
    }
    isPlaying.value = true
    lastTimestamp = null
    tickCallback = onTick

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
    duration.value = Math.max(0.1, val)
    if (currentFrame.value > totalFrames.value) {
      currentFrame.value = totalFrames.value
    }
  }

  function toJSON() {
    return {
      fps: fps.value,
      duration: duration.value,
      currentFrame: currentFrame.value,
      keyframes: JSON.parse(JSON.stringify(keyframes)),
    }
  }

  function fromJSON(data) {
    if (!data) return
    if (data.fps != null) fps.value = data.fps
    if (data.duration != null) duration.value = data.duration
    if (data.currentFrame != null) currentFrame.value = data.currentFrame
    if (data.keyframes) {
      for (const key of Object.keys(keyframes)) delete keyframes[key]
      for (const [paramKey, kfs] of Object.entries(data.keyframes)) {
        keyframes[paramKey] = kfs.map(kf => ({
          ...kf,
          easing: kf.easing || 'linear',
        }))
      }
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
    play, pause, stop, setDuration,
    toJSON, fromJSON, clearAll,
    events, canAddMotionEvent, addEvent, removeEvent, getActiveEventsAtFrame,
  }
}
