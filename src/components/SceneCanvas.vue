<template>
  <div class="scene-preview">
    <div v-if="selectionEntries.length>1 && !recording" class="selection-tools" role="group" aria-label="多人对齐与分布">
      <span>已选 {{ selectionEntries.length }} 人</span>
      <button v-for="tool in layoutTools" :key="tool.key" :disabled="playing || !layoutSelection(selectionEntries,tool.key).length" :title="tool.title" @click="applyLayout(tool.key)">{{ tool.label }}</button>
    </div>
    <div class="preview-tools" role="group" aria-label="画布缩放"><span>画布</span><small aria-hidden="true">10%</small><input type="range" aria-label="画布缩放比例" min="10" max="200" step="1" :value="displayZoom" :aria-valuetext="displayZoom+'%'" @input="changePreviewZoom($event.target.value)" /><small aria-hidden="true">200%</small><output aria-live="off">{{displayZoom}}%</output><button :aria-pressed="previewFit==='manual' && manualZoom===100" title="按工程尺寸显示：100%" @click="changePreviewZoom(100)">100%</button><button :aria-pressed="previewFit==='width'" title="按预览区宽度显示，超出高度时上下滚动" @click="fitPreview('width')">适应宽度</button><button :aria-pressed="previewFit==='contain'" title="保持比例并完整显示画面" @click="fitPreview('contain')">完整画面</button></div>
    <div class="preview-viewport" ref="preview" :class="{'pan-active':!!panDrag}" title="按住鼠标中键拖动平移视野" @pointerdown.capture="beginPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan" @auxclick.middle.prevent>
    <div class="scene-stage" ref="stage" tabindex="0" aria-label="画布编辑区域" @keydown="nudgeKey" @focusout="endNudge" :style="{ width: stageWidth + 'px', height:stageWidth*size.height/size.width+'px',transform:'translate('+viewPan.x+'px,'+viewPan.y+'px)' }" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerUp">
      <canvas ref="canvas" :width="size.width" :height="size.height" aria-label="场景合成画布" @pointerdown="pointerDown"></canvas>
      <div v-if="selectionEntries.length>1" v-for="entry in selectionEntries" :key="entry.id" class="selection-outline member-outline" :style="poseBox(entry.pose)" aria-hidden="true"></div>
      <div v-if="selectedBox" class="selection-outline" :style="selectedBox" :aria-label="'已选 '+selectionEntries.length+' 个人物'"><span>{{ selectionEntries.length>1 ? '已选 '+selectionEntries.length+' 个人物' : selected?.name }}</span><template v-if="!playing"><button v-for="corner in ['nw','ne','sw','se']" :key="corner" class="transform-handle scale-handle" :class="corner" :aria-label="'缩放模型 '+corner" :title="selectionEntries.length>1 ? '围绕选区中心整体缩放' : '拖动等比缩放，对角固定'" @pointerdown.stop.prevent="beginTransform($event,'scale',corner)"></button><i class="rotation-stem" aria-hidden="true"></i><button class="transform-handle rotate-handle" aria-label="旋转模型" title="拖动旋转；按住 Shift 吸附到 15°" @pointerdown.stop.prevent="beginTransform($event,'rotate')">↻</button></template></div>
      <div v-if="marquee" class="canvas-marquee" :style="marquee" aria-hidden="true"></div>
      <div v-for="guide in guides" :key="guide.axis" class="canvas-guide" :class="guide.axis" :style="guide.axis==='x' ? {left:(guide.value+size.width/2)/size.width*100+'%'} : {top:(guide.value+size.height/2)/size.height*100+'%'}" aria-hidden="true"></div>
      <div v-if="!clips.length" class="empty-scene">从左侧素材库添加模型到场景</div>
    </div>
    </div>
    <ClipRenderer v-for="clip in clips" :key="clip.id" :clip="clip" @ready="ready" @error="(id, message) => emit('error', id, message)" @dispose="dispose" />
  </div>
