import {applyCanvasSelection} from '../canvasSelection.js'
import {sceneParameterOverrides} from '../sceneParameterPriority.js'
import {expressionParameterIds,motionEffectParameterIds} from '../live2dSceneAdapter.js'
import { resetCanvasPlacement } from '../resetCanvasPlacement.js'
import { playbackFrame } from '../scenePlayback.js'
import { reorderSceneLayer,insertFrontLayer,setLayerState,canEditClips } from '../sceneLayers.js'
import { applyClipStarts,planClipPaste,planClipSplit } from '../clipSelection.js'
import { activeEvent, planEventEdit,linkedExpressionMotion } from '../timelineEvents.js'
import { ref, reactive, shallowReactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import models from 'virtual:model-manifest'
import { useRecorder } from './useRecorder.js'
import { resolveParamId, normalizeParamValues } from '../params.js'
import { renderModelNow, stopModelMotion, resetModelPose, playTimelineMotion } from '../live2dSceneAdapter.js'
import { sceneMouseParams } from '../sceneMouseTracking.js'
import { moveClipKey, editKeyRefs } from '../timelineKeyframes.js'
import { changeProjectFps } from '../sceneFrameRate.js'
import { createEditHistory } from '../editHistory.js'
import { createProject, createClip, readProject, clipVisible, localFrame, sampleClip, setClipKeyframe, removeClipKeyframe, splitClip, uid } from '../sceneProject.js'

export function useSceneEditor() {
  const project = reactive(createProject()), runtimes = shallowReactive({}), previewOverrides = reactive({})
  const canvasSelection=ref([])
  const selectedId = ref(''), frame = ref(0), playing = ref(false), message = ref('')
  const loopPlayback=ref(false)
  const paramSearch = ref(''), allParams = ref(false), autoTransform = ref(false)
  const previewProgress=ref(null)
  let previewTimer=null
  const previewMotionName=ref(''),previewExpressionName=ref(''),activePreview=ref('')
  let mousePosition=null
  const sceneTimeline=ref(null)
  const sceneCanvas = ref(null), projectInput = ref(null), backgroundInput = ref(null), backgroundLoading = ref(false), uploadingBackground = ref(false), recorder = useRecorder()
  const locked = computed(()=>playing.value || recorder.isRecording.value)
  const time = computed(()=>frame.value/project.fps)
  const selected = computed(()=>project.clips.find(c=>c.id===selectedId.value))
  const editLocked = computed(()=>locked.value || !!selected.value?.layerLocked)
  const runtime = computed(()=>runtimes[selectedId.value])
  const previewMotionInfo=computed(()=>runtime.value?.info[previewMotionName.value])
  const loading = computed(()=>backgroundLoading.value || uploadingBackground.value || project.clips.some(c=>!runtimes[c.id]))
  const canSplit = computed(()=>selected.value && time.value>selected.value.start && time.value<selected.value.start+selected.value.duration)
  function sampleState(clip) {
    const state = sampleClip(clip,time.value,project.fps,runtimes[clip.id]?.groups || [])
    const override = previewOverrides[clip.id]
    if (override?.frame === frame.value) Object.assign(state.params,override.values)
    return state
  }
  const selectedPose = computed(()=>selected.value ? sampleState(selected.value) : {params:{},transform:{}})
  const paramLabels = computed(()=>Object.fromEntries([['@x','位置 X'],['@y','位置 Y'],['@scale','缩放'],['@rotation','旋转'],['@opacity','透明度'],...(runtime.value?.groups || []).flatMap(g=>g.params.map(p=>[p.key,p.label]))]))
  const visibleParams = computed(()=> {
    const query=paramSearch.value.trim().toLowerCase()
    return (runtime.value?.groups || []).flatMap(g=>g.params).filter(p=>query ? (p.label+' '+p.key).toLowerCase().includes(query) : allParams.value || p.common)
  })
  const transformFields = [{key:'x',label:'位置 X',min:-1920,max:1920,step:1},{key:'y',label:'位置 Y',min:-1080,max:1080,step:1},{key:'scale',label:'缩放',min:.1,max:5,step:.01},{key:'rotation',label:'旋转',min:-180,max:180,step:1},{key:'opacity',label:'透明度',min:0,max:1,step:.01}]
  const snapshot = value => JSON.parse(JSON.stringify(value))
  const historyRevision = ref(0)
  const history = createEditHistory({
    capture: () => snapshot({project, overrides:previewOverrides, selectedId:selectedId.value, canvasSelection:canvasSelection.value, frame:frame.value}),
    restore: state => {
      clearLivePreview()
      Object.assign(project,snapshot(state.project));clearPreviewOverrides()
      Object.assign(previewOverrides,snapshot(state.overrides))
      canvasSelection.value=(state.canvasSelection || [state.selectedId]).filter(id=>project.clips.some(c=>c.id===id))
      selectedId.value=project.clips.some(c=>c.id===state.selectedId) ? state.selectedId : project.clips[0]?.id || ''
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
    const selectedEdits=[renameClip,changeMouseTrack,addChosenEvent,editTiming,editTransform,resetPlacement,editParam,resetParam,toggleKey,removeKey,moveKey,editKeyValue,editEvent,pasteEvent,removeEvent,duplicate,split,deleteSelected,addEvent]
    let ids=[]
    if(selectedEdits.includes(fn) && selected.value)ids=[selected.value.id]
    if([editClip,moveModel,transformModel].includes(fn))ids=[args[0]]
    if(fn===batchCanvasTransform)ids=args[0].map(e=>e.id)
    if(fn===batchKeys)ids=(args[1]?.type==='paste' ? args[1].entries : args[0]).map(item=>item.clipId)
    if(fn===batchClips && args[0].type!=='paste')ids=args[0].type==='move' ? args[0].entries.map(e=>e.id) : args[0].ids
    if([renameLayer,reorderLayer].includes(fn))ids=project.clips.filter(c=>c.track===args[0]).map(c=>c.id)
    if(!canEditClips(project.clips,ids)){message.value='图层已锁定，请先解锁后编辑';return}
    if(fn===resetPlacement || fn===changeLayerState || fn===renameLayer || fn===reorderLayer || (fn===batchClips && args[0].type!=='move') || (fn===batchKeys && args[1].type!=='move'))history.end()
    clearLivePreview()
    return history.edit(()=>fn(...args),merge ? fn.name+':'+selectedId.value+':'+frame.value+':'+(args[0]?.key ?? args[0]) : undefined)
  }
  function changeAspectRatio(value){if(['16:9','9:16'].includes(value))project.aspectRatio=value}
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
  function mouseMoved(position){mousePosition=position;drive()}
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
  function addModel(model) {
    if(locked.value)return
    if(project.clips.length>=16){message.value='单个工程最多 16 个模型片段';return}
    const used=new Set(project.clips.map(c=>c.track))
    const track=Array.from({length:16},(_,i)=>i).find(i=>!used.has(i))
    if(track===undefined){message.value='没有空闲轨道';return}
    const start=Math.min(time.value,project.duration-1/project.fps)
    const clip=createClip(model,start,Math.min(5,project.duration-start),insertFrontLayer(project.clips))
    clip.transform.x=project.clips.length%2 ? 190 : -190
    project.clips.push(clip);selectCanvas([clip.id],clip.id)
  }
  function renameLayer(track,value){const name=String(value).trim().slice(0,100);if(!name)return;for(const clip of project.clips.filter(c=>c.track===track))clip.layerName=name}
  function changeLayerState(track,patch){setLayerState(project.clips,track,patch);drive()}
  function reorderLayer(from,to){reorderSceneLayer(project.clips,from,to)}
  function batchClips(action){
    if(action.type==='move'){if(!applyClipStarts(project.clips,action.entries,project.duration,project.fps))message.value='整组移动不能越界或与同轨道片段重叠'}
    else if(action.type==='delete'){const ids=new Set(action.ids);project.clips=project.clips.filter(c=>!ids.has(c.id));canvasSelection.value=canvasSelection.value.filter(id=>!ids.has(id));if(ids.has(selectedId.value))selectedId.value=canvasSelection.value.at(-1) || ''}
    else if(action.type==='split'){
      const plan=planClipSplit(project.clips,action.ids,time.value)
      if(plan.error){message.value=plan.error;return}
      for(const left of plan.left)project.clips.find(c=>c.id===left.id).duration=left.duration
      project.clips.push(...plan.right);selectCanvas(plan.right.map(c=>c.id),plan.right[0].id)
    }
    else if(action.type==='paste'){
      const plan=planClipPaste(project.clips,action.clipboard,time.value,project.duration,project.fps)
      if(plan.error){message.value=plan.error;return}
      for(const c of project.clips)c.track=plan.tracks.find(t=>t.track===c.track).to
      project.clips.push(...plan.clips);selectCanvas(plan.clips.map(c=>c.id),plan.clips[0].id)
    }
  }
  function editClip(id,patch) {
    if(locked.value)return
    const clip=project.clips.find(c=>c.id===id);if(!clip)return
    const merged={...clip,...patch},min=1/project.fps
    if(![merged.start,merged.duration,merged.offset,merged.track].every(Number.isFinite))return
    merged.start=Math.round(Math.max(0,Math.min(project.duration-min,merged.start))*project.fps)/project.fps
    merged.duration=Math.max(min,Math.min(project.duration-merged.start,merged.duration))
    merged.offset=Math.max(0,merged.offset);merged.track=Math.round(Math.max(0,Math.min(15,merged.track)))
    if(project.clips.some(c=>c.id!==id && c.track===merged.track && merged.start<c.start+c.duration && merged.start+merged.duration>c.start)) {
      message.value='同一轨道的片段不能重叠；同屏模型请放在不同轨道';return
    }
    if(merged.track!==clip.track){const target=project.clips.find(c=>c.id!==id && c.track===merged.track);if(target?.layerLocked){message.value='目标图层已锁定';return}if(target){clip.layerName=target.layerName || target.name;clip.layerLocked=!!target.layerLocked;clip.layerHidden=!!target.layerHidden}}
    Object.assign(clip,{start:merged.start,duration:merged.duration,offset:merged.offset,track:merged.track})
  }
  const editTiming = (key,value) => editClip(selectedId.value,{[key]:Number(value)})
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
  function selectTimeline(ids){canvasSelection.value=[...new Set(ids)].filter(id=>project.clips.some(c=>c.id===id));if(canvasSelection.value.length && !canvasSelection.value.includes(selectedId.value))selectedId.value=canvasSelection.value.at(-1)}
  function batchCanvasTransform(entries){applyCanvasSelection(project.clips,entries,time.value,project.fps,autoTransform.value)}
  watch(()=>project.clips.map(c=>c.id),()=>{canvasSelection.value=canvasSelection.value.filter(id=>project.clips.some(c=>c.id===id))})
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
    editKeyRefs(project.clips,items,action,project.fps)
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
    if(project.clips.length>=16){message.value='单个工程最多 16 个模型片段';return}
    const clip=snapshot(selected.value);clip.id=uid();clip.name+=' · 副本'
    clip.track=insertFrontLayer(project.clips)
    clip.transform.x=Math.min(1920,clip.transform.x+80)
    project.clips.push(clip);selectedId.value=clip.id
  }
  function split() {
    if(!canSplit.value || locked.value || project.clips.length>=16)return
    const clip=selected.value,right=splitClip(snapshot(clip),time.value)
    if(!right)return
    clip.duration=time.value-clip.start;project.clips.push(right);selectCanvas([right.id],right.id)
  }
  function deleteSelected() {if(editLocked.value)return;const i=project.clips.findIndex(c=>c.id===selectedId.value);if(i>=0)project.clips.splice(i,1);selectedId.value=''}
  function runtimeReady(id,data) {
    const clip=project.clips.find(c=>c.id===id);if(!clip)return
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
  function drive() {
    for(const clip of project.clips) {
      const r=runtimes[clip.id];if(!r)continue
      const visible=clipVisible(clip,time.value),state=sampleState(clip)
      if(visible) {
        const mouse=sceneMouseParams(clip,mousePosition,state.transform,r.groups)
        if(r.livePreview && !playing.value){r.sdk.setParams(mouse);continue}
        const expr=activeEvent(clip,'expression',time.value,project.fps)
        const name=expr?.name || r.expressions.find(e=>/^(default|idle|exp_idle01\.exp3)$/i.test(e)) || ''
        if(name && name!==r.expression){r.sdk.setExpression(name);r.expression=name}
        {
          const motion=activeEvent(clip,'motion',time.value,project.fps)
          if(playing.value && motion && (r.timelineMotion!==motion || !r.wasVisible)){playTimelineMotion(r.sdk,motion.name,(motion.offset || 0)+state.frame/project.fps-motion.frame/project.fps);r.timelineMotion=motion}
          else if(!motion && r.timelineMotion){resetModelPose(r.sdk);r.timelineMotion=null;r.expression='';if(name){r.sdk.setExpression(name);r.expression=name}}
        }
        const activeMotion=activeEvent(clip,'motion',time.value,project.fps)
        const motionInfo=activeMotion && (playing.value || r.timelineMotion===activeMotion) ? r.info[activeMotion.name] : null
        const owned=[...(motionInfo?.parameterIds || []),...motionEffectParameterIds(r.sdk,motionInfo?.effects),...expressionParameterIds(r.sdk,expr?.name)]
        r.sdk.setParams(sceneParameterOverrides(state.params,mouse,owned,r.groups))
        if(!playing.value)renderModelNow(r.sdk)
      } else if(r.wasVisible)r.sdk.setParams({})
      r.lastFrame=state.frame;r.wasVisible=visible
      r.renderRevision=(r.renderRevision || 0)+1
    }
  }
  let raf=null,startTimestamp=0,startFrame=0
  function play() {
    if(loading.value || playing.value)return
    clearLivePreview()
    if(frame.value>=project.duration*project.fps)frame.value=0
    for(const r of Object.values(runtimes)){r.wasVisible=false;r.lastFrame=-1;r.timelineMotion=null}
    playing.value=true;startTimestamp=performance.now();startFrame=frame.value;drive();raf=requestAnimationFrame(tick)
  }
  function tick(now) {
    if(!playing.value)return
    const next=playbackFrame(startFrame+(now-startTimestamp)/1000*project.fps,project.duration*project.fps,loopPlayback.value,recorder.isRecording.value)
    if(next.wrapped){
      startFrame=0;startTimestamp=now-next.remainder/project.fps*1000
      for(const r of Object.values(runtimes)){resetModelPose(r.sdk);r.wasVisible=false;r.lastFrame=-1;r.timelineMotion=null;r.expression=''}
    }
    frame.value=next.frame;drive()
    if(next.ended){pause();if(recorder.isRecording.value)recorder.stop();return}
    raf=requestAnimationFrame(tick)
  }
  function pause(){playing.value=false;cancelAnimationFrame(raf)}
  function clearPreviewOverrides(){for(const id of Object.keys(previewOverrides))delete previewOverrides[id]}
  function seek(value){if(recorder.isRecording.value)return;pause();const n=Number(value);if(!Number.isFinite(n))return;clearLivePreview();for(const r of Object.values(runtimes))if(r.timelineMotion){resetModelPose(r.sdk);r.timelineMotion=null;r.expression=''}clearPreviewOverrides();frame.value=Math.round(Math.max(0,Math.min(project.duration,n))*project.fps);drive()}
  function stop(){pause();seek(0)}
  function changeDuration(value) {
    const n=Number(value);if(locked.value || !Number.isFinite(n))return
    project.duration=Math.min(600,Math.max(.5,n,...project.clips.map(c=>c.start+c.duration)));seek(Math.min(time.value,project.duration))
  }
  function changeFps(value) {
    if(locked.value)return
    const next=Number(value);if(![24,30,60].includes(next))return
    frame.value=changeProjectFps(project,frame.value,next)
  }
  function record() {
    if(recorder.isRecording.value){pause();recorder.stop();return}
    if(loading.value)return
    stop();if(recorder.start(sceneCanvas.value.getCanvas(),null,'canvas',null,null,project.fps))play();else message.value='无法开始录制'
  }
  function exportProject() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}))
    const a=document.createElement('a');a.href=url;a.download='tomori-v0.1-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function replaceProject(data) {const parsed=readProject(data,models);backgroundRequest++;uploadingBackground.value=false;pause();clearPreviewOverrides();Object.assign(project,parsed);selectCanvas(project.clips[0] ? [project.clips[0].id] : [],project.clips[0]?.id);frame.value=0}
  async function importProject(event) {
    const file=event.target.files?.[0];event.target.value='';if(!file || locked.value)return
    try{const data=JSON.parse(await file.text());if(locked.value)return;history.end();history.edit(()=>replaceProject(data));message.value='已导入场景工程'}catch(e){message.value='导入失败：'+e.message}
  }
  let saveTimer=null,initialized=false
  watch(project,()=>{drive();if(!initialized)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('tomori-scene-v2',JSON.stringify(project))}catch{message.value='本地保存失败，请导出工程备份'}},400)},{deep:true})
  watch(selectedId,()=>{clearLivePreview();previewMotionName.value='';previewExpressionName.value='';paramSearch.value='';allParams.value=false;drive()})
  onMounted(()=>{
    window.addEventListener('keydown',shortcut)
    try{
      const saved=localStorage.getItem('tomori-scene-v2')
      if(saved)replaceProject(JSON.parse(saved))

    }catch(e){message.value='恢复工程失败：'+e.message}
    initialized=true
  })
  onBeforeUnmount(()=>{window.removeEventListener('keydown',shortcut);pause();clearInterval(previewTimer);clearTimeout(saveTimer);try{localStorage.setItem('tomori-scene-v2',JSON.stringify(project))}catch{};recorder.destroy()})
  return {sceneTimeline,selectTimeline,changeAspectRatio:editable(changeAspectRatio),canvasSelection,selectCanvas,batchCanvasTransform:editable(batchCanvasTransform),batchClips:editable(batchClips),editLocked,changeLayerState:editable(changeLayerState),project,runtimes,selectedId,playing,loopPlayback,message,paramSearch,allParams,autoTransform,sceneCanvas,projectInput,recorder,locked,time,selected,runtime,loading,canSplit,selectedPose,paramLabels,assetModels:models,visibleParams,transformFields,hasKey,previewMotionName,previewExpressionName,activePreview,previewMotionInfo,previewProgress,preview,resetPreview,endPreview,mouseMoved,changeMouseTrack:editable(changeMouseTrack),addChosenEvent:editable(addChosenEvent),canUndo,canRedo,undo,redo,beginEdit,endEdit,renameClip:editable(renameClip,true),changeBackground:editable(changeBackground,true),backgroundInput,backgroundLoading,uploadingBackground,uploadBackground,removeBackgroundImage:editable(removeBackgroundImage),resetBackground:editable(resetBackground),addModel:editable(addModel),renameLayer:editable(renameLayer),reorderLayer:editable(reorderLayer),editClip:editable(editClip,true),editTiming:editable(editTiming,true),editTransform:editable(editTransform,true),resetPlacement:editable(resetPlacement),moveModel:editable(moveModel),transformModel:editable(transformModel),editParam:editable(editParam,true),resetParam:editable(resetParam),toggleKey:editable(toggleKey),removeKey:editable(removeKey),moveKey:editable(moveKey),batchKeys:editable(batchKeys),editKeyValue:editable(editKeyValue,true),editEvent:editable(editEvent),pasteEvent:editable(pasteEvent),removeEvent:editable(removeEvent),duplicate:editable(duplicate),split:editable(split),deleteSelected:editable(deleteSelected),runtimeReady,disposeRuntime,runtimeError,addEvent:editable(addEvent),play,pause,seek,stop,changeDuration:editable(changeDuration,true),changeFps:editable(changeFps),record,exportProject,importProject}
}
