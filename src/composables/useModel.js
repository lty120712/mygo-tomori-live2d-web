import { ref, reactive, readonly, watch } from 'vue'
import { init as createL2D } from 'l2d'
import { PARAM_GROUPS, initParamValues } from '../params.js'
import modelManifest from 'virtual:model-manifest'

const STORAGE_KEY = 'tomori-viewer-state'

const models = modelManifest
const modelEntryMap = new Map(models.map(m => [m.category + '/' + m.name, m.entry]))
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

const paramOverrides = reactive({})

let toastTimer = null
let progressTimer = null
function showToast(msg) {
  toastMsg.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 1500)
}

let l2d = null
let loadRequestId = 0
let loadChain = Promise.resolve()
let resizeObserver = null

function setStatus(msg) { statusText.value = msg }

// 容器尺寸变化时让 Live2D 重新计算后备缓冲，否则画面会停留在旧的像素尺寸上。
function watchCanvasResize(cvs) {
  if (resizeObserver || typeof ResizeObserver === 'undefined') return
  const target = cvs.parentElement || cvs
  resizeObserver = new ResizeObserver(() => {
    if (l2d) l2d.resize()
  })
  resizeObserver.observe(target)
}

function ensureInstance(cvs) {
  if (l2d) return l2d
  const instance = createL2D(cvs)
  if (!instance) {
    setStatus('Live2D 初始化失败：目标不是 canvas 元素')
    return null
  }
  watchCanvasResize(cvs)
  instance.on('motionstart', (_group, _index, duration) => {
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
  instance.on('motionend', () => {
    motionPlaying.value = false
    motionProgress.value = 100
    motionRemain.value = '0.0s'
    motionLabel.value = ''
    clearInterval(progressTimer)
  })
  l2d = instance
  return instance
}

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

  const entry = (m && typeof m === 'object' && m.entry)
    || modelEntryMap.get(category + '/' + name)
    || 'model.json'

  const requestId = ++loadRequestId
  
  loading.value = true
  statusText.value = '加载中...'
  currentModel.value = ''
  currentCategory.value = ''
  currentMotion.value = ''
  currentExpression.value = ''
  motionGroups.value = []
  expressionIds.value = []

  const cvs = document.getElementById('live2d-canvas')
  if (!cvs) { loading.value = false; return }
  const instance = ensureInstance(cvs)
  if (!instance) { loading.value = false; return }
  const modelUrl = '/models/' + category + '/' + name + '/'
  const pending = loadChain.then(() => instance.load({ path: modelUrl + entry, scale: 1.0 }))
  loadChain = pending.catch(() => {})
  try {
    await pending
  } catch (err) {
    if (requestId !== loadRequestId) return
    console.error('Model load error:', err)
    setStatus('加载失败: ' + category + '/' + name)
    loading.value = false
    return
  }
  if (requestId !== loadRequestId) return
  l2d.resize()
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
  for (const key of Object.keys(paramOverrides)) delete paramOverrides[key]
  l2d.setExpression(e)
}

function setParam(key, value) {
  if (!(key in paramValues)) return
  paramValues[key] = value
  if (currentExpression.value) {
    paramOverrides[key] = value
  }
  if (!l2d) return
  if (currentExpression.value) {
    l2d.setParams({ [key]: value })
  } else {
    applyAllParams()
  }
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
  for (const key of Object.keys(paramOverrides)) delete paramOverrides[key]
  const defaults = initParamValues()
  for (const key of Object.keys(defaults)) {
    paramValues[key] = defaults[key]
  }
  const modelUrl = '/models/' + category + '/' + name + '/'
  const entry = modelEntryMap.get(category + '/' + name) || 'model.json'
  try {
    await l2d.load({ path: modelUrl + entry, scale: 1.0 })
  } catch (err) {
    console.error('Model reset error:', err)
    setStatus('复位失败: ' + currentModel.value)
    return
  }
  motionGroups.value = Object.keys(l2d.getMotions())
  expressionIds.value = l2d.getExpressions()
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
  for (const key of Object.keys(paramOverrides)) delete paramOverrides[key]
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
  if (motionPlaying.value || currentExpression.value) {
    const p = { ...paramOverrides }
    p.PARAM_ANGLE_X = dy * 15
    p.PARAM_ANGLE_Y = dx * 15
    l2d.setParams(p)
  } else {
    const p = { ...paramValues }
    p.PARAM_ANGLE_X = dy * 15
    p.PARAM_ANGLE_Y = dx * 15
    l2d.setParams(p)
  }
}

function destroy() {
  loadRequestId++
  clearInterval(progressTimer)
  clearTimeout(toastTimer)
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (l2d) { l2d.destroy(); l2d = null }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      model: currentModel.value,
      motion: currentMotion.value,
      expression: currentExpression.value,
      params: { ...paramValues },
      mouseTrack: mouseTrackEnabled.value,
    }))
  } catch {
    // Storage can be unavailable or full; keep the viewer responsive.
  }
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
