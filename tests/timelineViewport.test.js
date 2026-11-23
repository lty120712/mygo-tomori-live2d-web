import test from 'node:test'
import assert from 'node:assert/strict'
import {revealTimelineTime,timelineRange,fitTimelineRange,clipEditScope,clipEditFrames,neighborEditFrames} from '../src/timelineViewport.js'

const viewport={duration:100,laneWidth:1600,visibleWidth:400,scrollLeft:0}
test('定位播放头保持缩放并居中，工程首尾和无横向滚动时正确限位',()=>{
  assert.equal(revealTimelineTime(50,{...viewport,center:true}),600)
  assert.equal(revealTimelineTime(100,{...viewport,center:true}),1200)
  assert.equal(revealTimelineTime(-10,{...viewport,center:true}),0)
  assert.equal(revealTimelineTime(50,{...viewport,laneWidth:400,center:true}),0)
})
test('播放头位于安全区域时视野不动，到右侧才翻页，循环或反向跳转回到对应区间',()=>{
  assert.equal(revealTimelineTime(20,viewport),0)
  assert.equal(revealTimelineTime(24,viewport),360)
  assert.equal(revealTimelineTime(10,{...viewport,scrollLeft:600}),0)
  assert.equal(revealTimelineTime(0,{...viewport,scrollLeft:1200}),0)
  assert.equal(revealTimelineTime(100,{...viewport,scrollLeft:1200}),1200)
})
test('隐藏或尚未测量的时间线不定位，窄视口和异常输入不会生成无效滚动值',()=>{
  for(const patch of [{visibleWidth:0},{visibleWidth:-170},{laneWidth:0},{duration:0},{scrollLeft:NaN}])assert.equal(revealTimelineTime(50,{...viewport,...patch}),null)
  const result=revealTimelineTime(50,{...viewport,visibleWidth:20,padding:100})
  assert.equal(result,795)
})
test('多选范围覆盖最早入点和最晚出点，单点关键帧可定位，忽略无效和工程外范围',()=>{
  assert.deepEqual(timelineRange([{start:20,duration:5},{start:60,duration:10}],100),{start:20,end:70})
  assert.deepEqual(timelineRange([{start:20,duration:0}],100),{start:20,end:20})
  assert.deepEqual(timelineRange([{start:-2,duration:4},{start:95,duration:10},null,{start:Infinity,duration:2},{start:1,duration:-1}],100),{start:0,end:100})
  assert.equal(timelineRange([{start:120,duration:10}],100),null)
  assert.equal(timelineRange([],100),null)
})
test('适合所选取能容纳整个范围的最大缩放级别，并保持选区居中',()=>{
  assert.deepEqual(fitTimelineRange({start:20,end:30},{duration:100,visibleWidth:400}),{level:3,scrollLeft:600})
  assert.deepEqual(fitTimelineRange({start:0,end:100},{duration:100,visibleWidth:400}),{level:0,scrollLeft:0})
  assert.deepEqual(fitTimelineRange({start:50,end:50},{duration:100,visibleWidth:400}),{level:4,scrollLeft:3000})
})
test('适合所选处理首尾、离散多选和缩放后的布局宽度，不改变源选区',()=>{
  const range={start:98,end:100},before={...range}
  assert.deepEqual(fitTimelineRange(range,{duration:100,visibleWidth:400}),{level:4,scrollLeft:6000})
  assert.deepEqual(range,before)
  const spread=timelineRange([{start:1,duration:2},{start:80,duration:2}],100)
  assert.equal(fitTimelineRange(spread,{duration:100,visibleWidth:900}).level,0)
  assert.equal(fitTimelineRange(null,{duration:100,visibleWidth:400}),null)
  assert.equal(fitTimelineRange(range,{duration:100,visibleWidth:0}),null)
})

test('剪辑点包含片段起止，共用接缝只停一次，忽略工程外端点',()=>{
  const clips=[{start:4,duration:2},{start:0,duration:4},{start:7,duration:9},{start:3,duration:0}]
  for(const fps of [24,30,60]){
    const frames=clipEditFrames(clips,10,fps)
    assert.deepEqual(frames,[0,4*fps,6*fps,7*fps])
    assert.deepEqual(neighborEditFrames(frames,4*fps),{previous:0,next:6*fps})
    assert.deepEqual(neighborEditFrames(frames,5*fps),{previous:4*fps,next:6*fps})
    assert.deepEqual(neighborEditFrames(frames,0),{previous:null,next:4*fps})
    assert.deepEqual(neighborEditFrames(frames,10*fps),{previous:7*fps,next:null})
  }
  assert.deepEqual(neighborEditFrames([],0),{previous:null,next:null})
})

test('剪辑点导航在同轨多选、背景、音频及跨轨选区使用正确范围',()=>{
  const clips=[{id:'a',track:0},{id:'b',track:0},{id:'c',track:1}]
  const backgroundClips=[{id:'bg'},{id:'bg2'}],audioClips=[{id:'aud',track:2},{id:'aud2',track:3},{id:'aud3',track:2}]
  const input={clips,backgroundClips,audioClips}
  assert.deepEqual(clipEditScope({...input,visualIds:['a','b']}).clips,clips.slice(0,2))
  assert.equal(clipEditScope({...input,visualIds:['a','c']}).kind,'all')
  assert.deepEqual(clipEditScope({...input,backgroundId:'bg'}).clips,backgroundClips)
  assert.deepEqual(clipEditScope({...input,audioId:'aud'}).clips,[audioClips[0],audioClips[2]])
  assert.equal(clipEditScope({...input,audioId:'deleted'}).clips.length,8)
})
