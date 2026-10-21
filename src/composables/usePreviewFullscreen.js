import { ref, onMounted, onBeforeUnmount } from 'vue'

/** 原生全屏不可用（例如嵌入页面未授权）时，仍可铺满应用视口。 */
export function usePreviewFullscreen(target) {
  const active = ref(false)
  let nativeActive = false, enteredElement = null
  function changed() {
    if(document.fullscreenElement === enteredElement && enteredElement){
      nativeActive=true;active.value=true
    }else if(nativeActive){nativeActive=false;active.value=false}
  }
  async function enter() {
    if(active.value || !target.value)return
    enteredElement=target.value
    active.value=true
    try { await enteredElement.requestFullscreen?.() } catch { /* 使用应用内全屏 */ }
  }
  async function exit() {
    active.value=false
    if(document.fullscreenElement===enteredElement && enteredElement){
      try{await document.exitFullscreen()}catch{}
    }
    nativeActive=false
  }
  function keydown(event) {
    if(active.value && event.key==='Escape'){
      event.preventDefault();event.stopPropagation();exit()
    }
  }
  onMounted(()=>{
    document.addEventListener('fullscreenchange',changed)
    document.addEventListener('keydown',keydown,true)
  })
  onBeforeUnmount(()=>{
    document.removeEventListener('fullscreenchange',changed)
    document.removeEventListener('keydown',keydown,true)
    exit()
  })
  return { active, enter, exit }
}
