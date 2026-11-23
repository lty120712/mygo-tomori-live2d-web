export function checkExportAbort(signal){if(signal?.aborted)throw new DOMException('导出已取消','AbortError')}
export function frameTiming(index,fps){
  const timestamp=Math.round(index*1e6/fps)
  return {timestamp,duration:Math.round((index+1)*1e6/fps)-timestamp}
}
export async function encodeTimeline({width,height,fps,duration,videoBitsPerSecond,frameAt,signal,progress=()=>{},Encoder=globalThis.VideoEncoder,Frame=globalThis.VideoFrame}){
  if(!Encoder || !Frame)throw new Error('当前浏览器不支持快速导出，请选择兼容导出')
  const config={codec:'avc1.42002a',width,height,framerate:fps,bitrate:videoBitsPerSecond,latencyMode:'realtime',avc:{format:'annexb'}}
  const support=await Encoder.isConfigSupported(config)
  if(!support.supported)throw new Error('当前设备不支持所选快速导出配置，请降低分辨率或选择兼容导出')
  checkExportAbort(signal)
  const packets=[];let failure=null
  const encoder=new Encoder({output:chunk=>{const bytes=new Uint8Array(chunk.byteLength);chunk.copyTo(bytes);packets.push(bytes)},error:error=>{failure=error}})
  const abort=()=>{if(encoder.state!=='closed')encoder.close()}
  signal?.addEventListener('abort',abort,{once:true})
  try{
    encoder.configure(config)
    const count=frameCountForDuration(duration,fps)
    for(let i=0;i<count;i++){
      checkExportAbort(signal);if(failure)throw failure
      const canvas=await frameAt(i,signal)
      checkExportAbort(signal)
      const frame=new Frame(canvas,frameTiming(i,fps))
      try{encoder.encode(frame,{keyFrame:i%(fps*2)===0})}finally{frame.close()}
      if(encoder.encodeQueueSize>=6)await encoder.flush()
      if(i%8===7)await new Promise(resolve=>setTimeout(resolve,0))
      progress((i+1)/count)
    }
    await encoder.flush();checkExportAbort(signal);if(failure)throw failure
    if(!packets.length)throw new Error('没有生成有效视频帧')
    return new Blob(packets,{type:'video/h264'})
  }finally{signal?.removeEventListener('abort',abort);abort()}
}
import {frameCountForDuration} from './timecode.js'

