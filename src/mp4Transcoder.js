import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import classWorkerURL from '../node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker&url'
import {mp4ExportPlan} from './mp4Export.js'

/** 单线程本地整理索引或转码，不上传视频、不依赖 SharedArrayBuffer。 */
export async function transcodeMp4(blob, { progress = () => {}, signal, videoBitsPerSecond } = {}) {
  const ffmpeg = new FFmpeg()
  const abort = () => ffmpeg.terminate()
  signal?.addEventListener('abort', abort, { once:true })
  try {
    if(signal?.aborted)throw new Error('视频导出已取消')
    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL })
    ffmpeg.on('progress', event => progress(Math.max(0,Math.min(1,event.progress))))
    const plan=mp4ExportPlan(blob.type,{videoBitsPerSecond})
    await ffmpeg.writeFile(plan.input, new Uint8Array(await blob.arrayBuffer()))
    const result = await ffmpeg.exec(plan.args)
    if(result!==0)throw new Error('MP4 处理失败，请重试或选择 WebM')
    const bytes = await ffmpeg.readFile('output.mp4')
    if(!bytes.length)throw new Error('MP4 文件为空')
    return new Blob([bytes], {type:'video/mp4'})
  } finally {
    signal?.removeEventListener('abort',abort)
    ffmpeg.terminate()
  }
}

/** 时间线编码后的 H.264 按固定帧率封装；音频是已离线混好的 WAV。 */
export async function muxTimelineMp4(video,audio,{fps,signal,progress=()=>{}}){
  const ffmpeg=new FFmpeg(),abort=()=>ffmpeg.terminate()
  signal?.addEventListener('abort',abort,{once:true})
  try{
    if(signal?.aborted)throw new Error('视频导出已取消')
    await ffmpeg.load({coreURL,wasmURL,classWorkerURL})
    ffmpeg.on('progress',event=>progress(Math.max(0,Math.min(1,event.progress))))
    await ffmpeg.writeFile('video.h264',new Uint8Array(await video.arrayBuffer()))
    if(audio)await ffmpeg.writeFile('audio.wav',new Uint8Array(await audio.arrayBuffer()))
    const args=['-fflags','+genpts','-r',String(fps),'-i','video.h264',...(audio?['-i','audio.wav']:[]),'-map','0:v:0',...(audio?['-map','1:a:0']:[]),'-c:v','copy',...(audio?['-c:a','aac','-b:a','192k']:[]),'-movflags','+faststart','output.mp4']
    if(await ffmpeg.exec(args)!==0)throw new Error('视频文件封装失败')
    const bytes=await ffmpeg.readFile('output.mp4');if(!bytes.length)throw new Error('视频文件为空')
    return new Blob([bytes],{type:'video/mp4'})
  }finally{signal?.removeEventListener('abort',abort);ffmpeg.terminate()}
}
