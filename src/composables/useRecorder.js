import { ref } from 'vue'

const OUTPUT_W = 1080
const OUTPUT_H = 1920

export function useRecorder() {
  const isRecording = ref(false)
  const canRecord = ref(typeof MediaRecorder !== 'undefined')

  let mediaRecorder = null
  let chunks = []
  let animFrameId = null
  let outCvs = null
  let outCtx = null
  let audioCtx = null
  let audioDest = null
  let bgImage = null

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
      if (!audioDest) {
        audioDest = audioCtx.createMediaStreamDestination()
      }
      const src = audioCtx.createMediaElementSource(audioEl)
      src.connect(audioDest)
      src.connect(audioCtx.destination)
    } catch (e) { /* already connected or other error */ }
  }

  function start(sourceCanvas, audioEl) {
    if (!canRecord.value || isRecording.value) return

    loadBg()
    setupAudio(audioEl)

    outCvs = document.createElement('canvas')
    outCvs.width = OUTPUT_W
    outCvs.height = OUTPUT_H
    outCtx = outCvs.getContext('2d')

    const stream = outCvs.captureStream(30)

    if (audioDest) {
      const audioTrack = audioDest.stream.getAudioTracks()[0]
      if (audioTrack) stream.addTrack(audioTrack)
    }

    chunks = []
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' })

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'tomori_' + Date.now() + '.webm'
      a.click()
      URL.revokeObjectURL(url)
      cleanup()
    }

    mediaRecorder.start()
    isRecording.value = true
    renderLoop(sourceCanvas)
  }

  function renderLoop(sourceCanvas) {
    if (!isRecording.value) return
    if (!outCtx || !outCvs) return

    const sw = sourceCanvas.width
    const sh = sourceCanvas.height

    const targetRatio = OUTPUT_W / OUTPUT_H
    const cropW = Math.min(sw, sh * targetRatio)
    const cropH = Math.min(sh, sw / targetRatio)
    const sx = (sw - cropW) / 2
    const sy = (sh - cropH) / 2

    outCtx.fillStyle = '#0a0a1a'
    outCtx.fillRect(0, 0, OUTPUT_W, OUTPUT_H)

    if (bgImage && bgImage.complete) {
      const imgRatio = bgImage.width / bgImage.height
      const outRatio = OUTPUT_W / OUTPUT_H
      let dw, dh, dx, dy
      if (imgRatio > outRatio) {
        dh = OUTPUT_H; dw = OUTPUT_H * imgRatio; dx = (OUTPUT_W - dw) / 2; dy = 0
      } else {
        dw = OUTPUT_W; dh = OUTPUT_W / imgRatio; dx = 0; dy = (OUTPUT_H - dh) / 2
      }
      outCtx.drawImage(bgImage, dx, dy, dw, dh)
    }

    outCtx.drawImage(sourceCanvas, sx, sy, cropW, cropH, 0, 0, OUTPUT_W, OUTPUT_H)

    animFrameId = requestAnimationFrame(() => renderLoop(sourceCanvas))
  }

  function stop() {
    if (!isRecording.value) return
    isRecording.value = false
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop()
    }
    cleanup()
  }

  function cleanup() {
    if (animFrameId) cancelAnimationFrame(animFrameId)
    animFrameId = null
    outCvs = null
    outCtx = null
  }

  return {
    isRecording,
    canRecord,
    start,
    stop,
  }
}
