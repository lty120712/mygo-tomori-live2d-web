export const MEDIA_ADJUSTMENT_FIELDS = [
  {key:'brightness',label:'亮度'},
  {key:'contrast',label:'对比度'},
  {key:'saturation',label:'饱和度'},
]
export function normalizeMediaAdjustments(raw){
  return Object.fromEntries(MEDIA_ADJUSTMENT_FIELDS.map(({key})=>[key,typeof raw?.[key]==='number' && Number.isFinite(raw[key]) ? Math.max(0,Math.min(2,raw[key])) : 1]))
}
export function mediaAdjustmentFilter(raw){
  const values=normalizeMediaAdjustments(raw)
  if(Object.values(values).every(value=>value===1))return 'none'
  return `brightness(${values.brightness}) contrast(${values.contrast}) saturate(${values.saturation})`
}
