import test from 'node:test'
import assert from 'node:assert/strict'
import {useRecorder} from '../src/composables/useRecorder.js'

async function withRecorder(run){
  const originals=new Map(['MediaRecorder','HTMLCanvasElement','document','requestAnimationFrame','cancelAnimationFrame','setTimeout','URL'].map(k=>[k,globalThis[k]]))
  const state={downloads:[],videoStops:0,audioStops:0,recordings:[]}
  class Canvas{
    width=1920;height=1080
    getContext(){return {fillRect(){},drawImage(){}}}
    captureStream(){return {addTrack(){},getVideoTracks:()=>[{stop:()=>state.videoStops++}]}}
  }
  class Recorder{
    static isTypeSupported(){return true}
    constructor(_stream,options){this.mimeType=options.mimeType;this.state='inactive';state.recordings.push(this)}
    start(){this.state='recording'}
    stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['frame'],{type:this.mimeType})});this.onstop?.()}
  }
  Object.assign(globalThis,{MediaRecorder:Recorder,HTMLCanvasElement:Canvas,document:{createElement:tag=>tag==='canvas'?new Canvas():{click(){state.downloads.push(this.download)}}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout:()=>1})
  try{await run({state,Canvas,Recorder})}finally{for(const [key,value] of originals){if(value===undefined)delete globalThis[key];else globalThis[key]=value}}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve))
const mp4=()=>new Blob(['indexed'],{type:'video/mp4'})

test('准备阶段立即锁定并可取消，旧准备回调不能结束新准备，之后可正常录制',()=>withRecorder(async({state,Canvas})=>{
  const r=useRecorder({convert:async()=>mp4()}),first=r.beginPreparation()
  assert.equal(r.isPreparing.value,true);assert.equal(r.phase.value,'preparing')
  assert.equal(r.beginPreparation(),null);assert.equal(r.start(new Canvas()),false)
  assert.equal(await r.exportOffline({duration:1,fps:30}),false)
  r.cancel();assert.equal(first.signal.aborted,true);assert.equal(r.isPreparing.value,false)
  const second=r.beginPreparation();first.finish();assert.equal(r.isPreparing.value,true)
  second.finish();assert.equal(r.isPreparing.value,false);assert.equal(r.phase.value,'')
  assert.equal(r.start(new Canvas()),true);second.finish();assert.equal(r.isRecording.value,true)
  r.stop();await settle();assert.equal(state.downloads.length,1)
  const last=r.beginPreparation();r.destroy();assert.equal(last.signal.aborted,true);assert.equal(r.beginPreparation(),null)
}))

test('快速导出走逐帧编码、离线混音及封装，完全不创建 MediaRecorder',()=>withRecorder(async({state})=>{
  const phases=[]
  const r=useRecorder({encode:async config=>{assert.equal(config.width,1920);assert.equal(config.fps,30);phases.push('frames');await config.frameAt(0);return new Blob(['h264'])},mux:async(_video,audio,config)=>{assert.equal(audio.type,'audio/wav');assert.equal(config.fps,30);phases.push('mux');return mp4()}})
  assert.equal(await r.exportOffline({duration:1,fps:30,portrait:false,frameAt:async()=>phases.push('frame0'),renderAudio:async()=>{phases.push('audio');return new Blob(['wav'],{type:'audio/wav'})}}),true)
  assert.deepEqual(phases,['frames','frame0','audio','mux']);assert.equal(state.recordings.length,0);assert.equal(state.downloads.length,1);assert.equal(r.isExporting.value,false);r.destroy()
}))

test('快速导出取消后立刻重试，旧编码结果不触发混音、不覆盖新任务',()=>withRecorder(async({state})=>{
  const pending=[];let mixes=0
  const r=useRecorder({encode:settings=>new Promise(resolve=>pending.push({settings,resolve})),mux:async()=>mp4()})
  const request={duration:1,fps:30,frameAt:async()=>null,renderAudio:async()=>{mixes++;return null}}
  const first=r.exportOffline(request);r.cancel();assert.equal(pending[0].settings.signal.aborted,true)
  const second=r.exportOffline(request);pending[0].settings.progress(1);pending[0].resolve(new Blob(['old']));await first
  assert.equal(r.isExporting.value,true);assert.equal(r.progress.value,0);assert.equal(mixes,0)
  pending[1].resolve(new Blob(['new']));await second
  assert.equal(mixes,1);assert.equal(state.downloads.length,1);r.destroy()
}))

