import test from 'node:test'
import assert from 'node:assert/strict'
import { packProject, unpackProject, restoreBundle } from '../src/projectBundle.js'
import { createAssetStore, memoryBackend } from '../src/assetStore.js'
import { readProject } from '../src/sceneProject.js'

function store() {
  return createAssetStore(memoryBackend(), { probeImage: async () => ({ width: 2, height: 2 }), probeAudio: async () => ({ duration: 2 }), decodeWaveform: async () => null })
}
test('工程包跨素材库往返，图片与背景共用素材只打包一次，导入分配新 ID', async () => {
  const source = store(), target = store()
  const image = await source.importFile(new File(['image'], 'a.png', { type: 'image/png' }))
  const audio = await source.importFile(new File(['audio'], 'a.wav', { type: 'audio/wav' }))
  const project = { imageClips: [{ assetId: image.id }], backgroundClips: [{ assetId: image.id }], audioClips: [{ assetId: audio.id, offset: 1 }] }
  const packed = await packProject(project, source), bundle = await unpackProject(packed)
  assert.equal(bundle.assets.length, 2)
  const restored = await restoreBundle(bundle, target)
  assert.notEqual(restored.imageClips[0].assetId, image.id)
  assert.equal(restored.backgroundClips[0].assetId, restored.imageClips[0].assetId)
  assert.equal(await (await target.blob(restored.audioClips[0].assetId)).text(), 'audio')
  assert.equal(restored.audioClips[0].offset, 1)
  assert.equal((await source.list()).length, 2)
})
test('拒绝缺失素材、截断或格式错误的工程包', async () => {
  await assert.rejects(packProject({ audioClips: [{ assetId: 'missing' }] }, store()), /素材缺失/)
  const valid = await packProject({}, store())
  await assert.rejects(unpackProject(valid.slice(0, valid.size - 1)), /损坏/)
  await assert.rejects(unpackProject(new Blob(['not a project'])), /损坏/)
})
test('素材导入中途失败会回收本次新增素材', async () => {
  const target = store()
  await assert.rejects(restoreBundle({ project: {}, assets: [
    { id: 'ok', file: new File(['ok'], 'a.png', { type: 'image/png' }) },
    { id: 'bad', file: new File(['bad'], 'a.txt', { type: 'text/plain' }) },
  ] }, target), /不支持/)
  assert.equal((await target.list()).length, 0)
})

/** 手写前缀与清单，用来构造正常打包流程产不出的损坏工程包。 */
function crafted(manifest, payload = new Uint8Array(0), declaredLength) {
  const bytes = new TextEncoder().encode(JSON.stringify(manifest))
  const prefix = new Uint8Array(12)
  prefix.set(new TextEncoder().encode('TOMORI01'))
  new DataView(prefix.buffer).setUint32(8, declaredLength ?? bytes.byteLength, true)
  return new Blob([prefix, bytes, payload])
}
const entry = (id, size) => ({ id, name: id + '.png', type: 'image/png', size })

test('工程包清单校验：越权长度、超量素材、重复 ID、非法长度与缺失引用都被拒绝', async () => {
  // 声明长度远超实际文件
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: {}, assets: [] }, new Uint8Array(0), 64 * 1024 * 1024)), /损坏/)
  // 素材数量超过 160
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: {}, assets: Array.from({ length: 161 }, (_, i) => entry('a' + i, 0)) })), /清单无效/)
  // 重复素材 ID
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: {}, assets: [entry('a', 0), entry('a', 0)] })), /素材无效/)
  // 非安全整数长度
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: {}, assets: [entry('a', 1.5)] }, new Uint8Array(2))), /素材无效/)
  // 素材数据不足
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: {}, assets: [entry('a', 4)] }, new Uint8Array(2))), /素材无效/)
  // 尾部有多余字节
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: {}, assets: [entry('a', 2)] }, new Uint8Array(3))), /素材不完整/)
  // 工程引用了清单里没有的素材
  await assert.rejects(unpackProject(crafted({ format: 'TOMORI01', project: { imageClips: [{ assetId: 'other' }] }, assets: [entry('a', 0)] })), /素材不完整/)
})

test('工程结构损坏时解析不抛类型错误，交给工程校验报出可读原因', async () => {
  const bad = crafted({ format: 'TOMORI01', project: { version: 4, clips: [], imageClips: 5 }, assets: [] })
  const bundle = await unpackProject(bad)
  assert.equal(bundle.project.imageClips, 5)
  await assert.rejects(async () => readProject(bundle.project, []), /图片片段列表无效/)
})
