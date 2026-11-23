export const MEDIA_MASK_TYPES=[{value:'none',label:'无'},{value:'rect',label:'矩形'},{value:'rounded',label:'圆角矩形'},{value:'ellipse',label:'椭圆'}]
const number=(value,min,max,fallback)=>typeof value==='number' && Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback
export function normalizeMediaMask(raw){
  const type=MEDIA_MASK_TYPES.some(item=>item.value===raw?.type) ? raw.type : 'none'
  const x=number(raw?.x,0,.99,0),y=number(raw?.y,0,.99,0)
  return {type,x,y,width:number(raw?.width,.01,1-x,1-x),height:number(raw?.height,.01,1-y,1-y),radius:number(raw?.radius,0,.5,.2)}
}
export function mediaMaskGeometry(raw,dimensions){
  const mask=normalizeMediaMask(raw)
  if(mask.type==='none')return null
  const width=dimensions.width*mask.width,height=dimensions.height*mask.height
  return {type:mask.type,x:dimensions.width*(mask.x-.5),y:dimensions.height*(mask.y-.5),width,height,radius:mask.type==='rounded' ? Math.min(width,height)*mask.radius : 0}
}
/** The caller owns save/restore. Mask geometry is fixed in the cropped image's local axes. */
export function applyMediaMask(ctx,raw,dimensions){
  const mask=mediaMaskGeometry(raw,dimensions)
  if(!mask)return
  const {type,x,y,width,height,radius}=mask
  ctx.beginPath()
  if(type==='ellipse')ctx.ellipse(x+width/2,y+height/2,width/2,height/2,0,0,Math.PI*2)
  else if(type==='rounded')ctx.roundRect(x,y,width,height,radius)
  else ctx.rect(x,y,width,height)
  ctx.clip()
}
export function pointInMediaMask(raw,dimensions,x,y){
  const mask=mediaMaskGeometry(raw,dimensions)
  if(!mask)return true
  const dx=Math.abs(x-(mask.x+mask.width/2)),dy=Math.abs(y-(mask.y+mask.height/2)),rx=mask.width/2,ry=mask.height/2
  if(dx>rx || dy>ry)return false
  if(mask.type==='ellipse')return (dx/rx)**2+(dy/ry)**2<=1+1e-10
  if(!mask.radius || dx<=rx-mask.radius || dy<=ry-mask.radius)return true
  return (dx-rx+mask.radius)**2+(dy-ry+mask.radius)**2<=mask.radius**2+1e-10
}
