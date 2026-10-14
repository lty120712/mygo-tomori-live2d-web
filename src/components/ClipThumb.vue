<template>
  <img v-if="thumb" class="clip-thumb" :src="thumb" alt="" />
</template>
<script setup>
// 时间线上的视频片段只显示素材首帧缩略图：不额外解码视频，避免多个片段的 <video> 元素同时占用解码器。
import { ref, watch } from 'vue'
import { assetStore } from '../assetStore.js'
const props = defineProps({ assetId: String })
const thumb = ref('')
let request = 0
watch(() => props.assetId, async id => {
  const current = ++request
  thumb.value = ''
  if (!id) return
  let meta = null
  try { meta = await assetStore.meta(id) } catch { meta = null }
  if (current !== request) return
  thumb.value = meta?.thumb || ''
}, { immediate: true })
</script>
