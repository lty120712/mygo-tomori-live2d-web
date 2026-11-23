<template>
  <section class="media-mask-inspector" aria-label="画面遮罩设置">
    <h4>{{context==='background' ? '背景遮罩' : '画面遮罩'}}</h4>
    <label class="mask-type">遮罩形状<select aria-label="画面遮罩形状" :value="mask.type" :disabled="disabled" @change="changeType($event.target.value)"><option v-for="option in MEDIA_MASK_TYPES" :key="option.value" :value="option.value">{{option.label}}</option></select></label>
    <template v-if="mask.type!=='none'">
      <div class="mask-grid"><label v-for="field in fields" :key="field.key">{{field.label}} %<input type="number" :aria-label="'遮罩'+field.label" min="0" :max="maxEdge(field.key)" step="0.1" :value="percent(field.key)" :disabled="disabled" @focus="emit('begin-edit')" @blur="$event.target.value=percent(field.key);emit('end-edit')" @input="editEdge(field.key,$event.target.value)" /></label></div>
      <label v-if="mask.type==='rounded'" class="mask-radius">圆角 %<div><input type="range" aria-label="遮罩圆角滑条" min="0" max="50" step="1" :value="Math.round(mask.radius*100)" :disabled="disabled" @pointerdown="$event.target.focus({preventScroll:true});$event.target.setPointerCapture($event.pointerId);emit('begin-edit')" @focus="emit('begin-edit')" @blur="emit('end-edit')" @pointerup="emit('end-edit')" @pointercancel="emit('end-edit')" @lostpointercapture="emit('end-edit')" @keydown="!$event.repeat && emit('begin-edit')" @keyup="emit('end-edit')" @input="editRadius($event.target.value)" /><input type="number" aria-label="遮罩圆角数值" min="0" max="50" step="1" :value="Math.round(mask.radius*100)" :disabled="disabled" @focus="emit('begin-edit')" @blur="$event.target.value=Math.round(mask.radius*100);emit('end-edit')" @input="editRadius($event.target.value)" /></div></label>
      <small>显示范围 {{(mask.width*100).toFixed(1)}}% × {{(mask.height*100).toFixed(1)}}%</small>
    </template>
    <button :disabled="disabled" @click="reset">重置遮罩</button>
    <p v-if="context==='background'">以整个画布为基准保留形状内的背景片段，外部显示场景设置的兜底背景。遮罩不影响片段时间或上方图层。</p>
    <p v-else>以片段编辑框为基准，保留形状内画面，外部透明；图片和视频使用裁剪后的画面。遮罩随旋转、缩放及入出场动画，选择框保持原尺寸。素材翻转不改变遮罩范围。</p>
  </section>
</template>
<script setup>
import {computed} from 'vue'
import {MEDIA_MASK_TYPES,normalizeMediaMask} from '../mediaMask.js'
import {cropEdges,cropWithEdge} from '../mediaCrop.js'
const props=defineProps({clip:{type:Object,required:true},disabled:Boolean,context:{type:String,default:'visual'}})
const emit=defineEmits(['edit','begin-edit','end-edit'])
const mask=computed(()=>normalizeMediaMask(props.clip.mask)),edges=computed(()=>cropEdges(mask.value))
const fields=[{key:'left',label:'左边距'},{key:'right',label:'右边距'},{key:'top',label:'上边距'},{key:'bottom',label:'下边距'}],opposite={left:'right',right:'left',top:'bottom',bottom:'top'}
const percent=key=>Math.round(edges.value[key]*1000)/10
const maxEdge=key=>Math.max(0,Math.floor((.99-edges.value[opposite[key]])*1000)/10)
function update(patch){emit('edit',{mask:normalizeMediaMask({...mask.value,...patch})})}
function editEdge(key,value){if(value==='' || !Number.isFinite(Number(value)))return;update(cropWithEdge(mask.value,key,Number(value)))}
function editRadius(value){if(value==='' || !Number.isFinite(Number(value)))return;update({radius:Number(value)/100})}
function changeType(type){emit('end-edit');emit('begin-edit');update({type});emit('end-edit')}
function reset(){emit('end-edit');emit('begin-edit');emit('edit',{mask:normalizeMediaMask()});emit('end-edit')}
</script>
<style scoped>
.media-mask-inspector { margin-top:14px; padding-top:12px; border-top:1px solid var(--editor-border); min-width:0; }h4 { margin:0 0 12px; }
.mask-type,.mask-grid label,.mask-radius { display:flex; flex-direction:column; gap:5px; min-width:0; font-size:11px; }.mask-type { margin-bottom:12px; }.mask-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-bottom:10px; }
input,select { min-width:0; width:100%; box-sizing:border-box; padding:7px; font:inherit; border:1px solid var(--editor-border); border-radius:6px; color:var(--editor-text); background:var(--editor-soft); }
.mask-radius>div { display:grid; grid-template-columns:minmax(0,1fr) 65px; align-items:center; gap:8px; }.mask-radius { margin-bottom:10px; }input[type="range"] { padding:0; accent-color:var(--editor-accent,#596da7); }
small,p { color:var(--editor-muted); font-size:11px; line-height:1.6; }button { display:block; margin-top:10px; padding:6px 8px; font:inherit; border:1px solid var(--editor-border); border-radius:6px; background:var(--editor-soft); color:var(--editor-text); cursor:pointer; }input:disabled,select:disabled,button:disabled { opacity:.45; cursor:default; }
</style>
