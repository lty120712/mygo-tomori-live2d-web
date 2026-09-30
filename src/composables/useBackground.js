import { ref, readonly } from 'vue'
import { createBackground, DEFAULT_BG_COLOR } from '../background.js'

/**
 * 录制背景的持久化。
 *
 * 颜色很小放哪儿都行，但上传的图片不能只存地址——blob: 地址刷新后就失效了，
 * 必须把图片数据本身留下来，所以用 IndexedDB 存 Blob（localStorage 只有几 MB，
 * 一张稍大的背景图就塞不下）。启动时读回来重新生成 blob 地址，效果和刷新前一致。
 */

const DB_NAME = 'tomori-background'
const DB_VERSION = 1
const STORE = 'settings'
const RECORD_KEY = 'current'

const background = ref(createBackground())
let currentBlob = null
let objectUrl = null
let dirty = false // 用户已经改过设置，就不要再被异步读回来的旧值覆盖

function releaseObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('打开本地存储失败'))
  })
}

function withStore(mode, run) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    let result
    try {
      result = run(store)
    } catch (err) {
      db.close()
      reject(err)
      return
    }
    tx.oncomplete = () => {
      db.close()
      resolve(result && result.result !== undefined ? result.result : result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error || new Error('写入本地存储失败'))
    }
    tx.onabort = () => {
      db.close()
      reject(tx.error || new Error('写入本地存储被中断'))
    }
  }))
}

function save() {
  const record = {
    color: background.value.color || DEFAULT_BG_COLOR,
    imageName: background.value.imageName || '',
    blob: currentBlob,
  }
  return withStore('readwrite', store => store.put(record, RECORD_KEY)).catch(err => {
    // 存不下就算了，但要让调用方知道，否则用户以为背景已经保存了
    console.warn('[background] 背景设置保存失败：', err)
    throw err
  })
}

function applyImage(blob, name) {
  releaseObjectUrl()
  currentBlob = blob || null
  if (!blob) {
    background.value = { ...background.value, image: null, imageName: '' }
    return
  }
  objectUrl = URL.createObjectURL(blob)
  background.value = { ...background.value, image: objectUrl, imageName: name || '' }
}

async function init() {
  try {
    const record = await withStore('readonly', store => store.get(RECORD_KEY))
    if (dirty) return // 读取期间用户已经动过设置，以用户为准
    if (!record) return
    background.value = {
      color: record.color || DEFAULT_BG_COLOR,
      image: null,
      imageName: record.imageName || '',
    }
    if (record.blob) applyImage(record.blob, record.imageName)
  } catch (err) {
    console.warn('[background] 读取背景设置失败：', err)
  }
}

async function setColor(color) {
  dirty = true
  background.value = { ...background.value, color }
  await save().catch(() => {})
}

async function setImageFile(file) {
  dirty = true
  applyImage(file, file && file.name)
  try {
    await save()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err }
  }
}

async function clearImage() {
  dirty = true
  applyImage(null)
  await save().catch(() => {})
}

async function reset() {
  dirty = true
  releaseObjectUrl()
  currentBlob = null
  background.value = createBackground()
  await save().catch(() => {})
}

function destroy() {
  releaseObjectUrl()
}

export function useBackground() {
  return {
    background: readonly(background),
    init,
    setColor,
    setImageFile,
    clearImage,
    reset,
    destroy,
  }
}
