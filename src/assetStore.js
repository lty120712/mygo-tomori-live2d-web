import { uid } from './sceneProject.js'
import { ASSET_STORE, openLocalDb, withStore } from './localStore.js'
import { decodeWaveform } from './audioWaveform.js'
import { detectBeats } from './audioBeats.js'

export const ASSET_LIMITS = { image: 64 * 1024 * 1024, audio: 512 * 1024 * 1024, video: 512 * 1024 * 1024 }
const LIMIT_MESSAGES = { image: '图片不能超过 64MB', audio: '音频不能超过 512MB', video: '视频不能超过 512MB' }

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/
const AUDIO_MIME = /^audio\/(mpeg|mp4|wav|x-wav|ogg|aac|flac|webm)$/
const VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-matroska|x-m4v|ogg)$/
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|flac|weba|opus)$/
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv|mkv)$/

/** 先看 MIME 再看扩展名：`audio/mp4` 的 m4a 不会被 `.mp4` 抢成视频。 */
export function kindOfFile(file) {
  const type = file.type || ''
  const name = (file.name || '').toLowerCase()
  if (AUDIO_MIME.test(type)) return 'audio'
  if (VIDEO_MIME.test(type)) return 'video'
  if (IMAGE_MIME.test(type)) return 'image'
  if (VIDEO_EXT.test(name)) return 'video'
  if (IMAGE_EXT.test(name)) return 'image'
  if (AUDIO_EXT.test(name)) return 'audio'
  return null
}

export function sizeOk(file, kind) {
  const limit = ASSET_LIMITS[kind]
  return typeof limit === 'number' && file.size <= limit
}


// 内存后端：测试用
export function memoryBackend() {
  const map = new Map()
  return {
    async list() { return [...map.values()].map(v => ({ id: v.id, meta: v.meta, blob: v.blob })) },
    async put(id, meta, blob) { map.set(id, { id, meta, blob }) },
    async get(id) { return map.get(id) },
    async delete(id) { map.delete(id) },
  }
}

// IndexedDB 后端：浏览器默认，与工程文档共用 localStore 里的统一数据库
function indexedDbBackend() {
  return {
    async list() { return (await withStore(await openLocalDb(), ASSET_STORE, 'readonly', store => store.getAll())) || [] },
    async put(id, meta, blob) { await withStore(await openLocalDb(), ASSET_STORE, 'readwrite', store => store.put({ id, meta, blob }, id)) },
    async get(id) { return (await withStore(await openLocalDb(), ASSET_STORE, 'readonly', store => store.get(id))) ?? null },
    async delete(id) { await withStore(await openLocalDb(), ASSET_STORE, 'readwrite', store => store.delete(id)) },
  }
}

// DOM 探测：图片宽高 + 缩略图
function probeImage(file) {
  return new Promise(resolve => {
    const img = new Image()
    const u = URL.createObjectURL(file)
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight
      const scale = Math.min(1, 96 / Math.max(w, h, 1))
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(w * scale))
      c.height = Math.max(1, Math.round(h * scale))
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      const thumb = c.toDataURL('image/webp', 0.8)
      URL.revokeObjectURL(u)
      resolve({ width: w, height: h, thumb })
    }
    img.onerror = () => { URL.revokeObjectURL(u); resolve({ width: 0, height: 0, thumb: '' }) }
    img.src = u
  })
}

// DOM 探测：音频时长
function probeAudio(file) {
  return new Promise(resolve => {
    const a = document.createElement('audio')
    const u = URL.createObjectURL(file)
    a.onloadedmetadata = () => {
      const d = a.duration
      URL.revokeObjectURL(u)
      resolve({ duration: Number.isFinite(d) ? d : 0 })
    }
    a.onerror = () => { URL.revokeObjectURL(u); resolve({ duration: 0 }) }
    a.preload = 'metadata'
    a.src = u
  })
}

/**
 * MediaRecorder 录出来的 WebM 不写时长，元数据里 duration 是 Infinity。
 * 定位到远超末尾的时间会逼浏览器扫完整段并回填真实时长；扫不出来就按 0（未知）处理。
 */
export function resolveWebmDuration(video, timeout = 3000) {
  return new Promise(resolve => {
    const readable = () => (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0)
    const finish = value => {
      clearTimeout(timer)
      video.removeEventListener?.('durationchange', check)
      video.removeEventListener?.('seeked', check)
      video.removeEventListener?.('timeupdate', check)
      resolve(value)
    }
    const check = () => { const duration = readable(); if (duration) finish(duration) }
    const timer = setTimeout(() => finish(readable()), timeout)
    video.addEventListener?.('durationchange', check)
    video.addEventListener?.('seeked', check)
    video.addEventListener?.('timeupdate', check)
    try { video.currentTime = 1e7 } catch { finish(0) }
  })
}

