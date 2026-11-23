import test from 'node:test'
import assert from 'node:assert/strict'
import {createTextPresetStore,TEXT_PRESET_KEY,TEXT_PRESET_LIMIT,normalizeSavedPresets} from '../src/textPresetStore.js'
import {createLocalStore,memoryDocumentBackend} from '../src/localStore.js'

test('预设保存并在另一个实例恢复，只保存样式不保存对白内容，删除不影响已复制的样式',async()=>{
  const store=createLocalStore(memoryDocumentBackend()),repo=createTextPresetStore(store,{id:()=> 'test'})
  await repo.save('  主字幕  ',{fontSize:32,fontFamily:'Long Cang',text:'私有正文'})
  const restored=await createTextPresetStore(store).list()
  assert.equal(restored[0].name,'主字幕');assert.equal(restored[0].style.fontFamily,'Long Cang')
  assert.equal(restored[0].style.text,undefined);assert.equal(restored[0].text,'请输入文字')
  await repo.remove(restored[0].id);assert.deepEqual(await repo.list(),[]);assert.equal(restored[0].style.fontSize,32)
})
test('并发保存通过版本比较重试，不覆盖另一页面的新预设',async()=>{
  const store=createLocalStore(memoryDocumentBackend())
  const a=createTextPresetStore(store,{id:()=> 'a'}),b=createTextPresetStore(store,{id:()=> 'b'})
  await Promise.all([a.save('样式 A',{}),b.save('样式 B',{})])
  assert.deepEqual((await a.list()).map(p=>p.name).sort(),['样式 A','样式 B'])
})
test('校验空名称、重名、数量上限，损坏条目被过滤且样式规范化',async()=>{
  const store=createLocalStore(memoryDocumentBackend()),repo=createTextPresetStore(store,{id:()=> 'a'})
  await assert.rejects(repo.save(' ',{}),/名称/);await assert.rejects(repo.save('长'.repeat(41),{}),/名称/)
  await repo.save('字幕',{});await assert.rejects(repo.save('字幕',{}),/同名/)
  await store.set(TEXT_PRESET_KEY,Array.from({length:TEXT_PRESET_LIMIT},(_,i)=>({id:'custom:p'+i,name:'预设'+i,style:{}})))
  await assert.rejects(repo.save('新预设',{}),/最多保存/)
  const clean=normalizeSavedPresets([null,{id:'basic',name:'不允许覆盖内置'}, {id:'custom:a',name:'有效',style:{fontSize:999}}, {id:'custom:a',name:'重复'}])
  assert.equal(clean.length,1);assert.equal(clean[0].style.fontSize,200)
})
test('数据库失败明确报错，不在内存中假装保存成功',async()=>{
  const repo=createTextPresetStore({getVersioned:async()=>({ok:false})})
  await assert.rejects(repo.list(),/读取/);await assert.rejects(repo.save('字幕',{}),/读取/)
  const failed=createTextPresetStore({getVersioned:async()=>({ok:true,value:[],revision:0}),compareSet:async()=>({ok:false})})
  await assert.rejects(failed.save('字幕',{}),/保存文字预设失败/)
})
