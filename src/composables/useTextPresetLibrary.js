import {ref,onMounted} from 'vue'
import {localStore} from '../localStore.js'
import {createTextPresetStore} from '../textPresetStore.js'
export function useTextPresetLibrary(store=localStore){
  const presets=ref([]),busy=ref(false),error=ref('')
  const repository=createTextPresetStore(store)
  async function run(operation){
    if(busy.value)return false
    busy.value=true;error.value=''
    try{presets.value=await operation();return true}
    catch(e){error.value=e.message;return false}
    finally{busy.value=false}
  }
  onMounted(()=>run(()=>repository.list()))
  return {presets,busy,error,save:(name,style)=>run(()=>repository.save(name,style)),remove:id=>run(()=>repository.remove(id))}
}