</template>
<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import ClipRenderer from './ClipRenderer.vue'
import {sceneDrawOrder,sceneHitOrder} from '../sceneLayers.js'
import { clipVisible, sampleClip, sceneSize } from '../sceneProject.js'
import { beginCanvasTransform,scaleCanvasTransform,rotateCanvasTransform } from '../canvasTransform.js'
import { snapCanvasPosition,nudgeCanvasPosition } from '../canvasPosition.js'
import {selectionBounds,boxSelected,moveSelection,scaleSelection,rotateSelection,layoutSelection} from '../canvasSelection.js'
import {isPanButton,panOffset} from '../canvasPan.js'
const props = defineProps({ clips: Array, time: Number, fps: Number, aspectRatio:String, selected: Object, selectedIds:Array, runtimes: Object, playing: Boolean, background: String, backgroundImage: String, recording: Boolean })
const emit = defineEmits(['ready', 'dispose', 'error', 'select', 'move', 'transform', 'batch-transform', 'begin-edit', 'end-edit', 'background-ready', 'mouse-position'])
const size=computed(()=>sceneSize(props.aspectRatio))
const previewFit=ref('width')
const manualZoom=ref(100)
const panDrag=ref(null),viewPan=ref({x:0,y:0})
const cancelPan=()=>endPan()
function beginPan(e){
  if(props.recording || drag || !isPanButton(e.button))return
  e.preventDefault();e.stopPropagation();endNudge()
  panDrag.value={pointerId:e.pointerId,x:e.clientX,y:e.clientY,origin:{...viewPan.value}}
  preview.value.setPointerCapture(e.pointerId)
  stage.value.focus({preventScroll:true})
}
function movePan(e){
  const pan=panDrag.value;if(!pan || pan.pointerId!==e.pointerId)return
  e.preventDefault();e.stopPropagation()
  viewPan.value=panOffset(pan.origin,pan,{x:e.clientX,y:e.clientY})
}
function endPan(e){
  if(!panDrag.value || (e && e.pointerId!==panDrag.value.pointerId))return
  e?.preventDefault();e?.stopPropagation()
  const id=panDrag.value.pointerId;panDrag.value=null
  if(preview.value?.hasPointerCapture(id))preview.value.releasePointerCapture(id)
}
watch(()=>props.recording,value=>{if(value)endPan()})
const displayZoom=computed(()=>Math.round(stageWidth.value/size.value.width*100))
function changePreviewZoom(value){manualZoom.value=Math.max(10,Math.min(200,Number(value)||100));previewFit.value='manual'}
const guides=ref([]),nudgeKeys=new Set()
const marquee=ref(null)
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
const editableClips=computed(()=>props.clips.filter(c=>!c.layerLocked && clipVisible(c,props.time)))
const selectionEntries=computed(()=>editableClips.value.filter(c=>(props.selectedIds || [props.selected?.id]).includes(c.id)).map(c=>({id:c.id,pose:pose(c)})))
function poseBox(t){
  return {
    left: ((size.value.width/2 + t.x - 160 * t.scale) / size.value.width * 100) + '%', top: ((size.value.height/2 + t.y - 255 * t.scale) / size.value.height * 100) + '%',
    width: (320 * t.scale / size.value.width * 100) + '%', height: (510 * t.scale / size.value.height * 100) + '%',
    transform: 'rotate(' + t.rotation + 'deg)',
  }
}
const selectedBox=computed(()=>{
  if(props.recording || !selectionEntries.value.length)return null
  if(selectionEntries.value.length===1)return poseBox(selectionEntries.value[0].pose)
  const b=selectionBounds(selectionEntries.value)
  return {left:(b.left+size.value.width/2)/size.value.width*100+'%',top:(b.top+size.value.height/2)/size.value.height*100+'%',width:b.width/size.value.width*100+'%',height:b.height/size.value.height*100+'%'}
})
const layoutTools=[
  {key:'left',label:'左对齐',title:'按人物旋转后的外框左边缘对齐'},
  {key:'centerX',label:'水平居中',title:'人物中心对齐到选区水平中心'},
  {key:'right',label:'右对齐',title:'按人物旋转后的外框右边缘对齐'},
  {key:'top',label:'顶部对齐',title:'按人物旋转后的外框顶部对齐'},
  {key:'centerY',label:'垂直居中',title:'人物中心对齐到选区垂直中心'},
  {key:'bottom',label:'底部对齐',title:'按人物旋转后的外框底部对齐'},
  {key:'distributeX',label:'水平等距',title:'至少选择三人；固定左右两端，外框间距相等'},
  {key:'distributeY',label:'垂直等距',title:'至少选择三人；固定上下两端，外框间距相等'},
  {key:'centerCanvas',label:'整组居中',title:'将选区中心移至画布中心，保持人物间距'},
]
function applyLayout(operation){
  if(props.playing || props.recording || drag)return
  endNudge()
  const entries=layoutSelection(selectionEntries.value,operation)
  if(!entries.length)return
  emit('begin-edit');emit('batch-transform',entries);emit('end-edit')
}
function point(e) {
  const r = canvas.value.getBoundingClientRect()
  return { x: (e.clientX - r.left) * size.value.width / r.width - size.value.width/2, y: (e.clientY - r.top) * size.value.height / r.height - size.value.height/2 }
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
  const sorted = sceneHitOrder(editableClips.value)
  const hit = sorted.find(c => {
    const t = pose(c), r = -t.rotation * Math.PI / 180
    const x = p.x - t.x, y = p.y - t.y
    return Math.abs(x * Math.cos(r) - y * Math.sin(r)) <= 160 * t.scale && Math.abs(x * Math.sin(r) + y * Math.cos(r)) <= 255 * t.scale
  })
  const current=selectionEntries.value.map(e=>e.id)
  if (!hit){drag={mode:'box',point:p,last:p,base:e.shiftKey ? current : []};stage.value.setPointerCapture(e.pointerId);return}
  if(e.shiftKey){const ids=current.includes(hit.id) ? current.filter(id=>id!==hit.id) : [...current,hit.id];emit('select',ids,ids.at(-1));return}
  const ids=current.includes(hit.id) ? current : [hit.id]
  emit('select',ids,hit.id)
  emit('begin-edit')
  drag = { id: hit.id, entries:ids.map(id=>({id,pose:pose(props.clips.find(c=>c.id===id))})), mode:'move', point: p, pose: pose(hit) }
  stage.value.setPointerCapture(e.pointerId)
}
function beginTransform(e,mode,corner='se'){
  endNudge();stage.value.focus({preventScroll:true})
  if(e.button!==0 || props.playing || props.recording || !selectionEntries.value.length)return
  const p=point(e),entries=selectionEntries.value.map(e=>({id:e.id,pose:{...e.pose}})),t=entries[0].pose
  emit('begin-edit');drag={...beginCanvasTransform(t,p,corner),id:entries[0].id,entries,center:selectionBounds(entries),mode}
  stage.value.setPointerCapture(e.pointerId)
}
function pointerMove(e) {
  if (!drag) return
  const p = point(e)
  if(drag.mode==='box'){
    drag.last=p
    marquee.value={left:(Math.min(drag.point.x,p.x)+size.value.width/2)/size.value.width*100+'%',top:(Math.min(drag.point.y,p.y)+size.value.height/2)/size.value.height*100+'%',width:Math.abs(p.x-drag.point.x)/size.value.width*100+'%',height:Math.abs(p.y-drag.point.y)/size.value.height*100+'%'}
    return
  }
  if(drag.entries.length>1 && drag.mode!=='move'){
    const center=drag.center
    if(drag.mode==='scale'){
      const start={x:drag.point.x-center.x,y:drag.point.y-center.y},length=start.x**2+start.y**2
      emit('batch-transform',scaleSelection(drag.entries,center,length ? ((p.x-center.x)*start.x+(p.y-center.y)*start.y)/length : 1))
    }else{
      const angle=at=>Math.atan2(at.y-center.y,at.x-center.x)*180/Math.PI
      const raw=((angle(p)-angle(drag.point)+540)%360)-180,delta=e.shiftKey ? Math.round(raw/15)*15 : Math.round(raw)
      emit('batch-transform',rotateSelection(drag.entries,center,delta))
    }
    return
  }
  if(drag.mode==='scale')emit('transform',drag.id,scaleCanvasTransform(drag,p))
  else if(drag.mode==='rotate')emit('transform',drag.id,rotateCanvasTransform(drag.pose,drag.point,p,e.shiftKey))
  else {
    const others=props.clips.filter(c=>!drag.entries.some(entry=>entry.id===c.id) && clipVisible(c,props.time)).map(pose)
    const snapped=snapCanvasPosition(drag.pose,{x:drag.pose.x+p.x-drag.point.x,y:drag.pose.y+p.y-drag.point.y},others,8*size.value.width/canvas.value.getBoundingClientRect().width,e.altKey,size.value)
    const entries=moveSelection(drag.entries,{x:snapped.position.x-drag.pose.x,y:snapped.position.y-drag.pose.y})
    guides.value=snapped.guides.filter(g=>Math.abs(entries.find(e=>e.id===drag.id).patch[g.axis]-snapped.position[g.axis])<1e-7)
    if(entries.length>1)emit('batch-transform',entries);else emit('move',drag.id,entries[0].patch)
  }
}
function pointerUp(event) {
  if(drag?.mode==='box'){
    if(!event || !['pointercancel','lostpointercapture'].includes(event.type)){
      const moved=Math.hypot(drag.last.x-drag.point.x,drag.last.y-drag.point.y)>3
      const ids=[...new Set([...drag.base,...(moved ? boxSelected(editableClips.value.map(c=>({id:c.id,pose:pose(c)})),drag.point,drag.last) : [])])]
      emit('select',ids,ids.at(-1))
    }
  }else if(drag)emit('end-edit')
  drag = null;guides.value=[];marquee.value=null
}
function endNudge(){if(nudgeKeys.size)emit('end-edit');nudgeKeys.clear()}
function nudgeKey(e){
  if(e.defaultPrevented || e.isComposing || e.target!==stage.value || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey)return
  e.preventDefault();e.stopPropagation()
  if(drag || props.playing || props.recording || !selectionEntries.value.length)return
  if(!nudgeKeys.size)emit('begin-edit')
  nudgeKeys.add(e.key)
  const entries=selectionEntries.value,first=entries[0],next=nudgeCanvasPosition(first.pose,e.key,e.shiftKey)
  if(entries.length>1)emit('batch-transform',moveSelection(entries,{x:next.x-first.pose.x,y:next.y-first.pose.y}));else emit('move',first.id,next)
}
function nudgeUp(e){if(!nudgeKeys.has(e.key))return;nudgeKeys.delete(e.key);if(!nudgeKeys.size)emit('end-edit')}
watch(()=>selectionEntries.value.map(e=>e.id).join(',')+'|'+props.playing+'|'+props.recording,()=>{endNudge();if(drag && (props.playing || props.recording || (drag.mode!=='box' && drag.entries.some(e=>!selectionEntries.value.some(entry=>entry.id===e.id)))))pointerUp({type:'pointercancel'})})
function draw() {
  const ctx = canvas.value?.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, size.value.width, size.value.height)
    ctx.fillStyle = props.background
    ctx.fillRect(0, 0, size.value.width, size.value.height)
    if(backgroundImage)ctx.drawImage(backgroundImage,0,0,size.value.width,size.value.height)
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
      ctx.translate(size.value.width/2 + t.x, size.value.height/2 + t.y)
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
  const fitWidth=previewFit.value==='width' ? width : Math.min(width,height*size.value.width/size.value.height)
  stageWidth.value=previewFit.value==='manual' ? size.value.width*manualZoom.value/100 : Math.max(size.value.width*.1,Math.min(size.value.width*2,fitWidth))
}
async function fitPreview(mode){viewPan.value={x:0,y:0};previewFit.value=mode;resizePreview();await nextTick();if(preview.value){preview.value.scrollTop=0;preview.value.scrollLeft=0}}
watch([previewFit,manualZoom,()=>props.aspectRatio],async()=>{
  const viewport=preview.value,element=stage.value
  const x=viewport && element ? (viewport.scrollLeft+viewport.clientWidth/2-element.offsetLeft-viewPan.value.x)/stageWidth.value : .5
  const y=viewport && element ? (viewport.scrollTop+viewport.clientHeight/2-element.offsetTop-viewPan.value.y)/element.getBoundingClientRect().height : .5
  if(previewFit.value!=='manual')viewPan.value={x:0,y:0}
  resizePreview();await nextTick()
  if(!viewport || !element)return
  viewport.scrollLeft=previewFit.value==='manual' ? element.offsetLeft+viewPan.value.x+Math.max(0,Math.min(1,x))*stageWidth.value-viewport.clientWidth/2 : 0
  viewport.scrollTop=previewFit.value==='manual' ? element.offsetTop+viewPan.value.y+Math.max(0,Math.min(1,y))*stageWidth.value*size.value.height/size.value.width-viewport.clientHeight/2 : 0
})
onMounted(() => {
  window.addEventListener('blur',cancelPan)
  window.addEventListener('keyup',nudgeUp)
  window.addEventListener('blur',endNudge)
  document.addEventListener('pointermove',trackMouse,{passive:true})
  document.addEventListener('pointerout',clearMouse,{passive:true})
  resizeObserver = new ResizeObserver(resizePreview)
  resizeObserver.observe(preview.value)
  raf = requestAnimationFrame(draw)
})
onBeforeUnmount(() => {endPan();window.removeEventListener('blur',cancelPan);pointerUp({type:'pointercancel'});endNudge();window.removeEventListener('keyup',nudgeUp);window.removeEventListener('blur',endNudge);document.removeEventListener('pointermove',trackMouse);document.removeEventListener('pointerout',clearMouse);imageRequest++;backgroundImage=null;cancelAnimationFrame(raf);resizeObserver?.disconnect()})
</script>
<style scoped>
.scene-preview { flex:1; min-height:220px; display:flex; flex-direction:column; background:var(--editor-bg); overflow:hidden; position:relative; }
.selection-tools { display:flex; align-items:center; flex-wrap:wrap; gap:5px; padding:8px 12px; border-bottom:1px solid var(--editor-border); background:var(--editor-panel); font-size:11px; }
.selection-tools span { color:var(--editor-muted); margin-right:4px; }
.selection-tools button { font:inherit; padding:5px 7px; border:1px solid var(--editor-border); border-radius:var(--editor-radius); background:var(--editor-soft); color:var(--editor-text); cursor:pointer; }
.selection-tools button:hover:not(:disabled) { background:var(--editor-hover); }
.selection-tools button:disabled { opacity:.45; cursor:default; }
.selection-tools button:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
.preview-viewport { position:relative; flex:1; min-height:0; min-width:0; display:flex; overflow:auto; padding:12px; box-sizing:border-box; }
.preview-viewport.pan-active,.preview-viewport.pan-active * { cursor:grabbing!important; user-select:none; }
.preview-tools { flex-shrink:0; display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:6px; padding:7px 12px; border-bottom:1px solid var(--editor-border); background:var(--editor-panel); font-size:11px; }
.preview-tools>span { margin-right:auto; color:var(--editor-muted); }
.preview-tools input[type=range] { width:110px; flex:0 1 110px; accent-color:var(--editor-focus); }
.preview-tools output { min-width:34px; text-align:right; font-variant-numeric:tabular-nums; color:var(--editor-muted); }
.preview-tools button { font:inherit; background:var(--editor-soft); border:1px solid var(--editor-border); color:var(--editor-text); border-radius:var(--editor-radius); padding:5px 8px; cursor:pointer; }
.preview-tools button[aria-pressed=true] { border-color:var(--editor-focus); color:var(--editor-accent); }
.scene-stage { position:relative; flex-shrink:0; margin:auto; overflow:clip; }
.scene-stage:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
.canvas-guide { position:absolute; pointer-events:none; background:var(--editor-guide); z-index:2; }
.canvas-guide.x { top:0; bottom:0; width:1px; }.canvas-guide.y { left:0; right:0; height:1px; }
.scene-stage canvas { display:block; width:100%; height:100%; cursor:grab; }
.selection-outline { position:absolute; border:1px solid var(--editor-focus); pointer-events:none; box-sizing:border-box; }
.selection-outline span { position:absolute; left:0; top:0; background:var(--editor-accent); font-size:10px; max-width:100%; overflow:hidden; white-space:nowrap; }
.selection-outline { transform-origin:center; }
.selection-outline .transform-handle { position:absolute; pointer-events:auto; touch-action:none; box-sizing:border-box; padding:0!important; background:var(--editor-panel)!important; border:1px solid var(--editor-focus)!important; color:var(--editor-accent)!important; width:12px; height:12px; border-radius:2px!important; z-index:1; }
.scale-handle.nw { left:-6px; top:-6px; cursor:nwse-resize!important; }.scale-handle.ne { right:-6px; top:-6px; cursor:nesw-resize!important; }.scale-handle.sw { left:-6px; bottom:-6px; cursor:nesw-resize!important; }.scale-handle.se { right:-6px; bottom:-6px; cursor:nwse-resize!important; }
.selection-outline .rotate-handle { top:10px; left:calc(50% - 10px); width:20px; height:20px; border-radius:50%!important; cursor:grab!important; line-height:18px; font-size:14px; }.rotation-stem { position:absolute; left:50%; top:0; height:10px; border-left:1px solid var(--editor-focus); }
.empty-scene { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; color:white; text-shadow:0 1px 3px black; }
.scene-preview { background:var(--editor-bg); }
.preview-viewport { padding:12px; }
.scene-stage canvas { border-radius:0; }
.scene-stage { border-radius:0; box-shadow:0 2px 12px #503b4610; }
.selection-outline span { color:#fff; padding:2px 4px; border-radius:3px; }
.selection-outline .transform-handle { color:var(--editor-accent)!important; }
.member-outline { border-style:dashed; opacity:.55; }
.canvas-marquee { position:absolute; border:1px solid var(--editor-focus); background:#a7658126; pointer-events:none; z-index:3; }
.empty-scene { color:#fff; }
</style>
