import test from 'node:test'
import assert from 'node:assert/strict'
import {beginCanvasTransform,scaleCanvasTransform,rotateCanvasTransform} from '../src/canvasTransform.js'
const pose={x:100,y:30,scale:1,rotation:0}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`)
test('四角等比缩放固定对角，点击偏移不使模型跳动',()=>{
 for(const corner of ['nw','ne','sw','se']){
  const p={x:12,y:34},d=beginCanvasTransform(pose,p,corner)
  const unchanged=scaleCanvasTransform(d,p);near(unchanged.scale,1);near(unchanged.x,100);near(unchanged.y,30)
  const out=scaleCanvasTransform(d,{x:p.x+2*d.vector.x,y:p.y+2*d.vector.y})
  near(out.scale,2);near(out.x-d.vector.x*out.scale,d.anchor.x);near(out.y-d.vector.y*out.scale,d.anchor.y)
 }
})
test('旋转后的角点缩放仍固定世界坐标对角，缩放不翻转且遵守范围',()=>{
 const d=beginCanvasTransform({...pose,rotation:47},{x:0,y:0},'se')
 const out=scaleCanvasTransform(d,{x:d.vector.x,y:d.vector.y});near(out.scale,1.5)
 near(out.x-d.vector.x*out.scale,d.anchor.x);near(out.y-d.vector.y*out.scale,d.anchor.y)
 near(scaleCanvasTransform(d,{x:-100*d.vector.x,y:-100*d.vector.y}).scale,.1)
 near(scaleCanvasTransform(d,{x:100*d.vector.x,y:100*d.vector.y}).scale,5)
})
test('旋转围绕模型中心，以整数角度输出，穿过角度边界不跳动',()=>{
 const p={x:0,y:0,rotation:0}
 assert.equal(rotateCanvasTransform(p,{x:0,y:-10},{x:10,y:0}).rotation,90)
 const point=a=>({x:10*Math.cos(a*Math.PI/180),y:10*Math.sin(a*Math.PI/180)})
 assert.equal(rotateCanvasTransform({...p,rotation:30},point(179),point(-179)).rotation,32)
 assert.equal(rotateCanvasTransform(p,point(0),point(22),true).rotation,15)
 assert.equal(rotateCanvasTransform(p,point(0),point(29),true).rotation,30)
})
