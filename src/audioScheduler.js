import { planAudioPlayback } from './mediaTracks.js'
import { assetStore } from './assetStore.js'

/**
 * 音频调度：把「播放头 → 要启动的音频源」这段纯计划落到 Web Audio 上。
 *
 * - 每个片段一个 AudioBufferSourceNode，解码结果按 assetId 缓存；
 * - 所有音源都排在同一个起始时刻，因此多条叠放不会互相错开；
 * - 播放、跳帧、循环回绕都重新计算计划，不依赖累计时间，不会漂移；
 * - masterGain 同时接扬声器与 MediaStreamDestination，后者供录制混音。
 *
 * 上下文、素材读取与解码都可注入，方便在无浏览器环境测试。
 */

function defaultOpenContext() {
  const Ctor = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null)
  if (!Ctor) throw new Error('当前浏览器不支持 Web Audio')
  return new Ctor()
}

async function defaultDecode(context, file) {
  const data = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file
  return context.decodeAudioData(data)
}

export function createAudioScheduler(options = {}) {
  const {
    openContext = defaultOpenContext,
    loadFile = id => assetStore.blob(id),
    decode = defaultDecode,
    lookahead = 0.03,
  } = options

  const buffers = new Map()
  const decoding = new Map()
  let context = null, master = null, mixer = null, sources = []
  let clips = []
  let started = false

  function ensure() {
    if (!context) {
      context = openContext()
      master = context.createGain()
      master.gain.value = 1
      master.connect(context.destination)
      mixer = context.createMediaStreamDestination()
      master.connect(mixer)
    }
    const resumed = context.state === 'suspended' ? Promise.resolve(context.resume()).catch(() => {}) : Promise.resolve()
    return resumed.then(() => context)
  }

  function buffer(assetId) {
    if (buffers.has(assetId)) return Promise.resolve(buffers.get(assetId))
    if (!decoding.has(assetId)) {
      decoding.set(assetId, Promise.resolve()
        .then(() => loadFile(assetId))
        .then(async file => {
          if (!file) return null
          const decoded = await decode(context, file)
          if (decoded) buffers.set(assetId, decoded)
          return decoded || null
        })
        .catch(() => null)
        .finally(() => decoding.delete(assetId)))
    }
    return decoding.get(assetId)
  }

  function stopAll() {
    for (const source of sources) { try { source.stop() } catch {} }
    sources = []
  }

  /** 按给定播放头时间重新排一遍音源：先全部解出缓冲，再统一从一个时刻起播。 */
  async function play(time = 0) {
    await ensure()
    stopAll()
    const plan = planAudioPlayback(clips, time)
    if (!plan.length) { started = true; return [] }
    const decoded = await Promise.all(plan.map(entry => buffer(entry.assetId)))
    if (!context) return []
    const when = context.currentTime + lookahead
    plan.forEach((entry, index) => {
      const audioBuffer = decoded[index]
      if (!audioBuffer || entry.duration <= 0) return
      const source = context.createBufferSource()
      source.buffer = audioBuffer
      const gain = context.createGain()
      gain.gain.setValueAtTime(entry.gain, when)
      if (entry.fadeIn > 0 && entry.volume > entry.gain) gain.gain.linearRampToValueAtTime(entry.volume, when + entry.fadeIn)
      const endsAt = when + entry.duration
      if (entry.fadeOut > 0) {
        const fadeStart = endsAt - entry.fadeOut
        if (fadeStart > when) gain.gain.setValueAtTime(entry.volume, fadeStart)
        gain.gain.linearRampToValueAtTime(0, endsAt)
      }
      source.connect(gain)
      gain.connect(master)
      source.start(when, entry.offset, entry.duration)
      sources.push(source)
    })
    started = true
    return plan
  }

  function pause() {
    stopAll()
    started = false
  }

  function seek(time = 0) {
    if (!started) return Promise.resolve([])
    return play(time)
  }

  function setClips(next) {
    clips = Array.isArray(next) ? next : []
  }

  function destroy() {
    stopAll()
    started = false
    buffers.clear()
    decoding.clear()
    if (context) {
      try { context.close() } catch {}
      context = null; master = null; mixer = null
    }
  }

  return {
    setClips,
    play,
    pause,
    seek,
    resume: ensure,
    destroy,
    get playing() { return started },
    get masterGain() { return master },
    get stream() { return mixer ? mixer.stream : null },
  }
}
