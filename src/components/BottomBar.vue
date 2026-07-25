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
      <a-button
        size="mini"
        :type="kf.isLooping.value ? 'primary' : 'outline'"
        title="循环播放"
        @click="kf.isLooping.value = !kf.isLooping.value"
      >&#8635;</a-button>
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

    <div class="bb-timeline">
      <span class="bb-row-label">时间轴</span>
      <a-slider
        :model-value="Math.floor(kf.currentFrame.value)"
        :min="0"
        :max="kf.totalFrames.value"
        :step="1"
        :disabled="kf.isPlaying.value"
        :show-tooltip="true"
        :format-tooltip="tooltipFormat"
        @update:model-value="v => { kf.currentFrame.value = v }"
        @change="onSliderSeek"
      />
    </div>
    <div class="bb-keyframes">
      <span class="bb-row-label">关键帧</span>
      <div class="bb-kf-track">
        <a-tooltip
          v-for="pos in uniqueFrames"
          :key="pos"
          :content="'帧 ' + pos + ' · ' + (pos / kf.fps.value).toFixed(2) + 's · ' + kfEasingLabel(pos)"
          position="bottom"
          mini
        >
          <div
            class="bb-kf-dot"
            :class="'easing-' + kfDominantEasing(pos)"
            :style="{ left: ((pos / kf.totalFrames.value) * 100) + '%' }"
            @click.stop="kf.cycleEasingAtFrame(pos)"
          ></div>
        </a-tooltip>
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
            :title="kf.hasKeyframe(p.key, kf.currentFrame.value) ? '关键帧 · ' + kf.getEasingLabel(kf.getKfEasing(p.key, kf.currentFrame.value)) + ' (点击移除)' : '添加关键帧'"
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
const activeGroup = ref(groups[0]?.key || 'mouth')

const activeGroupObj = computed(() => groups.find(g => g.key === activeGroup.value))
const uniqueFrames = computed(() => props.kf.getUniqueFramePositions())

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

function tooltipFormat(frame) {
  const t = frame / props.kf.fps.value
  return '帧 ' + Math.round(frame) + ' · ' + t.toFixed(2) + 's'
}

function onSliderSeek(frame) {
  props.kf.goToFrame(frame)
  const vals = props.kf.getAllValuesAtFrame(props.kf.currentFrame.value, baseValues)
  emit('apply-kf-values', vals)
}

function onPlay() {
  props.kf.play((frame) => {
    const vals = props.kf.isLooping.value
      ? props.kf.getKeyframedValuesAtFrame(frame)
      : props.kf.getAllValuesAtFrame(frame, baseValues)
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

function kfDominantEasing(frame) {
  const f = Math.round(frame)
  for (const paramKey of props.kf.getAllKeyframedParams()) {
    const easing = props.kf.getKfEasing(paramKey, f)
    if (easing !== 'linear') return easing
  }
  return 'linear'
}

function kfEasingLabel(frame) {
  return props.kf.getEasingLabel(kfDominantEasing(frame))
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
.bb-timeline {
  display: flex; align-items: center; padding: 4px 24px 2px 0; flex-shrink: 0; gap: 8px;
}
.bb-row-label {
  color: #888; font-size: 11px; flex-shrink: 0; width: 42px; text-align: right;
}
.bb-timeline :deep(.arco-slider) { padding: 0; flex: 1; }
.bb-timeline :deep(.arco-slider-road) {
  background: #1a1a3e; border: 1px solid #0f3460; height: 10px;
}
.bb-timeline :deep(.arco-slider-bar) { background: #e94560; height: 10px; }
.bb-timeline :deep(.arco-slider-button) {
  width: 16px; height: 16px; background: #fff;
  border: 2px solid #165DFF; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.bb-timeline :deep(.arco-tooltip-content) {
  background: #1a1a3e; border: 1px solid #0f3460; color: #eee;
  font-size: 12px; font-variant-numeric: tabular-nums;
}
.bb-timeline :deep(.arco-tooltip-arrow) { display: none; }

/* Keyframe dots row */
.bb-keyframes {
  display: flex; align-items: center; padding: 2px 24px 6px 0; flex-shrink: 0; gap: 8px;
}
.bb-kf-track {
  position: relative; height: 8px; flex: 1;
}
.bb-kf-dot {
  position: absolute; top: 50%; width: 10px; height: 10px;
  background: #fff; border: 2px solid #e94560; border-radius: 50%;
  cursor: pointer; transform: translate(-50%, -50%);
}

.bb-kf-dot.easing-linear {
  border-radius: 50%;
}

.bb-kf-dot.easing-easeIn {
  border-radius: 2px;
}

.bb-kf-dot.easing-easeOut {
  border-radius: 2px;
  transform: translate(-50%, -50%) rotate(45deg);
}

.bb-kf-dot.easing-easeInOut {
  clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%);
  border-radius: 0;
}
/* slightly larger hit area for tooltip */
.bb-kf-track :deep(.arco-tooltip-content) {
  background: #1a1a3e; border: 1px solid #0f3460; color: #eee;
  font-size: 12px; font-variant-numeric: tabular-nums;
}
.bb-kf-track :deep(.arco-tooltip-arrow) { display: none; }

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
