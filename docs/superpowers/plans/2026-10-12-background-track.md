# 背景图层（M3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加一条按时间切换的背景轨道（纯色 / 图片全屏铺满），把 M2 之前上传的 legacy 背景图迁入素材库并生成背景片段，画布与录制按播放头解析背景。

**Architecture:** 背景片段存入工程 v4 的 `backgroundClips`，由 `mediaTracks.js` 的纯函数负责可见性与优先级；`SceneCanvas` 每帧按 `backgroundAtTime` 先用 `paintBackground` 铺底，再绘制图片与模型；时间线新增一条固定在视觉轨道最底部的背景轨道，复用现有拖动 / 裁剪 / 吸附 / 撤销机制。

**Tech Stack:** Vue 3 + Vite；Canvas 2D；Node `node:test`（`npm test`）。

**Spec:** `docs/superpowers/specs/2026-10-12-media-tracks-design.md`

## Global Constraints

- 背景片段数量上限 64（`BACKGROUND_CLIP_LIMIT`），与 16 个模型片段、64 个图片片段分别计数。
- 背景片段不占视觉图层编号（0–79），不参与画布选框、关键帧、锁定与隐藏。
- 单一背景轨道：片段之间禁止重叠；越界拖动或裁剪整体不生效。
- 无背景片段覆盖播放头时回退顺序：legacy `backgroundImage` → `project.background` 纯色。旧字段继续保留为兜底，迁移后清空。
- 背景图片一律拉伸铺满画布（`fit: 'fill'`），不改变工程尺寸与录制尺寸。
- 背景轨道编辑与 legacy 迁移都走 `history.edit`，一次操作一步撤销。
- 测试命令 `npm test`；构建 `npm run build`；浏览器验证用 `npm run dev -- --host 127.0.0.1 --port 5174`。
- 提交信息用中文一句话，沿用仓库现有风格。

---

### Task 1: 背景片段纯函数

**Files:**
- Modify: `src/mediaTracks.js`
- Test: `tests/backgroundTrack.test.js`（新建）

**Interfaces:**
- Consumes: `uid`（`./sceneProject.js`）；`planClipMove` / `applyClipStarts`（`./clipSelection.js`，测试里复用）。
- Produces: `BACKGROUND_CLIP_LIMIT`、`createColorBackgroundClip(color, start, duration)`、`createImageBackgroundClip(asset, start, duration)`、`backgroundClipLimit(clips)`、`backgroundAtTime(clips, { color, image }, time)`、`planBackgroundAdd(clips, clip, { duration, fps })`、`migrateLegacyBackground(project, asset)`、`paintBackground(ctx, background, { width, height, bitmap, legacyImage, fallback })`。

- [ ] **Step 1: 写失败测试**

`tests/backgroundTrack.test.js`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { BACKGROUND_CLIP_LIMIT, backgroundClipLimit, backgroundAtTime, createColorBackgroundClip, createImageBackgroundClip, planBackgroundAdd, migrateLegacyBackground, paintBackground } from '../src/mediaTracks.js'
import { planClipMove, applyClipStarts } from '../src/clipSelection.js'
import { createProject } from '../src/sceneProject.js'

const asset = { id: 'bg-image', name: '天空.png', kind: 'image' }

test('背景片段保存类型、素材引用与全屏铺满标记，不占视觉图层', () => {
  const color = createColorBackgroundClip('#123456', 2, 4), image = createImageBackgroundClip(asset, 0, 10)
  assert.deepEqual({ ...color, id: undefined }, { id: undefined, kind: 'color', color: '#123456', assetId: '', name: '纯色背景', start: 2, duration: 4, fit: 'fill' })
  assert.deepEqual({ ...image, id: undefined }, { id: undefined, kind: 'image', color: '', assetId: 'bg-image', name: '天空.png', start: 0, duration: 10, fit: 'fill' })
  assert.equal(color.track, undefined)
  assert.notEqual(color.id, image.id)
  assert.equal(createColorBackgroundClip('red').color, '#00b140')
})

test('背景上限 64 个', () => {
  assert.equal(BACKGROUND_CLIP_LIMIT, 64)
  assert.equal(backgroundClipLimit(Array.from({ length: 63 }, () => createColorBackgroundClip('#000000'))), '')
  assert.match(backgroundClipLimit(Array.from({ length: 64 }, () => createColorBackgroundClip('#000000'))), /64/)
})

test('按播放头解析背景：片段覆盖优先，其次 legacy 图片，最后纯色', () => {
  const clips = [{ id: 'a', kind: 'color', color: '#111111', start: 0, duration: 2 }, { id: 'b', kind: 'image', assetId: 'bg-image', name: '天空.png', start: 2, duration: 3 }]
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140', image: 'data:image/png;base64,AA' }, 0), { kind: 'color', color: '#111111' })
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140', image: 'data:image/png;base64,AA' }, 1.99), { kind: 'color', color: '#111111' })
  assert.deepEqual(backgroundAtTime(clips, {}, 2), { kind: 'image', assetId: 'bg-image', name: '天空.png' })
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140', image: 'data:image/png;base64,AA' }, 5), { kind: 'legacy-image', image: 'data:image/png;base64,AA' })
  assert.deepEqual(backgroundAtTime(clips, { color: '#00b140' }, 5), { kind: 'color', color: '#00b140' })
  assert.deepEqual(backgroundAtTime([], { color: '#00b140' }, 3), { kind: 'color', color: '#00b140' })
})

