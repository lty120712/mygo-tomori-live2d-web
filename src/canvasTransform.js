const rotate=(v,degrees)=>{const a=degrees*Math.PI/180;return {x:v.x*Math.cos(a)-v.y*Math.sin(a),y:v.x*Math.sin(a)+v.y*Math.cos(a)}}
const wrap=angle=>((angle+180)%360+360)%360-180
export function beginCanvasTransform(pose,point,corner){
  const local={x:corner.includes('e') ? 160 : -160,y:corner.includes('s') ? 255 : -255}
  const vector=rotate(local,pose.rotation)
  return {pose:{...pose},point:{...point},vector,anchor:{x:pose.x-vector.x*pose.scale,y:pose.y-vector.y*pose.scale}}
}
export function scaleCanvasTransform(drag,point){
  const {pose,vector,anchor}=drag
  const dx=2*vector.x*pose.scale+point.x-drag.point.x,dy=2*vector.y*pose.scale+point.y-drag.point.y
  const scale=Math.max(.1,Math.min(5,(dx*vector.x+dy*vector.y)/(2*(vector.x**2+vector.y**2))))
  return {scale,x:anchor.x+vector.x*scale,y:anchor.y+vector.y*scale}
}
export function rotateCanvasTransform(pose,start,point,snap=false){
  const angle=p=>Math.atan2(p.y-pose.y,p.x-pose.x)*180/Math.PI
  const rotation=pose.rotation+wrap(angle(point)-angle(start))
  return {rotation:wrap(snap ? Math.round(rotation/15)*15 : Math.round(rotation))}
}
