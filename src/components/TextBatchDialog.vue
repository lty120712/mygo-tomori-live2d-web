<template>
  <Teleport to="body"><dialog ref="dialog" class="text-batch-dialog" aria-labelledby="text-batch-title" @cancel.prevent="emit('cancel')">
    <header><div><h3 id="text-batch-title">添加字幕与批量文字</h3><p>先预览内容与时间，确认后一次添加。</p></div><button aria-label="关闭字幕导入" @click="emit('cancel')">×</button></header>
    <div class="dialog-content">
      <div class="import-tabs" role="group" aria-label="文字添加方式"><button :aria-pressed="mode==='srt'" :disabled="reading" @click="mode='srt'">SRT 字幕</button><button :aria-pressed="mode==='lines'" :disabled="reading" @click="mode='lines'">多行文本</button></div>
      <fieldset :disabled="disabled || reading">
        <template v-if="mode==='srt'">
          <div class="file-row"><button @click="fileInput.click()">{{reading ? '正在读取…' : '选择 SRT 文件'}}</button><span>{{fileName || '也可以在下方粘贴 SRT 内容'}}</span><input ref="fileInput" type="file" accept=".srt" hidden @change="readFile" /></div>
          <label>SRT 内容<textarea aria-label="SRT 字幕内容" v-model="srt" rows="6" maxlength="2000000" placeholder="1&#10;00:00:01,000 --> 00:00:03,000&#10;第一句字幕&#10;&#10;2&#10;00:00:03,000 --> 00:00:05,000&#10;第二句字幕" /></label>
          <p class="hint">保留字幕原有起止时间，按 {{fps}} FPS 对齐；同一条字幕内的换行保留。重叠片段会放入不同文字轨道。</p>
        </template>
        <template v-else>
          <label>每行一条文字<textarea aria-label="批量文字内容" v-model="lines" rows="6" maxlength="2000000" placeholder="第一句字幕&#10;第二句字幕&#10;第三句字幕" /></label>
          <div class="settings-grid"><label>开始时间<TimecodeInput label="批量文字开始时间" :value="lineStart" :fps="fps" :max="600" @change="lineStart=$event" /></label><label>每条时长（秒）<input aria-label="每条文字时长" type="number" :min="1/fps" max="600" step="0.1" v-model.number="lineDuration" /></label></div>
          <p class="hint">默认接在选中文字轨道末尾；未选中文字轨时从播放头开始。空行会忽略，时长按 {{fps}} FPS 对齐，最短一帧。</p>
        </template>
        <label>文字样式<select aria-label="字幕文字样式" v-model="presetId"><option v-if="isTextClip(selected)" value="current">沿用所选文字（含说话人和位置）</option><option v-for="preset in TEXT_PRESETS" :key="preset.id" :value="preset.id">{{preset.name}}</option></select></label>
      </fieldset>
      <p v-if="fileError || (hasInput && plan.error)" class="import-error" role="alert">{{fileError || plan.error}}</p>
      <section v-if="!plan.error" class="import-preview" aria-label="字幕导入预览">
        <p class="preview-summary">共 {{plan.entries.length}} 条 · 新增 {{plan.newTracks}} 条轨道 · 工程时长 {{formatTimecode(plan.projectDuration,fps)}}</p>
        <ol><li v-for="(cue,index) in plan.entries.slice(0,5)" :key="index"><span>{{formatTimecode(cue.start,fps)}} → {{formatTimecode(cue.start+cue.duration,fps)}}</span><p>{{cue.text}}</p></li></ol>
        <p v-if="plan.entries.length>5" class="hint">仅预览前 5 条，确认后添加全部 {{plan.entries.length}} 条。</p>
        <p class="hint">同轨不会覆盖已有片段。本次添加与工程延长可一起撤销。</p>
      </section>
    </div>
    <footer><button @click="emit('cancel')">取消</button><button class="confirm-import" :disabled="disabled || reading || !!fileError || !!plan.error" @click="apply">添加 {{plan.entries?.length || 0}} 条文字</button></footer>
  </dialog></Teleport>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import TimecodeInput from './TimecodeInput.vue'