test('添加背景片段限制越界并拒绝重叠', () => {
  const existing = createColorBackgroundClip('#111111', 4, 3)
  const free = planBackgroundAdd([existing], createColorBackgroundClip('#222222', 3, 1), { duration: 10, fps: 30 })
  assert.equal(free.error, undefined)
  assert.equal(free.clip.start, 3)
  assert.equal(free.clip.duration, 1)
  assert.match(planBackgroundAdd([existing], createColorBackgroundClip('#222222', 5, 6), { duration: 10, fps: 30 }).error, /重叠|越界/)
  const clamped = planBackgroundAdd([], createColorBackgroundClip('#222222', 99, 99), { duration: 10, fps: 30 })
  assert.equal(clamped.error, undefined)
  assert.ok(Math.abs(clamped.clip.start - (10 - 1 / 30)) < 1e-9)
  assert.ok(Math.abs(clamped.clip.duration - 1 / 30) < 1e-9)
  assert.match(planBackgroundAdd(Array.from({ length: 64 }, () => createColorBackgroundClip('#000000')), createColorBackgroundClip('#000000'), { duration: 10, fps: 30 }).error, /64/)
})

test('背景片段共用一条轨道，移动受 0 与工程时长限制', () => {
  const clips = [createColorBackgroundClip('#111111', 0, 2), createColorBackgroundClip('#222222', 3, 2)]
  const plan = planClipMove(clips, [clips[1]], 5, { duration: 10, fps: 30 })
  assert.equal(plan.entries[0].start, 8)
  assert.equal(applyClipStarts(clips, plan.entries, 10, 30), true)
  assert.equal(clips[1].start, 8)
  assert.equal(applyClipStarts(clips, [{ id: clips[1].id, start: 1 }], 10, 30), false)
  assert.equal(clips[1].start, 8)
})

test('legacy 背景图迁入素材库后生成全长片段并清空旧字段', () => {
  const project = createProject()
  project.backgroundImage = 'data:image/png;base64,AA'
  project.backgroundImageName = '旧背景.png'
  project.duration = 12
  const clip = migrateLegacyBackground(project, { id: 'migrated', name: '旧背景.png' })
  assert.equal(project.backgroundImage, '')
  assert.equal(project.backgroundImageName, '')
  assert.equal(project.backgroundClips.length, 1)
  assert.equal(clip.assetId, 'migrated')
  assert.equal(clip.duration, 12)
  assert.equal(clip.start, 0)
})

