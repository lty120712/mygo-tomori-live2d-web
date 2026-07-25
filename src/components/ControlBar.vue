<template>
  <div class="control-bar">
    <div class="ctrl-block">
      <span class="ctrl-label">动作</span>
      <div class="ctrl-grid">
        <a-tooltip
            v-for="(g, i) in motionGroups"
            :key="g"
            :content="motionDurations[g] ? g + ' · ' + motionDurations[g].toFixed(1) + 's' : g"
            position="top"
            mini
          >
            <a-button
              size="small"
              class="ctrl-btn"
              :class="btnClass('motion', g, i)"
              :type="currentMotion === g ? 'danger' : 'outline'"
              :disabled="motionPlaying && currentMotion !== g"
              @click="$emit('play-motion', g)"
            >{{ g }}</a-button>
          </a-tooltip>
      </div>
    </div>

    <a-button class="reset-btn" size="small" type="warning" :disabled="motionPlaying" @click="$emit('reset')">复位</a-button>

    <div class="ctrl-block" v-if="expressionIds.length">
      <span class="ctrl-label">表情</span>
      <div class="ctrl-grid">
        <a-button
          v-for="(e, i) in expressionIds"
          :key="e"
          size="small"
          class="ctrl-btn"
          :class="btnClass('expression', e, i)"
          :type="currentExpression === e ? 'danger' : 'outline'"
          @click="$emit('set-expression', e)"
        >{{ e }}</a-button>
      </div>
    </div>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  motionGroups: { type: Array, default: () => [] },
  currentMotion: { type: String, default: '' },
  expressionIds: { type: Array, default: () => [] },
  currentExpression: { type: String, default: '' },
  motionPlaying: { type: Boolean, default: false },
  motionDurations: { type: Object, default: () => ({}) },
  toastMsg: { type: String, default: '' },
})
defineEmits(['play-motion', 'set-expression', 'reset'])

const gridRefs = {}
function setGridRef(key, el) { if (el) gridRefs[key] = el }
const cols = ref({ motion: 4, expression: 4 })

let observer = null

function updateColumns() {
  for (const key of Object.keys(gridRefs)) {
    const el = gridRefs[key]
    if (!el) continue
    const c = Math.floor(el.offsetWidth / 95)
    cols.value = { ...cols.value, [key]: Math.max(1, c) }
  }
}

onMounted(() => {
  observer = new ResizeObserver(updateColumns)
  for (const el of Object.values(gridRefs)) {
    if (el) observer.observe(el)
  }
  updateColumns()
})
onBeforeUnmount(() => observer?.disconnect())

const blocks = computed(() => {
  const result = []
  result.push({
    key: 'motion',
    label: '动作',
    event: 'play-motion',
    items: props.motionGroups.map(g => ({
      name: g, active: props.currentMotion === g,
    })),
  })
  if (props.expressionIds.length) {
    result.push({
      key: 'expression',
      label: '表情',
      event: 'set-expression',
      items: props.expressionIds.map(e => ({
        name: e, active: props.currentExpression === e,
      })),
    })
  }
  return result
})

function btnClass(key, name, i) {
  const active = (key === 'motion' && props.currentMotion === name)
    || (key === 'expression' && props.currentExpression === name)
  if (active) return 'active-z'
  const c = cols.value[key] || 4
  return 'row-' + (Math.floor(i / c) % 2)
}
</script>

<style scoped>
.control-bar {
  background: #16213e; border-top: 1px solid #0f3460;
  padding: 8px 12px; display: flex; align-items: flex-start; gap: 10px;
  margin-bottom: 6px; border-bottom: 1px solid #0f3460;
  border-radius: 0 0 6px 6px; flex-shrink: 0;
}
.ctrl-block { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ctrl-label { color: #999; font-size: 12px; padding: 2px 0 4px; flex-shrink: 0; }
.ctrl-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 5px; align-content: start; padding-right: 4px;
  max-height: 132px; overflow-y: auto;
}
.ctrl-btn :deep(.arco-btn) { font-size: 12px; padding: 3px 8px; height: 28px; }

.ctrl-btn.row-0:not(.arco-btn-danger) {
  border-color: #2a4a8e !important; color: #8ab4f8 !important;
  background: rgba(42,74,142,0.12) !important;
}
.ctrl-btn.row-1:not(.arco-btn-danger) {
  border-color: #3a2e6e !important; color: #b49af8 !important;
  background: rgba(58,46,110,0.12) !important;
}

.reset-btn { flex-shrink: 0; align-self: flex-start; margin-top: 18px; }
.toast {
  position: absolute; bottom: 8px; right: 12px; background: #e94560;
  color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; z-index: 20;
}
</style>