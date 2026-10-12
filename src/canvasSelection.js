import {modelBounds} from './canvasPosition.js'
import {clipVisible,localFrame,setClipKeyframe} from './sceneProject.js'
const wrap=angle=>((angle+180)%360+360)%360-180
export function selectionBounds(entries){
  if(!entries.length)return null
  const bounds=entries.map(e=>modelBounds(e.pose)),left=Math.min(...bounds.map(b=>b.x[0])),right=Math.max(...bounds.map(b=>b.x[2])),top=Math.min(...bounds.map(b=>b.y[0])),bottom=Math.max(...bounds.map(b=>b.y[2]))
  return {left,right,top,bottom,x:(left+right)/2,y:(top+bottom)/2,width:right-left,height:bottom-top}
}
export function boxSelected(entries,a,b){
  const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y)
  return entries.filter(e=>{const bounds=modelBounds(e.pose);return bounds.x[2]>=left && bounds.x[0]<=right && bounds.y[2]>=top && bounds.y[0]<=bottom}).map(e=>e.id)
}
// Align the rotated outer bounds; distribute equal gaps between those bounds.
export function layoutSelection(entries,operation){
  if(entries.length<2)return []
  const bounds=selectionBounds(entries)
  const axes={left:'x',centerX:'x',right:'x',top:'y',centerY:'y',bottom:'y',distributeX:'x',distributeY:'y'}
  let changes
  if(operation==='centerCanvas')changes=entries.map(e=>({id:e.id,patch:{x:e.pose.x-bounds.x,y:e.pose.y-bounds.y}}))
  else {
    const axis=axes[operation]
    if(!axis)return []
    const items=entries.map(e=>{const b=modelBounds(e.pose)[axis];return {...e,min:b[0],center:b[1],max:b[2]}})
    if(operation.startsWith('distribute')){
      if(items.length<3)return []
      items.sort((a,b)=>a.center-b.center)
      const gap=(items.at(-1).max-items[0].min-items.reduce((total,e)=>total+e.max-e.min,0))/(items.length-1)
      let cursor=items[0].min
      changes=items.map((e,index)=>{
        const value=index===0 || index===items.length-1 ? e.pose[axis] : e.pose[axis]+cursor-e.min
        cursor+=e.max-e.min+gap
        return {id:e.id,patch:{[axis]:value}}
      })
    }else{
      const edge={left:'min',right:'max',top:'min',bottom:'max',centerX:'center',centerY:'center'}[operation]
      const target={left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom,centerX:bounds.x,centerY:bounds.y}[operation]
      changes=items.map(e=>({id:e.id,patch:{[axis]:e.pose[axis]+target-e[edge]}}))
    }
  }
  return changes.every(e=>Object.entries(e.patch).every(([axis,value])=>Number.isFinite(value) && Math.abs(value)<=(axis==='x' ? 1920 : 1080))) ? changes : []
}
export function moveSelection(entries,delta){
  const dx=Math.max(...entries.map(e=>-1920-e.pose.x)),hx=Math.min(...entries.map(e=>1920-e.pose.x)),dy=Math.max(...entries.map(e=>-1080-e.pose.y)),hy=Math.min(...entries.map(e=>1080-e.pose.y))
  const x=Math.max(dx,Math.min(hx,delta.x)),y=Math.max(dy,Math.min(hy,delta.y))
  return entries.map(e=>({id:e.id,patch:{x:e.pose.x+x,y:e.pose.y+y}}))
}
export function scaleSelection(entries,center,factor){
  if(!entries.length || !Number.isFinite(factor))return []
  let low=Math.max(...entries.map(e=>.1/e.pose.scale)),high=Math.min(...entries.map(e=>5/e.pose.scale))
  for(const {pose} of entries)for(const [axis,limit] of [['x',1920],['y',1080]]){
    const distance=pose[axis]-center[axis]
    if(distance){
      const a=(-limit-center[axis])/distance,b=(limit-center[axis])/distance
      low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b))
    }
  }
  if(high<low)return []
  const ratio=Math.max(low,Math.min(high,factor))
  return entries.map(e=>({id:e.id,patch:{x:center.x+(e.pose.x-center.x)*ratio,y:center.y+(e.pose.y-center.y)*ratio,scale:e.pose.scale*ratio}}))
}
export function rotateSelection(entries,center,degrees){
  const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
  const patches=entries.map(e=>({id:e.id,patch:{x:center.x+(e.pose.x-center.x)*c-(e.pose.y-center.y)*s,y:center.y+(e.pose.x-center.x)*s+(e.pose.y-center.y)*c,rotation:wrap(e.pose.rotation+degrees)}}))
  return patches.every(e=>Math.abs(e.patch.x)<=1920 && Math.abs(e.patch.y)<=1080) ? patches : []
}
export function applyCanvasSelection(clips,entries,time,fps,autoKey){
  const limits={x:[-1920,1920],y:[-1080,1080],scale:[.1,5],rotation:[-180,180]}
  const targets=entries.map(e=>({...e,clip:clips.find(c=>c.id===e.id)}))
  if(!targets.length || targets.some(e=>!e.clip || e.clip.layerLocked || !clipVisible(e.clip,time) || Object.entries(e.patch).some(([key,value])=>!limits[key] || !Number.isFinite(value) || value<limits[key][0]-1e-7 || value>limits[key][1]+1e-7)))return false
  for(const {clip,patch} of targets)for(const [key,raw] of Object.entries(patch)){
    const value=Math.max(limits[key][0],Math.min(limits[key][1],raw))
    if(autoKey || clip.keyframes['@'+key]?.length)setClipKeyframe(clip,'@'+key,localFrame(clip,time,fps),value)
    else clip.transform[key]=value
  }
  return true
}
