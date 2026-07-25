<template>
  <div class="param-panel">
    <h3 class="panel-title">参数控制</h3>
    <a-collapse :default-active-key="defaultKeys" :bordered="false" expand-icon-position="right">
      <a-collapse-item
        v-for="group in groups"
        :key="group.key"
        :header="group.header"
      >
        <div class="reset-row">
          <span class="reset-link" @click="$emit('reset-group', group.key)">复位{{ group.header }}</span>
        </div>
        <div v-for="p in group.params" :key="p.key" class="param-row">
          <span class="param-label">{{ p.label }}</span>
          <a-slider
            :model-value="values[p.key]"
            :min="p.min"
            :max="p.max"
            :step="p.step"
            style="flex:1;margin:0 8px;"
            @change="v => $emit('set-param', p.key, v)"
          />
          <a-input-number
            :model-value="values[p.key]"
            :min="p.min"
            :max="p.max"
            :step="p.step"
            :precision="precision(p.step)"
            size="mini"
            :hide-button="true"
            style="width:70px"
            @change="v => v != null && $emit('set-param', p.key, v)"
          />
        </div>
      </a-collapse-item>
      <a-collapse-item key="gaze" header="视线">
        <div class="param-row">
          <span class="param-label">鼠标跟随</span>
          <a-switch
            :model-value="mouseTrackEnabled"
            @change="$emit('update:mouseTrackEnabled', $event)"
          />
        </div>
      </a-collapse-item>
    </a-collapse>
    <div class="panel-footer">
      <a-button size="small" type="outline" long @click="$emit('reset-all')">全部复位</a-button>
    </div>
    <div v-if="motionLabel" class="motion-progress">
      <div class="progress-header">
        <span class="progress-label">{{ motionLabel }}</span>
        <span class="progress-timer">{{ motionRemain }}</span>
      </div>
      <a-progress :percent="motionProgress / 100" size="small" color="#e94560" :show-text="false" />
    </div>
  </div>
</template>

<script setup>
import { PARAM_GROUPS, DEFAULT_ACTIVE_KEYS } from '../params.js'

defineProps({
  values: { type: Object, required: true },
  mouseTrackEnabled: { type: Boolean, default: true },
  motionProgress: { type: Number, default: 0 },
  motionLabel: { type: String, default: '' },
  motionRemain: { type: String, default: '' },
})
defineEmits(['set-param', 'reset-group', 'reset-all', 'update:mouseTrackEnabled'])

const groups = PARAM_GROUPS
const defaultKeys = DEFAULT_ACTIVE_KEYS

function precision(step) {
  const s = String(step)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}
</script>

<style scoped>
.param-panel {
  width: 260px; background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px 0; display: flex; flex-direction: column; flex-shrink: 0;
}
.panel-title { font-size: 15px; padding: 0 16px 12px; margin: 0; color: #eee; flex-shrink: 0; border-bottom: 1px solid #0f3460; }
.param-panel :deep(.arco-collapse) { border: none; flex:1; overflow-y:auto; }
.param-panel :deep(.arco-collapse-item) { border-color: #0f3460; }
.param-panel :deep(.arco-collapse-item-header) { background: #16213e; color: #ddd; font-size: 13px; padding: 10px 16px; }
.param-panel :deep(.arco-collapse-item-content) { background: #16213e; padding: 0 16px 12px; }
.param-panel :deep(.arco-collapse-item-content-box) { padding: 0; }
.param-row { display:flex; align-items:center; margin-bottom:8px; }
.param-label { color: #999; font-size: 13px; width: 60px; flex-shrink: 0; }
.reset-row { margin-bottom: 8px; }
.reset-link { color: #e94560; font-size: 12px; cursor: pointer; user-select: none; }
.reset-link:hover { color: #ff6b81; }
.panel-footer { padding: 8px 16px; border-top: 1px solid #0f3460; flex-shrink: 0; }
.panel-footer :deep(.arco-btn-outline) { border-color: #e94560; color: #e94560; }
.panel-footer :deep(.arco-btn-outline):hover { background: #e94560; color: #fff; }
.motion-progress {
  padding: 8px 16px; border-top: 1px solid #0f3460; flex-shrink: 0;
}
.progress-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
.progress-label { color: #999; font-size: 11px; }
.progress-timer { color: #e94560; font-size: 13px; font-weight:600; font-variant-numeric:tabular-nums; }
</style>
