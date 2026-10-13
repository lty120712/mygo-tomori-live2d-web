import { SCENE_KEY } from './localStore.js'

/** 一个页面只保存自己读取的版本；检查版本与写入在同一数据库事务内完成。 */
export function createScenePersistence(store, onFailure = () => {}) {
  let revision = 0, blocked = false, queue = Promise.resolve()
  return {
    async restore(readLegacy = () => null, clearLegacy = () => {}) {
      const loaded = await store.getVersioned(SCENE_KEY)
      if (!loaded.ok) { blocked = true; return loaded }
      revision = loaded.revision
      if (loaded.value) return { ok: true, project: loaded.value }
      const legacy = readLegacy()
      if (!legacy) return { ok: true, project: null }
      const saved = await store.compareSet(SCENE_KEY, legacy, revision)
      if (!saved.ok) { blocked = true; return saved }
      revision = saved.revision
      clearLegacy()
      return { ok: true, project: legacy, migrated: true }
    },
    save(project) {
      // 不同保存请求串行化，防止同一页面快速编辑误判为跨页面冲突。
      queue = queue.then(async () => {
        if (blocked) return false
        const saved = await store.compareSet(SCENE_KEY, project, revision)
        if (!saved.ok) { blocked = true; onFailure(saved); return false }
        revision = saved.revision
        return true
      })
      return queue
    },
  }
}
