import {normalizeTextStyle} from './textTracks.js'
export const TEXT_PRESET_KEY='text-style-presets-v1'
export const TEXT_PRESET_LIMIT=50
export function normalizeSavedPresets(value){
  if(!Array.isArray(value))return []
  const seen=new Set()
  return value.filter(p=>{
    if(!p || typeof p.id!=='string' || !/^custom:[\w-]{1,100}$/.test(p.id) || typeof p.name!=='string' || !p.name.trim() || seen.has(p.id))return false
    seen.add(p.id);return true
  }).slice(0,TEXT_PRESET_LIMIT).map(p=>({id:p.id,name:p.name.trim().slice(0,40),description:'自定义文字样式',style:normalizeTextStyle(p.style),text:p.style?.layout==='dialogue' ? '请输入对白' : '请输入文字',speaker:p.style?.layout==='dialogue' ? '说话人' : ''}))
}
export function createTextPresetStore(store,{id=()=>crypto.randomUUID()}={}){
  async function read(){const result=await store.getVersioned(TEXT_PRESET_KEY);if(!result.ok)throw new Error('读取文字预设失败');return {...result,presets:normalizeSavedPresets(result.value)}}
  async function update(mutate){
    for(let attempt=0;attempt<3;attempt++){
      const state=await read(),presets=mutate(state.presets)
      const result=await store.compareSet(TEXT_PRESET_KEY,presets,state.revision)
      if(result.ok)return presets
      if(!result.conflict)throw new Error('保存文字预设失败，请检查浏览器数据库')
    }
    throw new Error('其他页面正在修改文字预设，请重试')
  }
  return {
    list:async()=>(await read()).presets,
    save:async(name,style)=>{
      name=String(name || '').trim()
      if(!name || name.length>40)throw new Error('预设名称需为 1–40 个字符')
      const entry={id:'custom:'+id(),name,style:normalizeTextStyle(style)}
      return update(presets=>{
        if(presets.length>=TEXT_PRESET_LIMIT)throw new Error(`最多保存 ${TEXT_PRESET_LIMIT} 个自定义文字预设`)
        if(presets.some(p=>p.name===name))throw new Error('已有同名预设，请换个名称')
        return normalizeSavedPresets([...presets,entry])
      })
    },
    remove:presetId=>update(presets=>presets.filter(p=>p.id!==presetId)),
  }
}
