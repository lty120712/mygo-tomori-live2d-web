<template>
  <section class="subtitle-list" aria-label="字幕列表">
    <header><div><h3>字幕列表</h3><small>按开始时间排序 · {{rows.length}} / {{textClips.length}} 条</small></div><button aria-label="关闭字幕列表" @click="emit('close')">关闭</button></header>
    <div class="subtitle-filters"><label>搜索字幕<input aria-label="搜索字幕" v-model="query" type="search" placeholder="正文、说话人或图层名称" /></label><label>轨道<select aria-label="筛选字幕轨道" v-model="track"><option value="">全部文字轨道</option><option v-for="lane in tracks" :key="lane.track" :value="lane.track">{{lane.name}}</option></select></label></div>
    <div class="subtitle-actions">
      <label class="select-results"><input type="checkbox" aria-label="全选当前字幕结果" :checked="allChecked" :indeterminate="someChecked && !allChecked" :disabled="disabled || !rows.length" @change="chooseResults($event.target.checked)" />全选结果</label>
      <span role="status">已选 {{selection.length}} 条<span v-if="hiddenCount">（{{hiddenCount}} 条不在当前结果中）</span></span>
      <button :disabled="disabled || !selection.length" @click="emit('selection',[],null)">清空选择</button>
      <label class="preset-action">套用样式<select aria-label="字幕列表套用样式" :value="''" :disabled="disabled || !selection.length || selection.some(c=>c.layerLocked)" @change="applyPreset"><option value="" disabled>为所选字幕选择样式</option><option v-for="preset in [...TEXT_PRESETS,...customPresets]" :key="preset.id" :value="preset.id">{{preset.name}}</option></select></label>
    </div>
    <p v-if="selection.some(c=>c.layerLocked)" class="subtitle-hint">所选字幕含锁定图层，请先解锁后套用样式。</p>
    <p class="subtitle-hint">点击时间定位片段；勾选可跨轨道多选。直接编辑正文和说话人，各条内容独立保存。</p>
    <ol class="subtitle-rows">
      <li v-for="(clip,index) in rows" :key="clip.id" :class="{chosen:selectedIds.includes(clip.id),current:time>=clip.start && time<clip.start+clip.duration}" @click.self="emit('activate',clip.id)">
        <div class="subtitle-row-heading"><input type="checkbox" :aria-label="'选择字幕 '+(index+1)" :checked="selectedIds.includes(clip.id)" :disabled="disabled" @change="choose(clip,$event.target.checked)" /><button :disabled="disabled" :aria-label="'定位字幕 '+(index+1)" @click="emit('activate',clip.id)">{{formatTimecode(clip.start,fps)}} → {{formatTimecode(clip.start+clip.duration,fps)}}</button><span class="row-track">{{clip.layerName || '文字轨道 '+(clip.track+1)}}</span><small v-if="clip.layerLocked">已锁定</small><small v-if="clip.layerHidden">已隐藏</small></div>
        <div class="subtitle-row-content"><label>说话人<input :aria-label="'字幕说话人 '+(index+1)" :value="clip.speaker" maxlength="80" :disabled="disabled || clip.layerLocked" placeholder="可留空" @focus="begin(clip.id)" @blur="end" @input="emit('edit',clip.id,{speaker:$event.target.value})" /></label><label>正文<textarea :aria-label="'字幕正文 '+(index+1)" :value="clip.text" maxlength="2000" rows="2" :disabled="disabled || clip.layerLocked" @focus="begin(clip.id)" @blur="end" @input="emit('edit',clip.id,{text:$event.target.value})" /></label></div>
      </li>
    </ol>
    <p v-if="!rows.length" class="subtitle-empty">{{textClips.length ? '没有匹配的字幕，请调整搜索或轨道筛选。' : '还没有文字片段，可从素材库添加文字或导入 SRT。'}}</p>
  </section>
