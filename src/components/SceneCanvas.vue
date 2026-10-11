<template>
  <div class="scene-preview">
    <div class="preview-tools" aria-label="画布预览尺寸"><button :aria-pressed="previewFit==='width'" title="按预览区宽度显示，超出高度时上下滚动" @click="previewFit='width'">适应宽度</button><button :aria-pressed="previewFit==='contain'" title="保持比例并完整显示画面" @click="previewFit='contain'">完整画面</button></div>
    <div class="preview-viewport" ref="preview">
    <div class="scene-stage" ref="stage" tabindex="0" aria-label="画布编辑区域" @keydown="nudgeKey" @focusout="endNudge" :style="{ width: stageWidth + 'px', height:stageWidth*9/16+'px' }" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp">
      <canvas ref="canvas" width="960" height="540" aria-label="场景合成画布" @pointerdown="pointerDown"></canvas>
      <div v-if="selectedBox" class="selection-outline" :style="selectedBox"><span>{{ selected?.name }}</span><template v-if="!playing"><button v-for="corner in ['nw','ne','sw','se']" :key="corner" class="transform-handle scale-handle" :class="corner" :aria-label="'缩放模型 '+corner" title="拖动等比缩放，对角固定" @pointerdown.stop.prevent="beginTransform($event,'scale',corner)"></button><i class="rotation-stem" aria-hidden="true"></i><button class="transform-handle rotate-handle" aria-label="旋转模型" title="拖动旋转；按住 Shift 吸附到 15°" @pointerdown.stop.prevent="beginTransform($event,'rotate')">↻</button></template></div>
      <div v-for="guide in guides" :key="guide.axis" class="canvas-guide" :class="guide.axis" :style="guide.axis==='x' ? {left:(guide.value+480)/960*100+'%'} : {top:(guide.value+270)/540*100+'%'}" aria-hidden="true"></div>
      <div v-if="!clips.length" class="empty-scene">从左侧素材库添加模型到场景</div>
    </div>
    </div>
    <ClipRenderer v-for="clip in clips" :key="clip.id" :clip="clip" @ready="ready" @error="(id, message) => emit('error', id, message)" @dispose="dispose" />
  </div>
