import { ref } from 'vue'
import { DEFAULT_BG_COLOR } from '../background.js'
import { recordingFormats } from '../recordingFormats.js'

/** 导出视频的帧率 */
const RECORD_FPS = 30
/** 竖屏导出的固定尺寸（9:16） */
const PORTRAIT_W = 1080
const PORTRAIT_H = 1920
/** 跟随画布比例时，最长边不超过这个值 */
const MAX_LONG_EDGE = 1920

/** 视频编码器要求宽高为偶数，否则部分浏览器会直接报错 */
function toEven(value) {
  return Math.max(2, Math.round(value / 2) * 2)
}

function supportsCaptureStream() {
  return typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
}

export function useRecorder() {
  const formats = recordingFormats()
  const format = ref(formats.find(f => f.id === 'mp4')?.id || formats[0]?.id || '')
  const isRecording = ref(false)
  const canRecord = ref(
    typeof MediaRecorder !== 'undefined' && supportsCaptureStream() && formats.length > 0
  )

  let mediaRecorder = null
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
   * 计算导出分辨率。
   * - canvas：跟随画布比例，所见即所得
   * - portrait：固定 9:16，画面中心裁切后铺满
   */
  function resolveOutputSize(sourceWidth, sourceHeight, nextMode) {
    if (nextMode === 'portrait') {
      return { width: PORTRAIT_W, height: PORTRAIT_H }
    }
    const sw = sourceWidth || PORTRAIT_W
    const sh = sourceHeight || PORTRAIT_H
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(sw, sh))
    return { width: toEven(sw * scale), height: toEven(sh * scale) }
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
    if (!canRecord.value || isRecording.value || !sourceCanvas) return false

    mode = nextMode === 'portrait' ? 'portrait' : 'canvas'
    readBackground = typeof getBackground === 'function' ? getBackground : null
    readViewRect = typeof getViewRect === 'function' ? getViewRect : null
    const mixedTrack = audioTrackOf(audioStream)

    const win = viewWindow(sourceCanvas)
    const size = resolveOutputSize(win.sw, win.sh, mode)
    outCvs = document.createElement('canvas')
    outCvs.width = size.width
    outCvs.height = size.height
    outCtx = outCvs.getContext('2d')

    try {
      const stream = outCvs.captureStream([24, 30, 60].includes(fps) ? fps : RECORD_FPS)
      if (mixedTrack) stream.addTrack(mixedTrack)

      const selectedFormat = formats.find(f => f.id === format.value)
      if (!selectedFormat) throw new Error('当前浏览器不支持所选视频格式')
      const mimeType = selectedFormat.mimeType
      chunks = []
      mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.onerror = (e) => {
        console.error('录制失败:', e?.error || e)
        stop()
      }
      mediaRecorder.onstop = () => {
        if (chunks.length) downloadBlob(new Blob(chunks, { type: mediaRecorder.mimeType || mimeType }), selectedFormat.id)
        chunks = []
        cleanup()
      }
      // 分片写入，长视频不会一直堆在内存里
      mediaRecorder.start(1000)
    } catch (err) {
      console.error('无法开始录制:', err)
      cleanup()
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
      // 下载与清理交给 onstop，确保拿到最后一个分片
      mediaRecorder.stop()
    } else {
      cleanup()
    }
  }

  function cleanup() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    outCvs = null
    outCtx = null
  }

  function destroy() {
    isRecording.value = false
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

  return {
    isRecording,
    canRecord,
    formats,
    format,
    start,
    stop,
    destroy,
  }
}
