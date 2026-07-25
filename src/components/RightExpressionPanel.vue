<template>
  <div class="expr-panel">
    <h3 class="panel-title">表情</h3>
    <div class="expr-grid">
      <a-button
        v-for="e in expressionIds"
        :key="e"
        size="small"
        class="expr-btn"
        :type="currentExpression === e ? 'danger' : 'outline'"
        @click="$emit('set-expression', e)"
      >{{ e }}</a-button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  expressionIds: { type: Array, default: () => [] },
  currentExpression: { type: String, default: '' },
})
defineEmits(['set-expression'])
</script>

<style scoped>
.expr-panel {
  width: 160px; background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px 0; display: flex; flex-direction: column; flex-shrink: 0;
  overflow-y: auto;
}
.panel-title {
  font-size: 14px; padding: 0 12px 10px; margin: 0; color: #eee;
  flex-shrink: 0; border-bottom: 1px solid #0f3460;
}
.expr-grid {
  padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 3px;
  align-content: flex-start;
}
.expr-btn { font-size: 12px; height: 28px; }
.expr-btn :deep(.arco-btn) { font-size: 12px; padding: 3px 8px; }
</style>
