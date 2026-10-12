export const EASING_PRESETS = [
  {value:'linear',label:'线性',points:[1/3,1/3,2/3,2/3]},
  {value:'easeInQuad',label:'二次缓入',points:[1/3,0,2/3,1/3]},
  {value:'easeOutQuad',label:'二次缓出',points:[1/3,2/3,2/3,1]},
  {value:'easeInOutQuad',label:'二次缓入缓出',points:[.45,0,.55,1]},
  {value:'easeIn',label:'三次缓入',points:[1/3,0,2/3,0]},
  {value:'easeOut',label:'三次缓出',points:[1/3,1,2/3,1]},
  {value:'easeInOut',label:'三次缓入缓出',points:[.65,0,.35,1]},
]
export function normalizeEasing(value){
  if(EASING_PRESETS.some(p=>p.value===value))return value
  if(value?.type==='bezier' && Array.isArray(value.points) && value.points.length===4 && value.points.every(n=>Number.isFinite(n) && n>=0 && n<=1))return {type:'bezier',points:[...value.points]}
  return 'linear'
}
export function easingLabel(value){return typeof value==='object' ? '自定义曲线' : EASING_PRESETS.find(p=>p.value===value)?.label || '线性'}
export function easingPoints(value){return typeof value==='object' ? [...value.points] : [...(EASING_PRESETS.find(p=>p.value===value) || EASING_PRESETS[0]).points]}
const coordinate=(t,a,b)=>3*(1-t)**2*t*a+3*(1-t)*t*t*b+t**3
export function applyKeyEasing(progress,easing){
  const t=Math.max(0,Math.min(1,progress))
  if(t===0 || t===1)return t
  if(easing==='easeInQuad')return t*t
  if(easing==='easeOutQuad')return 1-(1-t)**2
  if(easing==='easeInOutQuad')return t<.5 ? 2*t*t : 1-(-2*t+2)**2/2
  if(easing==='easeIn')return t**3
  if(easing==='easeOut')return 1-(1-t)**3
  if(easing==='easeInOut')return t<.5 ? 4*t**3 : 1-(-2*t+2)**3/2
  if(easing?.type!=='bezier')return t
  const [x1,y1,x2,y2]=easing.points
  // Solve time on the x axis; using t directly as the Bezier parameter changes speed incorrectly.
  let low=0,high=1
  for(let i=0;i<28;i++){const mid=(low+high)/2;if(coordinate(mid,x1,x2)<t)low=mid;else high=mid}
  return coordinate((low+high)/2,y1,y2)
}
