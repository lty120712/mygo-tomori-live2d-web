import test from 'node:test'
import assert from 'node:assert/strict'
import {mp4ExportPlan} from '../src/mp4Export.js'

test('原生 MP4 仅重建索引并前置 moov，保持音视频编码及像素不变',()=>{
  const plan=mp4ExportPlan('video/mp4;codecs=avc1.42001E,mp4a.40.2')
  assert.equal(plan.input,'input.mp4');assert.deepEqual(plan.args,['-i','input.mp4','-map','0:v:0','-map','0:a?','-c','copy','-movflags','+faststart','output.mp4'])
  assert.deepEqual(mp4ExportPlan(' Video/MP4 ').args,plan.args)
})
test('WebM 仍转换为 H.264/AAC，并写入完整 MP4 索引，允许无音轨',()=>{
  const plan=mp4ExportPlan('video/webm;codecs=vp9,opus')
  assert.equal(plan.input,'input.webm');assert.ok(plan.args.includes('libx264'));assert.ok(plan.args.includes('aac'));assert.ok(plan.args.includes('yuv420p'));assert.ok(plan.args.includes('0:a?'))
  assert.deepEqual(plan.args.slice(-3),['-movflags','+faststart','output.mp4'])
  const high=mp4ExportPlan('video/webm',{videoBitsPerSecond:12000000})
  assert.equal(high.args[high.args.indexOf('-b:v')+1],'12000000')
  assert.ok(!high.args.includes('-crf'))
})