test('背景绘制：纯色填充、图片拉伸、素材缺失回退纯色', () => {
  const calls = []
  const ctx = { set fillStyle(value) { calls.push(['fillStyle', value]) }, fillRect: (...args) => calls.push(['fillRect', ...args]), drawImage: (...args) => calls.push(['drawImage', ...args]) }
  const size = { width: 960, height: 540 }
  assert.equal(paintBackground(ctx, { kind: 'color', color: '#00b140' }, { ...size, fallback: '#000000' }), 'color')
  assert.deepEqual(calls, [['fillStyle', '#00b140'], ['fillRect', 0, 0, 960, 540]])
  calls.length = 0
  const bitmap = { width: 10, height: 10 }
  assert.equal(paintBackground(ctx, { kind: 'image', assetId: 'bg-image' }, { ...size, bitmap, fallback: '#000000' }), 'image')
  assert.deepEqual(calls, [['drawImage', bitmap, 0, 0, 960, 540]])
  calls.length = 0
  assert.equal(paintBackground(ctx, { kind: 'image', assetId: 'bg-image' }, { ...size, fallback: '#00b140' }), 'fallback')
  assert.deepEqual(calls, [['fillStyle', '#00b140'], ['fillRect', 0, 0, 960, 540]])
  calls.length = 0
  const legacy = { width: 4, height: 4 }
  assert.equal(paintBackground(ctx, { kind: 'legacy-image', image: 'data:image/png;base64,AA' }, { ...size, legacyImage: legacy, fallback: '#00b140' }), 'legacy-image')
  assert.deepEqual(calls, [['drawImage', legacy, 0, 0, 960, 540]])
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: 报错 `createColorBackgroundClip is not a function`（或同类导入错误）。

- [ ] **Step 3: 写实现**

在 `src/mediaTracks.js` 末尾追加（`uid` 已在文件顶部导入）：

```js
export const BACKGROUND_CLIP_LIMIT = 64
const BACKGROUND_COLOR = /^#[0-9a-f]{6}$/i

export function backgroundClipLimit(clips) {
  return clips.length >= BACKGROUND_CLIP_LIMIT ? '单个工程最多 64 个背景片段' : ''
}
export function createColorBackgroundClip(color, start = 0, duration = 5) {
  return { id: uid('bg'), kind: 'color', color: BACKGROUND_COLOR.test(color || '') ? color : '#00b140', assetId: '', name: '纯色背景', start, duration, fit: 'fill' }
}
export function createImageBackgroundClip(asset, start = 0, duration = 5) {
  return { id: uid('bg'), kind: 'image', color: '', assetId: asset.id, name: asset.name || '背景图片', start, duration, fit: 'fill' }
}
/** 背景是全屏铺满的单层：有片段就按片段，其次 legacy 图片，最后工程纯色兜底。 */
export function backgroundAtTime(clips, { color, image } = {}, time = 0) {
  const clip = (clips || []).find(c => time >= c.start - 1e-9 && time < c.start + c.duration - 1e-9)
  if (clip?.kind === 'image' && clip.assetId) return { kind: 'image', assetId: clip.assetId, name: clip.name }
  if (clip?.kind === 'color') return { kind: 'color', color: clip.color }
  if (image) return { kind: 'legacy-image', image }
  return { kind: 'color', color }
}
export function planBackgroundAdd(clips, clip, { duration, fps }) {
  const limit = backgroundClipLimit(clips); if (limit) return { error: limit }
  const frame = 1 / fps, round = value => Math.round(value * fps) / fps
  const start = Math.max(0, Math.min(duration - frame, round(clip.start || 0)))
  const length = Math.max(frame, Math.min(duration - start, round(clip.duration || 0)))
  const placed = { ...clip, start, duration: length }
  if (clips.some(c => placed.start < c.start + c.duration - 1e-8 && placed.start + placed.duration > c.start + 1e-8))
    return { error: '背景片段不能重叠；请先调整相邻片段的时长或位置' }
  return { clip: placed }
}
/** 把 legacy base64 背景图迁入素材库后的元数据，转成一条全长背景片段并清空旧字段。 */
export function migrateLegacyBackground(project, asset) {
  const clip = createImageBackgroundClip(asset, 0, project.duration)
  project.backgroundClips = [...(project.backgroundClips || []), clip]
  project.backgroundImage = ''
  project.backgroundImageName = ''
  return clip
}
/** 背景绘制：图片拉伸铺满；素材缺失时回退纯色，保证画面不透明。 */
export function paintBackground(ctx, background, { width, height, bitmap, legacyImage, fallback }) {
  if (background?.kind === 'image' && bitmap) { ctx.drawImage(bitmap, 0, 0, width, height); return 'image' }
  if (background?.kind === 'legacy-image' && legacyImage) { ctx.drawImage(legacyImage, 0, 0, width, height); return 'legacy-image' }
  const color = background?.kind === 'color' && background.color ? background.color : fallback
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return background?.kind === 'color' && background.color ? 'color' : 'fallback'
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部通过（新增 7 项，共 142 项）。

- [ ] **Step 5: 提交**

```bash
git add src/mediaTracks.js tests/backgroundTrack.test.js
git commit -m "背景片段纯函数：时间解析、重叠校验与绘制"
```

---

### Task 2: 工程 v4 读写 backgroundClips

**Files:**
- Modify: `src/sceneProject.js`（`readProject` 内图片片段块之后）
- Test: `tests/sceneProjectV4.test.js`（追加）

**Interfaces:**
- Consumes: Task 1 的 `BACKGROUND_CLIP_LIMIT` / `createColorBackgroundClip` / `createImageBackgroundClip`。
- Produces: `readProject(data, models)` 解析并校验 `backgroundClips`；`createProject()` 已有 `backgroundClips: []`。

- [ ] **Step 1: 写失败测试（追加到 `tests/sceneProjectV4.test.js`）**

```js
test('v4 背景片段往返保留类型、颜色、素材引用与时间', () => {
  const color = createColorBackgroundClip('#80304a', 1, 3), image = createImageBackgroundClip({ id: 'asset-1', name: '天空.png' }, 4, 4)
  const project = { ...createProject(), backgroundClips: [color, image] }
  const parsed = readProject(JSON.parse(JSON.stringify(project)), [])
  assert.equal(parsed.backgroundClips.length, 2)
  assert.deepEqual({ ...parsed.backgroundClips[0], id: color.id }, color)
  assert.deepEqual({ ...parsed.backgroundClips[1], id: image.id }, image)
})

test('v4 校验背景片段：类型、素材引用、上限与越界时间', () => {
  assert.throws(() => readProject({ ...createProject(), backgroundClips: {} }, []), /背景片段列表无效/)
  assert.throws(() => readProject({ ...createProject(), backgroundClips: [{ kind: 'video' }] }, []), /背景片段类型无效/)
  assert.throws(() => readProject({ ...createProject(), backgroundClips: [{ kind: 'image' }] }, []), /背景片段缺少素材引用/)
  assert.throws(() => readProject({ ...createProject(), backgroundClips: Array.from({ length: 65 }, () => ({ kind: 'color', color: '#000000' })) }, []), /64/)
  const parsed = readProject({ ...createProject(), duration: 10, backgroundClips: [{ kind: 'color', color: 'red', start: 7, duration: 99 }] }, [])
  assert.equal(parsed.backgroundClips[0].color, '#00b140')
  assert.equal(parsed.backgroundClips[0].start, 7)
  assert.equal(parsed.backgroundClips[0].duration, 3)
  assert.equal(parsed.backgroundClips[0].fit, 'fill')
})

test('v3 旧工程没有背景片段，legacy 背景字段保留为兜底', () => {
  const legacy = { version: 3, aspectRatio: '16:9', fps: 30, duration: 10, background: '#123456', backgroundImage: 'data:image/png;base64,AA', backgroundImageName: '旧背景.png', clips: [] }
  const parsed = readProject(legacy, [])
  assert.deepEqual(parsed.backgroundClips, [])
  assert.equal(parsed.background, '#123456')
  assert.equal(parsed.backgroundImage, 'data:image/png;base64,AA')
  assert.equal(parsed.backgroundImageName, '旧背景.png')
})
```

同时把 `tests/sceneProjectV4.test.js` 顶部的 import 补全：

```js
import { createProject, readProject, SCENE_VERSION } from '../src/sceneProject.js'
import { createColorBackgroundClip, createImageBackgroundClip } from '../src/mediaTracks.js'
```

- [ ] **Step 2: 运行确认失败**

Run: `npm test`
Expected: 背景片段往返断言失败（当前 `readProject` 只把 `backgroundClips` 置空）。

- [ ] **Step 3: 写实现**

`src/sceneProject.js` 顶部导入改为：

```js
import { BACKGROUND_CLIP_LIMIT, createColorBackgroundClip, createImageBackgroundClip, createImageClip, visualClips } from './mediaTracks.js'
```

在 `readProject` 的 `if (data.version === 4 && data.imageClips != null) { ... }` 块之后、`const all = visualClips(project)` 之前插入：

```js
  if (data.version === 4 && data.backgroundClips != null) {
    if (!Array.isArray(data.backgroundClips)) throw new Error('背景片段列表无效')
    if (data.backgroundClips.length > BACKGROUND_CLIP_LIMIT) throw new Error('单个工程最多 64 个背景片段')
    project.backgroundClips = data.backgroundClips.map(raw => {
      if (!raw || (raw.kind !== 'color' && raw.kind !== 'image')) throw new Error('背景片段类型无效')
      const assetId = typeof raw.assetId === 'string' ? raw.assetId.trim() : ''
      if (raw.kind === 'image' && !assetId) throw new Error('背景片段缺少素材引用')
      const clip = raw.kind === 'image'
        ? createImageBackgroundClip({ id: assetId, name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 200) : '背景图片' })
        : createColorBackgroundClip(raw.color)
      clip.start = number(raw.start, 0, 0, project.duration - 1 / project.fps)
      clip.duration = number(raw.duration, project.duration - clip.start, 1 / project.fps, project.duration - clip.start)
      return clip
    })
  }
```

同时把该文件里 `// Background/audio clips and packed assets are reserved for M3/M4.` 注释改为：

```js
  // Audio clips and packed assets are reserved for M4.
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部通过（新增 3 项，共 145 项）。

- [ ] **Step 5: 提交**

```bash
git add src/sceneProject.js tests/sceneProjectV4.test.js
git commit -m "工程 v4 读写背景片段"
```

---

### Task 3: 画布与录制按时间绘制背景

**Files:**
- Modify: `src/components/SceneCanvas.vue`
- Modify: `src/composables/useSceneEditor.js`（`record` 传入背景解析函数、`imageStatus` 记录缺失背景、`changeDuration` 计入背景片段）
- Modify: `src/SceneEditor.vue`（传入 `background-clips`、缺失背景提示）
- Modify: `src/composables/useRecorder.js`（`paintBackground` 支持传入的颜色）

**Interfaces:**
- Consumes: Task 1 的 `backgroundAtTime` / `paintBackground`；现有 `imageSources`（`src/imageSources.js`）。
- Produces: `SceneCanvas` 新 prop `backgroundClips`；`image-status` 事件新增 `backgrounds` 字段（缺失的背景片段数组）。

- [ ] **Step 1: 合成画布按播放头铺背景**

`src/components/SceneCanvas.vue`：

1. props 增加背景片段：

```js
const props = defineProps({ clips: Array, backgroundClips: { type: Array, default: () => [] }, time: Number, fps: Number, ... })
```

2. 导入改为：

```js
import { backgroundAtTime, isImageClip, paintBackground as paintSceneBackground, visualPose, imageDimensions } from '../mediaTracks.js'
```

3. 图片解码缓存同时覆盖背景素材（`watch` 与 `image-status` 一起改）：

```js
const backgroundAssets=computed(()=>props.backgroundClips.filter(c=>c.kind==='image').map(c=>c.assetId))
const images=createImageSources({blob:id=>assetStore.blob(id),changed:()=>{
  const clips=props.clips.filter(isImageClip)
  const backgrounds=props.backgroundClips.filter(c=>c.kind==='image' && images.status(c.assetId)==='missing')
  emit('image-status',{loading:clips.some(c=>images.status(c.assetId)==='loading') || backgroundAssets.value.some(id=>images.status(id)==='loading'),missing:clips.filter(c=>images.status(c.assetId)==='missing'),backgrounds})
}})
watch(()=>[...props.clips.filter(isImageClip).map(c=>c.assetId),...backgroundAssets.value],ids=>images.sync(ids),{immediate:true,flush:'sync'})
```

4. `paint()` 开头改为按时间铺背景（替换原来的纯色 + legacy 图片两行）：

```js
function paint() {
  const ctx = canvas.value?.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, size.value.width, size.value.height)
    const background = backgroundAtTime(props.backgroundClips, { color: props.background, image: props.backgroundImage }, props.time)
    paintSceneBackground(ctx, background, { width: size.value.width, height: size.value.height, bitmap: background.kind === 'image' ? images.get(background.assetId) : null, legacyImage: backgroundImage, fallback: props.background })
    for (const clip of sceneDrawOrder(props.clips)) { ... 原有循环不变 ... }
    ...
  }
}
```

- [ ] **Step 2: 录制与编辑器接线**

`src/composables/useRecorder.js` 的 `paintBackground` 改为：

```js
  function paintBackground(ctx, width, height) {
    if (bgImage && bgImage.complete && bgImage.naturalWidth) {
      ctx.drawImage(bgImage, 0, 0, width, height)
      return
    }
    const background = readBackground && readBackground()
    ctx.fillStyle = (background && background.color) || DEFAULT_BG_COLOR
    ctx.fillRect(0, 0, width, height)
  }
