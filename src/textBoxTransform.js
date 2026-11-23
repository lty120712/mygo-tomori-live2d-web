import {layoutText,normalizeTextStyle} from './textTracks.js'
import {scaleX,scaleY} from './visualScale.js'
// 基于按下时的快照计算；固定对侧及顶边，旋转和轴向缩放均在局部坐标处理。
export function resizeTextBox(clip,pose,start,point,edge='e'){
  const angle=pose.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle)
  const dx=point.x-start.x,dy=point.y-start.y,sign=edge==='w' ? -1 : 1
  const style=normalizeTextStyle(clip.textStyle),before=layoutText(clip)
  const delta=sign*(dx*cos+dy*sin)/scaleX(pose)
  if(Math.abs(delta)<1e-9)return {width:style.width,x:pose.x,y:pose.y}
  const width=Math.round(Math.max(80,Math.min(1920,style.width+delta)))
  const after=layoutText({...clip,textStyle:{...style,width}})
  const localX=sign*(after.width-before.width)*scaleX(pose)/2,localY=(after.height-before.height)*scaleY(pose)/2
  return {width,x:pose.x+localX*cos-localY*sin,y:pose.y+localX*sin+localY*cos}
}
