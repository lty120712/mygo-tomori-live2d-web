import { ref, reactive, readonly, watch } from 'vue'
import { init as createL2D } from 'l2d'
import { buildParamGroups, initParamValues, normalizeParamValues } from '../params.js'
import { collectMotionInfo } from '../motions.js'
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
const paramGroups = ref([])
const paramValues = reactive({})
const mouseTrackEnabled = ref(true)
const motionPlaying = ref(false)
const motionProgress = ref(0)
const motionLabel = ref('')
const motionRemain = ref('')
const toastMsg = ref('')

const motionDurations = ref({})

const paramOverrides = reactive({})

function refreshValidParamIds() {
  if (!l2d) return
  try {
    const list = l2d.getParams()
    if (Array.isArray(list) && list.length > 0) {
      paramGroups.value = buildParamGroups(list)
      for (const key of Object.keys(paramValues)) delete paramValues[key]
      Object.assign(paramValues, initParamValues(paramGroups.value))
    }
  } catch {
    console.warn('[params] 无法读取模型参数表')
  }
}

function filterParams(params) {
  return normalizeParamValues(params, paramGroups.value)
}

function sendParams(params) {
  if (!l2d) return
  l2d.setParams(filterParams(params))
}

// 人物缩放，单位是百分比（100 = 原始大小）。
// 只作用于模型视图矩阵，背景不受影响。
const MODEL_SCALE_MIN = 10
const MODEL_SCALE_MAX = 500
const modelScale = ref(100)

function clampScale(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 100
  return Math.min(MODEL_SCALE_MAX, Math.max(MODEL_SCALE_MIN, Math.round(numeric)))
}

function setModelScale(percent) {
  modelScale.value = clampScale(percent)
}

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

// 画面上的状态文字已经移除，出错时改用浮层提示，避免失败后毫无反馈
function setError(msg) {
  statusText.value = msg
  showToast(msg)
}

// 容器尺寸变化时让 Live2D 重新计算后备缓冲，否则画面会停留在旧的像素尺寸上。
function watchCanvasResize(cvs) {
  if (resizeObserver || typeof ResizeObserver === 'undefined') return
  const target = cvs.parentElement || cvs
  resizeObserver = new ResizeObserver(() => {
    if (l2d) l2d.resize()
  })
  resizeObserver.observe(target)
}

// Live2D SDK 自带一套鼠标跟随：它在 document 上监听 mousemove，让模型head跟着光标转，
// 这一套不受应用自己的开关控制，所以关掉“鼠标跟随”时必须把它的监听摘掉。
// SDK 没有对外暴露开关，只能按它的内部结构取监听函数；取不到就静默跳过，
// 不影响应用自己那套跟随（那条路径本来就看 mouseTrackEnabled）。
function sdkTrackingToggles() {
  const state = l2d?._state
  if (!state) return []
  const toggles = []

  // Cubism 2：state.l2d2Model 是渲染委托，把 mouseEvent 绑定成 _boundMouseEvent
  const legacy = state.l2d2Model
  if (legacy?._boundMouseEvent) {
    const handler = legacy._boundMouseEvent
    toggles.push({
      on: () => {
        document.addEventListener('mousemove', handler, false)
        document.addEventListener('mouseout', handler, false)
      },
      off: () => {
        document.removeEventListener('mousemove', handler, false)
        document.removeEventListener('mouseout', handler, false)
      },
    })
  }

  // Cubism 6：state.l2d6Model 持有 mouseMoveEventListener / mouseEndedEventListener
  const modern = state.l2d6Model
  if (modern?.mouseMoveEventListener) {
    const move = modern.mouseMoveEventListener
    const end = modern.mouseEndedEventListener
    toggles.push({
      on: () => {
        document.addEventListener('mousemove', move, { passive: true })
        if (end) document.addEventListener('mouseout', end, { passive: true })
      },
      off: () => {
        document.removeEventListener('mousemove', move)
        if (end) document.removeEventListener('mouseout', end)
      },
    })
  }

  return toggles
}

