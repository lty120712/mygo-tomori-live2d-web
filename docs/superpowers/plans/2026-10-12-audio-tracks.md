# 音频轨道（M4）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加多条音频轨道：音频片段按时间线叠放，播放时与工程时钟同步，录制导出包含混音。

**Architecture:** 音频片段存入工程 v4 的 `audioClips`，由 `mediaTracks.js` 的纯函数负责可见性与音量曲线，`audioScheduler.js` 把「播放头 → 需要启动的音频源」的计划落到 Web Audio（`AudioBufferSourceNode` + `GainNode`），主增益同时接扬声器与录制器的 `MediaStreamDestination`。

**Tech Stack:** Vue 3 + Vite；Web Audio API；Node `node:test`（`npm test`）。

**Spec:** `docs/superpowers/specs/2026-10-12-media-tracks-design.md`

## Global Constraints

- 音频片段上限 32 个，轨道编号 0–7；同轨道禁止重叠，不同轨道可同时播放（多条叠放）。
- 音频片段字段：`{ id, assetId, name, track, start, duration, offset, volume, fadeIn, fadeOut }`；`volume` 0–1，`fadeIn` / `fadeOut` 按秒且不超过片段时长。
- 时间映射只由纯函数决定（`planAudioPlayback` / `audioGainAt`），播放与跳帧都从播放头重新计算，避免累积漂移；循环回绕等于在 0 秒重新调度。
- 音频只在播放时出声；暂停、跳帧、循环回绕都停掉现有音源后按当前时间重排。
- `AudioContext` 惰性创建、在用户手势（点播放）后 `resume()`；浏览器策略拒绝时提示手动点播放。
- 录制把 `masterGain` 的 `MediaStreamDestination` 音轨并入导出；素材缺失的片段跳过并提示。
- 测试命令 `npm test`；构建 `npm run build`；浏览器验证用 `npm run dev -- --host 127.0.0.1 --port 5174`。
- 提交信息用中文一句话。

---

### Task 1: 音频片段纯函数

**Files:** Modify `src/mediaTracks.js`；Test `tests/audioTracks.test.js`（新建）

**Interfaces:**
- Produces: `AUDIO_CLIP_LIMIT`(32)、`AUDIO_TRACK_LIMIT`(8)、`audioClipLimit(clips)`、`createAudioClip(asset, start, duration, track)`、`audioClipsAtTime(clips, time)`、`audioGainAt(clip, time)`、`planAudioPlayback(clips, time, fps)`、`audioClipTemplate(clip)`、`createAudioClipFromTemplate(template, start, duration, track)`。
- `planAudioPlayback` 返回按 `start` 排序的数组，每项 `{ id, assetId, name, track, offset, duration, gain, volume, fadeIn, fadeOut }`：`offset` 为素材内起播秒数（源偏移 + 已播放部分），`duration` 为剩余秒数，`gain` 为当前音量，`fadeIn` / `fadeOut` 为剩余淡入淡出窗口（按剩余时长截断）。

**测试要点（先失败）**

1. `createAudioClip` 字段与默认值；`audioClipLimit` 到 32 报错。
2. `audioClipsAtTime` 边界：`start` 命中、`start+duration` 不命中。
3. `audioGainAt`：中段等于 `volume`；淡入从 0 线性升到 `volume`；淡出线性降到 0；`volume` 与淡入淡出同时存在取较小值。
4. `planAudioPlayback`：从片段中点起播时 `offset` 前移、`duration` 缩短；淡入窗口按剩余时间截断；空片段表返回空数组；结果不受输入顺序影响（按 `start` 排序）。
5. 同一时间多个不同轨道的片段都出现在计划里（叠放）。

- [ ] Step 1 写失败测试 → Step 2 `npm test` 确认失败 → Step 3 实现 → Step 4 通过 → Step 5 提交（`音频片段纯函数：时间解析与音量曲线`）。

---

### Task 2: 工程 v4 读写 audioClips

**Files:** Modify `src/sceneProject.js`；Test `tests/sceneProjectV4.test.js`（追加）

**Interfaces:** Consumes Task 1 的 `AUDIO_CLIP_LIMIT` / `createAudioClip`；Produces `readProject` 解析并校验 `audioClips`。

**测试要点**

1. 往返保留素材引用、轨道、起止、源偏移、音量与淡入淡出。
2. 非法数据：非数组、缺 `assetId`、超过 32 个、`track` 超出 0–7 → 抛错或夹到合法范围；`volume` 夹到 0–1；`fadeIn`/`fadeOut` 不超过时长。
3. v3 旧工程 `audioClips` 为空数组。

- [ ] 五步 TDD 同上，提交（`工程 v4 读写音频片段`）。

---

### Task 3: 音频调度引擎

**Files:** Create `src/audioScheduler.js`；Test `tests/audioScheduler.test.js`（新建，用假 `AudioContext`）

