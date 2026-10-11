<template><input type="text" :aria-label="label" :value="draft" :disabled="disabled" title="分:秒:帧；↑ / ↓ 调整一帧，Enter 确认" @focus="focused=true;emit('begin-edit')" @input="draft=$event.target.value" @blur="commit();focused=false;emit('end-edit')" @keydown.enter.prevent="commit();$event.target.blur()" @keydown.up.prevent="step(1)" @keydown.down.prevent="step(-1)" /></template>
<script setup>
import {ref,watch} from 'vue'
import {formatTimecode,parseTimecode} from '../timecode.js'
const props=defineProps({value:Number,fps:Number,label:String,disabled:Boolean,min:{type:Number,default:0},max:{type:Number,default:Infinity}})
const emit=defineEmits(['change','begin-edit','end-edit'])
const draft=ref(formatTimecode(props.value,props.fps)),focused=ref(false)
watch(()=>[props.value,props.fps],()=>{if(!focused.value)draft.value=formatTimecode(props.value,props.fps)})
function update(value){const bounded=Math.max(props.min,Math.min(props.max,value));const quantized=Math.max(props.min,Math.min(props.max,Math.round(bounded*props.fps)/props.fps));draft.value=formatTimecode(quantized,props.fps);if(quantized!==props.value)emit('change',quantized)}
function commit(){const time=parseTimecode(draft.value,props.fps);if(time===null)draft.value=formatTimecode(props.value,props.fps);else update(time)}
function step(direction){update((parseTimecode(draft.value,props.fps) ?? props.value)+direction/props.fps)}
</script>
