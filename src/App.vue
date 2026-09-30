<template>
  <div class="app-root">
    <ModelSidebar
      :models="models"
      :currentModel="currentModel"
      @select="loadModel"
    />
    <div class="main-area">
      <ModelCanvas
        ref="canvasRef"
        :loading="loading"
        :mouseTrackEnabled="mouseTrackEnabled"
        :recordMode="recordMode"
        :background="background"
        @mouse-move="onCanvasMouse"
      />
      <div class="canvas-sep"></div>
      <BottomBar
        :values="paramValues"
        :kf="kf"
        :motionGroups="motionGroups"
        :expressionIds="expressionIds"
        :motionDurations="motionDurations"
        :mouseTrackEnabled="mouseTrackEnabled"
        :motionProgress="motionProgress"
        :motionLabel="motionLabel"
        :motionRemain="motionRemain"
        :motionPlaying="motionPlaying"
        v-model:recordMode="recordMode"
        @set-param="onSetParam"
        @reset-group="resetGroup"
        @reset-all="resetAllParams"
        @apply-kf-values="applyKfParams"
        @trigger-motion="playMotion"
        @trigger-expression="setExpression"
        @update:mouseTrackEnabled="v => mouseTrackEnabled = v"
        @reset-view="onResetView"
      />
    </div>
    <RightPanel
      :motionGroups="motionGroups"
      :currentMotion="currentMotion"
      :expressionIds="expressionIds"
      :currentExpression="currentExpression"
      :motionPlaying="motionPlaying"
      :motionDurations="motionDurations"
      :toastMsg="toastMsg"
      @play-motion="playMotion"
      @set-expression="setExpression"
      @reset="resetPose"
    />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useModel } from './composables/useModel.js'
import { useKeyframeAnimation } from './composables/useKeyframeAnimation.js'
import { useBackground } from './composables/useBackground.js'
import ModelSidebar from './components/ModelSidebar.vue'
import ModelCanvas from './components/ModelCanvas.vue'
import RightPanel from './components/RightPanel.vue'
import BottomBar from './components/BottomBar.vue'

const {
  models, currentModel, loading,
  motionGroups, currentMotion, expressionIds, currentExpression,
  paramValues, mouseTrackEnabled, motionPlaying, motionProgress, motionLabel, motionRemain, motionDurations, toastMsg,
  loadModel, playMotion, setExpression, resetPose, setParam, resetGroup, resetAllParams, setAllParams, applyKfParams,
  applyMouseTrack, getSavedState, destroy,
} = useModel()

const kf = useKeyframeAnimation()

const KF_STORAGE_KEY = 'tomori-kf-state'

const canvasRef = ref(null)

// 导出比例：canvas = 跟随画布，portrait = 竖屏 9:16
const recordMode = ref('canvas')

// 录制背景：默认绿幕，可换颜色或上传图片，设置会持久化
const { background, init: initBackground, destroy: destroyBackground } = useBackground()

function saveKfState() {
  try {
    localStorage.setItem(KF_STORAGE_KEY, JSON.stringify(kf.toJSON()))
  } catch {
    // Storage can be unavailable or full; keep editing usable.
  }
}

let saveKfTimer = null
function debouncedSaveKf() {
  clearTimeout(saveKfTimer)
  saveKfTimer = setTimeout(saveKfState, 500)
}

function loadKfState() {
  try {
    const raw = localStorage.getItem(KF_STORAGE_KEY)
    if (raw) kf.fromJSON(JSON.parse(raw))
  } catch { /* ignore */ }
}

watch(
  () => [kf.duration.value, kf.fps.value, kf.keyframes, kf.events],
  () => debouncedSaveKf(),
  { deep: true }
)

function onSetParam(key, value) {
  setParam(key, value)
  if (!kf.isPlaying.value) {
    kf.setKeyframe(key, kf.currentFrame.value, value)
    debouncedSaveKf()
  }
}

function onCanvasMouse(x, y, cvs) {
  applyMouseTrack(x, y, cvs)
}

// 画面被拖动过之后，用下方控制栏的「复位视图」把模型移回中央
function onResetView() {
  canvasRef.value?.resetOffset()
}

onMounted(() => {
  loadKfState()
  initBackground()
  const saved = getSavedState()
  let defaultModel = models.find(m => m.category === 'tomori' && m.name === 'live_default') || models[0]
  if (saved?.model) {
    const parts = saved.model.split('/')
    if (parts.length === 2) {
      defaultModel = { category: parts[0], name: parts[1] }
    }
  }
  loadModel(defaultModel, saved)
})

onBeforeUnmount(() => {
  clearTimeout(saveKfTimer)
  kf.stop()
  destroyBackground()
  destroy()
})
</script>

<style>
html, body, #app { margin:0; padding:0; height:100%; overflow:hidden; }
body { font-family:'Segoe UI',sans-serif; background:#1a1a2e; color:#eee; }
.app-root { display:flex; height:100vh; }
.main-area { flex:1; display:flex; flex-direction:column; min-width:0; }
.canvas-sep { height: 4px; flex-shrink: 0; background: #e94560; opacity: 0.6; }
</style>
