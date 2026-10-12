# 素材库（M1）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立浏览器本地素材库（图片/音频的 Blob 存储），把左侧素材库改为模型 / 图片 / 音频三分类，并把工程格式升级到 v4 且兼容旧工程。

**Architecture:** 新增 `src/assetStore.js`，一个后端可注入的 Blob 素材库（默认 IndexedDB，测试用内存 Map）；`AssetLibrary.vue` 改为三个标签页；`sceneProject.js` 升到 v4 并在读取时兼容 v3。后续里程碑（M2 图片轨道、M3 背景图层、M4 音频轨道）都依赖本计划产出的 store 与 v4 字段。

**Tech Stack:** Vue 3 + Vite；原生 IndexedDB / Blob / URL；Node `node:test`（`npm test`）。

**Spec:** `docs/superpowers/specs/2026-10-12-media-tracks-design.md`

## Global Constraints

- 工程版本号 `SCENE_VERSION` 由 3 升为 4；`readProject` 必须同时接受 3 与 4。
- 单文件大小上限：图片 64MB，音频 512MB（`ASSET_LIMITS`）。
- 素材 id 用 `sceneProject.js` 导出的 `uid('asset')` 生成。
- 测试命令 `npm test`（node --test，纯函数测试，无浏览器）；构建 `npm run build`；浏览器验证用 dev 服务 `npm run dev -- --host 127.0.0.1 --port 5174`。
- 素材库的导入 / 删除不写入工程撤销历史。
- 提交信息用中文一句话，沿用仓库现有风格。

---

### Task 1: 素材识别与大小校验纯函数

**Files:**
- Create: `src/assetStore.js`
- Test: `tests/assetStore.test.js`

**Interfaces:**
- Consumes: `uid`（来自 `../sceneProject.js`）。
- Produces: `ASSET_LIMITS`、`kindOfFile(file)`、`sizeOk(file, kind)`（Task 2 的 `importFile` 依赖它们）。

- [ ] **Step 1: 写失败测试**

`tests/assetStore.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ASSET_LIMITS, kindOfFile, sizeOk } from '../src/assetStore.js'

const fakeFile = (type, name, size) => ({ type, name, size })

test('按 MIME 与扩展名识别图片与音频素材', () => {
  assert.equal(kindOfFile(fakeFile('image/png', 'a.png', 1)), 'image')
  assert.equal(kindOfFile(fakeFile('audio/mpeg', 'a.mp3', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('', 'B.JPG', 1)), 'image')
  assert.equal(kindOfFile(fakeFile('', 'c.opus', 1)), 'audio')
  assert.equal(kindOfFile(fakeFile('video/mp4', 'd.mp4', 1)), null)
})

test('大小上限：图片 64MB、音频 512MB', () => {
  assert.equal(ASSET_LIMITS.image, 64 * 1024 * 1024)
  assert.equal(ASSET_LIMITS.audio, 512 * 1024 * 1024)
  assert.equal(sizeOk(fakeFile('image/png', 'a.png', 64 * 1024 * 1024), 'image'), true)
  assert.equal(sizeOk(fakeFile('image/png', 'a.png', 64 * 1024 * 1024 + 1), 'image'), false)
  assert.equal(sizeOk(fakeFile('audio/mpeg', 'a.mp3', 512 * 1024 * 1024), 'audio'), true)
  assert.equal(sizeOk(fakeFile('audio/mpeg', 'a.mp3', 512 * 1024 * 1024 + 1), 'audio'), false)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: 报错 `Cannot find module '../src/assetStore.js'`。

- [ ] **Step 3: 写最小实现**

`src/assetStore.js`（先只含纯函数，Task 2 再扩展）：

```js
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部通过（新增 2 项）。

- [ ] **Step 5: 提交**

```bash
git add src/assetStore.js tests/assetStore.test.js
git commit -m "素材识别与大小校验纯函数"
```

---

### Task 2: 素材库存储与导入接口

**Files:**
- Modify: `src/assetStore.js`
- Test: `tests/assetStore.test.js`（追加）

