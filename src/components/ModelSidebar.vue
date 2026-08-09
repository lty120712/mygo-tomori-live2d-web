<template>
  <div class="sidebar">
    <h2 class="sidebar-title">模型</h2>
    <div class="model-list">
      <template v-for="cat in categories" :key="cat.key">
        <div class="cat-header">{{ cat.label }}</div>
        <div
          v-for="m in cat.items"
          :key="m.category + '/' + m.name"
          class="model-item"
          :class="{ active: (m.category + '/' + m.name) === currentModel }"
          @click="$emit('select', m)"
        >{{ m.name }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  models: { type: Array, required: true },
  currentModel: { type: String, default: '' },
})
defineEmits(['select'])

const categories = computed(() => {
  const map = {}
  for (const m of props.models) {
    if (!map[m.category]) map[m.category] = { key: m.category, label: m.category === 'tomori' ? 'Tomori' : 'Anon', items: [] }
    map[m.category].items.push(m)
  }
  return Object.values(map)
})
</script>

<style scoped>
.sidebar { width: 260px; background: #16213e; border-right: 1px solid #0f3460; display: flex; flex-direction: column; flex-shrink: 0; height: 100%; }
.sidebar-title { font-size: 16px; padding: 16px 16px 12px; margin: 0; flex-shrink: 0; color: #eee; }
.model-list { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
.cat-header { color: #e94560; font-size: 12px; font-weight: 600; padding: 8px 0 4px; text-transform: uppercase; letter-spacing: 1px; }
.model-item { padding: 9px 14px; margin-bottom: 4px; background: #1a1a3e; border: 1px solid #0f3460; border-radius: 8px; color: #ccc; cursor: pointer; font-size: 13px; transition: all .15s; user-select: none; }
.model-item:hover { background: #0f3460; color: #fff; border-color: #e94560; }
.model-item.active { background: #e94560; color: #fff; border-color: #e94560; }
</style>
