import test from 'node:test'
import assert from 'node:assert/strict'
import {createProject,readProject,sceneSize} from '../src/sceneProject.js'
import {snapCanvasPosition} from '../src/canvasPosition.js'
import {createEditHistory} from '../src/editHistory.js'
test('旧工程默认横屏，竖屏保存恢复且可一步撤销重做',()=>{
  let state={project:createProject()}
  assert.deepEqual(sceneSize(state.project.aspectRatio),{width:960,height:540})
  const h=createEditHistory({capture:()=>structuredClone(state),restore:s=>state=s})
  h.edit(()=>state.project.aspectRatio='9:16')
  assert.deepEqual(sceneSize(state.project.aspectRatio),{width:540,height:960})
  assert.equal(readProject(JSON.parse(JSON.stringify(state.project)),[]).aspectRatio,'9:16')
  h.undo();assert.equal(state.project.aspectRatio,'16:9');h.redo();assert.equal(state.project.aspectRatio,'9:16')
  const old=createProject();delete old.aspectRatio
  assert.equal(readProject(old,[]).aspectRatio,'16:9')
})
test('竖屏吸附到实际画布边缘，输出坐标保持一致',()=>{
  const pose={x:0,y:0,scale:.5,rotation:0},size=sceneSize('9:16')
  const snapped=snapCanvasPosition(pose,{x:188,y:351},[],8,false,size)
  assert.equal(snapped.position.x,190);assert.equal(snapped.position.y,352.5)
  assert.deepEqual(snapped.guides,[{axis:'x',value:270},{axis:'y',value:480}])
})
