import test from 'node:test'
import assert from 'node:assert/strict'
import {resizeTextBox} from '../src/textBoxTransform.js'
import {layoutText} from '../src/textTracks.js'
import {createTextClip} from '../src/mediaTracks.js'
import {scaleX,scaleY} from '../src/visualScale.js'
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≈ ${b}`)
function anchor(clip,pose,sign){
  const box=layoutText(clip),r=pose.rotation*Math.PI/180,x=-sign*box.width*scaleX(pose)/2,y=-box.height*scaleY(pose)/2
  return {x:pose.x+x*Math.cos(r)-y*Math.sin(r),y:pose.y+x*Math.sin(r)+y*Math.cos(r)}
}
test('拖动框宽保留字号和缩放，增加换行时固定对侧与顶边',()=>{
  for(const edge of ['e','w'])for(const rotation of [0,30,-45,90]){
    const clip=createTextClip();clip.text='文字自动换行'.repeat(8);clip.textStyle.width=500
    const before=structuredClone(clip),pose={...clip.transform,x:20,y:-30,scale:1.5,scaleX:1.2,scaleY:.7,rotation}
    const sign=edge==='e' ? 1 : -1,r=rotation*Math.PI/180,distance=-200*sign*scaleX(pose)
    const patch=resizeTextBox(clip,pose,{x:0,y:0},{x:distance*Math.cos(r),y:distance*Math.sin(r)},edge)
    near(patch.width,300)
    const resized={...clip,textStyle:{...clip.textStyle,width:patch.width}}
    const first=anchor(clip,pose,sign),last=anchor(resized,{...pose,x:patch.x,y:patch.y},sign)
    near(first.x,last.x);near(first.y,last.y)
    assert.ok(layoutText(resized).height>layoutText(clip).height)
    assert.deepEqual(clip,before)
    assert.equal(patch.scale,undefined);assert.equal(patch.fontSize,undefined)
  }
})
test('框宽遵守范围，垂直于文字横轴的拖动不会改变框宽，计算不累积误差',()=>{
  const clip=createTextClip();clip.textStyle.width=400
  const pose={...clip.transform,rotation:90},start={x:10,y:20}
  near(resizeTextBox(clip,pose,start,{x:100,y:20}).width,400)
  assert.equal(resizeTextBox(clip,{...pose,rotation:0},start,{x:10000,y:20}).width,1920)
  assert.equal(resizeTextBox(clip,{...pose,rotation:0},start,{x:-10000,y:20}).width,80)
  const end=resizeTextBox(clip,pose,start,start)
  near(end.width,400);near(end.x,pose.x);near(end.y,pose.y)
})

test('小数框宽没有拖动时原值保留，不产生位置或宽度变化',()=>{
  const clip=createTextClip();clip.textStyle.width=400.25
  const pose={...clip.transform,x:15.5,y:-2.25,rotation:30},point={x:100,y:20}
  assert.deepEqual(resizeTextBox(clip,pose,point,point),{width:400.25,x:15.5,y:-2.25})
})
