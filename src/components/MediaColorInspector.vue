<template>
  <section class="media-color-inspector" aria-label="图片和视频画面调色">
    <h4>画面调色</h4>
    <p v-if="!supported">当前浏览器不支持画面调色，请使用支持 Canvas 滤镜的浏览器。已保存的设置仍会保留。</p>
    <template v-else>
      <div v-for="field in MEDIA_ADJUSTMENT_FIELDS" :key="field.key" class="adjustment-row">
        <label :for="'media-'+field.key">{{field.label}}</label>
        <input type="range" :id="'media-'+field.key" :aria-label="'画面'+field.label+'滑条'" min="0" max="200" step="1" :value="percent(field.key)" :disabled="disabled" @pointerdown="$event.target.focus({preventScroll:true});$event.target.setPointerCapture($event.pointerId);emit('begin-edit')" @pointerup="emit('end-edit')" @pointercancel="emit('end-edit')" @lostpointercapture="emit('end-edit')" @focus="emit('begin-edit')" @blur="emit('end-edit')" @keydown="!$event.repeat && emit('begin-edit')" @keyup="emit('end-edit')" @input="edit(field.key,$event.target.value)" />
        <div class="adjustment-number"><input type="number" :aria-label="'画面'+field.label+'数值'" min="0" max="200" step="1" :value="percent(field.key)" :disabled="disabled" @focus="emit('begin-edit')" @blur="$event.target.value=percent(field.key);emit('end-edit')" @input="edit(field.key,$event.target.value)" /><span>%</span></div>
      </div>
      <button :disabled="disabled" @click="reset">重置调色</button>
      <p>100% 为原始值；0% 饱和度显示黑白。只调整当前图片或视频，不影响其他图层、透明度和声音。调色为整个片段的固定设置，可一步撤销。</p>
    </template>
  </section>
</template>
<script setup>
import {computed} from 'vue'
import {MEDIA_ADJUSTMENT_FIELDS,normalizeMediaAdjustments} from '../mediaAdjustments.js'
const props=defineProps({clip:{type:Object,required:true},disabled:Boolean})
const emit=defineEmits(['edit','begin-edit','end-edit'])
const supported=typeof document!=='undefined' && 'filter' in document.createElement('canvas').getContext('2d')
const values=computed(()=>normalizeMediaAdjustments(props.clip.adjustments))
const percent=key=>Math.round(values.value[key]*100)
function edit(key,input){if(input==='' || !Number.isFinite(Number(input)))return;emit('edit',{adjustments:{...values.value,[key]:Math.max(0,Math.min(200,Number(input)))/100}})}
function reset(){emit('end-edit');emit('begin-edit');emit('edit',{adjustments:normalizeMediaAdjustments()});emit('end-edit')}
</script>
<style scoped>
.media-color-inspector { margin-top:14px; padding-top:12px; border-top:1px solid var(--editor-border); min-width:0; }
h4 { margin:0 0 12px; }p { color:var(--editor-muted); font-size:11px; line-height:1.6; }
.adjustment-row { display:grid; grid-template-columns:48px minmax(36px,1fr) 68px; gap:8px; align-items:center; margin-bottom:12px; font-size:11px; }
.adjustment-row label { margin:0; }.adjustment-row input { min-width:0; width:100%; box-sizing:border-box; margin:0; }
input[type="range"] { accent-color:var(--editor-accent,#596da7); cursor:pointer; }
.adjustment-number { display:flex; align-items:center; gap:3px; }input[type="number"] { padding:6px 3px; border:1px solid var(--editor-border); border-radius:6px; background:var(--editor-soft); color:var(--editor-text); font:inherit; }
button { padding:6px 8px; font:inherit; border:1px solid var(--editor-border); border-radius:6px; background:var(--editor-soft); color:var(--editor-text); cursor:pointer; }button:disabled,input:disabled { opacity:.45; cursor:default; }
@media(max-width:450px) { .adjustment-row { gap:5px; grid-template-columns:42px minmax(30px,1fr) 62px; } }
</style>
