export const TEXT_ENTER_ANIMATIONS=[{value:'none',label:'无'},{value:'fade',label:'淡入'},{value:'slide-up',label:'从下方滑入'},{value:'slide-down',label:'从上方滑入'},{value:'zoom',label:'缩放出现'},{value:'typewriter',label:'打字机'}]
export const TEXT_EXIT_ANIMATIONS=[{value:'none',label:'无'},{value:'fade',label:'淡出'},{value:'slide-up',label:'向上滑出'},{value:'slide-down',label:'向下滑出'},{value:'zoom',label:'缩小消失'}]
const duration=value=>Number.isFinite(Number(value)) ? Math.max(0,Math.min(10,Number(value))) : .5
export function normalizeTextAnimation(raw={}){
  raw=raw && typeof raw==='object' ? raw : {}
  return {enterAnimation:TEXT_ENTER_ANIMATIONS.some(a=>a.value===raw.enterAnimation) ? raw.enterAnimation : 'none',exitAnimation:TEXT_EXIT_ANIMATIONS.some(a=>a.value===raw.exitAnimation) ? raw.exitAnimation : 'none',enterDuration:raw.enterDuration==null ? .5 : duration(raw.enterDuration),exitDuration:raw.exitDuration==null ? .5 : duration(raw.exitDuration)}
}
let segmenter
export function textGraphemes(text){
  if(typeof Intl.Segmenter==='function'){segmenter ||= new Intl.Segmenter('zh',{granularity:'grapheme'});return [...segmenter.segment(text)].map(s=>s.segment)}
  return [...text]
}
const clamp=value=>Math.max(0,Math.min(1,value))
const ease=value=>1-(1-value)**3
export function sampleTextAnimation(clip,time,fps=30){
  const a=normalizeTextAnimation(clip.textStyle),offset=clip.offset || 0
  const end=Math.max(offset+clip.duration,clip.textAnimationEnd || 0)
  // 两段时长过长时按比例压缩，避免极短字幕的入出场相互覆盖。
  let enter=a.enterAnimation==='none' ? 0 : a.enterDuration,exit=a.exitAnimation==='none' ? 0 : a.exitDuration
  if(enter+exit>end){const ratio=end/(enter+exit);enter*=ratio;exit*=ratio}
  const local=Math.max(0,Math.round((time-clip.start+offset)*fps)/fps)
  const inProgress=enter ? clamp(local/enter) : 1,outProgress=exit ? clamp((local-(end-exit))/exit) : 0
  const result={opacity:1,y:0,scale:1,reveal:Infinity}
  if(a.enterAnimation==='typewriter')result.reveal=inProgress
  if(a.enterAnimation==='fade')result.opacity*=ease(inProgress)
  if(a.enterAnimation==='slide-up')result.y+=60*(1-ease(inProgress))
  if(a.enterAnimation==='slide-down')result.y-=60*(1-ease(inProgress))
  if(a.enterAnimation==='zoom')result.scale*=.65+.35*ease(inProgress)
  if(a.exitAnimation==='fade')result.opacity*=1-ease(outProgress)
  if(a.exitAnimation==='slide-up')result.y-=60*ease(outProgress)
  if(a.exitAnimation==='slide-down')result.y+=60*ease(outProgress)
  if(a.exitAnimation==='zoom')result.scale*=1-.35*ease(outProgress)
  // 滑动与缩放同时淡入淡出，保证边界自然隐去。
  if(['slide-up','slide-down','zoom'].includes(a.enterAnimation))result.opacity*=ease(inProgress)
  if(['slide-up','slide-down','zoom'].includes(a.exitAnimation))result.opacity*=1-ease(outProgress)
  return result
}
