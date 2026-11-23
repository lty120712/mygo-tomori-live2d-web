import {isTextClip} from './textTracks.js'
import {sampleTextAnimation} from './textAnimation.js'
import {sampleMediaAnimation} from './mediaAnimation.js'
import {scaleX,scaleY} from './visualScale.js'
import {sceneHitOrder} from './sceneLayers.js'
import {pointInMediaMask} from './mediaMask.js'

export function paintedPose(clip,pose,time,fps){
  if(!isTextClip(clip) && (!clip.animation || clip.model || !clip.assetId))return pose
  const animation=isTextClip(clip) ? sampleTextAnimation(clip,time,fps) : sampleMediaAnimation(clip,time,fps),r=pose.rotation*Math.PI/180,shift=animation.y*scaleY(pose)
  return {...pose,x:pose.x-Math.sin(r)*shift,y:pose.y+Math.cos(r)*shift,scale:(pose.scale ?? 1)*animation.scale,opacity:(pose.opacity ?? 1)*animation.opacity}
}
export function hitSceneClip(clips,poseAt,point,time,fps){
  return sceneHitOrder(clips).find(clip=>{
    const t=paintedPose(clip,poseAt(clip),time,fps)
    if((t.opacity ?? 1)<=0)return false
    const r=-t.rotation*Math.PI/180,x=point.x-t.x,y=point.y-t.y
    const sx=scaleX(t),sy=scaleY(t)
    if(!(sx>0 && sy>0))return false
    const localX=(x*Math.cos(r)-y*Math.sin(r))/sx,localY=(x*Math.sin(r)+y*Math.cos(r))/sy,dimensions={width:t.width ?? 320,height:t.height ?? 510}
    if(Math.abs(localX)>dimensions.width/2 || Math.abs(localY)>dimensions.height/2)return false
    return pointInMediaMask(clip.mask,dimensions,localX,localY)
  })
}
