import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeMarkers,editTimelineMarkers,markerNeighbors,MARKER_LIMIT,MARKER_COLOR} from '../src/timelineMarkers.js'
import {createProject,readProject} from '../src/sceneProject.js'
import {changeProjectFps} from '../src/sceneFrameRate.js'
import {createEditHistory} from '../src/editHistory.js'
import {packProject,unpackProject,restoreBundle} from '../src/projectBundle.js'

test('标记按帧对齐、排序、限制边界；无效时间跳过，名称颜色校验且 ID 唯一',()=>{
  let i=0
  const markers=normalizeMarkers([{id:'a',time:2.01,name:'  转场  ',color:'#FF0000'},{id:'a',time:-1,name:'',color:'bad'},{time:90,name:'x'.repeat(200)},{time:NaN},null],10,30,()=> 'new-'+i++)
  assert.deepEqual(markers[0],{id:'new-0-1',time:0,name:'标记 2',color:MARKER_COLOR})
  assert.equal(markers[1].time,2);assert.equal(markers[1].name,'转场');assert.equal(markers[1].color,'#ff0000')
  assert.equal(markers[2].time,10);assert.equal(markers[2].name.length,100);assert.equal(new Set(markers.map(m=>m.id)).size,3)
})
test('添加、编辑、删除标记不修改输入；上限、无效操作和越界明确报错',()=>{
  const options={duration:10,fps:30,idFactory:()=> 'a'},original=[]
  const added=editTimelineMarkers(original,{type:'add',time:1.01,name:'开场'},options)
  assert.deepEqual(original,[]);assert.equal(added[0].time,1)
  const changed=editTimelineMarkers(added,{type:'edit',id:'a',time:4,name:'高潮',color:'#00ff00'},options)
  assert.equal(added[0].name,'开场');assert.equal(changed[0].name,'高潮');assert.equal(changed[0].time,4)
  assert.deepEqual(editTimelineMarkers(changed,{type:'remove',id:'a'},options),[])
  for(const request of [{type:'edit',id:'missing',time:1},{type:'add',time:11},{type:'unknown'}])assert.throws(()=>editTimelineMarkers(added,request,options),/标记/)
  assert.throws(()=>editTimelineMarkers(Array.from({length:MARKER_LIMIT},(_,i)=>({id:String(i),time:1})),{type:'add',time:1},options),/256/)
})
test('前后标记跳过当前帧，FPS 变更保留秒位置、名称和 ID',()=>{
  const p=createProject();p.fps=60;p.markers=[{id:'a',time:1.1,name:'A',color:MARKER_COLOR},{id:'b',time:3,name:'B',color:MARKER_COLOR}]
  assert.equal(markerNeighbors(p.markers,1.1,60).previous,null);assert.equal(markerNeighbors(p.markers,1.1,60).next.id,'b')
  assert.equal(markerNeighbors(p.markers,3,60).previous.id,'a');assert.equal(markerNeighbors(p.markers,3,60).next,null)
  changeProjectFps(p,66,24)
  assert.equal(p.markers[0].id,'a');assert.equal(p.markers[0].name,'A');assert.ok(Math.abs(p.markers[0].time-1.1)<=.5/24)
})
test('旧工程无标记正常恢复；读回保留标记，错误的列表拒绝导入',()=>{
  const p=createProject();p.markers=[{id:'a',name:'对白',time:2,color:'#ff0000'}]
  assert.deepEqual(readProject(p,[]).markers,p.markers)
  const old={...p};delete old.markers;assert.deepEqual(readProject(old,[]).markers,[])
  assert.throws(()=>readProject({...p,markers:{}},[]),/标记列表/)
  assert.throws(()=>readProject({...p,markers:Array(MARKER_LIMIT+1).fill({})},[]),/标记列表/)
})
test('标记随 .tomori 打包和恢复，编辑可独立撤销重做',async()=>{
  let project=createProject()
  const history=createEditHistory({capture:()=>({project:structuredClone(project),overrides:{}}),restore:value=>project=structuredClone(value.project)})
  history.edit(()=>project.markers=editTimelineMarkers(project.markers,{type:'add',time:2,name:'节拍'},{duration:10,fps:30,idFactory:()=> 'a'}))
  history.edit(()=>project.markers=editTimelineMarkers(project.markers,{type:'edit',id:'a',time:3,name:'转场'},{duration:10,fps:30}))
  history.undo();assert.equal(project.markers[0].name,'节拍');history.redo();assert.equal(project.markers[0].time,3)
  const store={list:async()=>[],blob:async()=>null},blob=await packProject(project,store),bundle=await unpackProject(blob),restored=await restoreBundle(bundle,store)
  assert.deepEqual(readProject(restored,[]).markers,project.markers)
})
