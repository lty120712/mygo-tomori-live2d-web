<template>
  <div class="keyframe-panel">
    <h3 class="panel-title">关键帧动画</h3>

    <div class="kf-settings">
      <div class="kf-row">
        <span class="kf-label">时长(s)</span>
        <a-input-number
          :model-value="kf.duration.value"
          :min="0.1" :max="60" :step="0.5"
          size="mini" style="width:68px"
          @change="kf.setDuration($event)"
        />
        <span class="kf-label">FPS</span>
        <a-input-number
          :model-value="kf.fps.value"
          :min="1" :max="60" :step="1"
          size="mini" style="width:60px"
          @change="v => kf.fps.value = v"
        />
      </div>
    </div>

    <div class="kf-controls">
      <a-button size="mini" title="跳到开头" @click="kf.goToStart()">|<</a-button>
      <a-button size="mini" title="上一帧" @click="kf.goToFrame(kf.currentFrame.value - 1)">&#9664;</a-button>
      <a-button v-if="!kf.isPlaying.value" size="mini" type="primary" title="播放" @click="onPlay">&#9654;</a-button>
      <a-button v-else size="mini" status="warning" title="暂停" @click="kf.pause()">&#9646;&#9646;</a-button>
      <a-button size="mini" title="下一帧" @click="kf.goToFrame(kf.currentFrame.value + 1)">&#9654;</a-button>
      <a-button size="mini" title="跳到末尾" @click="kf.goToEnd()">>|</a-button>
      <a-button size="mini" title="停止" @click="kf.stop(); $emit('apply-kf-values', kf.getAllValuesAtFrame(0, baseValues))">&#9632;</a-button>
    </div>

    <div class="kf-time-info">
      <span>帧: {{ Math.floor(kf.currentFrame.value) }} / {{ kf.totalFrames.value }}</span>
      <span>{{ kf.currentTime.value.toFixed(2) }}s</span>
    </div>

    <div class="kf-timeline" ref="timelineRef" @click="seekTimeline">
      <div class="kf-track">
        <div class="kf-fill" :style="{ width: scrubberPercent + '%' }"></div>
        <div
          v-for="pos in uniqueFrames"
          :key="pos"
          class="kf-dot"
          :style="{ left: (pos / kf.totalFrames.value * 100) + '%' }"
        ></div>
        <div class="kf-playhead" :style="{ left: scrubberPercent + '%' }"></div>
      </div>
    </div>

    <div class="kf-frame-nav">
      <a-button size="mini" @click="kf.goToPrevKeyframe()">上一关键帧</a-button>
      <a-input-number
        :model-value="Math.floor(kf.currentFrame.value)"
        :min="0" :max="kf.totalFrames.value"
        size="mini" style="width:60px"
        @change="kf.goToFrame($event)"
      />
      <a-button size="mini" @click="kf.goToNextKeyframe()">下一关键帧</a-button>
      <a-button size="mini" status="danger" @click="onClearAll">清除全部</a-button>
    </div>

    <a-divider style="margin:6px 0; border-color:#0f3460" />

    <div class="kf-section-title">参数控制</div>

    <a-collapse :default-active-key="defaultKeys" :bordered="false" expand-icon-position="right">
      <a-collapse-item v-for="group in groups" :key="group.key" :header="group.header">
        <div class="reset-row">
          <span class="reset-link" @click="$emit('reset-group', group.key)">复位{{ group.header }}</span>
        </div>
        <div v-for="p in group.params" :key="p.key" class="param-row">
          <span class="param-label">{{ p.label }}</span>
          <a-slider
            :model-value="getDisplayValue(p.key)"
            :min="p.min"
            :max="p.max"
            :step="p.step"
            :disabled="kf.isPlaying.value"
            style="flex:1;margin:0 6px;"
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
            style="width:66px"
            @change="v => v != null && onChangeParam(p, v)"
          />
          <span
            class="kf-diamond"
            :class="{ active: kf.hasKeyframe(p.key, kf.currentFrame.value) }"
            title="关键帧 (点击切换)"
            @click="toggleKeyframe(p.key)"
          >&#9670;</span>
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
import { computed, ref } from 'vue'
import { PARAM_GROUPS, DEFAULT_ACTIVE_KEYS, initParamValues } from '../params.js'

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
const defaultKeys = DEFAULT_ACTIVE_KEYS
const baseValues = initParamValues()
const timelineRef = ref(null)

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

