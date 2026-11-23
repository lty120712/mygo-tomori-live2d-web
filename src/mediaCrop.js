import {mediaAdjustmentFilter} from './mediaAdjustments.js'
import {applyMediaMask,normalizeMediaMask} from './mediaMask.js'
const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback
export function normalizeMediaCrop(raw={}){
  raw=raw && typeof raw==='object' ? raw : {}
  const x=clamp(raw.x,0,.99,0),y=clamp(raw.y,0,.99,0)
  return {x,y,width:clamp(raw.width,.01,1-x,1-x),height:clamp(raw.height,.01,1-y,1-y)}
}
export function cropEdges(raw){
  const c=normalizeMediaCrop(raw)
  return {left:c.x,top:c.y,right:Math.max(0,1-c.x-c.width),bottom:Math.max(0,1-c.y-c.height)}
}
export function cropWithEdge(raw,edge,percent){
  const sides=cropEdges(raw)
  if(!Object.hasOwn(sides,edge))return normalizeMediaCrop(raw)
  const opposite={left:'right',right:'left',top:'bottom',bottom:'top'}[edge]
  sides[edge]=clamp(Number(percent)/100,0,.99-sides[opposite],sides[edge])
  return normalizeMediaCrop({x:sides.left,y:sides.top,width:1-sides.left-sides.right,height:1-sides.top-sides.bottom})
}
export function paintCroppedMedia(ctx,source,clip,dimensions){
  const crop=normalizeMediaCrop(clip.crop)
  const width=source.videoWidth || source.naturalWidth || source.width || clip.width || 320
  const height=source.videoHeight || source.naturalHeight || source.height || clip.height || 180
  const flipped=clip.flipX===true || clip.flipY===true
  const filter=mediaAdjustmentFilter(clip.adjustments),masked=normalizeMediaMask(clip.mask).type!=='none',isolated=flipped || filter!=='none' || masked
  if(isolated)ctx.save()
  if(masked)applyMediaMask(ctx,clip.mask,dimensions)
  if(flipped)ctx.scale(clip.flipX===true ? -1 : 1,clip.flipY===true ? -1 : 1)
  if(filter!=='none')ctx.filter=filter
  ctx.drawImage(source,crop.x*width,crop.y*height,crop.width*width,crop.height*height,-dimensions.width/2,-dimensions.height/2,dimensions.width,dimensions.height)
  if(isolated)ctx.restore()
}
export function fitMediaToCanvas(dimensions,canvas,mode='contain'){
  if(!(dimensions.width>0 && dimensions.height>0))return {error:'素材尺寸无效，无法适应画布'}
  const ratios=[canvas.width/dimensions.width,canvas.height/dimensions.height]
  const ratio=mode==='cover' ? Math.max(...ratios) : Math.min(...ratios)
  if(ratio>25+1e-8 || ratio<.01 || !Number.isFinite(ratio))return {error:'当前裁剪区域太小，超出可用缩放范围；请减小裁剪边距后重试'}
  const scale=Math.max(.1,Math.min(5,ratio)),axis=ratio/scale
  return {patch:{x:0,y:0,rotation:0,scale,scaleX:axis,scaleY:axis}}
}
