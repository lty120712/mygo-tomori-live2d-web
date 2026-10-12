import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSET_STORE, DOCUMENT_STORE, LEGACY_SCENE_KEY, LOCAL_DB_NAME, LOCAL_DB_VERSION, SCENE_KEY, createLocalStore, indexedDbDocumentBackend, memoryDocumentBackend, openLocalDb, restoreScene, withStore } from '../src/localStore.js'

// 用最小假实现覆盖 IndexedDB 请求 / 事务回调，避免测试依赖浏览器。
function fakeDb(calls) {
  const map = new Map()
  function transaction(name, mode) {
    calls.push(['transaction', name, mode])
    const tx = { oncomplete: null, onerror: null, error: null }
    tx.objectStore = () => ({
      get: key => { calls.push(['get', key]); return finish(() => map.get(key), tx) },
      put: (value, key) => { calls.push(['put', key]); return finish(() => { map.set(key, value) }, tx) },
      delete: key => { calls.push(['delete', key]); return finish(() => { map.delete(key) }, tx) },
    })
    return tx
  }
  function finish(run, tx) {
    const request = { onsuccess: null, onerror: null, result: undefined, error: null }
    queueMicrotask(() => {
      try { request.result = run() } catch (error) { request.error = error; request.onerror?.(); tx.onerror?.(); return }
      request.onsuccess?.()
      tx.oncomplete?.()
    })
    return request
  }
  return { transaction, close() {} }
}

test('统一的本地数据库名称与仓库', () => {
  assert.equal(LOCAL_DB_NAME, 'tomori-assets')
  assert.equal(LOCAL_DB_VERSION, 2)
  assert.equal(ASSET_STORE, 'assets')
  assert.equal(DOCUMENT_STORE, 'documents')
  assert.equal(SCENE_KEY, 'scene')
  assert.equal(LEGACY_SCENE_KEY, 'tomori-scene-v2')
})

test('工程文档读写删', async () => {
  const store = createLocalStore(memoryDocumentBackend())
  assert.deepEqual(await store.get('scene'), { ok: true, value: null })
  assert.equal(await store.set('scene', { version: 4, clips: [], imageClips: [] }), true)
  assert.deepEqual((await store.get('scene')).value, { version: 4, clips: [], imageClips: [] })
  assert.equal(await store.remove('scene'), true)
  assert.deepEqual(await store.get('scene'), { ok: true, value: null })
})

test('存储不可用时降级：读报错、写与删除返回 false 且不抛错', async () => {
  const denied = () => { throw new Error('拒绝访问') }
  const store = createLocalStore({ get: async () => denied(), set: async () => denied(), remove: async () => denied() })
  const failed = await store.get('scene')
  assert.equal(failed.ok, false)
  assert.equal(failed.value, null)
  assert.match(failed.error.message, /拒绝访问/)
  assert.equal(await store.set('scene', {}), false)
  assert.equal(await store.remove('scene'), false)
})

test('IndexedDB 后端在统一数据库的 documents 仓库读写删', async () => {
  const calls = []
  const db = fakeDb(calls)
  const backend = indexedDbDocumentBackend(async () => db)
  await backend.set('scene', { version: 4 })
  assert.deepEqual(await backend.get('scene'), { version: 4 })
  assert.equal(await backend.get('missing'), undefined)
  await backend.remove('scene')
  assert.deepEqual(calls, [
    ['transaction', DOCUMENT_STORE, 'readwrite'], ['put', 'scene'],
    ['transaction', DOCUMENT_STORE, 'readonly'], ['get', 'scene'],
    ['transaction', DOCUMENT_STORE, 'readonly'], ['get', 'missing'],
    ['transaction', DOCUMENT_STORE, 'readwrite'], ['delete', 'scene'],
  ])
})

test('withStore 在请求出错时拒绝并带上原因', async () => {
  const db = { transaction: () => { const tx = { oncomplete: null, onerror: null, error: new Error('boom') }; tx.objectStore = () => ({ get: () => { const request = { onsuccess: null, onerror: null, error: new Error('boom'), result: undefined }; queueMicrotask(() => request.onerror?.()); return request } }); return tx } }
  await assert.rejects(() => withStore(db, DOCUMENT_STORE, 'readonly', store => store.get('scene')), /boom/)
})

test('数据库升级被其它标签页占用时立刻报错而不是一直等待', async () => {
  const factory = { open: () => { const request = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null }; queueMicrotask(() => request.onblocked?.()); return request } }
  await assert.rejects(() => openLocalDb(factory), /其它 Tomori Studio 标签页/)
})

test('恢复工程：数据库优先，旧 localStorage 数据只在数据库为空时迁移一次', async () => {
  const store = createLocalStore(memoryDocumentBackend())
  const legacy = { version: 3, duration: 15, clips: [1, 2, 3] }
  let cleared = 0
  const first = await restoreScene({ store, readLegacy: () => legacy, clearLegacy: () => { cleared++ } })
  assert.deepEqual(first, { ok: true, project: legacy, migrated: true })
  assert.equal(cleared, 1)
  assert.deepEqual((await store.get(SCENE_KEY)).value, legacy)
  let readLegacyCalls = 0
  const second = await restoreScene({ store, readLegacy: () => { readLegacyCalls++; return legacy }, clearLegacy: () => { cleared++ } })
  assert.deepEqual(second, { ok: true, project: legacy, migrated: false })
  assert.equal(readLegacyCalls, 0)
  assert.equal(cleared, 1)
})

test('恢复工程：写入失败时保留旧数据，读失败时不写不迁移', async () => {
  const legacy = { version: 3, clips: [] }
  let cleared = 0
  const failingWrite = createLocalStore({ get: async () => null, set: async () => { throw new Error('quota') }, remove: async () => {} })
  const failed = await restoreScene({ store: failingWrite, readLegacy: () => legacy, clearLegacy: () => { cleared++ } })
  assert.deepEqual(failed, { ok: true, project: legacy, migrated: false })
  assert.equal(cleared, 0)
  let writes = 0
  const failingRead = createLocalStore({ get: async () => { throw new Error('denied') }, set: async () => { writes++ }, remove: async () => {} })
  const blockedResult = await restoreScene({ store: failingRead, readLegacy: () => legacy, clearLegacy: () => { cleared++ } })
  assert.equal(blockedResult.ok, false)
  assert.equal(String(blockedResult.error.message), 'denied')
  assert.equal(writes, 0)
  assert.equal(cleared, 0)
})

test('恢复工程：数据库与旧数据都为空时保持空工程', async () => {
  const store = createLocalStore(memoryDocumentBackend())
  assert.deepEqual(await restoreScene({ store, readLegacy: () => null }), { ok: true, project: null, migrated: false })
})
