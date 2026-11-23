import test from 'node:test'
import assert from 'node:assert/strict'
import {createProject, syncProjectDuration} from '../src/sceneProject.js'
import {createEditHistory} from '../src/editHistory.js'
import {exportRange} from '../src/exportRange.js'
import {timelineEditEnd} from '../src/timelineViewport.js'
import {applyClipStarts,planClipMove} from '../src/clipSelection.js'

test('删除 22 秒音频后全片导出 6 秒，撤销重做同时恢复时长和标记',()=>{
  let project=createProject()
  project.clips=[{start:0,duration:6}]
  project.audioClips=[{start:0,duration:22}]
  project.markers=[{id:'marker',name:'片尾',color:'#ffffff',time:19}]
  syncProjectDuration(project)
  assert.equal(project.duration,22)
  const history=createEditHistory({
    capture:()=>({project:structuredClone(project)}),
    restore:state=>{project=structuredClone(state.project)},
    finalize:()=>syncProjectDuration(project),
  })
  history.edit(()=>{project.audioClips=[]})
  assert.equal(exportRange(project.duration,project.fps).frames,180)
  assert.equal(project.markers[0].time,6)
  history.undo()
  assert.equal(project.duration,22)
  assert.equal(project.audioClips.length,1)
  assert.equal(project.markers[0].time,19)
  history.redo()
  assert.equal(project.duration,6)
  assert.equal(project.audioClips.length,0)
})

test('各类轨道按结束位置计时，隐藏、静音、素材入点及工程旧时长不影响结果',()=>{
  const project=createProject()
  project.duration=120
  for(const [collection,media] of [['clips'],['imageClips','image'],['imageClips','video'],['imageClips','text'],['backgroundClips'],['audioClips']]){
    project[collection].push({start:8,duration:3,offset:100,layerHidden:true,muted:true,media})
    assert.equal(syncProjectDuration(project),11)
    project[collection].pop()
    assert.equal(syncProjectDuration(project),10)
  }
})

test('拖动完成才缩短工程，非整帧结尾保留覆盖片段所需的最后一帧',()=>{
  const project=createProject()
  const clip={start:2,duration:4}
  project.clips=[clip];syncProjectDuration(project)
  const history=createEditHistory({capture:()=>({project:structuredClone(project)}),restore:()=>{},finalize:()=>syncProjectDuration(project)})
  history.begin()
  history.edit(()=>{clip.duration=2})
  history.edit(()=>{clip.duration=3.31})
  assert.equal(project.duration,6)
  history.end()
  assert.equal(project.duration,160/30)
  assert.equal(exportRange(project.duration,project.fps).frames,160)
  const oneAbove=31/30
  assert.equal(exportRange(oneAbove,30).frames,31)
})

test('时间线片尾留白允许整段后移，不会在松开前改变工程或导出时长',()=>{
  let project=createProject()
  project.clips=[{id:'a',track:0,start:0,duration:6,offset:2}]
  syncProjectDuration(project)
  const history=createEditHistory({
    capture:()=>({project:structuredClone(project)}),
    restore:state=>{project=state.project},
    finalize:()=>syncProjectDuration(project),
  })
  const axis=timelineEditEnd(project.duration,30,600)
  assert.equal(axis,8)
  const plan=planClipMove(project.clips,project.clips,20,{duration:axis,fps:30})
  history.begin()
  assert.ok(history.edit(()=>applyClipStarts(project.clips,plan.entries,600,30)))
  assert.equal(exportRange(project.duration,30).duration,6)
  history.end()
  assert.deepEqual(project.clips[0],{id:'a',track:0,start:2,duration:6,offset:2})
  assert.equal(exportRange(project.duration,30).duration,8)
  history.undo()
  assert.equal(project.duration,6)
  assert.equal(project.clips[0].start,0)
  assert.equal(timelineEditEnd(599,30,600),600)
})
