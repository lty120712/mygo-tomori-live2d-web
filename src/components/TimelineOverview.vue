<template>
  <div class="overview" aria-label="轨道分布缩略图">
    <div class="overview-legend"><span v-for="kind in kinds" :key="kind" :style="{'--swatch':TRACK_TYPES[kind].color}"><i></i>{{TRACK_TYPES[kind].label}}</span><small>点击或拖动定位视野</small></div>
    <svg ref="map" viewBox="0 0 1000 100" preserveAspectRatio="none" role="slider" aria-label="轨道缩略图导航" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(view.y)" aria-valuetext="'当前视野纵向位置 '+Math.round(view.y)+'%'" tabindex="0" @pointerdown.stop="begin" @pointermove.stop="move" @pointerup.stop="end" @pointercancel.stop="end" @lostpointercapture.stop="end" @keydown="navigate">
      <rect width="1000" height="100" class="map-background" />
      <g v-for="row in rows" :key="row.key">
        <rect x="0" :y="row.y" width="1000" :height="Math.max(.3,row.h-.6)" class="map-row" />
        <rect v-for="clip in row.clips" :key="clip.id" :x="clip.start/duration*1000" :y="row.y+.3" :width="Math.max(1,clip.duration/duration*1000)" :height="Math.max(.4,row.h-1)" :fill="TRACK_TYPES[row.kind]?.color || TRACK_TYPES.mixed.color" :opacity="clip.layerHidden || clip.muted ? .35 : .85" />
      </g>
      <line :x1="time/duration*1000" :x2="time/duration*1000" y1="0" y2="100" class="map-playhead" />
      <rect :x="view.x" :y="view.y" :width="view.w" :height="view.h" class="map-viewport" />
    </svg>
  </div>
</template>
<script setup>
import {ref,computed,onMounted,onBeforeUnmount,watch,nextTick} from 'vue'
import {TRACK_TYPES,visualTrackType} from '../timelineAppearance.js'
const props=defineProps({viewport:Object,clips:Array,audioClips:Array,backgroundClips:Array,duration:Number,time:Number})
const emit=defineEmits(['navigate'])
const map=ref(null),rows=ref([]),view=ref({x:0,y:0,w:1000,h:100})
const kinds=computed(()=>[...new Set(rows.value.map(r=>r.kind))].filter(k=>TRACK_TYPES[k]))
let observer,mutation,frame=null,drag=null,attached=null
function measure(){
  const viewport=props.viewport,content=viewport?.querySelector('.timeline-content')
  if(!content)return
  const origin=content.getBoundingClientRect().top,height=viewport.scrollHeight,laneWidth=content.scrollWidth-170
  rows.value=[...content.querySelectorAll('.track-row,.sub-row')].map((el,index)=>{
    const track=el.querySelector('[data-visual-track]')?.dataset.visualTrack,audio=el.dataset.audioTrack
    const clips=track!==undefined ? props.clips.filter(c=>c.track===Number(track)) : audio!==undefined ? props.audioClips.filter(c=>(c.track || 0)===Number(audio)) : el.hasAttribute('data-background-track') ? props.backgroundClips : []
    const kind=track!==undefined ? visualTrackType(clips) : audio!==undefined ? 'audio' : el.hasAttribute('data-background-track') ? 'background' : 'mixed'
    const rect=el.getBoundingClientRect()
    return {key:index,kind,clips,y:(rect.top-origin)/height*100,h:rect.height/height*100}
  })
  view.value={x:viewport.scrollLeft/Math.max(1,laneWidth)*1000,y:viewport.scrollTop/height*100,w:Math.min(1000,(viewport.clientWidth-170)/Math.max(1,laneWidth)*1000),h:Math.min(100,viewport.clientHeight/height*100)}
}
function schedule(){if(frame===null)frame=requestAnimationFrame(()=>{frame=null;measure()})}
function position(e){
  const viewport=props.viewport,r=map.value.getBoundingClientRect(),content=viewport.querySelector('.timeline-content')
  const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))
  viewport.scrollLeft=x*(content.scrollWidth-170)-(viewport.clientWidth-170)/2
  viewport.scrollTop=y*viewport.scrollHeight-viewport.clientHeight/2
  schedule()
}
function begin(e){if(e.button!==0)return;emit('navigate');drag=e.pointerId;map.value.setPointerCapture(e.pointerId);e.preventDefault();position(e)}
function move(e){if(drag===e.pointerId)position(e)}
function end(){drag=null}
function navigate(e){
  if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key))return
  e.preventDefault();e.stopPropagation()
  emit('navigate')
  const v=props.viewport
  if(e.key==='ArrowDown')v.scrollTop+=60
  else if(e.key==='ArrowUp')v.scrollTop-=60
  else if(e.key==='ArrowRight')v.scrollLeft+=100
  else if(e.key==='ArrowLeft')v.scrollLeft-=100
  else if(e.key==='Home')v.scrollTop=0
  else if(e.key==='End')v.scrollTop=v.scrollHeight
}
function attach(){
  attached?.removeEventListener('scroll',schedule);observer?.disconnect();mutation?.disconnect()
  attached=props.viewport
  if(!attached)return
  attached.addEventListener('scroll',schedule,{passive:true})
  observer=new ResizeObserver(schedule);observer.observe(attached)
  const content=attached.querySelector('.timeline-content');if(content)observer.observe(content)
  mutation=new MutationObserver(schedule);mutation.observe(attached,{childList:true,subtree:true})
  schedule()
}
watch(()=>props.viewport,()=>nextTick(attach))
watch(()=>[props.clips,props.audioClips,props.backgroundClips,props.duration],schedule,{deep:true})
onMounted(attach)
onBeforeUnmount(()=>{attached?.removeEventListener('scroll',schedule);observer?.disconnect();mutation?.disconnect();if(frame!==null)cancelAnimationFrame(frame)})
</script>
<style scoped>
.overview { flex-shrink:0; padding:6px 12px 8px; background:var(--editor-panel); border-bottom:1px solid var(--editor-border); }
.overview-legend { display:flex; align-items:center; gap:12px; font-size:10px; padding-bottom:5px; color:var(--editor-muted); flex-wrap:wrap; }.overview-legend span { display:flex; align-items:center; gap:4px; }.overview-legend i { width:7px; height:7px; border-radius:2px; background:var(--swatch); }.overview-legend small { margin-left:auto; }
svg { display:block; width:100%; height:72px; border:1px solid var(--editor-border); border-radius:5px; cursor:crosshair; touch-action:none; }svg:focus-visible { outline:2px solid var(--editor-focus); }
.map-background { fill:var(--editor-soft,#fafafa); }.map-row { fill:#8888880d; }.map-playhead { stroke:var(--editor-accent,#743a52); stroke-width:1; }.map-viewport { fill:#ffffff18; stroke:var(--editor-text,#333); stroke-width:1.5; vector-effect:non-scaling-stroke; pointer-events:none; }
</style>
