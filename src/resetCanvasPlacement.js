import { setClipKeyframe } from './sceneProject.js'

export function resetCanvasPlacement(clip,frame) {
  for(const [field,value] of Object.entries({x:0,y:0,scale:1})) {
    const key='@'+field,keys=clip.keyframes[key] || []
    if(!keys.length)clip.transform[field]=value
    else if(keys.some(k=>k.frame===frame) || (keys.some(k=>k.frame<frame) && keys.some(k=>k.frame>frame)))setClipKeyframe(clip,key,frame,value)
  }
}
