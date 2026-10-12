<template>
  <button class="manual-trigger" aria-haspopup="dialog" @click="dialog.showModal()">？说明书</button>
  <dialog ref="dialog" aria-labelledby="shortcut-manual-title" @click="closeOutside" @keydown.stop>
    <header><div><span class="eyebrow">TOMORI STUDIO · 用户手册</span><h2 id="shortcut-manual-title">编辑器操作指南</h2></div><button autofocus aria-label="关闭说明书" @click="dialog.close()">关闭</button></header>
    <div class="manual-layout">
      <nav aria-label="手册目录"><button v-for="(page,index) in manualPages" :key="page.title" :aria-current="index===pageIndex ? 'page' : undefined" @click="goPage(index)"><span>{{ String(index+1).padStart(2,'0') }}</span>{{ page.title }}</button></nav>
      <article ref="article" tabindex="0" aria-labelledby="manual-page-title">
        <div class="page-heading"><span class="eyebrow">第 {{ pageIndex+1 }} 章</span><h3 id="manual-page-title">{{ current.title }}</h3><p>{{ current.summary }}</p></div>
        <section v-for="section in current.sections" :key="section.title">
          <h4>{{ section.title }}</h4>
          <ol v-if="section.steps"><li v-for="step in section.steps" :key="step">{{ step }}</li></ol>
          <p v-if="section.text">{{ section.text }}</p>
          <table v-if="section.rows"><caption class="sr-only">{{ section.title }}</caption><thead><tr><th scope="col">项目</th><th scope="col">操作与规则</th></tr></thead><tbody><tr v-for="row in section.rows" :key="row[0]"><th scope="row">{{ row[0] }}</th><td>{{ row[1] }}</td></tr></tbody></table>
          <table v-if="section.keys" class="shortcut-table"><caption class="sr-only">{{ section.title }}快捷键</caption><thead><tr><th scope="col">操作</th><th scope="col">按键</th><th scope="col">作用范围</th></tr></thead><tbody><tr v-for="row in section.keys" :key="row[0]"><th scope="row">{{ row[0] }}</th><td><kbd>{{ row[1] }}</kbd></td><td>{{ row[2] }}</td></tr></tbody></table>
          <p v-if="section.note" class="note"><strong>说明</strong>{{ section.note }}</p>
        </section>
      </article>
    </div>
    <footer><span class="escape-hint"><kbd>Esc</kbd> 关闭</span><div class="pagination" aria-label="手册翻页"><button :disabled="pageIndex===0" @click="goPage(pageIndex-1)">上一页</button><span aria-live="polite">{{ pageIndex+1 }} / {{ manualPages.length }}</span><button :disabled="pageIndex===manualPages.length-1" @click="goPage(pageIndex+1)">下一页</button></div></footer>
  </dialog>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { manualPages } from '../manualPages.js'
const dialog=ref(null),article=ref(null),pageIndex=ref(0)
const current=computed(()=>manualPages[pageIndex.value])
async function goPage(index) {
  if(index<0 || index>=manualPages.length)return
  pageIndex.value=index
  await nextTick()
  article.value.scrollTop=0
}
function closeOutside(event) {
  if(event.target!==dialog.value)return
  const rect=dialog.value.getBoundingClientRect()
  if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.value.close()
}
</script>

<style scoped>
.manual-trigger { white-space:nowrap; }
dialog { box-sizing:border-box; width:min(960px,calc(100vw - 32px)); height:min(760px,calc(100dvh - 48px)); max-height:calc(100dvh - 48px); padding:0; overflow:hidden; color:var(--editor-text); background:var(--editor-panel); border:1px solid var(--editor-border); border-radius:18px; font-size:13px; line-height:1.7; box-shadow:0 20px 80px #49313c24; }
dialog[open] { display:flex; flex-direction:column; }
dialog::backdrop { background:#3b253762; }
header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 24px; border-bottom:1px solid var(--editor-border); flex:none; }
.eyebrow { color:var(--editor-muted); font-size:10px; letter-spacing:.08em; }
h2 { font-size:20px; margin:3px 0 0; font-weight:600; }
.manual-layout { display:flex; min-height:0; flex:1; }
nav { flex:0 0 186px; padding:16px 12px; overflow:auto; border-right:1px solid var(--editor-border); background:var(--editor-soft); }
nav button { display:flex; width:100%; align-items:center; text-align:left; gap:10px; margin:0 0 5px; background:transparent; padding:10px; }
nav button span { color:var(--editor-muted); font-size:11px; }
nav button[aria-current=page] { background:var(--editor-accent); color:var(--editor-on-accent,#fff); }
nav button[aria-current=page] span { color:inherit; opacity:.75; }
article { min-width:0; flex:1; overflow:auto; padding:22px 28px 28px; scroll-behavior:auto; }
h3 { font-size:22px; margin:3px 0 6px; line-height:1.4; }
.page-heading { margin-bottom:24px; }
.page-heading p { color:var(--editor-muted); margin:0; }
section + section { margin-top:26px; }
h4 { font-size:14px; color:var(--editor-accent); margin:0 0 10px; }
p { margin:8px 0; }
ol { padding-left:24px; margin:0; } li { padding:4px 0 4px 5px; } li::marker { color:var(--editor-accent); font-weight:600; }
table { width:100%; border-collapse:collapse; text-align:left; font-size:12px; table-layout:fixed; }
th,td { padding:10px 12px; border-bottom:1px solid var(--editor-border); vertical-align:top; overflow-wrap:anywhere; }
thead { background:var(--editor-soft); color:var(--editor-muted); }
th { font-weight:600; } th:first-child { width:95px; } tbody th { color:var(--editor-text); }
.shortcut-table th:first-child { width:28%; } .shortcut-table th:nth-child(2) { width:32%; }
kbd { font:inherit; } .note { padding:12px 14px; background:var(--editor-soft); border-left:3px solid var(--editor-accent); color:var(--editor-muted); font-size:12px; } .note strong { display:block; color:var(--editor-text); margin-bottom:4px; }
footer { flex:none; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 24px; border-top:1px solid var(--editor-border); }
.escape-hint { color:var(--editor-muted); font-size:12px; } .pagination { display:flex; align-items:center; gap:16px; } .pagination span { min-width:36px; text-align:center; font-variant-numeric:tabular-nums; }
button { background:var(--editor-soft); border:1px solid transparent; color:var(--editor-text); border-radius:9px; padding:7px 12px; cursor:pointer; font:inherit; }
button:hover:not(:disabled) { background:var(--editor-hover); } nav button[aria-current=page]:hover { background:var(--editor-accent); }
button:disabled { opacity:.4; cursor:default; } button:focus-visible,article:focus-visible { outline:2px solid var(--editor-accent); outline-offset:-2px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
@media(max-width:680px) { header { padding:14px 16px; } h2 { font-size:17px; } .manual-layout { flex-direction:column; } nav { flex:0 0 auto; display:flex; gap:6px; padding:10px; border-right:0; border-bottom:1px solid var(--editor-border); } nav button { flex:0 0 auto; width:auto; margin:0; white-space:nowrap; padding:7px 10px; } nav button span { display:none; } article { padding:18px 16px; } h3 { font-size:19px; } footer { padding:12px 16px; } th,td { padding:8px; } th:first-child { width:72px; } }
</style>
