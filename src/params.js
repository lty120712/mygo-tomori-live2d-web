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

export function initParamValues() {
  const vals = {}
  for (const g of PARAM_GROUPS) {
    for (const p of g.params) {
      vals[p.key] = p.default
    }
  }
  return vals
}

export const DEFAULT_ACTIVE_KEYS = ['mouth', 'eyes']
