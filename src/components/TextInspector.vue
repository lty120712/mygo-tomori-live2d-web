<template>
  <section class="text-inspector" aria-label="文字样式" @focusin="emit('begin-edit')" @focusout="emit('end-edit')">
    <h4>文字内容与样式</h4>
    <div class="text-selection-actions"><button :disabled="disabled" @click="emit('select-track')">选中当前轨道全部文字</button><span v-if="batch">已选 {{targets.length}} 条文字</span></div>
    <p v-if="batch" class="font-note">仅修改所选文字的样式，内容、说话人和时间各自保留。控件显示参考片段的值，修改某项仅统一该项。</p>
    <p v-if="mixed.length" class="mixed-note" role="status">多种值：{{mixed.map(key=>fieldLabels[key] || key).join('、')}}</p>
    <p v-if="hasLocked" class="mixed-note">所选文字含锁定图层，请先解锁后批量修改。</p>
    <fieldset :disabled="disabled || hasLocked" class="text-style-fields">
    <div class="text-content-fields">
      <label>文字框类型<select aria-label="文字框类型" :value="style.layout" @change="discrete('layout',$event.target.value)"><option value="plain">普通文字</option><option value="dialogue">说话人对白框</option></select></label>
      <label v-if="!batch && style.layout==='dialogue'">说话人名称<input aria-label="说话人名称" maxlength="80" :value="clip.speaker" placeholder="例如：旁白、高松灯" @input="emit('edit',{speaker:$event.target.value})" /><small>留空时隐藏名称栏。</small></label>
      <label v-if="!batch"><span class="field-heading"><span>文字内容</span><small>{{clip.text?.length || 0}} / 2000</small></span><textarea aria-label="文字内容" maxlength="2000" rows="4" :value="clip.text" @input="emit('edit',{text:$event.target.value})" /><small>支持换行，超出框宽时自动折行。</small></label>
    </div>

    <details class="text-group" aria-label="常用文字样式">
      <summary>字体与文字样式</summary>
      <div class="text-style-grid">
        <label class="full-width">字体<select aria-label="文字字体" :value="style.fontFamily" @change="discrete('fontFamily',$event.target.value)"><optgroup v-for="group in fontGroups" :key="group.label" :label="group.label"><option v-for="font in group.fonts" :key="font.value" :value="font.value">{{font.label}}</option></optgroup></select><small role="status">{{fontStatus}}</small></label>
        <label v-for="field in commonFields" :key="field.key">{{field.label}}<input :aria-label="field.label" type="number" :min="field.min" :max="field.max" step="1" :value="style[field.key]" @input="setStyle(field.key,Number($event.target.value))" @blur="$event.target.value=style[field.key]" /></label>
        <label>文字对齐<select aria-label="文字对齐" :value="style.align" @change="discrete('align',$event.target.value)"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
        <label>文字颜色<input aria-label="文字颜色" type="color" :value="style.color" @input="setStyle('color',$event.target.value)" /></label>
      </div>
      <div class="text-flags"><label v-for="field in flags" :key="field.key"><input :aria-label="field.label" type="checkbox" :checked="style[field.key]" @change="discrete(field.key,$event.target.checked)" />{{field.label}}</label></div>
    </details>

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
      <label class="opacity-field">底框不透明度 %<div class="box-opacity"><input aria-label="底框不透明度滑条" type="range" min="0" max="100" :value="Math.round(style.boxOpacity*100)" @pointerdown="$event.target.focus({preventScroll:true});$event.target.setPointerCapture($event.pointerId);emit('begin-edit')" @pointerup="emit('end-edit')" @pointercancel="emit('end-edit')" @lostpointercapture="emit('end-edit')" @input="setStyle('boxOpacity',Number($event.target.value)/100)" /><input aria-label="底框不透明度" type="number" min="0" max="100" :value="Math.round(style.boxOpacity*100)" @input="setStyle('boxOpacity',Number($event.target.value)/100)" @blur="$event.target.value=Math.round(style.boxOpacity*100)" /></div></label>
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
    <details class="text-group" aria-label="文字入场与出场动画">
      <summary>入场与出场动画</summary>
      <div class="text-style-grid">
        <label>入场动画<select aria-label="文字入场动画" :value="style.enterAnimation" @change="discrete('enterAnimation',$event.target.value)"><option v-for="item in TEXT_ENTER_ANIMATIONS" :key="item.value" :value="item.value">{{item.label}}</option></select></label>
        <label>入场时长（秒）<input aria-label="文字入场时长" type="number" min="0" max="10" step="0.1" :value="style.enterDuration" @input="setStyle('enterDuration',Number($event.target.value))" @blur="$event.target.value=style.enterDuration" /></label>
        <label>出场动画<select aria-label="文字出场动画" :value="style.exitAnimation" @change="discrete('exitAnimation',$event.target.value)"><option v-for="item in TEXT_EXIT_ANIMATIONS" :key="item.value" :value="item.value">{{item.label}}</option></select></label>
        <label>出场时长（秒）<input aria-label="文字出场时长" type="number" min="0" max="10" step="0.1" :value="style.exitDuration" @input="setStyle('exitDuration',Number($event.target.value))" @blur="$event.target.value=style.exitDuration" /></label>
      </div>
      <p class="font-note">{{batch ? '修改将应用到所有选中文字。' : ''}}播放或拖动时间条查看效果。短片段自动压缩入出场时长；打字机只逐字显示正文，说话人和底框保持完整。</p>
    </details>
    <details class="text-group" aria-label="文字样式预设">
      <summary>样式预设</summary>
      <label>套用样式<select aria-label="套用文字样式" :value="''" @change="applyPreset($event)"><option value="" disabled>选择预设，仅替换文字样式</option><option v-for="preset in [...TEXT_PRESETS,...customPresets]" :key="preset.id" :value="preset.id">{{preset.name}}</option></select></label>
      <label>预设名称<input aria-label="文字预设名称" v-model="presetName" maxlength="40" placeholder="例如：角色对白 / 主字幕" @keydown.enter.stop.prevent="savePreset" /></label>
      <button :disabled="presetBusy || !presetName.trim()" @click="savePreset">{{presetBusy ? '正在保存…' : batch ? '保存参考片段样式为预设' : '保存当前样式为预设'}}</button>
      <p class="font-note">预设只保存文字样式，不保存正文、说话人名称、时间或关键帧。保存在本浏览器，可跨工程复用。</p>
    </details>
    </fieldset>
    <p class="font-note">内置开源字体随应用提供，无需安装或联网。系统字体依赖本机；少见字可能使用系统字体补齐。</p>
  </section>
