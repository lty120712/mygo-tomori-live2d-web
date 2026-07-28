<template>
  <div class="bottom-bar">
    <div class="bb-controls">
      <div class="bb-btns">
        <a-button size="mini" title="跳到开头" @click="kf.goToStart()">|<</a-button>
        <a-button size="mini" title="上一帧" @click="kf.goToFrame(kf.currentFrame.value - 1)">&#9664;</a-button>
        <a-button v-if="!kf.isPlaying.value" size="mini" type="primary" title="播放" @click="onPlay">&#9654;</a-button>
        <a-button v-else size="mini" status="warning" title="暂停" @click="onPause">&#9646;&#9646;</a-button>
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
      <a-button
        v-if="recorder.canRecord.value"
        size="mini"
        :type="recorder.isRecording.value ? 'danger' : 'outline'"
        :title="recorder.isRecording.value ? '停止录制' : '开始录制 (自动播放)'"
        @click="onRecordToggle"
      >{{ recorder.isRecording.value ? '⏹ 录制中' : '⏺ 录制' }}</a-button>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-label">时长</span>
      <a-input-number
        :model-value="kf.duration.value"
        :min="0.5" :max="600" :step="0.5"
        :precision="1"
        size="mini" style="width:72px"
        @update:model-value="v => kf.setDuration(v)"
      />
      <span class="bb-label">FPS</span>
      <a-input-number
        :model-value="kf.fps.value"
        :min="1" :max="60" :step="1"
        size="mini" style="width:58px"
        @update:model-value="v => kf.fps.value = v"
      />
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-info">帧 <b>{{ Math.floor(kf.currentFrame.value) }}</b> / {{ kf.totalFrames.value }}</span>
      <span class="bb-info">{{ kf.currentTime.value.toFixed(2) }}s</span>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <a-button size="mini" @click="kf.goToPrevKeyframe()">上一关键帧</a-button>
      <a-input-number
        :model-value="Math.floor(kf.currentFrame.value)"
        :min="0" :max="kf.totalFrames.value"
        size="mini" style="width:68px"
        @update:model-value="kf.goToFrame($event)"
      />
      <a-button size="mini" @click="kf.goToNextKeyframe()">下一关键帧</a-button>
      <div class="bb-spacer"></div>
      <input ref="audioInputRef" type="file" accept="audio/*" style="display:none" @change="onAudioSelected" />
      <a-button size="mini" title="加载音频" @click="audioInputRef.click()">&#9835;</a-button>
      <span v-if="audioName" class="bb-info" :title="audioName">{{ audioName }}</span>
      <span v-else class="bb-label">无音频</span>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
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
          :key="'kf-' + pos"
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
        <a-tooltip
          v-for="pos in motionEventFrames"
          :key="'ev-m-' + pos"
          :content="'动作事件 · 帧 ' + pos + ' · ' + (pos / kf.fps.value).toFixed(2) + 's'"
          position="bottom"
          mini
        >
          <div
            class="bb-kf-dot bb-ev-motion-marker"
            :style="{ left: ((pos / kf.totalFrames.value) * 100) + '%' }"
          ></div>
        </a-tooltip>
        <a-tooltip
          v-for="pos in exprEventFrames"
          :key="'ev-e-' + pos"
          :content="'表情事件 · 帧 ' + pos + ' · ' + (pos / kf.fps.value).toFixed(2) + 's'"
          position="bottom"
          mini
        >
          <div
            class="bb-kf-dot bb-ev-expr-marker"
            :style="{ left: ((pos / kf.totalFrames.value) * 100) + '%' }"
          ></div>
        </a-tooltip>
      </div>
    </div>

    <div class="bb-events">
      <span class="bb-row-label">事件</span>
      <div class="bb-ev-track" @click="onEventTrackClick">
        <a-tooltip
          v-for="(ev, i) in kf.events"
          :key="i"
          :content="ev.name + (ev.type === 'motion' ? ' · ' + (props.motionDurations?.[ev.name] || ev.duration || 2).toFixed(1) + 's' : '') + ' (点击删除)'"
          position="top"
          mini
        >
          <div
            class="bb-ev-bar"
            :class="'ev-' + ev.type"
            :style="eventBarStyle(ev)"
            @click.stop="kf.removeEvent(i)"
          >{{ ev.name }}</div>
        </a-tooltip>
      </div>
    </div>
    <div v-if="kf.events.length" class="bb-ev-footer">
      <a-button size="mini" status="danger" @click="clearEvents">清除全部事件</a-button>
    </div>
    <div v-if="showEventPicker" class="bb-ev-picker">
      <span class="bb-ev-pick-label">在帧 {{ pendingEventFrame }} 添加：</span>
      <div class="bb-ev-pick-row">
        <a-select
          :model-value="eventPickName"
          size="mini"
          style="width:150px"
          placeholder="-- 动作 --"
          allow-search
          @change="addMotionEvent"
        >
          <a-option v-for="g in motionGroups" :key="g" :value="g">{{ g }}</a-option>
        </a-select>
        <a-select
          :model-value="eventPickExpr"
          size="mini"
          style="width:150px"
          placeholder="-- 表情 --"
          allow-search
          @change="addExpressionEvent"
        >
          <a-option v-for="e in expressionIds" :key="e" :value="e">{{ e }}</a-option>
        </a-select>
        <a-button size="mini" @click="showEventPicker = false">取消</a-button>
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
            style="width:140px;flex-shrink:0;margin:0 4px;"
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
        <span class="bb-motion-name">{{ motionLabel }}</span>
        <a-progress :percent="motionProgress / 100" size="small" color="#e94560" :show-text="false" style="width:100px" />
        <span class="bb-motion-time">{{ motionRemain }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { PARAM_GROUPS, initParamValues } from '../params.js'
import { useRecorder } from '../composables/useRecorder.js'

const recorder = useRecorder()

const props = defineProps({
  values: { type: Object, required: true },
  kf: { type: Object, required: true },
  motionGroups: { type: Array, default: () => [] },
  expressionIds: { type: Array, default: () => [] },
  motionDurations: { type: Object, default: () => ({}) },
  mouseTrackEnabled: { type: Boolean, default: true },
  motionProgress: { type: Number, default: 0 },
  motionLabel: { type: String, default: '' },
  motionRemain: { type: String, default: '' },
})

const emit = defineEmits(['set-param', 'reset-group', 'reset-all', 'update:mouseTrackEnabled', 'apply-kf-values', 'trigger-motion', 'trigger-expression'])

const groups = PARAM_GROUPS
const baseValues = initParamValues()
const activeGroup = ref(groups[0]?.key || 'mouth')

const activeGroupObj = computed(() => groups.find(g => g.key === activeGroup.value))
const uniqueFrames = computed(() => props.kf.getUniqueFramePositions())
const motionEventFrames = computed(() => props.kf.events.filter(e => e.type === 'motion').map(e => e.frame).filter((v, i, a) => a.indexOf(v) === i))
const exprEventFrames = computed(() => props.kf.events.filter(e => e.type === 'expression').map(e => e.frame).filter((v, i, a) => a.indexOf(v) === i))

const audioInputRef = ref(null)
const audioName = ref('')
let audioEl = null

const showEventPicker = ref(false)
const eventPickName = ref('')
const eventPickExpr = ref('')
const pendingEventFrame = ref(0)

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
  if (audioEl && !props.kf.isPlaying.value) {
    audioEl.currentTime = frame / props.kf.fps.value
  }
  const vals = props.kf.getAllValuesAtFrame(props.kf.currentFrame.value, baseValues)
  emit('apply-kf-values', vals)
}

