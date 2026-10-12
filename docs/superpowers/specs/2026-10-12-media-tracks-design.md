# 素材轨道与素材库设计（图片轨道 / 背景图层 / 音频轨道）

- 日期：2026-10-12
- 状态：M1、M2、M3 已完成；M4 待实现
- 分支：v0.1

## 1. 目标

把 Tomori Studio 从「多模型场景编辑器」扩展为支持图片、背景与音频的多媒体时间线编辑器，并将左侧素材库从纯模型扩展为模型 / 图片 / 音频三分类。

## 2. 范围

包含：

- 普通图片轨道：像人物一样作为画布图层，可拖动 / 缩放 / 旋转、设关键帧，与模型共用图层上下顺序。
- 背景图层：一条特殊轨道，按时间切换背景（纯色 / 绿幕或图片全屏铺满），遵循场景设置，始终位于最底层。
- 音频轨道：多条音频片段按时间线调度，支持多条同时叠放、逐条音量与淡入淡出，混入录制导出。
- 素材库：本地 Blob 存储 + 模型 / 图片 / 音频三分类 UI + 最小「导入」入口。
- 工程格式升级到 v4，旧工程迁移兼容。

不包含（后续）：

- 拖拽上传、批量上传、视频素材。
- 图片 / 音频的滤镜、裁剪动画等关键帧化处理；图片仅支持变换与缓动。
- 服务器端上传或云端素材库。

## 3. 架构总览

三条新轨与现有模型轨统一在一个时间线。图片与模型共用 track 编号以支持穿插叠放；背景与音频各自独立编号。

新增模块：

- `src/assetStore.js`：本地素材库（Blob 存储 + 元数据）。
- `src/mediaTracks.js`：图片 / 背景 / 音频片段的时间线纯函数。
- `src/audioScheduler.js`：Web Audio 调度引擎。
- `src/components/ImageTrack.vue` / `BackgroundTrack.vue` / `AudioTrack.vue`：时间线新轨道 UI（可并入 MultiTimeline.vue）。

改动模块：

- `src/sceneProject.js`：v4 格式与迁移。
- `src/sceneLayers.js`：合并模型与图片的图层顺序。
- `src/composables/useSceneEditor.js`：新轨状态、编辑与撤销接入。
- `src/components/SceneCanvas.vue` / `SceneEditor.vue`：合成渲染图片与背景。
- `src/composables/useRecorder.js`：背景按时间绘制、音频调度接入导出混音。
- `src/components/AssetLibrary.vue`：三分类 UI。

## 4. 数据模型

工程格式升级到 v4：

```js
project = {
  version: 4,
  aspectRatio, fps, duration,
  background: '#00b140',   // 全局兜底纯色
  clips: [],               // 模型片段（保持现状）
  imageClips: [],          // 普通图片图层
  backgroundClips: [],     // 背景图层
  audioClips: [],          // 音频片段
  assets: {},              // 仅导出打包时内嵌小素材；平时工程只记引用
}
```

图片片段：

```js
imageClip = {
  id, assetId, name, track, start, duration, offset,
  transform: { x, y, scale, rotation, opacity },
  keyframes: {}, layerName, layerLocked, layerHidden,
}
```

背景片段：

```js
backgroundClip = {
  id, kind: 'color' | 'image',
  color,            // kind === 'color'
  assetId, name,    // kind === 'image'
  start, duration, fit: 'fill',
}
```

音频片段：

```js
audioClip = {
  id, assetId, name, track, start, duration, offset,
  volume, fadeIn, fadeOut,
}
```

素材元数据（本地库）：

```js
asset = {
  id, kind: 'image' | 'audio' | 'video',
  name, mimeType, size,
  width, height,   // 图片
  duration,        // 音频
  thumb,           // 图片缩略图 dataURL
  createdAt,
}
```

关键约定：

- 图片片段与模型片段共用 `track` 编号；`sceneLayers` / `sceneDrawOrder` / `sceneHitOrder` 合并两个数组。
- 背景片段独立编号，始终最底层、全屏铺满；音频片段独立编号，不影响视觉。
- 旧工程的 `background` / `backgroundImage` / `backgroundImageName` 保留为兜底，不再由新工程写入。

## 5. 组件与模块

### 5.1 src/assetStore.js

职责：把用户导入的图片 / 音频以 Blob 形式存入浏览器本地，提供增删查与编辑期对象 URL。

- 底层 IndexedDB（库 `tomori-assets`，仓库 `assets`）；Chromium 下优先 OPFS 存大文件。
- 初始化时调用 `navigator.storage.persist()` 请求持久化。
- 接口：`initAssetStore()` / `listAssets()` / `putAsset(blob, meta)` / `getAssetBlob(id)` / `removeAsset(id)` / `assetObjectUrl(id)`。
- 为可测试性，存储后端可注入（默认 IndexedDB，测试用内存 Map）。

### 5.2 src/mediaTracks.js

职责：图片 / 背景 / 音频片段的时间线纯函数（无副作用，便于单测）。

