import test from 'node:test'
import assert from 'node:assert/strict'
import {selectionBounds,boxSelected,moveSelection,scaleSelection,rotateSelection,applyCanvasSelection,layoutSelection} from '../src/canvasSelection.js'
import {modelBounds} from '../src/canvasPosition.js'
import {createClip,sampleClip} from '../src/sceneProject.js'
import {createEditHistory} from '../src/editHistory.js'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`)
function entries(){return [{id:'a',pose:{x:-200,y:0,scale:.5,rotation:0}},{id:'b',pose:{x:200,y:0,scale:1,rotation:30}}]}
function laidOut(e,operation){const patches=layoutSelection(e,operation);return e.map(item=>({...item,pose:{...item.pose,...patches.find(p=>p.id===item.id)?.patch}}))}
test('六种对齐按旋转后的外框及选区中心定位，仅修改相应轴',()=>{
  const e=entries();e[1].pose.y=100
  for(const [op,axis,index] of [['left','x',0],['centerX','x',1],['right','x',2],['top','y',0],['centerY','y',1],['bottom','y',2]]){
    const result=laidOut(e,op)
    near(modelBounds(result[0].pose)[axis][index],modelBounds(result[1].pose)[axis][index])
    for(let i=0;i<e.length;i++){assert.equal(result[i].pose[axis==='x' ? 'y' : 'x'],e[i].pose[axis==='x' ? 'y' : 'x']);assert.equal(result[i].pose.scale,e[i].pose.scale);assert.equal(result[i].pose.rotation,e[i].pose.rotation)}
  }
})
test('等距分布固定两端，使不同尺寸及旋转人物的外框间隙相等',()=>{
  for(const axis of ['x','y']){
    const e=[{id:'right',pose:{x:400,y:400,scale:.7,rotation:20}},{id:'left',pose:{x:-400,y:-400,scale:.3,rotation:0}},{id:'middle',pose:{x:50,y:50,scale:.4,rotation:35}}]
    const result=laidOut(e,axis==='x' ? 'distributeX' : 'distributeY'),b=result.map(e=>modelBounds(e.pose)[axis]).sort((a,b)=>a[1]-b[1])
    near(b[1][0]-b[0][2],b[2][0]-b[1][2]);assert.equal(result[0].pose[axis],400);assert.equal(result[1].pose[axis],-400)
  }
  assert.deepEqual(layoutSelection(entries(),'distributeX'),[])
})
test('整组选区居中保持间距；无法整组定位时拒绝越界变更',()=>{
  const e=entries();e[0].pose.y=120;e[1].pose.y=200
  const result=laidOut(e,'centerCanvas'),b=selectionBounds(result)
  near(b.x,0);near(b.y,0);near(result[1].pose.x-result[0].pose.x,400);near(result[1].pose.y-result[0].pose.y,80)
  e[0].pose.x=1920;e[0].pose.scale=5;e[1].pose.x=-1920;e[1].pose.scale=.1
  assert.deepEqual(layoutSelection(e,'right'),[])
  assert.deepEqual(layoutSelection([],'left'),[]);assert.deepEqual(layoutSelection(e,'unknown'),[])
})
test('对齐整组一步撤销，按已有动画或自动关键帧规则记录且保留其他属性',()=>{
  let state={project:{clips:['a','b'].map(id=>({...createClip({name:'test',category:'tomori'}),id}))}}
  state.project.clips[0].keyframes['@x']=[{frame:0,value:-200},{frame:60,value:100}]
  const h=createEditHistory({capture:()=>structuredClone(state),restore:s=>state=structuredClone(s)})
  h.begin();h.edit(()=>applyCanvasSelection(state.project.clips,layoutSelection(entries(),'centerX'),1,30,false));h.end()
  assert.equal(state.project.clips[0].keyframes['@x'].length,3);assert.equal(state.project.clips[1].keyframes['@x'],undefined)
  assert.equal(state.project.clips[0].keyframes['@y'],undefined)
  const after=structuredClone(state);h.undo();assert.equal(state.project.clips[0].keyframes['@x'].length,2);assert.equal(h.canUndo,false);h.redo();assert.deepEqual(state,after)
})
test('框选可反向拖动并命中旋转人物，共用选框包含所有边界',()=>{
  const e=entries(),b=selectionBounds(e)
  assert.equal(b.left,-280);assert.ok(b.right>400)
  assert.deepEqual(boxSelected(e,{x:500,y:300},{x:-500,y:-300}),['a','b'])
  assert.deepEqual(boxSelected(e,{x:-300,y:-200},{x:-120,y:200}),['a'])
  assert.equal(selectionBounds([]),null)
})
test('整体移动使用共同边界，保留相对间距',()=>{
  const e=entries(),moved=moveSelection(e,{x:10000,y:20})
  assert.equal(moved[1].patch.x,1920);assert.equal(moved[0].patch.x,1520)
  assert.equal(moved[0].patch.y,20);assert.equal(moved[1].patch.y,20)
})
test('整体缩放保留相对比例与中心，缩放和位置边界共同约束',()=>{
  const e=entries(),scaled=scaleSelection(e,{x:0,y:0},2)
  near(scaled[0].patch.scale,1);near(scaled[1].patch.scale,2);near(scaled[0].patch.x,-400);near(scaled[1].patch.x,400)
  const high=scaleSelection(e,{x:0,y:0},100)
  near(high[0].patch.scale,2.5);near(high[1].patch.scale,5)
  const low=scaleSelection(e,{x:0,y:0},-1)
  near(low[0].patch.scale,.1);near(low[1].patch.scale,.2)
  e[1].pose.x=1900
  const bounded=scaleSelection(e,{x:0,y:0},10)
  near(bounded[1].patch.x,1920)
  const outside=scaleSelection(e,{x:2100,y:0},0)
  near(outside[1].patch.x,1920)
})
test('整体旋转同时旋转位置和人物朝向，不翻转比例，越界整组拒绝',()=>{
  const e=entries(),rotated=rotateSelection(e,{x:0,y:0},90)
  near(rotated[0].patch.x,0);near(rotated[0].patch.y,-200);near(rotated[1].patch.y,200)
  assert.equal(rotated[0].patch.rotation,90);assert.equal(rotated[1].patch.rotation,120)
  e[0].pose.x=-1900;e[1].pose.x=1900
  assert.deepEqual(rotateSelection(e,{x:0,y:0},90),[])
})
test('批量变换原子应用，忽略不存在、锁定、隐藏、非显示时段的整组操作',()=>{
  const clips=['a','b'].map(id=>({...createClip({name:'test',category:'tomori'}),id})),changes=moveSelection(entries(),{x:10,y:10})
  for(const state of [{layerLocked:true},{layerHidden:true},{start:2}]){
    Object.assign(clips[1],state);assert.equal(applyCanvasSelection(clips,changes,0,30,false),false);assert.equal(clips[0].transform.x,0)
    Object.assign(clips[1],{layerLocked:false,layerHidden:false,start:0})
  }
  assert.equal(applyCanvasSelection(clips,[...changes,{id:'missing',patch:{x:0}}],0,30,false),false)
  assert.equal(applyCanvasSelection(clips,changes,0,30,false),true)
  assert.equal(clips[0].transform.x,-190);assert.equal(clips[1].transform.x,210)
})
test('自动关键帧按各人物源时间写入，拖动一次可整组撤销重做并恢复选择',()=>{
  const clips=['a','b'].map(id=>({...createClip({name:'test',category:'tomori'}),id}));clips[1].offset=1
  let state={project:{clips},canvasSelection:['a','b'],selectedId:'b',frame:30,overrides:{}}
  const h=createEditHistory({capture:()=>structuredClone(state),restore:s=>state=structuredClone(s)})
  h.begin()
  for(const x of [10,20,30])h.edit(()=>applyCanvasSelection(state.project.clips,moveSelection(entries(),{x,y:0}),1,30,true))
  h.end()
  assert.equal(state.project.clips[0].keyframes['@x'][0].frame,30);assert.equal(state.project.clips[1].keyframes['@x'][0].frame,60)
  h.undo();assert.deepEqual(state.project.clips[0].keyframes,{});assert.deepEqual(state.canvasSelection,['a','b']);assert.equal(h.canUndo,false)
  h.redo();assert.equal(state.project.clips[0].keyframes['@x'][0].value,-170)
  assert.equal(sampleClip(state.project.clips[1],1,30,[]).transform.x,230)
})
