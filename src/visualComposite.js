export const BLEND_MODES = [
  {value:'source-over',label:'正常'},
  {value:'multiply',label:'正片叠底'},
  {value:'screen',label:'滤色'},
  {value:'overlay',label:'叠加'},
  {value:'soft-light',label:'柔光'},
  {value:'hard-light',label:'强光'},
  {value:'darken',label:'变暗'},
  {value:'lighten',label:'变亮'},
  {value:'color-dodge',label:'颜色减淡'},
  {value:'color-burn',label:'颜色加深'},
  {value:'difference',label:'差值'},
  {value:'exclusion',label:'排除'},
]
const modes=new Set(BLEND_MODES.map(mode=>mode.value))
export const normalizeBlendMode=value=>modes.has(value) ? value : 'source-over'

/** 由调用方 save/restore，避免合成参数泄漏到下一层。 */
export function applyVisualComposite(ctx,clip,opacity=1){
  ctx.globalCompositeOperation=normalizeBlendMode(clip.blendMode)
  ctx.globalAlpha=Number.isFinite(opacity) ? Math.max(0,Math.min(1,opacity)) : 1
}
