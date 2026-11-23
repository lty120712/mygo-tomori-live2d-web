import { visualClips, visualLayerFilter, createImageClip, createVideoClip, isVideoClip, appendVisualClips, visualClipLimit, backgroundAtTime, backgroundClipLimit, createClipFromTemplate, createColorBackgroundClip, createImageBackgroundClip, planBackgroundAdd, migrateLegacyBackground, mediaClipPlacement, VIDEO_CLIP_LIMIT, AUDIO_TRACK_LIMIT, audioClipLimit, audioClipPlacement, audioClipTemplate, createAudioClip, createAudioClipFromTemplate, splitAudioClip } from '../mediaTracks.js'
import { createAudioScheduler } from '../audioScheduler.js'
import { sceneAudioClips } from '../sceneAudio.js'
import { normalizeBlendMode } from '../visualComposite.js'
import { VISUAL_TRACK_LIMIT, createTextClip, isImageClip,mediaDimensions } from '../mediaTracks.js'
import {normalizeMediaCrop,fitMediaToCanvas} from '../mediaCrop.js'
import {normalizeMediaAdjustments} from '../mediaAdjustments.js'
import {normalizeMediaAnimation} from '../mediaAnimation.js'
import {normalizeMediaMask} from '../mediaMask.js'
import { isTextClip, normalizeText, normalizeSpeaker, normalizeTextStyle, TEXT_CLIP_LIMIT } from '../textTracks.js'
import {ensureClipFonts} from '../textFonts.js'
import { planTextAdd,applyTextTransfer } from '../textClipPlacement.js'
import { applyTextPreset,textPreset } from '../textPresets.js'
import {patchSubtitleContent} from '../subtitleList.js'
import {selectedTextClips,textClipsOnTrack,patchTextStyles} from '../textBatchStyle.js'
import {useTextPresetLibrary} from './useTextPresetLibrary.js'
import {planTextBatch,buildTextBatch} from '../subtitleImport.js'
import { sceneSize } from '../sceneProject.js'
import { normalizeVolumeKeyframes } from '../audioVolume.js'
import { normalizeAudioFilter } from '../audioFilters.js'
import { assetStore as defaultAssetStore } from '../assetStore.js'
import { LEGACY_SCENE_KEY, localStore } from '../localStore.js'
import { createScenePersistence } from '../scenePersistence.js'
import { packProject, unpackProject, restoreBundle } from '../projectBundle.js'
import {sampleTimelinePose} from '../timelinePose.js'
import {applyCanvasSelection} from '../canvasSelection.js'
import {sceneParameterOverrides} from '../sceneParameterPriority.js'
import {expressionParameterIds,motionEffectParameterIds} from '../live2dSceneAdapter.js'
import { resetCanvasPlacement } from '../resetCanvasPlacement.js'
import { playbackFrame } from '../scenePlayback.js'
import { reorderSceneLayer,insertFrontLayer,setLayerState,canEditClips,renameSceneLayer } from '../sceneLayers.js'
import { applyClipStarts,planClipPaste,planClipSplit } from '../clipSelection.js'
import { activeEvent, planEventEdit,linkedExpressionMotion } from '../timelineEvents.js'
import { ref, reactive, shallowReactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import models from 'virtual:model-manifest'
import { useRecorder } from './useRecorder.js'
import {useExportPreferences} from './useExportPreferences.js'
import {exportRange} from '../exportRange.js'
import {editTimelineMarkers} from '../timelineMarkers.js'
import {trimProjectAtPlayhead} from '../playheadTrim.js'
import {alignProjectAtPlayhead} from '../clipAlignment.js'
import {applyTrackRipple} from '../trackRipple.js'
import { resolveParamId, normalizeParamValues } from '../params.js'
import { renderModelNow, stopModelMotion, resetModelPose } from '../live2dSceneAdapter.js'
import { sceneMouseParams } from '../sceneMouseTracking.js'
import { moveClipKey, editKeyRefs } from '../timelineKeyframes.js'
import { changeProjectFps } from '../sceneFrameRate.js'
import { createEditHistory } from '../editHistory.js'
import { createFrameTask } from '../frameTask.js'
import { createProject, createClip, readProject, clipVisible, localFrame, sampleClip, setClipKeyframe, removeClipKeyframe, splitClip, uid, syncProjectDuration, MAX_PROJECT_DURATION } from '../sceneProject.js'

export function useSceneEditor({store=localStore,assets=defaultAssetStore}={}) {
  const assetStore=assets
  let restoreOffline=null,offlineSequence=0,offlineRunning=false
  const project = reactive(createProject()), runtimes = shallowReactive({}), previewOverrides = reactive({})
  const allClips = computed(()=>visualClips(project))
  const layerFilter=()=>visualLayerFilter(allClips.value,project.backgroundClips)
  const imageLoading = ref(false), missingImages = ref([]), missingVideos = ref([]), missingBackgrounds = ref([])
  const canvasSelection=ref([])
  const selectedId = ref(''), frame = ref(0), playing = ref(false), message = ref('')
  const loopPlayback=ref(false),playingRange=ref(null)
  const paramSearch = ref(''), allParams = ref(false), autoTransform = ref(false)
  const previewProgress=ref(null)
  let previewTimer=null
  const previewMotionName=ref(''),previewExpressionName=ref(''),activePreview=ref('')
  let mousePosition=null
  const sceneTimeline=ref(null)
  const sceneCanvas = ref(null), projectInput = ref(null), backgroundInput = ref(null), backgroundLoading = ref(false), uploadingBackground = ref(false), recorder = useRecorder()
  const exportPreferences=useExportPreferences(recorder,store)
  recorder.preferences=exportPreferences
  const preparingAudio = ref(false)
  const transferringProject = ref(false)
  const locked = computed(()=>playing.value || preparingAudio.value || transferringProject.value || recorder.isPreparing.value || recorder.isRecording.value || recorder.isExporting.value)
  watch(recorder.error,value=>{if(value)message.value=value})
  const time = computed(()=>frame.value/project.fps)
  const selected = computed(()=>allClips.value.find(c=>c.id===selectedId.value))
  const textSelection=computed(()=>selectedTextClips(allClips.value,canvasSelection.value,selectedId.value))
  const textInspectorClip=computed(()=>isTextClip(selected.value) ? selected.value : textSelection.value[0])
  const textPresets=useTextPresetLibrary(store)
  watch(textPresets.error,value=>{if(value)message.value=value})
  async function saveTextPreset(name){
    if(locked.value || !textInspectorClip.value)return false
    const ok=await textPresets.save(name,textInspectorClip.value.textStyle)
    if(ok)message.value='文字样式已保存，可在素材库和文字属性中复用'
    return ok
  }
  function selectTrackText(){
    if(locked.value || !textInspectorClip.value)return
    const clips=textClipsOnTrack(allClips.value,textInspectorClip.value.track)
    history.end();selectCanvas(clips.map(c=>c.id),textInspectorClip.value.id)
  }
  const editLocked = computed(()=>locked.value || !!selected.value?.layerLocked)
  const runtime = computed(()=>runtimes[selectedId.value])
  const previewMotionInfo=computed(()=>runtime.value?.info[previewMotionName.value])
  const loading = computed(()=>backgroundLoading.value || uploadingBackground.value || imageLoading.value || project.clips.some(c=>!runtimes[c.id]))
  const missingMedia=computed(()=>[...missingImages.value.map(c=>c.name),...missingVideos.value.map(c=>c.name),...missingBackgrounds.value.map(c=>c.name),...missingAudio.value.map(c=>c.name)].join('、'))
  const canSplit = computed(()=>selected.value && time.value>selected.value.start && time.value<selected.value.start+selected.value.duration)
  function sampleState(clip) {
    const state = sampleClip(clip,time.value,project.fps,runtimes[clip.id]?.groups || [])
    const override = previewOverrides[clip.id]
    if (override?.frame === frame.value) Object.assign(state.params,override.values)
    return state
  }
  const selectedPose = computed(()=>selected.value ? sampleState(selected.value) : {params:{},transform:{}})
  const paramLabels = computed(()=>Object.fromEntries([['@x','位置 X'],['@y','位置 Y'],['@scale','等比缩放'],['@scaleX','缩放 X'],['@scaleY','缩放 Y'],['@rotation','旋转'],['@opacity','不透明度'],...(runtime.value?.groups || []).flatMap(g=>g.params.map(p=>[p.key,p.label]))]))
  const visibleParams = computed(()=> {
    const query=paramSearch.value.trim().toLowerCase()
    return (runtime.value?.groups || []).flatMap(g=>g.params).filter(p=>query ? (p.label+' '+p.key).toLowerCase().includes(query) : allParams.value || p.common)
  })
  const transformFields = [{key:'x',label:'位置 X',min:-1920,max:1920,step:1},{key:'y',label:'位置 Y',min:-1080,max:1080,step:1},{key:'scale',label:'等比缩放',min:.1,max:5,step:.01},{key:'scaleX',label:'缩放 X',min:.1,max:5,step:.01},{key:'scaleY',label:'缩放 Y',min:.1,max:5,step:.01},{key:'rotation',label:'旋转',min:-180,max:180,step:1},{key:'opacity',label:'不透明度',min:0,max:1,step:.01}]
  const snapshot = value => JSON.parse(JSON.stringify(value))
  const historyRevision = ref(0)
  const history = createEditHistory({
    capture: () => snapshot({project, overrides:previewOverrides, selectedId:selectedId.value, canvasSelection:canvasSelection.value, frame:frame.value}),
    // Keep the timeline scale stable until a drag ends, then record its final range with the edit.
    finalize: () => {
      const last=Math.round(syncProjectDuration(project)*project.fps)
      if(frame.value>last)frame.value=last
    },
    restore: state => {
      clearLivePreview()
      Object.assign(project,snapshot(state.project));clearPreviewOverrides()
      Object.assign(previewOverrides,snapshot(state.overrides))
      canvasSelection.value=(state.canvasSelection || [state.selectedId]).filter(id=>allClips.value.some(c=>c.id===id))
      selectedId.value=allClips.value.some(c=>c.id===state.selectedId) ? state.selectedId : allClips.value[0]?.id || ''
      frame.value=Math.min(state.frame,Math.round(project.duration*project.fps));drive()
    },
    changed: () => historyRevision.value++,
  })
  const canUndo = computed(()=>{historyRevision.value;return !locked.value && history.canUndo})
  const canRedo = computed(()=>{historyRevision.value;return !locked.value && history.canRedo})
  const beginEdit = () => {if(!locked.value)history.begin()}
  const endEdit = () => history.end()
  const undo = () => {if(!locked.value)history.undo()}
  const redo = () => {if(!locked.value)history.redo()}
  const editable = (fn, merge=false) => (...args) => {
    if(locked.value)return
    const selectedEdits=[editText,renameClip,changeMouseTrack,addChosenEvent,editTiming,editTransform,resetPlacement,editParam,resetParam,toggleKey,removeKey,moveKey,editKeyValue,editEvent,pasteEvent,removeEvent,duplicate,split,deleteSelected,addEvent]
    let ids=[]
    if(selectedEdits.includes(fn) && selected.value)ids=[selected.value.id]
    if(fn===fitSelectedMedia && selected.value)ids=[selected.value.id]
    if(fn===editText && args[0]?.textStyle)ids=textSelection.value.map(c=>c.id)
    if([editClip,moveModel,transformModel].includes(fn))ids=[args[0]]
    if(fn===editSubtitle)ids=[args[0]]
    if(fn===resizeCanvasText)ids=[args[0]]
    if(fn===applySubtitleStyle)ids=args[0].filter(id=>allClips.value.some(c=>c.id===id && isTextClip(c)))
    if(fn===batchCanvasTransform)ids=args[0].map(e=>e.id)
    if(fn===batchKeys)ids=(args[1]?.type==='paste' ? args[1].entries : args[0]).map(item=>item.clipId)
    if(fn===batchClips && args[0].type!=='paste')ids=args[0].type==='move' ? args[0].entries.map(e=>e.id) : args[0].ids
    if([renameLayer,reorderLayer].includes(fn))ids=allClips.value.filter(c=>c.track===args[0]).map(c=>c.id)
    if(!canEditClips(allClips.value,ids)){message.value='图层已锁定，请先解锁后编辑';return}
if(fn===fitSelectedMedia || fn===editMarkers || fn===trimAtPlayhead || fn===alignAtPlayhead || fn===rippleTrack)history.end()
    if(fn===applySubtitleStyle)history.end()
    if(fn===addTextBatch || fn===resetPlacement || fn===changeLayerState || fn===changeBackgroundTrackState || fn===changeAudioTrackState || (fn===renameLayer && args[2]!==true) || fn===reorderLayer || (fn===batchClips && args[0].type!=='move') || (fn===batchKeys && args[1].type!=='move'))history.end()
    clearLivePreview()
    return history.edit(()=>fn(...args),merge ? fn.name+':'+selectedId.value+':'+frame.value+':'+(args[0]?.key ?? args[0]) : undefined)
  }
  function changeAspectRatio(value){if(['16:9','9:16'].includes(value))project.aspectRatio=value}
  function editMarkers(request){
    try{project.markers=editTimelineMarkers(project.markers,request,{duration:project.duration,fps:project.fps})}
    catch(error){message.value=error.message}
  }
  function trimAtPlayhead(request){
    const plan=trimProjectAtPlayhead(project,{...request,time:time.value})
    if(plan.error){message.value=plan.error;return false}
    message.value='已修剪 '+plan.entries.length+' 个片段，保留播放头'+(request.side==='left' ? '右侧' : '左侧')
    drive()
    return true
  }
  function alignAtPlayhead(request){
    const plan=alignProjectAtPlayhead(project,{...request,time:time.value})
    if(plan.error){message.value=plan.error;return false}
    if(plan.aligned){message.value='所选片段已对齐';return false}
    message.value='已将 '+plan.entries.length+' 个片段的整组'+(request.edge==='end' ? '终点' : '起点')+'对齐播放头'
    drive()
    return true
  }
  function rippleTrack(request){
    const result=applyTrackRipple(project,request)
    if(result.error){message.value=result.error;return false}
    if(request.kind==='visual' && result.removeId){
      canvasSelection.value=canvasSelection.value.filter(id=>id!==result.removeId)
      if(selectedId.value===result.removeId)selectedId.value=canvasSelection.value.at(-1) || ''
    }
    message.value=request.mode==='gap' ? '已关闭前方空隙，本轨 '+result.entries.length+' 个片段左移' :
      result.entries.length ? '已删除片段，本轨 '+result.entries.length+' 个后续片段左移' : '已删除片段，本轨没有后续片段'
    return true
  }
  function renameClip(value){if(selected.value)selected.value.name=value}
  function changeMouseTrack(enabled){if(selected.value)selected.value.mouseTrack=enabled}
  function clearLivePreview() {
    clearInterval(previewTimer);previewTimer=null;previewProgress.value=null
    let cleared=false
    for(const r of Object.values(runtimes))if(r.livePreview){r.livePreview=false;resetModelPose(r.sdk);r.expression='';cleared=true}
    activePreview.value=''
    if(cleared)drive()
  }
  function endPreview(){if(locked.value)return;clearLivePreview();drive()}
  function resetPreview(type) {
    if(editLocked.value || !runtime.value || !selected.value || !clipVisible(selected.value,time.value))return
    const r=runtime.value
    clearInterval(previewTimer);previewTimer=null;previewProgress.value=null
    r.livePreview=true
    r.sdk.setParams(sceneMouseParams(selected.value,mousePosition,selectedPose.value.transform,r.groups))
    if(type==='motion') {
      resetModelPose(r.sdk)
      // 素材中名为 idle 的动作也有自己的姿态曲线，并非模型创建时的默认姿态。
      // 只恢复原生默认值；SDK 自身的默认待机机制与新建模型保持一致。
      previewMotionName.value='';activePreview.value='动作已重置为模型初始状态'
    } else {
      const neutral=r.expressions.find(name=>/^(default|idle|exp_idle01\.exp3)$/i.test(name)) || r.expressions.find(name=>/^idle01(?:\.exp\.json)?$/i.test(name))
      if(neutral){r.sdk.setExpression(neutral);r.expression=neutral}
      previewExpressionName.value='';activePreview.value='表情已重置为默认'
    }
    renderModelNow(r.sdk)
  }
  function preview(type,name) {
    if(editLocked.value || !runtime.value || !selected.value || !clipVisible(selected.value,time.value) || !name)return
    clearLivePreview()
    const r=runtime.value
    r.livePreview=true;activePreview.value=type==='motion' ? '正在预览动作：'+name : '正在预览表情：'+name
    r.sdk.setParams(sceneMouseParams(selected.value,mousePosition,selectedPose.value.transform,r.groups))
    if(type==='motion') {
      r.sdk.playMotion(name,undefined,3)
      const seconds=r.info[name]?.seconds
      if(seconds){const started=performance.now();previewProgress.value={duration:seconds,elapsed:0};previewTimer=setInterval(()=>{const elapsed=Math.min(seconds,(performance.now()-started)/1000);previewProgress.value={duration:seconds,elapsed};if(elapsed>=seconds){clearLivePreview();drive();activePreview.value='动作预览已结束：'+name}},50)}
      const target=name.replace(/^mtn_/i,'').replace(/_[clr]$/i,'')
      const paired=r.expressions.find(e=>e.replace(/^exp_/i,'').replace(/\.exp3?$/i,'')===target)
      if(paired && !r.info[name]?.carriesExpression){r.sdk.setExpression(paired);r.expression=paired}
    }else {r.sdk.setExpression(name);r.expression=name}
    renderModelNow(r.sdk)
  }
  function addChosenEvent(type,name){if(name)addEvent(type,{target:{value:name}})}
  const mouseFrame=createFrameTask(()=>{if(!playing.value && !offlineRunning)drive(true)})
  function mouseMoved(position){
    if(mousePosition?.x===position?.x && mousePosition?.y===position?.y)return
    mousePosition=position
    if(!playing.value && !offlineRunning)mouseFrame.schedule()
  }
  function changeBackground(value){project.background=value}
  function removeBackgroundImage(){project.backgroundImage='';project.backgroundImageName=''}
  function resetBackground(){removeBackgroundImage();project.background='#00b140'}
  let backgroundRequest=0
  async function uploadBackground(event) {
    const file=event.target.files?.[0];event.target.value=''
    if(!file || locked.value)return
    const request=++backgroundRequest
    uploadingBackground.value=true
    let bitmap
    try {
      if(!file.type.startsWith('image/'))throw new Error('请选择图片文件')
      bitmap=await createImageBitmap(file)
      const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height))
      const canvas=document.createElement('canvas')
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height)
      const image=canvas.toDataURL('image/webp',.9)
      if(image.length>4_000_000)throw new Error('图片过大，请选择尺寸更小的图片')
      if(request!==backgroundRequest || locked.value)return
      history.end();history.edit(()=>{project.backgroundImage=image;project.backgroundImageName=file.name})
      message.value='已上传背景图片'
    }catch(error){if(request===backgroundRequest)message.value='背景上传失败：'+error.message}
    finally{bitmap?.close();if(request===backgroundRequest)uploadingBackground.value=false}
  }
  watch(()=>project.backgroundImage,value=>{backgroundLoading.value=!!value},{flush:'sync'})
  function shortcut(event) {
    if(recorder.isPreparing.value || recorder.isRecording.value || recorder.isExporting.value)return
    if(event.defaultPrevented || event.isComposing || event.target?.closest?.('input,textarea,select,[contenteditable]'))return
    if(event.key==='Escape'){sceneTimeline.value?.clearSelection();selectCanvas([]);event.preventDefault();return}
    if(sceneTimeline.value?.modelShortcut(event))return
    if(event.key==='Delete' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if(!canvasSelection.value.length || locked.value)return
      event.preventDefault()
      if(event.repeat)return
      history.end();editable(batchClips)({type:'delete',ids:[...canvasSelection.value]})
      return
    }
    if(event.code==='Space' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      if(event.target?.closest?.('button,a[href],summary,[role="button"],dialog'))return
      event.preventDefault()
      if(event.repeat || loading.value || recorder.isRecording.value)return
      history.end();playing.value ? pause() : play()
      return
    }
    if(!(event.ctrlKey || event.metaKey) || event.altKey)return
    const key=event.key.toLowerCase()
    if(key==='z' || key==='y') {event.preventDefault();if(key==='y' || event.shiftKey)redo();else undo()}
  }
  const selectedFrame = () => localFrame(selected.value,time.value,project.fps)
  const hasKey = key => !!selected.value?.keyframes[key]?.some(k=>k.frame===selectedFrame())
  const insertionStart=()=>Math.min(time.value,MAX_PROJECT_DURATION-1/project.fps)
  function addModel(model) {
    if(locked.value)return
    if(project.clips.length>=16){message.value='单个工程最多 16 个模型片段';return}
    const start=insertionStart()
    const clip=createClip(model,start,Math.min(5,MAX_PROJECT_DURATION-start),insertFrontLayer(allClips.value))
    clip.transform.x=allClips.value.length%2 ? 190 : -190
    project.clips.push(clip);selectCanvas([clip.id],clip.id)
  }
  function addText(presetId='basic'){
    if(project.imageClips.filter(isTextClip).length>=TEXT_CLIP_LIMIT){message.value=`单个工程最多 ${TEXT_CLIP_LIMIT} 个文字片段`;return}
    const placement=planTextAdd(allClips.value,time.value,{duration:MAX_PROJECT_DURATION,fps:project.fps,selectedTrack:selected.value?.track})
    if(placement.error){message.value=placement.error;return}
    const clip=createTextClip(placement.start,placement.duration,placement.track ?? insertFrontLayer(allClips.value))
    applyTextPreset(clip,presetId,sceneSize(project.aspectRatio),textPresets.presets.value)
    if(placement.layer)Object.assign(clip,placement.layer)
    project.imageClips.push(clip);selectCanvas([clip.id],clip.id);syncProjectDuration(project);seek(clip.start)
  }
  function editText(patch){
    const clip=textInspectorClip.value
    if(!isTextClip(clip) || clip.layerLocked)return
    if(textSelection.value.length<=1){
      if('text' in patch)clip.text=normalizeText(patch.text)
      if('speaker' in patch)clip.speaker=normalizeSpeaker(patch.speaker)
    }
    if(patch.textStyle)patchTextStyles(textSelection.value,patch.textStyle)
  }
  function editSubtitle(id,patch){
    return patchSubtitleContent(allClips.value.find(c=>c.id===id),patch)
  }
  function resizeCanvasText(id,patch){
    const clip=allClips.value.find(c=>c.id===id)
    if(!isTextClip(clip) || clip.layerLocked || ![patch.width,patch.x,patch.y].every(Number.isFinite))return
    const current=sampleClip(clip,time.value,project.fps).transform
    const position=Object.fromEntries(['x','y'].filter(key=>Math.abs(patch[key]-current[key])>1e-7).map(key=>[key,patch[key]]))
    if(patch.width===clip.textStyle.width && !Object.keys(position).length)return
    patchTextStyles([clip],{width:patch.width})
    if(Object.keys(position).length)transformModel(id,position)
  }
  function activateSubtitle(id){
    if(locked.value)return
    const clip=allClips.value.find(c=>c.id===id && isTextClip(c));if(!clip)return
    history.end();selectCanvas([clip.id],clip.id);seek(clip.start)
  }
  function applySubtitleStyle(ids,presetId){
    const targets=selectedTextClips(allClips.value,ids)
    if(!targets.length)return
    const preset=textPreset(presetId,textPresets.presets.value)
    patchTextStyles(targets,normalizeTextStyle(preset.style))
    message.value=`已为 ${targets.length} 条字幕套用「${preset.name}」，可一步撤销`
  }
  function addTextBatch({cues,presetId='subtitle'}){
    if(presetId==='current' && !isTextClip(selected.value)){message.value='请先选中需要沿用样式的文字片段';return false}
    const plan=planTextBatch(allClips.value,cues,{duration:project.duration,fps:project.fps,selectedTrack:selected.value?.track})
    if(plan.error){message.value=plan.error;return false}
    const added=buildTextBatch(plan,{presetId,template:presetId==='current' ? selected.value : null,canvas:sceneSize(project.aspectRatio),customPresets:textPresets.presets.value})
    for(const clip of allClips.value)clip.track+=plan.shift
    project.imageClips.push(...added);syncProjectDuration(project)
    selectCanvas([added[0].id],added[0].id);seek(added[0].start)
    message.value=`已添加 ${added.length} 条文字，新增 ${plan.newTracks} 条轨道；可一步撤销`
    return true
  }
  function addImage(asset) {
    if(asset.kind!=='image' || !asset.width || !asset.height){message.value='图片无法解码，请重新导入有效图片';return}
    if(project.imageClips.filter(isImageClip).length>=64){message.value='单个工程最多 64 个图片片段';return}
    const start=insertionStart()
    const clip=createImageClip(asset,start,Math.min(5,MAX_PROJECT_DURATION-start),insertFrontLayer(allClips.value))
    project.imageClips.push(clip);selectCanvas([clip.id],clip.id)
  }
  /**
   * 视频片段默认取素材本身的长度；素材比工程剩余时长长时把工程补足到片段结尾（同音频的规则）。
   * 画面与可解码的原声按素材内时间同步，原声进入统一混音。
   */
  function addVideo(asset) {
    if(asset.kind!=='video' || !asset.width || !asset.height || !(asset.duration>0)){message.value='视频无法解码，请重新导入有效视频';return}
    if(project.imageClips.filter(isVideoClip).length>=VIDEO_CLIP_LIMIT){message.value='单个工程最多 32 个视频片段';return}
    const start=insertionStart()
    const placement=mediaClipPlacement(asset.duration,start,project.duration,project.fps)
    const clip=createVideoClip(asset,start,placement.duration,insertFrontLayer(allClips.value))
    project.imageClips.push(clip);selectCanvas([clip.id],clip.id)
    if(placement.projectDuration>project.duration){
      message.value='已在播放头添加视频片段：'+clip.name+'；工程时长已延长到 '+placement.projectDuration.toFixed(1)+' 秒'
    }else message.value='已在播放头添加视频片段：'+clip.name+(placement.truncated ? '；素材超过 600 秒上限，已截断到工程结尾' : '')
  }
  function imageStatus(status){imageLoading.value=status.loading;missingImages.value=status.missing;missingVideos.value=status.videos || [];missingBackgrounds.value=status.backgrounds || []}
  // legacy base64 背景图只在这里准备素材，工程改动留给 history.edit，保证迁移与本次编辑同一步撤销。
  async function prepareLegacyBackground(){
    if(!project.backgroundImage)return null
    const blob=await (await fetch(project.backgroundImage)).blob()
    return assetStore.importFile(new File([blob],project.backgroundImageName || '旧背景.png',{type:blob.type || 'image/png'}))
  }
  async function withBackgroundEdit(mutate){
    if(locked.value)return
    let asset=null
    if(project.backgroundImage)try{asset=await prepareLegacyBackground()}catch(error){message.value='背景图片迁移失败：'+error.message}
    if(locked.value)return
    // 不在这里 history.end()：拖动期间时间线已经用 begin-edit 打开手势，
    // 连续的位置更新应该并进同一步撤销，只有松手（end-edit）才落一次记录。
    // 迁移素材在校验之前就准备好了：编辑被拒绝时把它删掉，避免留下没人引用的重复素材。
    history.edit(()=>{const applied=mutate(asset)!==false;if(!applied && asset)assetStore.remove(asset.id).catch(()=>{})})
  }
  function placeBackgroundClip(clip,legacyAsset,preferred=5){
    const limit=backgroundClipLimit(project.backgroundClips)
    if(limit){message.value=limit;return false}
    const plan=planBackgroundAdd(project.backgroundClips,clip,{duration:MAX_PROJECT_DURATION,fps:project.fps,preferred})
    if(plan.error){message.value=plan.error;return false}
    // 迁移出来的旧背景图只填补空档，因此第一次添加不会撞上自己。
    if(legacyAsset)migrateLegacyBackground(project,legacyAsset,plan.clip)
    project.backgroundClips.push(plan.clip)
    const shortened=preferred-plan.clip.duration>1e-6
    message.value=(plan.clip.kind==='color' ? '已在播放头添加纯色背景片段' : '已在播放头添加背景图片片段：'+plan.clip.name)
      +(shortened ? '（剩余空间不足，已缩短为 '+plan.clip.duration.toFixed(2)+' 秒）' : '')
    return true
  }
  const addBackgroundColor=color=>withBackgroundEdit(legacy=>placeBackgroundClip(createColorBackgroundClip(color,insertionStart(),5),legacy))
  const addBackgroundImage=asset=>withBackgroundEdit(legacy=>placeBackgroundClip(createImageBackgroundClip(asset,insertionStart(),5),legacy))
  const pasteBackgroundClip=template=>withBackgroundEdit(legacy=>placeBackgroundClip(createClipFromTemplate(template,insertionStart()),legacy,template.duration || 5))
  function editBackground(id,patch){
    const clip=project.backgroundClips.find(c=>c.id===id);if(!clip)return false
    if('mask' in patch){clip.mask=normalizeMediaMask(patch.mask);return true}
    if(patch.color!==undefined){if(clip.kind==='color' && /^#[0-9a-f]{6}$/i.test(patch.color))clip.color=patch.color;return}
    const min=1/project.fps,round=value=>Math.round(value*project.fps)/project.fps
    const start=round(Math.max(0,Math.min(MAX_PROJECT_DURATION-min,patch.start ?? clip.start)))
    const length=round(Math.max(min,Math.min(MAX_PROJECT_DURATION-start,patch.duration ?? clip.duration)))
    if(start+length>MAX_PROJECT_DURATION+1e-8){message.value='背景片段不能超出工程时长上限';return false}
    if(project.backgroundClips.some(c=>c.id!==id && start<c.start+c.duration-1e-8 && start+length>c.start+1e-8)){message.value='背景片段不能重叠；请先调整相邻片段';return false}
    clip.start=start;clip.duration=length
    return true
  }
  // 取色器连续触发 input，交给 history 的手势合并成一步撤销（菜单里用 begin-edit / end-edit 包住）。
  const editBackgroundAction=(id,patch)=>{
    if(locked.value)return
    if(patch.color!==undefined || patch.mask!==undefined){history.edit(()=>editBackground(id,patch));return}
    return withBackgroundEdit(()=>editBackground(id,patch))
  }
  const deleteBackgroundAction=id=>withBackgroundEdit(()=>{project.backgroundClips=project.backgroundClips.filter(c=>c.id!==id)})
  const splitBackgroundAction=id=>withBackgroundEdit(()=>{
    const clip=project.backgroundClips.find(c=>c.id===id);if(!clip)return false
    const limit=backgroundClipLimit(project.backgroundClips)
    if(limit){message.value=limit;return false}
    const at=Math.round(time.value*project.fps)/project.fps
    const right=splitClip(clip,at)
    if(!right){message.value='播放头需要位于背景片段内部才能切割';return false}
    project.backgroundClips.push(right)
    message.value='已在播放头切割背景片段'
    return true
  })
  // ——— 音频轨道 ———
  const audio=createAudioScheduler({lookahead:0,loadFile:id=>assetStore.blob(id)})
  const audioAssetIds=ref(null)
  const missingAudio=computed(()=>audioAssetIds.value ? project.audioClips.filter(c=>!audioAssetIds.value.has(c.assetId)) : [])
  async function refreshAudioAssets(){
    try{ audioAssetIds.value=new Set((await assetStore.list()).filter(asset=>asset.kind==='audio').map(asset=>asset.id)) }
    catch{ audioAssetIds.value=null }
  }
  const mixedAudioClips=computed(()=>sceneAudioClips(project))
  watch(mixedAudioClips,clips=>audio.setClips(clips),{deep:true,immediate:true})
  const audioStart=()=>Math.round(insertionStart()*project.fps)/project.fps
  const audioTrack=value=>Math.max(0,Math.min(AUDIO_TRACK_LIMIT-1,Number(value)||0))
  function audioTrackFree(track,start,duration,exceptId=''){return !project.audioClips.some(c=>c.id!==exceptId && c.track===track && start<c.start+c.duration-1e-8 && start+duration>c.start+1e-8)}
  function firstFreeAudioTrack(start,duration,preferred=0){
    for(const track of [audioTrack(preferred),...Array.from({length:AUDIO_TRACK_LIMIT},(_,index)=>index)]) if(audioTrackFree(track,start,duration)) return track
    return -1
  }
  function placeAudioClip(clip){
    const limit=audioClipLimit(project.audioClips)
    if(limit){message.value=limit;return false}
    if(!audioTrackFree(clip.track,clip.start,clip.duration)){message.value='音频轨道 '+(clip.track+1)+' 在这个时间段已有片段；请换一条轨道或调整时长';return false}
    project.audioClips.push(clip)
    message.value='已在音频轨道 '+(clip.track+1)+' 添加片段：'+clip.name
    return true
  }
  function addAudioClip(asset,track=0){
    const start=audioStart()
    const placement=audioClipPlacement(asset.duration,start,project.duration,project.fps)
    refreshAudioAssets()
    const added=placeAudioClip(createAudioClip(asset,start,placement.duration,audioTrack(track)))
    // 长音频进入时把工程补足到片段结尾（同一步撤销），避免被截成工程剩余时长。
    if(added && placement.projectDuration>project.duration){
      message.value+='；工程时长已延长到 '+placement.projectDuration.toFixed(1)+' 秒'
    }else if(added && placement.truncated){
      message.value+='；素材超过 600 秒上限，已截断到工程结尾'
    }
    return added
  }
  function editAudioClip(id,patch){
    const clip=project.audioClips.find(c=>c.id===id);if(!clip)return false
    const min=1/project.fps,round=value=>Math.round(value*project.fps)/project.fps
    const next={...clip,...patch}
    next.start=round(Math.max(0,Math.min(MAX_PROJECT_DURATION-min,Number(next.start)||0)))
    next.duration=round(Math.max(min,Math.min(MAX_PROJECT_DURATION-next.start,Number(next.duration)||min)))
    next.offset=Math.max(0,Number(next.offset)||0)
    next.volume=Math.max(0,Math.min(1,next.volume ?? 1))
    next.fadeIn=Math.max(0,Math.min(next.duration,next.fadeIn || 0))
    next.fadeOut=Math.max(0,Math.min(next.duration,next.fadeOut || 0))
    next.filter=normalizeAudioFilter(next.filter)
    next.volumeKeyframes=normalizeVolumeKeyframes(next.volumeKeyframes)
    if(!audioTrackFree(next.track,next.start,next.duration,id)){message.value='音频轨道 '+(next.track+1)+' 在这个时间段已有片段；请换一条轨道或调整时长';return false}
    Object.assign(clip,{start:next.start,duration:next.duration,offset:next.offset,volume:next.volume,fadeIn:next.fadeIn,fadeOut:next.fadeOut,filter:next.filter,volumeKeyframes:next.volumeKeyframes})
    return true
  }
  function pasteAudioClip(template){
    const limit=audioClipLimit(project.audioClips)
    if(limit){message.value=limit;return false}
    const start=audioStart(),length=Math.max(1/project.fps,Math.min(template.duration || 5,MAX_PROJECT_DURATION-start))
    const track=firstFreeAudioTrack(start,length,template.track || 0)
    if(track<0){message.value='没有空闲的音频轨道可以粘贴，请先调整现有片段';return false}
    refreshAudioAssets()
    return placeAudioClip(createAudioClipFromTemplate(template,start,length,track))
  }
  function deleteAudioClip(id){project.audioClips=project.audioClips.filter(c=>c.id!==id)}
  function splitAudioAtPlayhead(id){
    const clip=project.audioClips.find(c=>c.id===id);if(!clip)return false
    const limit=audioClipLimit(project.audioClips)
    if(limit){message.value=limit;return false}
    const at=Math.round(time.value*project.fps)/project.fps
    const right=splitAudioClip(clip,at)
    if(!right){message.value='播放头需要位于音频片段内部才能切割';return false}
    project.audioClips.push(right)
    message.value='已在播放头切割音频片段'
    return true
  }
  const addAudioAction=(asset,track)=>withAudioEdit(()=>addAudioClip(asset,track))
  const editAudioAction=(id,patch)=>withAudioEdit(()=>editAudioClip(id,patch))
  const deleteAudioAction=id=>withAudioEdit(()=>deleteAudioClip(id))
  const splitAudioAction=id=>withAudioEdit(()=>splitAudioAtPlayhead(id))
  const pasteAudioAction=template=>withAudioEdit(()=>pasteAudioClip(template))
  // 与背景轨道一致：不在这里 history.end()，拖动期间时间线已打开手势，松手才落一条记录。
  function withAudioEdit(mutate){if(locked.value)return;return history.edit(mutate)}
  function renameLayer(track,value){renameSceneLayer(allClips.value,track,value)}
  function changeLayerState(track,patch){setLayerState(allClips.value,track,patch);drive()}
  function changeBackgroundTrackState(patch){
    for(const clip of project.backgroundClips){
      if(typeof patch.layerHidden==='boolean')clip.layerHidden=patch.layerHidden
      if(typeof patch.layerSolo==='boolean')clip.layerSolo=patch.layerSolo
    }
    drive()
  }
  function changeAudioTrackState(track,patch){
    const index=audioTrack(track)
    const current=project.audioTrackState[index] || {}
    project.audioTrackState[index]={ muted:patch.muted ?? current.muted ?? false, solo:patch.solo ?? current.solo ?? false }
    drive()
  }
  function reorderLayer(from,to){reorderSceneLayer(allClips.value,from,to)}
  function batchClips(action){
    if(action.type==='transfer-text'){
      const plan=applyTextTransfer(allClips.value,action,{duration:MAX_PROJECT_DURATION,fps:project.fps})
      if(plan.error)message.value=plan.error
      return
    }
    if(action.type==='move'){if(!applyClipStarts(allClips.value,action.entries,MAX_PROJECT_DURATION,project.fps))message.value='整组移动不能越界或与同轨道片段重叠'}
    else if(action.type==='delete'){const ids=new Set(action.ids);project.clips=project.clips.filter(c=>!ids.has(c.id));project.imageClips=project.imageClips.filter(c=>!ids.has(c.id));canvasSelection.value=canvasSelection.value.filter(id=>!ids.has(id));if(ids.has(selectedId.value))selectedId.value=canvasSelection.value.at(-1) || ''}
    else if(action.type==='split'){
      const plan=planClipSplit(allClips.value,action.ids,time.value)
      if(plan.error){message.value=plan.error;return}
      for(const left of plan.left){
        const original=allClips.value.find(c=>c.id===left.id)
        original.duration=left.duration
        if(isTextClip(left))original.textAnimationEnd=left.textAnimationEnd
      }
      appendVisualClips(project,plan.right);selectCanvas(plan.right.map(c=>c.id),plan.right[0].id)
    }
    else if(action.type==='paste'){
      const plan=planClipPaste(allClips.value,action.clipboard,time.value,MAX_PROJECT_DURATION,project.fps)
      if(plan.error){message.value=plan.error;return}
      for(const c of allClips.value)c.track=plan.tracks.find(t=>t.track===c.track).to
      appendVisualClips(project,plan.clips);selectCanvas(plan.clips.map(c=>c.id),plan.clips[0].id)
    }
  }
  function editClip(id,patch) {
    if(locked.value)return
    const clip=allClips.value.find(c=>c.id===id);if(!clip || clip.layerLocked)return
    if(['start','duration','offset','track'].some(key=>Object.hasOwn(patch,key))){
      const merged={...clip,...patch},min=1/project.fps
      if(![merged.start,merged.duration,merged.offset,merged.track].every(Number.isFinite))return
      merged.start=Math.round(Math.max(0,Math.min(MAX_PROJECT_DURATION-min,merged.start))*project.fps)/project.fps
      merged.duration=Math.max(min,Math.min(MAX_PROJECT_DURATION-merged.start,merged.duration))
      merged.offset=Math.max(0,merged.offset);merged.track=Math.round(Math.max(0,Math.min(VISUAL_TRACK_LIMIT-1,merged.track)))
      if(allClips.value.some(c=>c.id!==id && c.track===merged.track && merged.start<c.start+c.duration-1e-8 && merged.start+merged.duration>c.start+1e-8)) {
        message.value='同一轨道的片段不能重叠；同屏素材请放在不同轨道';return
      }
      if(merged.track!==clip.track){const target=allClips.value.find(c=>c.id!==id && c.track===merged.track);if(target?.layerLocked){message.value='目标图层已锁定';return}if(target){clip.layerName=target.layerName || target.name;clip.layerLocked=!!target.layerLocked;clip.layerHidden=!!target.layerHidden}}
      Object.assign(clip,{start:merged.start,duration:merged.duration,offset:merged.offset,track:merged.track})
    }
    if('blendMode' in patch)clip.blendMode=normalizeBlendMode(patch.blendMode)
    if('crop' in patch && (isImageClip(clip) || isVideoClip(clip)))clip.crop=normalizeMediaCrop(patch.crop)
    if('mask' in patch)clip.mask=normalizeMediaMask(patch.mask)
    if('adjustments' in patch && (isImageClip(clip) || isVideoClip(clip)))clip.adjustments=normalizeMediaAdjustments(patch.adjustments)
    if('animation' in patch && (isImageClip(clip) || isVideoClip(clip)))clip.animation=normalizeMediaAnimation(patch.animation)
    if(isImageClip(clip) || isVideoClip(clip))for(const key of ['flipX','flipY'])if(key in patch)clip[key]=patch[key]===true
    if(isVideoClip(clip)){
      if('videoMuted' in patch)clip.videoMuted=patch.videoMuted===true
      if('videoVolume' in patch && Number.isFinite(patch.videoVolume))clip.videoVolume=Math.max(0,Math.min(1,patch.videoVolume))
    }
  }
  const editTiming = (key,value) => editClip(selectedId.value,{[key]:Number(value)})
  function fitSelectedMedia(mode){
    const clip=selected.value
    if(!(isImageClip(clip) || isVideoClip(clip)) || !clipVisible(clip,time.value))return
    const plan=fitMediaToCanvas(mediaDimensions(clip),sceneSize(project.aspectRatio),mode)
    if(plan.error){message.value=plan.error;return}
    if(!applyCanvasSelection(allClips.value,[{id:clip.id,patch:plan.patch}],time.value,project.fps,autoTransform.value))message.value='无法适应画布，请检查图层状态'
  }
  function editTransform(key,value) {
    if(locked.value || !selected.value)return
    const field=transformFields.find(f=>f.key===key),n=Number(value)
    if(!field || !Number.isFinite(n))return
    const v=Math.max(field.min,Math.min(field.max,n))
    if(autoTransform.value || selected.value.keyframes['@'+key]?.length)setClipKeyframe(selected.value,'@'+key,selectedFrame(),v)
    else selected.value.transform[key]=v
  }
  function resetPlacement(){if(selected.value && clipVisible(selected.value,time.value))resetCanvasPlacement(selected.value,selectedFrame())}
  function selectCanvas(ids,primary){sceneTimeline.value?.clearDetails();selectTimeline(ids);selectedId.value=canvasSelection.value.includes(primary) ? primary : canvasSelection.value.at(-1) || ''}
  function selectTimeline(ids){history.end();canvasSelection.value=[...new Set(ids)].filter(id=>allClips.value.some(c=>c.id===id));if(canvasSelection.value.length && !canvasSelection.value.includes(selectedId.value))selectedId.value=canvasSelection.value.at(-1)}
  function batchCanvasTransform(entries){applyCanvasSelection(allClips.value,entries,time.value,project.fps,autoTransform.value)}
  watch(()=>allClips.value.map(c=>c.id),()=>{canvasSelection.value=canvasSelection.value.filter(id=>allClips.value.some(c=>c.id===id))})
  function moveModel(id,position) {selectedId.value=id;editTransform('x',position.x);editTransform('y',position.y)}
  function transformModel(id,patch){selectedId.value=id;for(const [key,value] of Object.entries(patch))editTransform(key,value)}
  function editParam(p,value) {
    if(locked.value || !selected.value)return
    const n=Number(value);if(!Number.isFinite(n))return
    if(previewOverrides[selectedId.value])delete previewOverrides[selectedId.value].values[p.key]
    setClipKeyframe(selected.value,p.key,selectedFrame(),Math.max(p.min,Math.min(p.max,n)))
  }
  function resetParam(p) {
    if(locked.value || !selected.value)return
    removeClipKeyframe(selected.value,p.key,selectedFrame())
    selected.value.params[p.key]=p.default
    const old=previewOverrides[selectedId.value]
    previewOverrides[selectedId.value]={frame:frame.value,values:{...(old?.frame===frame.value ? old.values : {}),[p.key]:p.default}}
    drive()
  }
  function toggleKey(key,value) {if(locked.value || !selected.value)return;if(hasKey(key))removeClipKeyframe(selected.value,key,selectedFrame());else setClipKeyframe(selected.value,key,selectedFrame(),value)}
  function removeKey(key,at) {if(!locked.value && selected.value)removeClipKeyframe(selected.value,key,at)}
  function moveKey(key,from,to) {if(!locked.value && selected.value)moveClipKey(selected.value,key,from,to,project.fps)}
  function batchKeys(items,action) {
    if(locked.value)return
    if(Number.isFinite(action.value)) {
      const item=items[0],r=runtimes[item?.clipId]
      const field=item?.key.startsWith('@') ? transformFields.find(f=>f.key===item.key.slice(1)) : r?.groups.flatMap(g=>g.params).find(p=>p.key===item.key)
      if(!field || items.length!==1)return
      action={...action,value:Math.max(field.min,Math.min(field.max,action.value))}
    }
    editKeyRefs(allClips.value,items,action,project.fps)
  }
  function editKeyValue(key,value) {
    if(locked.value || !selected.value || !clipVisible(selected.value,time.value))return
    const field=key.startsWith('@') ? transformFields.find(f=>f.key===key.slice(1)) : runtime.value?.groups.flatMap(g=>g.params).find(p=>p.key===key)
    const n=Number(value);if(!field || !Number.isFinite(n))return
    setClipKeyframe(selected.value,key,selectedFrame(),Math.max(field.min,Math.min(field.max,n)))
  }
  function editEvent(id,patch) {const clip=selected.value,event=clip?.events.find(e=>e.id===id);if(!event)return;const plan=planEventEdit(clip,event,patch,project.fps);if(plan.error){message.value=plan.error;return}if(event.type==='expression')clip.events=clip.events.filter(e=>e===event || e.type!=='expression' || e.frame!==plan.patch.frame);if(event.type==='motion'){for(const paired of clip.events.filter(e=>linkedExpressionMotion(clip,e)===event))paired.frame=plan.patch.frame}else if(event.type==='expression')event.motionLinked=false;Object.assign(event,plan.patch);clip.events.sort((a,b)=>a.frame-b.frame)}
  function pasteEvent(data) {const clip=selected.value;if(!clip || !runtime.value)return;const names=data.type==='motion' ? runtime.value.motions : runtime.value.expressions;if(!names.includes(data.name)){message.value='当前模型没有该动作或表情';return}const event={...data,id:uid('event'),...(data.type==='expression' ? {motionLinked:false} : {})};const plan=planEventEdit(clip,event,{start:time.value},project.fps);if(plan.error){message.value=plan.error;return}if(event.type==='expression')clip.events=clip.events.filter(e=>e.type!=='expression' || e.frame!==plan.patch.frame);clip.events.push({...event,...plan.patch});clip.events.sort((a,b)=>a.frame-b.frame)}
  function removeEvent(event) {const clip=selected.value;if(clip)clip.events=clip.events.filter(e=>e.id!==event.id)}
  function duplicate() {
    if(!selected.value || locked.value)return
    const error=visualClipLimit([...allClips.value,selected.value]);if(error){message.value=error;return}
    const clip=snapshot(selected.value);clip.id=uid();clip.name+=' · 副本'
    clip.track=insertFrontLayer(allClips.value)
    clip.transform.x=Math.min(1920,clip.transform.x+80)
    appendVisualClips(project,[clip]);selectCanvas([clip.id],clip.id)
  }
  function split() {if(canSplit.value && !locked.value)batchClips({type:'split',ids:[selectedId.value]})}
  function deleteSelected() {if(!editLocked.value)batchClips({type:'delete',ids:[selectedId.value]})}
  function runtimeReady(id,data) {
    const clip=allClips.value.find(c=>c.id===id);if(!clip)return
    for(const key of Object.keys(clip.keyframes)) {
      if(key.startsWith('@'))continue
      const target=resolveParamId(key,data.groups)
      if(!target || target===key)continue
      const merged=new Map((clip.keyframes[target] || []).map(k=>[k.frame,k]))
      for(const k of clip.keyframes[key])if(!merged.has(k.frame))merged.set(k.frame,k)
      clip.keyframes[target]=[...merged.values()].sort((a,b)=>a.frame-b.frame);delete clip.keyframes[key]
    }
    clip.params=normalizeParamValues(clip.params,data.groups)
    const old=runtimes[id]
    data.expression=old?.expression || '';data.lastFrame=old?.lastFrame ?? -1;data.wasVisible=old?.wasVisible || false;data.livePreview=old?.livePreview || false
    runtimes[id]=data;drive()
  }
  const disposeRuntime = id => {delete runtimes[id]}
  const runtimeError = (id,error) => {message.value=error}
  function addEvent(type,event) {
    const name=event.target.value;event.target.value=''
    if(!name || !selected.value || locked.value)return
    const at=selectedFrame(),clip=selected.value
    const seconds=type==='motion' ? runtime.value.info[name]?.seconds : 0
    if(type==='motion' && !seconds){message.value='动作时长尚未读取，请等待后再添加';return}
    const eventData={id:uid('event'),type,name,frame:at,duration:seconds ? Math.round(seconds*project.fps)/project.fps : 0,sourceDuration:seconds,offset:0,...(type==='expression' ? {motionLinked:false} : {})}
    if(type==='motion'){const plan=planEventEdit(clip,eventData,{start:time.value},project.fps);if(plan.error){message.value=plan.error;return}Object.assign(eventData,plan.patch)}
    else clip.events=clip.events.filter(e=>!(e.type===type && e.frame===at))
    clip.events.push(eventData)
    if(type==='motion') {
      runtime.value.sdk.playMotion(name)
      const target=name.replace(/^mtn_/i,'').replace(/_[clr]$/i,'')
      if(!runtime.value.info[name]?.carriesExpression) {
        const paired=runtime.value.expressions.find(e=>e.replace(/^exp_/i,'').replace(/\.exp3?$/i,'')===target)
        if(paired){clip.events=clip.events.filter(e=>!(e.type==='expression' && e.frame===at));clip.events.push({id:uid('event'),type:'expression',name:paired,frame:at,duration:0,offset:0,motionLinked:true})}
      }
    }
    clip.events.sort((a,b)=>a.frame-b.frame);drive()
  }
  function drive(mouseOnly=false) {
    const filter=layerFilter()
    for(const clip of project.clips) {
      if(mouseOnly && (clip.mouseTrack===false || !clipVisible(clip,time.value) || !filter.clipVisible(clip)))continue
      const r=runtimes[clip.id];if(!r)continue
      const visible=clipVisible(clip,time.value) && filter.clipVisible(clip),state=sampleState(clip)
      if(visible) {
        const mouse=sceneMouseParams(clip,offlineRunning ? null : mousePosition,state.transform,r.groups)
        if(r.livePreview && !playing.value){r.sdk.setParams(mouse);continue}
        const expr=activeEvent(clip,'expression',time.value,project.fps)
        const name=expr?.name || r.expressions.find(e=>/^(default|idle|exp_idle01\.exp3)$/i.test(e)) || ''
        const activeMotion=activeEvent(clip,'motion',time.value,project.fps)
        if(r.timelineMotion!==activeMotion || !r.wasVisible){resetModelPose(r.sdk);r.timelineMotion=activeMotion}
        const motionInfo=activeMotion ? r.info[activeMotion.name] : null
        const owned=[...(motionInfo?.parameterIds || []),...motionEffectParameterIds(r.sdk,motionInfo?.effects),...expressionParameterIds(r.sdk,expr?.name)]
        const base=sceneParameterOverrides(state.params,mouse,owned,r.groups)
        const pose=sampleTimelinePose(r.sdk,r.info,activeMotion,name,expr ? Math.max(0,(state.frame-expr.frame)/project.fps) : 1000,state.frame,project.fps,r.groups,base)
        // Keep released parameters neutral until an authored body track takes over.
        // This also prevents an old native expression queue leaking into the pose.
        r.sampledParameters ||= new Set()
        Object.keys(pose).forEach(key=>r.sampledParameters.add(key))
        const released=Object.fromEntries(r.groups.flatMap(g=>g.params).filter(p=>r.sampledParameters.has(p.key)).map(p=>[p.key,p.default]))
        r.sdk.setParams({...released,...base,...pose})
        r.expression=name
        renderModelNow(r.sdk)
      } else if(r.wasVisible)r.sdk.setParams({})
      r.lastFrame=state.frame;r.wasVisible=visible
      r.renderRevision=(r.renderRevision || 0)+1
    }
  }
  let raf=null,startTimestamp=0,startFrame=0
  let playbackRequest=0
  async function prepareAudio(range) {
    if(!mixedAudioClips.value.length)return
    preparingAudio.value=true
    try{await audio.prepare(range)}catch{message.value='音频初始化失败，播放将跳过音频'}finally{preparingAudio.value=false}
  }
  function previewRange(selection){
    if(playingRange.value){pause();return}
    if(locked.value || !selection)return
    try{
      const range=exportRange(project.duration,project.fps,{mode:'custom',start:selection.start,end:selection.end})
      return play(false,range)
    }catch(error){message.value=error.message}
  }
  async function play(prepared=false,range=null) {
    if(loading.value || playing.value || preparingAudio.value || transferringProject.value || recorder.isPreparing.value || recorder.isExporting.value)return
    const request=++playbackRequest
    if(prepared!==true)await prepareAudio(range)
    if(request!==playbackRequest)return
    clearLivePreview()
    if(range)frame.value=range.startFrame
    else if(frame.value>=project.duration*project.fps)frame.value=0
    for(const r of Object.values(runtimes)){r.wasVisible=false;r.lastFrame=-1;r.timelineMotion=null}
    playingRange.value=range
    playing.value=true;startTimestamp=performance.now();startFrame=frame.value;drive();startAudio();raf=requestAnimationFrame(tick)
  }
  function tick(now) {
    if(!playing.value)return
    const range=playingRange.value,recording=recorder.isRecording.value
    const inFrame=range?.startFrame ?? 0
    const endFrame=range?.endFrame ?? (recording ? recorder.range.value?.endFrame : null) ?? project.duration*project.fps
    const next=playbackFrame(startFrame+(now-startTimestamp)/1000*project.fps,endFrame,loopPlayback.value,recording,inFrame)
    if(next.ended && recorder.isRecording.value){pause();recorder.stop();return}
    if(next.wrapped){
      startFrame=inFrame;startTimestamp=now-next.remainder/project.fps*1000
      for(const r of Object.values(runtimes)){resetModelPose(r.sdk);r.wasVisible=false;r.lastFrame=-1;r.timelineMotion=null;r.expression=''}
    }
    const target=range && next.ended ? endFrame-1 : next.frame
    if(frame.value!==target || next.wrapped){frame.value=target;drive()}
    if(next.wrapped)startAudio()
    if(next.ended){pause();if(recorder.isRecording.value)recorder.stop();return}
    raf=requestAnimationFrame(tick)
  }
  function startAudio(){
    if(!mixedAudioClips.value.length)return
    audio.play(time.value,{endTime:playingRange.value?.end ?? (recorder.isRecording.value ? recorder.range.value?.end : undefined)}).then(()=>{
      const bad=audio.problems
      if(!bad.length)return
      const names=project.audioClips.filter(c=>bad.includes(c.assetId)).map(c=>c.name)
      if(!names.length)return
      message.value='以下音频素材缺失或无法解码，播放已跳过：'+[...new Set(names)].join('、')
    }).catch(()=>{message.value='音频播放失败：请点击播放后重试'})
  }
  function pause(){playbackRequest++;playing.value=false;playingRange.value=null;audio.pause();cancelAnimationFrame(raf)}
  function clearPreviewOverrides(){for(const id of Object.keys(previewOverrides))delete previewOverrides[id]}
function seek(value){if(recorder.isPreparing.value || recorder.isRecording.value || recorder.isExporting.value)return;pause();const n=Number(value);if(!Number.isFinite(n))return;clearLivePreview();for(const r of Object.values(runtimes))if(r.timelineMotion){resetModelPose(r.sdk);r.timelineMotion=null;r.expression=''}clearPreviewOverrides();frame.value=Math.round(Math.max(0,Math.min(project.duration,n))*project.fps);drive()}
  function stop(){pause();seek(0)}
  function changeFps(value) {
    if(locked.value)return
    const next=Number(value);if(![24,30,60].includes(next))return
    frame.value=changeProjectFps(project,frame.value,next)
  }
  async function record(request={}) {
    if(recorder.isPreparing.value || recorder.isExporting.value)return
    if(recorder.isRecording.value){pause();recorder.stop();return}
    if(loading.value || preparingAudio.value || transferringProject.value)return
    let range
    try{range=exportRange(project.duration,project.fps,request)}catch(error){message.value=error.message;return}
    const preparation=recorder.beginPreparation()
    if(!preparation)return
    recorder.range.value=range
    const sequence=++offlineSequence
    message.value='';pause()
    const check=()=>{if(preparation.signal.aborted)throw new DOMException('导出已取消','AbortError')}
    try{
      await ensureClipFonts(allClips.value);check()
      if(missingMedia.value)message.value='以下素材缺失，录制将跳过：'+missingMedia.value
      if(recorder.method.value==='offline' && recorder.format.value==='mp4'){
        if(project.clips.some(c=>c.events.some(e=>e.type==='motion') && !runtimes[c.id]?.infoReady)){message.value='模型动作资源仍在加载，请稍后导出';return}
        clearLivePreview();clearPreviewOverrides()
        const originalFrame=frame.value
        offlineRunning=true
        for(const r of Object.values(runtimes)){resetModelPose(r.sdk);r.wasVisible=false;r.lastFrame=-1;r.timelineMotion=null}
        restoreOffline=()=>{
          if(sequence!==offlineSequence)return
          offlineRunning=false
          sceneCanvas.value?.finishExport?.();frame.value=originalFrame;drive();restoreOffline=null
        }
        await sceneCanvas.value.prepareExport(Number(recorder.resolution.value),true);check()
        preparation.finish()
        await recorder.exportOffline({duration:range.duration,fps:project.fps,portrait:project.aspectRatio==='9:16',
          frameAt:async(index,signal)=>{
            if(signal.aborted)throw new DOMException('导出已取消','AbortError')
            frame.value=range.startFrame+index;drive();await nextTick()
            if(signal.aborted)throw new DOMException('导出已取消','AbortError')
            return sceneCanvas.value.renderExportFrame(signal)
          },
          renderAudio:async(signal,progress)=>{
            const {renderOfflineAudio}=await import('../offlineAudio.js')
            return renderOfflineAudio({clips:mixedAudioClips.value,startTime:range.start,duration:range.duration,loadFile:id=>assetStore.blob(id),signal,progress})
          }
        })
      }else{
        frame.value=range.startFrame;drive()
        if(mixedAudioClips.value.length){
          try{await audio.prepare()}catch{check();message.value='音频初始化失败，录制将跳过音频'}
          check()
        }
        await sceneCanvas.value.prepareExport?.(Number(recorder.resolution.value));check()
        const resolveBackground=()=>{const bg=backgroundAtTime(project.backgroundClips,{color:project.background,image:project.backgroundImage},time.value);return {color:bg.kind==='color' ? bg.color : project.background}}
        preparation.finish()
        if(recorder.start(sceneCanvas.value.getCanvas(),audio.stream,'canvas',resolveBackground,null,project.fps))play(true)
        else message.value=recorder.error.value || '无法开始录制'
      }
    }catch(error){if(!preparation.signal.aborted)message.value='视频导出失败：'+error.message}
    finally{
      preparation.finish()
      if(sequence===offlineSequence && !recorder.isRecording.value && !recorder.isExporting.value){
        if(restoreOffline)restoreOffline()
        else sceneCanvas.value?.finishExport?.()
      }
    }
  }
  watch(recorder.isRecording,value=>{if(!value){pause();sceneCanvas.value?.finishExport?.()}})
  function cancelExport(){pause();recorder.cancel();restoreOffline?.();sceneCanvas.value?.finishExport?.()}
  async function exportProject() {
    if(transferringProject.value)return
    transferringProject.value=true
    try {
      const data=snapshot(project)
      const blob=await packProject(data,assetStore)
      const url=URL.createObjectURL(blob)
      const a=document.createElement('a');a.href=url;a.download='tomori-v0.1-'+Date.now()+'.tomori';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
      message.value='已导出 .tomori 工程，包含引用的图片、视频与音频；模型使用应用内置资源'
    }catch(error){message.value='导出失败：'+error.message}finally{transferringProject.value=false}
  }
  function replaceProject(data) {const parsed=readProject(data,models);backgroundRequest++;uploadingBackground.value=false;pause();sceneTimeline.value?.clearExportSelection();clearPreviewOverrides();syncProjectDuration(parsed);Object.assign(project,parsed);selectCanvas(allClips.value[0] ? [allClips.value[0].id] : [],allClips.value[0]?.id);frame.value=0}
  async function importProject(event) {
    const file=event.target.files?.[0];event.target.value='';if(!file || locked.value)return
    transferringProject.value=true
    try{
      const bundle=await unpackProject(file)
      // 在导入任何素材前验证工程，损坏的清单不会改变当前工程。
      readProject(bundle.project,models)
      const data=await restoreBundle(bundle,assetStore)
      history.end();history.edit(()=>replaceProject(data));await refreshAudioAssets();window.dispatchEvent(new Event('tomori-assets-changed'));message.value='已导入 .tomori 工程与图片、视频、音频素材'
    }catch(e){message.value='导入失败：'+e.message}finally{transferringProject.value=false}
  }
  let saveTimer=null,initialized=false,sceneStoreBlocked=false,sceneDirty=false
  const persistence=createScenePersistence(store,result=>{
    sceneStoreBlocked=true
    message.value=result.conflict ? '另一个页面已保存较新的工程，本页已暂停自动保存。请先导出本页工程备份，再刷新载入最新工程' : '保存工程失败，请导出工程备份'
  })
  async function saveProject(){
    if(!initialized || sceneStoreBlocked || !sceneDirty)return
    clearTimeout(saveTimer)
    sceneDirty=false
    const saved=await persistence.save(snapshot(project))
    // 非版本冲突的失败（例如存储暂时不可用）保留待保存状态，隐藏或关闭页面时再试一次。
    if(!saved && !sceneStoreBlocked){sceneDirty=true;message.value='保存工程失败，请导出工程备份'}
  }
  function flushScene(){clearTimeout(saveTimer);saveProject()}
  function onVisibilityChange(){if(document.visibilityState==='hidden')flushScene()}
  function readLegacyScene(){
    if(store!==localStore)return null
    try{const raw=localStorage.getItem(LEGACY_SCENE_KEY);return raw ? JSON.parse(raw) : null}catch{return null}
  }
  function clearLegacyScene(){if(store!==localStore)return;try{localStorage.removeItem(LEGACY_SCENE_KEY)}catch{}}
  watch(project,()=>drive(),{deep:true})
  watch(project,()=>{if(!initialized)return;sceneDirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(saveProject,300)},{deep:true,flush:'sync'})
  watch(selectedId,()=>{clearLivePreview();previewMotionName.value='';previewExpressionName.value='';paramSearch.value='';allParams.value=false;drive()})
  onMounted(async ()=>{
    exportPreferences.load()
    window.addEventListener('keydown',shortcut)
    window.addEventListener('pagehide',flushScene)
    document.addEventListener('visibilitychange',onVisibilityChange)
    refreshAudioAssets()
    // 工程统一存在 IndexedDB 的 documents 仓库；只有数据库为空时才读一次旧的 localStorage 数据。
    const restored=await persistence.restore(readLegacyScene,clearLegacyScene)
    if(!restored.ok){
      // 读不到就不要再写，避免用空工程覆盖数据库里已保存的内容。
      sceneStoreBlocked=true
      message.value='读取浏览器数据库失败（'+(restored.error?.message || '原因未知')+'）：本次修改不会自动保存，请导出工程备份'
    }else{
      if(restored.project)replaceProject(restored.project)
      if(restored.migrated)message.value='工程已迁移到浏览器数据库，不再使用本地存储'
    }
    initialized=true
  })
onBeforeUnmount(()=>{mouseFrame.cancel();exportPreferences.destroy();offlineSequence++;restoreOffline=null;offlineRunning=false;window.removeEventListener('keydown',shortcut);window.removeEventListener('pagehide',flushScene);document.removeEventListener('visibilitychange',onVisibilityChange);pause();audio.destroy();clearInterval(previewTimer);flushScene();recorder.destroy()})
return {playingRange,previewRange,rippleTrack:editable(rippleTrack),alignAtPlayhead:editable(alignAtPlayhead),trimAtPlayhead:editable(trimAtPlayhead),editMarkers:editable(editMarkers),cancelExport,fitSelectedMedia:editable(fitSelectedMedia),resizeCanvasText:editable(resizeCanvasText),editSubtitle:editable(editSubtitle,true),activateSubtitle,applySubtitleStyle:editable(applySubtitleStyle),textSelection,textInspectorClip,textPresets,saveTextPreset,selectTrackText,addTextBatch:editable(addTextBatch),addText:editable(addText),editText:editable(editText,true),allClips,imageStatus,missingImages,missingVideos,missingBackgrounds,missingAudio,addAudioClip:addAudioAction,editAudioClip:editAudioAction,deleteAudioClip:deleteAudioAction,splitAudio:splitAudioAction,pasteAudioClip:pasteAudioAction,addImage:editable(addImage),addVideo:editable(addVideo),addBackgroundColor,addBackgroundImage,pasteBackgroundClip,editBackground:editBackgroundAction,deleteBackground:deleteBackgroundAction,splitBackground:splitBackgroundAction,sceneTimeline,selectTimeline,changeAspectRatio:editable(changeAspectRatio),canvasSelection,selectCanvas,batchCanvasTransform:editable(batchCanvasTransform),batchClips:editable(batchClips),editLocked,changeLayerState:editable(changeLayerState),changeBackgroundTrackState:editable(changeBackgroundTrackState),changeAudioTrackState:editable(changeAudioTrackState),project,runtimes,selectedId,playing,loopPlayback,message,paramSearch,allParams,autoTransform,sceneCanvas,projectInput,recorder,locked,time,selected,runtime,loading,canSplit,selectedPose,paramLabels,assetModels:models,visibleParams,transformFields,hasKey,previewMotionName,previewExpressionName,activePreview,previewMotionInfo,previewProgress,preview,resetPreview,endPreview,mouseMoved,changeMouseTrack:editable(changeMouseTrack),addChosenEvent:editable(addChosenEvent),canUndo,canRedo,undo,redo,beginEdit,endEdit,renameClip:editable(renameClip,true),changeBackground:editable(changeBackground,true),backgroundInput,backgroundLoading,uploadingBackground,uploadBackground,removeBackgroundImage:editable(removeBackgroundImage),resetBackground:editable(resetBackground),addModel:editable(addModel),renameLayer:editable(renameLayer),reorderLayer:editable(reorderLayer),editClip:editable(editClip,true),editTiming:editable(editTiming,true),editTransform:editable(editTransform,true),resetPlacement:editable(resetPlacement),moveModel:editable(moveModel),transformModel:editable(transformModel),editParam:editable(editParam,true),resetParam:editable(resetParam),toggleKey:editable(toggleKey),removeKey:editable(removeKey),moveKey:editable(moveKey),batchKeys:editable(batchKeys),editKeyValue:editable(editKeyValue,true),editEvent:editable(editEvent),pasteEvent:editable(pasteEvent),removeEvent:editable(removeEvent),duplicate:editable(duplicate),split:editable(split),deleteSelected:editable(deleteSelected),runtimeReady,disposeRuntime,runtimeError,addEvent:editable(addEvent),play,pause,seek,stop,changeFps:editable(changeFps),record,exportProject,importProject}
}
