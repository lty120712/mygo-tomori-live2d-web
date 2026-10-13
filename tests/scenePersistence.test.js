import test from 'node:test'
import assert from 'node:assert/strict'
import { createLocalStore, memoryDocumentBackend, SCENE_KEY } from '../src/localStore.js'
import { createScenePersistence } from '../src/scenePersistence.js'

test('两个页面基于同一版本保存时只允许一个写入，旧页面不能覆盖新工程', async () => {
  const store = createLocalStore(memoryDocumentBackend()), failures = []
  const a = createScenePersistence(store), b = createScenePersistence(store, result => failures.push(result))
  await Promise.all([a.restore(), b.restore()])
  assert.equal(await a.save({ name: '新工程' }), true)
  assert.equal(await b.save({ name: '旧页面' }), false)
  assert.equal(await b.save({ name: '再次覆盖' }), false)
  assert.equal((await store.get(SCENE_KEY)).value.name, '新工程')
  assert.equal(failures.length, 1)
  assert.equal(failures[0].conflict, true)
})

test('同一页面快速保存串行提交；刷新读取最新工程与版本', async () => {
  const store = createLocalStore(memoryDocumentBackend()), a = createScenePersistence(store)
  await a.restore()
  assert.deepEqual(await Promise.all([a.save({ n: 1 }), a.save({ n: 2 }), a.save({ n: 3 })]), [true, true, true])
  const b = createScenePersistence(store)
  assert.equal((await b.restore()).project.n, 3)
  assert.equal(await b.save({ n: 4 }), true)
  assert.equal(await a.save({ n: 5 }), false)
})

test('旧工程迁移只删除成功写入的数据，读取失败时禁止保存', async () => {
  const store = createLocalStore(memoryDocumentBackend()), a = createScenePersistence(store)
  let cleared = false
  const restored = await a.restore(() => ({ version: 4 }), () => { cleared = true })
  assert.equal(restored.migrated, true)
  assert.equal(cleared, true)
  const denied = createScenePersistence({ getVersioned: async () => ({ ok: false }), compareSet: () => { throw Error('不能写') } })
  assert.equal((await denied.restore()).ok, false)
  assert.equal(await denied.save({}), false)
})
