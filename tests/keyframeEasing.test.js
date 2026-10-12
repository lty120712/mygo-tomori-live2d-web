import test from 'node:test'
import assert from 'node:assert/strict'
import {applyKeyEasing,normalizeEasing,EASING_PRESETS} from '../src/keyframeEasing.js'
import {sampleTrack,createProject,createClip,readProject} from '../src/sceneProject.js'
import {editKeyRefs} from '../src/timelineKeyframes.js'
import {copyKeyRefs,planKeyPaste} from '../src/keyframeClipboard.js'
import {createEditHistory} from '../src/editHistory.js'
test('二次、三次预设保持端点，旧缓动保持原来三次行为',()=>{
  for(const {value} of EASING_PRESETS){assert.equal(applyKeyEasing(0,value),0);assert.equal(applyKeyEasing(1,value),1)}
  assert.equal(applyKeyEasing(.25,'easeInQuad'),.0625)
  assert.equal(applyKeyEasing(.25,'easeOutQuad'),.4375)
  assert.equal(applyKeyEasing(.25,'easeInOutQuad'),.125)
  assert.equal(applyKeyEasing(.25,'easeIn'),.015625)
  assert.equal(applyKeyEasing(.75,'easeInOut'),.9375)
})
test('自定义曲线按横轴时间求解，极端控制点和倒向参数仍正确',()=>{
  const curve={type:'bezier',points:[.1,0,.2,1]}
  assert.ok(applyKeyEasing(.5,curve)>.8)
  const keys=[{frame:0,value:100,easing:curve},{frame:100,value:-100}]
  assert.ok(sampleTrack(keys,50,0)<-60)
  for(const points of [[0,0,0,1],[1,0,1,1],[1,1,0,0]]){
    let previous=0
    for(let i=0;i<=100;i++){const v=applyKeyEasing(i/100,{type:'bezier',points});assert.ok(Number.isFinite(v) && v>=0 && v<=1);assert.ok(v>=previous-1e-7);previous=v}
  }
  assert.equal(normalizeEasing({type:'bezier',points:[NaN,0,0,1]}),'linear')
  assert.equal(normalizeEasing({type:'bezier',points:[0,0,0,2]}),'linear')
})
test('批量曲线、剪贴板和工程往返保存且不共享控制点引用',()=>{
  const model={category:'tomori',name:'test',entry:'model.json'},clip=createClip(model),project=createProject()
  project.clips=[clip];clip.keyframes['@x']=[{frame:0,value:0},{frame:30,value:100}];clip.keyframes.ParamMouth=[{frame:0,value:0},{frame:30,value:1}]
  const refs=['@x','ParamMouth'].map(key=>({clipId:clip.id,key,frame:0})),curve={type:'bezier',points:[.1,0,.2,1]}
  editKeyRefs([clip],refs,{type:'edit',easing:curve},30)
  curve.points[0]=.9
  assert.equal(clip.keyframes['@x'][0].easing.points[0],.1)
  assert.notEqual(clip.keyframes['@x'][0].easing.points,clip.keyframes.ParamMouth[0].easing.points)
  const clipboard=copyKeyRefs([clip],refs,30),plan=planKeyPaste([clip],clipboard,clip.id,2,30)
  clip.keyframes['@x'][0].easing.points[0]=.3
  assert.equal(clipboard.keys[0].easing.points[0],.1)
  editKeyRefs([clip],[],{type:'paste',entries:plan.entries},30)
  assert.equal(clip.keyframes['@x'][2].easing.points[0],.1)
  const restored=readProject(JSON.parse(JSON.stringify(project)),[model])
  assert.deepEqual(restored.clips[0].keyframes['@x'][2].easing,{type:'bezier',points:[.1,0,.2,1]})
})
test('批量应用曲线作为一次历史可撤销重做',()=>{
  const clip=createClip({category:'tomori',name:'test'});clip.keyframes['@x']=[{frame:0,value:0,easing:'linear'},{frame:30,value:100,easing:'linear'}]
  let state={project:{clips:[clip]},selectedId:clip.id,frame:0,overrides:{}}
  const history=createEditHistory({capture:()=>structuredClone(state),restore:s=>state=structuredClone(s)})
  const easing={type:'bezier',points:[.2,0,.8,1]}
  history.edit(()=>editKeyRefs(state.project.clips,[{clipId:clip.id,key:'@x',frame:0}],{type:'edit',easing},30))
  history.undo();assert.equal(state.project.clips[0].keyframes['@x'][0].easing,'linear')
  history.redo();assert.deepEqual(state.project.clips[0].keyframes['@x'][0].easing,easing)
})
