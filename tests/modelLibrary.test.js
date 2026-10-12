import test from 'node:test'
import assert from 'node:assert/strict'
import { describeModel,filterModelLibrary } from '../src/modelLibrary.js'
const catalog=[
 {category:'tomori',name:'adv_live2d_tomori_001_school_winter_jhs',entry:'model.json'},
 {category:'anon',name:'adv_live2d_anon_002_casual_spring_01_glasses',entry:'model.json'},
 {category:'tomori',name:'live2d_tomori_001_live_01_low',entry:'model.json'},
 {category:'other',name:'special_custom',entry:'custom.model3.json'},
].map(describeModel)
test('已知素材提供角色服装和版本标签，未知模型保留原名和入口',()=>{
 assert.equal(catalog[0].character,'高松灯');assert.equal(catalog[0].outfit,'初中冬季校服');assert.equal(catalog[0].version,'剧情模型')
 assert.equal(catalog[1].character,'千早爱音');assert.match(catalog[1].detail,/眼镜版/)
 assert.equal(catalog[2].version,'简化模型')
 assert.equal(catalog[3].label,'special_custom');assert.equal(catalog[3].entry,'custom.model3.json')
 assert.equal(describeModel({category:'tomori',name:'live_event_235_ur'}).detail,'标准模型 · 235 · UR')
})
test('角色服装版本联合筛选和中英文多词搜索，支持原始模型名',()=>{
 assert.deepEqual(filterModelLibrary(catalog,{character:'tomori',outfit:'演出服',version:'简化模型'}),[catalog[2]])
 assert.deepEqual(filterModelLibrary(catalog,{search:'爱音 眼镜'}),[catalog[1]])
 assert.deepEqual(filterModelLibrary(catalog,{search:'  ADV_  JHS '}),[catalog[0]])
 assert.equal(filterModelLibrary(catalog,{character:'anon',outfit:'演出服'}).length,0)
 assert.equal(filterModelLibrary(catalog,{}).length,4)
})