</template>
<script setup>
import { computed,ref,watch } from 'vue'
import { normalizeTextStyle } from '../textTracks.js'
import {BUNDLED_TEXT_FONTS,SYSTEM_TEXT_FONTS,ensureTextFont} from '../textFonts.js'
import {mixedTextFields} from '../textBatchStyle.js'
import {TEXT_PRESETS,textPreset} from '../textPresets.js'
import {TEXT_ENTER_ANIMATIONS,TEXT_EXIT_ANIMATIONS} from '../textAnimation.js'
const props=defineProps({clip:{type:Object,required:true},clips:Array,customPresets:{type:Array,default:()=>[]},presetBusy:Boolean,disabled:Boolean})
const emit=defineEmits(['edit','begin-edit','end-edit','select-track','save-preset'])
const targets=computed(()=>props.clips?.length ? props.clips : [props.clip])
const batch=computed(()=>targets.value.length>1),hasLocked=computed(()=>targets.value.some(c=>c.layerLocked))
const mixed=computed(()=>mixedTextFields(targets.value))
const fieldLabels={enterAnimation:'入场动画',exitAnimation:'出场动画',enterDuration:'入场时长',exitDuration:'出场时长',fontFamily:'字体',fontSize:'字号',color:'颜色',bold:'粗体',italic:'斜体',align:'对齐',width:'文字框宽度',strokeWidth:'描边宽度',strokeColor:'描边颜色',shadow:'阴影',shadowColor:'阴影颜色',shadowBlur:'阴影模糊',shadowX:'阴影 X',shadowY:'阴影 Y',layout:'文字框类型',speakerSize:'说话人字号',speakerColor:'说话人颜色',divider:'分隔线',boxColor:'底框颜色',boxOpacity:'底框不透明度',boxPadding:'内边距',boxMinHeight:'最小高度',boxRadius:'圆角',boxBorderWidth:'边线宽度',boxBorderColor:'边线颜色'}
const presetName=ref('')
watch(()=>props.customPresets.length,()=>{presetName.value=''})
function savePreset(){if(!props.disabled && !hasLocked.value && !props.presetBusy && presetName.value.trim())emit('save-preset',presetName.value.trim())}
function applyPreset(event){const preset=textPreset(event.target.value,props.customPresets);emit('begin-edit');emit('edit',{textStyle:normalizeTextStyle(preset.style)});emit('end-edit');event.target.value=''}
const style=computed(()=>normalizeTextStyle(props.clip.textStyle))
const fontGroups=[{label:'内置开源字体',fonts:BUNDLED_TEXT_FONTS},{label:'本机系统字体',fonts:SYSTEM_TEXT_FONTS}]
const fontStatus=ref('')
watch(()=>style.value.fontFamily,(family,_,cleanup)=>{
  let active=true;cleanup(()=>active=false)
  fontStatus.value=BUNDLED_TEXT_FONTS.some(f=>f.value===family) ? '正在加载字体…' : '使用本机字体'
  ensureTextFont(family).then(()=>{if(active)fontStatus.value=BUNDLED_TEXT_FONTS.some(f=>f.value===family) ? '内置字体已就绪' : '使用本机字体'},error=>{if(active)fontStatus.value=error.message})
},{immediate:true})
const commonFields=[{key:'fontSize',label:'字号',min:8,max:200},{key:'width',label:'文字框宽度',min:80,max:1920}]
const shadowFields=[{key:'shadowBlur',label:'阴影模糊',min:0,max:30},{key:'shadowX',label:'阴影水平偏移',min:-50,max:50},{key:'shadowY',label:'阴影垂直偏移',min:-50,max:50}]
const flags=[{key:'bold',label:'粗体'},{key:'italic',label:'斜体'}]
const boxFields=[{key:'boxMinHeight',label:'底框最小高度',min:40,max:540},{key:'boxPadding',label:'底框内边距',min:0,max:120},{key:'boxRadius',label:'底框圆角',min:0,max:80},{key:'boxBorderWidth',label:'底框边线宽度',min:0,max:10}]
function setStyle(key,value){emit('edit',{textStyle:{[key]:value}})}
function discrete(key,value){emit('begin-edit');setStyle(key,value);emit('end-edit')}
</script>
<style scoped>
.text-inspector { min-width:0; container-type:inline-size; }
.text-style-fields { min-width:0; border:0; padding:0; margin:0; }.text-selection-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:11px; }.mixed-note { color:var(--editor-accent); font-size:11px; line-height:1.6; overflow-wrap:anywhere; }
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
