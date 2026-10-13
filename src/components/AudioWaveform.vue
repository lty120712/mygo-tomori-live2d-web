<template>
  <svg v-if="path" class="audio-waveform" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path :d="path" /><line v-for="(mark,index) in beatMarks" :key="index" class="audio-beat" :x1="mark" :x2="mark" y1="10" y2="90" /></svg>
  <span v-else class="waveform-placeholder" aria-hidden="true">{{ pending ? '生成波形…' : '波形不可用' }}</span>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { assetStore } from '../assetStore.js'
import { waveformPath } from '../audioWaveform.js'
import { clipBeatTimes } from '../audioBeats.js'
const props = defineProps({ clip: Object, beats: { type: Boolean, default: true } })
const waveform = ref(null), beatTimes = ref(null), pending = ref(false)
let request = 0
watch(() => props.clip.assetId, async id => {
  const current = ++request
  waveform.value = null; beatTimes.value = null; pending.value = true
  let result = null, times = null
  try { [result, times] = await Promise.all([assetStore.waveform(id), assetStore.beats(id)]) } catch { /* 存储不可用时不阻塞剪辑 */ }
  if (current !== request) return
  waveform.value = result; beatTimes.value = times; pending.value = false
}, { immediate: true })
const path = computed(() => waveformPath(waveform.value?.peaks, waveform.value?.duration, props.clip.offset || 0, props.clip.duration))
/** 节拍标记按片段显示区间换算成百分比；片段外的节拍由 clipBeatTimes 丢掉。 */
const beatMarks = computed(() => {
  if (props.beats === false || !beatTimes.value?.length || !(props.clip.duration > 0)) return []
  return clipBeatTimes(beatTimes.value, props.clip).map(time => (time - props.clip.start) / props.clip.duration * 100)
})
</script>
<style scoped>
.audio-waveform { position:absolute; inset:17px 4px 3px; width:calc(100% - 8px); height:calc(100% - 20px); pointer-events:none; opacity:.55; }
path { stroke:currentColor; stroke-width:.4; fill:none; }
.audio-beat { stroke:var(--editor-key); stroke-width:.16; opacity:.85; }
.waveform-placeholder { position:absolute; bottom:3px; left:7px; font-size:9px; opacity:.55; pointer-events:none; white-space:nowrap; }
</style>
