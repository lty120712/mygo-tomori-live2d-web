<template>
  <dialog ref="dialog" aria-labelledby="video-export-title" @keydown.stop>
    <form @submit.prevent="start">
      <header><h3 id="video-export-title">导出视频</h3><button type="button" aria-label="关闭视频导出设置" @click="dialog.close()">关闭</button></header>
      <label>视频格式<select aria-label="导出视频格式" v-model="recorder.format.value"><option v-for="format in recorder.formats" :key="format.id" :value="format.id">{{format.label}}</option></select></label>
      <label>导出方式<select aria-label="导出方式" v-model="recorder.method.value"><option value="offline" :disabled="!recorder.offlineAvailable || recorder.format.value!=='mp4'">快速导出 · 无需播放</option><option value="realtime">兼容导出 · 实时录制</option></select></label>
      <p v-if="recorder.method.value==='offline'">按时间线逐帧生成，不播放声音，不必等待正常播放一遍。导出速度取决于设备性能和场景复杂度。</p><p v-else>兼容模式需要完整播放一次；快速导出目前支持 MP4，需要浏览器支持相应编码能力。</p>
      <label>分辨率<select aria-label="导出分辨率" v-model="recorder.resolution.value"><option value="540">540p</option><option value="720">720p</option><option value="1080">1080p（推荐）</option></select></label>
      <label>画质<select aria-label="导出画质" v-model="recorder.quality.value"><option value="standard">标准 · 文件较小</option><option value="high">高清（推荐）</option><option value="maximum">高品质 · 文件较大</option></select></label>
      <label>导出范围<select aria-label="导出范围" v-model="rangeMode"><option value="all">全片</option><option value="custom">自定义时间范围</option></select></label>
      <div v-if="rangeMode==='custom'" class="range-grid"><label>开始时间<TimecodeInput label="导出开始时间" :fps="fps" :value="rangeStart" :max="timelineEnd" @change="rangeStart=$event" /></label><label>结束时间<TimecodeInput label="导出结束时间" :fps="fps" :value="rangeEnd" :max="timelineEnd" @change="rangeEnd=$event" /></label></div>
      <p v-if="rangeError" role="alert">{{rangeError}}</p><p v-else-if="range">导出时长 {{formatTimecode(range.duration,fps)}} · {{range.frames}} 帧</p>
      <p role="status">{{settings.width}} × {{settings.height}} · {{settings.fps}} FPS · 目标视频码率 {{(settings.videoBitsPerSecond/1e6).toFixed(1)}} Mbps</p>
      <p>帧率跟随工程设置。模型和文字按所选分辨率渲染，图片和视频清晰度取决于原素材。</p>
      <p v-if="recorder.preferences?.error.value" role="status">{{recorder.preferences.error.value}}</p>
      <footer><button type="button" @click="dialog.close()">取消</button><button type="submit" :disabled="disabled || !!rangeError">开始导出</button></footer>
    </form>
  </dialog>
</template>
<script setup>
import {ref,computed,watch} from 'vue'
import {videoExportSettings} from '../videoExportSettings.js'
import {exportRange} from '../exportRange.js'
import {formatTimecode,frameCountForDuration} from '../timecode.js'
import TimecodeInput from './TimecodeInput.vue'
const props=defineProps({recorder:Object,aspectRatio:String,fps:Number,duration:{type:Number,default:0},disabled:Boolean})
const emit=defineEmits(['start']),dialog=ref(null)
const rangeMode=ref('all'),rangeStart=ref(0),rangeEnd=ref(0)
const timelineEnd=computed(()=>frameCountForDuration(props.duration,props.fps)/props.fps)
const request=computed(()=>({mode:rangeMode.value,start:rangeStart.value,end:rangeEnd.value}))
const rangeResult=computed(()=>{try{return {range:exportRange(props.duration,props.fps,request.value),error:''}}catch(error){return {range:null,error:error.message}}})
const range=computed(()=>rangeResult.value.range),rangeError=computed(()=>rangeResult.value.error)
watch(()=>props.recorder.format.value,value=>{if(value!=='mp4')props.recorder.method.value='realtime'})
const settings=computed(()=>videoExportSettings({resolution:props.recorder.resolution.value,quality:props.recorder.quality.value,fps:props.fps,portrait:props.aspectRatio==='9:16'}))
function start(){if(props.disabled || rangeError.value)return;dialog.value.close();emit('start',request.value)}
defineExpose({open:(selection)=>{
  let initial=null
  if(selection){
    try{initial=exportRange(props.duration,props.fps,{mode:'custom',start:selection.start,end:selection.end})}catch{}
  }
  rangeMode.value=initial ? 'custom' : 'all'
  rangeStart.value=initial?.start ?? 0
  rangeEnd.value=initial?.end ?? timelineEnd.value
  dialog.value.showModal()
}})
</script>
<style scoped>
dialog{width:min(440px,calc(100vw - 48px));padding:24px;border:1px solid var(--editor-border);border-radius:12px;background:var(--editor-panel);color:var(--editor-text)}dialog::backdrop{background:#0007}header,footer{display:flex;align-items:center;justify-content:space-between;gap:12px}h3{margin:0 0 12px}label{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:16px 0}select{min-width:210px;padding:8px;border-radius:6px;background:var(--editor-soft);color:inherit;border:1px solid var(--editor-border)}p{font-size:12px;line-height:1.7;color:var(--editor-muted)}button{padding:8px 14px;cursor:pointer;background:var(--editor-soft);color:inherit;border:1px solid var(--editor-border);border-radius:6px}footer{justify-content:flex-end;margin-top:20px}
</style>
<style scoped>
dialog{box-sizing:border-box;max-height:calc(100dvh - 48px);overflow:auto}.range-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.range-grid label{display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin:0}.range-grid :deep(input){width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid var(--editor-border);border-radius:6px;background:var(--editor-soft);color:inherit;font-variant-numeric:tabular-nums}
</style>
