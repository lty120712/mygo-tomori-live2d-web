import test from 'node:test'
import assert from 'node:assert/strict'
import { sceneAudioClips } from '../src/sceneAudio.js'
import { createVideoClip, createAudioClip, planAudioPlayback } from '../src/mediaTracks.js'
import { createProject, readProject } from '../src/sceneProject.js'

const video = () => createVideoClip({ id:'film',name:'影片',width:960,height:540 }, 2, 8, 3)
const project = () => ({ clips:[], imageClips:[video()], backgroundClips:[], audioClips:[createAudioClip({id:'music'},0,10,0)], audioTrackState:{} })
test('视频原声和音轨进入同一调度，裁剪源偏移和音量正确', () => {
  const p=project()
  p.imageClips[0].offset=4
  p.imageClips[0].videoVolume=.4
  const plan=planAudioPlayback(sceneAudioClips(p),3)
  const film=plan.find(c=>c.assetId==='film')
  assert.equal(film.offset,5)
  assert.equal(film.duration,7)
  assert.equal(film.gain,.4)
  assert.equal(plan.length,2)
})
test('视频隐藏、静音和视觉独见阻止原声，音轨独奏不受视频轨编号影响', () => {
  for(const key of ['layerHidden','videoMuted']) {
    const p=project();p.imageClips[0][key]=true
    assert.equal(sceneAudioClips(p).some(c=>c.assetId==='film'),false)
  }
  const p=project();p.backgroundClips=[{layerSolo:true}]
  assert.equal(sceneAudioClips(p).length,1)
  p.backgroundClips=[];p.audioTrackState={0:{solo:true}}
  assert.equal(sceneAudioClips(p).length,2)
})
test('视频原声音量和静音随工程恢复', () => {
  const p=createProject();p.imageClips=[{...video(),videoVolume:.3,videoMuted:true}]
  const restored=readProject(p,[]).imageClips[0]
  assert.equal(restored.videoVolume,.3)
  assert.equal(restored.videoMuted,true)
})
