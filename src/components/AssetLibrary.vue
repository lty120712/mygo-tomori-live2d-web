<template>
  <aside class="asset-library" :class="{collapsed:!open,dragging}" :aria-label="activeTab==='model' ? '模型素材库' : '素材库'" @dragenter.prevent="enterDrop" @dragover.prevent="overDrop" @dragleave.prevent="leaveDrop" @drop.prevent="dropFiles">
    <div v-show="!open" class="asset-rail"><button class="rail-trigger" aria-label="展开素材库" title="展开素材库" @click="emit('toggle')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/></svg><span>素材</span></button></div>
    <div v-show="open" class="library-body">
      <header><div><small>ASSETS</small><h3>素材库</h3></div><button class="collapse-trigger" aria-label="收起素材库" title="收起素材库，为画布留出空间" @click="emit('toggle')">‹</button></header>
      <nav class="asset-tabs" aria-label="素材分类">
        <button :aria-current="activeTab==='text' ? 'page' : undefined" @click="switchTab('text')">文字<span>{{TEXT_PRESETS.length}}</span></button>
        <button :aria-current="activeTab==='model' ? 'page' : undefined" @click="switchTab('model')">模型<span>{{ models.length }}</span></button>
        <button :aria-current="activeTab==='image' ? 'page' : undefined" @click="switchTab('image')">图片<span>{{ assets.filter(a=>a.kind==='image').length }}</span></button>
        <button :aria-current="activeTab==='audio' ? 'page' : undefined" @click="switchTab('audio')">音频<span>{{ assets.filter(a=>a.kind==='audio').length }}</span></button>
        <button :aria-current="activeTab==='video' ? 'page' : undefined" @click="switchTab('video')">视频<span>{{ assets.filter(a=>a.kind==='video').length }}</span></button>
      </nav>

      <template v-if="activeTab==='model'">
        <div class="library-filters">
          <label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="搜索模型素材" placeholder="搜索服装、角色或模型名称" /></label>
          <label>角色<select v-model="character" aria-label="筛选角色"><option value="">全部角色</option><option v-for="c in characters" :key="c.key" :value="c.key">{{c.label}}</option></select></label>
          <div class="filter-grid"><label>服装<select v-model="outfit" aria-label="筛选服装"><option value="">全部服装</option><option v-for="o in outfits" :key="o">{{o}}</option></select></label><label>模型版本<select v-model="version" aria-label="筛选模型版本"><option value="">全部版本</option><option v-for="v in versions" :key="v">{{v}}</option></select></label></div>
          <div class="result-summary"><span>{{results.length}} / {{models.length}} 个素材</span><button v-if="character || outfit || version || search" class="clear-filters" @click="clearFilters">清除筛选</button></div>
        </div>
        <div class="library-results">
          <button v-for="model in results" :key="model.id" class="library-model" :class="{used:usedModels.has(model.id)}" :disabled="disabled" :aria-label="'添加 '+model.character+' '+model.label+' '+model.detail+' '+model.name" :title="model.character+' · '+model.detail+'\n'+model.name" @click="emit('add',model)">
            <ModelPortrait :model="model" :paused="disabled || !open" />
            <span class="model-copy"><strong>{{model.label}}</strong><small>{{model.character}} · {{model.detail}}</small><span class="source-name">{{model.name}}</span></span><span class="add-mark" aria-hidden="true">＋</span>
          </button>
          <div v-if="!results.length" class="library-empty"><span>没有找到匹配的素材</span><button @click="clearFilters">清除筛选</button></div>
        </div>
        <footer><span class="hint-dot"></span>点击添加到场景，同一素材可重复使用</footer>
      </template>

      <template v-else-if="activeTab==='text'">
        <div class="library-results text-presets">
          <div class="text-batch-actions"><button :disabled="disabled" @click="emit('batch-text','srt')">导入 SRT</button><button :disabled="disabled" @click="emit('batch-text','lines')">批量文字</button></div>
          <p class="media-hint">选中文字轨道时追加到末尾，否则添加到播放头。</p>
          <button v-for="preset in TEXT_PRESETS" :key="preset.id" class="text-preset" :disabled="disabled" :aria-label="'添加'+preset.name" @click="emit('add-text',preset.id)">
            <span v-if="preset.style.layout==='dialogue'" class="text-preset-preview dialogue-preview" :style="{background:preset.style.boxColor || '#302b38',color:preset.style.color || '#ffffff',borderRadius:(preset.style.boxRadius || 0)+'px'}"><b :style="{color:preset.style.speakerColor}">{{preset.speaker}}</b><i></i><span>{{preset.text}}</span></span>
            <span v-else class="text-preset-preview" :style="{fontFamily:preset.style.fontFamily,fontWeight:preset.style.bold ? 'bold' : 'normal'}">文字 Aa</span>
            <strong>{{preset.name}}</strong><small>{{preset.description}}</small><span class="add-mark">＋</span>
          </button>
        </div>
        <footer><span class="hint-dot"></span>文字可重复添加，内容与样式随工程保存</footer>
      </template>
      <template v-else>
        <div class="media-toolbar">
          <button class="import-btn" :disabled="disabled || importing" @click="pickFile">{{ importing ? '正在导入…' : '批量导入'+(activeTab==='image' ? '图片' : activeTab==='video' ? '视频' : '音频') }}</button>
          <input ref="fileInput" type="file" multiple hidden :accept="activeTab==='image' ? 'image/*' : activeTab==='video' ? 'video/*' : 'audio/*'" @change="onFilePicked" />
          <span class="media-hint">保存在本浏览器，可跨工程复用</span>
        </div>
        <div class="library-results">
          <div v-for="a in currentAssets" :key="a.id" class="media-card">
            <img v-if="a.kind==='image' || a.kind==='video'" :src="a.thumb || ''" alt="" class="media-thumb" />
            <span v-else class="media-thumb media-audio" aria-hidden="true">♪</span>
            <span class="model-copy"><strong>{{ a.name }}</strong><small>{{ formatSize(a.size) }}<template v-if="a.duration"> · {{ a.duration.toFixed(1) }}s</template></small></span>
            <button v-if="a.kind==='image'" :disabled="disabled" :aria-label="'添加图片 '+a.name" title="添加图片片段到播放头" @click="emit('add-image',a)">＋</button>
            <button v-if="a.kind==='image'" :disabled="disabled" :aria-label="'把 '+a.name+' 设为背景'" title="添加背景片段到播放头" @click="emit('background-image',a)">背景</button>
            <button v-if="a.kind==='audio'" :disabled="disabled" :aria-label="'把 '+a.name+' 加到音频轨道'" title="添加音频片段到播放头" @click="emit('add-audio',a)">轨道</button>
            <button v-if="a.kind==='video'" :disabled="disabled" :aria-label="'把 '+a.name+' 加到时间线'" title="添加视频片段到播放头" @click="emit('add-video',a)">轨道</button>
            <button class="media-delete" :disabled="disabled || referenced(a)" :aria-label="'删除素材 '+a.name" :title="referenced(a) ? '请先移除工程中引用该素材的片段' : '删除素材'" @click="removeAsset(a)">×</button>
          </div>
          <div v-if="!currentAssets.length" class="library-empty"><span>还没有{{ activeTab==='image' ? '图片' : activeTab==='video' ? '视频' : '音频' }}素材</span><button @click="pickFile">导入一个</button></div>
        </div>
        <footer><span class="hint-dot"></span>可拖入多个图片、音频或视频文件</footer>
      </template>
    </div>
    <div v-if="dragging" class="drop-overlay">松开导入图片／音频／视频</div>
    <p v-if="importMessage && open" class="import-status" role="status">{{ importMessage }}</p>
  </aside>
