/**
 * 从音频波形峰值里找节拍点。
 *
 * 只做「局部极大值 + 自适应阈值 + 最小间隔」这一层，目的是给时间线提供可对齐的
 * 提示点，不追求 BPM 推断或音乐分析精度：素材很短或很安静时宁可不给点。
 */
export function detectBeats(peaks, sourceDuration, options = {}) {
  const { minGap = 0.2, floor = 0.12, relative = 0.4, maxBeats = 400 } = options
  if (!peaks?.length || !(sourceDuration > 0)) return []
  const count = peaks.length
  let top = 0
  for (const value of peaks) if (value > top) top = value
  const threshold = Math.max(floor, top * relative)
  const minSamples = Math.max(1, Math.round(minGap / sourceDuration * count))
  // 微秒精度足够，又能避免浮点噪声让同一个节拍算出两种时间
  const at = index => Math.round(index / count * sourceDuration * 1e6) / 1e6
  const beats = []
  let lastIndex = -1
  for (let i = 1; i < count - 1; i++) {
    const value = peaks[i]
    if (value < threshold || value < peaks[i - 1] || value <= peaks[i + 1]) continue
    // 间隔太近时保留更响的那个，避免一段强音被拆成很多点
    if (lastIndex >= 0 && i - lastIndex < minSamples) {
      if (value > peaks[lastIndex]) { beats[beats.length - 1] = at(i); lastIndex = i }
      continue
    }
    beats.push(at(i))
    lastIndex = i
    if (beats.length >= maxBeats) break
  }
  return beats
}

/** 素材内的节拍时间换算成时间线上的绝对时间，只保留落在片段显示区间内的。 */
export function clipBeatTimes(beats, clip) {
  if (!beats?.length || !clip) return []
  const offset = clip.offset || 0, start = clip.start, end = start + clip.duration
  const times = []
  for (const beat of beats) {
    const time = start + beat - offset
    if (time < start - 1e-9) continue
    if (time > end + 1e-9) break
    times.push(time)
  }
  return times
}

/** 把时间吸附到最近的节拍点；超出容差就保持原值。 */
export function snapToBeats(time, beats, tolerance) {
  if (!beats?.length || !(tolerance > 0)) return { time, snapped: null }
  let snapped = null, gap = tolerance
  for (const beat of beats) {
    const distance = Math.abs(beat - time)
    if (distance <= gap) { gap = distance; snapped = beat }
  }
  return snapped === null ? { time, snapped: null } : { time: snapped, snapped }
}

/**
 * 收集音频片段在时间线上的节拍点，用于吸附目标与节拍标记。
 * 片段本身决定可见区间，start/end 再按时间线窗口裁一次，limit 防止极端情况下目标数组过长。
 */
export function collectBeats(clips, beatsByAsset, options = {}) {
  const { start = 0, end = Infinity, limit = 1200 } = options
  const times = []
  for (const clip of clips || []) {
    const beats = beatsByAsset?.[clip?.assetId]
    if (!beats?.length) continue
    for (const time of clipBeatTimes(beats, clip)) {
      if (time < start - 1e-9 || time > end + 1e-9) continue
      times.push(time)
      if (times.length >= limit) return times.sort((a, b) => a - b)
    }
  }
  return times.sort((a, b) => a - b)
}