</template>
<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ClipRenderer from './ClipRenderer.vue'
import {sceneDrawOrder,sceneHitOrder} from '../sceneLayers.js'
import { clipVisible, sampleClip } from '../sceneProject.js'
import { beginCanvasTransform,scaleCanvasTransform,rotateCanvasTransform } from '../canvasTransform.js'
import { snapCanvasPosition,nudgeCanvasPosition } from '../canvasPosition.js'
const props = defineProps({ clips: Array, time: Number, fps: Number, selected: Object, runtimes: Object, playing: Boolean, background: String, backgroundImage: String, recording: Boolean })
const emit = defineEmits(['ready', 'dispose', 'error', 'select', 'move', 'transform', 'begin-edit', 'end-edit', 'background-ready', 'mouse-position'])
const previewFit=ref('width')
const guides=ref([]),nudgeKeys=new Set()
const canvas = ref(null), stage = ref(null), preview = ref(null), stageWidth = ref(960)
let raf = null, drag = null, resizeObserver = null
const pausedFrames = new Map()
let backgroundImage=null, imageRequest=0
watch(()=>props.backgroundImage,src=>{
  const request=++imageRequest; backgroundImage=null
  if(!src){emit('background-ready');return}
  const img=new Image()
  img.onload=()=>{if(request!==imageRequest)return;backgroundImage=img;emit('background-ready')}
  img.onerror=()=>{if(request===imageRequest)emit('error',null,'背景图片加载失败，请重新上传或移除图片')}
  img.src=src
},{immediate:true})
function ready(id, runtime) { emit('ready', id, runtime) }
function dispose(id) { emit('dispose', id) }
function pose(clip) { return sampleClip(clip, props.time, props.fps, props.runtimes[clip.id]?.groups || []).transform }
const selectedBox = computed(() => {
  if (!props.selected || props.selected.layerLocked || !clipVisible(props.selected, props.time) || props.recording) return null
  const t = pose(props.selected)
  return {
    left: ((480 + t.x - 160 * t.scale) / 960 * 100) + '%', top: ((270 + t.y - 255 * t.scale) / 540 * 100) + '%',
    width: (320 * t.scale / 960 * 100) + '%', height: (510 * t.scale / 540 * 100) + '%',
    transform: 'rotate(' + t.rotation + 'deg)',
  }
})
function point(e) {
  const r = canvas.value.getBoundingClientRect()
  return { x: (e.clientX - r.left) * 960 / r.width - 480, y: (e.clientY - r.top) * 540 / r.height - 270 }
}
function trackMouse(e) {
  if(e.pointerType!=='mouse' || !canvas.value)return
  emit('mouse-position',point(e))
}
function clearMouse(e) {if(!e.relatedTarget)emit('mouse-position',null)}
function pointerDown(e) {
  endNudge();stage.value.focus({preventScroll:true})
  if (props.playing || props.recording || e.button !== 0) return
  const p = point(e)
  const sorted = sceneHitOrder(props.clips.filter(c => !c.layerLocked && clipVisible(c, props.time)))
  const hit = sorted.find(c => {
    const t = pose(c), r = -t.rotation * Math.PI / 180
    const x = p.x - t.x, y = p.y - t.y
    return Math.abs(x * Math.cos(r) - y * Math.sin(r)) <= 160 * t.scale && Math.abs(x * Math.sin(r) + y * Math.cos(r)) <= 255 * t.scale
  })
  emit('select', hit?.id || '')
  if (!hit) return
  emit('begin-edit')
  drag = { id: hit.id, mode:'move', point: p, pose: pose(hit) }
  stage.value.setPointerCapture(e.pointerId)
}
function beginTransform(e,mode,corner='se'){
  endNudge();stage.value.focus({preventScroll:true})
  if(e.button!==0 || props.playing || props.recording || !props.selected || props.selected.layerLocked || !clipVisible(props.selected,props.time))return
  const p=point(e),t=pose(props.selected)
  emit('begin-edit');drag={...beginCanvasTransform(t,p,corner),id:props.selected.id,mode}
  stage.value.setPointerCapture(e.pointerId)
}
function pointerMove(e) {
  if (!drag) return
  const p = point(e)
  if(drag.mode==='scale')emit('transform',drag.id,scaleCanvasTransform(drag,p))
  else if(drag.mode==='rotate')emit('transform',drag.id,rotateCanvasTransform(drag.pose,drag.point,p,e.shiftKey))
  else {
    const others=props.clips.filter(c=>c.id!==drag.id && clipVisible(c,props.time)).map(pose)
    const snapped=snapCanvasPosition(drag.pose,{x:drag.pose.x+p.x-drag.point.x,y:drag.pose.y+p.y-drag.point.y},others,8*960/canvas.value.getBoundingClientRect().width,e.altKey)
    guides.value=snapped.guides;emit('move',drag.id,snapped.position)
  }
}
function pointerUp() { if(drag)emit('end-edit'); drag = null;guides.value=[] }
function endNudge(){if(nudgeKeys.size)emit('end-edit');nudgeKeys.clear()}
function nudgeKey(e){
  if(e.defaultPrevented || e.isComposing || e.target!==stage.value || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey)return
  e.preventDefault();e.stopPropagation()
  if(drag || props.playing || props.recording || !props.selected || props.selected.layerLocked || !clipVisible(props.selected,props.time))return
  if(!nudgeKeys.size)emit('begin-edit')
  nudgeKeys.add(e.key)
  emit('move',props.selected.id,nudgeCanvasPosition(pose(props.selected),e.key,e.shiftKey))
}
function nudgeUp(e){if(!nudgeKeys.has(e.key))return;nudgeKeys.delete(e.key);if(!nudgeKeys.size)emit('end-edit')}
watch(()=>[props.selected?.id,props.selected?.layerLocked,props.selected?.layerHidden,props.playing,props.recording],()=>{endNudge();if(drag && (props.selected?.id!==drag.id || props.selected?.layerLocked || props.selected?.layerHidden || props.playing || props.recording))pointerUp()})
function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 960, 540)
    ctx.fillStyle = props.background
    ctx.fillRect(0, 0, 960, 540)
    if(backgroundImage)ctx.drawImage(backgroundImage,0,0,960,540)
    for (const clip of sceneDrawOrder(props.clips)) {
      if (!clipVisible(clip, props.time)) continue
      const runtime = props.runtimes[clip.id]
      if (!runtime) continue
      const t = pose(clip)
      let source = runtime.canvas()
      if (!source?.width || !source?.height) continue
      // SDK 的呼吸/眨眼继续运行；暂停预览用快照，避免时间线停了画面还在动。
      // 参数或播放头改变后等两个绘制周期，再冻结更新后的姿态。
      if (props.playing || runtime.livePreview) pausedFrames.delete(clip.id)
      else {
        let frozen = pausedFrames.get(clip.id)
        if (!frozen || frozen.revision !== runtime.renderRevision) {
          const image = document.createElement('canvas')
          image.width = source.width; image.height = source.height
          frozen = { image, revision: runtime.renderRevision, captures: 0 }
          pausedFrames.set(clip.id, frozen)
        }
        if (frozen.captures < 2) {
          frozen.image.getContext('2d').clearRect(0, 0, source.width, source.height)
          frozen.image.getContext('2d').drawImage(source, 0, 0)
          frozen.captures++
        }
        source = frozen.image
      }
      ctx.save()
      ctx.translate(480 + t.x, 270 + t.y)
      ctx.rotate(t.rotation * Math.PI / 180)
      ctx.scale(t.scale, t.scale)
      ctx.globalAlpha = Math.max(0, Math.min(1, t.opacity))
      ctx.drawImage(source, -480, -270, 960, 540)
      ctx.restore()
    }
    for (const id of pausedFrames.keys()) if (!props.clips.some(c=>c.id===id)) pausedFrames.delete(id)
  }
  raf = requestAnimationFrame(draw)
}
defineExpose({ getCanvas: () => canvas.value })
function resizePreview(){
  if(!preview.value)return
  const width=Math.max(1,preview.value.clientWidth-24),height=Math.max(1,preview.value.clientHeight-24)
  stageWidth.value=previewFit.value==='width' ? width : Math.min(width,height*16/9)
}
watch(previewFit,()=>{resizePreview();if(preview.value){preview.value.scrollTop=0;preview.value.scrollLeft=0}})
onMounted(() => {
  window.addEventListener('keyup',nudgeUp)
  window.addEventListener('blur',endNudge)
  document.addEventListener('pointermove',trackMouse,{passive:true})
  document.addEventListener('pointerout',clearMouse,{passive:true})
  resizeObserver = new ResizeObserver(resizePreview)
  resizeObserver.observe(preview.value)
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => {pointerUp();endNudge();window.removeEventListener('keyup',nudgeUp);window.removeEventListener('blur',endNudge);document.removeEventListener('pointermove',trackMouse);document.removeEventListener('pointerout',clearMouse);imageRequest++;backgroundImage=null;cancelAnimationFrame(raf);resizeObserver?.disconnect()})
</script>
<style scoped>
.scene-preview { flex:1; min-height:220px; display:flex; flex-direction:column; background:#101522; overflow:hidden; position:relative; }
.preview-viewport { flex:1; min-height:0; min-width:0; display:flex; overflow:auto; padding:12px; box-sizing:border-box; }
.preview-tools { position:absolute; top:8px; right:24px; display:flex; gap:5px; z-index:2; }
.preview-tools button { font:inherit; background:#263751; border:1px solid #455a76; color:#dce5f2; border-radius:4px; padding:5px 8px; cursor:pointer; }
.preview-tools button[aria-pressed=true] { border-color:#83c9ff; color:#b6e2ff; }
.scene-stage { position:relative; flex-shrink:0; margin:auto; }
.scene-stage:focus-visible { outline:2px solid #83c9ff; outline-offset:2px; }
.canvas-guide { position:absolute; pointer-events:none; background:#ffd083; z-index:2; }
.canvas-guide.x { top:0; bottom:0; width:1px; }.canvas-guide.y { left:0; right:0; height:1px; }
.scene-stage canvas { display:block; width:100%; height:100%; cursor:grab; }
.selection-outline { position:absolute; border:1px solid #67c7ff; pointer-events:none; box-sizing:border-box; }
.selection-outline span { position:absolute; left:0; top:0; background:#153451; font-size:10px; max-width:100%; overflow:hidden; white-space:nowrap; }
.selection-outline { transform-origin:center; }
.selection-outline .transform-handle { position:absolute; pointer-events:auto; touch-action:none; box-sizing:border-box; padding:0!important; background:#dcefff!important; border:1px solid #427ea5!important; color:#153451!important; width:12px; height:12px; border-radius:2px!important; z-index:1; }
.scale-handle.nw { left:-6px; top:-6px; cursor:nwse-resize!important; }.scale-handle.ne { right:-6px; top:-6px; cursor:nesw-resize!important; }.scale-handle.sw { left:-6px; bottom:-6px; cursor:nesw-resize!important; }.scale-handle.se { right:-6px; bottom:-6px; cursor:nwse-resize!important; }
.selection-outline .rotate-handle { top:10px; left:calc(50% - 10px); width:20px; height:20px; border-radius:50%!important; cursor:grab!important; line-height:18px; font-size:14px; }.rotation-stem { position:absolute; left:50%; top:0; height:10px; border-left:1px solid #67c7ff; }
.empty-scene { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; color:white; text-shadow:0 1px 3px black; }
</style>
