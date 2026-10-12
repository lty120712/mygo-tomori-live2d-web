<template>
  <div class="preview-asset-list">
    <input v-model="search" :aria-label="'搜索'+label" :placeholder="'搜索'+label+'名称'" />
    <div class="list-summary">{{filtered.length}} 项<span v-if="value" :title="value">已选：{{value}}</span></div>
    <div class="asset-options" :aria-label="label+'列表'">
      <button v-for="item in filtered" :key="item" :aria-pressed="value===item" :disabled="disabled" :title="item" @click="emit('update:modelValue',item)">{{item}}</button>
      <p v-if="!filtered.length">{{items.length ? '没有匹配的'+label : '此模型没有'+label}}</p>
    </div>
  </div>
</template>
<script setup>
import {computed,ref} from 'vue'
const props=defineProps({items:{type:Array,default:()=>[]},modelValue:String,label:String,disabled:Boolean})
const emit=defineEmits(['update:modelValue'])
const search=ref(''),value=computed(()=>props.modelValue)
const filtered=computed(()=>props.items.filter(item=>item.toLowerCase().includes(search.value.trim().toLowerCase())))
</script>
<style scoped>
.list-summary { display:flex; justify-content:space-between; gap:8px; margin:10px 0; color:var(--editor-muted); font-size:10px; }
.list-summary span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:75%; }
.asset-options { display:flex; flex-direction:column; gap:4px; max-height:280px; overflow:auto; padding:2px; margin-bottom:12px; }
.asset-options button { text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; min-height:34px; }
.asset-options p { padding:16px 6px; color:var(--editor-muted); }
</style>