function onClearAll() {
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
.keyframe-panel {
  width: 280px; background: #16213e; border-left: 1px solid #0f3460;
  padding: 12px 0; display: flex; flex-direction: column; flex-shrink: 0;
  overflow-y: auto;
}
.panel-title {
  font-size: 15px; padding: 0 16px 12px; margin: 0; color: #eee;
  flex-shrink: 0; border-bottom: 1px solid #0f3460;
}
.kf-section-title {
  font-size: 13px; padding: 4px 16px 2px; color: #aaa; flex-shrink: 0;
}

/* Settings */
.kf-settings { padding: 8px 16px 4px; flex-shrink: 0; }
.kf-row { display:flex; align-items:center; gap:4px; }
.kf-label { color: #999; font-size: 12px; min-width:38px; }

/* Controls */
.kf-controls { padding: 6px 16px; display:flex; gap:4px; flex-shrink: 0; }
.kf-controls :deep(.arco-btn) { min-width:28px; padding:0 6px; }

/* Time info */
.kf-time-info { padding: 2px 16px 4px; display:flex; justify-content:space-between; flex-shrink: 0; }
.kf-time-info span { color: #bbb; font-size: 12px; font-variant-numeric:tabular-nums; }

/* Timeline */
.kf-timeline { padding: 4px 24px 2px; flex-shrink: 0; cursor: pointer; }
.kf-track {
  position: relative; height: 16px; background: #1a1a3e;
  border-radius: 8px; border: 1px solid #0f3460;
}
.kf-fill {
  position: absolute; left: 0; top: 0; height: 100%;
  background: rgba(233,69,96,0.15); border-radius: 8px;
  pointer-events: none; transition: width 0.05s linear;
}
.kf-playhead {
  position: absolute; top: -3px; bottom: -3px; width: 3px;
  background: #e94560; border-radius: 2px; pointer-events: none;
  transform: translateX(-1.5px); z-index: 2;
}
.kf-dot {
  position: absolute; top: 50%; width: 6px; height: 6px;
  background: #e94560; border-radius: 50%; pointer-events: none;
  transform: translate(-50%, -50%); z-index: 1;
}

/* Frame nav */
.kf-frame-nav { padding: 6px 16px; display:flex; gap:4px; align-items:center; flex-shrink: 0; }

/* Params */
.keyframe-panel :deep(.arco-collapse) { border: none; overflow-y:auto; }
.keyframe-panel :deep(.arco-collapse-item) { border-color: #0f3460; }
.keyframe-panel :deep(.arco-collapse-item-header) { background: #16213e; color: #ddd; font-size: 13px; padding: 10px 16px; }
.keyframe-panel :deep(.arco-collapse-item-content) { background: #16213e; padding: 0 16px 12px; }
.keyframe-panel :deep(.arco-collapse-item-content-box) { padding: 0; }
.param-row { display:flex; align-items:center; margin-bottom:6px; }
.param-label { color: #999; font-size: 12px; width: 58px; flex-shrink: 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.reset-row { margin-bottom: 6px; }
.reset-link { color: #e94560; font-size: 12px; cursor: pointer; user-select: none; }
.reset-link:hover { color: #ff6b81; }

/* Diamond keyframe button */
.kf-diamond {
  font-size: 14px; cursor: pointer; color: #555; user-select: none;
  padding: 2px; transition: color 0.15s;
}
.kf-diamond.active { color: #e94560; }
.kf-diamond:hover { color: #e94560; }

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