</template>
<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import ModelPortrait from './ModelPortrait.vue'
import { describeModel, filterModelLibrary } from '../modelLibrary.js'
import { assetStore } from '../assetStore.js'
import { TEXT_PRESETS } from '../textPresets.js'
const props = defineProps({ models: { type: Array, default: () => [] }, clips: { type: Array, default: () => [] }, audioClips: { type: Array, default: () => [] }, backgroundClips: { type: Array, default: () => [] }, open: Boolean, disabled: Boolean })
const emit = defineEmits(['toggle', 'add', 'add-image', 'background-image', 'add-audio', 'add-video', 'add-text', 'batch-text'])
const referenced = asset => [...props.clips, ...props.backgroundClips, ...props.audioClips].some(c => c.assetId === asset.id)
const activeTab = ref('model')
const assets = ref([])
const fileInput = ref(null)
const importing = ref(false), importMessage = ref(''), dragging = ref(false)
let dragDepth = 0

const character = ref(''), outfit = ref(''), version = ref(''), search = ref('')
const catalog = computed(() => props.models.map(describeModel))
const characters = computed(() => [...new Map(catalog.value.map(m => [m.category, { key: m.category, label: m.character }])).values()])
const forCharacter = computed(() => catalog.value.filter(m => !character.value || m.category === character.value))
const outfits = computed(() => [...new Set(forCharacter.value.map(m => m.outfit))])
const versions = computed(() => [...new Set(forCharacter.value.map(m => m.version))])
const results = computed(() => filterModelLibrary(catalog.value, { character: character.value, outfit: outfit.value, version: version.value, search: search.value }))
const usedModels = computed(() => new Set(props.clips.map(c => c.model)))
const currentAssets = computed(() => assets.value.filter(a => a.kind === activeTab.value))

