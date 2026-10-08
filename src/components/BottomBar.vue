<template>
  <div class="bottom-bar">
    <div class="bb-controls">
      <div class="bb-btns">
        <a-button size="mini" title="跳到开头" @click="onSliderSeek(0)">|<</a-button>
        <a-button size="mini" title="上一帧" @click="onSliderSeek(kf.currentFrame.value - 1)">&#9664;</a-button>
        <a-button v-if="!kf.isPlaying.value" size="mini" type="primary" title="播放" @click="onPlay">&#9654;</a-button>
        <a-button v-else size="mini" status="warning" title="暂停" @click="onPause">&#9646;&#9646;</a-button>
        <a-button size="mini" title="下一帧" @click="onSliderSeek(kf.currentFrame.value + 1)">&#9654;</a-button>
        <a-button size="mini" title="跳到末尾" @click="onSliderSeek(kf.totalFrames.value)">>|</a-button>
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
      <a-select
        v-if="recorder.canRecord.value"
        :model-value="recordMode"
        size="mini"
        style="width:106px"
        :disabled="recorder.isRecording.value"
        :title="'导出画面比例：' + (recordMode === 'portrait' ? '竖屏 9:16（画布上会显示取景框）' : '跟随画布')"
        @change="v => $emit('update:recordMode', v)"
      >
        <a-option value="canvas">跟随画布</a-option>
        <a-option value="portrait">竖屏 9:16</a-option>
      </a-select>
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
        @update:model-value="v => kf.setFps(v)"
      />
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-info">帧 <b>{{ Math.floor(kf.currentFrame.value) }}</b> / {{ kf.totalFrames.value }}</span>
      <span class="bb-info">{{ kf.currentTime.value.toFixed(2) }}s</span>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <a-button size="mini" @click="onKeyframeSeek('prev')">上一关键帧</a-button>
      <a-input-number
        :model-value="Math.floor(kf.currentFrame.value)"
        :min="0" :max="kf.totalFrames.value"
        size="mini" style="width:68px"
        @update:model-value="onSliderSeek($event)"
      />
      <a-button size="mini" @click="onKeyframeSeek('next')">下一关键帧</a-button>
      <div class="bb-spacer"></div>
      <input ref="audioInputRef" type="file" accept="audio/*" style="display:none" @change="onAudioSelected" />
      <a-button size="mini" title="加载音频" @click="audioInputRef.click()">&#9835;</a-button>
      <span v-if="audioName" class="bb-info" :title="audioName">{{ audioName }}</span>
      <span v-else class="bb-label">无音频</span>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <input ref="projectInputRef" type="file" accept="application/json,.json" style="display:none" @change="onProjectSelected" />
      <a-button size="mini" title="导出关键帧与事件为 JSON" @click="exportProject">导出工程</a-button>
      <a-button size="mini" title="从 JSON 恢复关键帧与事件" @click="projectInputRef.click()">导入工程</a-button>
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
      <div class="bb-ev-track" ref="evTrackRef" @click="onEventTrackClick">
        <a-tooltip
          v-for="(ev, i) in kf.events"
          :key="i"
          :content="eventTooltip(ev, i)"
          position="top"
          mini
        >
          <div
            class="bb-ev-bar"
            :class="[
              'ev-' + ev.type,
              {
                'is-dragging': dragIndex === i,
                'is-invalid': dragIndex === i && !dragValid,
                'is-conflict': conflictedIndexes.has(i) && dragIndex !== i,
              },
            ]"
            :style="eventBarStyle(ev, i)"
            @pointerdown="onBarPointerDown($event, i)"
            @click.stop="onBarClick(i)"
          >{{ ev.name }}</div>
        </a-tooltip>
      </div>
    </div>
    <div v-if="kf.events.length" class="bb-ev-footer">
      <a-button size="mini" status="danger" @click="clearEvents">清除全部事件</a-button>
    </div>
    <div v-if="showEventPicker" class="bb-ev-picker">
      <div class="bb-ev-pick-head">
        <span class="bb-ev-pick-label">在帧 {{ pendingEventFrame }}（{{ (pendingEventFrame / kf.fps.value).toFixed(2) }}s）添加</span>
        <template v-if="pendingBlocked">
          <span class="bb-ev-pick-warn">该帧在「{{ pendingBlocked.name }}」区间内（第 {{ pendingBlocked.start }}–{{ Math.ceil(pendingBlocked.end) }} 帧）</span>
          <a-button size="mini" type="outline" @click="movePendingToFree">插入到第 {{ freeFrame }} 帧</a-button>
        </template>
        <span v-else class="bb-ev-pick-ok">位置空闲，从这里起可放 {{ (freeFrames / kf.fps.value).toFixed(1) }}s 以内的动作</span>
      </div>
      <div class="bb-ev-pick-row">
        <a-select
          :model-value="eventPickName"
          size="mini"
          style="width:220px"
          placeholder="-- 动作 --"
          allow-search
          @change="addMotionEvent"
        >
          <a-option v-for="g in motionGroups" :key="g" :value="g">
            <span style="float:left">{{ g }}</span>
            <span :style="optionDurStyle(g)">{{ formatSeconds(motionSeconds(g)) }}</span>
          </a-option>
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
      <div v-if="pickError" class="bb-ev-pick-error">
        {{ pickError }}
        <a-button size="mini" @click="movePendingToFree">放到第 {{ freeFrame }} 帧</a-button>
      </div>
    </div>
    <div v-if="hintMsg" class="bb-hint">{{ hintMsg }}</div>

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
      <a-button size="small" type="outline" title="把画面移回中央" @click="$emit('reset-view')">复位视图</a-button>
      <span class="bb-label">鼠标跟随</span>
      <a-switch size="small" :model-value="mouseTrackEnabled" @change="$emit('update:mouseTrackEnabled', $event)" />
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-label">背景</span>
      <a-color-picker
        :model-value="background.color"
        size="mini"
        :disabled="recorder.isRecording.value"
        @change="setColor"
      />
      <input ref="bgInputRef" type="file" accept="image/*" style="display:none" @change="onBgSelected" />
      <a-button size="mini" :disabled="recorder.isRecording.value" @click="bgInputRef.click()">上传图片</a-button>
      <template v-if="background.image">
        <span class="bb-info" :title="background.imageName">{{ background.imageName || '自定义图片' }}</span>
        <a-button size="mini" :disabled="recorder.isRecording.value" @click="clearImage">清除图片</a-button>
      </template>
      <a-button
        size="mini"
        :disabled="recorder.isRecording.value"
        title="清除图片并恢复默认绿幕"
        @click="reset"
      >重置背景</a-button>
      <a-divider direction="vertical" style="border-color:#0f3460;margin:0 6px" />
      <span class="bb-label">人物</span>
      <a-select
        :model-value="scale"
        size="mini"
        style="width:88px"
        :disabled="recorder.isRecording.value"
        title="人物缩放，不影响背景"
        @change="v => $emit('update:scale', v)"
      >
        <a-option v-for="p in SCALE_PRESETS" :key="p" :value="p">{{ p }}%</a-option>
      </a-select>
      <a-slider
        :model-value="scale"
        :min="10" :max="500" :step="5"
        :disabled="recorder.isRecording.value"
        style="width:110px;flex-shrink:0;margin:0 4px"
        @change="v => $emit('update:scale', v)"
      />
      <a-input-number
        :model-value="scale"
        :min="10" :max="500" :step="5"
        :hide-button="true"
        size="mini"
        style="width:66px"
        :disabled="recorder.isRecording.value"
        @change="v => v != null && $emit('update:scale', v)"
      />
      <span class="bb-label">%</span>
      <div v-if="motionLabel" class="bb-motion-info">
        <span class="bb-motion-name">{{ motionLabel }}</span>
        <a-progress :percent="motionProgress / 100" size="small" color="#e94560" :show-text="false" style="width:100px" />
        <span class="bb-motion-time">{{ motionRemain }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { PARAM_GROUPS, initParamValues } from '../params.js'
import { useRecorder } from '../composables/useRecorder.js'
import { ESTIMATED_MOTION_SECONDS, formatSeconds } from '../motions.js'
import { useBackground } from '../composables/useBackground.js'

const recorder = useRecorder()
const { background, setColor, setImageFile, clearImage, reset } = useBackground()

const SCALE_PRESETS = [50, 100, 125, 150, 200, 300]
const projectInputRef = ref(null)
const bgInputRef = ref(null)
const hintMsg = ref('')
let hintTimer = null

function showHint(msg) {
  hintMsg.value = msg
  clearTimeout(hintTimer)
  hintTimer = setTimeout(() => { hintMsg.value = '' }, 2000)
}

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
  motionPlaying: { type: Boolean, default: false },
  recordMode: { type: String, default: 'canvas' },
  scale: { type: Number, default: 100 },
  getViewRect: { type: Function, default: null },
})

