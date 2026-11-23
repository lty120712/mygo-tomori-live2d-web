import test from 'node:test'
import assert from 'node:assert/strict'
import { createAudioScheduler } from '../src/audioScheduler.js'
import { createAudioClip } from '../src/mediaTracks.js'

const asset = { id: 'song', name: '主题曲.mp3', kind: 'audio', duration: 12 }

// 假 Web Audio：记录创建的音源、增益自动化与连接关系。
function fakeContext() {
  const created = { sources: [], gains: [], filters: [], connects: [] }
  const ctx = {
    currentTime: 10, state: 'running', destination: { name: 'speakers' },
    resumeCalls: 0, closeCalls: 0,
    resume() { ctx.resumeCalls++ },
    close() { ctx.closeCalls++ },
    createGain() {
      const node = { gain: { value: 1, calls: [], setValueAtTime(v, t) { this.calls.push(['set', v, t]) }, linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]) } }, connect(target) { created.connects.push({ from: node, to: target }) } }
      created.gains.push(node)
      return node
    },
    createBufferSource() {
      const node = { buffer: null, started: null, stopped: false, connect(target) { created.connects.push({ from: node, to: target }) }, start(...args) { node.started = args }, stop() { node.stopped = true } }
      created.sources.push(node)
      return node
    },
    createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{ kind: 'audio', id: 'mix' }] } } },
    createBiquadFilter() {
      const node = { type: 'lowpass', frequency: { value: 0 }, Q: { value: 0 }, connect(target) { created.connects.push({ from: node, to: target }) } }
      created.filters.push(node)
      return node
    },
  }
  return { ctx, created }
}

function setup(clips, options = {}) {
  const { ctx, created } = fakeContext()
  const decoded = []
  const scheduler = createAudioScheduler({
    openContext: () => ctx,
    loadFile: async id => id === 'missing' ? null : ({ assetId: id }),
    decode: async (_context, file) => { decoded.push(file.assetId); return { duration: 12 } },
    lookahead: .03,
    ...options,
  })
  scheduler.setClips(clips)
  return { ctx, created, decoded, scheduler }
}

test('播放同时调度当前与后续片段，未来片段到起点才发声', async () => {
  const a = createAudioClip(asset, 0, 5, 0), b = createAudioClip(asset, 6, 3, 1)
  const { created, scheduler } = setup([a, b])
  const plan = await scheduler.play(2)
  assert.equal(plan.length, 2)
  assert.equal(created.sources.length, 2)
  assert.deepEqual(created.sources[1].started, [14.03, 0, 3])
  assert.equal(created.sources[0].started[0], 10.03)
  assert.equal(created.sources[0].started[1], 2)
  assert.equal(created.sources[0].started[2], 3)
  // gains[0] 是主增益，片段自己的增益从 1 开始
  assert.deepEqual(created.gains[1].gain.calls, [['set', 1, 10.03]])
})

test('范围预览保留原有源入点，并把跨出点的音源截在播放范围末尾',async()=>{
  const partial=createAudioClip(asset,1,8),late=createAudioClip({...asset,id:'late'},4,6,1),outside=createAudioClip({...asset,id:'outside'},5,3,2)
  partial.offset=1.5
  const {created,decoded,scheduler}=setup([partial,late,outside],{lookahead:0})
  await scheduler.prepare({start:2,end:5})
  assert.deepEqual(decoded.sort(),['late','song'])
  const plan=await scheduler.play(2,{endTime:5})
  assert.deepEqual(plan.map(p=>[p.assetId,p.offset,p.delay,p.duration]),[['song',2.5,0,3],['late',0,2,1]])
  assert.deepEqual(created.sources.map(s=>s.started),[[10,2.5,3],[12,0,1]])
  await scheduler.play(2,{endTime:5})
  assert.ok(created.sources.slice(0,2).every(s=>s.stopped))
  assert.deepEqual(created.sources.slice(2).map(s=>s.started),[[10,2.5,3],[12,0,1]])
  await scheduler.play(5,{endTime:5})
  assert.equal(created.sources.length,4)
  assert.ok(created.sources.every(s=>s.stopped))
})

test('解码期间暂停或销毁，迟到的结果不能重启音源', async () => {
  for (const action of ['pause', 'destroy']) {
    let finish, entered
    const pending = new Promise(resolve => { finish = resolve })
    const decoding = new Promise(resolve => { entered = resolve })
    const { scheduler, created } = setup([createAudioClip(asset, 0, 10, 0)], {
      decode: async () => { entered(); await pending; return { duration: 12 } },
    })
    const playing = scheduler.play(0)
    await decoding
    scheduler[action]()
    finish()
    assert.deepEqual(await playing, [])
    assert.equal(created.sources.length, 0)
    assert.equal(scheduler.playing, false)
    assert.deepEqual(scheduler.problems, [])
  }
})