function applySdkMouseTracking() {
  if (!l2d) return
  const toggles = sdkTrackingToggles()
  if (toggles.length === 0) {
    // SDK 内部结构调整时会走到这里，提示开关可能只关得掉应用自己的跟随
    console.warn('[mouse-track] 没找到 Live2D 内置的鼠标跟随监听，开关可能不完整')
    return
  }
  const enabled = mouseTrackEnabled.value

  if (!enabled) {
    // 关掉的时候顺手把视线收回正前方，否则模型会僵在最后一次跟随的角度上。
    // 先发事件再摘监听，不然 SDK 收不到这个信号。
    try {
      document.dispatchEvent(new MouseEvent('mouseout'))
      sendParams({ PARAM_ANGLE_X: 0, PARAM_ANGLE_Y: 0 })
    } catch {
      // 个别环境构造事件或设置参数失败都无所谓，不能因此让开关失效
    }
  }

  for (const toggle of toggles) {
    try {
      enabled ? toggle.on() : toggle.off()
    } catch {
      // 结构对不上就算了，不能因为跟随开关把界面搞挂
    }
  }
}

function ensureInstance(cvs) {
  if (l2d) return l2d
  const instance = createL2D(cvs)
  if (!instance) {
    setError('Live2D 初始化失败：目标不是 canvas 元素')
    return null
  }
  watchCanvasResize(cvs)
  instance.on('motionstart', (_group, _index, duration) => {
    motionPlaying.value = true
    motionProgress.value = 0
    motionLabel.value = _group
    motionDurations.value = { ...motionDurations.value, [_group]: duration }
    // 动作播放期间只保留表情覆盖值：否则之前强制过的整套参数每帧都会把面部写回，
    // 动作自带的表情变化就看不出来了
    sendParams({ ...paramOverrides })
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
    // 动作结束，把参数控制权还给用户设定
    applyForcedParams()
  })
  l2d = instance
  return instance
}

// 动作时长直接从动作文件里读，不必等用户先把每个动作播一遍。
// 播放时 SDK 通过 motionstart 给的真实值优先级更高，会覆盖这里的值。
// 记录哪些动作自带表情。adv 系列的动作不带表情（表情是独立的 exp 资源），
// 播放时需要自动补上同名表情，否则只有身体在动。
let motionCarriesExpression = {}

async function harvestMotionInfo(modelUrl, requestId) {
  if (!l2d) return
  const info = await collectMotionInfo(modelUrl, l2d.getMotions())
  if (requestId !== loadRequestId) return
  const durations = {}
  const carries = {}
  for (const [group, item] of Object.entries(info)) {
    if (typeof item.seconds === 'number') durations[group] = item.seconds
    carries[group] = !!item.carriesExpression
  }
  motionCarriesExpression = carries
  motionDurations.value = { ...durations, ...motionDurations.value }
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

  // 缩放要在 load 之前定好：load 会按传入的 scale 重置视图
  if (restore && restore.scale != null) modelScale.value = clampScale(restore.scale)

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
  motionDurations.value = {}
  motionCarriesExpression = {}
  motionPlaying.value = false
  motionLabel.value = ''
  clearInterval(progressTimer)
  paramGroups.value = []
  for (const key of Object.keys(paramValues)) delete paramValues[key]
  for (const key of Object.keys(paramOverrides)) delete paramOverrides[key]

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
    setError('加载失败: ' + category + '/' + name)
    loading.value = false
    return
  }
  if (requestId !== loadRequestId) return
  l2d.resize()
  // 模型加载会重建 SDK 内部的渲染委托，跟随监听要按当前开关重新对齐
  // 参数命名各代模型不同，先取当前模型的参数表，后面下发时据此过滤
  refreshValidParamIds()
  applySdkMouseTracking()
  currentModel.value = category + '/' + name
  currentCategory.value = category
  statusText.value = '当前: ' + category + '/' + name

  motionGroups.value = Object.keys(l2d.getMotions())
  expressionIds.value = l2d.getExpressions()
  harvestMotionInfo(modelUrl, requestId)

  if (restore) {
    if (restore.motion && motionGroups.value.includes(restore.motion)) {
      playMotion(restore.motion)
    }
    if (restore.expression && expressionIds.value.includes(restore.expression)) {
      setExpression(restore.expression)
    }
    if (restore.params) {
      const restored = filterParams(restore.params)
      const defaults = initParamValues(paramGroups.value)
      for (const [key, value] of Object.entries(restored)) {
        // 旧版本保存了整张面板，新版本只保存实际手控的参数。
        if (restore.paramSchemaVersion === 2 || value !== defaults[key]) paramOverrides[key] = value
        paramValues[key] = value
      }
      applyAllParams()
    }
    if (restore.mouseTrack !== undefined) {
      mouseTrackEnabled.value = restore.mouseTrack
    }
  }
  loading.value = false
}

/** mtn_angry01_C -> angry01，用于找配套表情 */
function normalizeMotionName(name) {
  return String(name).replace(/^mtn_/i, '').replace(/_[clr]$/i, '')
}