watch(character, () => { if (!outfits.value.includes(outfit.value)) outfit.value = ''; if (!versions.value.includes(version.value)) version.value = '' })
function clearFilters() { character.value = ''; outfit.value = ''; version.value = ''; search.value = '' }
function switchTab(tab) { activeTab.value = tab; refreshAssets() }
async function refreshAssets() { try { assets.value = await assetStore.list() } catch { assets.value = [] } }
function pickFile() { fileInput.value && fileInput.value.click() }
async function onFilePicked(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  await importFiles(files)
}
async function importFiles(files) {
  if (!files.length || props.disabled || importing.value) return
  importing.value = true
  try {
    const result = await assetStore.importFiles(files, (done,total) => { importMessage.value = `正在导入 ${done} / ${total}` })
    await refreshAssets()
    if (result.imported.length) activeTab.value = result.imported[0].kind
    importMessage.value = `已导入 ${result.imported.length} 个素材` + (result.failed.length ? '；失败：' + result.failed.map(f => f.name+'（'+f.message+'）').join('、') : '')
  } catch (error) { importMessage.value = '导入失败：' + error.message }
  finally { importing.value = false }
}
function enterDrop(event) { if (event.dataTransfer?.types.includes('Files')) { dragDepth++; dragging.value = !props.disabled && !importing.value } }
function overDrop(event) { if (event.dataTransfer) event.dataTransfer.dropEffect = props.disabled || importing.value ? 'none' : 'copy' }
function leaveDrop() { if (--dragDepth <= 0) { dragDepth = 0; dragging.value = false } }
function dropFiles(event) { dragging.value = false; dragDepth = 0; importFiles(Array.from(event.dataTransfer?.files || [])) }
async function removeAsset(a) { if(props.disabled || referenced(a))return; if (confirm('删除素材「' + a.name + '」？')) { await assetStore.remove(a.id); refreshAssets() } }
function formatSize(size) { if (size >= 1048576) return (size / 1048576).toFixed(1) + 'MB'; if (size >= 1024) return Math.round(size / 1024) + 'KB'; return size + 'B' }
onMounted(() => { refreshAssets(); window.addEventListener('tomori-assets-changed', refreshAssets) })
onBeforeUnmount(() => window.removeEventListener('tomori-assets-changed', refreshAssets))
</script>
<style scoped>
.text-batch-actions { display:flex; gap:8px; }.text-batch-actions button { flex:1; min-width:0; padding:8px; border:1px solid var(--editor-border); border-radius:8px; color:var(--editor-accent); background:var(--editor-accent-soft); font-size:12px; }
.asset-tabs { flex-wrap:wrap; }.asset-tabs button { min-width:65px; }
.text-presets { padding:12px 16px; }.text-preset { position:relative; display:flex; flex-direction:column; gap:9px; width:100%; padding:14px; border:1px solid var(--editor-border); border-radius:12px; background:var(--editor-soft); color:var(--editor-text); text-align:left; }
.text-preset-preview { display:grid; place-items:center; width:100%; height:80px; background:var(--editor-panel); border-radius:8px; font-size:28px; }.text-preset small { color:var(--editor-muted); line-height:1.5; }.text-preset .add-mark { position:absolute; right:14px; bottom:12px; }
.text-presets { display:flex; flex-direction:column; gap:12px; }.text-preset { flex-shrink:0; }.dialogue-preview { display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; gap:7px; font-size:11px; padding:10px; box-sizing:border-box; overflow:hidden; }.dialogue-preview b { font-size:12px; }.dialogue-preview i { border-top:1px solid currentColor; opacity:.35; }.dialogue-preview>span { font-size:11px; line-height:1.5; }
.asset-library { position:relative; }
.drop-overlay { position:absolute; inset:0; display:grid; place-items:center; background:var(--editor-panel); border:2px dashed var(--editor-accent); z-index:5; pointer-events:none; }
.import-status { position:absolute; bottom:36px; left:8px; right:8px; padding:8px; margin:0; font-size:11px; background:var(--editor-panel); border:1px solid var(--editor-border); border-radius:8px; max-height:100px; overflow:auto; overflow-wrap:anywhere; }
.asset-library { width:280px; flex-shrink:0; box-sizing:border-box; background:var(--editor-panel); color:var(--editor-text); border-right:1px solid var(--editor-border); min-height:0; font-family:inherit; }
.asset-library.collapsed { width:52px; background:var(--editor-soft); }
.library-body { height:100%; display:flex; flex-direction:column; min-height:0; }
header { display:flex; justify-content:space-between; align-items:center; padding:22px 18px 15px; } header small { color:var(--editor-muted); font-size:9px; letter-spacing:2px; } h3 { margin:5px 0 0; font-size:19px; font-weight:600; }
.asset-library button { font:inherit; cursor:pointer; }
.asset-library .collapse-trigger,.asset-library .rail-trigger { border:0!important; background:transparent!important; color:var(--editor-accent)!important; border-radius:10px!important; }.collapse-trigger { font-size:26px!important; width:32px; height:32px; padding:0!important; }.collapse-trigger:hover,.rail-trigger:hover { background:var(--editor-hover)!important; }
.asset-tabs { display:flex; gap:6px; padding:0 16px 12px; border-bottom:1px solid var(--editor-border); }
.asset-tabs button { flex:1; background:var(--editor-soft); border:1px solid transparent; color:var(--editor-text); border-radius:9px; padding:8px 6px; font-size:12px; display:flex; align-items:center; justify-content:center; gap:6px; }
.asset-tabs button span { color:var(--editor-muted); font-size:10px; }
.asset-tabs button[aria-current=page] { background:var(--editor-accent); color:var(--editor-on-accent,#fff); }
.asset-tabs button[aria-current=page] span { color:inherit; opacity:.75; }
.library-filters { padding:0 16px 12px; border-bottom:1px solid var(--editor-border); } label { display:block; font-size:11px; color:var(--editor-muted); margin-bottom:10px; }
.asset-library input,.asset-library select { width:100%; box-sizing:border-box; font:inherit; font-size:12px; color:var(--editor-text); background:var(--editor-soft); border:1px solid transparent; border-radius:9px; padding:9px 10px; outline:none; margin-top:5px; } .asset-library select:focus-visible,.asset-library input:focus-visible { border-color:var(--editor-focus); box-shadow:0 0 0 2px #743a5220; }
.search-field { position:relative; }.search-field input { padding-left:33px; margin-top:0; } .search-field svg { position:absolute; width:15px; height:15px; left:10px; top:10px; stroke:var(--editor-muted); fill:none; stroke-width:1.5; }
.filter-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; } .filter-grid label { min-width:0; }.filter-grid select { text-overflow:ellipsis; }
.result-summary { display:flex; align-items:center; justify-content:space-between; color:var(--editor-muted); font-size:11px; height:22px; }.asset-library .clear-filters { color:var(--editor-accent)!important; border:0!important; background:transparent!important; padding:2px!important; }
.library-results { flex:1; min-height:0; overflow:auto; padding:12px 10px; }
.asset-library .library-model { display:flex; gap:10px; align-items:center; width:100%; text-align:left; padding:11px 9px!important; margin-bottom:5px; background:transparent!important; color:var(--editor-text)!important; border:1px solid transparent!important; border-radius:13px!important; }.asset-library .library-model:hover { background:var(--editor-hover)!important; border-color:var(--editor-border)!important; }.asset-library .library-model.used { background:var(--editor-accent-soft)!important; }.asset-library .library-model:disabled { opacity:.5; cursor:default; }
.model-copy { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }.model-copy strong { font-size:13px; font-weight:500; }.model-copy small { font-size:10px; color:var(--editor-muted); }.source-name { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:9px; color:var(--editor-muted); }.add-mark { color:var(--editor-accent); font-size:18px; }
.media-toolbar { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--editor-border); }
.media-toolbar .import-btn { background:var(--editor-accent); color:var(--editor-on-accent,#fff); border-radius:9px; padding:8px 14px; }
.media-hint { color:var(--editor-muted); font-size:10px; }
.media-card { display:flex; gap:10px; align-items:center; width:100%; box-sizing:border-box; padding:8px 9px; margin-bottom:5px; background:var(--editor-soft); border-radius:11px; }
.media-thumb { width:40px; height:40px; object-fit:cover; border-radius:8px; background:var(--editor-hover); flex:none; }
.media-audio { display:flex; align-items:center; justify-content:center; font-size:18px; color:var(--editor-accent); }
.media-delete { border:0!important; background:transparent!important; color:var(--editor-muted)!important; font-size:18px; padding:4px 8px!important; }.media-delete:hover { color:var(--editor-accent)!important; }
footer { display:flex; align-items:center; gap:6px; padding:14px 15px; font-size:10px; color:var(--editor-muted); border-top:1px solid var(--editor-border); }.hint-dot { width:4px; height:4px; border-radius:50%; background:var(--editor-focus); }
.asset-rail { display:flex; flex-direction:column; align-items:center; gap:14px; padding-top:20px; }.rail-trigger { display:flex; flex-direction:column; align-items:center; gap:7px; font-size:10px!important; padding:8px!important; }.rail-trigger svg { width:21px; height:21px; stroke:currentColor; fill:none; stroke-width:1.5; }
.library-empty { display:flex; flex-direction:column; align-items:center; gap:12px; padding:30px 10px; color:var(--editor-muted); font-size:12px; }.asset-library .library-empty button { color:var(--editor-accent)!important; border:1px solid var(--editor-border)!important; background:var(--editor-accent-soft)!important; border-radius:8px!important; }
.asset-library button:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
@media(max-width:800px) { .asset-library:not(.collapsed) { position:absolute; left:0; top:0; bottom:0; z-index:5; box-shadow:12px 0 32px #080b1828; width:min(280px,calc(100% - 52px)); }.asset-library.collapsed { width:44px; } }
</style>