**Interfaces:**
- Consumes: Task 1 的 `kindOfFile` / `sizeOk`；`uid` 来自 `../sceneProject.js`。
- Produces: `memoryBackend()`、`createAssetStore(backend, options)`、单例 `assetStore`。`createAssetStore` 返回 `{ init, list, importFile, blob, remove, url }`。`options.probeImage(file)`、`options.probeAudio(file)` 可注入（测试注入无副作用实现，默认用 DOM 探测宽高 / 缩略图 / 时长）。

- [ ] **Step 1: 写失败测试（追加到 `tests/assetStore.test.js`）**

```js
import { createAssetStore, memoryBackend } from '../src/assetStore.js'

const noProbe = {
  probeImage: async () => ({ width: 0, height: 0, thumb: '' }),
  probeAudio: async () => ({ duration: 0 }),
}

test('导入图片素材后可列出、读取、删除', async () => {
  const store = createAssetStore(memoryBackend(), noProbe)
  const file = { type: 'image/png', name: 'a.png', size: 10 }
  const meta = await store.importFile(file)
  assert.equal(meta.kind, 'image')
  assert.equal(meta.name, 'a.png')
  assert.ok(meta.id)
  assert.equal((await store.list()).length, 1)
  assert.equal(await store.blob(meta.id), file)
  await store.remove(meta.id)
  assert.equal((await store.list()).length, 0)
})

test('拒绝不支持类型与超限文件', async () => {
  const store = createAssetStore(memoryBackend(), noProbe)
  await assert.rejects(() => store.importFile({ type: 'video/mp4', name: 'v.mp4', size: 10 }), /不支持/)
  await assert.rejects(() => store.importFile({ type: 'image/png', name: 'a.png', size: 65 * 1024 * 1024 }), /64MB/)
})

test('按创建时间倒序列出', async () => {
  const store = createAssetStore(memoryBackend(), noProbe)
  await store.importFile({ type: 'image/png', name: 'a.png', size: 1 })
  await new Promise(r => setTimeout(r, 5))
  await store.importFile({ type: 'audio/mpeg', name: 'b.mp3', size: 1 })
  const list = await store.list()
  assert.equal(list[0].name, 'b.mp3')
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: `createAssetStore is not a function` 之类错误。

- [ ] **Step 3: 写实现（在 `src/assetStore.js` 追加，并在顶部 `import { uid } from './sceneProject.js'`）**

```js
import { uid } from './sceneProject.js'

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
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部通过（新增 3 项）。

- [ ] **Step 5: 提交**

```bash
git add src/assetStore.js tests/assetStore.test.js
git commit -m "本地素材库：Blob 存储与导入接口"
```

---

### Task 3: 工程格式升级 v4 并兼容 v3

**Files:**
- Modify: `src/sceneProject.js:1-80`（`SCENE_VERSION`、`createProject`、`readProject` 的版本校验）
- Test: `tests/sceneProjectV4.test.js`

**Interfaces:**
- Produces: `SCENE_VERSION === 4`；`createProject()` 含 `imageClips / backgroundClips / audioClips / assets`；`readProject(data, models)` 接受 version 3 或 4，v3 读入后补齐空数组。

- [ ] **Step 1: 写失败测试**

