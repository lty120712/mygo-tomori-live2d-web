<template>
  <div class="right-panel">
    <div class="section">
      <h3 class="section-title">动作</h3>
      <a-scrollbar :style="{ maxHeight: motionMaxH + 'px', overflow: 'auto' }">
        <div ref="motionGridRef" class="chip-grid">
          <a-tooltip
            v-for="g in motionGroups"
            :key="g"
            :content="motionDurations[g] ? g + ' · ' + motionDurations[g].toFixed(1) + 's' : g"
            mini
          >
            <span
              class="motion-chip"
              :class="{
                active: currentMotion === g,
                disabled: motionPlaying && currentMotion !== g,
              }"
              :style="chipStyle(g)"
              @click="onMotionClick(g)"
            >
              <span class="chip-dot" :style="{ background: chipColor(g) }"></span>
              {{ g }}
            </span>
          </a-tooltip>
        </div>
      </a-scrollbar>
    </div>

    <a-button
      class="reset-btn"
      size="small"
      @click="$emit('reset')"
    >复位姿势</a-button>

    <div class="section">
      <h3 class="section-title">表情</h3>
      <a-scrollbar :style="{ maxHeight: exprMaxH + 'px', overflow: 'auto' }">
        <div ref="exprGridRef" class="chip-grid">
          <span
            v-for="e in expressionIds"
            :key="e"
            class="expr-chip"
            :class="{ active: currentExpression === e }"
            :style="exprChipStyle(e)"
            @click="$emit('set-expression', e)"
          >
            <span class="chip-dot" :style="{ background: exprColor(e) }"></span>
            {{ e }}
          </span>
        </div>
      </a-scrollbar>
    </div>

    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  motionGroups: { type: Array, default: () => [] },
  currentMotion: { type: String, default: '' },
  expressionIds: { type: Array, default: () => [] },
  currentExpression: { type: String, default: '' },
  motionPlaying: { type: Boolean, default: false },
  motionDurations: { type: Object, default: () => ({}) },
  toastMsg: { type: String, default: '' },
})
const emit = defineEmits(['play-motion', 'set-expression', 'reset'])

const MAX_ROWS = 6
const motionGridRef = ref(null)
const exprGridRef = ref(null)
const motionMaxH = ref(0)
const exprMaxH = ref(0)

const PALETTE = {
  smile: '#f5a623',
  cry: '#5b8def',
  angry: '#e94560',
  sad: '#7c6ff7',
  kime: '#2dd4bf',
  kandou: '#f472b6',
  shame: '#fb923c',
  surprised: '#a78bfa',
  thinking: '#38bdf8',
  bye: '#fb7185',
  sing: '#4ade80',
  idle: '#94a3b8',
  gacha: '#fbbf24',
  nf: '#c084fc',
  nnf: '#67e8f9',
}

function prefixOf(s) {
  for (const [prefix, _] of Object.entries(PALETTE)) {
    if (s.startsWith(prefix)) return prefix
  }
  return ''
}

function chipColor(g) {
  return PALETTE[prefixOf(g)] || '#94a3b8'
}

function chipStyle(g) {
  const c = chipColor(g)
  const active = props.currentMotion === g
  const disabled = props.motionPlaying && props.currentMotion !== g
  if (disabled) return {}
  return active
    ? { background: c, borderColor: c, color: '#fff' }
    : { borderColor: c + '55', color: c }
}

function exprColor(e) {
  return PALETTE[prefixOf(e)] || '#94a3b8'
}

function exprChipStyle(e) {
  const c = exprColor(e)
  const active = props.currentExpression === e
  return active
    ? { background: c, borderColor: c, color: '#fff' }
    : { borderColor: c + '55', color: c }
}

function onMotionClick(g) {
  if (props.motionPlaying && props.currentMotion !== g) return
  emit('play-motion', g)
}

function measureGrid(el) {
  if (!el || el.children.length === 0) return 186
  const first = el.children[0]
  let singleRowH = first.offsetHeight
  for (let i = 1; i < Math.min(el.children.length, 12); i++) {
    const child = el.children[i]
    if (child.offsetTop > first.offsetTop) {
      singleRowH = child.offsetTop - first.offsetTop
      break
    }
  }
  const last = el.children[el.children.length - 1]
  const lastBottom = last.offsetTop + last.offsetHeight
  const totalRows = Math.ceil((lastBottom - first.offsetTop) / singleRowH)
  return Math.min(totalRows, MAX_ROWS) * singleRowH + 2
}

function recalc() {
  nextTick(() => {
    motionMaxH.value = measureGrid(motionGridRef.value)
    exprMaxH.value = measureGrid(exprGridRef.value)
  })
}

onMounted(recalc)
watch(() => [props.motionGroups, props.expressionIds], recalc)
</script>

<style scoped>
.right-panel {
  width: 210px; background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px 0; display: flex; flex-direction: column; flex-shrink: 0;
  overflow: hidden; position: relative;
}
.section {
  padding: 0 12px; flex-shrink: 0;
}
.section-title {
  font-size: 13px; color: #aaa; margin: 0 0 8px;
  padding-bottom: 6px; border-bottom: 1px solid #0f3460;
}
.chip-grid {
  display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0;
  align-content: flex-start;
}

/* Motion chips */
.motion-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 14px; font-size: 12px;
  border: 1px solid; background: transparent; cursor: pointer;
  white-space: nowrap; user-select: none;
  transition: all 0.15s ease;
}
.motion-chip:hover { filter: brightness(1.2); }
.motion-chip.active { font-weight: 600; }
.motion-chip.disabled { opacity: 0.35; cursor: not-allowed; }
.motion-chip.disabled:hover { filter: none; }
.chip-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
}
.motion-chip.active .chip-dot { background: #fff !important; }

/* Expression chips */
.expr-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 10px; border-radius: 14px; font-size: 12px;
  border: 1px solid; background: transparent; cursor: pointer;
  white-space: nowrap; user-select: none;
  transition: all 0.15s ease;
}
.expr-chip:hover { filter: brightness(1.2); }
.expr-chip.active { font-weight: 600; }
.expr-chip.active .chip-dot { background: #fff !important; }

.reset-btn {
  margin: 8px 12px; flex-shrink: 0;
  border-color: #4a5568; color: #94a3b8;
  transition: all 0.15s;
}
.reset-btn:hover { border-color: #f59e0b; color: #f59e0b; }

.toast {
  position: absolute; bottom: 8px; right: 8px; background: #e94560;
  color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; z-index: 20;
}
</style>