// DOM 探测：视频宽高、时长与首帧缩略图（缩略图同时用于素材卡片与时间线片段预览）
function probeVideo(file) {
  return new Promise(resolve => {
    const v = document.createElement('video')
    const u = URL.createObjectURL(file)
    let settled = false
    const done = extra => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(u)
      resolve({ width: 0, height: 0, duration: 0, thumb: '', ...extra })
    }
    // 首帧缩略图在跳转之前取，避免拿到的其实是末尾画面。
    const firstFrame = () => {
      try {
        const w = v.videoWidth, h = v.videoHeight
        if (!w || !h) return {}
        const scale = Math.min(1, 160 / Math.max(w, h))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(w * scale))
        c.height = Math.max(1, Math.round(h * scale))
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height)
        return { width: w, height: h, thumb: c.toDataURL('image/webp', .7) }
      } catch { return { width: v.videoWidth || 0, height: v.videoHeight || 0, thumb: '' } }
    }
    v.preload = 'metadata'
    v.muted = true
    v.playsInline = true
    v.onloadeddata = async () => {
      const info = firstFrame()
      const known = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
      done({ ...info, duration: known || await resolveWebmDuration(v) })
    }
    v.onerror = () => done()
    v.src = u
  })
}

export function createAssetStore(backend, options = {}) {
  const probeImageFn = options.probeImage || probeImage
  const probeAudioFn = options.probeAudio || probeAudio
  const probeVideoFn = options.probeVideo || probeVideo
  const urls = new Map()
  const waveforms = new Map()
  const beats = new Map()
  const metas = new Map()
  let ready = false

  async function init() {
    if (ready) return
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist() } catch {}
    }
    ready = true
  }

  async function list() {
    await init()
    const rows = await backend.list()
    return rows.map(r => r.meta).sort((a, b) => b.createdAt - a.createdAt)
  }

  async function importFile(file) {
    await init()
    const kind = kindOfFile(file)
    if (!kind) throw new Error('不支持的素材类型')
    if (!sizeOk(file, kind)) throw new Error(LIMIT_MESSAGES[kind] || '素材体积超出上限')
    const id = uid('asset')
    const meta = { id, kind, name: file.name || '未命名', mimeType: file.type || '', size: file.size, createdAt: Date.now() }
    Object.assign(meta, kind === 'image' ? await probeImageFn(file) : kind === 'video' ? await probeVideoFn(file) : await probeAudioFn(file))
    if (kind === 'audio') {
      try { Object.assign(meta, await (options.decodeWaveform || decodeWaveform)(file)) } catch { /* 不支持解码时仍保留素材 */ }
    }
    await backend.put(id, meta, file)
    return meta
  }

  async function blob(id) {
    await init()
    const row = await backend.get(id)
    return row ? row.blob : null
  }

  /** 按素材 ID 取元数据（含图片/视频缩略图），带内存缓存供时间线预览复用。 */
  async function meta(id) {
    await init()
    if (metas.has(id)) return metas.get(id)
    const row = await backend.get(id)
    const value = row ? row.meta : null
    if (value) metas.set(id, value)
    return value
  }

  async function remove(id) {
    await init()
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id) }
    waveforms.delete(id)
    beats.delete(id)
    metas.delete(id)
    await backend.delete(id)
  }

  async function url(id) {
    await init()
    if (urls.has(id)) return urls.get(id)
    const row = await backend.get(id)
    if (!row) return null
    const u = URL.createObjectURL(row.blob)
    urls.set(id, u)
    return u
  }

  async function waveform(id) {
    if (!waveforms.has(id)) waveforms.set(id, (async () => {
      const row = await backend.get(id)
      if (!row || row.meta.kind !== 'audio') return null
      if (row.meta.peaks?.length) return row.meta
      try {
        const result = await (options.decodeWaveform || decodeWaveform)(row.blob)
        if (!result) return null
        if (!(await backend.get(id))) return null
        const meta = { ...row.meta, ...result }
        await backend.put(id, meta, row.blob)
        metas.set(id, meta)
        return meta
      } catch { return null }
    })())
    return waveforms.get(id)
  }

  async function importFiles(files, onProgress = () => {}) {
    const imported = [], failed = []
    for (const [index, file] of Array.from(files).entries()) {
      try { imported.push(await importFile(file)) } catch (error) { failed.push({ name: file.name, message: error.message }) }
      onProgress(index + 1, files.length)
    }
    return { imported, failed }
  }

  /** 节拍点由缓存的波形峰值推导：峰值已经入 IndexedDB，这里只在内存里记一次结果。 */
  async function beatsOf(id) {
    if (!beats.has(id)) beats.set(id, (async () => {
      const meta = await waveform(id)
      if (!meta?.peaks?.length || !(meta.duration > 0)) return null
      try {
        return (options.detectBeats || detectBeats)(meta.peaks, meta.duration)
      } catch { return null }
    })())
    return beats.get(id)
  }
  return { init, list, meta, importFile, importFiles, blob, remove, url, waveform, beats: beatsOf }
}

// 浏览器默认单例
export const assetStore = typeof indexedDB !== 'undefined'
  ? createAssetStore(indexedDbBackend())
  : createAssetStore(memoryBackend())
