<template><SceneEditor v-if="!legacy" @legacy="legacy=true" /><template v-else><button class="back-v2" @click="legacy=false">返回 v2 场景编辑器</button><V1Editor /></template></template>
<script setup>
import { ref } from 'vue'
import SceneEditor from './SceneEditor.vue'
import V1Editor from './V1Editor.vue'
const legacy=ref(false)
</script>
<style>
html,body,#app {margin:0;padding:0;height:100%;overflow:hidden}
body {font-family:'Segoe UI',sans-serif;background:#101522;color:#eee}
.back-v2 {position:fixed;right:12px;top:8px;z-index:100;background:#1c4161;color:white;border:1px solid #7bb6e0;padding:7px 10px;border-radius:4px;cursor:pointer}
</style>
