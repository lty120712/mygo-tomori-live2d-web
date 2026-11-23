<template>
  <dialog ref="dialog" class="export-status" aria-labelledby="export-progress-title" aria-describedby="export-progress-description" @cancel.prevent @keydown.stop="modalKey" @copy.stop @paste.stop>
    <h2 id="export-progress-title">正在导出视频</h2>
    <p id="export-progress-description">导出期间暂时无法操作编辑器，请等待完成。</p>
    <div class="export-stage" role="status" aria-live="polite">{{label}}</div>
    <progress :value="recorder.isPreparing?.value ? undefined : percent" max="100" aria-label="视频导出进度" :aria-valuetext="label" />
    <div class="export-actions"><button v-if="recorder.isRecording.value" @click="$emit('finish')">结束并下载</button><button autofocus @click="$emit('cancel')">取消导出</button></div>
  </dialog>
</template>
<script setup>
import {computed,ref,watch,nextTick,onBeforeUnmount} from 'vue'
const props=defineProps({recorder:Object,time:Number,duration:Number})
defineEmits(['cancel','finish'])
const dialog=ref(null)
function modalKey(event){
  if(event.key!=='Tab')return
  const buttons=[...dialog.value.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1)
  if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus()}
}
const active=computed(()=>props.recorder.isPreparing?.value || props.recorder.isRecording.value || props.recorder.isExporting.value)
const percent=computed(()=>{
  const range=props.recorder.range?.value
  const ratio=props.recorder.isRecording.value ? (props.time-(range?.start || 0))/Math.max(.001,range?.duration ?? props.duration) : props.recorder.progress.value
  return Math.round(Math.max(0,Math.min(1,ratio))*100)
})
const label=computed(()=>props.recorder.isPreparing?.value ? '正在准备字体与素材…' : props.recorder.isRecording.value || props.recorder.phase?.value==='rendering' ? `正在生成画面：${percent.value}%` : props.recorder.phase?.value==='audio' ? `正在混合音频：${percent.value}%` : `正在处理视频文件：${percent.value}%`)
watch(active,async()=>{
  await nextTick()
  if(!dialog.value)return
  if(active.value){if(!dialog.value.open)dialog.value.showModal()}
  else if(dialog.value.open)dialog.value.close()
},{immediate:true})
onBeforeUnmount(()=>dialog.value?.close())
</script>
<style scoped>
.export-status{box-sizing:border-box;width:min(440px,calc(100vw - 40px));max-height:calc(100dvh - 40px);overflow:auto;padding:28px;border:1px solid var(--editor-border);border-radius:14px;background:var(--editor-panel);color:var(--editor-text);box-shadow:0 24px 80px #0006;font-size:14px;text-align:left}
.export-status::backdrop{background:rgba(16,13,24,.64);backdrop-filter:blur(2px)}
.export-status h2{font-size:19px;margin:0 0 10px;line-height:1.4}
.export-status p{margin:0 0 24px;color:var(--editor-muted);font-size:13px;line-height:1.7}
.export-stage{font-variant-numeric:tabular-nums;font-size:13px;margin-bottom:10px}
.export-status progress{display:block;width:100%;height:10px;accent-color:var(--editor-accent)}
.export-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:24px}
.export-actions button{margin:0;font:inherit;color:var(--editor-text);background:var(--editor-soft);border:1px solid var(--editor-border);border-radius:7px;padding:9px 15px;cursor:pointer}
.export-actions button:focus-visible{outline:2px solid var(--editor-accent);outline-offset:3px}
</style>