const emit = defineEmits(['set-param', 'reset-group', 'reset-all', 'reset-view', 'update:mouseTrackEnabled', 'update:recordMode', 'update:scale', 'apply-kf-values', 'trigger-motion', 'trigger-expression'])

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
let audioMetaHandler = null
let audioEndedHandler = null

function onAudioSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (audioEl) {
    audioEl.pause()
    if (audioMetaHandler) audioEl.removeEventListener('loadedmetadata', audioMetaHandler)
    if (audioEndedHandler) audioEl.removeEventListener('ended', audioEndedHandler)
    URL.revokeObjectURL(audioEl.src)
  }
  audioEl = new Audio(URL.createObjectURL(file))
  audioEl.volume = 0.8
  audioMetaHandler = () => {
    if (audioEl && audioEl.duration && isFinite(audioEl.duration)) {
      props.kf.setDuration(Math.ceil(audioEl.duration * 2) / 2)
    }
  }
  audioEndedHandler = () => {
    if (props.kf.isPlaying.value && !props.kf.isLooping.value) onStop()
  }
  audioEl.addEventListener('loadedmetadata', audioMetaHandler)
  audioEl.addEventListener('ended', audioEndedHandler)
  audioName.value = file.name
  e.target.value = ''
}

onBeforeUnmount(() => {
  if (audioEl) {
    audioEl.pause()
    if (audioMetaHandler) audioEl.removeEventListener('loadedmetadata', audioMetaHandler)
    if (audioEndedHandler) audioEl.removeEventListener('ended', audioEndedHandler)
    URL.revokeObjectURL(audioEl.src)
    audioEl = null
  }
})