let triggeredByPlay = new Set()

function onPlay() {
  triggeredByPlay = new Set()
  if (audioEl) { audioEl.currentTime = props.kf.currentFrame.value / props.kf.fps.value; audioEl.play() }
  props.kf.play((frame) => {
    const vals = props.kf.getKeyframedValuesAtFrame(frame)
    if (Object.keys(vals).length > 0) emit('apply-kf-values', vals)

    const f = Math.round(frame)
    for (let i = 0; i < props.kf.events.length; i++) {
      const ev = props.kf.events[i]
      if (triggeredByPlay.has(i)) continue
      if (ev.type === 'expression' && ev.frame === f) {
        triggeredByPlay.add(i)
        emit('trigger-expression', ev.name)
      }
      if (ev.type === 'motion' && f >= ev.frame) {
        triggeredByPlay.add(i)
        emit('trigger-motion', ev.name)
      }
    }
  }, () => {
    if (recorder.isRecording.value) recorder.stop()
  })
}

function onPause() {
  if (audioEl) audioEl.pause()
  props.kf.pause()
}

function onStop() {
  if (recorder.isRecording.value) recorder.stop()
  if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
  props.kf.stop()
  emit('apply-kf-values', props.kf.getAllValuesAtFrame(0, baseValues))
}

function onAudioSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (audioEl) { audioEl.pause(); URL.revokeObjectURL(audioEl.src) }
  audioEl = new Audio(URL.createObjectURL(file))
  audioEl.volume = 0.8
  audioEl.addEventListener('loadedmetadata', () => {
    if (audioEl.duration && isFinite(audioEl.duration)) {
      props.kf.setDuration(Math.ceil(audioEl.duration * 2) / 2)
    }
  })
  audioEl.addEventListener('ended', () => {
    if (props.kf.isPlaying.value && !props.kf.isLooping.value) onStop()
  })
  audioName.value = file.name
  e.target.value = ''
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