test('解码中切换播放头只允许最后一次请求启动，未来片段按新起点重新安排', async () => {
  let finish, entered
  const pending = new Promise(resolve => { finish = resolve })
  const decoding = new Promise(resolve => { entered = resolve })
  const { scheduler, created } = setup([createAudioClip(asset, 0, 10, 0), createAudioClip(asset, 12, 3, 1)], {
    decode: async () => { entered(); await pending; return { duration: 20 } },
  })
  const first = scheduler.play(0)
  await decoding
  const second = scheduler.seek(4)
  finish()
  assert.deepEqual(await first, [])
  const plan = await second
  assert.equal(plan.length, 2)
  assert.deepEqual(created.sources.map(s => s.started), [[10.03, 4, 6], [18.03, 0, 3]])
})

test('冷启动先准备混音流；解码耗时后起播位置追上播放时钟', async () => {
  const { scheduler, ctx, created } = setup([createAudioClip(asset, 0, 10, 0)], {
    decode: async () => { ctx.currentTime += 2; return { duration: 12 } },
  })
  await scheduler.play(0)
  assert.deepEqual(created.sources[0].started, [12.03, 2, 8])
  scheduler.pause()
  await scheduler.prepare()
  assert.equal(scheduler.stream.getAudioTracks().length, 1)
  assert.equal(scheduler.playing, false)
})

test('多条轨道同时出声，淡入淡出窗口按剩余时间截断', async () => {
  const a = { ...createAudioClip(asset, 0, 10, 0), volume: .8, fadeIn: 4, fadeOut: 2 }
  const b = { ...createAudioClip(asset, 0, 10, 1), volume: .5 }
  const { created, scheduler } = setup([a, b])
  await scheduler.play(3)
  assert.equal(created.sources.length, 2)
  assert.deepEqual(created.sources.map(s => s.started[1]), [3, 3])
  assert.deepEqual(created.sources.map(s => s.started[2]), [7, 7])
  // 淡入 4 秒已走 3 秒 → 只剩 1 秒从当前音量升到 volume；淡出 2 秒 → 末尾降到 0
  const round = calls => calls.map(([kind, value, time]) => [kind, Math.round(value * 1e6) / 1e6, Math.round(time * 1e6) / 1e6])
  assert.deepEqual(round(created.gains[1].gain.calls), [['set', .6, 10.03], ['ramp', .8, 11.03], ['set', .8, 15.03], ['ramp', 0, 17.03]])
  assert.deepEqual(round(created.gains[2].gain.calls), [['set', .5, 10.03]])
})

test('暂停停掉所有音源，播放中跳帧按新时间重排，暂停后跳帧不发声', async () => {
  const clip = createAudioClip(asset, 0, 10, 0)
  const { created, scheduler } = setup([clip])
  await scheduler.play(0)
  await scheduler.seek(4)
  assert.equal(created.sources.length, 2)
  assert.equal(created.sources[0].stopped, true)
  assert.equal(created.sources[1].started[1], 4)
  assert.equal(created.sources[1].started[2], 6)
  scheduler.pause()
  assert.equal(created.sources[1].stopped, true)
  assert.equal(scheduler.playing, false)
  await scheduler.seek(6)
  assert.equal(created.sources.length, 2)
})

test('同一素材只解码一次，缺失素材跳过，销毁后关闭上下文并清空缓存', async () => {
  const clips = [createAudioClip(asset, 0, 5, 0), createAudioClip({ id: 'missing' }, 0, 5, 1)]
  const { ctx, created, decoded, scheduler } = setup(clips)
  await scheduler.play(0)
  await scheduler.play(1)
  assert.deepEqual(decoded, ['song'])
  // 第二次播放换掉上一批音源，但素材只解码一次
  assert.equal(created.sources.length, 2)
  assert.equal(created.sources[0].stopped, true)
  assert.equal(created.sources[1].stopped, false)
  assert.equal(created.sources.every(s => s.buffer), true)
  scheduler.destroy()
  assert.equal(ctx.closeCalls, 1)
  await scheduler.play(0)
  assert.deepEqual(decoded, ['song', 'song'])
})

