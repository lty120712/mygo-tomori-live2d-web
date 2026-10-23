<template>
  <div class="scene-editor" @copy="!$event.defaultPrevented && sceneTimeline?.copyKeyEvent($event)" @paste="!$event.defaultPrevented && sceneTimeline?.pasteKeyEvent($event)">
    <header class="editor-header"><strong>Tomori Studio <em>v0.1</em></strong><span>场景 · {{ project.clips.length }} 个模型 · {{ imageClipCount }} 个图片片段 · {{ videoClipCount }} 个视频片段 · {{ textClipCount }} 个文字片段 · {{ project.backgroundClips.length }} 个背景片段</span><div class="header-actions"><button :aria-pressed="previewExpanded" @click="previewExpanded=!previewExpanded">{{previewExpanded ? '返回编辑' : '放大画布'}}</button><button v-if="!previewExpanded" :aria-pressed="showAssets" @click="showAssets=!showAssets">素材库</button><button v-if="!previewExpanded" :aria-pressed="showInspector" @click="showInspector=!showInspector">片段属性</button><ShortcutManual /><button :disabled="!canUndo" title="撤销 Ctrl+Z" @click="undo">撤销</button><button :disabled="!canRedo" title="重做 Ctrl+Shift+Z / Ctrl+Y" @click="redo">重做</button><button :disabled="locked" title="导出 .tomori 工程，包含引用的图片、视频和音频" @click="exportProject">导出工程</button><button v-if="recorder.canRecord.value" :disabled="recorder.isExporting.value || loading || (locked && !recorder.isRecording.value)" @click="record" title="生成视频文件，不导出工程">{{ recorder.isRecording.value ? '结束并下载视频' : recorder.isExporting.value ? '视频处理中…' : '导出视频' }}</button><select v-if="recorder.canRecord.value" aria-label="视频导出格式" v-model="recorder.format.value" :disabled="locked"><option v-for="format in recorder.formats" :key="format.id" :value="format.id">{{format.label}}</option></select><button :disabled="locked" title="打开 .tomori 工程" @click="projectInput.click()">导入工程</button><input ref="projectInput" type="file" accept=".tomori" hidden @change="importProject" /></div></header>
    <div v-if="message" class="editor-message" role="status">{{ message }}<button @click="message=''">关闭</button></div>
    <div v-if="missingImages.length || missingVideos.length || missingBackgrounds.length || missingAudio.length" class="editor-message" role="alert">素材缺失或无法读取：{{[...missingImages,...missingVideos,...missingBackgrounds,...missingAudio].map(c=>c.name).join('、')}}。片段仍保留；请在原浏览器恢复素材。</div>
    <div class="editor-workspace">
      <AssetLibrary v-show="!previewExpanded" :open="showAssets" :models="assetModels" :clips="allClips" :background-clips="project.backgroundClips" :audio-clips="project.audioClips" :disabled="locked" @toggle="showAssets=!showAssets" @add="addModel" @add-image="addImage" @background-image="addBackgroundImage" @add-audio="asset=>addAudioClip(asset,0)" @add-video="addVideo" @add-text="addText($event);showInspector=true" @batch-text="openTextBatch" />
      <main class="scene-main"><SceneCanvas :duration="project.duration" @seek="seek" @toggle-play="playing ? pause() : play()" ref="sceneCanvas" :clips="allClips" :background-clips="project.backgroundClips" :time="time" :fps="project.fps" :aspect-ratio="project.aspectRatio" :selected="selected" :selected-ids="canvasSelection" :runtimes="runtimes" :playing="playing" :background="project.background" :background-image="project.backgroundImage" @background-ready="backgroundLoading=false" @image-status="imageStatus" :recording="recorder.isRecording.value" @ready="runtimeReady" @dispose="disposeRuntime" @error="runtimeError" @select="selectCanvas" @batch-transform="batchCanvasTransform" @move="moveModel" @transform="transformModel" @mouse-position="mouseMoved" @begin-edit="beginEdit" @end-edit="endEdit" />
        <div class="transport">
          <div class="playback-controls" role="group" aria-label="播放控制"><button @click="seek(0)" :disabled="recorder.isRecording.value" title="回到开头">回到开头</button><button class="play-button" @click="playing ? pause() : play()" :disabled="loading || recorder.isRecording.value" title="空格 播放／暂停">{{ playing ? '暂停' : '播放' }}</button><button :aria-pressed="loopPlayback" :disabled="recorder.isRecording.value" @click="loopPlayback=!loopPlayback" title="循环播放整个工程；录制只播放一次">循环播放{{ loopPlayback ? '：开' : '：关' }}</button></div>
          <label class="transport-time" title="定位播放头 · 分:秒:帧"><TimecodeInput label="播放头时间" :value="time" :fps="project.fps" :max="project.duration" :disabled="locked" @change="seek" /><span>/ {{formatTimecode(project.duration,project.fps)}}</span></label>
          <div class="record-controls" role="group" aria-label="视频导出状态"><button aria-haspopup="dialog" @click="sceneSettings.showModal()">场景设置</button><span v-if="recorder.isRecording.value" class="record-status" role="status">正在生成视频，工程结束后自动下载</span><span v-else-if="recorder.isExporting.value" role="status">正在转换 MP4… {{Math.round(recorder.progress.value*100)}}%</span><span v-else-if="loading" class="loading-label" role="status">加载中…</span></div>
        </div>
        <dialog ref="sceneSettings" class="scene-settings" aria-labelledby="scene-settings-title" @keydown.stop @click="closeSceneSettingsOutside"><header><h3 id="scene-settings-title">场景设置</h3><button aria-label="关闭场景设置" @click="sceneSettings.close()">关闭</button></header><p>工程画面 · {{ project.aspectRatio==='9:16' ? '540 × 960' : '960 × 540' }}</p><div class="settings-grid"><label>画布比例<select aria-label="画布比例" :value="project.aspectRatio" :disabled="locked" @change="changeAspectRatio($event.target.value)"><option value="16:9">横屏 16:9</option><option value="9:16">竖屏 9:16</option></select></label><label>总时长 <TimecodeInput label="工程总时长" :value="project.duration" :fps="project.fps" :min="0.5" :max="600" :disabled="locked" @begin-edit="beginEdit" @end-edit="endEdit" @change="changeDuration" /></label><label>FPS <select aria-label="工程帧率" :value="project.fps" :disabled="locked" @change="changeFps($event.target.value)"><option v-for="n in [24,30,60]" :key="n">{{n}}</option></select></label><label>背景 <input aria-label="背景颜色" type="color" :value="project.background" @focus="beginEdit" @blur="endEdit" @input="changeBackground($event.target.value)" :disabled="locked" /></label></div><div class="background-controls"><span>背景图片</span><button :disabled="locked || uploadingBackground" @click="backgroundInput.click()">{{ uploadingBackground ? '上传中…' : '上传背景图片' }}</button><input ref="backgroundInput" type="file" accept="image/*" hidden @change="uploadBackground" /><template v-if="project.backgroundImage"><span class="background-name" :title="project.backgroundImageName">{{ project.backgroundImageName }}</span><button :disabled="locked || uploadingBackground" @click="removeBackgroundImage">移除图片</button></template><button :disabled="locked || uploadingBackground" @click="resetBackground">重置为绿幕</button></div><p v-if="locked">播放或录制期间，工程设置暂不可编辑。</p></dialog>
        <input ref="backgroundImageInput" type="file" accept="image/*" hidden @change="importBackgroundImageFile" />
        <input ref="audioInput" type="file" accept="audio/*" hidden @change="importAudioFile" />
        <MultiTimeline @batch-text="openTextBatch('srt')" @add-text="addText();showInspector=true" ref="sceneTimeline" :selected-ids="canvasSelection" @selection-change="selectTimeline" @clear-selection="selectCanvas([])" v-show="!previewExpanded" :clips="allClips" :background-clips="project.backgroundClips" :audio-clips="project.audioClips" :audio-track-state="project.audioTrackState" :duration="project.duration" :fps="project.fps" :time="time" :selected="selected" :selectedId="selectedId" :labels="paramLabels" :pose="selectedPose" :runtimes="runtimes" :transform-fields="transformFields" :disabled="locked" :navigation-disabled="loading || recorder.isRecording.value" @select="selectedId=$event" @seek="seek" @batch-clips="batchClips" @layer-state="changeLayerState" @background-track-state="changeBackgroundTrackState" @audio-track-state="changeAudioTrackState" @rename-layer="renameLayer" @reorder-layer="reorderLayer" @edit-clip="editClip" @begin-edit="beginEdit" @end-edit="endEdit" @remove-key="removeKey" @batch-keys="batchKeys" @move-key="moveKey" @edit-key-value="editKeyValue" @toggle-key="toggleTimelineKey" @edit-event="editEvent" @paste-event="pasteEvent" @remove-event="removeEvent" @delete-selected="deleteSelected" @add-background-color="addBackgroundColor" @background-edit="editBackground" @delete-background="deleteBackground" @split-background="splitBackground" @background-image="addBackgroundImage" @import-background-image="backgroundImageInput.click()" @paste-background="pasteBackgroundClip" @add-audio="addAudioClip" @import-audio="importAudio" @audio-edit="editAudioClip" @delete-audio="deleteAudioClip" @split-audio="splitAudio" @paste-audio="pasteAudioClip" />
      </main>
      <aside v-show="!previewExpanded && showInspector" class="inspector"><h3>片段属性</h3><template v-if="selected"><p v-if="selected.layerLocked">图层已锁定，请在时间线左侧解锁。</p><fieldset :disabled="editLocked" class="inspector-fields">
        <label class="clip-name-label">图层名称<input aria-label="图层名称" maxlength="100" :value="selected.layerName || selected.name" @focus="beginEdit" @blur="$event.target.value=selected.layerName || selected.name;endEdit()" @input="!$event.isComposing && renameLayer(selected.track,$event.target.value,true)" @compositionend="renameLayer(selected.track,$event.target.value,true)" @keydown.enter.prevent="$event.target.blur()" /></label><p class="model-identity" :title="selected.model">{{modelIdentity}}</p></fieldset>
        <div class="inspector-tabs" role="tablist" aria-label="片段属性分类"><button v-for="tab in inspectorTabs" :key="tab.key" role="tab" :aria-selected="inspectorTab===tab.key" :tabindex="inspectorTab===tab.key ? 0 : -1" :aria-controls="'inspector-'+tab.key" :id="'inspector-tab-'+tab.key" @keydown="navigateInspectorTabs" @click="inspectorTab=tab.key">{{tab.label}}</button></div><fieldset :disabled="editLocked" class="inspector-fields"><section v-show="inspectorTab==='basic'" id="inspector-basic" role="tabpanel" aria-labelledby="inspector-tab-basic"><label>片段名称<input aria-label="片段名称" :value="selected.name" @focus="beginEdit" @blur="endEdit" @input="renameClip($event.target.value)" /></label><div class="clip-actions"><button :disabled="locked" @click="duplicate">复制</button><button :disabled="locked || !canSplit" @click="split">在播放头切割</button></div>
        <p class="status-label">{{ clipVisible(selected,time) ? '当前显示' : '当前时间不在片段内' }} · {{ selectionStatus }}</p>
        <label>混合模式<select aria-label="片段混合模式" :value="selected.blendMode || 'source-over'" @change="changeBlendMode($event.target.value)"><option v-for="mode in BLEND_MODES" :key="mode.value" :value="mode.value">{{mode.label}}</option></select></label><p class="preview-hint">与下方图层和背景混合，可配合不透明度关键帧调整强度。</p>
        <div class="property-grid"><label>开始时间<TimecodeInput label="片段开始时间" :value="selected.start" :fps="project.fps" :max="project.duration-1/project.fps" :disabled="locked" @begin-edit="beginEdit" @end-edit="endEdit" @change="editTiming('start',$event)" /></label><label>显示时长<TimecodeInput label="片段显示时长" :value="selected.duration" :fps="project.fps" :min="1/project.fps" :max="project.duration-selected.start" :disabled="locked" @begin-edit="beginEdit" @end-edit="endEdit" @change="editTiming('duration',$event)" /></label><label>轨道 / 层级<input aria-label="片段轨道" type="number" min="1" :max="VISUAL_TRACK_LIMIT" :value="selected.track+1" :disabled="locked" @focus="beginEdit" @blur="endEdit" @input="editClip(selected.id,{track:Number($event.target.value)-1})" /></label><label>源时间偏移<input type="text" :value="formatTimecode(selected.offset,project.fps)" disabled /></label></div>
        <TextInspector v-if="isTextClip(selected)" :clip="selected" @edit="editText" @begin-edit="beginEdit" @end-edit="endEdit" />
        <div v-if="isVideoClip(selected)" class="property-grid"><label class="check-label"><input type="checkbox" aria-label="视频原声静音" :checked="selected.videoMuted" @change="editClip(selected.id,{videoMuted:$event.target.checked})" />原声静音</label><label>原声音量 %<input type="number" aria-label="视频原声音量" min="0" max="100" :value="Math.round((selected.videoVolume ?? 1)*100)" @focus="beginEdit" @blur="endEdit" @input="editClip(selected.id,{videoVolume:Math.max(0,Math.min(100,Number($event.target.value)))/100})" /></label></div>
        <h4>画面变换</h4><button :disabled="editLocked || !clipVisible(selected,time)" @click="resetPlacement" title="位置归零、缩放恢复 100%；当前或前后关键帧之间记录重置值">重置位置和大小</button><label class="check-label"><input type="checkbox" v-model="autoTransform" :disabled="locked" />自动添加变换关键帧</label>
        <p class="preview-hint">等比缩放与 X / Y 倍率叠加。四角等比缩放，左右中点只改 X，上下中点只改 Y。<template v-if="isTextClip(selected)">只改变文字框宽度并保持字形，请用文字样式中的「文字框宽度」。</template></p>
        <div class="property-grid"><label v-for="field in transformFields" :key="field.key" :class="{'opacity-control':field.key==='opacity'}">{{ field.label }}{{ numericDisplay('@'+field.key,field).unit }}<div class="field-control"><input v-if="field.key==='opacity'" class="opacity-slider" aria-label="不透明度滑条" type="range" min="0" max="100" step="1" :value="numericDisplay('@opacity',field).toDisplay(selectedPose.transform.opacity)" :disabled="locked" @pointerdown="$event.target.setPointerCapture($event.pointerId);beginEdit()" @pointerup="endEdit" @pointercancel="endEdit" @lostpointercapture="endEdit" @focus="beginEdit" @blur="endEdit" @keydown="!$event.repeat && beginEdit()" @keyup="endEdit" @input="editTransform('opacity',Number($event.target.value)/100)" /><input :aria-label="field.label" type="number" :min="numericDisplay('@'+field.key,field).min" :max="numericDisplay('@'+field.key,field).max" step="1" :value="numericDisplay('@'+field.key,field).toDisplay(selectedPose.transform[field.key])" :disabled="locked" @focus="beginEdit" @blur="$event.target.value=numericDisplay('@'+field.key,field).toDisplay(selectedPose.transform[field.key]);endEdit()" @input="editTransform(field.key,numericDisplay('@'+field.key,field).toNative($event.target.value))" /><button :title="'添加/删除当前帧关键帧'" :class="{keyed:hasKey('@'+field.key)}" :disabled="locked" @click="toggleKey('@'+field.key,selectedPose.transform[field.key])">◆</button></div></label></div>
        </section><template v-if="runtime"><section v-show="inspectorTab==='motion'" id="inspector-motion" role="tabpanel" aria-labelledby="inspector-tab-motion"><h4>动作预览</h4>
        <label class="check-label"><input type="checkbox" role="switch" aria-label="鼠标跟随" :checked="selected.mouseTrack !== false" :disabled="locked" @change="changeMouseTrack($event.target.checked)" />鼠标跟随</label>
        <PreviewAssetList :key="selected.id+'motion'" label="动作" :items="runtime.motions" v-model="previewMotionName" :disabled="editLocked" /><div class="preview-actions"><button :disabled="locked || !previewMotionName || !clipVisible(selected,time)" @click="preview('motion',previewMotionName)">播放动作</button><button :disabled="locked || !previewMotionName || !clipVisible(selected,time)" @click="addChosenEvent('motion',previewMotionName)">添加动作到时间线</button><button :disabled="locked || !clipVisible(selected,time)" @click="resetPreview('motion')">重置动作</button></div><div v-if="previewProgress" class="motion-countdown"><progress aria-label="预览动作播放进度" :max="previewProgress.duration" :value="previewProgress.elapsed"></progress><span>剩余 {{formatTimecode(previewProgress.duration-previewProgress.elapsed,project.fps)}}</span></div><p v-if="previewMotionName && !previewProgress" class="preview-hint">动作时长：{{ previewMotionInfo?.seconds ? formatTimecode(previewMotionInfo.seconds,project.fps) : runtime.infoReady ? '未知时长' : '读取中…' }}</p>
        </section><section v-show="inspectorTab==='expression'" id="inspector-expression" role="tabpanel" aria-labelledby="inspector-tab-expression"><h4>表情预览</h4><PreviewAssetList :key="selected.id+'expression'" label="表情" :items="runtime.expressions" v-model="previewExpressionName" :disabled="editLocked" /><div class="preview-actions"><button :disabled="locked || !previewExpressionName || !clipVisible(selected,time)" @click="preview('expression',previewExpressionName)">预览表情</button><button :disabled="locked || !previewExpressionName || !clipVisible(selected,time)" @click="addChosenEvent('expression',previewExpressionName)">添加表情到时间线</button><button :disabled="locked || !clipVisible(selected,time)" @click="resetPreview('expression')">重置表情</button></div>
        </section><div v-show="inspectorTab==='motion' || inspectorTab==='expression'"><p class="preview-hint">预览不写入时间线；选中后点击添加。</p><template v-if="activePreview"><p class="preview-hint">{{activePreview}}</p><button :disabled="locked" @click="endPreview">结束预览</button></template>
        </div><section v-show="inspectorTab==='params'" id="inspector-params" role="tabpanel" aria-labelledby="inspector-tab-params"><h4>身体与表情参数</h4><input v-model="paramSearch" aria-label="搜索参数" placeholder="搜索参数名称或 ID" /><label class="check-label"><input type="checkbox" v-model="allParams" />全部参数</label><span class="parameter-count">{{visibleParams.length}} 项</span>
        <div v-if="!visibleParams.length" class="preview-hint">没有匹配的参数</div><div v-for="group in inspectorParamGroups" :key="group.key" class="param-group"><button class="group-toggle" :aria-expanded="!!paramSearch || !collapsedGroups[group.key]" @click="collapsedGroups[group.key]=!collapsedGroups[group.key]">{{group.header}}<span>{{group.params.length}} 项 {{paramSearch || !collapsedGroups[group.key] ? '⌄' : '›'}}</span></button><div v-show="paramSearch || !collapsedGroups[group.key]"><div v-for="p in group.params" :key="p.key" class="scene-param" :data-param-id="p.key"><span :title="p.key">{{p.label}}{{ numericDisplay(p.key,p).unit }}</span><div><input :aria-label="p.label" type="number" :min="numericDisplay(p.key,p).min" :max="numericDisplay(p.key,p).max" step="1" :value="numericDisplay(p.key,p).toDisplay(selectedPose.params[p.key] ?? p.default)" :disabled="locked" @focus="beginEdit" @blur="$event.target.value=numericDisplay(p.key,p).toDisplay(selectedPose.params[p.key] ?? p.default);endEdit()" @input="editParam(p,numericDisplay(p.key,p).toNative($event.target.value))" /><button :class="{keyed:hasKey(p.key)}" :disabled="locked" @click="toggleKey(p.key,selectedPose.params[p.key] ?? p.default)" title="添加/删除当前帧关键帧">◆</button><button :aria-label="'重置'+p.label" :disabled="locked" @click="resetParam(p)">重置</button></div><input :aria-label="p.label+'滑条'" type="range" @pointerdown="beginEdit" @pointerup="endEdit" @pointercancel="endEdit" :min="numericDisplay(p.key,p).min" :max="numericDisplay(p.key,p).max" step="1" :value="numericDisplay(p.key,p).toDisplay(selectedPose.params[p.key] ?? p.default)" :disabled="locked" @focus="beginEdit" @blur="$event.target.value=numericDisplay(p.key,p).toDisplay(selectedPose.params[p.key] ?? p.default);endEdit()" @input="editParam(p,numericDisplay(p.key,p).toNative($event.target.value))" /></div></div></div></section></template><p v-else-if="inspectorTab!=='basic'" class="preview-hint">模型加载完成后即可编辑。</p>
      </fieldset></template><p v-else>在画布或时间线上选择模型或图片片段，编辑时长和动画。</p></aside>
    </div>
    <TextBatchDialog v-if="showTextBatch" :initial-mode="textBatchMode" :clips="allClips" :selected="selected" :time="time" :duration="project.duration" :fps="project.fps" :disabled="locked" @cancel="showTextBatch=false" @apply="applyTextBatch" />
  </div>
