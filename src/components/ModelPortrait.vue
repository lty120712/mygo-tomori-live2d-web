<template><span ref="host" class="model-portrait" :class="model.category" :aria-busy="loading"><img v-if="image" :src="image" :alt="model.character+' '+model.label+'头像'" /><svg v-else viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="11" r="6"/><path d="M5 30c0-9 4-13 11-13s11 4 11 13"/></svg></span></template>
<script setup>
import {ref,watch,onMounted,onBeforeUnmount} from 'vue'
import {getModelPortrait} from '../modelPortrait.js'
const props=defineProps({model:Object,paused:Boolean})
const host=ref(null),image=ref(''),loading=ref(false),visible=ref(false)
let observer,disposed=false,failed=false
async function load(){
  if(disposed || !visible.value || props.paused || image.value || loading.value || failed)return
  loading.value=true
  try{const result=await getModelPortrait(props.model,()=>!disposed && visible.value && !props.paused);if(!disposed && result)image.value=result}catch{failed=true}finally{
    loading.value=false
    if(!disposed && visible.value && !props.paused && !image.value && !failed)void load()
  }
}
watch(()=>[visible.value,props.paused],load)
onMounted(()=>{observer=new IntersectionObserver(entries=>{visible.value=entries[0].isIntersecting},{root:host.value.closest('.library-results'),rootMargin:'50px'});observer.observe(host.value)})
onBeforeUnmount(()=>{disposed=true;observer?.disconnect()})
</script>
<style scoped>
.model-portrait { width:48px; height:52px; flex-shrink:0; display:grid; place-items:center; border-radius:12px; overflow:hidden; background:#e1dce9; color:#817295; }.model-portrait.anon { background:#efdee3; color:#ac7d8d; }
img { width:100%; height:100%; object-fit:cover; display:block; }svg { width:26px; height:26px; fill:currentColor; opacity:.45; }
</style>
