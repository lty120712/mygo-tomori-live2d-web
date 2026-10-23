export const TEXT_CLIP_LIMIT=512
export const TEXT_FONTS=[{value:'sans-serif',label:'系统黑体'},{value:'serif',label:'系统宋体'},{value:'monospace',label:'等宽字体'},{value:'Microsoft YaHei',label:'微软雅黑'},{value:'KaiTi',label:'楷体'}]
export const isTextClip=clip=>clip?.media==='text' && !clip.model
const clamp=(value,fallback,min,max)=>Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback
const color=(value,fallback)=>/^#[\da-f]{6}$/i.test(value || '') ? value : fallback
export function normalizeTextStyle(raw={}){
  raw=raw && typeof raw==='object' ? raw : {}
  return {
    fontFamily:TEXT_FONTS.some(f=>f.value===raw.fontFamily) ? raw.fontFamily : 'sans-serif',
    fontSize:clamp(raw.fontSize,48,8,200),color:color(raw.color,'#ffffff'),bold:raw.bold===true,italic:raw.italic===true,
    align:['left','center','right'].includes(raw.align) ? raw.align : 'center',width:clamp(raw.width,640,80,1920),
    strokeWidth:clamp(raw.strokeWidth,2,0,20),strokeColor:color(raw.strokeColor,'#000000'),
    shadow:raw.shadow===true,shadowColor:color(raw.shadowColor,'#000000'),shadowBlur:clamp(raw.shadowBlur,6,0,30),
    shadowX:clamp(raw.shadowX,2,-50,50),shadowY:clamp(raw.shadowY,2,-50,50),
  }
}
export const normalizeText=value=>typeof value==='string' ? value.replace(/\r\n?/g,'\n').slice(0,2000) : '请输入文字'
let measureContext
const layouts=new WeakMap()
export function textFont(style){
  const family=['sans-serif','serif','monospace'].includes(style.fontFamily) ? style.fontFamily : `"${style.fontFamily}"`
  return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${family}, sans-serif`
}
export function layoutText(clip,measure){
  const cacheable=!measure,signature=JSON.stringify([clip.text,clip.textStyle])
  if(cacheable && layouts.get(clip)?.signature===signature)return layouts.get(clip).layout
  const style=normalizeTextStyle(clip.textStyle),font=textFont(style)
  if(!measure && typeof document!=='undefined'){
    measureContext ||= document.createElement('canvas').getContext('2d')
    measureContext.font=font;measure=value=>measureContext.measureText(value).width
  }
  measure ||= value=>[...value].length*style.fontSize*.6
  const lines=[]
  for(const paragraph of normalizeText(clip.text).split('\n')){
    let line=''
    for(const character of paragraph){
      if(line && measure(line+character)>style.width){lines.push(line);line=''}
      line+=character
    }
    lines.push(line)
  }
  const padding=style.strokeWidth+(style.shadow ? style.shadowBlur*2+Math.max(Math.abs(style.shadowX),Math.abs(style.shadowY)) : 0)+2
  const lineHeight=style.fontSize*1.35
  const width=Math.max(style.width,...lines.map(measure))+padding*2
  const layout={style,font,lines,padding,lineHeight,width,height:Math.max(1,lines.length)*lineHeight+padding*2}
  if(cacheable)layouts.set(clip,{signature,layout})
  return layout
}
export function paintText(ctx,clip){
  const layout=layoutText(clip),{style,lines,padding,lineHeight,width,height}=layout
  ctx.save();ctx.font=layout.font;ctx.textAlign=style.align;ctx.textBaseline='middle';ctx.lineJoin='round'
  const x=style.align==='left' ? -width/2+padding : style.align==='right' ? width/2-padding : 0
  lines.forEach((line,index)=>{
    const y=-height/2+padding+lineHeight*(index+.5)
    ctx.shadowColor=style.shadow ? style.shadowColor : 'transparent';ctx.shadowBlur=style.shadow ? style.shadowBlur : 0
    ctx.shadowOffsetX=style.shadow ? style.shadowX : 0;ctx.shadowOffsetY=style.shadow ? style.shadowY : 0
    if(style.strokeWidth){ctx.lineWidth=style.strokeWidth*2;ctx.strokeStyle=style.strokeColor;ctx.strokeText(line,x,y);ctx.shadowColor='transparent'}
    ctx.fillStyle=style.color;ctx.fillText(line,x,y)
  })
  ctx.restore()
}
