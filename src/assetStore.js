import { uid } from './sceneProject.js'
import { ASSET_STORE, openLocalDb, withStore } from './localStore.js'
import { decodeWaveform } from './audioWaveform.js'

export const ASSET_LIMITS = { image: 64 * 1024 * 1024, audio: 512 * 1024 * 1024 }

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/
const AUDIO_MIME = /^audio\/(mpeg|mp4|wav|x-wav|ogg|aac|flac|webm)$/
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|flac|weba|opus)$/

export function kindOfFile(file) {
  const name = (file.name || '').toLowerCase()
  if (IMAGE_MIME.test(file.type) || IMAGE_EXT.test(name)) return 'image'
  if (AUDIO_MIME.test(file.type) || AUDIO_EXT.test(name)) return 'audio'
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

export function createAssetStore(backend, options = {}) {
  const probeImageFn = options.probeImage || probeImage
  const probeAudioFn = options.probeAudio || probeAudio
  const urls = new Map()
  const waveforms = new Map()
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
    if (!sizeOk(file, kind)) throw new Error(kind === 'image' ? '图片不能超过 64MB' : '音频不能超过 512MB')
    const id = uid('asset')
    const meta = { id, kind, name: file.name || '未命名', mimeType: file.type || '', size: file.size, createdAt: Date.now() }
    Object.assign(meta, kind === 'image' ? await probeImageFn(file) : await probeAudioFn(file))
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

  async function remove(id) {
    await init()
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id) }
    waveforms.delete(id)
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
  return { init, list, importFile, importFiles, blob, remove, url, waveform }
}

// 浏览器默认单例
export const assetStore = typeof indexedDB !== 'undefined'
  ? createAssetStore(indexedDbBackend())
  : createAssetStore(memoryBackend())
