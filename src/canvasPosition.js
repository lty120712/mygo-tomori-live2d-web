// Canvas coordinates are measured in output pixels, independent of preview zoom.
export function modelBounds(pose) {
  const angle=pose.rotation*Math.PI/180
  const halfWidth=(Math.abs(Math.cos(angle))*160+Math.abs(Math.sin(angle))*255)*pose.scale
  const halfHeight=(Math.abs(Math.sin(angle))*160+Math.abs(Math.cos(angle))*255)*pose.scale
  return {x:[pose.x-halfWidth,pose.x,pose.x+halfWidth],y:[pose.y-halfHeight,pose.y,pose.y+halfHeight]}
}
export function snapCanvasPosition(pose,position,others=[],threshold=8,disabled=false,size={width:960,height:540}) {
  const result={x:Math.max(-1920,Math.min(1920,position.x)),y:Math.max(-1080,Math.min(1080,position.y))}
  const guides=[]
  if(disabled)return {position:result,guides}
  const bounds=modelBounds({...pose,...result}),targets={x:[-size.width/2,0,size.width/2],y:[-size.height/2,0,size.height/2]}
  for(const other of others){const b=modelBounds(other);targets.x.push(...b.x);targets.y.push(...b.y)}
  for(const axis of ['x','y']){
    let nearest=null
    for(const target of targets[axis])for(const anchor of bounds[axis]){
      const delta=target-anchor,limit=axis==='x' ? 1920 : 1080
      if(Math.abs(delta)<=threshold && Math.abs(result[axis]+delta)<=limit && (!nearest || Math.abs(delta)<Math.abs(nearest.delta)))nearest={delta,target}
    }
    if(nearest){result[axis]+=nearest.delta;guides.push({axis,value:nearest.target})}
  }
  return {position:result,guides}
}
export function nudgeCanvasPosition(pose,key,large=false) {
  const step=large ? 10 : 1
  return {x:Math.max(-1920,Math.min(1920,pose.x+(key==='ArrowLeft' ? -step : key==='ArrowRight' ? step : 0))),y:Math.max(-1080,Math.min(1080,pose.y+(key==='ArrowUp' ? -step : key==='ArrowDown' ? step : 0)))}
}