import {TEXT_PRESETS} from '../textPresets.js'
import {isTextClip} from '../textTracks.js'
import {parseSrt,decodeSubtitleFile,linesToCues,planTextBatch,batchTextStart} from '../subtitleImport.js'
import {formatTimecode} from '../timecode.js'
const props=defineProps({clips:Array,selected:Object,time:Number,duration:Number,fps:Number,disabled:Boolean,initialMode:{type:String,default:'srt'}})
const emit=defineEmits(['cancel','apply'])
const dialog=ref(null),fileInput=ref(null),mode=ref(props.initialMode==='lines' ? 'lines' : 'srt'),srt=ref(''),lines=ref(''),lineStart=ref(batchTextStart(props.clips,props.time,props.selected?.track)),lineDuration=ref(3)
const presetId=ref(isTextClip(props.selected) ? 'current' : 'subtitle'),reading=ref(false),fileError=ref(''),fileName=ref('')
let request=0
watch([srt,mode],()=>{fileError.value=''})
const parsed=computed(()=>mode.value==='srt' ? parseSrt(srt.value) : linesToCues(lines.value,{start:lineStart.value,duration:lineDuration.value,fps:props.fps}))
const plan=computed(()=>parsed.value.error ? parsed.value : planTextBatch(props.clips,parsed.value.cues,{duration:props.duration,fps:props.fps,selectedTrack:props.selected?.track}))
const hasInput=computed(()=>!!(mode.value==='srt' ? srt.value.trim() : lines.value.trim()))
async function readFile(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  const token=++request;fileError.value='';reading.value=false
  if(file.size>4*1024*1024){fileError.value='SRT 文件不能超过 4 MB，请分批导入';return}
  if(!/\.srt$/i.test(file.name)){fileError.value='请选择 .srt 字幕文件';return}
  reading.value=true
  try{
    const result=decodeSubtitleFile(await file.arrayBuffer());if(token!==request)return
    if(result.error){fileError.value=result.error;return}
    srt.value=result.text;fileName.value=file.name
  }catch{if(token===request)fileError.value='文件读取失败，请重新选择'}
  finally{if(token===request)reading.value=false}
}
function apply(){if(props.disabled || reading.value || fileError.value || plan.value.error)return;emit('apply',{cues:parsed.value.cues,presetId:presetId.value})}
onMounted(()=>dialog.value.showModal())
onBeforeUnmount(()=>{request++;dialog.value?.close()})
</script>
<style scoped>
.text-batch-dialog { width:min(620px,calc(100vw - 32px)); max-height:calc(100dvh - 48px); padding:0; border:1px solid var(--editor-border,#ddd); border-radius:16px; background:var(--editor-panel,#fff); color:var(--editor-text,#342e35); box-shadow:0 20px 80px #0004; font:13px system-ui,sans-serif; }
.text-batch-dialog[open] { display:flex; flex-direction:column; }.text-batch-dialog::backdrop { background:#17121b80; }
header,footer { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; }header { border-bottom:1px solid var(--editor-border,#ddd); }footer { border-top:1px solid var(--editor-border,#ddd); justify-content:flex-end; }h3 { font-size:16px; margin:0 0 4px; }header p { margin:0; font-size:11px; color:var(--editor-muted,#817580); }header>button { font-size:20px; }
.dialog-content { padding:16px 20px; overflow:auto; min-height:0; }.import-tabs { display:flex; gap:8px; margin-bottom:14px; }button { cursor:pointer; font:inherit; padding:7px 12px; border:1px solid var(--editor-border,#ddd); border-radius:8px; background:var(--editor-soft,#f6f3f5); color:inherit; }button:disabled { cursor:default; opacity:.45; }.import-tabs button[aria-pressed=true],.confirm-import { background:var(--editor-accent,#743a52); color:var(--editor-on-accent,#fff); border-color:transparent; }
fieldset { border:0; margin:0; padding:0; min-width:0; }label { display:flex; flex-direction:column; gap:6px; margin:10px 0; min-width:0; font-size:12px; }textarea,input:not([type=file]),select { box-sizing:border-box; width:100%; min-width:0; border:1px solid var(--editor-border,#ddd); border-radius:7px; padding:8px 10px; font:inherit; background:var(--editor-soft,#f6f3f5); color:inherit; }textarea { min-height:130px; resize:vertical; line-height:1.6; }input:focus-visible,textarea:focus-visible,select:focus-visible,button:focus-visible { outline:2px solid var(--editor-focus,#ac7991); outline-offset:1px; }.file-row { display:flex; align-items:center; gap:10px; font-size:11px; }.file-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.file-row button { flex-shrink:0; }.settings-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }.hint { font-size:11px; line-height:1.6; color:var(--editor-muted,#817580); }.import-error { padding:10px; border-radius:8px; color:#a32b40; background:#a32b4010; font-size:12px; line-height:1.5; }.import-preview { margin-top:16px; padding-top:12px; border-top:1px solid var(--editor-border,#ddd); }.preview-summary { margin:0 0 10px; font-size:12px; }.import-preview ol { margin:0; padding-left:24px; }.import-preview li { padding:5px 0; }.import-preview li>span { font-size:10px; color:var(--editor-muted,#817580); }.import-preview li>p { margin:3px 0; white-space:pre-wrap; word-break:break-word; font-size:12px; }
@media(max-width:450px) { header,footer,.dialog-content { padding:12px; }.settings-grid { grid-template-columns:minmax(0,1fr); } }
</style>
