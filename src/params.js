export const PARAM_GROUPS = [
  {
    key: 'mouth',
    header: '嘴部',
    defaultOpen: true,
    params: [
      { key: 'PARAM_MOUTH_OPEN_Y', label: '张嘴', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_MOUTH_FORM_01', label: '嘴型横拉', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_MOUTH_FORM_Y', label: '嘴型纵变', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_MOUTH_SCALE', label: '嘴巴大小', min: 0, max: 1, step: 0.1, default: 1 },
    ],
  },
  {
    key: 'eyes',
    header: '眼睛',
    defaultOpen: true,
    params: [
      { key: 'PARAM_EYE_L_OPEN', label: '左眼开闭', min: 0, max: 2, step: 0.1, default: 1 },
      { key: 'PARAM_EYE_R_OPEN', label: '右眼开闭', min: 0, max: 2, step: 0.1, default: 1 },
      { key: 'PARAM_EYE_L_SMILE', label: '左笑眼', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_EYE_R_SMILE', label: '右笑眼', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_EYE_BALL_X', label: '眼球X', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_EYE_BALL_Y', label: '眼球Y', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_EYE_FORM', label: '眼型', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_EYE_SCALE', label: '眼睛大小', min: 0, max: 1, step: 0.1, default: 1 },
      { key: 'PARAM_EYE_HIGHLIGHT', label: '高光', min: 0, max: 1, step: 0.1, default: 1 },
      { key: 'PARAM_EYELID_L', label: '左眼皮', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_EYELID_R', label: '右眼皮', min: 0, max: 1, step: 0.1, default: 0 },
    ],
  },
  {
    key: 'brow',
    header: '眉毛',
    defaultOpen: false,
    params: [
      { key: 'PARAM_BROW_L_X', label: '左眉X', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_L_Y', label: '左眉Y', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_L_ANGLE', label: '左眉角度', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_L_FORM', label: '左眉形状', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_R_X', label: '右眉X', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_R_Y', label: '右眉Y', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_R_ANGLE', label: '右眉角度', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BROW_R_FORM', label: '右眉形状', min: 0, max: 1, step: 0.1, default: 0 },
    ],
  },
  {
    key: 'expression',
    header: '表情',
    defaultOpen: false,
    params: [
      { key: 'PARAM_CHEEK', label: '脸颊', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_CHEEK2', label: '脸颊2', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_TEAR', label: '泪水', min: 0, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_BREATH', label: '呼吸', min: 0, max: 1, step: 0.1, default: 0 },
    ],
  },
  {
    key: 'body',
    header: '身体',
    defaultOpen: false,
    params: [
      { key: 'PARAM_BODY_ANGLE_X', label: '左右旋转', min: -30, max: 30, step: 1, default: 0 },
      { key: 'PARAM_BODY_ANGLE_Y', label: '上下旋转', min: -30, max: 30, step: 1, default: 0 },
      { key: 'PARAM_BODY_ANGLE_Z', label: '倾斜', min: -30, max: 30, step: 1, default: 0 },
      { key: 'PARAM_UPPER_BODY', label: '前倾', min: -1, max: 1, step: 0.1, default: 0 },
    ],
  },
  {
    key: 'hair',
    header: '头发',
    defaultOpen: false,
    params: [
      { key: 'PARAM_HAIR_FRONT', label: '前发', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_HAIR_SIDE', label: '侧发', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_HAIR_BACK', label: '后发', min: -1, max: 1, step: 0.1, default: 0 },
      { key: 'PARAM_FLUFFY', label: '蓬松度', min: 0, max: 1, step: 0.1, default: 0 },
    ],
  },
  {
    key: 'clothes',
    header: '裙摆',
    defaultOpen: false,
    params: [
      { key: 'PARAM_CLOTHES_A', label: '裙摆摆动', min: -1, max: 1, step: 0.1, default: 0 },
    ],
  },
]

export function initParamValues(groups = PARAM_GROUPS) {
  const vals = {}
  for (const g of groups) {
    for (const p of g.params) {
      vals[p.key] = p.default
    }
  }
  return vals
}

export const DEFAULT_ACTIVE_KEYS = ['mouth', 'eyes']

// 两代命名只在格式上不同的参数可兼容；不存在的参数不猜测对应项。
export function canonicalParamId(id) {
  return String(id).replace(/[^a-z0-9]/gi, '').toLowerCase()
}

const knownParams = new Map(PARAM_GROUPS.flatMap(g => g.params.map(p =>
  [canonicalParamId(p.key), { label: p.label, group: g.key }]
)))
for (const [id, label] of [['ParamAngleX', '头部左右'], ['ParamAngleY', '头部上下'], ['ParamAngleZ', '头部倾斜']]) {
  knownParams.set(canonicalParamId(id), { label, group: 'head' })
}

function inferGroup(id) {
  if (/mouth/i.test(id)) return 'mouth'
  if (/eye|eyelid/i.test(id)) return 'eyes'
  if (/brow/i.test(id)) return 'brow'
  if (/cheek|tear|emo|angry|smile|sad|face|blush|shy|shadow|pale/i.test(id)) return 'expression'
  if (/^param[_]?angle/i.test(id)) return 'head'
  if (/body|breath/i.test(id)) return 'body'
  if (/hair|fluffy/i.test(id)) return 'hair'
  if (/arm|hand|finger|elbow|shoulder/i.test(id)) return 'arms'
  if (/cloth|skirt|ribbon|himo|shoes/i.test(id)) return 'clothes'
  return 'other'
}

export function buildParamGroups(list) {
  const groups = [...PARAM_GROUPS.map(g => ({ ...g, params: [] })),
    { key: 'head', header: '头部', params: [] },
    { key: 'arms', header: '手臂 / 手指', params: [] },
    { key: 'other', header: '其他', params: [] }]
  const seen = new Set()
  for (const item of list || []) {
    // Cubism 2 返回 ParamID 对象，Cubism 6 返回字符串。
    const id = typeof item?.id === 'string' ? item.id : item?.id?.toString?.()
    if (!id || typeof id !== 'string' || id === '[object Object]' || seen.has(id)) continue
    const min = Number(item.min), max = Number(item.max)
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) continue
    seen.add(id)
    const known = knownParams.get(canonicalParamId(id))
    const group = known?.group || inferGroup(id)
    const span = max - min
    const step = span >= 20 ? 1 : span >= 2 ? 0.1 : 0.01
    const initial = Number(item.default)
    groups.find(g => g.key === group).params.push({
      key: id, label: known?.label || id, min, max, step,
      default: Math.max(min, Math.min(max, Number.isFinite(initial) ? initial : 0)),
      common: !!known,
    })
  }
  return groups.filter(g => g.params.length)
}

export function resolveParamId(id, groups) {
  const params = groups.flatMap(g => g.params)
  return params.find(p => p.key === id)?.key
    || params.find(p => canonicalParamId(p.key) === canonicalParamId(id))?.key
    || null
}

export function normalizeParamValues(values, groups) {
  const params = new Map(groups.flatMap(g => g.params.map(p => [p.key, p])))
  const result = {}
  // 精确 ID 优先于旧命名别名，避免旧工程覆盖已编辑的新参数。
  for (const [id, raw] of Object.entries(values || {}).sort(([a], [b]) => Number(params.has(a)) - Number(params.has(b)))) {
    const key = resolveParamId(id, groups), value = Number(raw)
    if (!key || !Number.isFinite(value) || raw == null) continue
    const p = params.get(key)
    result[key] = Math.max(p.min, Math.min(p.max, value))
  }
  return result
}
