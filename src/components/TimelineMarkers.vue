<template>
  <div class="marker-row">
    <div class="marker-tools" role="group" aria-label="时间线标记"><span>标记</span><button aria-label="在播放头添加标记" title="在播放头添加标记" :disabled="disabled || markers.length>=MARKER_LIMIT" @click="openEditor()">＋</button><button aria-label="上一个标记" title="上一个标记" :disabled="navigationDisabled || !neighbors.previous" @click="emit('seek',neighbors.previous.time)">‹</button><button aria-label="下一个标记" title="下一个标记" :disabled="navigationDisabled || !neighbors.next" @click="emit('seek',neighbors.next.time)">›</button><button aria-label="打开标记列表" @click="listDialog.showModal()">列表</button></div>
    <div ref="lane" class="marker-lane" aria-label="标记位置">
      <button v-for="marker in visibleMarkers" :key="marker.id" class="timeline-marker" :class="{dragging:drag?.marker.id===marker.id && drag.moved}" :style="{left:'min('+marker.time/railDuration*100+'%, calc(100% - 24px))',color:marker.color}" :title="marker.name+' · '+formatTimecode(marker.time,fps)+' · 拖动调整时间；双击编辑；Esc 取消'" :aria-label="'跳转到标记 '+marker.name+' '+formatTimecode(marker.time,fps)" :disabled="navigationDisabled"
        @pointerdown.stop="beginDrag($event,marker)" @pointermove.stop="moveDrag" @pointerup.stop="finishDrag" @pointercancel.stop="cancelDrag" @lostpointercapture.stop="cancelDrag" @keydown.esc.stop.prevent="cancelDrag" @click.stop="clickMarker($event,marker)" @dblclick.stop="!disabled && !suppressClick && openEditor(marker)" @contextmenu.stop.prevent="!disabled && openEditor(marker)" @keydown.delete.stop.prevent="remove(marker)">
        <b>⚑</b><span>{{marker.name}}</span><time v-if="drag?.marker.id===marker.id && drag.moved">{{formatTimecode(marker.time,fps)}}</time>
      </button>
    </div>
  </div>
  <dialog ref="editor" class="marker-dialog" aria-labelledby="marker-editor-title" @keydown.stop @pointerdown.stop>
    <form @submit.prevent="save"><header><h3 id="marker-editor-title">{{draft.id?'编辑标记':'添加标记'}}</h3><button type="button" @click="editor.close()">关闭</button></header><label>名称<input aria-label="标记名称" v-model="draft.name" maxlength="100" :disabled="disabled" /></label><label>时间<TimecodeInput label="标记时间" :value="draft.time" :fps="fps" :max="duration" :disabled="disabled" @change="draft.time=$event" /></label><label>颜色<input aria-label="标记颜色" type="color" v-model="draft.color" :disabled="disabled" /></label><footer><button v-if="draft.id" type="button" :disabled="disabled" @click="remove(draft);editor.close()">删除标记</button><button type="button" @click="editor.close()">取消</button><button type="submit" :disabled="disabled || !draft.name.trim()">保存标记</button></footer></form>
  </dialog>
  <dialog ref="listDialog" class="marker-dialog marker-list" aria-labelledby="marker-list-title" @keydown.stop @pointerdown.stop><header><h3 id="marker-list-title">标记列表 · {{markers.length}}</h3><button @click="listDialog.close()">关闭</button></header><p v-if="!markers.length">尚无标记，可在播放头添加。</p><ul v-else><li v-for="marker in markers" :key="marker.id"><button class="marker-link" :disabled="navigationDisabled" @click="emit('seek',marker.time);listDialog.close()"><i :style="{background:marker.color}"></i><time>{{formatTimecode(marker.time,fps)}}</time><span>{{marker.name}}</span></button><button :aria-label="'编辑标记 '+marker.name" :disabled="disabled" @click="listDialog.close();openEditor(marker)">编辑</button><button :aria-label="'删除标记 '+marker.name" :disabled="disabled" @click="remove(marker)">删除</button></li></ul></dialog>
