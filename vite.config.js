import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const MODELS_DIR = join(root, 'public', 'models')
const VIRTUAL_ID = 'virtual:model-manifest'
const RESOLVED_ID = '\0' + VIRTUAL_ID

const CATEGORY_ORDER = ['tomori', 'anon']

function categoryRank(category) {
  const i = CATEGORY_ORDER.indexOf(category)
  return i === -1 ? CATEGORY_ORDER.length : i
}

function findEntry(dir, name) {
  const preferred = [name + '.model.json', 'model.json', name + '.model3.json']
  for (const file of preferred) {
    if (existsSync(join(dir, file))) return file
  }
  const fallback = readdirSync(dir).find(f => f.endsWith('.model3.json'))
  return fallback || null
}

function isLoadable(dir, entry) {
  try {
    const json = JSON.parse(readFileSync(join(dir, entry), 'utf8'))
    const moc = json.FileReferences?.Moc || json.model
    if (!moc) return true
    return existsSync(join(dir, moc))
  } catch {
    return false
  }
}

function scanModels() {
  if (!existsSync(MODELS_DIR)) return []
  const result = []
  for (const categoryEntry of readdirSync(MODELS_DIR, { withFileTypes: true })) {
    if (!categoryEntry.isDirectory()) continue
    const category = categoryEntry.name
    const categoryDir = join(MODELS_DIR, category)
    for (const modelEntry of readdirSync(categoryDir, { withFileTypes: true })) {
      if (!modelEntry.isDirectory()) continue
      const name = modelEntry.name
      const dir = join(categoryDir, name)
      const entry = findEntry(dir, name)
      if (!entry) continue
      if (!isLoadable(dir, entry)) {
        console.warn(`[model-manifest] skip "${category}/${name}": model resource missing or incomplete`)
        continue
      }
      result.push({ category, name, entry })
    }
  }
  return result.sort((a, b) =>
    categoryRank(a.category) - categoryRank(b.category) ||
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name)
  )
}

function modelManifestPlugin() {
  // 入口文件、主模型文件、物理文件变化都要重新生成清单，
  // 否则补上缺失的 .moc3 之后列表不会刷新
  const MODEL_FILE_RE = /\.(model3?\.json|physics3?\.json|moc3?)$/i
  const isModelFile = (file) =>
    file.startsWith(MODELS_DIR) && MODEL_FILE_RE.test(file)

  return {
    name: 'model-manifest',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export default ${JSON.stringify(scanModels())}`
      }
    },
    configureServer(server) {
      let reloadTimer = null
      const refresh = (file) => {
        if (!isModelFile(file)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        // 整个模型目录拷进来会连续触发很多次，合并成一次刷新
        clearTimeout(reloadTimer)
        reloadTimer = setTimeout(() => server.ws.send({ type: 'full-reload' }), 300)
      }
      server.watcher.on('add', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}

export default defineConfig({
  plugins: [vue(), modelManifestPlugin()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
})
