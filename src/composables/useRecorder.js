import { ref } from 'vue'

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
  const isRecording = ref(false)
  const canRecord = ref(
    typeof MediaRecorder !== 'undefined' && supportsCaptureStream()
  )

  let mediaRecorder = null
  let chunks = []
  let animFrameId = null
  let outCvs = null
  let outCtx = null
  let audioCtx = null
  let audioDest = null
  let bgImage = null
  let mode = 'canvas'

  function loadBg() {
    if (bgImage) return
    bgImage = new Image()
    bgImage.src = '/bg-character.png'
  }

  function setupAudio(audioEl) {
    if (!audioEl) return
    try {
      if (!audioCtx) audioCtx = new AudioContext()
      if (audioCtx.state === 'suspended') audioCtx.resume()
      if (!audioDest) audioDest = audioCtx.createMediaStreamDestination()
      const src = audioCtx.createMediaElementSource(audioEl)
      src.connect(audioDest)
      src.connect(audioCtx.destination)
    } catch {
      // 同一个媒体元素只能创建一次 source，重复调用会抛错，忽略即可
    }
  }

  /**
   * 计算导出分辨率。
   * - canvas：跟随画布比例，所见即所得
   * - portrait：固定 9:16，画面中心裁切后铺满
   */
  function resolveOutputSize(sourceCanvas, nextMode) {
    if (nextMode === 'portrait') {
      return { width: PORTRAIT_W, height: PORTRAIT_H }
    }
    const sw = sourceCanvas.width || PORTRAIT_W
    const sh = sourceCanvas.height || PORTRAIT_H
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(sw, sh))
    return { width: toEven(sw * scale), height: toEven(sh * scale) }
  }

  function drawCoverImage(ctx, img, width, height) {
    const imgRatio = img.naturalWidth / img.naturalHeight
    const outRatio = width / height
    let dw, dh, dx, dy
    if (imgRatio > outRatio) {
      dh = height
      dw = height * imgRatio
      dx = (width - dw) / 2
      dy = 0
    } else {
      dw = width
      dh = width / imgRatio
      dx = 0
      dy = (height - dh) / 2
    }
    ctx.drawImage(img, dx, dy, dw, dh)
  }

  function drawFrame(sourceCanvas) {
    if (!outCtx || !outCvs) return
    const sw = sourceCanvas.width
    const sh = sourceCanvas.height
    if (!sw || !sh) return

    const outW = outCvs.width
    const outH = outCvs.height

    outCtx.fillStyle = '#0a0a1a'
    outCtx.fillRect(0, 0, outW, outH)

    if (bgImage && bgImage.complete && bgImage.naturalWidth) {
      drawCoverImage(outCtx, bgImage, outW, outH)
    }

    if (mode === 'portrait') {
      // 裁切到目标比例后再缩放，保证模型不被拉伸变形
      const targetRatio = outW / outH
      const cropW = Math.min(sw, sh * targetRatio)
      const cropH = Math.min(sh, sw / targetRatio)
      const sx = (sw - cropW) / 2
      const sy = (sh - cropH) / 2
      outCtx.drawImage(sourceCanvas, sx, sy, cropW, cropH, 0, 0, outW, outH)
    } else {
      outCtx.drawImage(sourceCanvas, 0, 0, sw, sh, 0, 0, outW, outH)
    }
  }

  function pickMimeType() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ]
    return candidates.find(type => MediaRecorder.isTypeSupported(type)) || ''
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tomori_' + Date.now() + '.webm'
    a.click()
    // 立即释放会让部分浏览器来不及读取，稍微延后
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function start(sourceCanvas, audioEl, nextMode = 'canvas') {
    if (!canRecord.value || isRecording.value || !sourceCanvas) return false

    mode = nextMode === 'portrait' ? 'portrait' : 'canvas'
    loadBg()
    setupAudio(audioEl)

    const size = resolveOutputSize(sourceCanvas, mode)
    outCvs = document.createElement('canvas')
    outCvs.width = size.width
    outCvs.height = size.height
    outCtx = outCvs.getContext('2d')

    try {
      const stream = outCvs.captureStream(RECORD_FPS)
      if (audioDest) {
        const audioTrack = audioDest.stream.getAudioTracks()[0]
        if (audioTrack) stream.addTrack(audioTrack)
      }

      const mimeType = pickMimeType()
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
        if (chunks.length) downloadBlob(new Blob(chunks, { type: 'video/webm' }))
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
    if (audioCtx) {
      audioCtx.close().catch(() => {})
      audioCtx = null
      audioDest = null
    }
  }

  return {
    isRecording,
    canRecord,
    start,
    stop,
    destroy,
  }
}
