<template>
  <section class="media-crop-inspector" aria-label="图片和视频画面裁剪">
    <h4>画面裁剪与适应</h4>
    <p>调整源画面裁剪边距，保留区域居中显示；不会修改素材文件或片段时间。</p>
    <div class="crop-fields"><label v-for="field in fields" :key="field.key">{{field.label}} %<input :aria-label="'画面裁剪'+field.label" type="number" min="0" :max="maxEdge(field.key)" step="0.1" :value="percent(field.key)" :disabled="disabled" @focus="emit('begin-edit')" @blur="$event.target.value=percent(field.key);emit('end-edit')" @input="editEdge(field.key,$event.target.value)" /></label></div>
    <small>保留画面 {{(crop.width*100).toFixed(1)}}% × {{(crop.height*100).toFixed(1)}}%</small>
    <div class="crop-actions" role="group" aria-label="源画面翻转"><button :disabled="disabled" :aria-pressed="clip.flipX===true" @click="flip('flipX')">水平翻转</button><button :disabled="disabled" :aria-pressed="clip.flipY===true" @click="flip('flipY')">垂直翻转</button></div>
    <p>翻转裁剪后保留的画面；边距始终对应原素材方向，不改变位置、旋转或关键帧。再点一次恢复。</p>
    <div class="crop-actions"><button :disabled="disabled" @click="reset">重置裁剪</button><button :disabled="disabled || !visible" @click="emit('fit','contain')">完整显示</button><button :disabled="disabled || !visible" @click="emit('fit','cover')">铺满画布</button></div>
    <p>完整显示保留全部裁剪区域；铺满画布保持比例，超出画布的部分不显示。两者都会居中并将旋转、X / Y 倍率重新设定；变换沿用现有关键帧设置，可一步撤销。</p>
  </section>
</template>
<script setup>
import {computed} from 'vue'
import {normalizeMediaCrop,cropEdges,cropWithEdge} from '../mediaCrop.js'
const props=defineProps({clip:{type:Object,required:true},disabled:Boolean,visible:Boolean})
const emit=defineEmits(['edit','fit','begin-edit','end-edit'])
const fields=[{key:'left',label:'左边距'},{key:'right',label:'右边距'},{key:'top',label:'上边距'},{key:'bottom',label:'下边距'}]
const opposite={left:'right',right:'left',top:'bottom',bottom:'top'}
const crop=computed(()=>normalizeMediaCrop(props.clip.crop)),edges=computed(()=>cropEdges(props.clip.crop))
const percent=key=>Math.round(edges.value[key]*1000)/10
const maxEdge=key=>Math.max(0,Math.floor((.99-edges.value[opposite[key]])*1000)/10)
function editEdge(key,value){if(value==='' || !Number.isFinite(Number(value)))return;emit('edit',{crop:cropWithEdge(props.clip.crop,key,Number(value))})}
function reset(){emit('end-edit');emit('begin-edit');emit('edit',{crop:normalizeMediaCrop()});emit('end-edit')}
function flip(key){emit('end-edit');emit('begin-edit');emit('edit',{[key]:props.clip[key]!==true});emit('end-edit')}
</script>
<style scoped>
.crop-actions button[aria-pressed="true"] { background:var(--editor-accent-soft,#e7edf9); border-color:var(--editor-accent,#596da7); }
.media-crop-inspector { margin-top:14px; padding-top:12px; border-top:1px solid var(--editor-border); min-width:0; }.media-crop-inspector h4 { margin:0 0 10px; }.media-crop-inspector p,.media-crop-inspector small { font-size:11px; line-height:1.6; color:var(--editor-muted); }.crop-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }.crop-fields label { display:flex; flex-direction:column; gap:5px; min-width:0; font-size:11px; }.crop-fields input { min-width:0; width:100%; box-sizing:border-box; padding:7px; background:var(--editor-soft); color:var(--editor-text); border:1px solid var(--editor-border); border-radius:6px; font:inherit; }.crop-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }.crop-actions button { cursor:pointer; font:inherit; padding:6px 8px; border-radius:6px; border:1px solid var(--editor-border); background:var(--editor-soft); color:var(--editor-text); }.crop-actions button:disabled { cursor:default; opacity:.45; }
</style>