</template>
<script setup>
import { ref,computed,watch } from 'vue'
import { VISUAL_TRACK_LIMIT, isImageClip, isMediaClip, isVideoClip } from './mediaTracks.js'
import { BLEND_MODES } from './visualComposite.js'
import { isTextClip } from './textTracks.js'
import TextInspector from './components/TextInspector.vue'
import TextBatchDialog from './components/TextBatchDialog.vue'
import PreviewAssetList from './components/PreviewAssetList.vue'
import {describeModel} from './modelLibrary.js'
import './editorTheme.css'
import { numericDisplay } from './numericDisplay.js'
import TimecodeInput from './components/TimecodeInput.vue'
import { formatTimecode } from './timecode.js'
import ShortcutManual from './components/ShortcutManual.vue'
import SceneCanvas from './components/SceneCanvas.vue'
import AssetLibrary from './components/AssetLibrary.vue'
import MultiTimeline from './components/MultiTimeline.vue'
import { assetStore } from './assetStore.js'
import { clipVisible } from './sceneProject.js'
import { useSceneEditor } from './composables/useSceneEditor.js'
const sceneSettings=ref(null)
const showTextBatch=ref(false),textBatchMode=ref('srt')
function openTextBatch(mode='srt'){textBatchMode.value=mode;showTextBatch.value=true}
function applyTextBatch(request){if(addTextBatch(request)){showTextBatch.value=false;showInspector.value=true}}
function changeBlendMode(value){endEdit();beginEdit();try{editClip(selected.value.id,{blendMode:value})}finally{endEdit()}}
const backgroundImageInput=ref(null)
const audioInput=ref(null),audioImportTrack=ref(0)
function importAudio(track){audioImportTrack.value=Number(track)||0;audioInput.value?.click()}
async function importAudioFile(event){
  const file=event.target.files && event.target.files[0]
  event.target.value=''
  if(!file)return
  try{ const meta=await assetStore.importFile(file); await addAudioClip(meta,audioImportTrack.value) }
  catch(error){ message.value='导入音频失败：'+error.message }
}
async function importBackgroundImageFile(event){
  const file=event.target.files && event.target.files[0]
  event.target.value=''
  if(!file)return
  try{ const meta=await assetStore.importFile(file); await addBackgroundImage(meta) }
  catch(error){ message.value='导入背景图片失败：'+error.message }
}
function closeSceneSettingsOutside(event){if(event.target!==sceneSettings.value)return;const r=sceneSettings.value.getBoundingClientRect();if(event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom)sceneSettings.value.close()}
const previewExpanded=ref(false),showAssets=ref(window.innerWidth>=1100),showInspector=ref(window.innerWidth>=800)
const {addText,addTextBatch,editText,allClips,imageStatus,missingImages,missingVideos,missingBackgrounds,missingAudio,addAudioClip,editAudioClip,deleteAudioClip,splitAudio,pasteAudioClip,addImage,addVideo,addBackgroundColor,addBackgroundImage,pasteBackgroundClip,editBackground,deleteBackground,splitBackground,sceneTimeline,selectTimeline,changeAspectRatio,canvasSelection,selectCanvas,batchCanvasTransform,batchClips,editLocked,changeLayerState,changeBackgroundTrackState,changeAudioTrackState,project,runtimes,selectedId,playing,loopPlayback,message,paramSearch,allParams,autoTransform,sceneCanvas,projectInput,recorder,locked,time,selected,runtime,loading,canSplit,selectedPose,paramLabels,assetModels,visibleParams,transformFields,hasKey,previewMotionName,previewExpressionName,activePreview,previewMotionInfo,previewProgress,preview,resetPreview,endPreview,mouseMoved,changeMouseTrack,addChosenEvent,canUndo,canRedo,undo,redo,beginEdit,endEdit,renameClip,changeBackground,backgroundInput,backgroundLoading,uploadingBackground,uploadBackground,removeBackgroundImage,resetBackground,addModel,renameLayer,reorderLayer,editClip,editTiming,editTransform,resetPlacement,moveModel,transformModel,editParam,resetParam,toggleKey,removeKey,moveKey,batchKeys,editKeyValue,editEvent,pasteEvent,removeEvent,duplicate,split,deleteSelected,runtimeReady,disposeRuntime,runtimeError,addEvent,play,pause,seek,changeDuration,changeFps,record,exportProject,importProject}=useSceneEditor()
const inspectorTab=ref('basic'),collapsedGroups=ref({brow:true,expression:true,body:true,hair:true,clothes:true,other:true})
const allInspectorTabs=[{key:'basic',label:'基础'},{key:'motion',label:'动作'},{key:'expression',label:'表情'},{key:'params',label:'参数'}]
const inspectorTabs=computed(()=>isMediaClip(selected.value) ? allInspectorTabs.slice(0,1) : allInspectorTabs)
watch(selected,()=>{if(isMediaClip(selected.value))inspectorTab.value='basic'})
const imageClipCount=computed(()=>project.imageClips.filter(isImageClip).length)
const textClipCount=computed(()=>project.imageClips.filter(isTextClip).length)
const videoClipCount=computed(()=>project.imageClips.filter(isVideoClip).length)
const selectionStatus=computed(()=>{
  const clip=selected.value
  if(!clip)return ''
  if(isTextClip(clip))return '文字已就绪'
  if(isVideoClip(clip))return missingVideos.value.some(c=>c.id===clip.id) ? '视频素材缺失' : loading.value ? '加载中' : '视频已就绪'
  if(isImageClip(clip))return missingImages.value.some(c=>c.id===clip.id) ? '图片素材缺失' : loading.value ? '加载中' : '图片已就绪'
  return runtime.value ? '模型已就绪' : '加载中'
})
function navigateInspectorTabs(event){
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
  event.preventDefault();event.stopPropagation()
  const current=inspectorTabs.value.findIndex(tab=>tab.key===inspectorTab.value)
  const index=event.key==='Home' ? 0 : event.key==='End' ? inspectorTabs.value.length-1 : (current+(event.key==='ArrowRight' ? 1 : -1)+inspectorTabs.value.length)%inspectorTabs.value.length
  inspectorTab.value=inspectorTabs.value[index].key
  event.currentTarget.parentElement.children[index].focus()
}
const modelIdentity=computed(()=>{
  if(isTextClip(selected.value))return '文字图层 · '+selected.value.text.length+' 字'
  if(isVideoClip(selected.value))return '视频素材 · '+selected.value.width+' × '+selected.value.height
  if(isImageClip(selected.value))return '图片素材 · '+selected.value.width+' × '+selected.value.height
  const model=assetModels.find(m=>m.category+'/'+m.name===selected.value?.model)
  if(!model)return '模型素材'
  const info=describeModel(model);return info.character+' · '+info.label
})
const inspectorParamGroups=computed(()=>{
  const keys=new Set(visibleParams.value.map(p=>p.key))
  return (runtime.value?.groups || []).map(g=>({...g,params:g.params.filter(p=>keys.has(p.key))})).filter(g=>g.params.length)
})
function toggleTimelineKey(key) {
  const p=runtime.value?.groups.flatMap(g=>g.params).find(p=>p.key===key)
  toggleKey(key,key.startsWith('@') ? selectedPose.value.transform[key.slice(1)] : selectedPose.value.params[key] ?? p?.default ?? 0)
}
</script>
<style scoped>
.inspector-fields { border:0; padding:0; margin:0; min-width:0; }.inspector-fields:disabled { opacity:.6; }
.opacity-control { grid-column:1 / -1; }
.opacity-control .field-control { align-items:center; gap:7px; }
.opacity-control .opacity-slider { flex:1; min-width:0; width:auto; margin:0; cursor:pointer; }
.opacity-control input[type=number] { flex:0 0 66px; width:66px; }
.scene-editor { display:flex; flex-direction:column; height:100vh; color:var(--editor-text); background:var(--editor-bg); font-size:12px; }
.editor-header { height:48px; flex-shrink:0; display:flex; align-items:center; gap:20px; padding:0 16px; border-bottom:1px solid var(--editor-border); background:var(--editor-panel); }
.editor-header strong { font-size:17px; }.editor-header em { color:var(--editor-accent); font-style:normal; font-size:12px; }
.header-actions { margin-left:auto; display:flex; gap:7px; min-width:0; overflow-x:auto; }.header-actions>button { flex-shrink:0; white-space:nowrap; }.editor-message { background:var(--editor-accent-soft); padding:8px 16px; }.editor-message button { float:right; }
.background-controls { flex-shrink:0; display:flex; align-items:center; gap:8px; padding:6px 10px; background:var(--editor-panel); flex-wrap:wrap; border-top:1px solid var(--editor-border); }.background-name { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--editor-muted); }
.editor-workspace { flex:1; min-height:0; display:flex; position:relative; } .inspector h3 { margin:0 0 12px; }
 .inspector p { color:var(--editor-muted); font-size:11px; }