```

`src/composables/useSceneEditor.js`：

1. 顶部导入补 `backgroundAtTime`：

```js
import { visualClips, createImageClip, appendVisualClips, visualClipLimit, backgroundAtTime } from '../mediaTracks.js'
```

2. 缺失背景列表与状态：

```js
  const imageLoading = ref(false), missingImages = ref([]), missingBackgrounds = ref([])
  function imageStatus(status){imageLoading.value=status.loading;missingImages.value=status.missing;missingBackgrounds.value=status.backgrounds || []}
```

3. `record()` 把背景解析函数传给录制器：

```js
    const resolveBackground=()=>{const bg=backgroundAtTime(project.backgroundClips,{color:project.background,image:project.backgroundImage},time.value);return {color:bg.kind==='color' ? bg.color : project.background}}
    stop();if(recorder.start(sceneCanvas.value.getCanvas(),null,'canvas',resolveBackground,null,project.fps))play();else message.value='无法开始录制'
```

4. `changeDuration` 把背景片段计入最小总时长：

```js
    project.duration=Math.min(600,Math.max(.5,n,...allClips.value.map(c=>c.start+c.duration),...project.backgroundClips.map(c=>c.start+c.duration)))
```

5. 导出时提示缺失背景：

```js
    message.value=missMedia.value ? '工程已导出，但以下素材缺失：'+missMedia.value : '工程已导出；图片引用本浏览器素材库，尚不包含素材文件'
