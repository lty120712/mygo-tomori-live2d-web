/** 固定数量峰值，保留短暂瞬态；多声道取最大绝对值。 */
export function audioPeaks(buffer, bins = 2048) {
  const count = Math.max(1, Math.min(bins, buffer.length))
  const peaks = new Array(count).fill(0)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) {
      const bin = Math.min(count - 1, Math.floor(i * count / samples.length))
      peaks[bin] = Math.max(peaks[bin], Math.min(1, Math.abs(samples[i])))
    }
  }
  return peaks.map(v => Math.round(v * 1000) / 1000)
}

/** 源偏移决定波形区间，移动片段不改变区间，裁剪与切割会改变。 */
export function waveformPath(peaks, sourceDuration, offset, duration, columns = 160) {
  if (!peaks?.length || !(sourceDuration > 0) || !(duration > 0)) return ''
  const points = []
  for (let x = 0; x < columns; x++) {
    const from = (offset + x / columns * duration) / sourceDuration * peaks.length
    const to = (offset + (x + 1) / columns * duration) / sourceDuration * peaks.length
    let peak = 0
    for (let i = Math.max(0, Math.floor(from)); i < Math.min(peaks.length, Math.max(Math.floor(from) + 1, Math.ceil(to))); i++) peak = Math.max(peak, peaks[i])
    points.push(`M${(x + .5) / columns * 100} ${50 - peak * 48}V${50 + peak * 48}`)
  }
  return points.join('')
}

export async function decodeWaveform(file) {
  const Ctor = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext
  if (!Ctor) return null
  const context = new Ctor(1, 1, 44100)
  const buffer = await context.decodeAudioData(await file.arrayBuffer())
  return { peaks: audioPeaks(buffer), duration: buffer.duration }
}
