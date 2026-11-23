// 字体随应用分发；工程只保存稳定的 family 名称，不依赖外部 CDN。
export const BUNDLED_TEXT_FONTS=[
  {value:'Noto Sans SC',label:'思源黑体 · 简体',file:'NotoSansSC.ttf',weight:'100 900'},
  {value:'ZCOOL XiaoWei',label:'站酷小薇体 · 宋体',file:'ZCOOLXiaoWei.ttf'},
  {value:'ZCOOL KuaiLe',label:'站酷快乐体 · 活泼',file:'ZCOOLKuaiLe.ttf'},
  {value:'ZCOOL QingKe HuangYou',label:'站酷庆科黄油体 · 圆体',file:'ZCOOLQingKeHuangYou.ttf'},
  {value:'Ma Shan Zheng',label:'马善政楷书 · 毛笔',file:'MaShanZheng.ttf'},
  {value:'Long Cang',label:'龙藏体 · 手写',file:'LongCang.ttf'},
]
export const SYSTEM_TEXT_FONTS=[{value:'sans-serif',label:'系统黑体'},{value:'serif',label:'系统宋体'},{value:'monospace',label:'等宽字体'},{value:'Microsoft YaHei',label:'微软雅黑'},{value:'KaiTi',label:'楷体'}]
export const TEXT_FONTS=[...BUNDLED_TEXT_FONTS,...SYSTEM_TEXT_FONTS]
export function createTextFontLoader({createFace,addFace,baseUrl='',changed=()=>{},timeoutMs=30000}){
  const pending=new Map()
  return function load(family){
    const font=BUNDLED_TEXT_FONTS.find(f=>f.value===family)
    if(!font)return Promise.resolve()
    if(!pending.has(family)){
      const promise=Promise.resolve().then(async()=>{
        const face=createFace(family,`url("${baseUrl}fonts/${font.file}")`,{weight:font.weight || '400'})
        let timer
        try{
          await Promise.race([face.load(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('加载超时')),timeoutMs)})])
        }finally{clearTimeout(timer)}
        addFace(face);changed()
      }).catch(error=>{pending.delete(family);throw new Error(`${font.label}加载失败，请重试：${error.message}`)})
      pending.set(family,promise)
    }
    return pending.get(family)
  }
}
let revision=0
export const textFontRevision=()=>revision
export const ensureTextFont=createTextFontLoader({
  baseUrl:import.meta.env?.BASE_URL || '/',
  createFace:(...args)=>new FontFace(...args),addFace:face=>document.fonts.add(face),changed:()=>revision++,
})
export const ensureClipFonts=clips=>Promise.all([...new Set(clips.filter(c=>c.media==='text').map(c=>c.textStyle?.fontFamily))].map(ensureTextFont))
