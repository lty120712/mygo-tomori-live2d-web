import { init } from 'l2d'
import { isolateModelDisposal,isolateModelTiming,resetModelPose,renderModelNow } from './live2dSceneAdapter.js'
const cache=new Map()
let queue=Promise.resolve(),database=null
function db(){
  return database ||= new Promise(resolve=>{
    if(!globalThis.indexedDB){resolve(null);return}
    const request=indexedDB.open('tomori-model-portraits',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('images')
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>resolve(null)
    request.onblocked=()=>resolve(null)
  })
}
async function stored(key,value){
  try{const connection=await db();if(!connection)return null
    return await new Promise(resolve=>{const tx=connection.transaction('images',value ? 'readwrite' : 'readonly'),store=tx.objectStore('images'),request=value ? store.put(value,key) : store.get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>resolve(null);tx.onabort=()=>resolve(null)})
  }catch{return null}
}
function removeTracking(sdk){
  const legacy=sdk?._state?.l2d2Model,modern=sdk?._state?.l2d6Model
  if(legacy?._boundMouseEvent){document.removeEventListener('mousemove',legacy._boundMouseEvent);document.removeEventListener('mouseout',legacy._boundMouseEvent)}
  if(modern?.mouseMoveEventListener)document.removeEventListener('mousemove',modern.mouseMoveEventListener)
  if(modern?.mouseEndedEventListener)document.removeEventListener('mouseout',modern.mouseEndedEventListener)
  if(modern?.tapEventListener)document.removeEventListener('pointerdown',modern.tapEventListener)
}
async function renderPortrait(model){
  const host=document.createElement('div');host.setAttribute('aria-hidden','true');host.style.cssText='position:fixed;left:-10000px;top:0;width:960px;height:540px;pointer-events:none'
  const canvas=document.createElement('canvas');canvas.width=960;canvas.height=540;host.append(canvas);document.body.append(host)
  let sdk
  try{
    sdk=init(canvas);await sdk.load({path:'/models/'+model.category+'/'+model.name+'/'+model.entry,scale:1})
    isolateModelDisposal(sdk);isolateModelTiming(sdk);removeTracking(sdk);resetModelPose(sdk)
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))
    renderModelNow(sdk)
    const source=sdk.getCanvas(),capture=document.createElement('canvas');capture.width=source.width;capture.height=source.height
    const ctx=capture.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0)
    const data=ctx.getImageData(0,0,capture.width,capture.height).data
    let left=capture.width,right=-1,top=capture.height,bottom=-1
    for(let y=0;y<capture.height;y+=2)for(let x=0;x<capture.width;x+=2)if(data[(y*capture.width+x)*4+3]>30){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
    if(right<left)throw new Error('模型画面尚未就绪')
    const side=Math.max(48,(bottom-top)*.29),x=(left+right-side)/2,y=top-side*.05
    const portrait=document.createElement('canvas');portrait.width=128;portrait.height=128
    portrait.getContext('2d').drawImage(capture,x,y,side,side,0,0,128,128)
    return portrait.toDataURL('image/webp',.9)
  }finally{
    try{
      if(sdk){isolateModelDisposal(sdk);removeTracking(sdk);sdk.destroy()}
    }finally{host.remove()}
  }
}
export function getModelPortrait(model,shouldLoad=()=>true){
  const key='v1:'+model.category+'/'+model.name+'/'+model.entry
  if(cache.has(key))return Promise.resolve(cache.get(key))
  const job=queue.then(async()=>{
    if(!shouldLoad())return null
    const cached=cache.get(key) || await stored(key)
    if(cached){cache.set(key,cached);return cached}
    if(!shouldLoad())return null
    const result=await renderPortrait(model);cache.set(key,result);await stored(key,result);return result
  })
  queue=job.catch(()=>{})
  return job
}
