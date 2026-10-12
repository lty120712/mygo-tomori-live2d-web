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

test('v4 的图片/背景/音频/素材集合在 M1 读取时置空，逐项解析留待 M2/M4', () => {
  const p = readProject({ version: 4, clips: [], imageClips: [{ id: 'x' }], backgroundClips: [{ id: 'y' }], audioClips: [{ id: 'z' }], assets: { a: 1 } }, models)
  assert.deepEqual(p.imageClips, [])
  assert.deepEqual(p.backgroundClips, [])
  assert.deepEqual(p.audioClips, [])
  assert.deepEqual(p.assets, {})
})

test('未知版本仍拒绝', () => {
  assert.throws(() => readProject({ version: 9, clips: [] }, models), /版本/)
})
