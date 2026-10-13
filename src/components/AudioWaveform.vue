<template>
  <svg v-if="path" class="audio-waveform" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path :d="path" /></svg>
  <span v-else class="waveform-placeholder" aria-hidden="true">{{ pending ? '生成波形…' : '波形不可用' }}</span>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { assetStore } from '../assetStore.js'
import { waveformPath } from '../audioWaveform.js'
const props = defineProps({ clip: Object })
const waveform = ref(null), pending = ref(false)
let request = 0
watch(() => props.clip.assetId, async id => {
  const current = ++request
  waveform.value = null; pending.value = true
  let result = null
  try { result = await assetStore.waveform(id) } catch { /* 存储不可用时不阻塞剪辑 */ }
  if (current !== request) return
  waveform.value = result; pending.value = false
}, { immediate: true })
const path = computed(() => waveformPath(waveform.value?.peaks, waveform.value?.duration, props.clip.offset || 0, props.clip.duration))
</script>
<style scoped>
.audio-waveform { position:absolute; inset:17px 4px 3px; width:calc(100% - 8px); height:calc(100% - 20px); pointer-events:none; opacity:.55; }
path { stroke:currentColor; stroke-width:.4; fill:none; }
.waveform-placeholder { position:absolute; bottom:3px; left:7px; font-size:9px; opacity:.55; pointer-events:none; white-space:nowrap; }
</style>