</template>
<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue'
import {isTextClip} from '../textTracks.js'
import {TEXT_PRESETS} from '../textPresets.js'
import {subtitleRows,selectSubtitleResults} from '../subtitleList.js'
import {formatTimecode} from '../timecode.js'
const props=defineProps({clips:{type:Array,default:()=>[]},selectedIds:{type:Array,default:()=>[]},customPresets:{type:Array,default:()=>[]},fps:{type:Number,default:30},time:{type:Number,default:0},disabled:Boolean})
const emit=defineEmits(['close','activate','selection','edit','begin-edit','end-edit','apply-style'])
const query=ref(''),track=ref(''),editingId=ref('')
const textClips=computed(()=>props.clips.filter(isTextClip))
const tracks=computed(()=>[...new Map(textClips.value.map(c=>[c.track,{track:c.track,name:c.layerName || '文字轨道 '+(c.track+1)}])).values()].sort((a,b)=>a.track-b.track))
watch(tracks,values=>{if(track.value!=='' && !values.some(v=>v.track===Number(track.value)))track.value=''})
const rows=computed(()=>subtitleRows(props.clips,{query:query.value,track:track.value,editingId:editingId.value}))
const selection=computed(()=>textClips.value.filter(c=>props.selectedIds.includes(c.id)))
const hiddenCount=computed(()=>selection.value.filter(c=>!rows.value.some(row=>row.id===c.id)).length)
const allChecked=computed(()=>!!rows.value.length && rows.value.every(c=>props.selectedIds.includes(c.id)))
const someChecked=computed(()=>rows.value.some(c=>props.selectedIds.includes(c.id)))
function chooseResults(checked){if(!props.disabled)emit('selection',selectSubtitleResults(props.selectedIds,rows.value,checked),checked ? rows.value[0]?.id : null)}
function choose(clip,checked){if(!props.disabled)emit('selection',selectSubtitleResults(props.selectedIds,[clip],checked),checked ? clip.id : null)}
function begin(id){editingId.value=id;emit('begin-edit')}
function end(){emit('end-edit');editingId.value=''}
function applyPreset(event){if(!props.disabled)emit('apply-style',selection.value.map(c=>c.id),event.target.value);event.target.value=''}
onBeforeUnmount(()=>emit('end-edit'))
</script>
<style scoped>
.subtitle-list { flex-shrink:0; min-width:0; margin:8px; border:1px solid var(--editor-border); border-radius:10px; background:var(--editor-panel); padding:12px; color:var(--editor-text); font-size:12px; }
header,.subtitle-actions,.subtitle-row-heading { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }header { justify-content:space-between; }h3 { margin:0 0 4px; font-size:14px; }small,.subtitle-hint,.row-track { color:var(--editor-muted); font-size:11px; }.subtitle-filters { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:10px; margin:10px 0; }
label { display:flex; flex-direction:column; gap:5px; min-width:0; }input:not([type=checkbox]),select,textarea { width:100%; min-width:0; box-sizing:border-box; border:1px solid var(--editor-border); border-radius:6px; background:var(--editor-soft); color:inherit; font:inherit; padding:7px 9px; }textarea { resize:vertical; line-height:1.5; }button { cursor:pointer; font:inherit; border:1px solid var(--editor-border); background:var(--editor-soft); color:inherit; border-radius:6px; padding:6px 8px; }button:disabled,input:disabled,select:disabled,textarea:disabled { opacity:.5; cursor:default; }input[type=checkbox] { accent-color:var(--editor-accent); }.select-results { flex-direction:row; align-items:center; }.preset-action { flex:1; min-width:160px; }.subtitle-actions>span { font-size:11px; }.subtitle-hint { margin:8px 0; line-height:1.5; }
.subtitle-rows { list-style:none; padding:0; margin:8px 0 0; max-height:300px; overflow:auto; overscroll-behavior:contain; }.subtitle-rows li { border:1px solid var(--editor-border); border-left:3px solid transparent; border-radius:7px; padding:9px; margin:0 0 7px; }.subtitle-rows li.chosen { border-left-color:var(--editor-accent); background:var(--editor-accent-soft); }.subtitle-rows li.current .subtitle-row-heading>button { color:var(--editor-accent); border-color:var(--editor-focus); }.subtitle-row-heading { margin-bottom:8px; }.row-track { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px; }.subtitle-row-content { display:grid; grid-template-columns:minmax(80px,1fr) minmax(0,4fr); gap:10px; }.subtitle-empty { padding:14px; text-align:center; color:var(--editor-muted); }input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible { outline:2px solid var(--editor-focus); outline-offset:1px; }
@media(max-width:650px){.subtitle-filters,.subtitle-row-content{grid-template-columns:minmax(0,1fr)}.subtitle-list{margin:4px;padding:8px}}
</style>
