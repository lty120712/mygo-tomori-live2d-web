import { resolveParamId } from './params.js'

// Pointer coordinates are in the composite scene, then converted to each clip's local space.
export function sceneMouseParams(clip, pointer, transform, groups) {
  const following=clip.mouseTrack!==false && !!pointer
  pointer=following ? pointer : {x:transform.x,y:transform.y}
  const angle=-transform.rotation*Math.PI/180,dx=pointer.x-transform.x,dy=pointer.y-transform.y
  const clamp=n=>Math.max(-1,Math.min(1,n))
  const x=clamp((dx*Math.cos(angle)-dy*Math.sin(angle))/(160*transform.scale))
  const y=clamp(-(dx*Math.sin(angle)+dy*Math.cos(angle))/(255*transform.scale))
  const params=groups.flatMap(g=>g.params),result={}
  for(const [id,value] of [['ParamAngleX',x*15],['ParamAngleY',y*15],['ParamEyeBallX',x],['ParamEyeBallY',y]]) {
    const key=resolveParamId(id,groups),param=params.find(p=>p.key===key)
    if(!param || clip.keyframes[key]?.length)continue
    result[key]=Math.max(param.min,Math.min(param.max,following ? value : param.default))
  }
  return result
}
