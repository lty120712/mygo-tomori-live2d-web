import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {BUNDLED_TEXT_FONTS,createTextFontLoader,ensureTextFont} from '../src/textFonts.js'
import {layoutText} from '../src/textTracks.js'
import {createTextClip} from '../src/mediaTracks.js'
import {createProject,readProject} from '../src/sceneProject.js'

test('内置字体为完整字体文件，所有字体名称随工程往返保留',()=>{
  const p=createProject()
  p.imageClips=BUNDLED_TEXT_FONTS.map(font=>{
    const bytes=readFileSync(new URL('../public/fonts/'+font.file,import.meta.url))
    assert.equal(bytes.readUInt32BE(0),0x00010000)
    assert.ok(bytes.length>100000)
    const license=readFileSync(new URL('../public/fonts/'+font.file.replace('.ttf','').toLowerCase()+'-OFL.txt',import.meta.url),'utf8')
    assert.match(license,/SIL OPEN FONT LICENSE Version 1\.1/)
    const tableCount=bytes.readUInt16BE(4)
    for(let i=0;i<tableCount;i++){
      const entry=12+i*16,offset=bytes.readUInt32BE(entry+8),length=bytes.readUInt32BE(entry+12)
      assert.ok(offset+length<=bytes.length,`${font.file} 字体表完整`)
    }
    const clip=createTextClip();clip.textStyle.fontFamily=font.value;return clip
  })
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(p)),[]).imageClips.map(c=>c.textStyle.fontFamily),BUNDLED_TEXT_FONTS.map(f=>f.value))
})

test('并发请求复用加载，成功后通知排版刷新，系统字体无需加载',async()=>{
  let resolve,created=0,added=0,changed=0
  const wait=new Promise(r=>resolve=r)
  const load=createTextFontLoader({baseUrl:'/editor/',createFace:(family,url)=>{
    created++;assert.match(url,/\/editor\/fonts\//);return {load:()=>wait}
  },addFace:()=>added++,changed:()=>changed++})
  const a=load('Noto Sans SC'),b=load('Noto Sans SC')
  assert.equal(a,b);await Promise.resolve();assert.equal(created,1);assert.equal(added,0)
  resolve();await a;await load('Noto Sans SC');await load('sans-serif')
  assert.equal(added,1);assert.equal(changed,1);assert.equal(created,1)
})

test('加载失败向导出调用者报错，可重试，不缓存失败结果',async()=>{
  let attempts=0,added=0
  const load=createTextFontLoader({createFace:()=>({load:async()=>{if(++attempts===1)throw new Error('network')}}),addFace:()=>added++})
  await assert.rejects(load('Long Cang'),/龙藏体.*加载失败/)
  await load('Long Cang');assert.equal(attempts,2);assert.equal(added,1)
})

test('字体加载超时不会永久阻塞导出，迟到结果不会注册字体',async()=>{
  let finish,added=0
  const load=createTextFontLoader({timeoutMs:5,createFace:()=>({load:()=>new Promise(r=>finish=r)}),addFace:()=>added++})
  await assert.rejects(load('Long Cang'),/加载超时/)
  finish();await Promise.resolve();assert.equal(added,0)
})

test('字体就绪后废弃回退字体测量缓存，重新折行并更新选框高度',async()=>{
  const oldDocument=globalThis.document,oldFontFace=globalThis.FontFace
  let glyphWidth=10
  globalThis.document={fonts:{add:()=>{glyphWidth=100}},createElement:()=>({getContext:()=>({measureText:text=>({width:[...text].length*glyphWidth})})})}
  globalThis.FontFace=class{async load(){return this}}
  try{
    const clip=createTextClip();clip.text='中文字体测试';clip.textStyle.fontFamily='Noto Sans SC';clip.textStyle.width=100
    const before=layoutText(clip);assert.equal(before.lines.length,1);assert.equal(layoutText(clip),before)
    await ensureTextFont('Noto Sans SC')
    const after=layoutText(clip);assert.equal(after.lines.length,6);assert.ok(after.height>before.height)
  }finally{globalThis.document=oldDocument;globalThis.FontFace=oldFontFace}
})
