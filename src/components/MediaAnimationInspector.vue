<template>
  <section class="media-animation-inspector" aria-label="图片和视频入出场动画">
    <h4>入场与出场动画</h4>
    <div class="animation-grid">
      <label>入场效果<select aria-label="画面入场效果" :value="animation.enterAnimation" :disabled="disabled" @change="edit('enterAnimation',$event.target.value)"><option v-for="option in MEDIA_ENTER_ANIMATIONS" :key="option.value" :value="option.value">{{option.label}}</option></select></label>
      <label>入场时长（秒）<input aria-label="画面入场时长" type="number" min="0" max="10" step="0.1" :value="animation.enterDuration" :disabled="disabled || animation.enterAnimation==='none'" @focus="emit('begin-edit')" @blur="$event.target.value=animation.enterDuration;emit('end-edit')" @input="duration('enterDuration',$event.target.value)" /></label>
      <label>出场效果<select aria-label="画面出场效果" :value="animation.exitAnimation" :disabled="disabled" @change="edit('exitAnimation',$event.target.value)"><option v-for="option in MEDIA_EXIT_ANIMATIONS" :key="option.value" :value="option.value">{{option.label}}</option></select></label>
      <label>出场时长（秒）<input aria-label="画面出场时长" type="number" min="0" max="10" step="0.1" :value="animation.exitDuration" :disabled="disabled || animation.exitAnimation==='none'" @focus="emit('begin-edit')" @blur="$event.target.value=animation.exitDuration;emit('end-edit')" @input="duration('exitDuration',$event.target.value)" /></label>
    </div>
    <button :disabled="disabled" @click="reset">清除入出场动画</button>
    <p>动画与已有位置、缩放和不透明度关键帧叠加，不改写关键帧或视频原声。短片段自动压缩入出场时长；切割后的两段延续原动画进度。选择框保留基础编辑位置。</p>
  </section>
</template>
<script setup>
import {computed} from 'vue'
import {MEDIA_ENTER_ANIMATIONS,MEDIA_EXIT_ANIMATIONS,normalizeMediaAnimation} from '../mediaAnimation.js'
const props=defineProps({clip:{type:Object,required:true},disabled:Boolean})
const emit=defineEmits(['edit','begin-edit','end-edit'])
const animation=computed(()=>normalizeMediaAnimation(props.clip.animation))
function duration(key,value){if(value==='' || !Number.isFinite(Number(value)))return;emit('edit',{animation:normalizeMediaAnimation({...animation.value,[key]:Number(value)})})}
function edit(key,value){emit('end-edit');emit('begin-edit');emit('edit',{animation:normalizeMediaAnimation({...animation.value,[key]:value})});emit('end-edit')}
function reset(){emit('end-edit');emit('begin-edit');emit('edit',{animation:normalizeMediaAnimation()});emit('end-edit')}
</script>
<style scoped>
.media-animation-inspector { margin-top:14px; padding-top:12px; border-top:1px solid var(--editor-border); min-width:0; }h4 { margin:0 0 12px; }
.animation-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 8px; margin-bottom:12px; }.animation-grid label { display:flex; flex-direction:column; gap:5px; min-width:0; font-size:11px; }
input,select { min-width:0; width:100%; box-sizing:border-box; padding:7px; font:inherit; border:1px solid var(--editor-border); border-radius:6px; color:var(--editor-text); background:var(--editor-soft); }
button { padding:6px 8px; font:inherit; border:1px solid var(--editor-border); border-radius:6px; background:var(--editor-soft); color:var(--editor-text); cursor:pointer; }input:disabled,select:disabled,button:disabled { opacity:.45; cursor:default; }
p { color:var(--editor-muted); font-size:11px; line-height:1.6; }
</style>