`tests/sceneProjectV4.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, readProject, SCENE_VERSION } from '../src/sceneProject.js'

const models = [{ category: 'tomori', name: 'chika', entry: 'model.json' }]

test('v4 工程包含图片/背景/音频数组', () => {
  const p = createProject()
  assert.equal(SCENE_VERSION, 4)
  assert.equal(p.version, 4)
  assert.deepEqual(p.imageClips, [])
  assert.deepEqual(p.backgroundClips, [])
  assert.deepEqual(p.audioClips, [])
  assert.deepEqual(p.assets, {})
})

test('v3 旧工程读取后补齐新字段', () => {
  const legacy = {
    version: 3, aspectRatio: '16:9', fps: 30, duration: 10, background: '#00b140',
    clips: [{ model: 'tomori/chika', name: 'chika', track: 0, start: 0, duration: 5 }],
  }
  const p = readProject(legacy, models)
  assert.equal(p.version, 4)
  assert.equal(p.clips.length, 1)
  assert.deepEqual(p.imageClips, [])
  assert.deepEqual(p.backgroundClips, [])
  assert.deepEqual(p.audioClips, [])
  assert.deepEqual(p.assets, {})
})

test('未知版本仍拒绝', () => {
  assert.throws(() => readProject({ version: 9, clips: [] }, models), /版本/)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: `SCENE_VERSION` 断言失败（当前为 3），且 v3 工程读取抛「无法识别工程版本」。

- [ ] **Step 3: 写实现**

`src/sceneProject.js`：

- 把 `export const SCENE_VERSION = 3` 改为 `export const SCENE_VERSION = 4`。
- `createProject()` 的返回对象追加 `imageClips: [], backgroundClips: [], audioClips: [], assets: {}`：

```js
export function createProject() {
  return { version: SCENE_VERSION, aspectRatio:'16:9', fps: 30, duration: 10, background: '#00b140', backgroundImage: '', backgroundImageName: '', clips: [], imageClips: [], backgroundClips: [], audioClips: [], assets: {} }
}
```

- `readProject` 中把 `if (data.version !== SCENE_VERSION) throw ...` 改为接受 3 与 4：

```js
if (data.version !== 3 && data.version !== SCENE_VERSION) throw new Error('无法识别工程版本，仅支持多模型场景工程')
```

- `readProject` 末尾 `return project` 前，确保新字段为数组（v3 文件不携带它们；v4 字段的逐项解析在 M2/M4 加入，本任务先置空）：

```js
project.imageClips = []
project.backgroundClips = []
project.audioClips = []
project.assets = {}
return project
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部通过，且原有 `sceneProject.test.js` 不回归。

- [ ] **Step 5: 提交**

```bash
git add src/sceneProject.js tests/sceneProjectV4.test.js
git commit -m "工程格式升级 v4 并兼容旧工程"
```

---

### Task 4: 素材库三分类界面 + 导入 / 删除

**Files:**
- Modify: `src/components/AssetLibrary.vue`（整体重写，保留模型标签页原有筛选逻辑与样式）

**Interfaces:**
- Consumes: 单例 `assetStore`（Task 2）；`describeModel` / `filterModelLibrary`（`../modelLibrary.js`，现有）；`ModelPortrait`（现有）。
- Produces: 组件 props 不变（`models`、`clips`、`open`、`disabled`）；emits 不变（`toggle`、`add`）。新增内部标签 `activeTab`（`model` / `image` / `audio`）与 `assetStore` 调用。图片 / 音频标签页只做导入与删除，「添加到时间线」在 M2 / M4 接入。

- [ ] **Step 1: 重写组件**

`src/components/AssetLibrary.vue` 完整内容：

