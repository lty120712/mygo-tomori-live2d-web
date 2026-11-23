import test from 'node:test'
import assert from 'node:assert/strict'
import {createOfflineVideoSources} from '../src/offlineVideoSources.js'
function video(){
  const listeners=new Map();let time=0
  const el={readyState:0,duration:2,seeking:false,plays:0,src:'',addEventListener:(e,f)=>{if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(f)},removeEventListener:(e,f)=>listeners.get(e)?.delete(f),fire:e=>listeners.get(e)?.forEach(f=>f()),load(){if(this.src)queueMicrotask(()=>{this.readyState=2;this.fire('loadeddata')})},pause(){},removeAttribute(){this.src=''},play(){this.plays++}}
  Object.defineProperty(el,'currentTime',{get:()=>time,set:value=>{el.seeking=true;queueMicrotask(()=>{time=value;el.seeking=false;el.fire('seeked')})}})
  return el
}
test('离线视频等加载及 seeked 后再取像素，同素材的重叠片段独立取不同帧且不播放',async()=>{
  const cache=createOfflineVideoSources({url:async()=> 'blob:video',create:video})
  const a=await cache.frame({id:'a',assetId:'same'},.3),b=await cache.frame({id:'b',assetId:'same'},1.4)
  assert.notEqual(a,b);assert.equal(a.currentTime,.3);assert.equal(b.currentTime,1.4);assert.equal(a.plays+b.plays,0)
  assert.equal((await cache.frame({id:'a'},99)).currentTime,1.999)
  cache.destroy();assert.equal(a.src,'');assert.equal(b.src,'')
})
test('缺失视频或取消定位明确结束，不交付错误帧',async()=>{
  const cache=createOfflineVideoSources({url:async()=>null,create:video})
  await assert.rejects(cache.frame({id:'missing',name:'丢失'},0),/缺失/);cache.destroy()
  const controller=new AbortController();controller.abort()
  await assert.rejects(cache.frame({id:'a'},0,controller.signal),/取消/)
})
