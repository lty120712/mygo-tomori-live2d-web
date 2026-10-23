import {layoutText,normalizeTextStyle,normalizeSpeaker} from './textTracks.js'
// 添加时复制完整内容和样式；保存的工程不依赖预设目录。
export const TEXT_PRESETS=[
  {id:'basic',name:'基础文字',description:'自由编辑内容、字体、描边与阴影',text:'请输入文字',style:{}},
  {id:'subtitle',name:'底部字幕',description:'白字描边，自动换行并贴近画面底部',text:'请输入字幕',placement:'bottom',style:{fontSize:32,width:864,strokeWidth:2,align:'center'}},
  {id:'dialogue-dark',name:'半透明对白框',description:'说话人名称、分隔线与半透明深色底框',speaker:'旁白',text:'清晨的第一缕阳光伴随手机闹铃的滴滴声响起',style:{layout:'dialogue',fontSize:28,width:864,align:'left',strokeWidth:0,boxOpacity:.68}},
  {id:'dialogue-light',name:'浅色对白框',description:'暖白底框与圆角，适合浅色画面',speaker:'说话人',text:'在这里写下角色的对白。',style:{layout:'dialogue',fontSize:28,width:864,align:'left',strokeWidth:0,color:'#3d302d',speakerColor:'#6e4b41',boxColor:'#fff9f1',boxOpacity:.92,boxRadius:12,boxBorderColor:'#bda997'}},
]
export function textPreset(id='basic'){
  return TEXT_PRESETS.find(p=>p.id===id) || TEXT_PRESETS[0]
}
export function applyTextPreset(clip,id,canvas={width:960,height:540}){
  const preset=textPreset(id)
  clip.name=preset.name;clip.layerName=preset.name;clip.text=preset.text;clip.speaker=normalizeSpeaker(preset.speaker);clip.textStyle=normalizeTextStyle(preset.style)
  if(clip.textStyle.layout==='dialogue' || preset.placement==='bottom')placeTextAtBottom(clip,canvas)
  return clip
}
export function placeTextAtBottom(clip,canvas){
  clip.textStyle.width=Math.max(80,Math.min(clip.textStyle.width,canvas.width-48-2*layoutText(clip).padding))
  clip.transform.y=Math.max(0,canvas.height/2-layoutText(clip).height/2-24)
}