/** exp_angry01.exp3 -> angry01 */
function expressionBaseName(id) {
  return String(id).replace(/\.exp3?$/i, '').replace(/^exp_/i, '')
}

function findPairedExpression(motionName) {
  const list = expressionIds.value || []
  if (list.length === 0) return null
  const target = normalizeMotionName(motionName)
  return list.find(id => id === target) ||
    list.find(id => expressionBaseName(id) === target) ||
    null
}

function playMotion(g) {
  if (!l2d) return
  if (motionPlaying.value) {
    showToast('请等待当前动作结束')
    return
  }
  currentMotion.value = g
  l2d.playMotion(g)
  // adv 系列的动作不带面部表情（表情是独立的 exp 资源），自动套上同名表情，
  // 否则只会看到身体在动、脸一直是上一张
  if (!motionCarriesExpression[g]) {
    const paired = findPairedExpression(g)
    if (paired) setExpression(paired)
  }
}

function setExpression(e) {
  if (!l2d) return
  currentExpression.value = e
  for (const key of Object.keys(paramOverrides)) delete paramOverrides[key]
  l2d.setExpression(e)
  // 同理：让表情自己驱动面部，只保留用户手动改过的参数
  applyForcedParams()
}

function setParam(key, value) {
  const values = filterParams({ [key]: value })
  Object.assign(paramValues, values)
  Object.assign(paramOverrides, values)
  applyAllParams()
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
  const defaults = initParamValues(paramGroups.value)
  for (const key of Object.keys(defaults)) {
    paramValues[key] = defaults[key]
  }
  const modelUrl = '/models/' + category + '/' + name + '/'
  const entry = modelEntryMap.get(category + '/' + name) || 'model.json'
  try {
    await l2d.load({ path: modelUrl + entry, scale: 1.0 })
  } catch (err) {
    console.error('Model reset error:', err)
    setError('复位失败: ' + currentModel.value)
    return
  }
  motionGroups.value = Object.keys(l2d.getMotions())
  expressionIds.value = l2d.getExpressions()
  refreshValidParamIds()
  applySdkMouseTracking()
}

function resetGroup(groupKey) {
  const group = paramGroups.value.find(g => g.key === groupKey)
  if (!group) return
  for (const param of group.params) {
    paramValues[param.key] = param.default
    delete paramOverrides[param.key]
  }
  if (l2d) applyAllParams()
}

function resetAllParams() {
  const defaults = initParamValues(paramGroups.value)
  for (const key of Object.keys(defaults)) {
    paramValues[key] = defaults[key]
  }
  for (const key of Object.keys(paramOverrides)) delete paramOverrides[key]
  if (l2d) applyAllParams()
}

function applyAllParams() {
  if (!l2d) return
  // 仅强制已编辑的参数；几百个默认参数全下发会冻结表情、物理和手臂动作。
  sendParams({ ...paramOverrides })
}

/**
 * 决定此刻要把哪些参数强制写回模型。
 *
 * SDK 的 setParams 是"整组覆盖"，被覆盖的参数每帧都会在动作更新之后写回，
 * 因此动作一旦播放，之前下发的整套参数会把它自带的面部变化全部压住。
 * 只强制用户改过或有关键帧的参数，其余交给表情、动作与物理。
 */
function applyForcedParams() {
  if (!l2d) return
  if (currentExpression.value) sendParams({ ...paramOverrides })
  else applyAllParams()
}

function setAllParams(values) {
  applyKfParams(values)
}

function applyKfParams(values) {
  const resolved = filterParams(values)
  Object.assign(paramValues, resolved)
  Object.assign(paramOverrides, resolved)
  applyAllParams()
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
    sendParams(p)
  } else {
    const p = { ...paramOverrides }
    p.PARAM_ANGLE_X = dy * 15
    p.PARAM_ANGLE_Y = dx * 15
    sendParams(p)
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
      params: { ...paramOverrides },
      paramSchemaVersion: 2,
      mouseTrack: mouseTrackEnabled.value,
      scale: modelScale.value,
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

watch([currentModel, currentMotion, currentExpression, mouseTrackEnabled, modelScale, paramValues], () => {
  if (currentModel.value) debouncedSave()
}, { deep: true })

watch(mouseTrackEnabled, () => applySdkMouseTracking())

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
    paramGroups: readonly(paramGroups),
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
    modelScale: readonly(modelScale),
    setModelScale,
  }
}
