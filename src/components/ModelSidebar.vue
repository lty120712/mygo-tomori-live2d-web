<template>
  <div class="sidebar">
    <h2 class="sidebar-title">Tomori <span class="accent">模型</span></h2>
    <div class="model-list">
      <div
        v-for="m in models"
        :key="m"
        class="model-item"
        :class="{ active: m === currentModel }"
        @click="$emit('select', m)"
      >{{ m }}</div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  models: { type: Array, required: true },
  currentModel: { type: String, default: '' },
})
defineEmits(['select'])
</script>

<style scoped>
.sidebar { width: 260px; background: #16213e; border-right: 1px solid #0f3460; display: flex; flex-direction: column; flex-shrink: 0; height: 100%; }
.sidebar-title { font-size: 16px; padding: 16px 16px 12px; margin: 0; flex-shrink: 0; color: #eee; }
.accent { color: #e94560; }
.model-list { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
.model-item { padding: 9px 14px; margin-bottom: 4px; background: #1a1a3e; border: 1px solid #0f3460; border-radius: 8px; color: #ccc; cursor: pointer; font-size: 13px; transition: all .15s; user-select: none; }
.model-item:hover { background: #0f3460; color: #fff; border-color: #e94560; }
.model-item.active { background: #e94560; color: #fff; border-color: #e94560; }
</style>