test('快速导出封装期间取消后迟到输出不下载，编码失败可返回兼容录制',()=>withRecorder(async({state,Canvas})=>{
  let finishMux
  const r=useRecorder({encode:async()=>new Blob(['h264']),mux:async()=>new Promise(resolve=>finishMux=resolve),convert:async()=>mp4()})
  const running=r.exportOffline({duration:1,fps:30,frameAt:async()=>null,renderAudio:async()=>null})
  await settle();assert.equal(r.phase.value,'muxing');r.cancel();finishMux(mp4());await running
  assert.equal(state.downloads.length,0);assert.equal(r.isExporting.value,false)
  assert.equal(r.start(new Canvas()),true);r.stop();await settle();assert.equal(state.downloads.length,1);r.destroy()
  const failed=useRecorder({encode:async()=>{throw new Error('配置不支持')}})
  assert.equal(await failed.exportOffline({duration:1,fps:30}),false);assert.match(failed.error.value,/配置不支持/);assert.equal(failed.isExporting.value,false);failed.destroy()
}))

test('取消采集丢弃分片、释放视频轨，不停止共享混音轨；之后可重新导出',()=>withRecorder(async({state,Canvas})=>{
  const r=useRecorder({convert:async()=>mp4()})
  r.start(new Canvas(),{getAudioTracks:()=>[{stop:()=>state.audioStops++}]})
  const staleStop=state.recordings[0].onstop
  r.cancel();await staleStop();await settle()
  assert.equal(r.isRecording.value,false);assert.equal(r.isExporting.value,false)
  assert.equal(state.videoStops,1);assert.equal(state.audioStops,0);assert.deepEqual(state.downloads,[])
  assert.equal(r.start(new Canvas()),true);r.stop();await settle();assert.equal(state.downloads.length,1)
  r.destroy();assert.equal(r.start(new Canvas()),false)
}))

test('取消处理后立即重试，旧任务结果、进度及结束回调均不影响新任务',()=>withRecorder(async({state,Canvas})=>{
  const pending=[]
  const r=useRecorder({convert:(_blob,settings)=>new Promise(resolve=>pending.push({settings,resolve}))})
  r.start(new Canvas());r.stop();pending[0].settings.progress(.6)
  r.cancel();assert.equal(pending[0].settings.signal.aborted,true)
  assert.equal(r.progress.value,0);assert.equal(r.isExporting.value,false)
  r.start(new Canvas());r.stop();pending[1].settings.progress(.2)
  pending[0].settings.progress(1);pending[0].resolve(mp4());await settle()
  assert.equal(r.isExporting.value,true);assert.equal(r.progress.value,.2);assert.deepEqual(state.downloads,[])
  pending[1].settings.progress(.8);pending[1].settings.progress(.4);assert.equal(r.progress.value,.8)
  pending[1].resolve(mp4());await settle()
  assert.equal(r.isExporting.value,false);assert.equal(state.downloads.length,1);r.destroy()
}))

test('录制异常明确报错且不下载残缺视频，失败后可重新导出',()=>withRecorder(async({state,Canvas})=>{
  const r=useRecorder({convert:async()=>mp4()})
  r.start(new Canvas());state.recordings[0].onerror({error:new Error('编码器中断')});await settle()
  assert.match(r.error.value,/编码器中断/);assert.equal(r.isRecording.value,false);assert.deepEqual(state.downloads,[])
  assert.equal(r.start(new Canvas()),true);assert.equal(r.error.value,'');r.stop();await settle();assert.equal(state.downloads.length,1);r.destroy()
}))

test('启动失败显示原因并释放采集轨；浏览器自行停止时同步退出录制状态',()=>withRecorder(async({state,Canvas,Recorder})=>{
  const original=Recorder.prototype.start
  Recorder.prototype.start=()=>{throw new Error('分辨率不受支持')}
  const r=useRecorder({convert:async()=>mp4()})
  assert.equal(r.start(new Canvas()),false);assert.match(r.error.value,/分辨率不受支持/)
  assert.equal(state.videoStops,1);assert.equal(r.isRecording.value,false)
  Recorder.prototype.start=original
  assert.equal(r.start(new Canvas()),true);state.recordings.at(-1).stop();await settle()
  assert.equal(r.isRecording.value,false);assert.equal(r.isExporting.value,false);assert.equal(state.downloads.length,1);r.destroy()
}))
