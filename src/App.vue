<template>
  <div class="app-root">
    <ModelSidebar
      :models="models"
      :currentModel="currentModel"
      @select="loadModel"
    />
    <div class="main-area">
      <ModelCanvas
        :statusText="statusText"
        :loading="loading"
        :mouseTrackEnabled="mouseTrackEnabled"
        @mouse-move="onCanvasMouse"
      />
      <BottomBar
        :values="paramValues"
        :kf="kf"
        :mouseTrackEnabled="mouseTrackEnabled"
        :motionProgress="motionProgress"
        :motionLabel="motionLabel"
        :motionRemain="motionRemain"
        @set-param="onSetParam"
        @reset-group="resetGroup"
        @reset-all="resetAllParams"
        @apply-kf-values="setAllParams"
        @update:mouseTrackEnabled="v => mouseTrackEnabled = v"
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
import { onMounted, watch } from 'vue'
import { useModel } from './composables/useModel.js'
import { useKeyframeAnimation } from './composables/useKeyframeAnimation.js'
import ModelSidebar from './components/ModelSidebar.vue'
import ModelCanvas from './components/ModelCanvas.vue'
import RightPanel from './components/RightPanel.vue'
import BottomBar from './components/BottomBar.vue'

const {
  models, currentModel, loading, statusText,
  motionGroups, currentMotion, expressionIds, currentExpression,
  paramValues, mouseTrackEnabled, motionPlaying, motionProgress, motionLabel, motionRemain, motionDurations, toastMsg,
  loadModel, playMotion, setExpression, resetPose, setParam, resetGroup, resetAllParams, setAllParams,
  applyMouseTrack, getSavedState,
} = useModel()

const kf = useKeyframeAnimation()

const KF_STORAGE_KEY = 'tomori-kf-state'

function saveKfState() {
  localStorage.setItem(KF_STORAGE_KEY, JSON.stringify(kf.toJSON()))
}

function loadKfState() {
  try {
    const raw = localStorage.getItem(KF_STORAGE_KEY)
    if (raw) kf.fromJSON(JSON.parse(raw))
  } catch { /* ignore */ }
}

watch(
  () => [kf.duration.value, kf.fps.value, kf.keyframes],
  () => saveKfState(),
  { deep: true }
)

function onSetParam(key, value) {
  setParam(key, value)
  if (!kf.isPlaying.value) {
    kf.setKeyframe(key, kf.currentFrame.value, value)
    saveKfState()
  }
}

function onCanvasMouse(x, y, cvs) {
  applyMouseTrack(x, y, cvs)
}

onMounted(() => {
  loadKfState()
  const saved = getSavedState()
  loadModel(saved?.model || models[8], saved)
})
</script>

<style>
html, body, #app { margin:0; padding:0; height:100%; overflow:hidden; }
body { font-family:'Segoe UI',sans-serif; background:#1a1a2e; color:#eee; }
.app-root { display:flex; height:100vh; }
.main-area { flex:1; display:flex; flex-direction:column; min-width:0; }
</style>
