import test from 'node:test'
import assert from 'node:assert/strict'
import { createVideoSources } from '../src/videoSources.js'

const flush = () => new Promise(resolve => setImmediate(resolve))

/** 最小 <video> 替身：记录播放/暂停/加载次数，可手动触发事件。 */
function fakeVideo() {
  return {
    src: '', currentTime: 0, duration: NaN, readyState: 0, paused: true,
    plays: 0, pauses: 0, loads: 0, listeners: {},
    addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler) },
    removeAttribute() { this.src = '' },
    load() { this.loads++ },
    play() { this.plays++; this.paused = false; return Promise.resolve() },
    pause() { this.pauses++; this.paused = true },
    fire(type) { for (const handler of this.listeners[type] || []) handler() },
  }
}

function setup(overrides = {}) {
  const elements = new Map()
  let changes = 0
  const sources = createVideoSources({
    url: async id => (id === 'missing' ? null : 'blob:' + id),
    create: () => { const el = fakeVideo(); return el },
    changed: () => { changes++ },
    ...overrides,
  })
  return { sources, elements, changeCount: () => changes }
}

test('sync 惰性创建元素并加载素材，素材缺失标记为 missing', async () => {
  const { sources, changeCount } = setup()
  sources.sync(['a', 'missing'])
  await flush()
  assert.equal(sources.get('a').src, 'blob:a')
  assert.equal(sources.get('a').loads, 1)
  assert.equal(sources.status('a'), 'loading')
  assert.equal(sources.status('missing'), 'missing', '拿不到素材地址就是缺失')
  sources.get('a').fire('loadeddata')
  assert.equal(sources.status('a'), 'ready')
  assert.ok(changeCount() >= 3, '创建、加载完成与缺失都会通知调用方')
})

test('sync 释放不再使用的素材，destroy 清空全部', async () => {
  const { sources } = setup()
  sources.sync(['a', 'b'])
  await flush()
  const removed = sources.get('b')
  sources.sync(['a'])
  assert.equal(sources.get('b'), null)
  assert.equal(removed.pauses, 1)
  assert.equal(removed.src, '', '释放时摘掉素材地址，避免继续持有 Blob')
  sources.destroy()
  assert.equal(sources.get('a'), null)
  assert.equal(sources.status('a'), 'missing')
})

test('align：暂停时按素材内时间 seek，容差内不重复 seek', async () => {
  const { sources } = setup()
  sources.sync(['a'])
  await flush()
  const el = sources.get('a')
  el.paused = false
  sources.align('a', 2, { playing: false })
  assert.equal(el.paused, true, '暂停播放头时视频也要停下来')
  assert.equal(el.currentTime, 2)
  el.currentTime = 2.01
  sources.align('a', 2, { playing: false })
  assert.equal(el.currentTime, 2.01, '偏差在 seek 容差内保持不动，避免抖动')
  assert.equal(sources.align('unknown', 1), null)
})

test('align：播放时让视频自己走，偏差大才纠正', async () => {
  const { sources } = setup()
  sources.sync(['a'])
  await flush()
  const el = sources.get('a')
  sources.align('a', 1, { playing: true })
  assert.equal(el.plays, 1)
  assert.equal(el.paused, false)
  assert.equal(el.currentTime, 1)
  el.currentTime = 1.05
  sources.align('a', 1.1, { playing: true })
  assert.equal(el.plays, 1, '已经在播就不重复调用 play')
  assert.equal(el.currentTime, 1.05, '偏差小于容差不纠正')
  sources.align('a', 1.6, { playing: true })
  assert.equal(el.currentTime, 1.6, '偏差过大时纠正到播放头')
})

test('align 把目标时间夹在素材时长内，drawable 取决于实际帧数据', async () => {
  const { sources } = setup()
  sources.sync(['a'])
  await flush()
  const el = sources.get('a')
  el.duration = 5
  sources.align('a', 99, { playing: false })
  assert.ok(el.currentTime < 5)
  assert.equal(sources.drawable('a'), false)
  el.readyState = 2
  assert.equal(sources.drawable('a'), true)
})

test('pauseExcept 只暂停播放头没覆盖的视频', async () => {
  const { sources } = setup()
  sources.sync(['a', 'b'])
  await flush()
  const a = sources.get('a'), b = sources.get('b')
  a.paused = b.paused = false
  sources.pauseExcept(['a'])
  assert.equal(a.paused, false)
  assert.equal(b.paused, true)
  assert.equal(b.pauses, 1)
})
