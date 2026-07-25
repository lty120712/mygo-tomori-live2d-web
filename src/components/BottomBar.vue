<template>
  <div class="bottom-bar">
    <div class="bb-controls">
      <div class="bb-btns">
        <a-button size="mini" title="跳到开头" @click="kf.goToStart()">|<</a-button>
        <a-button size="mini" title="上一帧" @click="kf.goToFrame(kf.currentFrame.value - 1)">&#9664;</a-button>
        <a-button v-if="!kf.isPlaying.value" size="mini" type="primary" title="播放" @click="onPlay">&#9654;</a-button>
        <a-button v-else size="mini" status="warning" title="暂停" @click="kf.pause()">&#9646;&#9646;</a-button>
        <a-button size="mini" title="下一帧" @click="kf.goToFrame(kf.currentFrame.value + 1)">&#9654;</a-button>
        <a-button size="mini" title="跳到末尾" @click="kf.goToEnd()">>|</a-button>
        <a-button size="mini" title="停止" @click="onStop">&#9632;</a-button>
      </div>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-label">时长</span>
      <a-input-number
        :model-value="kf.duration.value"
        :min="0.5" :max="60" :step="0.5"
        size="mini" style="width:64px"
        @change="kf.setDuration($event)"
      />
      <span class="bb-label">FPS</span>
      <a-input-number
        :model-value="kf.fps.value"
        :min="1" :max="60" :step="1"
        size="mini" style="width:58px"
        @change="v => kf.fps.value = v"
      />
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-info">帧 <b>{{ Math.floor(kf.currentFrame.value) }}</b> / {{ kf.totalFrames.value }}</span>
      <span class="bb-info">{{ kf.currentTime.value.toFixed(2) }}s</span>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <a-button size="mini" @click="kf.goToPrevKeyframe()">上一关键帧</a-button>
      <a-input-number
        :model-value="Math.floor(kf.currentFrame.value)"
        :min="0" :max="kf.totalFrames.value"
        size="mini" style="width:60px"
        @change="kf.goToFrame($event)"
      />
      <a-button size="mini" @click="kf.goToNextKeyframe()">下一关键帧</a-button>
      <div class="bb-spacer"></div>
      <a-button size="mini" status="danger" @click="onClear">清除全部</a-button>
    </div>

    <div class="bb-timeline" ref="timelineRef" @click="seekTimeline">
      <div class="bb-track">
        <div class="bb-fill" :style="{ width: scrubberPercent + '%' }"></div>
        <div
          v-for="pos in uniqueFrames"
          :key="pos"
          class="bb-dot"
          :style="{ left: (pos / kf.totalFrames.value * 100) + '%' }"
        ></div>
        <div class="bb-playhead" :style="{ left: scrubberPercent + '%' }"></div>
      </div>
    </div>

    <div class="bb-params">
      <div class="bb-group-tabs">
        <span
          v-for="group in groups"
          :key="group.key"
          class="bb-tab"
          :class="{ active: activeGroup === group.key }"
          @click="activeGroup = group.key"
        >{{ group.header }}</span>
      </div>
      <div class="bb-sliders" v-if="activeGroupObj">
        <div v-for="p in activeGroupObj.params" :key="p.key" class="bb-param-row">
          <span class="bb-param-label">{{ p.label }}</span>
          <a-slider
            :model-value="getDisplayValue(p.key)"
            :min="p.min"
            :max="p.max"
            :step="p.step"
            :disabled="kf.isPlaying.value"
            style="flex:1;margin:0 4px;"
            @change="v => onChangeParam(p, v)"
          />
          <a-input-number
            :model-value="getDisplayValue(p.key)"
            :min="p.min"
            :max="p.max"
            :step="p.step"
            :precision="precision(p.step)"
            size="mini"
            :hide-button="true"
            :disabled="kf.isPlaying.value"
            style="width:58px"
            @change="v => v != null && onChangeParam(p, v)"
          />
          <span
            class="bb-diamond"
            :class="{ active: kf.hasKeyframe(p.key, kf.currentFrame.value) }"
            title="关键帧 (点击切换)"
            @click="toggleKeyframe(p.key)"
          >&#9670;</span>
        </div>
      </div>
    </div>

    <div class="bb-footer">
      <a-button size="small" type="outline" style="border-color:#e94560;color:#e94560" @click="$emit('reset-all')">全部复位</a-button>
      <span class="bb-label">鼠标跟随</span>
      <a-switch size="small" :model-value="mouseTrackEnabled" @change="$emit('update:mouseTrackEnabled', $event)" />
      <div v-if="motionLabel" class="bb-motion-info">
        <span>{{ motionLabel }}</span>
        <a-progress :percent="motionProgress / 100" size="small" :show-text="false" style="width:80px" />
        <span>{{ motionRemain }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { PARAM_GROUPS, initParamValues } from '../params.js'

const props = defineProps({
  values: { type: Object, required: true },
  kf: { type: Object, required: true },
  mouseTrackEnabled: { type: Boolean, default: true },
  motionProgress: { type: Number, default: 0 },
  motionLabel: { type: String, default: '' },
  motionRemain: { type: String, default: '' },
})

const emit = defineEmits(['set-param', 'reset-group', 'reset-all', 'update:mouseTrackEnabled', 'apply-kf-values'])

const groups = PARAM_GROUPS
const baseValues = initParamValues()
const timelineRef = ref(null)
const activeGroup = ref(groups[0]?.key || 'mouth')

const activeGroupObj = computed(() => groups.find(g => g.key === activeGroup.value))
const uniqueFrames = computed(() => props.kf.getUniqueFramePositions())

const scrubberPercent = computed(() => {
  if (props.kf.totalFrames.value === 0) return 0
  return (props.kf.currentFrame.value / props.kf.totalFrames.value) * 100
})

function getDisplayValue(paramKey) {
  return props.values[paramKey] ?? baseValues[paramKey] ?? 0
}

function onChangeParam(p, value) {
  emit('set-param', p.key, value)
  if (!props.kf.isPlaying.value) {
    props.kf.setKeyframe(p.key, props.kf.currentFrame.value, value)
  }
}

function toggleKeyframe(paramKey) {
  if (props.kf.isPlaying.value) return
  const frame = Math.floor(props.kf.currentFrame.value)
  if (props.kf.hasKeyframe(paramKey, frame)) {
    props.kf.removeKeyframe(paramKey, frame)
  } else {
    const val = props.values[paramKey] ?? baseValues[paramKey] ?? 0
    props.kf.setKeyframe(paramKey, frame, val)
  }
}

function seekTimeline(e) {
  if (props.kf.isPlaying.value) return
  const rect = timelineRef.value.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  props.kf.goToFrame(Math.round(ratio * props.kf.totalFrames.value))
  const vals = props.kf.getAllValuesAtFrame(props.kf.currentFrame.value, baseValues)
  emit('apply-kf-values', vals)
}

function onPlay() {
  props.kf.play((frame) => {
    const vals = props.kf.getAllValuesAtFrame(frame, baseValues)
    emit('apply-kf-values', vals)
  })
}

function onStop() {
  props.kf.stop()
  emit('apply-kf-values', props.kf.getAllValuesAtFrame(0, baseValues))
}

function onClear() {
  props.kf.clearAll()
  emit('apply-kf-values', baseValues)
}

function precision(step) {
  const s = String(step)
  const i = s.indexOf('.')
  return i === -1 ? 0 : s.length - i - 1
}
</script>

<style scoped>
.bottom-bar {
  background: #16213e; border-top: 1px solid #0f3460;
  display: flex; flex-direction: column; flex-shrink: 0;
  user-select: none;
}

/* Controls row */
.bb-controls {
  display: flex; align-items: center; padding: 4px 12px; gap: 4px;
  border-bottom: 1px solid #0f3460; flex-shrink: 0;
}
.bb-btns { display:flex; gap:2px; }
.bb-btns :deep(.arco-btn) { min-width:26px; padding:0 4px; }
.bb-label { color: #999; font-size: 12px; white-space: nowrap; }
.bb-info { color: #ccc; font-size: 12px; white-space: nowrap; font-variant-numeric:tabular-nums; }
.bb-info b { color: #e94560; }
.bb-spacer { flex: 1; }

/* Timeline */
.bb-timeline { padding: 5px 24px; flex-shrink: 0; cursor: pointer; }
.bb-track {
  position: relative; height: 18px; background: #1a1a3e;
  border-radius: 9px; border: 1px solid #0f3460;
}
.bb-fill {
  position: absolute; left: 0; top: 0; height: 100%;
  background: rgba(233,69,96,0.1); border-radius: 9px;
  pointer-events: none;
}
.bb-playhead {
  position: absolute; top: -4px; bottom: -4px; width: 3px;
  background: #e94560; border-radius: 2px; pointer-events: none;
  transform: translateX(-1.5px); z-index: 2;
}
.bb-dot {
  position: absolute; top: 50%; width: 7px; height: 7px;
  background: #e94560; border-radius: 50%; pointer-events: none;
  transform: translate(-50%, -50%); z-index: 1;
}

/* Parameter groups */
.bb-params {
  border-top: 1px solid #0f3460;
  flex-shrink: 0;
}
.bb-group-tabs {
  display: flex; padding: 4px 12px; gap: 2px; border-bottom: 1px solid #0f3460;
}
.bb-tab {
  color: #888; font-size: 12px; padding: 4px 12px; cursor: pointer;
  border-radius: 4px; transition: all 0.15s;
}
.bb-tab:hover { color: #ccc; background: rgba(255,255,255,0.04); }
.bb-tab.active { color: #e94560; background: rgba(233,69,96,0.1); }

.bb-sliders {
  padding: 6px 12px; display: flex; flex-wrap: wrap; gap: 4px 12px;
  max-height: 100px; overflow-y: auto;
}
.bb-param-row {
  display: flex; align-items: center; width: calc(33.33% - 8px); min-width: 260px;
}
.bb-param-label {
  color: #999; font-size: 12px; width: 56px; flex-shrink: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bb-diamond {
  font-size: 14px; cursor: pointer; color: #555; padding: 2px;
  transition: color 0.15s; flex-shrink: 0;
}
.bb-diamond.active { color: #e94560; }
.bb-diamond:hover { color: #e94560; }

/* Footer */
.bb-footer {
  display: flex; align-items: center; padding: 4px 12px;
  border-top: 1px solid #0f3460; gap: 10px; flex-shrink: 0;
}
.bb-motion-info {
  display: flex; align-items: center; gap: 6px; margin-left: auto;
}
.bb-motion-info span { color: #999; font-size: 12px; }
</style>
