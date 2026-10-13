/**
 * 音频滤镜：作用在片段增益之后的单个双二阶滤波器。
 * 预设用固定参数，够用又好测；`none` 时不建节点，播放链路与原来完全一致。
 */
export const AUDIO_FILTER_PRESETS = [
  { value: 'none', label: '无滤镜', type: 'none', frequency: 1000, q: .7 },
  { value: 'lowpass', label: '低通 · 闷', type: 'lowpass', frequency: 1200, q: .7 },
  { value: 'highpass', label: '高通 · 清', type: 'highpass', frequency: 300, q: .7 },
  { value: 'bandpass', label: '带通 · 电话', type: 'bandpass', frequency: 1600, q: .9 },
  { value: 'megaphone', label: '喇叭 · 窄带', type: 'bandpass', frequency: 1200, q: 2.5 },
]
export function normalizeAudioFilter(value) {
  return AUDIO_FILTER_PRESETS.some(preset => preset.value === value) ? value : 'none'
}
export function audioFilterSpec(value) {
  const preset = normalizeAudioFilter(value)
  return { ...AUDIO_FILTER_PRESETS.find(candidate => candidate.value === preset) }
}
export function audioFilterLabel(value) {
  return audioFilterSpec(value).label
}