test('主增益同时接扬声器与录制混音流，暂停后不再排新音源', async () => {
  const { ctx, created, scheduler } = setup([createAudioClip(asset, 0, 5, 0)])
  await scheduler.play(0)
  const master = created.gains[0]
  const clipGain = created.gains[1]
  assert.equal(created.connects.filter(c => c.from === master && c.to === ctx.destination).length, 1)
  assert.equal(created.connects.filter(c => c.from === master && c.to !== ctx.destination).length, 1)
  assert.equal(created.connects.filter(c => c.from === clipGain && c.to === master).length, 1)
  assert.equal(created.connects.filter(c => c.from === created.sources[0] && c.to === clipGain).length, 1)
  assert.deepEqual(scheduler.stream.getAudioTracks(), [{ kind: 'audio', id: 'mix' }])
  scheduler.pause()
  const plan = await scheduler.play(9)
  assert.deepEqual(plan, [])
  assert.equal(created.sources.length, 1)
})

test('上下文被浏览器挂起时播放前先恢复', async () => {
  const { ctx, scheduler } = setup([createAudioClip(asset, 0, 5, 0)])
  ctx.state = 'suspended'
  await scheduler.play(0)
  assert.equal(ctx.resumeCalls, 1)
  ctx.state = 'running'
  await scheduler.play(0)
  assert.equal(ctx.resumeCalls, 1)
})

test('滤镜片段走 source → gain → filter → master，无滤镜时保持直连', async () => {
  const filtered = { ...createAudioClip(asset, 0, 5, 0), filter: 'bandpass' }
  const plain = createAudioClip(asset, 4, 5, 1)
  const { created, scheduler } = setup([filtered, plain])
  await scheduler.play(0)
  assert.equal(created.filters.length, 1)
  assert.deepEqual({ type: created.filters[0].type, frequency: created.filters[0].frequency.value, q: created.filters[0].Q.value }, { type: 'bandpass', frequency: 1600, q: .9 })
  const [gainA, gainB] = [created.gains[1], created.gains[2]]
  assert.equal(created.connects.filter(c => c.from === gainA && c.to === created.filters[0]).length, 1)
  assert.equal(created.connects.filter(c => c.from === created.filters[0] && c.to === created.gains[0]).length, 1)
  // 无滤镜的片段仍然直接接主增益，不额外插节点
  assert.equal(created.connects.filter(c => c.from === gainB && c.to === created.gains[0]).length, 1)
  assert.equal(created.connects.filter(c => c.to === created.filters[0]).length, 1)
})

test('音量关键帧排成自动化折线：保持段用 setValueAtTime，斜坡用 linearRampToValueAtTime', async () => {
  const clip = { ...createAudioClip(asset, 0, 10, 0), volumeKeyframes: [{ time: 2, value: .2 }, { time: 6, value: 1 }] }
  const { created, scheduler } = setup([clip])
  await scheduler.play(0)
  const round = calls => calls.map(([kind, value, time]) => [kind, Math.round(value * 1e6) / 1e6, Math.round(time * 1e6) / 1e6])
  assert.deepEqual(round(created.gains[1].gain.calls), [['set', .2, 10.03], ['set', .2, 12.03], ['ramp', 1, 16.03]])
  // 中途起播时只排剩下的折点，并把起播那一刻的包络值作为起点
  scheduler.pause()
  await scheduler.play(4)
  assert.deepEqual(round(created.gains[2].gain.calls), [['set', .6, 10.03], ['ramp', 1, 12.03]])
})

test('素材缺失或解码失败会记入 problems，供界面提示', async () => {
  const { scheduler } = setup(
    [createAudioClip(asset, 0, 5, 0), createAudioClip({ id: 'broken' }, 0, 5, 1), createAudioClip({ id: 'missing' }, 0, 5, 2)],
    { decode: async (_context, file) => { if (file.assetId === 'broken') throw new Error('解码失败'); return { duration: 5 } } }
  )
  await scheduler.play(0)
  assert.deepEqual(scheduler.problems.sort(), ['broken', 'missing'])
  scheduler.destroy()
  assert.deepEqual(scheduler.problems, [])
})

test('静音与独奏影响调度：静音轨道不排音源，独奏时只排独奏轨道', async () => {
  const { created, scheduler } = setup([createAudioClip(asset, 0, 5, 0), createAudioClip(asset, 0, 5, 1)])
  scheduler.setClips([createAudioClip(asset, 0, 5, 0), createAudioClip(asset, 0, 5, 1)], { 0: { muted: true } })
  await scheduler.play(0)
  assert.equal(created.sources.length, 1)
  scheduler.pause()
  scheduler.setClips([createAudioClip(asset, 0, 5, 0), createAudioClip(asset, 0, 5, 1)], { 1: { solo: true } })
  await scheduler.play(0)
  assert.equal(created.sources.length, 2)
  assert.equal(created.sources.filter(s => s.stopped === false).length, 1)
})
