import { ref, reactive, readonly, watch } from 'vue'
import { PARAM_GROUPS, initParamValues } from '../params.js'

const L2D = window.L2D
const STORAGE_KEY = 'tomori-viewer-state'

if (!L2D) {
  console.error('Live2D SDK not loaded')
}

const MODEL_LIST = [
  { category: 'tomori', name: '2024_furisode' },
  { category: 'tomori', name: 'birthday_2024_ssr' },
  { category: 'tomori', name: 'casual-2023' },
  { category: 'tomori', name: 'collabo_a_ur' },
  { category: 'tomori', name: 'collabo_d_3_ur' },
  { category: 'tomori', name: 'dream_festival_3_ur' },
  { category: 'tomori', name: 'live_default' },
  { category: 'tomori', name: 'live_event_235_ur' },
  { category: 'tomori', name: 'live_event_240_ssr' },
  { category: 'tomori', name: 'live_event_250_ur' },
  { category: 'tomori', name: 'live_event_286_ur' },
  { category: 'tomori', name: 'live_event_289_ur' },
  { category: 'tomori', name: 'live_event_297_ur' },
  { category: 'tomori', name: 'live_event_307_ssr' },
  { category: 'tomori', name: 'live_sr_01' },
  { category: 'tomori', name: 'school_summer-2023' },
  { category: 'tomori', name: 'school_winter-2023' },
  { category: 'anon', name: 'birthday_2024_ssr' },
  { category: 'anon', name: 'casual-2023' },
  { category: 'anon', name: 'collabo_a_ur' },
  { category: 'anon', name: 'dream_festival_3_ur' },
  { category: 'anon', name: 'live_default' },
  { category: 'anon', name: 'live_event_235_ur' },
  { category: 'anon', name: 'live_event_240_sr' },
  { category: 'anon', name: 'live_event_250_r' },
  { category: 'anon', name: 'live_event_253_ur' },
  { category: 'anon', name: 'live_event_277_sr' },
  { category: 'anon', name: 'live_event_286_sr' },
  { category: 'anon', name: 'live_event_297_sr' },
  { category: 'anon', name: 'live_event_307_ur' },
  { category: 'anon', name: 'live_event_313_ur' },
  { category: 'anon', name: 'live_sr_01' },
  { category: 'anon', name: 'school_summer-2023' },
  { category: 'anon', name: 'school_winter-2023' },
]

const models = MODEL_LIST
const currentModel = ref('')
const currentCategory = ref('')
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

async function loadModel(m, restore) {
  let name, category
  if (typeof m === 'string') {
    const parts = m.split('/')
    if (parts.length === 2) {
      category = parts[0]
      name = parts[1]
    } else {
      category = 'tomori'
      name = m
    }
  } else {
    name = m?.name
    category = m?.category || 'tomori'
  }
  if (!name) return
  
  loading.value = true
  statusText.value = '加载中...'
  currentModel.value = ''
  currentCategory.value = ''
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
  try {
    const modelUrl = '/models/' + category + '/' + name + '/'
    await l2d.load({ path: modelUrl + 'model.json', scale: 1.0 })
  } catch (err) {
    console.error('Model load error:', err)
    setStatus('加载失败: ' + category + '/' + name)
    loading.value = false
    return
  }
  currentModel.value = category + '/' + name
  currentCategory.value = category
  statusText.value = '当前: ' + category + '/' + name

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
  const parts = currentModel.value.split('/')
  if (parts.length !== 2) return
  const [category, name] = parts
  currentMotion.value = ''
  currentExpression.value = ''
  motionPlaying.value = false
  motionLabel.value = ''
  motionRemain.value = ''
  motionProgress.value = 0
  clearInterval(progressTimer)
  const defaults = initParamValues()
  for (const key of Object.keys(defaults)) {
    paramValues[key] = defaults[key]
  }
  const modelUrl = '/models/' + category + '/' + name + '/'
  await l2d.load({ path: modelUrl + 'model.json', scale: 1.0 })
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

function setAllParams(values) {
  for (const key of Object.keys(values)) {
    if (key in paramValues) {
      paramValues[key] = values[key]
    }
  }
  if (l2d) applyAllParams()
}

function applyKfParams(values) {
  for (const key of Object.keys(values)) {
    if (key in paramValues) {
      paramValues[key] = values[key]
    }
  }
  if (l2d && Object.keys(values).length > 0) {
    l2d.setParams({ ...values })
  }
}

function applyMouseTrack(x, y, cvs) {
  if (!mouseTrackEnabled.value || !l2d || !cvs) return
  const rect = cvs.getBoundingClientRect()
  const cx = rect.width / 2
  const cy = rect.height / 2
  const dx = (x - cx) / cx
  const dy = (y - cy) / cy
  l2d.setParams({
    PARAM_ANGLE_X: dy * 15,
    PARAM_ANGLE_Y: dx * 15,
  })
}

function destroy() {
  clearInterval(progressTimer)
  clearTimeout(toastTimer)
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

let saveTimer = null
function debouncedSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveState, 500)
}

watch([currentModel, currentMotion, currentExpression, mouseTrackEnabled, paramValues], () => {
  if (currentModel.value) debouncedSave()
}, { deep: true })

export function useModel() {
  return {
    models,
    currentModel: readonly(currentModel),
    currentCategory: readonly(currentCategory),
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
    setAllParams,
    applyKfParams,
    applyMouseTrack,
    destroy,
    setStatus,
    getSavedState,
  }
}
