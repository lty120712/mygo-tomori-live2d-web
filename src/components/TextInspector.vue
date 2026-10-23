<template>
  <section class="text-inspector" aria-label="文字样式" @focusin="emit('begin-edit')" @focusout="emit('end-edit')">
    <h4>文字内容与样式</h4>
    <label>文字框类型<select aria-label="文字框类型" :value="style.layout" @change="discrete('layout',$event.target.value)"><option value="plain">普通文字</option><option value="dialogue">说话人对白框</option></select></label>
    <label v-if="style.layout==='dialogue'">说话人名称<input aria-label="说话人名称" maxlength="80" :value="clip.speaker" placeholder="例如：旁白、高松灯；留空隐藏名称栏" @input="emit('edit',{speaker:$event.target.value})" /></label>
    <label>文字内容<textarea aria-label="文字内容" maxlength="2000" rows="3" :value="clip.text" @input="emit('edit',{text:$event.target.value})" /></label>
    <template v-if="style.layout==='dialogue'">
      <div class="text-style-grid">
        <label v-for="field in boxFields" :key="field.key">{{field.label}}<input :aria-label="field.label" type="number" :min="field.min" :max="field.max" step="1" :value="style[field.key]" @input="setStyle(field.key,Number($event.target.value))" @blur="$event.target.value=style[field.key]" /></label>
        <label v-for="field in boxColors" :key="field.key">{{field.label}}<input :aria-label="field.label" type="color" :value="style[field.key]" @input="setStyle(field.key,$event.target.value)" /></label>
      </div>
      <label>底框不透明度 %<div class="box-opacity"><input aria-label="底框不透明度滑条" type="range" min="0" max="100" :value="Math.round(style.boxOpacity*100)" @pointerdown="$event.target.setPointerCapture($event.pointerId);emit('begin-edit')" @pointerup="emit('end-edit')" @pointercancel="emit('end-edit')" @lostpointercapture="emit('end-edit')" @input="setStyle('boxOpacity',Number($event.target.value)/100)" /><input aria-label="底框不透明度" type="number" min="0" max="100" :value="Math.round(style.boxOpacity*100)" @input="setStyle('boxOpacity',Number($event.target.value)/100)" @blur="$event.target.value=Math.round(style.boxOpacity*100)" /></div></label>
      <label class="divider-toggle"><input aria-label="说话人分隔线" type="checkbox" :checked="style.divider" @change="discrete('divider',$event.target.checked)" />说话人分隔线</label>
    </template>
    <div class="text-style-grid">
      <label>字体<select aria-label="文字字体" :value="style.fontFamily" @change="discrete('fontFamily',$event.target.value)"><option v-for="font in TEXT_FONTS" :key="font.value" :value="font.value">{{font.label}}</option></select></label>
      <label v-for="field in fields" :key="field.key">{{field.label}}<input :aria-label="field.label" type="number" :min="field.min" :max="field.max" step="1" :value="style[field.key]" @input="setStyle(field.key,Number($event.target.value))" @blur="$event.target.value=style[field.key]" /></label>
      <label>文字对齐<select aria-label="文字对齐" :value="style.align" @change="discrete('align',$event.target.value)"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
      <label v-for="field in colors" :key="field.key">{{field.label}}<input :aria-label="field.label" type="color" :value="style[field.key]" @input="setStyle(field.key,$event.target.value)" /></label>
    </div>
    <div class="text-flags"><label v-for="field in flags" :key="field.key"><input :aria-label="field.label" type="checkbox" :checked="style[field.key]" @change="discrete(field.key,$event.target.checked)" />{{field.label}}</label></div>
    <p>支持换行，超出文字框宽度时自动折行。字体使用本机已安装字体。</p>
  </section>
</template>
<script setup>
import { computed } from 'vue'
import { TEXT_FONTS, normalizeTextStyle } from '../textTracks.js'
const props=defineProps({clip:{type:Object,required:true}})
const emit=defineEmits(['edit','begin-edit','end-edit'])
const style=computed(()=>normalizeTextStyle(props.clip.textStyle))
const fields=[{key:'fontSize',label:'字号',min:8,max:200},{key:'width',label:'文字框宽度',min:80,max:1920},{key:'strokeWidth',label:'描边宽度',min:0,max:20},{key:'shadowBlur',label:'阴影模糊',min:0,max:30},{key:'shadowX',label:'阴影水平偏移',min:-50,max:50},{key:'shadowY',label:'阴影垂直偏移',min:-50,max:50}]
const colors=[{key:'color',label:'文字颜色'},{key:'strokeColor',label:'描边颜色'},{key:'shadowColor',label:'阴影颜色'}]
const flags=[{key:'bold',label:'粗体'},{key:'italic',label:'斜体'},{key:'shadow',label:'文字阴影'}]
const boxFields=[{key:'speakerSize',label:'说话人字号',min:8,max:100},{key:'boxMinHeight',label:'底框最小高度',min:40,max:540},{key:'boxPadding',label:'底框内边距',min:0,max:120},{key:'boxRadius',label:'底框圆角',min:0,max:80},{key:'boxBorderWidth',label:'底框边线宽度',min:0,max:10}]
const boxColors=[{key:'speakerColor',label:'说话人颜色'},{key:'boxColor',label:'底框颜色'},{key:'boxBorderColor',label:'底框边线颜色'}]
function setStyle(key,value){emit('edit',{textStyle:{[key]:value}})}
function discrete(key,value){emit('begin-edit');setStyle(key,value);emit('end-edit')}
</script>
<style scoped>
.text-inspector textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:65px; font:inherit; padding:7px; border:1px solid var(--editor-border); border-radius:6px; color:var(--editor-text); background:var(--editor-soft); }
.text-style-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
.text-style-grid input[type=color] { height:32px; padding:3px; }
.text-flags { display:flex; flex-wrap:wrap; gap:10px; }
.text-flags label { display:flex; align-items:center; gap:4px; }
.text-inspector p { font-size:11px; line-height:1.5; color:var(--editor-muted); }
.box-opacity { display:flex; align-items:center; gap:8px; }.box-opacity input[type=range] { flex:1; min-width:0; }.box-opacity input[type=number] { width:65px; }.divider-toggle { display:flex; align-items:center; gap:5px; }.divider-toggle input { width:auto; }
</style>
