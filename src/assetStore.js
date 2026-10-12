import { uid } from './sceneProject.js'

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

// IndexedDB 后端：浏览器默认
function indexedDbBackend() {
  let db = null
  function open() {
    if (db) return Promise.resolve(db)
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('tomori-assets', 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('assets')) req.result.createObjectStore('assets')
      }
      req.onsuccess = () => { db = req.result; resolve(db) }
      req.onerror = () => reject(req.error)
    })
  }
  return {
    async list() {
      const d = await open()
      return new Promise((resolve, reject) => {
        const r = d.transaction('assets').objectStore('assets').getAll()
        r.onsuccess = () => resolve(r.result || [])
        r.onerror = () => reject(r.error)
      })
    },
    async put(id, meta, blob) {
      const d = await open()
      return new Promise((resolve, reject) => {
        const tx = d.transaction('assets', 'readwrite')
        tx.objectStore('assets').put({ id, meta, blob }, id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
    async get(id) {
      const d = await open()
      return new Promise((resolve, reject) => {
        const r = d.transaction('assets').objectStore('assets').get(id)
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => reject(r.error)
      })
    },
    async delete(id) {
      const d = await open()
      return new Promise((resolve, reject) => {
        const tx = d.transaction('assets', 'readwrite')
        tx.objectStore('assets').delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    },
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

  return { init, list, importFile, blob, remove, url }
}

// 浏览器默认单例
export const assetStore = typeof indexedDB !== 'undefined'
  ? createAssetStore(indexedDbBackend())
  : createAssetStore(memoryBackend())