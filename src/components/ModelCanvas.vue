<template>
  <div
    class="canvas-wrap"
    ref="wrapRef"
    @mousedown="onDragStart"
    @mousemove="onDragMove"
    @mouseup="onDragEnd"
    @mouseleave="onDragEnd"
    :style="{ cursor: dragging ? 'grabbing' : 'grab' }"
  >
    <canvas
      id="live2d-canvas"
      ref="canvasRef"
      :style="{ transform: `translate(${dx}px, ${dy}px)` }"
    ></canvas>
    <div v-if="(dx !== 0 || dy !== 0) && !loading" class="canvas-reset" @click="resetOffset">↺ 复位</div>
    <div v-if="guideStyle" class="canvas-guide" :style="guideStyle">
      <span class="canvas-guide-label">录制区域 · 竖屏 9:16</span>
    </div>
    <div class="canvas-info">{{ statusText }}</div>
    <div v-if="loading" class="canvas-loading">
      <a-spin :size="32" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  statusText: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  mouseTrackEnabled: { type: Boolean, default: true },
  recordMode: { type: String, default: 'canvas' },
})

const emit = defineEmits(['mouse-move'])

const wrapRef = ref(null)
const canvasRef = ref(null)
const dx = ref(0)
const dy = ref(0)
const dragging = ref(false)
let dragStartX = 0
let dragStartY = 0
let baseDx = 0
let baseDy = 0
let resizeObserver = null

// 竖屏导出按 9:16 居中裁切，这里把裁切范围画出来，
// 否则切换比例后屏幕上毫无变化，根本看不出选了什么
const guideStyle = ref(null)

// Live2D 加载模型时会用新节点替换掉 canvas，组件里的 ref 会指向已被移除的旧节点，
// 所以每次都要从容器里重新取当前真正在页面上的那个 canvas。
function liveCanvas() {
  const wrap = wrapRef.value
  if (!wrap) return canvasRef.value
  return wrap.querySelector('canvas') || canvasRef.value
}

function syncCanvasSize() {
  const cvs = liveCanvas()
  if (!cvs) return
  // SDK 会把第一次加载模型时的像素尺寸写进内联样式并固定下来，
  // 这里覆盖成百分比，保证窗口或面板尺寸变化后画布仍然铺满容器。
  cvs.style.width = '100%'
  cvs.style.height = '100%'
  updateGuide()
}

function updateGuide() {
  const wrap = wrapRef.value
  if (!wrap || props.recordMode !== 'portrait') {
    guideStyle.value = null
    return
  }
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  if (!w || !h) {
    guideStyle.value = null
    return
  }
  const target = 9 / 16
  const ratio = w / h
  const width = ratio > target ? h * target : w
  const height = ratio > target ? h : w / target
  guideStyle.value = { width: Math.round(width) + 'px', height: Math.round(height) + 'px' }
}

watch(() => props.recordMode, updateGuide)

function onMouseMove(e) {
  if (!props.mouseTrackEnabled) return
  const cvs = liveCanvas()
  if (!cvs) return
  const rect = cvs.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  emit('mouse-move', e.clientX - rect.left, e.clientY - rect.top, cvs)
}

function onDragStart(e) {
  if (e.button !== 0) return
  dragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  baseDx = dx.value
  baseDy = dy.value
}

function onDragMove(e) {
  if (!dragging.value) {
    onMouseMove(e)
    return
  }
  dx.value = baseDx + (e.clientX - dragStartX)
  dy.value = baseDy + (e.clientY - dragStartY)
}

function onDragEnd() {
  dragging.value = false
}

function resetOffset() {
  dx.value = 0
  dy.value = 0
}

onMounted(() => {
  syncCanvasSize()
  window.addEventListener('resize', syncCanvasSize)
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    resizeObserver = new ResizeObserver(syncCanvasSize)
    resizeObserver.observe(wrapRef.value)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCanvasSize)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped>
.canvas-wrap { flex:1; position:relative; background:#0a0a1a url('/bg-character.png') center/cover no-repeat; overflow:hidden; }
.canvas-wrap canvas { display:block; width:100%; height:100%; transition: none; }
.canvas-info { position:absolute; top:12px; left:12px; background:rgba(0,0,0,.65); padding:8px 14px; border-radius:8px; font-size:13px; pointer-events:none; z-index:5; color:#eee; }
.canvas-loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.75); z-index:10; }
.canvas-reset {
  position: absolute; bottom: 12px; right: 12px; z-index: 5;
  background: rgba(0,0,0,.65); color: #e94560; padding: 6px 12px;
  border-radius: 6px; font-size: 12px; cursor: pointer; user-select: none;
}
.canvas-reset:hover { background: rgba(233,69,96,.2); }
.canvas-guide {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  border: 1px dashed rgba(255,255,255,.75); pointer-events: none; z-index: 4;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.45);
}
.canvas-guide-label {
  position: absolute; left: 0; top: -20px; font-size: 11px;
  color: #fff; background: rgba(0,0,0,.6); padding: 2px 6px; border-radius: 4px;
  white-space: nowrap;
}
</style>