- `imageClipVisible(imageClip, time)`
- `backgroundAtTime(backgroundClips, fallbackColor, legacyImage, time)` -> `{ color } | { image }`
- `audioClipsAtTime(audioClips, time)`
- `checkMediaOverlap(list, start, duration, exceptId)`：重叠与吸附规则，对齐现有时间线事件。
- `migrateLegacyBackground(...)`：把 legacy base64 背景图迁入素材库并生成全长背景片段。

### 5.3 src/audioScheduler.js

职责：Web Audio 调度，让多条音频跟随全局播放头精确播放。

- 惰性创建 `AudioContext`（用户手势后 resume）。
- 每个片段一个 `AudioBufferSourceNode`，音频解码一次缓存 `AudioBuffer`。
- 按 `start + offset` 与全局时钟对齐；`play() / pause() / seek(time) / destroy()`。
- 时间映射抽成纯函数 `planAudioPlayback(clips, time, fps)`（确定性、无漂移、循环回绕），供单测。
- `masterGain` 同时接扬声器（预览）与录制器 `MediaStreamDestination`（导出混音）。

### 5.4 渲染

- 合成顺序：先画背景（`backgroundAtTime`），再按 `sceneDrawOrder(clips + imageClips)` 从底到顶画图片与模型；图片用 `drawImage(bitmap, transform)`。
- 录制：`useRecorder.paintBackground` 改为接收 `backgroundAtTime` 结果；音频改接 `audioScheduler.masterGain`。

### 5.5 时间线 UI

- MultiTimeline 增加 图片 / 背景 / 音频 三个轨道区，复用现有吸附、缩放、右键菜单、锁定隐藏模式。
- 音频片段先显示名称 + 时长（波形留到 M5）。

## 6. 数据流

- 导入：文件选择器 -> 校验类型 / 大小 -> `putAsset` -> 素材出现在对应标签页 -> 点击添加到时间线生成片段。
- 预览渲染：每帧按播放头解析可见模型 / 图片片段与背景，按 z 序合成到画布。
- 播放：模型 / 图片 / 背景由工程时钟驱动；音频由 scheduler 按同一时钟调度。
- 录制：视频沿用 `captureStream` 逐帧绘制；背景走 `backgroundAtTime`；音频经 `masterGain` 混入。
- 工程导出：写元数据 + 片段；可选「连同素材打包」把素材二进制并入导出文件（小文件内嵌、大文件以 Blob 打包，后续里程碑细化）。

## 7. 迁移

- v3 -> v4：`clips` 原样读入；`imageClips` / `backgroundClips` / `audioClips` 初始化为空；保留 `background` / `backgroundImage` / `backgroundImageName` 作兜底。
- 渲染时某时间无背景片段则回退 legacy 图片，再回退纯色。
- 用户第一次在背景图层编辑背景时，把 legacy base64 图迁入素材库并生成全长背景片段，清空 legacy 字段（一步操作，可撤销）。
- 素材缺失：片段保留并标记缺失，渲染跳过、导出时警告。

## 8. 错误处理

- 存储不可用或 `persist()` 被拒：降级为内存会话库，并提示「刷新后素材会丢失」。
- 文件超限 / 类型不支持：拒绝并提示。
- `AudioContext` 被浏览器策略暂停：提示用户点击播放以启用声音。
- 引用素材缺失：片段标记缺失，渲染跳过、导出警告。

## 9. 测试

- 单测 `mediaTracks`：可见性、`backgroundAtTime` 优先级、`audioClipsAtTime`、重叠 / 吸附、迁移纯函数。
- 单测 `assetStore`：用注入的内存后端覆盖增删查。
- 单测 `audioScheduler`：用注入的假时钟 / 假 AudioContext 验证 `planAudioPlayback` 确定性、无漂移、循环回绕。
- 浏览器实测：导入图片 / 音频、加片段、跳帧、播放、录制含音导出；三分类素材库；旧工程打开兼容。

## 10. 实施里程碑

- M1 素材库：assetStore + 三分类 UI + 最小导入 + 工程 v4 迁移。验收：导入的图片 / 音频出现在对应标签页、刷新后仍在、旧工程可打开。
- M2 普通图片轨道：加图片片段、变换 / 关键帧 / 上下层 / 吸附 / 撤销 + 渲染。验收：图片像人物一样穿插叠放、可拖动缩放、可撤销。

  已实现，详见 [M2 实施记录](../plans/2026-10-12-image-tracks.md)。图片片段增加原始 `width` / `height`，以保留准确的选框几何；图片上限为 64 个，与 16 个模型片段分别计数，共用图层编号。
- M3 背景图层：按时间切背景 + 迁移 legacy 背景图 + 渲染 / 录制。验收：时间线切换纯色 / 图片全屏、录制符合。

  已实现，详见 [M3 实施记录](../plans/2026-10-12-background-track.md)。背景片段上限 64 个，只占一条轨道、不占视觉图层编号；重叠与越界整体拒绝。迁移 legacy 背景图时只填补空档，避免与同一步新增的片段重叠。
- M4 音频轨道：多音频调度 + 混入导出。验收：多条叠放、跳帧 / 循环同步、导出含音。
- M5 上传增强（后续）：拖拽、批量、波形。
