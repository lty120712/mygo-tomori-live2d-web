import test from 'node:test'
import assert from 'node:assert/strict'
import {ref} from 'vue'
import {normalizeExportPreferences,EXPORT_PREFERENCES_KEY} from '../src/exportPreferences.js'
import {useExportPreferences} from '../src/composables/useExportPreferences.js'
import {createLocalStore,memoryDocumentBackend} from '../src/localStore.js'
function recorder(){return {formats:[{id:'mp4'},{id:'webm'}],offlineAvailable:true,format:ref('mp4'),method:ref('offline'),resolution:ref('1080'),quality:ref('high'),isPreparing:ref(false),isRecording:ref(false),isExporting:ref(false)}}
test('导出偏好归一化，旧值及不支持的编码能力回退有效选项',()=>{
  assert.deepEqual(normalizeExportPreferences({format:'webm',resolution:720,quality:'maximum',method:'offline'},{offlineAvailable:true}),{format:'webm',resolution:'720',quality:'maximum',method:'realtime'})
  assert.deepEqual(normalizeExportPreferences({format:'bad',resolution:-1,quality:'bad',method:'offline'},{formats:['mp4'],offlineAvailable:false}),{format:'mp4',resolution:'1080',quality:'high',method:'realtime'})
})
test('导出偏好保存在独立文档键，重新创建后恢复，工程文档保持原值',async()=>{
  const store=createLocalStore(memoryDocumentBackend()),project={clips:[]}
  await store.set('scene',project)
  const first=recorder(),p=useExportPreferences(first,store);await p.load()
  first.resolution.value='720';first.quality.value='maximum';first.method.value='realtime';await p.flush();p.destroy()
  const second=recorder(),q=useExportPreferences(second,store);await q.load()
  assert.equal(second.resolution.value,'720');assert.equal(second.quality.value,'maximum');assert.equal(second.method.value,'realtime')
  assert.deepEqual((await store.get('scene')).value,project);assert.equal((await store.get(EXPORT_PREFERENCES_KEY)).value.format,'mp4');q.destroy()
})
test('读取迟到不覆盖刚编辑的字段，格式改变时快速方式一并回退',async()=>{
  let finishRead,saved
  const r=recorder(),prefs=useExportPreferences(r,{get:()=>new Promise(resolve=>finishRead=resolve),set:async(_key,value)=>{saved=value;return true}})
  const loading=prefs.load();r.format.value='webm';r.resolution.value='540'
  finishRead({ok:true,value:{format:'mp4',method:'offline',resolution:'720',quality:'maximum'}});await loading;await prefs.flush()
  assert.equal(r.format.value,'webm');assert.equal(r.method.value,'realtime');assert.equal(r.resolution.value,'540');assert.equal(r.quality.value,'maximum');assert.equal(saved.format,'webm');prefs.destroy()
})
test('读取期间已开始导出时不改参数；卸载后也不应用迟到的读取',async()=>{
  for(const closed of [false,true]){
    let finishRead
    const r=recorder(),prefs=useExportPreferences(r,{get:()=>new Promise(resolve=>finishRead=resolve),set:async()=>true})
    const loading=prefs.load();if(closed)prefs.destroy();else r.isPreparing.value=true
    finishRead({ok:true,value:{resolution:'540'}});await loading
    assert.equal(r.resolution.value,'1080');prefs.destroy()
  }
})
test('写入串行，快速修改最终保留最后选择；数据库失败不阻止继续使用',async()=>{
  const pending=[],written=[],r=recorder()
  const prefs=useExportPreferences(r,{get:async()=>({ok:true,value:null}),set:(_key,value)=>new Promise(resolve=>pending.push(()=>{written.push(value.resolution);resolve(true)}))})
  await prefs.load();r.resolution.value='720';r.resolution.value='540'
  await Promise.resolve();assert.equal(pending.length,1);pending.shift()();await new Promise(resolve=>setImmediate(resolve));pending.shift()();await prefs.flush()
  assert.deepEqual(written,['720','540']);prefs.destroy()
  const retry=recorder();let writable=false
  const failed=useExportPreferences(retry,{get:async()=>({ok:false}),set:async()=>writable})
  await failed.load();assert.match(failed.error.value,/无法读取/)
  retry.resolution.value='720';await failed.flush();assert.match(failed.error.value,/无法记住/);assert.equal(retry.resolution.value,'720')
  writable=true;retry.quality.value='maximum';await failed.flush();assert.equal(failed.error.value,'');failed.destroy()
})
