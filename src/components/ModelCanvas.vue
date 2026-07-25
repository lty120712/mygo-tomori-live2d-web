<template>
  <div class="canvas-wrap" ref="wrapRef">
    <canvas id="live2d-canvas" ref="canvasRef"></canvas>
    <div class="canvas-info">{{ statusText }}</div>
    <div v-if="loading" class="canvas-loading">
      <a-spin :size="32" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  statusText: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  mouseTrackEnabled: { type: Boolean, default: true },
})

const emit = defineEmits(['mouse-move'])

const wrapRef = ref(null)
const canvasRef = ref(null)

function resizeCanvas() {
  const wrap = wrapRef.value
  const cvs = canvasRef.value
  if (!wrap || !cvs) return
  cvs.width = wrap.clientWidth
  cvs.height = wrap.clientHeight
}

function onMouseMove(e) {
  const cvs = canvasRef.value
  if (!cvs) return
  const rect = cvs.getBoundingClientRect()
  emit('mouse-move', e.clientX - rect.left, e.clientY - rect.top, cvs)
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.canvas-wrap { flex:1; position:relative; background:#0a0a1a; overflow:hidden; }
.canvas-wrap canvas { display:block; width:100%; height:100%; }
.canvas-info { position:absolute; top:12px; left:12px; background:rgba(0,0,0,.65); padding:8px 14px; border-radius:8px; font-size:13px; pointer-events:none; z-index:5; color:#eee; }
.canvas-loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.75); z-index:10; }
</style>