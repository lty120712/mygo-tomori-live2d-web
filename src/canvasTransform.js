const rotate=(v,degrees)=>{const a=degrees*Math.PI/180;return {x:v.x*Math.cos(a)-v.y*Math.sin(a),y:v.x*Math.sin(a)+v.y*Math.cos(a)}}
const wrap=angle=>((angle+180)%360+360)%360-180
export function beginCanvasTransform(pose,point,corner){
  const w=(pose.width ?? 320)/2,h=(pose.height ?? 510)/2
  const local={x:corner.includes('e') ? w : corner.includes('w') ? -w : 0,y:corner.includes('s') ? h : corner.includes('n') ? -h : 0}
  const vector=rotate({x:local.x*(pose.scaleX ?? 1),y:local.y*(pose.scaleY ?? 1)},pose.rotation)
  return {pose:{...pose},point:{...point},local,vector,anchor:{x:pose.x-vector.x*pose.scale,y:pose.y-vector.y*pose.scale}}
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
export function scaleCanvasAxis(drag,point,axis){
  const {pose,local,anchor}=drag,key=axis==='x' ? 'scaleX' : 'scaleY'
  const delta=rotate({x:point.x-drag.point.x,y:point.y-drag.point.y},-pose.rotation)[axis]
  const value=Math.max(.1,Math.min(5,(pose[key] ?? 1)+delta/(2*local[axis]*pose.scale)))
  const vector=rotate({x:axis==='x' ? local.x*value : 0,y:axis==='y' ? local.y*value : 0},pose.rotation)
  return {[key]:value,x:anchor.x+vector.x*pose.scale,y:anchor.y+vector.y*pose.scale}
}
