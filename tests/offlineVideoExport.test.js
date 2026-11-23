import test from 'node:test'
import assert from 'node:assert/strict'
import {encodeTimeline,frameTiming} from '../src/offlineVideoExport.js'
import {wavHeader,pcm16,renderOfflineAudio} from '../src/offlineAudio.js'

function encoderHarness(){
  const frames=[],encoders=[]
  class Frame{constructor(canvas,timing){Object.assign(this,{canvas,...timing});frames.push(this)}close(){this.closed=true}}
  class Encoder{
    static async isConfigSupported(){return {supported:true}}
    state='unconfigured';encodeQueueSize=0;chunks=[]
    constructor(callbacks){this.callbacks=callbacks;encoders.push(this)}
    configure(config){this.config=config;this.state='configured'}
    encode(frame,options){this.encodeQueueSize++;this.chunks.push([frame,options])}
    async flush(){for(const [frame] of this.chunks)this.callbacks.output({byteLength:1,copyTo:bytes=>bytes[0]=frame.canvas.index});this.chunks=[];this.encodeQueueSize=0}
    close(){this.state='closed'}
  }
  return {Encoder,Frame,frames,encoders}
}
test('逐帧编码按项目帧率生成每一帧，帧时间无累计误差，关闭每个 VideoFrame',async()=>{
  const h=encoderHarness(),indices=[]
  const result=await encodeTimeline({...h,width:1280,height:720,fps:30,duration:2.01,videoBitsPerSecond:6000000,frameAt:async index=>{indices.push(index);return {index}}})
  assert.equal(indices.length,61);assert.deepEqual(indices,Array.from({length:61},(_,i)=>i))
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],indices)
  assert.ok(h.frames.every(f=>f.closed));assert.equal(h.encoders[0].state,'closed');assert.equal(h.encoders[0].config.avc.format,'annexb')
  for(const fps of [24,30,60]){let elapsed=0;for(let i=0;i<600*fps;i++){const t=frameTiming(i,fps);assert.equal(t.timestamp,elapsed);elapsed+=t.duration}assert.equal(elapsed,600000000)}
})
test('快速编码可取消；不支持配置、编码出错时明确失败而非生成半成品',async()=>{
  const h=encoderHarness(),controller=new AbortController()
  await assert.rejects(encodeTimeline({...h,width:960,height:540,fps:30,duration:1,signal:controller.signal,frameAt:async index=>{if(index===2)controller.abort();return {index}}}),/取消/)
  assert.equal(h.encoders[0].state,'closed');assert.equal(h.frames.length,2);assert.ok(h.frames.every(f=>f.closed))
  h.Encoder.isConfigSupported=async()=>({supported:false})
  await assert.rejects(encodeTimeline({...h}),/不支持/)
  const broken=encoderHarness();broken.Encoder.prototype.encode=function(){this.callbacks.error(new Error('编码失败'))}
  await assert.rejects(encodeTimeline({...broken,fps:30,duration:1,frameAt:async()=>({})}),/编码失败/)
})
test('离线 WAV 头、双声道交错、幅度裁剪和分块偏移正确',()=>{
  const header=new DataView(wavHeader(120,48000).buffer)
  assert.equal(header.getUint32(24,true),48000);assert.equal(header.getUint32(40,true),480)
  const pcm=new DataView(pcm16({length:4,numberOfChannels:1,getChannelData:()=>new Float32Array([2,-2,.5,0])},1,2).buffer)
  assert.equal(pcm.byteLength,8);assert.equal(pcm.getInt16(0,true),-32768);assert.equal(pcm.getInt16(2,true),-32768);assert.equal(pcm.getInt16(4,true),16384)
})
test('离线混音按源入点、音量自动化、滤镜与分块前滚排程；无音频不创建上下文',async()=>{
  const contexts=[]
  class Context{
    constructor(channels,length,rate){Object.assign(this,{channels,length,rate,destination:{},starts:[],cues:[]});contexts.push(this)}
    async decodeAudioData(){return {duration:30}}
    createBufferSource(){return {connect(){},start:(...args)=>this.starts.push(args)}}
    createGain(){return {connect(){},gain:{setValueAtTime:(...args)=>this.cues.push(['set',...args]),linearRampToValueAtTime:(...args)=>this.cues.push(['ramp',...args])}}}
    createBiquadFilter(){const node={connect(){},frequency:{},Q:{}};this.filter=node;return node}
    async startRendering(){return {length:this.length,numberOfChannels:2,getChannelData:()=>new Float32Array(this.length)}}
  }
  assert.equal(await renderOfflineAudio({clips:[],Context}),null);assert.equal(contexts.length,0)
  const clips=[{id:'a',assetId:'a',name:'audio',start:2,duration:10,offset:3,volume:.5,fadeIn:1,fadeOut:1,filter:'lowpass'}]
  const blob=await renderOfflineAudio({clips,duration:12,Context,sampleRate:10,loadFile:async()=>new Blob(['audio'])})
  assert.equal(blob.size,44+120*4);assert.deepEqual(contexts[1].starts,[[2,3,8]])
  assert.deepEqual(contexts[2].starts,[[0,10,3]]);assert.equal(contexts[2].length,30)
  assert.equal(contexts[1].filter.type,'lowpass');assert.ok(contexts[1].cues.some(c=>c[0]==='ramp'))
  contexts.length=0
  const segment=await renderOfflineAudio({clips,duration:2,startTime:5,Context,sampleRate:10,loadFile:async()=>new Blob(['audio'])})
  assert.equal(segment.size,44+20*4)
  assert.equal(contexts[1].length,30,'导出区间前滚一秒，但不写入输出')
  assert.deepEqual(contexts[1].starts,[[0,5,3]],'保持素材入点：从工程第4秒预热，输出第5秒至第7秒')
  assert.deepEqual(contexts[1].cues[0],['set',.5,0],'从区间中部开始时不重复片段淡入')
})