</template>
<script setup>
import {ref,computed,watch,onMounted,onBeforeUnmount} from 'vue'
import {MARKER_COLOR,MARKER_LIMIT,markerNeighbors} from '../timelineMarkers.js'
import {snapTimelinePoint} from '../timelineEditing.js'
import {formatTimecode} from '../timecode.js'
import TimecodeInput from './TimecodeInput.vue'
const props=defineProps({markers:{type:Array,default:()=>[]},targets:{type:Array,default:()=>[]},snapping:{type:Boolean,default:true},duration:Number,axisDuration:Number,fps:Number,time:Number,disabled:Boolean,navigationDisabled:Boolean})
const railDuration=computed(()=>props.axisDuration ?? props.duration)
const emit=defineEmits(['change','seek','drag-state','snap']),editor=ref(null),listDialog=ref(null),draft=ref({id:null,name:'',time:0,color:MARKER_COLOR}),lane=ref(null),drag=ref(null)
let suppressClick=false
const neighbors=computed(()=>markerNeighbors(props.markers,props.time,props.fps))
const visibleMarkers=computed(()=>props.markers.map(marker=>drag.value?.marker.id===marker.id ? {...marker,time:drag.value.time} : marker))
function beginDrag(event,marker){
  if(event.button!==0 || props.disabled || props.navigationDisabled || drag.value)return
  const rect=lane.value.getBoundingClientRect()
  if(!rect.width)return
  suppressClick=false
  drag.value={marker:{...marker},time:marker.time,x:event.clientX,left:rect.left,width:rect.width,pointerId:event.pointerId,target:event.currentTarget,moved:false}
  event.currentTarget.setPointerCapture(event.pointerId)
  event.currentTarget.focus({preventScroll:true})
  emit('drag-state',true)
  event.preventDefault()
}
function moveDrag(event){
  const current=drag.value
  if(!current || current.pointerId!==event.pointerId)return
  if(props.disabled || props.navigationDisabled || !(event.buttons&1)){cancelDrag();return}
  const pixels=event.clientX-current.x+current.left-lane.value.getBoundingClientRect().left
  if(!current.moved && Math.abs(pixels)<3)return
  current.moved=true
  const targets=props.snapping && !event.altKey ? [...props.targets,...props.markers.filter(marker=>marker.id!==current.marker.id).map(marker=>marker.time)] : []
  const hit=snapTimelinePoint(current.marker.time+pixels/current.width*railDuration.value,{duration:props.duration,fps:props.fps,targets,tolerance:8/current.width*railDuration.value})
  current.time=hit.time
  emit('snap',hit.snapTime)
}
function clearDrag(){
  const current=drag.value
  if(!current)return null
  drag.value=null
  suppressClick=current.moved
  if(current.target.hasPointerCapture(current.pointerId))current.target.releasePointerCapture(current.pointerId)
  emit('drag-state',false)
  emit('snap',null)
  return current
}
function finishDrag(event){
  if(drag.value?.pointerId!==event.pointerId)return
  // pointerup 的坐标也参与计算，快速拖动时不依赖最后一条 pointermove。
  moveDrag({...event,clientX:event.clientX,pointerId:event.pointerId,buttons:1,altKey:event.altKey})
  const current=clearDrag()
  if(current?.moved && !props.disabled && !props.navigationDisabled && current.time!==current.marker.time)emit('change',{...current.marker,type:'edit',time:current.time})
}
function cancelDrag(){clearDrag()}
function clickMarker(event,marker){if(suppressClick && event.detail){suppressClick=false;return}emit('seek',marker.time)}
function cancelHiddenDrag(){if(document.hidden)cancelDrag()}
watch(()=>[props.disabled,props.navigationDisabled,props.duration,railDuration.value,props.fps,props.markers],cancelDrag)
onMounted(()=>{window.addEventListener('blur',cancelDrag);document.addEventListener('visibilitychange',cancelHiddenDrag)})
onBeforeUnmount(()=>{cancelDrag();window.removeEventListener('blur',cancelDrag);document.removeEventListener('visibilitychange',cancelHiddenDrag)})
function openEditor(marker){cancelDrag();draft.value=marker?{...marker}:{id:null,name:'标记 '+(props.markers.length+1),time:props.time,color:MARKER_COLOR};editor.value.showModal()}
function save(){if(props.disabled || !draft.value.name.trim())return;emit('change',{...draft.value,type:draft.value.id?'edit':'add'});editor.value.close()}
function remove(marker){if(!props.disabled && !drag.value)emit('change',{type:'remove',id:marker.id})}
</script>
<style scoped>
.timeline-marker{touch-action:none;user-select:none}.timeline-marker.dragging{cursor:grabbing;background:var(--editor-panel);outline:1px solid var(--editor-focus);max-width:220px;z-index:4}.timeline-marker time{font-size:10px;font-variant-numeric:tabular-nums;color:var(--editor-text)}
.marker-row{display:grid;grid-template-columns:170px minmax(0,1fr);height:34px;border-bottom:1px solid var(--editor-border);background:var(--editor-soft)}.marker-tools{display:flex;align-items:center;gap:4px;position:sticky;left:0;z-index:5;background:var(--editor-panel);padding:0 7px;border-right:1px solid var(--editor-border);font-size:11px;white-space:nowrap}.marker-tools>span{margin-right:2px}.marker-tools button{flex:none;padding:2px 5px!important;font:inherit;line-height:16px;min-width:20px}.marker-lane{position:relative;min-width:0;overflow:hidden}.timeline-marker{position:absolute;top:3px;display:flex;align-items:center;gap:3px;border:0;background:transparent;max-width:112px;padding:0 3px;white-space:nowrap;cursor:pointer;height:27px}.timeline-marker b{font-size:20px}.timeline-marker span{font-size:10px;color:var(--editor-text);overflow:hidden;text-overflow:ellipsis}.timeline-marker:focus-visible{outline:2px solid var(--editor-focus);outline-offset:-2px}.marker-dialog{box-sizing:border-box;width:min(480px,calc(100vw - 40px));max-height:calc(100dvh - 48px);overflow:auto;background:var(--editor-panel);color:var(--editor-text);border:1px solid var(--editor-border);border-radius:12px;padding:20px;font-size:13px}.marker-dialog::backdrop{background:#0007}.marker-dialog header,.marker-dialog footer{display:flex;align-items:center;gap:8px;justify-content:space-between}.marker-dialog h3{margin:0}.marker-dialog label{display:flex;align-items:center;gap:16px;margin:18px 0}.marker-dialog label :deep(input){flex:1;min-width:0;font:inherit;padding:7px;box-sizing:border-box;background:var(--editor-soft);color:inherit;border:1px solid var(--editor-border);border-radius:6px}.marker-dialog label input[type=color]{height:36px}.marker-dialog button{font:inherit;cursor:pointer;background:var(--editor-soft);color:inherit;border:1px solid var(--editor-border);border-radius:6px;padding:6px 9px}.marker-dialog button:disabled{opacity:.45;cursor:default}.marker-dialog footer{justify-content:flex-end;margin-top:20px}.marker-list ul{list-style:none;padding:0}.marker-list li{display:flex;align-items:center;gap:6px;margin:8px 0}.marker-list .marker-link{flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left}.marker-link i{width:9px;height:9px;border-radius:50%;flex-shrink:0}.marker-link time{font-variant-numeric:tabular-nums;white-space:nowrap}.marker-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
