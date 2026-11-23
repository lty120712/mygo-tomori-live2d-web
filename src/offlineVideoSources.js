import {checkExportAbort} from './offlineVideoExport.js'
function waitMedia(el,event,ready,signal,action=()=>{}){
  checkExportAbort(signal)
  return new Promise((resolve,reject)=>{
    const cleanup=()=>{clearTimeout(timer);el.removeEventListener(event,done);el.removeEventListener('error',fail);signal?.removeEventListener('abort',abort)}
    const done=()=>{if(ready()){cleanup();resolve()}}
    const fail=()=>{cleanup();reject(new Error('视频素材无法读取或定位'))}
    const abort=()=>{cleanup();reject(new DOMException('导出已取消','AbortError'))}
    const timer=setTimeout(fail,15000)
    el.addEventListener(event,done);el.addEventListener('error',fail);signal?.addEventListener('abort',abort,{once:true})
    try{action();done()}catch(error){cleanup();reject(error)}
  })
}
export function createOfflineVideoSources({url,create=()=>document.createElement('video')}){
  const entries=new Map()
  return {
    async frame(clip,time,signal){
      checkExportAbort(signal)
      let el=entries.get(clip.id)
      if(!el){el=create();el.muted=true;el.preload='auto';el.playsInline=true;entries.set(clip.id,el)
        const src=await url(clip.assetId);checkExportAbort(signal);if(!src)throw new Error('视频素材缺失：'+clip.name)
        await waitMedia(el,'loadeddata',()=>el.readyState>=2,signal,()=>{el.src=src;el.load()})
      }
      const target=Math.max(0,Math.min(Number.isFinite(el.duration)?el.duration-.001:time,time))
      if(Math.abs(el.currentTime-target)>1e-6 || el.seeking)await waitMedia(el,'seeked',()=>!el.seeking && el.readyState>=2 && Math.abs(el.currentTime-target)<1e-5,signal,()=>{el.currentTime=target})
      checkExportAbort(signal);return el
    },
    destroy(){for(const el of entries.values()){el.pause();el.removeAttribute('src');el.load()}entries.clear()}
  }
}
