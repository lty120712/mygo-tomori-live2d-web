<template><div ref="host" class="render-source"><canvas :id="'source-' + clip.id" width="960" height="540"></canvas></div></template>
<script setup>
import { ref, onMounted, onBeforeUnmount, markRaw } from 'vue'
import { init } from 'l2d'
import { buildParamGroups } from '../params.js'
import { collectMotionInfo } from '../motions.js'
import { isolateModelDisposal, isolateModelTiming } from '../live2dSceneAdapter.js'
const props = defineProps({ clip: { type: Object, required: true } })
const emit = defineEmits(['ready', 'error', 'dispose'])
const host = ref(null)
let sdk = null, disposed = false, loaded = false
function disableTracking() {
  const legacy = sdk?._state?.l2d2Model
  if (legacy?._boundMouseEvent) {
    document.removeEventListener('mousemove', legacy._boundMouseEvent)
    document.removeEventListener('mouseout', legacy._boundMouseEvent)
  }
  const modern = sdk?._state?.l2d6Model
  if (modern?.mouseMoveEventListener) document.removeEventListener('mousemove', modern.mouseMoveEventListener)
  if (modern?.mouseEndedEventListener) document.removeEventListener('mouseout', modern.mouseEndedEventListener)
  if (modern?.tapEventListener) document.removeEventListener('pointerdown', modern.tapEventListener)
}
onMounted(async () => {
  try {
    sdk = init(host.value.querySelector('canvas'))
    await sdk.load({ path: '/models/' + props.clip.model + '/' + props.clip.entry, scale: 1 })
    loaded = true
    isolateModelDisposal(sdk)
    isolateModelTiming(sdk)
    if (disposed) { sdk.destroy(); return }
    disableTracking()
    const groups = buildParamGroups(sdk.getParams())
    const motions = Object.keys(sdk.getMotions())
    const expressions = sdk.getExpressions()
    emit('ready', props.clip.id, markRaw({ sdk, groups, motions, expressions, canvas: () => sdk.getCanvas(), info: {}, infoReady:false }))
    const info = await collectMotionInfo('/models/' + props.clip.model + '/', sdk.getMotions())
    if (!disposed) emit('ready', props.clip.id, markRaw({ sdk, groups, motions, expressions, canvas: () => sdk.getCanvas(), info, infoReady:true }))
  } catch (error) {
    if (!disposed) emit('error', props.clip.id, '模型加载失败：' + props.clip.name)
  }
})
onBeforeUnmount(() => {
  disposed = true
  disableTracking()
  emit('dispose', props.clip.id)
  // 加载仍在执行时交给加载完成后的分支清理。
  if (loaded) sdk.destroy()
})
</script>
<style scoped>
.render-source { position:absolute; left:-10000px; top:0; width:960px; height:540px; pointer-events:none; }
.render-source canvas { width:960px!important; height:540px!important; }
</style>
