import {ref,watch} from 'vue'
import {EXPORT_PREFERENCES_KEY,normalizeExportPreferences} from '../exportPreferences.js'

/** 与工程分开保存界面偏好；读取迟到时保留用户已编辑的字段，写入顺序保持一致。 */
export function useExportPreferences(recorder,store){
  const error=ref(''),fields=['format','resolution','quality','method'],touched=new Set()
  const capabilities={formats:recorder.formats.map(f=>f.id),offlineAvailable:recorder.offlineAvailable}
  const read=()=>Object.fromEntries(fields.map(key=>[key,recorder[key].value]))
  let restoring=false,loaded=false,closed=false,loading=null,writes=Promise.resolve()
  function save(){
    const value=normalizeExportPreferences(read(),capabilities)
    writes=writes.then(async()=>{try{error.value=await store.set(EXPORT_PREFERENCES_KEY,value)?'':'无法记住导出设置，本次仍可正常导出'}catch{error.value='无法记住导出设置，本次仍可正常导出'}})
    return writes
  }
  const stop=watch(()=>fields.map(key=>recorder[key].value),(next,previous)=>{
    if(restoring || closed)return
    if(!loaded)fields.forEach((key,i)=>{if(next[i]!==previous[i])touched.add(key)})
    else save()
  },{flush:'sync'})
  function load(){
    return loading ||= (async()=>{
      let result
      try{result=await store.get(EXPORT_PREFERENCES_KEY)}catch{result={ok:false}}
      if(closed)return
      const busy=recorder.isPreparing?.value || recorder.isRecording.value || recorder.isExporting.value
      if(result.ok && result.value && !busy){
        const saved=normalizeExportPreferences(result.value,capabilities),current=read()
        for(const key of touched)saved[key]=current[key]
        const value=normalizeExportPreferences(saved,capabilities)
        restoring=true
        try{for(const key of fields)recorder[key].value=value[key]}finally{restoring=false}
      }
      loaded=true
      if(!result.ok)error.value='无法读取上次导出设置，本次设置仍可使用'
      if(touched.size)await save()
    })()
  }
  return {error,load,flush:()=>writes,destroy(){closed=true;stop()}}
}