const showEventPicker = ref(false)
const eventPickName = ref('')
const eventPickExpr = ref('')
const pendingEventFrame = ref(0)
const pickError = ref('')
const evTrackRef = ref(null)

function getDisplayValue(paramKey) {
  return props.values[paramKey] ?? baseValues[paramKey] ?? 0
}

function onChangeParam(p, value) {
  emit('set-param', p.key, value)
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
  if (!Number.isFinite(Number(frame))) return
  props.kf.goToFrame(frame)
  if (audioEl && !props.kf.isPlaying.value) {
    audioEl.currentTime = props.kf.currentFrame.value / props.kf.fps.value
  }
  const vals = props.kf.getAllValuesAtFrame(props.kf.currentFrame.value, baseValues)
  emit('apply-kf-values', vals)
}

function onKeyframeSeek(direction) {
  if (direction === 'prev') props.kf.goToPrevKeyframe()
  else props.kf.goToNextKeyframe()
  onSliderSeek(props.kf.currentFrame.value)
}

let triggeredByPlay = new Set()
let lastEventFrame = -1

function syncPlaybackAudio() {
  if (!audioEl) return
  audioEl.currentTime = props.kf.currentFrame.value / props.kf.fps.value
  audioEl.play().catch(() => {})
}

function onPlay() {
  if (props.kf.isPlaying.value) return
  if (props.kf.currentFrame.value >= props.kf.totalFrames.value) props.kf.goToStart()
  triggeredByPlay = new Set()
  lastEventFrame = Math.ceil(props.kf.currentFrame.value) - 1
  syncPlaybackAudio()
  props.kf.play((frame) => {
    const vals = props.kf.getKeyframedValuesAtFrame(frame)
    if (Object.keys(vals).length > 0) emit('apply-kf-values', vals)

    const f = Math.floor(frame)
    for (let i = 0; i < props.kf.events.length; i++) {
      const ev = props.kf.events[i]
      if (triggeredByPlay.has(i)) continue
      // 检查本次经过的区间，卡顿或高 FPS 时跳过某一帧也不能漏掉表情。
      if (ev.type === 'expression' && ev.frame > lastEventFrame && ev.frame <= f) {
        triggeredByPlay.add(i)
        emit('trigger-expression', ev.name)
        continue
      }
      if (ev.type === 'motion' && f >= ev.frame) {
        const length = Math.max(1, eventSeconds(ev) * props.kf.fps.value)
        if (f >= ev.frame + length) {
          // 播放位置已经在动作区间之后，说明起播时已错过，直接作废
          triggeredByPlay.add(i)
          continue
        }
        // 上一个动作还没结束就先不触发，下一帧继续等。
        // 否则事件会被标记成已触发，却因为动作冲突一次都没真正播出来
        if (props.motionPlaying) continue
        triggeredByPlay.add(i)
        emit('trigger-motion', ev.name)
      }
    }
    lastEventFrame = f
  }, onStop, () => {
    triggeredByPlay = new Set()
    lastEventFrame = -1
    syncPlaybackAudio()
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
  emit('apply-kf-values', props.kf.getKeyframedValuesAtFrame(0))
}

function onClear() {
  onStop()
  props.kf.clearAll()
  showEventPicker.value = false
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

/* ---------- 动作时长与占用区间 ---------- */

/** 动作的真实时长（秒）。拿不到时用兜底值，只影响显示与占位估算 */
function motionSeconds(name) {
  const known = props.motionDurations?.[name]
  return Number.isFinite(known) && known > 0 ? known : ESTIMATED_MOTION_SECONDS
}

function eventSeconds(ev) {
  if (ev.type !== 'motion') return 0
  const stored = Number(ev.duration)
  return Number.isFinite(stored) && stored > 0 ? stored : motionSeconds(ev.name)
}

// 把事件里记的时长校正成动作文件里的真实时长，
// 否则事件条宽度、重叠判断和各处提示会互相打架
function syncEventDurations() {
  for (const ev of props.kf.events) {
    if (ev.type !== 'motion') continue
    const real = props.motionDurations?.[ev.name]
    if (Number.isFinite(real) && real > 0 && ev.duration !== real) ev.duration = real
  }
}

watch(() => props.motionDurations, syncEventDurations, { deep: true, immediate: true })

/** 互相重叠的动作事件下标（旧工程里用估算时长放下的会命中） */
const conflictedIndexes = computed(() => {
  const ranges = props.kf.getMotionRanges()
  const bad = new Set()
  for (let i = 0; i < ranges.length - 1; i++) {
    if (ranges[i].end > ranges[i + 1].start + 1e-6) {
      bad.add(ranges[i].index)
      bad.add(ranges[i + 1].index)
    }
  }
  return bad
})

/* ---------- 事件选择器 ---------- */

const pendingBlocked = computed(() => {
  const ranges = props.kf.getMotionRanges()
  return ranges.find(r => pendingEventFrame.value >= r.start && pendingEventFrame.value < r.end) || null
})

const freeFrame = computed(() => props.kf.findFreeFrame(pendingEventFrame.value))

/** 从最近的可插入位置起，到下一个动作区间之前还剩多少帧 */
const freeFrames = computed(() => {
  const start = freeFrame.value
  const next = props.kf.getMotionRanges().find(r => r.start >= start)
  const limit = next ? next.start : props.kf.totalFrames.value
  return Math.max(0, limit - start)
})

function movePendingToFree() {
  pendingEventFrame.value = freeFrame.value
  pickError.value = ''
}

// 下拉面板是 teleport 到 body 的，scoped 样式够不着，这里直接用行内样式
function optionDurStyle(name) {
  const over = motionSeconds(name) * props.kf.fps.value > freeFrames.value
  return {
    float: 'right',
    paddingLeft: '12px',
    fontVariantNumeric: 'tabular-nums',
    color: over ? '#f5a623' : '#94a3b8',
  }
}

/* ---------- 事件条渲染 ---------- */

function eventBarStyle(ev, index) {
  const frame = dragIndex.value === index ? dragFrame.value : ev.frame
  const left = (frame / props.kf.totalFrames.value) * 100
  if (ev.type === 'expression') return { left: left + '%' }
  const width = (eventSeconds(ev) * props.kf.fps.value / props.kf.totalFrames.value) * 100
  return { left: left + '%', width: Math.max(width, 2) + '%' }
}

function eventTooltip(ev, index) {
  if (ev.type === 'expression') {
    return ev.name + ' · 表情 · 帧 ' + ev.frame + '（点击删除）'
  }
  const start = dragIndex.value === index ? dragFrame.value : ev.frame
  const end = Math.round(start + eventSeconds(ev) * props.kf.fps.value)
  const text = ev.name + ' · ' + formatSeconds(eventSeconds(ev)) + ' · 第 ' + start + '–' + end + ' 帧'
  if (conflictedIndexes.value.has(index)) {
    return text + ' · ⚠ 与相邻动作重叠，播放时会被跳过，拖动可调整'
  }
  return text + ' · 拖动挪位置，点击删除'
}

/* ---------- 拖动调整位置 ---------- */

const dragIndex = ref(-1)
const dragFrame = ref(0)
const dragValid = ref(true)
let dragMoved = false
let suppressClick = false
let dragGrabOffset = 0
let dragLengthFrames = 0
let dragRect = null
let dragPxPerFrame = 1
let dragStartX = 0

/** 找不与其它动作重叠的落点：先试原地，不行就吸附到相邻区间的两端 */
function resolveDropFrame(target, ignoreIndex, lengthFrames) {
  const ranges = props.kf.getMotionRanges(ignoreIndex)
  const fits = (start) => {
    if (start < 0 || start + lengthFrames > props.kf.totalFrames.value + 1e-6) return false
    return !ranges.some(r => start < r.end - 1e-6 && start + lengthFrames > r.start + 1e-6)
  }
  if (fits(target)) return { frame: target, ok: true }

  const candidates = []
  for (const r of ranges) {
    candidates.push(Math.round(r.end), Math.round(r.start - lengthFrames))
  }
  const usable = candidates.filter(fits)
  if (usable.length === 0) return { frame: target, ok: false }
  usable.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
  return { frame: usable[0], ok: true }
}

function onBarPointerDown(e, index) {
  if (props.kf.isPlaying.value) return
  const ev = props.kf.events[index]
  const track = evTrackRef.value
  if (!ev || !track || !props.kf.totalFrames.value) return
  const rect = track.getBoundingClientRect()
  if (!rect.width) return

  dragRect = rect
  dragPxPerFrame = rect.width / props.kf.totalFrames.value
  dragGrabOffset = (e.clientX - rect.left) / dragPxPerFrame - ev.frame
  dragLengthFrames = ev.type === 'motion' ? eventSeconds(ev) * props.kf.fps.value : 0
  dragIndex.value = index
  dragFrame.value = ev.frame
  dragValid.value = true
  dragMoved = false
  dragStartX = e.clientX

  window.addEventListener('pointermove', onBarPointerMove)
  window.addEventListener('pointerup', onBarPointerUp)
  window.addEventListener('pointercancel', onBarPointerUp)
}

function onBarPointerMove(e) {
  if (dragIndex.value < 0 || !dragRect) return
  if (Math.abs(e.clientX - dragStartX) > 3) dragMoved = true

  const raw = (e.clientX - dragRect.left) / dragPxPerFrame - dragGrabOffset
  const limit = Math.max(0, props.kf.totalFrames.value - dragLengthFrames)
  const target = Math.max(0, Math.min(limit, Math.round(raw)))
  const drop = resolveDropFrame(target, dragIndex.value, dragLengthFrames)
  dragFrame.value = drop.frame
  dragValid.value = drop.ok
}

function onBarPointerUp() {
  window.removeEventListener('pointermove', onBarPointerMove)
  window.removeEventListener('pointerup', onBarPointerUp)
  window.removeEventListener('pointercancel', onBarPointerUp)

  const index = dragIndex.value
  const frame = dragFrame.value
  const moved = dragMoved
  dragIndex.value = -1
  dragRect = null
  dragMoved = false

  if (index < 0 || !moved) {
    suppressClick = false
    return
  }
  suppressClick = true
  props.kf.moveEvent(index, frame)
}

function onBarClick(index) {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (props.kf.isPlaying.value) return
  props.kf.removeEvent(index)
}

/* ---------- 添加事件 ---------- */

function onEventTrackClick() {
  if (props.kf.isPlaying.value || dragIndex.value >= 0) return
  pendingEventFrame.value = Math.floor(props.kf.currentFrame.value)
  pickError.value = ''
  showEventPicker.value = true
}

function addMotionEvent(name) {
  if (!name) return
  const dur = motionSeconds(name)
  if (props.kf.addEvent('motion', name, pendingEventFrame.value, dur)) {
    pickError.value = ''
    showEventPicker.value = false
    eventPickName.value = ''
    return
  }
  // 放不下时保留选择器，把原因和出路一起给出来
  const blocked = props.kf.getMotionRanges().find(
    r => pendingEventFrame.value >= r.start && pendingEventFrame.value < r.end
  )
  pickError.value = blocked
    ? `放不下：「${blocked.name}」占用了第 ${blocked.start}–${Math.ceil(blocked.end)} 帧，而 ${name} 需要 ${formatSeconds(dur)}。`
    : `放不下：这段空间不足 ${formatSeconds(dur)}。`
  eventPickName.value = ''
}

function addExpressionEvent(name) {
  if (!name) return
  if (!props.kf.addEvent('expression', name, pendingEventFrame.value, 0)) {
    showHint('该帧已经有一个表情事件了')
  }
  showEventPicker.value = false
  eventPickExpr.value = ''
}

function clearEvents() {
  props.kf.events.splice(0, props.kf.events.length)
}

function exportProject() {
  const data = { version: 1, ...props.kf.toJSON() }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tomori-project-' + Date.now() + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  showHint('工程已导出')
}

function onProjectSelected(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if (!data || typeof data !== 'object') throw new Error('invalid project')
      props.kf.fromJSON(data)
      emit('apply-kf-values', props.kf.getAllValuesAtFrame(props.kf.currentFrame.value, baseValues))
      showHint('已导入 ' + file.name)
    } catch {
      showHint('导入失败：不是有效的工程 JSON')
    }
  }
  reader.onerror = () => showHint('读取文件失败')
  reader.readAsText(file)
}

/* ---------- 录制背景 ---------- */

async function onBgSelected(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showHint('请选择图片文件')
    return
  }
  const result = await setImageFile(file)
  if (!result.ok) showHint('图片已应用，但没能保存下来（可能超出浏览器存储上限），刷新后会丢失')
}

