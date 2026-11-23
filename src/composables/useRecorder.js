import { ref } from 'vue'
import { DEFAULT_BG_COLOR } from '../background.js'
import { recordingFormats } from '../recordingFormats.js'
import { videoExportSettings } from '../videoExportSettings.js'
import {encodeTimeline,checkExportAbort} from '../offlineVideoExport.js'

/** 导出视频的帧率 */
const RECORD_FPS = 30

function supportsCaptureStream() {
  return typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

export function useRecorder(options = {}) {
  const encode=options.encode || encodeTimeline
  const mux=options.mux || ((video,audio,settings)=>import('../mp4Transcoder.js').then(m=>m.muxTimelineMp4(video,audio,settings)))
  const convert = options.convert || ((blob, settings) => import('../mp4Transcoder.js').then(m=>m.transcodeMp4(blob,settings)))
  const formats = recordingFormats()
  const format = ref(formats.find(f => f.id === 'mp4')?.id || formats[0]?.id || '')
  const isRecording = ref(false)
  const isPreparing = ref(false)
  const range=ref(null)
  const isExporting = ref(false)
  const progress = ref(0)
  const error = ref('')
  const resolution = ref('1080'), quality = ref('high')
  const offlineAvailable=typeof VideoEncoder!=='undefined' && typeof VideoFrame!=='undefined'
  const method=ref(offlineAvailable?'offline':'realtime'),phase=ref('')
  let exportController = null
  let destroyed = false
  let operation = 0
  const canRecord = ref(
    typeof MediaRecorder !== 'undefined' && supportsCaptureStream() && formats.length > 0
  )

  let mediaRecorder = null
  let videoTracks = []
  let chunks = []
  let animFrameId = null
  let outCvs = null
  let outCtx = null
  let readBackground = null
  let readViewRect = null
  let mode = 'canvas'

  /**
   * 铺兜底背景：合成画布本身已经按播放头画好背景（见 mediaTracks.paintBackground），
   * 这里只保证录制画面不透底，颜色取自工程当前的背景解析结果。
   */
  function paintBackground(ctx, width, height) {
    const background = readBackground && readBackground()
    ctx.fillStyle = (background && background.color) || DEFAULT_BG_COLOR
    ctx.fillRect(0, 0, width, height)
  }

  /** 音频轨道混音由 audioScheduler 的 masterGain 提供，这里只把它的音轨并进导出流。 */
  function audioTrackOf(audioStream) {
    return audioStream?.getAudioTracks?.()[0] || null
  }

  /**
   * 画面放大后画布会比可视区大，录制的应当是可视区那一块，
   * 否则放大 / 拖动之后就录不到眼睛看到的构图。
   */
  function viewWindow(sourceCanvas) {
    const cvsW = sourceCanvas.width
    const cvsH = sourceCanvas.height
    const view = readViewRect && readViewRect()
    if (!view || !(view.sw > 0) || !(view.sh > 0)) {
      return { sx: 0, sy: 0, sw: cvsW, sh: cvsH }
    }
    const sw = Math.min(cvsW, Math.round(view.sw))
    const sh = Math.min(cvsH, Math.round(view.sh))
    return {
      sx: Math.max(0, Math.min(cvsW - sw, Math.round(view.sx))),
      sy: Math.max(0, Math.min(cvsH - sh, Math.round(view.sy))),
      sw,
      sh,
    }
  }

  function drawFrame(sourceCanvas) {
    if (!outCtx || !outCvs) return
    const win = viewWindow(sourceCanvas)
    if (!win.sw || !win.sh) return

    const outW = outCvs.width
    const outH = outCvs.height

    paintBackground(outCtx, outW, outH)

    if (mode === 'portrait') {
      // 裁切到目标比例后再缩放，保证模型不被拉伸变形
      const targetRatio = outW / outH
      const cropW = Math.min(win.sw, win.sh * targetRatio)
      const cropH = Math.min(win.sh, win.sw / targetRatio)
      const sx = win.sx + (win.sw - cropW) / 2
      const sy = win.sy + (win.sh - cropH) / 2
      outCtx.drawImage(sourceCanvas, sx, sy, cropW, cropH, 0, 0, outW, outH)
    } else {
      outCtx.drawImage(sourceCanvas, win.sx, win.sy, win.sw, win.sh, 0, 0, outW, outH)
    }
  }

  function downloadBlob(blob, extension) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tomori_' + Date.now() + '.' + extension
    a.click()
    // 立即释放会让部分浏览器来不及读取，稍微延后
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function start(sourceCanvas, audioStream, nextMode = 'canvas', getBackground = null, getViewRect = null, fps = RECORD_FPS) {
    if (destroyed || !canRecord.value || isPreparing.value || isRecording.value || isExporting.value || !sourceCanvas) return false
    const current=++operation
    error.value = ''
    phase.value='recording'
    progress.value = 0

    mode = nextMode === 'portrait' ? 'portrait' : 'canvas'
    readBackground = typeof getBackground === 'function' ? getBackground : null
    readViewRect = typeof getViewRect === 'function' ? getViewRect : null
    const mixedTrack = audioTrackOf(audioStream)

    const win = viewWindow(sourceCanvas)
    const settings=videoExportSettings({resolution:resolution.value,quality:quality.value,fps,portrait:mode==='portrait' || win.sh>win.sw})
    const size = {width:settings.width,height:settings.height}
    outCvs = document.createElement('canvas')
    outCvs.width = size.width
    outCvs.height = size.height
    outCtx = outCvs.getContext('2d')

    try {
      const stream = outCvs.captureStream([24, 30, 60].includes(fps) ? fps : RECORD_FPS)
      videoTracks = stream.getVideoTracks?.() || []
      if (mixedTrack) stream.addTrack(mixedTrack)

      const selectedFormat = formats.find(f => f.id === format.value)
      if (!selectedFormat) throw new Error('当前浏览器不支持所选视频格式')
      const mimeType = selectedFormat.mimeType
      chunks = []
      mediaRecorder = new MediaRecorder(stream, { ...(mimeType ? {mimeType}:{}),videoBitsPerSecond:settings.videoBitsPerSecond,audioBitsPerSecond:settings.audioBitsPerSecond })
      const recording=mediaRecorder
      mediaRecorder.ondataavailable = (e) => {
        if(current!==operation)return
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.onerror = (e) => {
        if(current!==operation)return
        cancel()
        error.value='视频导出失败：'+(e?.error?.message || '录制中断，请重试或降低分辨率')
      }
      mediaRecorder.onstop = async () => {
        if(current!==operation)return
        isRecording.value=false
        const blob = new Blob(chunks, { type: recording.mimeType || mimeType })
        chunks = []
        cleanup()
        mediaRecorder=null
        isExporting.value = true
        phase.value='muxing'
        const controller = new AbortController()
        exportController = controller
        progress.value = 0
        try {
          if(blob.size){
            // Native MP4 also needs a complete seek index; never download fragmented recorder chunks directly.
            const output=selectedFormat.id==='mp4'
              ? await convert(blob,{progress:value=>{if(current===operation)progress.value=Math.max(progress.value,Math.max(0,Math.min(1,Number(value)||0)))},signal:controller.signal,videoBitsPerSecond:settings.videoBitsPerSecond}) : blob
            if(!destroyed && current===operation && !controller.signal.aborted)downloadBlob(output, selectedFormat.id)
          }else{
            throw new Error('没有生成有效视频，请重试')
          }
        } catch(e) {
          if(!destroyed && current===operation)error.value='视频导出失败：'+(e?.message || String(e))
        } finally {
          if(current===operation){exportController=null;isExporting.value=false}
        }
      }
      // 分片采集，停止时合并为完整文件。
      mediaRecorder.start(1000)
    } catch (err) {
      cancel()
      error.value='无法开始录制：'+(err?.message || String(err))
      return false
    }

    isRecording.value = true
    renderLoop(sourceCanvas)
    return true
  }

  function renderLoop(sourceCanvas) {
    if (!isRecording.value) return
    drawFrame(sourceCanvas)
    animFrameId = requestAnimationFrame(() => renderLoop(sourceCanvas))
  }

  function stop() {
    if (!isRecording.value) return
    isRecording.value = false
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      isExporting.value = true
      // 下载与清理交给 onstop，确保拿到最后一个分片
      mediaRecorder.stop()
    } else {
      cleanup()
    }
  }

  function cleanup() {
    for(const track of videoTracks)track.stop()
    videoTracks=[]
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    outCvs = null
    outCtx = null
  }

  function cancel() {
    ++operation
    exportController?.abort()
    exportController=null
    isRecording.value = false
    isPreparing.value = false
    isExporting.value = false
    progress.value = 0
    phase.value=''
    range.value=null
    cleanup()
    if (mediaRecorder) {
      mediaRecorder.ondataavailable = null
      mediaRecorder.onstop = null
      mediaRecorder.onerror = null
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      mediaRecorder = null
    }
    chunks = []
  }

  function destroy() {
    destroyed = true
    cancel()
  }

  async function exportOffline({duration,fps,portrait,frameAt,renderAudio}){
    if(destroyed || isPreparing.value || isRecording.value || isExporting.value)return false
    const current=++operation,controller=new AbortController()
    exportController=controller;isExporting.value=true;phase.value='rendering';progress.value=0;error.value=''
    const settings=videoExportSettings({resolution:resolution.value,quality:quality.value,fps,portrait})
    const report=value=>{if(current===operation)progress.value=value}
    try{
      const video=await encode({...settings,duration,frameAt,signal:controller.signal,progress:report})
      checkExportAbort(controller.signal)
      phase.value='audio';progress.value=0
      const audio=await renderAudio(controller.signal,report)
      checkExportAbort(controller.signal)
      phase.value='muxing';progress.value=0
      const blob=await mux(video,audio,{fps:settings.fps,signal:controller.signal,progress:report})
      checkExportAbort(controller.signal)
      if(!destroyed && current===operation && !controller.signal.aborted)downloadBlob(blob,'mp4')
      return true
    }catch(e){if(!destroyed && current===operation)error.value='视频导出失败：'+(e?.message || String(e));return false}
    finally{if(current===operation){isExporting.value=false;exportController=null;phase.value=''}}
  }

  function beginPreparation(){
    if(destroyed || isPreparing.value || isRecording.value || isExporting.value)return null
    const current=++operation,controller=new AbortController()
    exportController=controller;isPreparing.value=true;phase.value='preparing';progress.value=0;error.value=''
    return {signal:controller.signal,finish(){if(current===operation){isPreparing.value=false;exportController=null;phase.value=''}}}
  }

  return {
    isRecording,
    isPreparing,
    range,
    isExporting,
    progress,
    error,
    canRecord,
    formats,
    format,
    resolution,
    quality,
    method,
    phase,
    offlineAvailable,
    exportOffline,
    beginPreparation,
    start,
    stop,
    cancel,
    destroy,
  }
}
