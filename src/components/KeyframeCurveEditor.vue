<template>
  <dialog ref="dialog" class="curve-editor" aria-labelledby="curve-title" @cancel.prevent="emit('cancel')" @keydown.stop @click="closeOutside">
    <header><div><h2 id="curve-title">关键帧速度曲线</h2><p>{{description}}</p></div><button aria-label="关闭曲线编辑器" @click="emit('cancel')">×</button></header>
    <div class="curve-presets"><button v-for="preset in EASING_PRESETS" :key="preset.value" :aria-pressed="draft===preset.value" @click="draft=preset.value">{{preset.label}}</button><button :aria-pressed="custom" @click="makeCustom">自定义</button></div>
    <svg ref="graph" viewBox="0 0 300 200" class="curve-graph" aria-label="时间与变化进度曲线" @pointermove="moveHandle" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag">
      <path v-for="n in [0,.25,.5,.75,1]" :key="n" :d="`M ${30+n*240} 20 V 170 M 30 ${170-n*150} H 270`" class="grid" />
      <path d="M30 170L270 20" class="baseline" />
      <path :d="curvePath" class="curve-line" />
      <template v-if="custom"><path :d="`M30 170L${30+points[0]*240} ${170-points[1]*150}M270 20L${30+points[2]*240} ${170-points[3]*150}`" class="handle-line" /></template>
      <circle v-for="index in [0,1]" :key="index" :cx="30+points[index*2]*240" :cy="170-points[index*2+1]*150" r="7" class="curve-handle" tabindex="0" role="slider" :aria-label="'曲线控制点'+(index+1)" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(points[index*2]*100)" :aria-valuetext="`时间 ${Math.round(points[index*2]*100)}%，进度 ${Math.round(points[index*2+1]*100)}%`" @pointerdown.prevent="beginDrag($event,index)" @keydown="nudge($event,index)" />
      <circle v-if="previewing || previewTime>0" :cx="30+previewTime*240" :cy="170-applyKeyEasing(previewTime,draft)*150" r="5" class="preview-dot" />
      <text x="30" y="190">0%</text><text x="248" y="190">100%</text><text x="126" y="198">时间 →</text><text x="3" y="15">进度</text>
    </svg>
    <p class="curve-help">曲线越陡，变化越快。拖动圆点自定义，方向键微调。作用于所选帧到下一帧的区间。</p>
    <div class="curve-values"><label v-for="(label,index) in ['起点控制 · 时间%','起点控制 · 进度%','终点控制 · 时间%','终点控制 · 进度%']" :key="index">{{label}}<input type="number" min="0" max="100" step="1" :aria-label="label" :value="Math.round(points[index]*100)" @input="setPoint(index,$event.target.value)" @blur="$event.target.value=Math.round(points[index]*100)" /></label></div>
    <div class="curve-preview"><span :style="{left:applyKeyEasing(previewTime,draft)*100+'%'}"></span></div>
    <footer><button @click="startPreview">{{previewing ? '重新预览' : '预览变化速度'}}</button><span>{{easingLabel(draft)}}</span><button @click="emit('cancel')">取消</button><button class="apply" :disabled="disabled" @click="emit('apply',normalizeEasing(draft))">应用曲线</button></footer>
  </dialog>
