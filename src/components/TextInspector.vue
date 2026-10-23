<template>
  <section class="text-inspector" aria-label="文字样式" @focusin="emit('begin-edit')" @focusout="emit('end-edit')">
    <h4>文字内容与样式</h4>
    <div class="text-content-fields">
      <label>文字框类型<select aria-label="文字框类型" :value="style.layout" @change="discrete('layout',$event.target.value)"><option value="plain">普通文字</option><option value="dialogue">说话人对白框</option></select></label>
      <label v-if="style.layout==='dialogue'">说话人名称<input aria-label="说话人名称" maxlength="80" :value="clip.speaker" placeholder="例如：旁白、高松灯" @input="emit('edit',{speaker:$event.target.value})" /><small>留空时隐藏名称栏。</small></label>
      <label><span class="field-heading"><span>文字内容</span><small>{{clip.text?.length || 0}} / 2000</small></span><textarea aria-label="文字内容" maxlength="2000" rows="4" :value="clip.text" @input="emit('edit',{text:$event.target.value})" /><small>支持换行，超出框宽时自动折行。</small></label>
    </div>

    <section class="text-group" aria-label="常用文字样式">
      <h5>文字样式</h5>
      <div class="text-style-grid">
        <label class="full-width">字体<select aria-label="文字字体" :value="style.fontFamily" @change="discrete('fontFamily',$event.target.value)"><option v-for="font in TEXT_FONTS" :key="font.value" :value="font.value">{{font.label}}</option></select></label>
        <label v-for="field in commonFields" :key="field.key">{{field.label}}<input :aria-label="field.label" type="number" :min="field.min" :max="field.max" step="1" :value="style[field.key]" @input="setStyle(field.key,Number($event.target.value))" @blur="$event.target.value=style[field.key]" /></label>
        <label>文字对齐<select aria-label="文字对齐" :value="style.align" @change="discrete('align',$event.target.value)"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
        <label>文字颜色<input aria-label="文字颜色" type="color" :value="style.color" @input="setStyle('color',$event.target.value)" /></label>
      </div>
      <div class="text-flags"><label v-for="field in flags" :key="field.key"><input :aria-label="field.label" type="checkbox" :checked="style[field.key]" @change="discrete(field.key,$event.target.checked)" />{{field.label}}</label></div>
    </section>

    <details v-if="style.layout==='dialogue'" class="text-group">
      <summary>说话人样式</summary>
      <div class="text-style-grid">
        <label>说话人字号<input aria-label="说话人字号" type="number" min="8" max="100" :value="style.speakerSize" @input="setStyle('speakerSize',Number($event.target.value))" @blur="$event.target.value=style.speakerSize" /></label>
        <label>说话人颜色<input aria-label="说话人颜色" type="color" :value="style.speakerColor" @input="setStyle('speakerColor',$event.target.value)" /></label>
      </div>
      <label class="check-field"><input aria-label="说话人分隔线" type="checkbox" :checked="style.divider" @change="discrete('divider',$event.target.checked)" />显示分隔线</label>
    </details>

    <details v-if="style.layout==='dialogue'" class="text-group">
      <summary>底框样式</summary>
      <div class="text-style-grid">
        <label>底框颜色<input aria-label="底框颜色" type="color" :value="style.boxColor" @input="setStyle('boxColor',$event.target.value)" /></label>
        <label>底框边线颜色<input aria-label="底框边线颜色" type="color" :value="style.boxBorderColor" @input="setStyle('boxBorderColor',$event.target.value)" /></label>
      </div>
      <label class="opacity-field">底框不透明度 %<div class="box-opacity"><input aria-label="底框不透明度滑条" type="range" min="0" max="100" :value="Math.round(style.boxOpacity*100)" @pointerdown="$event.target.setPointerCapture($event.pointerId);emit('begin-edit')" @pointerup="emit('end-edit')" @pointercancel="emit('end-edit')" @lostpointercapture="emit('end-edit')" @input="setStyle('boxOpacity',Number($event.target.value)/100)" /><input aria-label="底框不透明度" type="number" min="0" max="100" :value="Math.round(style.boxOpacity*100)" @input="setStyle('boxOpacity',Number($event.target.value)/100)" @blur="$event.target.value=Math.round(style.boxOpacity*100)" /></div></label>
      <div class="text-style-grid"><label v-for="field in boxFields" :key="field.key">{{field.label}}<input :aria-label="field.label" type="number" :min="field.min" :max="field.max" step="1" :value="style[field.key]" @input="setStyle(field.key,Number($event.target.value))" @blur="$event.target.value=style[field.key]" /></label></div>
    </details>

    <details class="text-group">
      <summary>描边与阴影</summary>
      <div class="text-style-grid">
        <label>描边宽度<input aria-label="描边宽度" type="number" min="0" max="20" :value="style.strokeWidth" @input="setStyle('strokeWidth',Number($event.target.value))" @blur="$event.target.value=style.strokeWidth" /></label>
        <label>描边颜色<input aria-label="描边颜色" type="color" :value="style.strokeColor" @input="setStyle('strokeColor',$event.target.value)" /></label>
      </div>
      <label class="check-field"><input aria-label="文字阴影" type="checkbox" :checked="style.shadow" @change="discrete('shadow',$event.target.checked)" />启用文字阴影</label>
      <div v-if="style.shadow" class="text-style-grid">
        <label>阴影颜色<input aria-label="阴影颜色" type="color" :value="style.shadowColor" @input="setStyle('shadowColor',$event.target.value)" /></label>
        <label v-for="field in shadowFields" :key="field.key">{{field.label}}<input :aria-label="field.label" type="number" :min="field.min" :max="field.max" step="1" :value="style[field.key]" @input="setStyle(field.key,Number($event.target.value))" @blur="$event.target.value=style[field.key]" /></label>
      </div>
    </details>
    <p class="font-note">字体使用本机已安装字体。</p>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { TEXT_FONTS, normalizeTextStyle } from '../textTracks.js'
