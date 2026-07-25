<template>
  <div class="motion-panel">
    <h3 class="panel-title">动作</h3>
    <div class="motion-grid">
      <a-tooltip
        v-for="g in motionGroups"
        :key="g"
        :content="motionDurations[g] ? g + ' · ' + motionDurations[g].toFixed(1) + 's' : g"
        mini
      >
        <a-button
          size="small"
          class="motion-btn"
          :type="currentMotion === g ? 'danger' : 'outline'"
          :disabled="motionPlaying && currentMotion !== g"
          @click="$emit('play-motion', g)"
        >{{ g }}</a-button>
      </a-tooltip>
    </div>
    <a-button
      class="reset-btn"
      size="small"
      type="warning"
      long
      :disabled="motionPlaying"
      @click="$emit('reset')"
    >复位姿势</a-button>
    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>

<script setup>
defineProps({
  motionGroups: { type: Array, default: () => [] },
  currentMotion: { type: String, default: '' },
  motionPlaying: { type: Boolean, default: false },
  motionDurations: { type: Object, default: () => ({}) },
  toastMsg: { type: String, default: '' },
})
defineEmits(['play-motion', 'reset'])
</script>

<style scoped>
.motion-panel {
  width: 180px; background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px 0; display: flex; flex-direction: column; flex-shrink: 0;
  overflow-y: auto; position: relative;
}
.panel-title {
  font-size: 14px; padding: 0 12px 10px; margin: 0; color: #eee;
  flex-shrink: 0; border-bottom: 1px solid #0f3460;
}
.motion-grid {
  padding: 8px 10px; display: flex; flex-wrap: wrap; gap: 3px;
  align-content: flex-start;
}
.motion-btn { font-size: 12px; height: 28px; }
.motion-btn :deep(.arco-btn) { font-size: 12px; padding: 3px 8px; }
.reset-btn { margin: 8px 10px; flex-shrink: 0; }
.toast {
  position: absolute; bottom: 8px; right: 8px; background: #e94560;
  color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; z-index: 20;
}
</style>