function eventBarStyle(ev) {
  const left = (ev.frame / props.kf.totalFrames.value) * 100
  if (ev.type === 'expression') {
    return { left: left + '%' }
  }
  const dur = props.motionDurations?.[ev.name] || ev.duration || 2
  const width = (dur * props.kf.fps.value / props.kf.totalFrames.value) * 100
  return { left: left + '%', width: Math.max(width, 2) + '%' }
}

function onEventTrackClick(e) {
  if (props.kf.isPlaying.value) return
  pendingEventFrame.value = Math.floor(props.kf.currentFrame.value)
  showEventPicker.value = true
}

function addMotionEvent(name) {
  if (!name) return
  const dur = props.motionDurations?.[name] || 2
  const ok = props.kf.addEvent('motion', name, pendingEventFrame.value, dur)
  if (!ok) {
    alert('该时间段与已有动作事件重叠，无法添加')
  }
  showEventPicker.value = false
  eventPickName.value = ''
}

function addExpressionEvent(name) {
  if (!name) return
  props.kf.addEvent('expression', name, pendingEventFrame.value, 0)
  showEventPicker.value = false
  eventPickExpr.value = ''
}

function clearEvents() {
  props.kf.events.splice(0, props.kf.events.length)
}

function onRecordToggle() {
  if (recorder.isRecording.value) {
    recorder.stop()
    onStop()
    return
  }
  const cvs = document.getElementById('live2d-canvas')
  if (!cvs) return
  recorder.start(cvs, audioEl)
  if (audioEl && audioEl.paused) audioEl.currentTime = props.kf.currentFrame.value / props.kf.fps.value
  if (!props.kf.isPlaying.value) onPlay()
}

function onKeydown(e) {
  if (e.code === 'Space' && e.target === document.body) {
    e.preventDefault()
    props.kf.isPlaying.value ? onPause() : onPlay()
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

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
  border-bottom: 1px solid #0f3460; flex-shrink: 0; flex-wrap: wrap;
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

.bb-kf-dot.bb-ev-motion-marker {
  width: 6px; height: 6px; background: #e94560; border-color: #e94560;
}
.bb-kf-dot.bb-ev-expr-marker {
  width: 6px; height: 6px; background: #2dd4bf; border-color: #2dd4bf;
}

/* Events row */
.bb-events {
  display: flex; align-items: center; padding: 2px 24px 2px 0; flex-shrink: 0; gap: 8px;
}
.bb-ev-track {
  position: relative; height: 20px; flex: 1; background: #1a1a3e;
  border-radius: 4px; border: 1px solid #0f3460; cursor: pointer;
}
.bb-ev-track:hover { border-color: #e94560; }
.bb-ev-bar {
  position: absolute; top: 2px; height: 16px; border-radius: 3px;
  display: flex; align-items: center; padding: 0 6px; font-size: 10px;
  overflow: hidden; white-space: nowrap; cursor: pointer;
  color: #fff; user-select: none; min-width: 6px; font-weight: 500;
}
.bb-ev-bar.ev-motion { background: linear-gradient(135deg, #e94560, #c0392b); }
.bb-ev-bar.ev-motion:hover { filter: brightness(0.8); }
.bb-ev-bar.ev-expression {
  width: 8px !important; min-width: 8px !important;
  background: #f5a623; border: 2px solid #fff;
  border-radius: 50%; top: 5px; height: 8px; padding: 0; font-size: 0;
}
.bb-ev-clear { flex-shrink: 0; font-size: 11px; }

.bb-ev-footer {
  padding: 2px 24px 2px 58px; flex-shrink: 0;
}

.bb-ev-picker {
  padding: 6px 24px 6px 58px; flex-shrink: 0;
  border-bottom: 1px solid #0f3460; background: rgba(0,0,0,0.15);
}
.bb-ev-pick-label { color: #e94560; font-size: 12px; display: block; margin-bottom: 4px; }
.bb-ev-pick-row { display: flex; align-items: center; gap: 8px; }
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
  display: flex; align-items: center; width: 280px; flex-shrink: 0;
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
.bb-motion-name { color: #e94560; font-size: 12px; font-weight: 500; }
.bb-motion-time { color: #e94560; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
