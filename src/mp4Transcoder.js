import { FFmpeg } from '@ffmpeg/ffmpeg'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import classWorkerURL from '../node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker&url'

/** 单线程本地转码，不上传视频、不依赖 SharedArrayBuffer。 */
export async function transcodeMp4(blob, { progress = () => {}, signal } = {}) {
  const ffmpeg = new FFmpeg()
  const abort = () => ffmpeg.terminate()
  signal?.addEventListener('abort', abort, { once:true })
  try {
    if(signal?.aborted)throw new Error('视频导出已取消')
    await ffmpeg.load({ coreURL, wasmURL, classWorkerURL })
    ffmpeg.on('progress', event => progress(Math.max(0,Math.min(1,event.progress))))
    await ffmpeg.writeFile('input.webm', new Uint8Array(await blob.arrayBuffer()))
    const result = await ffmpeg.exec(['-i','input.webm','-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','output.mp4'])
    if(result!==0)throw new Error('MP4 转换失败，请重试或选择 WebM')
    const bytes = await ffmpeg.readFile('output.mp4')
    if(!bytes.length)throw new Error('MP4 文件为空')
    return new Blob([bytes], {type:'video/mp4'})
  } finally {
    signal?.removeEventListener('abort',abort)
    ffmpeg.terminate()
  }
}