const props=defineProps({clip:{type:Object,required:true}})
const emit=defineEmits(['edit','begin-edit','end-edit'])
const style=computed(()=>normalizeTextStyle(props.clip.textStyle))
const commonFields=[{key:'fontSize',label:'字号',min:8,max:200},{key:'width',label:'文字框宽度',min:80,max:1920}]
const shadowFields=[{key:'shadowBlur',label:'阴影模糊',min:0,max:30},{key:'shadowX',label:'阴影水平偏移',min:-50,max:50},{key:'shadowY',label:'阴影垂直偏移',min:-50,max:50}]
const flags=[{key:'bold',label:'粗体'},{key:'italic',label:'斜体'}]
const boxFields=[{key:'boxMinHeight',label:'底框最小高度',min:40,max:540},{key:'boxPadding',label:'底框内边距',min:0,max:120},{key:'boxRadius',label:'底框圆角',min:0,max:80},{key:'boxBorderWidth',label:'底框边线宽度',min:0,max:10}]
function setStyle(key,value){emit('edit',{textStyle:{[key]:value}})}
function discrete(key,value){emit('begin-edit');setStyle(key,value);emit('end-edit')}
</script>
<style scoped>
.text-inspector { min-width:0; container-type:inline-size; }
.text-inspector h4 { margin:16px 0 12px; }
.text-inspector label { display:flex; flex-direction:column; align-items:stretch; gap:6px; min-width:0; margin:0; color:var(--editor-muted); font-size:11px; line-height:1.5; }
.text-content-fields { display:grid; grid-template-columns:minmax(0,1fr); gap:12px; }
.text-inspector input:not([type=checkbox]):not([type=range]),.text-inspector select,.text-inspector textarea { display:block; width:100%; min-width:0; max-width:100%; box-sizing:border-box; margin:0; font:inherit; padding:8px 10px; border:1px solid var(--editor-border); border-radius:7px; color:var(--editor-text); background:var(--editor-soft); }
.text-inspector textarea { resize:vertical; min-height:96px; line-height:1.6; }
.text-inspector input:focus-visible,.text-inspector select:focus-visible,.text-inspector textarea:focus-visible,.text-inspector summary:focus-visible { outline:2px solid var(--editor-focus); outline-offset:1px; }
.field-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; }.text-inspector small { font-size:10px; color:var(--editor-muted); font-weight:normal; }
.text-group { margin-top:14px; padding-top:12px; border-top:1px solid var(--editor-border); }
.text-group h5,.text-group summary { margin:0 0 10px; font-size:12px; font-weight:600; color:var(--editor-text); }
.text-group summary { cursor:pointer; margin:0; padding:2px 0; }.text-group[open] summary { margin-bottom:12px; }
.text-style-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }.full-width { grid-column:1 / -1; }
.text-inspector input[type=color] { height:34px; padding:4px; }
.text-flags { display:flex; flex-wrap:wrap; gap:8px 16px; margin-top:12px; }
.text-flags label,.text-inspector .check-field { display:flex; flex-direction:row; align-items:center; gap:6px; }.text-inspector .check-field { margin-top:12px; }
.text-inspector input[type=checkbox] { width:14px; height:14px; flex-shrink:0; margin:0; accent-color:var(--editor-accent); }
.text-inspector .opacity-field { margin:12px 0; }.box-opacity { display:flex; align-items:center; gap:8px; }.box-opacity input[type=range] { flex:1; width:0; min-width:0; margin:0; accent-color:var(--editor-accent); }.box-opacity input[type=number] { flex:0 0 66px; width:66px; }
.font-note { margin:12px 0 0; font-size:10px; line-height:1.5; color:var(--editor-muted); }
@container(max-width:220px) { .text-style-grid { grid-template-columns:minmax(0,1fr); } }
</style>