</template>
<script setup>
import {computed,ref,onMounted,onBeforeUnmount} from 'vue'
import {EASING_PRESETS,normalizeEasing,easingPoints,applyKeyEasing,easingLabel} from '../keyframeEasing.js'
const props=defineProps({value:[String,Object],description:String,disabled:Boolean})
const emit=defineEmits(['apply','cancel'])
const draft=ref(normalizeEasing(props.value)),dialog=ref(null),graph=ref(null),previewTime=ref(0),previewing=ref(false)
const points=computed(()=>easingPoints(draft.value)),custom=computed(()=>typeof draft.value==='object')
const curvePath=computed(()=>Array.from({length:101},(_,i)=>`${i ? 'L' : 'M'}${30+i/100*240} ${170-applyKeyEasing(i/100,draft.value)*150}`).join(' '))
let dragged=null,animation=null
function makeCustom(){draft.value={type:'bezier',points:points.value}}
function setPoint(index,value){const number=Number(value);if(!Number.isFinite(number))return;const next=points.value;next[index]=Math.max(0,Math.min(1,number/100));draft.value={type:'bezier',points:next}}
function beginDrag(event,index){if(event.button!==0)return;dragged=index;makeCustom();graph.value.setPointerCapture(event.pointerId)}
function moveHandle(event){if(dragged===null)return;const rect=graph.value.getBoundingClientRect(),next=points.value;next[dragged*2]=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*300-30)/240));next[dragged*2+1]=Math.max(0,Math.min(1,(170-(event.clientY-rect.top)/rect.height*200)/150));draft.value={type:'bezier',points:next}}
function endDrag(){dragged=null}
function nudge(event,index){if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const axis=index*2+(['ArrowUp','ArrowDown'].includes(event.key) ? 1 : 0),direction=['ArrowRight','ArrowUp'].includes(event.key) ? 1 : -1;setPoint(axis,points.value[axis]*100+direction*(event.shiftKey ? 10 : 1))}
function startPreview(){cancelAnimationFrame(animation);previewTime.value=0;previewing.value=true;const start=performance.now();function tick(now){previewTime.value=Math.min(1,(now-start)/2000);if(previewTime.value<1)animation=requestAnimationFrame(tick);else previewing.value=false}animation=requestAnimationFrame(tick)}
function closeOutside(event){if(event.target!==dialog.value)return;const r=dialog.value.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)emit('cancel')}
onMounted(()=>dialog.value.showModal())
onBeforeUnmount(()=>{cancelAnimationFrame(animation);dialog.value?.close()})
</script>
<style scoped>
.curve-editor { width:480px; max-width:calc(100vw - 40px); max-height:calc(100vh - 40px); box-sizing:border-box; overflow:auto; border:1px solid var(--editor-border); border-radius:16px; padding:20px; background:var(--editor-panel); color:var(--editor-text); font:12px system-ui,sans-serif; }
.curve-editor::backdrop { background:#3b253762; }header,footer { display:flex; align-items:center; gap:10px; }header { justify-content:space-between; }h2 { font-size:17px; margin:0 0 8px; }p { color:var(--editor-muted); line-height:1.6; }header p { margin:0 0 12px; }button { font:inherit; border:0; padding:8px 10px; border-radius:8px; background:var(--editor-soft); color:var(--editor-text); cursor:pointer; }button:hover { background:var(--editor-hover); }button[aria-pressed=true],button.apply { background:var(--editor-accent); color:white; }button:disabled { opacity:.45; cursor:default; }button:focus-visible,input:focus-visible,.curve-handle:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
.curve-presets { display:flex; flex-wrap:wrap; gap:5px; margin:8px 0 12px; }.curve-graph { width:100%; height:auto; display:block; background:var(--editor-soft); border-radius:10px; touch-action:none; }.grid { fill:none; stroke:var(--editor-border); stroke-width:.6; }.baseline { fill:none; stroke:var(--editor-muted); stroke-width:1; stroke-dasharray:3 4; opacity:.4; }.curve-line { fill:none; stroke:var(--editor-accent); stroke-width:2; }.handle-line { stroke:var(--editor-focus); fill:none; }.curve-handle { fill:var(--editor-panel); stroke:var(--editor-accent); stroke-width:2; cursor:grab; }.preview-dot { fill:var(--editor-accent); }text { fill:var(--editor-muted); font-size:8px; }
.curve-values { display:grid; grid-template-columns:1fr 1fr; gap:10px; }label { color:var(--editor-muted); font-size:11px; }input { display:block; width:100%; margin-top:4px; padding:7px; box-sizing:border-box; font:inherit; border:1px solid var(--editor-border); border-radius:6px; background:var(--editor-soft); color:var(--editor-text); }.curve-preview { position:relative; height:8px; margin:18px 10px; background:var(--editor-soft); border-radius:5px; }.curve-preview span { position:absolute; top:-3px; width:14px; height:14px; margin-left:-7px; border-radius:50%; background:var(--editor-accent); }footer { margin-top:14px; flex-wrap:wrap; }footer span { margin-right:auto; font-size:10px; color:var(--editor-muted); }
@media(max-height:760px) { .curve-graph { max-width:330px; margin-inline:auto; } }
</style>
