import {TEXT_ENTER_ANIMATIONS,TEXT_EXIT_ANIMATIONS,normalizeTextAnimation,sampleTextAnimation} from './textAnimation.js'
export const MEDIA_ENTER_ANIMATIONS=TEXT_ENTER_ANIMATIONS.filter(a=>a.value!=='typewriter')
export const MEDIA_EXIT_ANIMATIONS=TEXT_EXIT_ANIMATIONS
export function normalizeMediaAnimation(raw){
  const animation=normalizeTextAnimation(raw)
  if(animation.enterAnimation==='typewriter')animation.enterAnimation='none'
  return animation
}
const neutral=Object.freeze({opacity:1,y:0,scale:1,reveal:Infinity})
export function sampleMediaAnimation(clip,time,fps=30){
  if(!clip.animation || clip.model || clip.media==='text')return neutral
  return sampleTextAnimation({start:clip.start,duration:clip.duration,offset:clip.offset,textStyle:normalizeMediaAnimation(clip.animation),textAnimationEnd:clip.mediaAnimationEnd},time,fps)
}
