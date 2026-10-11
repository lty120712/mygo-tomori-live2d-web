import test from 'node:test'
import assert from 'node:assert/strict'
import {formatTimecode,parseTimecode} from '../src/timecode.js'
test('时间码使用整数分秒帧，帧精度可往返且不显示浮点长小数',()=>{
  assert.equal(formatTimecode(158/30,30),'00:05:08')
  for(const fps of [24,30,60])for(const frame of [0,1,158,fps*60-1,fps*600])assert.equal(Math.round(parseTimecode(formatTimecode(frame/fps,fps),fps)*fps),frame)
})
test('拒绝无效时间码，秒和帧进位正确',()=>{
  assert.equal(formatTimecode(59.9999,30),'01:00:00')
  for(const text of ['5.267','00:60:00','00:05:30','-1:00:00','abc'])assert.equal(parseTimecode(text,30),null)
})
