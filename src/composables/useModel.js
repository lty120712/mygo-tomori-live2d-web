import { ref, reactive, readonly, watch } from 'vue'
import { PARAM_GROUPS, initParamValues } from '../params.js'

const L2D = window.L2D
const STORAGE_KEY = 'tomori-viewer-state'

const MODELS = [
  "2024_furisode", "birthday_2024_ssr", "casual-2023",
  "collabo_a_ur", "collabo_d_3_ur", "dream_festival_3_ur",
  "live_default", "live_event_235_ur", "live_event_240_ssr",
  "live_event_250_ur", "live_event_286_ur", "live_event_289_ur",
  "live_event_297_ur", "live_event_307_ssr", "live_sr_01",
  "school_summer-2023", "school_winter-2023"
]

const models = MODELS
const currentModel = ref('')
const loading = ref(false)
const statusText = ref('选择左侧模型加载')
const motionGroups = ref([])
const currentMotion = ref('')
const expressionIds = ref([])
const currentExpression = ref('')
const paramValues = reactive(initParamValues())
const mouseTrackEnabled = ref(true)
const motionPlaying = ref(false)
const motionProgress = ref(0)
const motionLabel = ref('')
const motionRemain = ref('')
const toastMsg = ref('')

const motionDurations = ref({})

let toastTimer = null
let progressTimer = null
function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 1500)
}

let l2d = null

function setStatus(msg) { statusText.value = msg }

async function loadModel(name, restore) {
  loading.value = true
  statusText.value = '加载中...'
  currentMotion.value = ''
  currentExpression.value = ''
  motionGroups.value = []
  expressionIds.value = []

  if (l2d) { l2d.destroy(); l2d = null }

  await new Promise(resolve => setTimeout(resolve, 50))

  const cvs = document.getElementById('live2d-canvas')
  if (!cvs) { loading.value = false; return }
  l2d = L2D.init(cvs)
  l2d.on('motionstart', (_group, _index, duration) => {
    motionPlaying.value = true
    motionProgress.value = 0
    motionLabel.value = _group
    motionDurations.value = { ...motionDurations.value, [_group]: duration }
    clearInterval(progressTimer)
    const start = Date.now()
    const total = duration * 1000 || 2000
    motionRemain.value = (total / 1000).toFixed(1) + 's'
    progressTimer = setInterval(() => {
      const elapsed = Date.now() - start
      const remain = Math.max(0, total - elapsed)
      motionProgress.value = Math.min(100, (elapsed / total) * 100)
      motionRemain.value = (remain / 1000).toFixed(1) + 's'
      if (elapsed >= total) clearInterval(progressTimer)
    }, 50)
  })
  l2d.on('motionend', () => {
    motionPlaying.value = false
    motionProgress.value = 100
    motionRemain.value = '0.0s'
    motionLabel.value = ''
    clearInterval(progressTimer)
  })
  await l2d.load({ path: '/models/' + name + '/model.json', scale: 1.0 })
  currentModel.value = name
  statusText.value = '当前: ' + name

  motionGroups.value = Object.keys(l2d.getMotions())
  expressionIds.value = l2d.getExpressions()

  if (restore) {
    if (restore.motion && motionGroups.value.includes(restore.motion)) {
      playMotion(restore.motion)
    }
    if (restore.expression && expressionIds.value.includes(restore.expression)) {
      setExpression(restore.expression)
    }
    if (restore.params) {
      for (const [key, value] of Object.entries(restore.params)) {
        if (key in paramValues) {
          paramValues[key] = value
        }
      }
      applyAllParams()
    }
    if (restore.mouseTrack !== undefined) {
      mouseTrackEnabled.value = restore.mouseTrack
    }
  }
  loading.value = false
}

function playMotion(g) {
  if (!l2d) return
  if (motionPlaying.value) {
    showToast('请等待当前动作结束')
    return
  }
  currentMotion.value = g
  l2d.playMotion(g)
}

function setExpression(e) {
  if (!l2d) return
  currentExpression.value = e
  l2d.setExpression(e)
}

async function resetPose() {
  if (!l2d || !currentModel.value) return
  currentMotion.value = ''
  currentExpression.value = ''
  const defaults = initParamValues()
  for (const key of Object.keys(defaults)) {
    paramValues[key] = defaults[key]
  }
  const name = currentModel.value
  await l2d.load({ path: '/models/' + name + '/model.json', scale: 1.0 })
  motionGroups.value = Object.keys(l2d.getMotions())
  expressionIds.value = l2d.getExpressions()
}

function setParam(key, value) {
  if (!(key in paramValues)) return
  paramValues[key] = value
  if (l2d) applyAllParams()
}

function resetGroup(groupKey) {
  const group = PARAM_GROUPS.find(g => g.key === groupKey)
  if (!group) return
  for (const param of group.params) {
    paramValues[param.key] = param.default
  }
  if (l2d) applyAllParams()
}

function resetAllParams() {
  const defaults = initParamValues()
  for (const key of Object.keys(defaults)) {
    paramValues[key] = defaults[key]
  }
  if (l2d) applyAllParams()
}

function applyAllParams() {
  if (!l2d) return
  l2d.setParams({ ...paramValues })
}

function applyMouseTrack(x, y, cvs) {
  if (!mouseTrackEnabled.value || !l2d || !cvs) return
  const rect = cvs.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const dx = (x - cx) / cx
  const dy = (y - cy) / cy
  const p = { ...paramValues }
  p.PARAM_ANGLE_X = dy * 15
  p.PARAM_ANGLE_Y = dx * 15
  l2d.setParams(p)
}

function destroy() {
  if (l2d) { l2d.destroy(); l2d = null }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    model: currentModel.value,
    motion: currentMotion.value,
    expression: currentExpression.value,
    params: { ...paramValues },
    mouseTrack: mouseTrackEnabled.value,
  }))
}

function getSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

watch([currentModel, currentMotion, currentExpression, mouseTrackEnabled, paramValues], () => {
  if (currentModel.value) saveState()
}, { deep: true })

export function useModel() {
  return {
    models,
    currentModel: readonly(currentModel),
    loading: readonly(loading),
    statusText: readonly(statusText),
    motionGroups: readonly(motionGroups),
    currentMotion: readonly(currentMotion),
    expressionIds: readonly(expressionIds),
    currentExpression: readonly(currentExpression),
    paramValues,
    mouseTrackEnabled,
    motionPlaying: readonly(motionPlaying),
    motionProgress: readonly(motionProgress),
    motionLabel: readonly(motionLabel),
    motionRemain: readonly(motionRemain),
    motionDurations: readonly(motionDurations),
    toastMsg: readonly(toastMsg),
    loadModel,
    playMotion,
    setExpression,
    resetPose,
    setParam,
    resetGroup,
    resetAllParams,
    applyMouseTrack,
    destroy,
    setStatus,
    getSavedState,
  }
}
