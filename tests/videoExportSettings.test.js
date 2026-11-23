import test from 'node:test'
import assert from 'node:assert/strict'
import {videoExportSettings} from '../src/videoExportSettings.js'
test('导出默认真 1080p，横竖屏尺寸、画质码率与工程帧率对应',()=>{
  assert.deepEqual(videoExportSettings(),{width:1920,height:1080,fps:30,videoBitsPerSecond:12000000,audioBitsPerSecond:192000})
  assert.deepEqual(videoExportSettings({resolution:'720',portrait:true,fps:60}),{width:720,height:1280,fps:60,videoBitsPerSecond:10666667,audioBitsPerSecond:192000})
  assert.equal(videoExportSettings({resolution:540,quality:'standard'}).videoBitsPerSecond,1500000)
  assert.equal(videoExportSettings({quality:'maximum',fps:60}).videoBitsPerSecond,40000000)
  assert.deepEqual(videoExportSettings({resolution:9999,quality:'bad',fps:0}),videoExportSettings())
})
