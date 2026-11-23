import {TEXT_FONTS,textFontRevision} from './textFonts.js'
import {normalizeTextAnimation,textGraphemes} from './textAnimation.js'
export {TEXT_FONTS} from './textFonts.js'
export const TEXT_CLIP_LIMIT=512
export const isTextClip=clip=>clip?.media==='text' && !clip.model
const clamp=(value,fallback,min,max)=>Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback
const color=(value,fallback)=>/^#[\da-f]{6}$/i.test(value || '') ? value : fallback
export function normalizeTextStyle(raw={}){
  raw=raw && typeof raw==='object' ? raw : {}
  return {
    ...normalizeTextAnimation(raw),
    fontFamily:TEXT_FONTS.some(f=>f.value===raw.fontFamily) ? raw.fontFamily : 'sans-serif',
    fontSize:clamp(raw.fontSize,48,8,200),color:color(raw.color,'#ffffff'),bold:raw.bold===true,italic:raw.italic===true,
    align:['left','center','right'].includes(raw.align) ? raw.align : 'center',width:clamp(raw.width,640,80,1920),
    strokeWidth:clamp(raw.strokeWidth,2,0,20),strokeColor:color(raw.strokeColor,'#000000'),
    shadow:raw.shadow===true,shadowColor:color(raw.shadowColor,'#000000'),shadowBlur:clamp(raw.shadowBlur,6,0,30),
    shadowX:clamp(raw.shadowX,2,-50,50),shadowY:clamp(raw.shadowY,2,-50,50),
    layout:raw.layout==='dialogue' ? 'dialogue' : 'plain',
    speakerSize:clamp(raw.speakerSize,26,8,100),speakerColor:color(raw.speakerColor,'#ffffff'),divider:raw.divider!==false,
    boxColor:color(raw.boxColor,'#17151d'),boxOpacity:clamp(raw.boxOpacity,.65,0,1),boxPadding:clamp(raw.boxPadding,20,0,120),
    boxMinHeight:clamp(raw.boxMinHeight,156,40,540),boxRadius:clamp(raw.boxRadius,0,0,80),boxBorderWidth:clamp(raw.boxBorderWidth,1,0,10),boxBorderColor:color(raw.boxBorderColor,'#aaa0b1'),
  }
}
export const normalizeText=value=>typeof value==='string' ? value.replace(/\r\n?/g,'\n').slice(0,2000) : '请输入文字'
export const normalizeSpeaker=value=>typeof value==='string' ? value.replace(/\s+/g,' ').slice(0,80) : ''
let measureContext
const layouts=new WeakMap()
export function textFont(style){
  const family=['sans-serif','serif','monospace'].includes(style.fontFamily) ? style.fontFamily : `"${style.fontFamily}"`
  return `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${family}, sans-serif`
}
export function layoutText(clip,measure){
  const cacheable=!measure,signature=JSON.stringify([clip.text,clip.speaker,clip.textStyle,textFontRevision()])
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
    for(const character of textGraphemes(paragraph)){
      if(line && measure(line+character)>style.width){lines.push(line);line=''}
      line+=character
    }
    lines.push(line)
  }
  const padding=style.strokeWidth+(style.shadow ? style.shadowBlur*2+Math.max(Math.abs(style.shadowX),Math.abs(style.shadowY)) : 0)+2+(style.layout==='dialogue' ? style.boxPadding+style.boxBorderWidth : 0)
  const lineHeight=style.fontSize*1.35
  const width=Math.max(style.width,...lines.map(measure))+padding*2
  const speakerFont=textFont({...style,fontSize:style.speakerSize,bold:true,italic:false})
  let speaker=style.layout==='dialogue' ? normalizeSpeaker(clip.speaker).trim() : ''
  if(speaker){
    if(cacheable && measureContext)measureContext.font=speakerFont
    if(measure(speaker)>style.width){let characters=[...speaker];while(characters.length && measure(characters.join('')+'…')>style.width)characters.pop();speaker=characters.join('')+'…'}
    if(cacheable && measureContext)measureContext.font=font
  }
  const headerHeight=speaker ? style.speakerSize*1.35+(style.divider ? 12 : 8) : 0
  const lineCharacters=lines.map(textGraphemes),characterCount=lineCharacters.reduce((n,line)=>n+line.length,0)
  const layout={style,font,lines,lineCharacters,characterCount,padding,lineHeight,width,speaker,speakerFont,headerHeight,height:Math.max(style.layout==='dialogue' ? style.boxMinHeight : 0,Math.max(1,lines.length)*lineHeight+padding*2+headerHeight)}
  if(cacheable)layouts.set(clip,{signature,layout})
  return layout
}
export function paintText(ctx,clip,{reveal=Infinity}={}){
  const layout=layoutText(clip),{style,lines,padding,lineHeight,width,height}=layout
  ctx.save();ctx.font=layout.font;ctx.textAlign=style.align;ctx.textBaseline='middle';ctx.lineJoin='round'
  if(style.layout==='dialogue'){
    const left=-width/2,top=-height/2,r=Math.min(style.boxRadius,width/2,height/2),edge=style.boxBorderWidth/2
    ctx.save();ctx.shadowColor='transparent'
    ctx.beginPath();ctx.roundRect(left+edge,top+edge,width-edge*2,height-edge*2,r)
    ctx.save();ctx.globalAlpha*=style.boxOpacity;ctx.fillStyle=style.boxColor;ctx.fill();ctx.restore()
    if(style.boxBorderWidth){ctx.strokeStyle=style.boxBorderColor;ctx.lineWidth=style.boxBorderWidth;ctx.globalAlpha*=.55;ctx.stroke()}
    ctx.restore()
    if(layout.speaker){
      ctx.save();ctx.font=layout.speakerFont;ctx.textAlign='left';ctx.fillStyle=style.speakerColor;ctx.shadowColor='transparent'
      ctx.fillText(layout.speaker,left+padding,top+padding+style.speakerSize*1.35/2)
      if(style.divider){const y=top+padding+style.speakerSize*1.35+6;ctx.globalAlpha*=.45;ctx.strokeStyle=style.boxBorderColor;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left+padding,y);ctx.lineTo(width/2-padding,y);ctx.stroke()}
      ctx.restore()
    }
  }
  const x=style.align==='left' ? -width/2+padding : style.align==='right' ? width/2-padding : 0
  let remaining=reveal===Infinity ? Infinity : Math.floor(layout.characterCount*Math.max(0,Math.min(1,reveal)))
  lines.forEach((fullLine,index)=>{
    const characters=reveal===Infinity ? null : layout.lineCharacters[index],line=characters ? characters.slice(0,remaining).join('') : fullLine
    if(characters)remaining=Math.max(0,remaining-characters.length)
    const y=-height/2+padding+layout.headerHeight+lineHeight*(index+.5)
    ctx.shadowColor=style.shadow ? style.shadowColor : 'transparent';ctx.shadowBlur=style.shadow ? style.shadowBlur : 0
    ctx.shadowOffsetX=style.shadow ? style.shadowX : 0;ctx.shadowOffsetY=style.shadow ? style.shadowY : 0
    // 沿用完整行的起点，居中／右对齐的文字不会随着逐字出现左右跳动。
    const lineX=characters ? x-(style.align==='center' ? ctx.measureText(fullLine).width/2 : style.align==='right' ? ctx.measureText(fullLine).width : 0) : x
    ctx.textAlign=characters ? 'left' : style.align
    if(style.strokeWidth){ctx.lineWidth=style.strokeWidth*2;ctx.strokeStyle=style.strokeColor;ctx.strokeText(line,lineX,y);ctx.shadowColor='transparent'}
    ctx.fillStyle=style.color;ctx.fillText(line,lineX,y)
  })
  ctx.restore()
}
