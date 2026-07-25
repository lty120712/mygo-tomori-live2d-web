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
      <ControlBar
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
    <ParamPanel
      :values="paramValues"
      :mouseTrackEnabled="mouseTrackEnabled"
      :motionProgress="motionProgress"
      :motionLabel="motionLabel"
      :motionRemain="motionRemain"
      @set-param="setParam"
      @reset-group="resetGroup"
      @reset-all="resetAllParams"
      @update:mouseTrackEnabled="v => mouseTrackEnabled = v"
    />
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useModel } from './composables/useModel.js'
import ModelSidebar from './components/ModelSidebar.vue'
import ModelCanvas from './components/ModelCanvas.vue'
import ControlBar from './components/ControlBar.vue'
import ParamPanel from './components/ParamPanel.vue'

const {
  models, currentModel, loading, statusText,
  motionGroups, currentMotion, expressionIds, currentExpression,
  paramValues, mouseTrackEnabled, motionPlaying, motionProgress, motionLabel, motionRemain, motionDurations, toastMsg,
  loadModel, playMotion, setExpression, resetPose, setParam, resetGroup, resetAllParams,
  applyMouseTrack, getSavedState,
} = useModel()

function onCanvasMouse(x, y, cvs) {
  applyMouseTrack(x, y, cvs)
}

onMounted(() => {
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