```vue
<template>
  <aside class="asset-library" :class="{collapsed:!open}" :aria-label="activeTab==='model' ? '模型素材库' : '素材库'">
    <div v-show="!open" class="asset-rail"><button class="rail-trigger" aria-label="展开素材库" title="展开素材库" @click="emit('toggle')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/></svg><span>素材</span></button></div>
    <div v-show="open" class="library-body">
      <header><div><small>ASSETS</small><h3>素材库</h3></div><button class="collapse-trigger" aria-label="收起素材库" title="收起素材库，为画布留出空间" @click="emit('toggle')">‹</button></header>
      <nav class="asset-tabs" aria-label="素材分类">
        <button :aria-current="activeTab==='model' ? 'page' : undefined" @click="switchTab('model')">模型<span>{{ models.length }}</span></button>
        <button :aria-current="activeTab==='image' ? 'page' : undefined" @click="switchTab('image')">图片<span>{{ assets.filter(a=>a.kind==='image').length }}</span></button>
        <button :aria-current="activeTab==='audio' ? 'page' : undefined" @click="switchTab('audio')">音频<span>{{ assets.filter(a=>a.kind==='audio').length }}</span></button>
      </nav>

      <template v-if="activeTab==='model'">
        <div class="library-filters">
          <label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="搜索模型素材" placeholder="搜索服装、角色或模型名称" /></label>
          <label>角色<select v-model="character" aria-label="筛选角色"><option value="">全部角色</option><option v-for="c in characters" :key="c.key" :value="c.key">{{c.label}}</option></select></label>
          <div class="filter-grid"><label>服装<select v-model="outfit" aria-label="筛选服装"><option value="">全部服装</option><option v-for="o in outfits" :key="o">{{o}}</option></select></label><label>模型版本<select v-model="version" aria-label="筛选模型版本"><option value="">全部版本</option><option v-for="v in versions" :key="v">{{v}}</option></select></label></div>
          <div class="result-summary"><span>{{results.length}} / {{models.length}} 个素材</span><button v-if="character || outfit || version || search" class="clear-filters" @click="clearFilters">清除筛选</button></div>
        </div>
        <div class="library-results">
          <button v-for="model in results" :key="model.id" class="library-model" :class="{used:usedModels.has(model.id)}" :disabled="disabled" :aria-label="'添加 '+model.character+' '+model.label+' '+model.detail+' '+model.name" :title="model.character+' · '+model.detail+'\n'+model.name" @click="emit('add',model)">
            <ModelPortrait :model="model" :paused="disabled || !open" />
            <span class="model-copy"><strong>{{model.label}}</strong><small>{{model.character}} · {{model.detail}}</small><span class="source-name">{{model.name}}</span></span><span class="add-mark" aria-hidden="true">＋</span>
          </button>
          <div v-if="!results.length" class="library-empty"><span>没有找到匹配的素材</span><button @click="clearFilters">清除筛选</button></div>
        </div>
        <footer><span class="hint-dot"></span>点击添加到场景，同一素材可重复使用</footer>
      </template>

      <template v-else>
        <div class="media-toolbar">
          <button class="import-btn" @click="pickFile">导入{{ activeTab==='image' ? '图片' : '音频' }}</button>
          <input ref="fileInput" type="file" hidden :accept="activeTab==='image' ? 'image/*' : 'audio/*'" @change="onFilePicked" />
          <span class="media-hint">保存在本浏览器，可跨工程复用</span>
        </div>
        <div class="library-results">
          <div v-for="a in currentAssets" :key="a.id" class="media-card">
            <img v-if="a.kind==='image'" :src="a.thumb || ''" alt="" class="media-thumb" />
            <span v-else class="media-thumb media-audio" aria-hidden="true">♪</span>
            <span class="model-copy"><strong>{{ a.name }}</strong><small>{{ formatSize(a.size) }}<template v-if="a.kind==='audio' && a.duration"> · {{ a.duration.toFixed(1) }}s</template></small></span>
            <button class="media-delete" :aria-label="'删除素材 '+a.name" title="删除素材" @click="removeAsset(a)">×</button>
          </div>
          <div v-if="!currentAssets.length" class="library-empty"><span>还没有{{ activeTab==='image' ? '图片' : '音频' }}素材</span><button @click="pickFile">导入一个</button></div>
        </div>
        <footer><span class="hint-dot"></span>导入的素材保存在浏览器本地</footer>
      </template>
    </div>
  </aside>
</template>
<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import ModelPortrait from './ModelPortrait.vue'
import { describeModel, filterModelLibrary } from '../modelLibrary.js'
import { assetStore } from '../assetStore.js'
const props = defineProps({ models: { type: Array, default: () => [] }, clips: { type: Array, default: () => [] }, open: Boolean, disabled: Boolean })
const emit = defineEmits(['toggle', 'add'])
const activeTab = ref('model')
const assets = ref([])
const fileInput = ref(null)

const character = ref(''), outfit = ref(''), version = ref(''), search = ref('')
const catalog = computed(() => props.models.map(describeModel))
const characters = computed(() => [...new Map(catalog.value.map(m => [m.category, { key: m.category, label: m.character }])).values()])
const forCharacter = computed(() => catalog.value.filter(m => !character.value || m.category === character.value))
const outfits = computed(() => [...new Set(forCharacter.value.map(m => m.outfit))])
const versions = computed(() => [...new Set(forCharacter.value.map(m => m.version))])
const results = computed(() => filterModelLibrary(catalog.value, { character: character.value, outfit: outfit.value, version: version.value, search: search.value }))
const usedModels = computed(() => new Set(props.clips.map(c => c.model)))
const currentAssets = computed(() => assets.value.filter(a => a.kind === activeTab.value))

watch(character, () => { if (!outfits.value.includes(outfit.value)) outfit.value = ''; if (!versions.value.includes(version.value)) version.value = '' })
function clearFilters() { character.value = ''; outfit.value = ''; version.value = ''; search.value = '' }
function switchTab(tab) { activeTab.value = tab; refreshAssets() }
async function refreshAssets() { try { assets.value = await assetStore.list() } catch { assets.value = [] } }
function pickFile() { fileInput.value && fileInput.value.click() }
async function onFilePicked(event) {
  const file = event.target.files && event.target.files[0]
  event.target.value = ''
  if (!file) return
  try { await assetStore.importFile(file); refreshAssets() }
  catch (e) { alert(e.message || '导入失败') }
}
async function removeAsset(a) { if (confirm('删除素材「' + a.name + '」？')) { await assetStore.remove(a.id); refreshAssets() } }
function formatSize(size) { if (size >= 1048576) return (size / 1048576).toFixed(1) + 'MB'; if (size >= 1024) return Math.round(size / 1024) + 'KB'; return size + 'B' }
onMounted(refreshAssets)
</script>
<style scoped>
.asset-library { width:280px; flex-shrink:0; box-sizing:border-box; background:var(--editor-panel); color:var(--editor-text); border-right:1px solid var(--editor-border); min-height:0; font-family:inherit; }
.asset-library.collapsed { width:52px; background:var(--editor-soft); }
.library-body { height:100%; display:flex; flex-direction:column; min-height:0; }
header { display:flex; justify-content:space-between; align-items:center; padding:22px 18px 15px; } header small { color:var(--editor-muted); font-size:9px; letter-spacing:2px; } h3 { margin:5px 0 0; font-size:19px; font-weight:600; }
.asset-library button { font:inherit; cursor:pointer; }
.asset-library .collapse-trigger,.asset-library .rail-trigger { border:0!important; background:transparent!important; color:var(--editor-accent)!important; border-radius:10px!important; }.collapse-trigger { font-size:26px!important; width:32px; height:32px; padding:0!important; }.collapse-trigger:hover,.rail-trigger:hover { background:var(--editor-hover)!important; }
.asset-tabs { display:flex; gap:6px; padding:0 16px 12px; border-bottom:1px solid var(--editor-border); }
.asset-tabs button { flex:1; background:var(--editor-soft); border:1px solid transparent; color:var(--editor-text); border-radius:9px; padding:8px 6px; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px; }
.asset-tabs button span { color:var(--editor-muted); font-size:10px; }
.asset-tabs button[aria-current=page] { background:var(--editor-accent); color:var(--editor-on-accent,#fff); }
.asset-tabs button[aria-current=page] span { color:inherit; opacity:.75; }
.library-filters { padding:0 16px 12px; border-bottom:1px solid var(--editor-border); } label { display:block; font-size:11px; color:var(--editor-muted); margin-bottom:10px; }
.asset-library input,.asset-library select { width:100%; box-sizing:border-box; font:inherit; font-size:12px; color:var(--editor-text); background:var(--editor-soft); border:1px solid transparent; border-radius:9px; padding:9px 10px; outline:none; margin-top:5px; } .asset-library select:focus-visible,.asset-library input:focus-visible { border-color:var(--editor-focus); box-shadow:0 0 0 2px #743a5220; }
.search-field { position:relative; }.search-field input { padding-left:33px; margin-top:0; } .search-field svg { position:absolute; width:15px; height:15px; left:10px; top:10px; stroke:var(--editor-muted); fill:none; stroke-width:1.5; }
.filter-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .filter-grid label { min-width:0; }.filter-grid select { text-overflow:ellipsis; }
.result-summary { display:flex; align-items:center; justify-content:space-between; color:var(--editor-muted); font-size:11px; height:22px; }.asset-library .clear-filters { color:var(--editor-accent)!important; border:0!important; background:transparent!important; padding:2px!important; }
.library-results { flex:1; min-height:0; overflow:auto; padding:12px 10px; }
.asset-library .library-model { display:flex; gap:10px; align-items:center; width:100%; text-align:left; padding:11px 9px!important; margin-bottom:5px; background:transparent!important; color:var(--editor-text)!important; border:1px solid transparent!important; border-radius:13px!important; }.asset-library .library-model:hover { background:var(--editor-hover)!important; border-color:var(--editor-border)!important; }.asset-library .library-model.used { background:var(--editor-accent-soft)!important; }.asset-library .library-model:disabled { opacity:.5; cursor:default; }
.model-copy { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }.model-copy strong { font-size:13px; font-weight:500; }.model-copy small { font-size:10px; color:var(--editor-muted); }.source-name { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:9px; color:var(--editor-muted); }.add-mark { color:var(--editor-accent); font-size:18px; }
.media-toolbar { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--editor-border); }
.media-toolbar .import-btn { background:var(--editor-accent); color:var(--editor-on-accent,#fff); border-radius:9px; padding:8px 14px; }
.media-hint { color:var(--editor-muted); font-size:10px; }
.media-card { display:flex; gap:10px; align-items:center; width:100%; padding:8px 9px; margin-bottom:5px; background:var(--editor-soft); border-radius:11px; }
.media-thumb { width:40px; height:40px; object-fit:cover; border-radius:8px; background:var(--editor-hover); flex:none; }
.media-audio { display:flex; align-items:center; justify-content:center; font-size:18px; color:var(--editor-accent); }
.media-delete { border:0!important; background:transparent!important; color:var(--editor-muted)!important; font-size:18px; padding:4px 8px!important; }.media-delete:hover { color:var(--editor-accent)!important; }
footer { display:flex; align-items:center; gap:6px; padding:14px 15px; font-size:10px; color:var(--editor-muted); border-top:1px solid var(--editor-border); }.hint-dot { width:4px; height:4px; border-radius:50%; background:var(--editor-focus); }
.asset-rail { display:flex; flex-direction:column; align-items:center; gap:14px; padding-top:20px; }.rail-trigger { display:flex; flex-direction:column; align-items:center; gap:7px; font-size:10px!important; padding:8px!important; }.rail-trigger svg { width:21px; height:21px; stroke:currentColor; fill:none; stroke-width:1.5; }
.library-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:30px 10px; color:var(--editor-muted); font-size:12px; }.asset-library .library-empty button { color:var(--editor-accent)!important; border:1px solid var(--editor-border)!important; background:var(--editor-accent-soft)!important; border-radius:8px!important; }
.asset-library button:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
@media(max-width:800px) { .asset-library:not(.collapsed) { position:absolute; left:0; top:0; bottom:0; z-index:5; box-shadow:12px 0 32px #080b1828; width:min(280px,calc(100% - 52px)); }.asset-library.collapsed { width:44px; } }
</style>
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功，无报错。

- [ ] **Step 3: 浏览器验证**

Run: `npm run dev -- --host 127.0.0.1 --port 5174`，打开 http://127.0.0.1:5174/。
Expected: 素材库出现「模型 / 图片 / 音频」三个标签；模型标签仍能筛选与添加；图片标签导入一张图后出现在列表、刷新页面后仍在；音频标签同理；删除后从列表消失；无控制台错误。

- [ ] **Step 4: 更新发布记录并提交**

在 `docs/RELEASES.md` 的 `## v0.1 · 2026-10-12` 下追加：

```markdown
### 已完成：素材库三分类与本地素材存储

左侧素材库改为模型 / 图片 / 音频三个分类。图片与音频以 Blob 存入浏览器本地（IndexedDB，请求持久化存储），支持逐个导入、列出与删除，跨工程复用；单文件上限图片 64MB、音频 512MB。模型分类保留原有筛选与添加。工程格式升级到 v4，旧工程打开时自动补齐新字段。

验证：素材库纯函数与存储接口单测通过，生产构建通过；浏览器验证图片 / 音频导入、刷新后保留、删除与模型筛选无回归，无控制台错误。
```

```bash
git add src/components/AssetLibrary.vue docs/RELEASES.md
git commit -m "素材库三分类与本地素材存储"
```

---

## 完成后的交接

M1 完成后，M2（普通图片轨道）、M3（背景图层）、M4（音频轨道）分别另立计划，逐一复用本计划的 `assetStore` 与 v4 字段。