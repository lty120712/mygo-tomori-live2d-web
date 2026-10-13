/**
 * 统一的浏览器本地数据库。
 *
 * 素材（Blob）与工程文档都放在同一个 IndexedDB 里：素材进 `assets` 仓库，
 * 工程场景等非二进制数据进 `documents` 仓库。工程数据不再写入 localStorage，
 * 以适配不允许 localStorage 的嵌入环境（例如 B 站玩具的沙箱 iframe）。
 */

export const LOCAL_DB_NAME = 'tomori-assets'
export const LOCAL_DB_VERSION = 2
export const ASSET_STORE = 'assets'
export const DOCUMENT_STORE = 'documents'

/** 工程文档在校内数据库中的键 */
export const SCENE_KEY = 'scene'
/** 迁移前使用的 localStorage 键，只在首次加载读取一次 */
export const LEGACY_SCENE_KEY = 'tomori-scene-v2'

let dbPromise = null

function rawOpen(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open(LOCAL_DB_NAME, LOCAL_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE)
      if (!db.objectStoreNames.contains(DOCUMENT_STORE)) db.createObjectStore(DOCUMENT_STORE)
    }
    request.onsuccess = () => {
      const db = request.result
      // 另一个标签页升级数据库时让出连接，避免后续读写落在失效连接上。
      db.onversionchange = () => { db.close(); dbPromise = null }
      resolve(db)
    }
    // 升级被其它标签页的旧连接挡住时立刻报错，不让调用方一直等下去。
    request.onblocked = () => reject(new Error('浏览器数据库正被其它 Tomori Studio 标签页占用，请关闭后刷新'))
    request.onerror = () => reject(request.error)
  })
}

/** 打开统一数据库；失败不缓存失败结果，下一次调用可以重试。可注入 factory 便于测试。 */
export function openLocalDb(factory) {
  if (factory) return rawOpen(factory)
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前环境不支持 IndexedDB'))
  dbPromise ||= rawOpen(indexedDB).catch(error => { dbPromise = null; throw error })
  return dbPromise
}

/** 在指定仓库跑一次事务：写操作等 tx.oncomplete，读操作取请求结果。 */
export function withStore(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = run(tx.objectStore(store))
    tx.oncomplete = () => resolve(request ? request.result : undefined)
    tx.onerror = () => reject(tx.error)
    if (request) request.onerror = () => reject(request.error)
  })
}

// 内存后端：测试与不支持 IndexedDB 的环境降级用
export function memoryDocumentBackend() {
  const map = new Map()
  return {
    async get(key) { return map.has(key) ? map.get(key) : null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
    async getVersioned(key) { return { value: map.get(key) ?? null, revision: map.get(key + ':revision') || 0 } },
    async compareSet(key, value, expected) {
      const revision = map.get(key + ':revision') || 0
      if (revision !== expected) return { ok: false, conflict: true }
      map.set(key, value); map.set(key + ':revision', revision + 1)
      return { ok: true, revision: revision + 1 }
    },
  }
}

export function indexedDbDocumentBackend(open = openLocalDb) {
  async function versioned(key, value, expected, write = false) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DOCUMENT_STORE, write ? 'readwrite' : 'readonly')
      const store = tx.objectStore(DOCUMENT_STORE)
      let result
      const revisionRequest = store.get(key + ':revision')
      revisionRequest.onsuccess = () => {
        const revision = revisionRequest.result || 0
        if (write) {
          if (revision !== expected) { result = { ok: false, conflict: true }; return }
          store.put(value, key); store.put(revision + 1, key + ':revision')
          result = { ok: true, revision: revision + 1 }
        } else {
          const request = store.get(key)
          request.onsuccess = () => { result = { value: request.result ?? null, revision } }
        }
      }
      tx.oncomplete = () => resolve(result)
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('工程存储事务失败'))
    })
  }
  return {
    getVersioned: key => versioned(key),
    compareSet: (key, value, expected) => versioned(key, value, expected, true),
    async get(key) { return withStore(await open(), DOCUMENT_STORE, 'readonly', store => store.get(key)) },
    async set(key, value) { await withStore(await open(), DOCUMENT_STORE, 'readwrite', store => store.put(value, key)) },
    async remove(key) { await withStore(await open(), DOCUMENT_STORE, 'readwrite', store => store.delete(key)) },
  }
}

/** 存储不可用只降级不打断编辑：读返回 { ok, value }，写与删除返回是否成功。 */
export function createLocalStore(backend) {
  return {
    async getVersioned(key) {
      try { return { ok: true, ...(await backend.getVersioned(key)) } } catch (error) { return { ok: false, error } }
    },
    async compareSet(key, value, expected) {
      try { return await backend.compareSet(key, value, expected) } catch (error) { return { ok: false, error } }
    },
    async get(key) {
      try { return { ok: true, value: (await backend.get(key)) ?? null } } catch (error) { return { ok: false, value: null, error } }
    },
    async set(key, value) {
      try { await backend.set(key, value); return true } catch { return false }
    },
    async remove(key) {
      try { await backend.remove(key); return true } catch { return false }
    },
  }
}

export const localStore = createLocalStore(
  typeof indexedDB !== 'undefined' ? indexedDbDocumentBackend() : memoryDocumentBackend()
)
