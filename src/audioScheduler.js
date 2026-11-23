import { audioFilterSpec, planAudioPlayback } from './mediaTracks.js'
import { assetStore } from './assetStore.js'

/**
 * 音频调度：把「播放头 → 要启动的音频源」这段纯计划落到 Web Audio 上。
 *
 * - 每个片段一个 AudioBufferSourceNode，解码结果按 assetId 缓存；
 * - 片段链路是 source → gain → 可选滤镜 → master，音量自动化点由播放计划给出；
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
  const problems = new Set()
  let context = null, master = null, mixer = null, sources = []
  let clips = [], trackState = {}
  let started = false
  let epoch = 0

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
      const decodingContext = context
      const pending = Promise.resolve()
        .then(() => loadFile(assetId))
        .then(async file => {
          if (context !== decodingContext) return null
          if (!file) { problems.add(assetId); return null }
          const decoded = await decode(decodingContext, file)
          if (context !== decodingContext) return null
          if (decoded) buffers.set(assetId, decoded)
          else problems.add(assetId)
          return decoded || null
        })
        .catch(() => { if (context === decodingContext) problems.add(assetId); return null })
        .finally(() => { if (decoding.get(assetId) === pending) decoding.delete(assetId) })
      decoding.set(assetId, pending)
    }
    return decoding.get(assetId)
  }

  function stopAll() {
    for (const source of sources) { try { source.stop() } catch {} }
    sources = []
  }

  function boundedPlan(time,endTime){
    if(time>=endTime)return []
    return planAudioPlayback(clips,time,{trackState,includeFuture:true})
      .filter(entry=>entry.delay<endTime-time-1e-8)
      .map(entry=>({...entry,duration:Math.min(entry.duration,endTime-time-entry.delay)}))
  }

  /** 按给定播放头时间重新排一遍音源：先全部解出缓冲，再统一从一个时刻起播。 */
  async function play(time = 0,{endTime=Infinity}={}) {
    const request = ++epoch
    started = true
    stopAll()
    await ensure()
    if (request !== epoch) return []
    const anchor = context.currentTime
    let plan = boundedPlan(time,endTime)
    if (!plan.length) { started = true; return [] }
    await Promise.all(plan.map(entry => buffer(entry.assetId)))
    if (!context || request !== epoch) return []
    plan = boundedPlan(time+context.currentTime-anchor,endTime)
    const base = context.currentTime + lookahead
    plan.forEach(entry => {
      const when = base + entry.delay
      const audioBuffer = buffers.get(entry.assetId)
      if (!audioBuffer || entry.duration <= 0) return
      const source = context.createBufferSource()
      source.buffer = audioBuffer
      const gain = context.createGain()
      // 落点相同则保持，落点不同才拉斜坡，因此纯粹的淡入淡出仍是原来的两条自动化。
      let last = entry.gain
      gain.gain.setValueAtTime(last, when)
      for (const cue of entry.cues || []) {
        const at = when + Math.max(0, cue.delay)
        if (cue.value === last) gain.gain.setValueAtTime(cue.value, at)
        else gain.gain.linearRampToValueAtTime(cue.value, at)
        last = cue.value
      }
      source.connect(gain)
      const filter = audioFilterSpec(entry.filter)
      if (filter.type !== 'none') {
        const node = context.createBiquadFilter()
        node.type = filter.type
        node.frequency.value = filter.frequency
        node.Q.value = filter.q
        gain.connect(node)
        node.connect(master)
      } else gain.connect(master)
      source.start(when, entry.offset, entry.duration)
      sources.push(source)
    })
    started = true
    return plan
  }

  function pause() {
    epoch++
    stopAll()
    started = false
  }

  function seek(time = 0) {
    if (!started) return Promise.resolve([])
    return play(time)
  }

  /** 片段表与轨道静音/独奏状态一起更新：两者都影响要启动哪些音源。 */
  function setClips(next, state = {}) {
    clips = Array.isArray(next) ? next : []
    trackState = state || {}
  }

  function destroy() {
    epoch++
    stopAll()
    started = false
    buffers.clear()
    decoding.clear()
    problems.clear()
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
    async prepare(range) {
      await ensure()
      await Promise.all((range ? boundedPlan(range.start,range.end) : clips).map(clip=>buffer(clip.assetId)))
    },
    destroy,
    get problems() { return [...problems] },
    get playing() { return started },
    get masterGain() { return master },
    get stream() { return mixer ? mixer.stream : null },
  }
}