function onRecordToggle() {
  if (recorder.isRecording.value) {
    recorder.stop()
    onStop()
    return
  }
  const cvs = document.getElementById('live2d-canvas')
  if (!cvs) return
  if (!recorder.start(cvs, audioEl, props.recordMode, () => background.value, props.getViewRect)) {
    showHint('录制启动失败，请检查浏览器权限')
    return
  }
  if (audioEl && audioEl.paused) audioEl.currentTime = props.kf.currentFrame.value / props.kf.fps.value
  if (!props.kf.isPlaying.value) onPlay()
}

function onKeydown(e) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
  if (e.code === 'Space') {
    e.preventDefault()
    props.kf.isPlaying.value ? onPause() : onPlay()
    return
  }
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !props.kf.isPlaying.value) {
    e.preventDefault()
    onSliderSeek(props.kf.currentFrame.value + (e.code === 'ArrowLeft' ? -1 : 1))
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  clearTimeout(hintTimer)
  recorder.destroy()
})

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
  overflow: hidden; white-space: nowrap; cursor: grab; touch-action: none;
  color: #fff; user-select: none; min-width: 6px; font-weight: 500;
}
.bb-ev-bar.ev-motion { background: linear-gradient(135deg, #e94560, #c0392b); }
.bb-ev-bar.ev-motion:hover { filter: brightness(0.8); }
.bb-ev-bar.ev-expression {
  width: 8px !important; min-width: 8px !important;
  background: #f5a623; border: 2px solid #fff;
  border-radius: 50%; top: 5px; height: 8px; padding: 0; font-size: 0;
}
.bb-ev-bar.ev-motion.is-dragging {
  cursor: grabbing; opacity: 0.9; z-index: 3;
  box-shadow: inset 0 0 0 1px #fff;
}
.bb-ev-bar.ev-motion.is-invalid { background: #7f1d1d; }
.bb-ev-bar.ev-motion.is-conflict {
  background: repeating-linear-gradient(45deg, #b91c1c 0 4px, #7f1d1d 4px 8px);
}
.bb-ev-clear { flex-shrink: 0; font-size: 11px; }

.bb-ev-footer {
  padding: 2px 24px 2px 58px; flex-shrink: 0;
}

.bb-ev-picker {
  padding: 6px 24px 6px 58px; flex-shrink: 0;
  border-bottom: 1px solid #0f3460; background: rgba(0,0,0,0.15);
}
.bb-ev-pick-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 5px;
}
.bb-ev-pick-label { color: #e94560; font-size: 12px; }
.bb-ev-pick-ok { color: #2dd4bf; font-size: 12px; }
.bb-ev-pick-warn { color: #f5a623; font-size: 12px; }
.bb-ev-pick-error {
  margin-top: 5px; font-size: 12px; color: #ff8a8a;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.bb-ev-pick-row { display: flex; align-items: center; gap: 8px; }

.bb-hint {
  padding: 5px 24px 5px 58px; flex-shrink: 0; font-size: 12px;
  color: #f5a623; background: rgba(245,166,35,0.08);
  border-bottom: 1px solid #0f3460;
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
  border-top: 1px solid #0f3460; gap: 10px; flex-shrink: 0; flex-wrap: wrap;
}
.bb-motion-info {
  display: flex; align-items: center; gap: 6px; margin-left: auto;
}
.bb-motion-name { color: #e94560; font-size: 12px; font-weight: 500; }
.bb-motion-time { color: #e94560; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
