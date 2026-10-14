import test from 'node:test'
import assert from 'node:assert/strict'
import { useRecorder } from '../src/composables/useRecorder.js'

test('实际录制选择 MP4/WebM，下载 Blob 类型与扩展名匹配且保留混音轨', async () => {
  const originals = new Map(['MediaRecorder','HTMLCanvasElement','document','requestAnimationFrame','cancelAnimationFrame','setTimeout','URL'].map(k=>[k,globalThis[k]]))
  let recorder, blob, filename, stream
  const audioTrack={kind:'audio'}
  const ctx={fillRect(){},drawImage(){}}
  class Canvas {
    width=960; height=540
    getContext(){return ctx}
    captureStream(){stream={tracks:[],addTrack(t){this.tracks.push(t)}};return stream}
  }
  class Recorder {
    static isTypeSupported(){return true}
    constructor(_stream,opts){this.mimeType=opts.mimeType;this.state='inactive';recorder=this}
    start(){this.state='recording'}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['encoded'],{type:this.mimeType})});this.onstop()}
  }
  try {
    globalThis.HTMLCanvasElement=Canvas;globalThis.MediaRecorder=Recorder
    globalThis.document={createElement:tag=>tag==='canvas' ? new Canvas() : {click(){filename=this.download}}}
    globalThis.URL={createObjectURL(value){blob=value;return 'blob:test'},revokeObjectURL(){}}
    globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{}
    globalThis.setTimeout=()=>1
    const r=useRecorder()
    assert.equal(r.format.value,'mp4')
    for(const format of ['mp4','webm']) {
      r.format.value=format
      assert.equal(r.start(new Canvas(),{getAudioTracks:()=>[audioTrack]}),true)
      assert.equal(stream.tracks[0],audioTrack)
      r.stop()
      assert.match(blob.type,new RegExp('video/'+format))
      assert.ok(filename.endsWith('.'+format))
      assert.equal(r.isRecording.value,false)
    }
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
  } finally {
    for(const [key,value] of originals) {if(value===undefined) delete globalThis[key];else globalThis[key]=value}
  }
})
