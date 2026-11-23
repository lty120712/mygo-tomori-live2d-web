import {planAudioPlayback,audioFilterSpec} from './mediaTracks.js'
import {checkExportAbort} from './offlineVideoExport.js'

export function wavHeader(frames,sampleRate=48000,channels=2){
  const bytes=new Uint8Array(44),v=new DataView(bytes.buffer),text=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)))
  text(0,'RIFF');v.setUint32(4,36+frames*channels*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,frames*channels*2,true);return bytes
}
export function pcm16(buffer,offset=0,length=buffer.length-offset){
  const out=new Uint8Array(length*4),view=new DataView(out.buffer),left=buffer.getChannelData(0),right=buffer.getChannelData(Math.min(1,buffer.numberOfChannels-1))
  for(let i=0;i<length;i++)for(let ch=0;ch<2;ch++){const x=Math.max(-1,Math.min(1,(ch?right:left)[i+offset]));view.setInt16((i*2+ch)*2,Math.round(x*(x<0?32768:32767)),true)}
  return out
}
export async function renderOfflineAudio({clips,duration,startTime=0,loadFile,signal,progress=()=>{},Context=globalThis.OfflineAudioContext,sampleRate=48000}){
  if(!clips.length)return null
  if(!Context)throw new Error('当前浏览器不支持离线混音，请选择兼容导出')
  const decoder=new Context(2,1,sampleRate),buffers=new Map()
  for(const clip of clips){
    checkExportAbort(signal);if(buffers.has(clip.assetId))continue
    const blob=await loadFile(clip.assetId);checkExportAbort(signal)
    if(!blob){buffers.set(clip.assetId,null);continue}
    try{buffers.set(clip.assetId,await decoder.decodeAudioData(await blob.arrayBuffer()))}
    catch{if(clip.media!=='video')throw new Error('音频无法解码：'+clip.name);buffers.set(clip.assetId,null)}
  }
  checkExportAbort(signal)
  if(![...buffers.values()].some(Boolean))return null
  const frames=Math.ceil(duration*sampleRate),origin=Math.round(startTime*sampleRate),parts=[wavHeader(frames,sampleRate)]
  // 分段混音，不为整个长工程创建巨大的浮点输出缓冲。
  for(let start=0;start<frames;start+=sampleRate*10){
    checkExportAbort(signal)
    // 前滚一秒再裁掉，用于延续跨分块的滤镜状态，避免接缝处重新从静止状态起振。
    const length=Math.min(sampleRate*10,frames-start),warmup=Math.min(sampleRate,origin+start),ctx=new Context(2,length+warmup,sampleRate)
    for(const entry of planAudioPlayback(clips,(origin+start-warmup)/sampleRate,{includeFuture:true})){
      const buffer=buffers.get(entry.assetId),available=(length+warmup)/sampleRate-entry.delay
      if(!buffer || available<=0 || entry.offset>=buffer.duration)continue
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer
      gain.gain.setValueAtTime(entry.gain,entry.delay)
      let last=entry.gain
      for(const cue of entry.cues || []){const at=entry.delay+Math.max(0,cue.delay);if(cue.value===last)gain.gain.setValueAtTime(cue.value,at);else gain.gain.linearRampToValueAtTime(cue.value,at);last=cue.value}
      source.connect(gain)
      const spec=audioFilterSpec(entry.filter)
      if(spec.type!=='none'){const filter=ctx.createBiquadFilter();filter.type=spec.type;filter.frequency.value=spec.frequency;filter.Q.value=spec.q;gain.connect(filter);filter.connect(ctx.destination)}else gain.connect(ctx.destination)
      source.start(entry.delay,entry.offset,Math.min(entry.duration,available,buffer.duration-entry.offset))
    }
    const mixed=await ctx.startRendering();checkExportAbort(signal)
    parts.push(pcm16(mixed,warmup,length));progress((start+length)/frames)
    await new Promise(resolve=>setTimeout(resolve,0))
  }
  return new Blob(parts,{type:'audio/wav'})
}