**Interfaces:**
- Consumes Task 1 的 `planAudioPlayback`。
- Produces: `createAudioScheduler({ createContext, openContext, destination })`，返回 `{ setClips, play(time), pause, seek(time), resume, stream, masterGain, state, destroy }`；上下文与解码可注入（默认浏览器 `AudioContext` + `decodeAudioData`，解码结果按 `assetId` 缓存）。
- 每个音频源：`source.start(context.currentTime + lookahead, entry.offset, entry.duration)`，增益自动化播放 `entry.gain` → `volume` 的剩余淡入、末尾 `fadeOut` 降到 0。

**测试要点（假上下文记录调用）**

1. `play(t)` 只调度覆盖 `t` 的片段；跳帧到片段中点时 `start` 的 `offset` / `duration` 与计划一致。
2. 淡入淡出窗口在中途播放时被截断（跳帧后仍准确）。
3. `pause()` 停止所有音源；`seek(t)` 后播放中会按新时间重排。
4. 同一 `assetId` 只解码一次；`destroy()` 关闭上下文并清空缓存。
5. `stream` 返回 `MediaStreamDestination` 的音轨（录制用）；上下文 `resume()` 在 `play()` 前调用。

- [ ] 五步 TDD，提交（`音频调度引擎：按播放头重排与增益自动化`）。

---

### Task 4: 时间线音频轨道与编辑

**Files:** Modify `src/components/MultiTimeline.vue`、`src/components/AssetLibrary.vue`、`src/SceneEditor.vue`、`src/composables/useSceneEditor.js`

**Interfaces:**
- `MultiTimeline` 新 props `audioClips`；新 emits `add-audio`（素材）、`import-audio`、`audio-edit`（`(id, patch)`）、`delete-audio`（id）、`paste-audio`（模板）。
- `AssetLibrary` 音频卡片增加「轨道」按钮（把该音频加到音频轨）。
- `useSceneEditor` 新增 `addAudioClip(asset)`、`editAudioClip(id, patch)`、`deleteAudioClip(id)`、`pasteAudioClip(template)`、`audioClips` 的调度接入（`play` / `pause` / `seek` / 循环回绕 / 卸载）。

**要求**

- 音频行按已用轨道（0–7）渲染，无片段时仍显示一条空行与「＋音频」；`＋音频` 列出素材库音频（名称 + 时长）或导入新文件。
- 片段块显示名称与时长；拖动移动、两端裁剪、吸附、Delete 删除、Ctrl+C/V 复制粘贴与背景轨道一致（复制带走素材与时长）。
- 右键菜单：音量（0–100%）、淡入（秒）、淡出（秒）、移动到播放头、延伸到工程结尾、删除；同轨道重叠拒绝并提示。
- 播放/暂停/跳帧/循环与音频调度同步；录制时把混音并进导出。

- [ ] 实现 + `npm test` + `npm run build` + 浏览器验证（新增音频素材、叠放两条轨道、拖动裁剪撤销一步、跳帧后播放起点正确、录制文件含音轨），提交（`时间线音频轨道与音频调度接入`）。

---

### Task 5: 录制混音

**Files:** Modify `src/composables/useRecorder.js`、`src/composables/useSceneEditor.js`

**Interfaces:** `useRecorder.start(sourceCanvas, audioStream, mode, getBackground, getViewRect, fps)` 用传入的 `MediaStream` 音轨替代原来的 `<audio>` 元素通路（原通路从未被调用，属死代码）。

**要求**

- 录制时把 `audioScheduler` 的混音流并入导出；没有音频片段时不加音轨。
- 导出的 WebM 含音轨可用文件头里出现 `A_OPUS` / `A_VORBIS` 判断（浏览器验证）。

- [ ] 实现 + 浏览器录制验证（`ffprobe` 不可用时用文件字节扫描），提交（`录制混入音频轨道混音`）。

---

### Task 6: 说明书、发布记录与实施记录

**Files:** Modify `src/manualPages.js`、`README.md`、`docs/RELEASES.md`、`docs/superpowers/specs/2026-10-12-media-tracks-design.md`；Rewrite 本文件为「音频轨道（M4）实施记录」。

**要求**

- 手册新增「音频轨道」一章：添加音频、叠放与轨道编号、拖动裁剪与吸附、音量与淡入淡出、复制粘贴与删除、录制混音、素材缺失处理。
- 发布记录写清 M4 完成项与验证结论；设计文档状态改为 M1–M4 已完成。
- 本文件改写为实施记录（完成项 / 约定 / 验证 / 后续），末尾注明下一阶段（M5 上传增强为后续项）。

- [ ] 提交（`M4 音频轨道说明书与发布记录`）。

---

## 完成后的交接

M4 完成后，剩余后续项为设计文档 §2「不包含」中的部分：拖拽上传、批量上传、波形与图片/音频滤镜。