```

并把 `missingMedia` 写成计算属性，统一给录制与导出复用：

```js
  const missingMedia=computed(()=>[...missingImages.value.map(c=>c.name),...missingBackgrounds.value.map(c=>c.name)].join('、'))
```

`record()` 中的缺失提示同步改为使用 `missingMedia.value`（原为 `missingImages.value`）。

6. 返回对象里加上 `missingBackgrounds`，供 `SceneEditor.vue` 展示：

```js
  return {allClips,missingBackgrounds,...
```

`src/SceneEditor.vue`：

1. 解构补 `missingBackgrounds`。
2. `SceneCanvas` 增加绑定：

```html
:background-clips="project.backgroundClips"
```

3. 缺失提示合并背景：

```html
<div v-if="missingImages.length || missingBackgrounds.length" class="editor-message" role="alert">素材缺失或无法读取：{{[...missingImages,...missingBackgrounds].map(c=>c.name).join('、')}}。片段仍保留；请在原浏览器恢复素材。</div>
```

4. 只有背景片段、没有模型或图片的工程也要能录制，录制按钮的禁用条件补上背景：

```html
:disabled="loading || (!recorder.isRecording.value && !allClips.length && !project.backgroundClips.length)"
```

- [ ] **Step 3: 构建与浏览器验证**

Run: `npm run build`（`needs escalation for Vite realpath`）
Expected: 构建成功，保留既有大包提示。

浏览器：`npm run dev -- --host 127.0.0.1 --port 5174`，导入一个 `backgroundClips` 覆盖前半段为纯色、后半段为图片的工程 JSON（示例 fixture：前 3 秒 `#00ffff` 纯色、3–6 秒指向缺失素材的图片片段、6 秒后只有 legacy `backgroundImage` 与兜底色 `#ffe600`）：

- 播放头在前半段显示纯色，跨过切换点显示图片并铺满整个画布；竖屏工程同样铺满。
- 覆盖区间之外回退 `project.background`；`backgroundImage` 仍然作为兜底显示。
- 工程引用的背景素材在素材库删除后，画布回退纯色并出现缺失提示，控制台无错误。
- 录制一段跨切换点的视频，下载文件可播放，画面背景与预览一致。

取色验证：截图交给 `System.Drawing` 逐像素统计（会话无图像查看能力时用颜色像素数代替肉眼比对），例如 1 秒处出现约 7.2 万像素的青色、4 秒处出现同量级的回退黄色、7 秒处出现 legacy 品红；播放中重复采样确认背景跟随播放头。

- [ ] **Step 4: 提交**

```bash
git add src/components/SceneCanvas.vue src/SceneEditor.vue src/composables/useSceneEditor.js src/composables/useRecorder.js
git commit -m "画布与录制按时间绘制背景"
```

---

### Task 4: 时间线背景轨道与背景编辑

**Files:**
- Modify: `src/components/MultiTimeline.vue`
- Modify: `src/components/AssetLibrary.vue`
- Modify: `src/SceneEditor.vue`
- Modify: `src/composables/useSceneEditor.js`

**Interfaces:**
- Consumes: Task 1 的 `planBackgroundAdd` / `createColorBackgroundClip` / `createImageBackgroundClip` / `migrateLegacyBackground` / `backgroundClipLimit`；`planClipMove` + `applyClipStarts`（`src/clipSelection.js`）；`editTimelineClip`（`src/timelineEditing.js`）；`assetStore.importFile`。
- Produces: `MultiTimeline` 新 props `backgroundClips`；新 emits `add-background`（`'color'`）/ `background-edit`（`(id, patch)`）/ `delete-background`（`id`）；`AssetLibrary` 新 emit `background-image`（素材对象）；`useSceneEditor` 新导出 `addBackgroundColor` / `addBackgroundImage` / `editBackground` / `deleteBackground`。

- [ ] **Step 1: 时间线背景轨道**

`src/components/MultiTimeline.vue`：

1. props / emits / 导入：

```js
const props=defineProps({clips:Array,backgroundClips:{type:Array,default:()=>[]},selectedIds:Array,...})
const emit=defineEmits([...,'add-background','background-edit','delete-background'])
import { planClipMove } from '../clipSelection.js'
import { editTimelineClip } from '../timelineEditing.js'
```

2. 模板：在视觉轨道 `</template>`（`v-for="track in tracks"` 那段）之后、`<div v-if="!clips.length" class="timeline-empty">` 之前插入背景轨道行，并把空状态改为 `v-if="!clips.length && !backgroundClips.length"`：

```html
      <div class="track-row background-track">
        <div class="track-label track-card" title="背景始终位于最底层，按时间切换纯色或图片">
          <span class="layer-name">背景<small v-if="!backgroundClips.length">兜底</small></span>
          <button :disabled="disabled" title="在播放头添加纯色背景片段" @click="addColorBackground">＋纯色</button>
          <input class="background-color-input" type="color" aria-label="新背景片段颜色" :value="backgroundDraftColor" :disabled="disabled" @input="backgroundDraftColor=$event.target.value" />
        </div>
        <div class="track-lane background-lane" tabindex="-1" @pointerdown.self="beginSeek($event)" @contextmenu.prevent.stop="openBackgroundMenu($event,null)">
          <div v-for="clip in backgroundClips" :key="clip.id" class="model-clip background-clip" tabindex="0" :aria-label="'背景片段 '+backgroundLabel(clip)" :title="backgroundTitle(clip)+' · 拖动移动；右键编辑'" :class="{selected:backgroundSelection===clip.id,multiselected:backgroundSelection===clip.id,image:clip.kind==='image'}" :style="{left:clip.start/duration*100+'%',width:clip.duration/duration*100+'%',background:clip.kind==='color' ? clip.color : undefined}" @contextmenu.prevent.stop="openBackgroundMenu($event,clip)" @pointerdown="beginBackground($event,clip,'move')" @pointermove="moveBackground" @pointerup="endBackground" @pointercancel="endBackground" @lostpointercapture="endBackground">
            <span class="trim-handle left" title="调整背景入点" @pointerdown.stop="beginBackground($event,clip,'left')"></span>
            <span class="clip-name">{{backgroundLabel(clip)}}</span><small>{{formatTimecode(clip.duration,fps)}}</small>
            <span class="trim-handle right" title="调整背景出点" @pointerdown.stop="beginBackground($event,clip,'right')"></span>
          </div>
          <b v-if="snapTime!==null" class="snap-guide" :style="{left:snapTime/duration*100+'%'}"></b><b class="playhead" :style="{left:time/duration*100+'%'}"></b>
        </div>
      </div>
```

3. Teleport 菜单里追加背景分支（放在 `menu.kind==='keys'` 分支之后）：

```html
      <template v-else-if="menu.kind==='background'">
        <template v-if="menu.background">
          <span class="menu-section">背景片段 · {{backgroundLabel(menu.background)}}</span>
          <label v-if="menu.background.kind==='color'">颜色<input type="color" aria-label="背景片段颜色" v-model="backgroundMenuColor" @change="applyBackgroundColor" /></label>
          <button role="menuitem" :disabled="disabled" @click="emit('background-edit',menu.background.id,{start:props.time});closeMenu()">移动到播放头</button>
          <button role="menuitem" :disabled="disabled" @click="emit('background-edit',menu.background.id,{duration:props.duration-menu.background.start});closeMenu()">延伸到工程结尾</button>
          <button role="menuitem" class="menu-delete" :disabled="disabled" @click="emit('delete-background',menu.background.id);closeMenu()">删除背景片段</button>
        </template>
        <span v-else class="menu-hint">用左侧「＋纯色」或素材库图片分类的「背景」按钮添加片段</span>
      </template>
```

4. 脚本追加背景编辑逻辑：

```js
const backgroundDraftColor=ref('#00b140'),backgroundSelection=ref(''),backgroundMenuColor=ref('#00b140')
function backgroundLabel(clip){return clip.kind==='color' ? '纯色 '+clip.color : '图片 · '+clip.name}
function backgroundTitle(clip){return backgroundLabel(clip)+' · '+formatTimecode(clip.start,fps.value)+' → '+formatTimecode(clip.start+clip.duration,fps.value)}
function addColorBackground(){if(props.disabled)return;emit('add-background',{kind:'color',color:backgroundDraftColor.value})}
let backgroundDrag=null
function beginBackground(e,clip,mode){if(props.disabled || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey)return;closeMenu();selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value=clip.id;emit('begin-edit');dragging.value=true;backgroundDrag={original:{...clip},mode,x:e.clientX,start:clip.start,duration:clip.duration,offset:0,width:e.currentTarget.closest('.track-lane').clientWidth,scrollLeft:scrollArea.value.scrollLeft};timelineRoot.value.setPointerCapture(e.pointerId);e.preventDefault()}
function moveBackground(e){if(!backgroundDrag)return;const delta=(e.clientX-backgroundDrag.x+scrollArea.value.scrollLeft-backgroundDrag.scrollLeft)/Math.max(1,backgroundDrag.width)*props.duration,tolerance=8/Math.max(1,backgroundDrag.width)*props.duration,targets=snapping.value && !e.altKey ? [0,props.duration,props.time,...props.backgroundClips.filter(c=>c.id!==backgroundDrag.original.id).flatMap(c=>[c.start,c.start+c.duration])] : [];if(backgroundDrag.mode==='move'){const plan=planClipMove(props.backgroundClips,[backgroundDrag.original],delta,{duration:props.duration,fps:props.fps,targets,tolerance});snapTime.value=plan.snapTime;if(plan.entries.length)emit('background-edit',backgroundDrag.original.id,{start:plan.entries[0].start});return}const result=editTimelineClip(backgroundDrag,delta,{duration:props.duration,fps:props.fps,targets,tolerance});snapTime.value=result.snapTime;emit('background-edit',backgroundDrag.original.id,{start:result.patch.start,duration:result.patch.duration})}
function endBackground(){if(backgroundDrag){backgroundSelection.value='';emit('end-edit')}backgroundDrag=null;dragging.value=false;snapTime.value=null}
function openBackgroundMenu(e,clip){if(props.disabled)return;backgroundMenuColor.value=clip?.color || '#00b140';backgroundSelection.value=clip?.id || '';positionMenu(e,{kind:'background',title:clip ? '背景片段 · '+backgroundLabel(clip) : '背景轨道',background:clip})}
function applyBackgroundColor(){if(menu.value?.background)emit('background-edit',menu.value.background.id,{color:backgroundMenuColor.value});closeMenu()}
```

同时把 `endSeek` 改成 `function endSeek(e){if(drag)end();if(layerDrag)endLayerDrag(e);if(eventDrag)endEvent();if(keyDrag)endKey();if(box)endBox();if(backgroundDrag)endBackground();if(scrubbing?.pointerId===e.pointerId)scrubbing=null}`，`moveSeek` 里加 `if(backgroundDrag){moveBackground(e);return}`，`selectionShortcut` 的 `Delete` 分支保持只作用于视觉片段（背景片段用右键删除）。

5. 样式追加：

```css
.background-clip { background-image:repeating-linear-gradient(45deg,#00000012 0 6px,transparent 6px 12px); }.background-clip .clip-name { text-shadow:0 1px 2px #00000055; }
.background-track .track-label { gap:6px; }.background-color-input { width:28px; height:24px; padding:0; }
.timeline-menu .menu-hint { color:var(--editor-muted); font-size:11px; padding:4px 2px; }
```

- [ ] **Step 2: 素材库添加图片背景**

`src/components/AssetLibrary.vue`：

1. props 增加 `backgroundClips: { type: Array, default: () => [] }`，emits 增加 `'background-image'`。
2. 图片卡片按钮改为：

```html
            <button v-if="a.kind==='image'" :disabled="disabled" :aria-label="'添加图片 '+a.name" title="添加到时间线" @click="emit('add-image',a)">＋</button>
            <button v-if="a.kind==='image'" :disabled="disabled" :aria-label="'把 '+a.name+' 设为背景'" title="添加背景片段到播放头" @click="emit('background-image',a)">背景</button>
```

3. 删除按钮的保护范围扩展到背景片段：

```js
const referenced = a => clips.value.some(c=>c.assetId===a.id) || props.backgroundClips.some(c=>c.assetId===a.id)
```

模板里 `clips.some(c=>c.assetId===a.id)` 的两处（`:disabled` / `:title`）与 `removeAsset` 内的一处都改用 `referenced(a)`（`removeAsset` 内用 `referenced(a)` 提前返回）。

- [ ] **Step 3: 编辑器接入背景编辑与 legacy 迁移**

`src/composables/useSceneEditor.js`：

1. 导入补背景纯函数：

```js
import { visualClips, createImageClip, createColorBackgroundClip, createImageBackgroundClip, appendVisualClips, visualClipLimit, backgroundClipLimit, planBackgroundAdd, migrateLegacyBackground, backgroundAtTime } from '../mediaTracks.js'
import { applyClipStarts } from '../clipSelection.js'
import { assetStore } from '../assetStore.js'
```

2. 在 `addImage` 之后追加背景操作。所有背景改动（含 legacy 迁移）都走 `withBackgroundEdit`：
   - `prepareLegacyBackground` 只做异步准备（把 base64 变成素材库里的图片），不修改工程；
   - `history.edit` 一次性完成「迁移 + 用户这次编辑」，因此迁移与添加是同一步撤销。

```js
  const backgroundStart=()=>Math.min(time.value,Math.max(0,project.duration-1/project.fps))
  async function prepareLegacyBackground(){
    if(!project.backgroundImage)return null
    const response=await fetch(project.backgroundImage), blob=await response.blob()
    return assetStore.importFile(new File([blob],project.backgroundImageName || '旧背景.png',{type:blob.type || 'image/png'}))
  }
  async function withBackgroundEdit(mutate){
    if(locked.value)return
    let asset=null
    try{asset=await prepareLegacyBackground()}catch(error){message.value='背景图片迁移失败：'+error.message}
    if(locked.value)return
    history.end()
    history.edit(()=>{if(asset)migrateLegacyBackground(project,asset);mutate()})
  }
  const addBackgroundColor=(color)=>withBackgroundEdit(()=>addBackgroundClip(createColorBackgroundClip(color,backgroundStart(),Math.min(5,project.duration-backgroundStart()))))
  const addBackgroundImage=(asset)=>withBackgroundEdit(()=>addBackgroundClip(createImageBackgroundClip(asset,backgroundStart(),Math.min(5,project.duration-backgroundStart()))))
  function addBackgroundClip(clip){
    const plan=planBackgroundAdd(project.backgroundClips,clip,{duration:project.duration,fps:project.fps})
    if(plan.error){message.value=plan.error;return}
    project.backgroundClips.push(plan.clip)
    message.value=plan.clip.kind==='color' ? '已添加纯色背景片段' : '已添加背景图片片段'
  }
  function editBackground(id,patch){
    const clip=project.backgroundClips.find(c=>c.id===id);if(!clip)return
    const min=1/project.fps,next={...clip,...patch}
    if(patch.color && clip.kind==='color'){clip.color=/^#[0-9a-f]{6}$/i.test(patch.color) ? patch.color : clip.color;return}
    next.start=Math.max(0,Math.min(project.duration-min,next.start))
    next.duration=Math.max(min,next.duration)
    next.start=Math.round(next.start*project.fps)/project.fps
    next.duration=Math.round(next.duration*project.fps)/project.fps
    if(next.start+next.duration>project.duration){message.value='背景片段不能超出工程时长';return}
    if(project.backgroundClips.some(c=>c.id!==id && next.start<c.start+c.duration-1e-8 && next.start+next.duration>c.start+1e-8)){message.value='背景片段不能重叠；请先调整相邻片段';return}
    Object.assign(clip,{start:next.start,duration:next.duration})
  }
  const deleteBackground=(id)=>{project.backgroundClips=project.backgroundClips.filter(c=>c.id!==id)}
  const editBackgroundAction=(id,patch)=>withBackgroundEdit(()=>editBackground(id,patch))
  const deleteBackgroundAction=(id)=>withBackgroundEdit(()=>deleteBackground(id))
```

3. 返回值里加上背景操作（异步函数直接返回，模板不需要 `await`）：

```js
  return {allClips,missingBackgrounds,addBackgroundColor,addBackgroundImage,editBackground:editBackgroundAction,deleteBackground:deleteBackgroundAction,...
```

4. `deleteSelected` / `batchClips` 不受影响；`replaceProject` 无需改动（`readProject` 已解析背景片段）。

`src/SceneEditor.vue`：

1. 解构补 `addBackgroundColor,addBackgroundImage,editBackground,deleteBackground`。
2. `AssetLibrary` 绑定：

```html
      <AssetLibrary v-show="!previewExpanded" :open="showAssets" :models="assetModels" :clips="allClips" :background-clips="project.backgroundClips" :disabled="locked" @toggle="showAssets=!showAssets" @add="addModel" @add-image="addImage" @background-image="addBackgroundImage" />
```

3. `MultiTimeline` 绑定：

```html
        <MultiTimeline ref="sceneTimeline" :background-clips="project.backgroundClips" @add-background="addBackgroundColor" @background-edit="editBackground" @delete-background="deleteBackground" ... />
```

4. 头部计数加上背景：

```html
<span>场景 · {{ project.clips.length }} 个模型 · {{ project.imageClips.length }} 个图片片段 · {{ project.backgroundClips.length }} 个背景片段</span>
```

- [ ] **Step 4: 构建与浏览器验证**

Run: `npm run build`
Expected: 构建成功。

浏览器（`http://127.0.0.1:5174/`，独立 localhost 存储）：

- 背景行固定在视觉轨道下方；「＋纯色」在播放头生成纯色片段并立即生效；拖动位置、左右裁剪都跟随吸附，一次操作一步撤销。
- 素材库图片分类的「背景」按钮生成图片背景片段并铺满画布；被工程引用的素材删除按钮禁用。
- 两个背景片段重叠的拖动 / 裁剪被拒绝并提示，工程数据不变。
- 上传过背景图片的旧工程（或把 `backgroundImage` 写进工程后导入）：第一次背景编辑后 legacy 图片进入素材库并生成全长片段，旧字段清空；撤销一步回到迁移前。
- 播放、跳帧、切割点前后背景切换正确，无控制台错误；录制文件背景与预览一致。

- [ ] **Step 5: 提交**

```bash
git add src/components/MultiTimeline.vue src/components/AssetLibrary.vue src/SceneEditor.vue src/composables/useSceneEditor.js
git commit -m "时间线背景轨道与背景编辑、legacy 背景迁移"
```

---

### Task 5: 说明书、发布记录与实施记录

**Files:**
- Modify: `src/manualPages.js`
- Modify: `README.md`
- Modify: `docs/RELEASES.md`
- Modify: `docs/superpowers/specs/2026-10-12-media-tracks-design.md`
- Rewrite: `docs/superpowers/plans/2026-10-12-background-track.md`（本计划 → M3 实施记录）

**Interfaces:**
- Consumes: Task 1–4 的实际行为与验证结果（记录必须与实现一致）。
- Produces: 手册「背景轨道」条目、发布记录 M3 段落、设计文档状态改为「M1、M2、M3 已完成；M4 待实现」。 `memory` 无需改动。

- [ ] **Step 1: 说明书分页**

`src/manualPages.js` 在「图片素材与图层」之后插入一章：

```js
  {
    title: '背景轨道',
    summary: '按时间切换纯色或图片背景，背景始终位于最底层。',
    sections: [
      { title: '添加背景', steps: ['时间线底部「背景」行的「＋纯色」按左侧色板在播放头添加纯色片段。', '素材库「图片」分类的「背景」按钮把该图片添加为背景片段，图片拉伸铺满画布。'] },
      { title: '编辑与回退', rows: [['时间线', '背景片段可拖动位置、左右裁剪，支持吸附与一次撤销；片段之间不能重叠。'], ['回退', '播放头没有被背景片段覆盖时，依次回退到旧背景图片和场景设置里的背景颜色。'], ['旧工程', '第一次编辑背景时，旧的上传图片会进入素材库并生成全长背景片段，可一步撤销。']] },
    ],
  },
```

并把「场景设置」章节里的「背景」行改为：

```js
            "背景",
            "没有背景片段覆盖时使用的兜底颜色，默认绿幕；上传的旧背景图片同样只在没有背景片段时显示。",
```

- [ ] **Step 2: 发布记录与设计文档**

`docs/RELEASES.md` 在 `### 已完成：M2 普通图片轨道` 之前插入：

```markdown
### 已完成：M3 背景图层

时间线新增固定的背景轨道，按播放头切换纯色与图片背景，图片拉伸铺满画布；片段可拖动、裁剪、吸附并一步撤销，重叠与越界会被拒绝。画布与录制共用 `backgroundAtTime` 解析，没有被片段覆盖时回退旧背景图片与场景设置兜底色。第一次编辑背景时把旧的上传背景图迁入素材库并生成全长片段，旧字段清空且可一步撤销。背景片段计入工程 v4 读写与素材引用保护，上限 64 个。

验证：<Task 1–4 的实际测试数、构建与浏览器验证结论>。
```

`docs/superpowers/specs/2026-10-12-media-tracks-design.md`：

- 顶部状态改为 `- 状态：M1、M2、M3 已完成；M4 待实现`
- 第 10 节 M3 条目追加「已实现，详见 [M3 实施记录](../plans/2026-10-12-background-track.md)。」

- [ ] **Step 3: README**

`README.md` 的 `## v0.1` 首段之前插入：

```markdown
M3 背景轨道已接入：时间线最下方新增背景行，可按时间切换纯色与图片背景，图片拉伸铺满整个画布；片段可拖动、裁剪、吸附并一步撤销，重叠会被拒绝。播放头没有背景片段时回退旧背景图片与场景设置里的背景颜色，旧工程第一次编辑背景时会把上传的图片迁入素材库。背景同样参与录制。详见 [M3 实施记录](docs/superpowers/plans/2026-10-12-background-track.md)。
```

- [ ] **Step 4: 把本计划改写为实施记录**

参照 [M2 实施记录](2026-10-12-image-tracks.md) 的结构，把本文件改写为「普通背景轨道（M3）实施记录」：完成项清单（勾选）、约定（上限、重叠、回退顺序、迁移规则、素材引用保护）、验证（`npm test` 数量、`npm run build`、浏览器用例、录制结论），末尾写明「下一阶段：M4 音频轨道」。

- [ ] **Step 5: 提交**

```bash
git add src/manualPages.js README.md docs/RELEASES.md docs/superpowers/specs/2026-10-12-media-tracks-design.md docs/superpowers/plans/2026-10-12-background-track.md
git commit -m "M3 背景图层说明书与发布记录"
```

---

## 完成后的交接

M3 完成后，M4（音频轨道）另立计划，复用 `assetStore` 的音频素材、`backgroundClips` 的轨道模式与 v4 的 `audioClips` 字段。