.scene-main { flex:1; min-width:0; min-height:0; overflow-y:auto; display:flex; flex-direction:column; }.inspector { width:270px; flex-shrink:0; padding:12px; box-sizing:border-box; background:var(--editor-panel); overflow:auto; border-left:1px solid var(--editor-border); }
.scene-editor :deep(button:not(.key-marker):not(.event-marker)) { background:var(--editor-soft); border:1px solid var(--editor-border); color:var(--editor-text); border-radius:var(--editor-radius); padding:5px 8px; cursor:pointer; font:inherit; }.scene-editor :deep(button:not(.key-marker):not(.event-marker):hover) { background:var(--editor-hover); }.scene-editor :deep(button:not(.key-marker):not(.event-marker):disabled) { opacity:.45; cursor:default; }
.scene-editor input,.scene-editor select { box-sizing:border-box; background:var(--editor-soft); color:var(--editor-text); border:1px solid var(--editor-border); border-radius:6px; padding:4px; font:inherit; width:100%; }.scene-editor input[type=checkbox] { width:auto; }.scene-editor input[type=range] { padding:0; accent-color:var(--editor-accent); }
.transport { display:flex; flex-wrap:nowrap; flex-shrink:0; overflow-x:auto; white-space:nowrap; align-items:center; gap:8px; padding:8px 10px; background:var(--editor-panel); }.transport>button,.transport>span,.transport>label { flex-shrink:0; }
.transport label { display:flex; align-items:center; gap:4px; }.transport input[type=text] { width:100px; font-variant-numeric:tabular-nums; }.transport select { width:50px; }.transport input[type=color] { width:32px; height:26px; padding:2px; }.loading-label { color:var(--editor-guide); }
.motion-countdown { display:flex; flex-direction:column; gap:5px; margin:8px 0; color:var(--editor-accent); }.motion-countdown progress { width:100%; height:8px; accent-color:var(--editor-focus); }
.preview-actions { display:flex; gap:5px; flex-wrap:wrap; }.preview-hint { overflow-wrap:anywhere; }
.clip-actions { display:flex; gap:4px; margin-top:8px; }.clip-actions button { padding:4px; }.property-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }.inspector label { display:block; margin:5px 0; color:var(--editor-muted); font-size:11px; }.inspector h4 { margin:16px 0 6px; color:var(--editor-text); border-top:1px solid var(--editor-border); padding-top:9px; }.check-label { display:flex!important; align-items:center; gap:5px; }.field-control { display:flex; gap:3px; }.field-control input { min-width:0; }.keyed { color:var(--editor-key)!important; border-color:var(--editor-guide)!important; }.scene-param { border-bottom:1px solid var(--editor-border); padding:8px 0; }.scene-param>span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom:3px; color:var(--editor-muted); }.scene-param>div { display:flex; gap:5px; }.scene-param input[type=number] { flex:1; min-width:0; }.scene-param input[type=range] { margin-top:5px; }.parameter-count { font-size:10px; color:var(--editor-muted); }
@media(max-width:1100px) { .editor-header>span { display:none; }.editor-header { gap:10px; }.editor-header strong { white-space:nowrap; } }
.editor-header { height:58px; background:var(--editor-panel); border-bottom-color:var(--editor-border); }
.editor-header strong { letter-spacing:-.3px; font-size:19px; color:var(--editor-text); }
.editor-header strong::before { content:''; display:inline-block; width:9px; height:9px; margin-right:9px; border-radius:50%; background:var(--editor-accent); box-shadow:0 0 0 4px var(--editor-accent-soft); }
.editor-header>span { color:var(--editor-muted); font-size:11px; }
.scene-editor :deep(button:not(.key-marker):not(.event-marker)) { padding:6px 10px; border-color:transparent; }
.scene-editor :deep(button[aria-pressed=true]:not(.key-marker):not(.event-marker)) { background:var(--editor-accent); color:#fff; border-color:var(--editor-accent); }
.scene-editor :deep(button:focus-visible),.scene-editor input:focus-visible,.scene-editor select:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
.scene-editor input,.scene-editor select { border-color:transparent; padding:6px; color-scheme:light; }
.scene-editor input[type=checkbox] { accent-color:var(--editor-accent); }
.inspector { padding:18px 16px; background:var(--editor-panel); }
.inspector h3 { font-size:17px; font-weight:600; margin-bottom:16px; }
.inspector h4 { display:flex; align-items:center; gap:7px; margin-top:22px; border:0; padding:9px 0; font-size:12px; }
.inspector h4::before { content:''; width:3px; height:12px; border-radius:3px; background:var(--editor-accent); }
.inspector label { color:var(--editor-muted); margin:7px 0; }
.status-label { padding:7px 9px; background:var(--editor-soft); border-radius:8px; }
.scene-param { padding:12px 0; }
.transport { gap:8px; padding:10px 12px; border-top:1px solid var(--editor-border); }
.transport>span { color:var(--editor-muted); font-variant-numeric:tabular-nums; }
.transport label { color:var(--editor-muted); font-size:11px; }
.background-controls { color:var(--editor-muted); font-size:11px; padding:8px 12px; }
.editor-message { padding:10px 16px; color:var(--editor-accent); }
.inspector-tabs { display:flex; gap:3px; padding:4px; margin:14px 0; background:var(--editor-soft); border-radius:10px; position:sticky; top:-18px; z-index:2; }
.inspector-tabs button { flex:1; min-width:0; padding:8px 3px!important; }
.inspector-tabs button[aria-selected=true] { background:var(--editor-accent)!important; color:white!important; }
.model-identity { margin:5px 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.clip-name-label { font-weight:600; }.clip-name-label input { margin-top:5px; font-size:13px; }
.group-toggle { display:flex; align-items:center; justify-content:space-between; width:100%; margin-top:10px; text-align:left; }
.group-toggle span { font-size:10px; color:var(--editor-muted); }
.param-group { border-bottom:1px solid var(--editor-border); padding-bottom:6px; }
.transport { flex-wrap:wrap; overflow:visible; gap:10px 16px; padding:10px 12px; }
.playback-controls,.record-controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }.record-controls { margin-left:auto; }
.transport-time { gap:6px!important; font-variant-numeric:tabular-nums; }.transport-time input { width:88px!important; }.transport-time span { color:var(--editor-muted); }
.scene-editor .play-button { background:var(--editor-accent)!important; color:white!important; min-width:52px; }
.record-button::before { content:''; display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:var(--editor-accent); }.record-button[aria-pressed=true]::before { background:white; }.record-status { color:var(--editor-accent); font-size:11px; }
.scene-settings { width:400px; max-width:calc(100vw - 32px); max-height:calc(100vh - 40px); box-sizing:border-box; overflow:auto; border:1px solid var(--editor-border); border-radius:16px; padding:20px; background:var(--editor-panel); color:var(--editor-text); }
.scene-settings::backdrop { background:#3b253762; }.scene-settings header { display:flex; align-items:center; justify-content:space-between; }.scene-settings h3 { margin:0; font-size:17px; }.scene-settings p { font-size:11px; color:var(--editor-muted); }.settings-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }.settings-grid label { display:flex; flex-direction:column; gap:6px; color:var(--editor-muted); }.settings-grid input[type=color] { height:34px; }.scene-settings .background-controls { border-top:1px solid var(--editor-border); margin-top:20px; padding:14px 0 0; }.scene-settings .background-controls>span:first-child { width:100%; }
@media(max-width:800px) { .record-controls { margin-left:0; } }
</style>
