import test from 'node:test'
import assert from 'node:assert/strict'
import { useRecorder } from '../src/composables/useRecorder.js'

test('实际录制选择 MP4/WebM，下载 Blob 类型与扩展名匹配且保留混音轨', async () => {
  const originals = new Map(['MediaRecorder','HTMLCanvasElement','document','requestAnimationFrame','cancelAnimationFrame','setTimeout','URL'].map(k=>[k,globalThis[k]]))
  let recorder, blob, filename, stream, recorderOptions, outputCanvas
  const audioTrack={kind:'audio'}
  const ctx={fillRect(){},drawImage(){}}
  class Canvas {
    width=960; height=540
    getContext(){return ctx}
    captureStream(){stream={tracks:[],addTrack(t){this.tracks.push(t)}};return stream}
  }
  class Recorder {
    static isTypeSupported(){return true}
    constructor(_stream,opts){recorderOptions=opts;this.mimeType=opts.mimeType;this.state='inactive';recorder=this}
    start(){this.state='recording'}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['encoded'],{type:this.mimeType})});this.onstop()}
  }
  try {
    globalThis.HTMLCanvasElement=Canvas;globalThis.MediaRecorder=Recorder
    globalThis.document={createElement:tag=>tag==='canvas' ? (outputCanvas=new Canvas()) : {click(){filename=this.download}}}
    globalThis.URL={createObjectURL(value){blob=value;return 'blob:test'},revokeObjectURL(){}}
    globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{}
    globalThis.setTimeout=()=>1
    let nativeFinalized=0
    const r=useRecorder({convert:async input=>{assert.match(input.type,/video\/mp4/);nativeFinalized++;return new Blob(['indexed mp4'],{type:'video/mp4'})}})
    assert.equal(r.format.value,'mp4')
    for(const format of ['mp4','webm']) {
      r.format.value=format
      assert.equal(r.start(new Canvas(),{getAudioTracks:()=>[audioTrack]}),true)
      assert.equal(outputCanvas.width,1920);assert.equal(outputCanvas.height,1080)
      assert.equal(recorderOptions.videoBitsPerSecond,12000000);assert.equal(recorderOptions.audioBitsPerSecond,192000)
      assert.equal(stream.tracks[0],audioTrack)
      r.stop()
      await new Promise(resolve=>setImmediate(resolve))
      assert.match(blob.type,new RegExp('video/'+format))
      assert.ok(filename.endsWith('.'+format))
      assert.equal(r.isRecording.value,false)
    }
    assert.equal(nativeFinalized,1)
    r.resolution.value='720';r.quality.value='maximum'
    const portrait=new Canvas();portrait.width=540;portrait.height=960
    assert.equal(r.start(portrait,null,'canvas',null,null,60),true)
    assert.equal(outputCanvas.width,720);assert.equal(outputCanvas.height,1280)
    assert.equal(recorderOptions.videoBitsPerSecond,17777778)
    r.stop();await new Promise(resolve=>setImmediate(resolve))
    r.resolution.value='540';r.quality.value='standard'
    assert.equal(r.start(new Canvas()),true)
    assert.equal(outputCanvas.width,960);assert.equal(outputCanvas.height,540)
    assert.equal(recorderOptions.videoBitsPerSecond,1500000)
    r.stop();await new Promise(resolve=>setImmediate(resolve))
    r.destroy()
    Recorder.isTypeSupported=type=>type==='video/webm'
    let finishConversion
    const fallback=useRecorder({convert:async input=>{
      assert.match(input.type,/webm/)
      return new Promise(resolve=>finishConversion=resolve)
    }})
    assert.equal(fallback.format.value,'mp4')
    fallback.start(new Canvas(),{getAudioTracks:()=>[audioTrack]})
    filename=null;fallback.stop()
    assert.equal(fallback.isExporting.value,true)
    assert.equal(filename,null)
    assert.equal(fallback.start(new Canvas()),false)
    finishConversion(new Blob(['mp4'],{type:'video/mp4'}))
    await new Promise(resolve=>setImmediate(resolve))
    assert.ok(filename.endsWith('.mp4'))
    assert.equal(blob.type,'video/mp4')
    assert.equal(fallback.isExporting.value,false)
    fallback.destroy()
    const failed=useRecorder({convert:async()=>{throw new Error('转码失败')}})
    failed.start(new Canvas());filename=null;failed.stop()
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(filename,null)
    assert.match(failed.error.value,/转码失败/)
    assert.equal(failed.isExporting.value,false)
    failed.destroy()
    Recorder.isTypeSupported=()=>true
    const nativeFailed=useRecorder({convert:async input=>{assert.match(input.type,/mp4/);throw new Error('索引整理失败')}})
    nativeFailed.start(new Canvas());filename=null;nativeFailed.stop()
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(filename,null);assert.match(nativeFailed.error.value,/索引整理失败/);assert.equal(nativeFailed.isExporting.value,false);nativeFailed.destroy()
    let finishNative,nativeSignal
    const cancelled=useRecorder({convert:async(_input,settings)=>{nativeSignal=settings.signal;settings.progress(.5);return new Promise(resolve=>finishNative=resolve)}})
    cancelled.start(new Canvas());filename=null;cancelled.stop();assert.equal(cancelled.isExporting.value,true);assert.equal(cancelled.progress.value,.5)
    cancelled.destroy();assert.equal(nativeSignal.aborted,true);finishNative(new Blob(['indexed'],{type:'video/mp4'}))
    await new Promise(resolve=>setImmediate(resolve));assert.equal(filename,null);assert.equal(cancelled.isExporting.value,false)
  } finally {
    for(const [key,value] of originals) {if(value===undefined) delete globalThis[key];else globalThis[key]=value}
  }
})
