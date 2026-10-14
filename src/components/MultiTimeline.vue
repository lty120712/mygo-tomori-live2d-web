<template>
  <section ref="timelineRoot" tabindex="0" @copy="copyKeyEvent" @paste="pasteKeyEvent" @keydown="selectionShortcut" @keyup="endFrameStep" @focusout="stopFrameStep" @pointerdown.capture="focusTimeline" class="multi-timeline" :style="{height:Math.max(timelineHeight,minimumTimelineHeight)+'px'}" @pointermove="moveSeek" @pointerup="endSeek" @pointercancel="endSeek" @lostpointercapture="endSeek">
    <div class="timeline-resizer" role="separator" aria-orientation="horizontal" aria-label="调整时间线高度" tabindex="0" title="向上拖动展开时间线，向下拖动扩大画布" @pointerdown="beginResize" @pointermove.stop="resizeTimeline" @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="endResize" @keydown.up.prevent="timelineHeight=Math.min(maxHeight(),timelineHeight+20)" @keydown.down.prevent="timelineHeight=Math.max(minimumTimelineHeight,timelineHeight-20)"><span></span></div>
    <div class="timeline-tools"><div class="tool-group" role="group" aria-label="时间线选择"><span>时间线</span><button :aria-pressed="boxMode" title="轨道空白处框选片段；菱形所在区域框选关键帧；Ctrl / Shift 追加选择" @click="boxMode=!boxMode">框选</button></div><div class="tool-group context-tools" role="group" aria-label="所选片段操作"><template v-if="selectedEvent"><span :title="selectedEvent.name">已选{{selectedEvent.type==='motion' ? '动作' : '表情'}}</span><button :disabled="disabled" @click="copyEvent">复制片段</button><button :disabled="editDisabled || !eventClipboard" @click="pasteCopiedEvent">粘贴片段</button><button :disabled="editDisabled" @click="deleteEvent">删除片段</button></template><template v-if="selectedClips.length || clipClipboard"><span v-if="selectedClips.length">已选 {{selectedClips.length}} 个片段</span><button :disabled="disabled || !selectedClips.length" @click="copyModels">复制片段</button><button :disabled="disabled || !clipClipboard" @click="pasteModels">粘贴片段</button><button v-if="selectedClips.length" :disabled="disabled" @click="deleteClips">删除所选片段</button></template></div><div v-if="selectedKeys.length || keyClipboard" class="tool-group" role="group" aria-label="关键帧复制粘贴"><span v-if="selectedKeys.length" title="← / → 移动选中帧；长按连续移动；拖动任意选中菱形整体移动">已选 {{selectedKeys.length}} 帧</span><button :disabled="disabled || !selectedKeys.length" @click="copySelection" title="复制所选关键帧（Ctrl+C / ⌘C）">复制帧</button><button :disabled="editDisabled || !keyClipboard" @click="pasteSelection" :title="pastePlan.error || '粘贴到播放头（Ctrl+V / ⌘V）；同属性同帧会替换'">粘贴帧</button><button v-if="selectedKeys.length" :disabled="disabled || refsLocked(selectedKeys)" @click="deleteSelection">删除选中帧</button></div><div class="tool-group zoom-tools" role="group" aria-label="时间线视图"><button aria-label="缩小时间线" :disabled="zoomLevel===0 || !!dragging" @click="changeZoom(zoomLevel-1)">−</button><input aria-label="时间线缩放" type="range" min="0" max="4" step="1" :value="zoomLevel" :disabled="dragging" @input="changeZoom(Number($event.target.value))" /><button aria-label="放大时间线" :disabled="zoomLevel===4 || !!dragging" @click="changeZoom(zoomLevel+1)">＋</button><span>{{zoom}}×</span><button :disabled="zoomLevel===0 || !!dragging" @click="changeZoom(0)">适合全长</button><label title="拖动时按住 Alt 临时关闭吸附"><input type="checkbox" role="switch" aria-label="时间线吸附" v-model="snapping" />吸附</label><small title="拖动时按住 Alt 临时关闭吸附；Ctrl + 滚轮缩放">Alt · Ctrl + 滚轮</small></div></div>
    <div v-if="backgroundSelection" class="timeline-tools background-tools"><div class="tool-group" role="group" aria-label="所选背景片段操作"><span>已选 1 个背景片段</span><button :disabled="disabled || !playheadInsideClip(selectedBackgroundClip)" title="在播放头切割所选背景片段" @click="emit('split-background',backgroundSelection)">在播放头切割</button><button :disabled="disabled" title="复制所选背景片段（Ctrl+C）" @click="copyBackgroundClip()">复制片段</button><button :disabled="editDisabled || !backgroundClipboard" title="粘贴到播放头（Ctrl+V）" @click="pasteBackgroundClip()">粘贴片段</button><button :disabled="disabled" @click="deleteBackgroundSelection()">删除所选片段</button></div></div>
    <div v-if="audioSelection" class="timeline-tools audio-tools"><div class="tool-group" role="group" aria-label="所选音频片段操作"><span>已选 1 个音频片段</span><button :disabled="disabled || !playheadInsideClip(selectedAudioClip)" title="在播放头切割所选音频片段" @click="emit('split-audio',audioSelection)">在播放头切割</button><button :disabled="disabled" title="复制所选音频片段（Ctrl+C）" @click="copyAudioClip()">复制片段</button><button :disabled="editDisabled || !audioClipboard" title="粘贴到播放头（Ctrl+V）" @click="pasteAudioClip()">粘贴片段</button><button :disabled="disabled" @click="deleteAudioSelection()">删除所选片段</button></div></div>
    <div v-if="clipboardNotice" class="clipboard-notice" role="status" :title="clipboardNotice">{{clipboardNotice}}</div>
<div v-if="audioClips.length" class="timeline-tools beat-tools"><div class="tool-group" role="group" aria-label="音频节拍"><label title="在音频波形上标出节拍点；拖动播放头或片段时吸附到最近的节拍（按住 Alt 临时关闭）"><input type="checkbox" role="switch" aria-label="节拍吸附" v-model="beatSnap" />节拍吸附</label><small>节拍点由音频波形推导，用来把画面和背景对齐到音频</small></div></div>
    <div v-if="selected" class="key-tools"><div class="tool-group" role="group" aria-label="关键帧属性选择"><button :aria-expanded="showKeyRows" @click="showKeyRows=!showKeyRows">{{showKeyRows ? '收起关键帧' : '展开关键帧'}}</button><select aria-label="关键帧属性" v-model="keyProperty"><option v-for="key in keyProperties" :key="key" :value="key">{{labels[key] || key}} · {{(selected.keyframes[key] || []).length}} 帧</option></select></div><div class="tool-group" role="group" aria-label="关键帧编辑"><button aria-label="上一个关键帧" :disabled="disabled || !previousKey" @click="chooseKey(previousKey)">‹</button><button aria-label="添加或删除当前关键帧" :class="{keyed:currentKey}" :disabled="editDisabled || !withinClip" @click="emit('toggle-key',keyProperty)">◆</button><button aria-label="下一个关键帧" :disabled="disabled || !nextKey" @click="chooseKey(nextKey)">›</button><label>{{labels[keyProperty] || keyProperty}}{{ valueDisplay(keyProperty).unit }}<input aria-label="关键帧属性值" type="number" :min="valueDisplay(keyProperty).min" :max="valueDisplay(keyProperty).max" step="1" :value="valueDisplay(keyProperty).toDisplay(propertyValue)" :disabled="editDisabled || !withinClip" @focus="emit('begin-edit')" @blur="$event.target.value=valueDisplay(keyProperty).toDisplay(propertyValue);emit('end-edit')" @input="emit('edit-key-value',keyProperty,valueDisplay(keyProperty).toNative($event.target.value))" /></label><button :disabled="editDisabled || !currentKey" @click="emit('remove-key',keyProperty,currentFrame)">删除关键帧</button><button :disabled="editDisabled || (!selectedKeys.length && !currentKey)" @click="openCurveEditor">速度曲线</button></div><small class="neighbor-description" :title="neighborDescription">{{neighborDescription}}</small></div>
    <div ref="scrollArea" class="timeline-scroll" @wheel="wheelZoom"><div class="timeline-content" :style="{width: (170+laneWidth)+'px'}">
    <div class="timeline-ruler"><span>轨道 / 片段</span><div ref="ruler" tabindex="-1" @pointerdown="beginSeek"><i v-for="n in ticks" :key="n" :style="{left: n / duration * 100 + '%'}">{{ formatTimecode(n,fps) }}</i><b v-if="snapTime!==null" class="snap-guide" :style="{left:snapTime/duration*100+'%'}"></b><b :style="{left: time / duration * 100 + '%'}" title="拖动播放头"></b></div></div>
    <div class="track-scroll">
      <template v-for="track in tracks" :key="track"><div class="track-row">
        <div class="track-label track-card" tabindex="0" :data-track="track" title="单击展开／收起参数轨道；拖动调整图层顺序；双击名称重命名" :aria-expanded="selected?.track===track && showKeyRows" @pointerdown="beginLayerDrag($event,track)" :aria-label="'选择图层 '+layerName(track)" @contextmenu.prevent.stop="openTrackMenu($event,track)" @click="clickLayer(track)" @keydown.enter.prevent.stop="clickLayer(track)" :class="{active:clips.some(c=>c.track===track && selectedClips.includes(c.id)),'layer-locked':layerLocked(track),'layer-hidden':layerHidden(track),'layer-dragging':layerSource===track,'layer-target':layerTarget===track}"><span class="layer-name" :title="layerName(track)" @dblclick.stop="startLayerRename(track)"><i class="layer-grip" aria-hidden="true">⠿</i><input v-if="editingLayer===track" ref="layerNameInput" aria-label="图层名称" maxlength="100" v-model="layerDraft" @pointerdown.stop @click.stop @dblclick.stop @keydown.enter.prevent.stop="finishLayerRename" @keydown.esc.prevent.stop="editingLayer=null" @blur="finishLayerRename" /><template v-else>{{layerName(track)}}</template><small v-if="selected?.track===track" :title="selected.name">{{ selected.name }}</small></span><button class="layer-toggle" :disabled="disabled" :aria-label="(layerLocked(track) ? '解锁图层 ' : '锁定图层 ')+layerName(track)" :aria-pressed="layerLocked(track)" :title="layerLocked(track) ? '解锁图层' : '锁定图层'" @click.stop="toggleLayer(track,'layerLocked')"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path :d="layerLocked(track) ? 'M8 10V6a4 4 0 0 1 8 0v4' : 'M8 10V6a4 4 0 0 1 8 0'"/></svg></button><button class="layer-toggle" :disabled="disabled" :aria-label="(layerHidden(track) ? '显示图层 ' : '隐藏图层 ')+layerName(track)" :aria-pressed="layerHidden(track)" :title="layerHidden(track) ? '显示图层' : '隐藏图层'" @click.stop="toggleLayer(track,'layerHidden')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path v-if="layerHidden(track)" d="M3 3l18 18"/></svg></button><button class="layer-toggle layer-solo" :disabled="disabled" :aria-label="(layerSolo(track) ? '取消独见 ' : '独见 ')+layerName(track)" :aria-pressed="layerSolo(track)" :title="layerSolo(track) ? '取消独见' : '独见：只显示该轨道'" @click.stop="toggleLayer(track,'layerSolo')">独</button><button v-if="selected?.track===track" :disabled="disabled || layerLocked(track)" :aria-label="'删除片段 '+selected.name" title="删除选中片段（Delete）" @click.stop="selectedClips.length ? deleteClips() : emit('delete-selected')">删除</button></div>
        <div class="track-lane" tabindex="-1" @pointerdown.self="boxMode ? beginBox($event,'clips') : beginTrackSeek($event,track)" @contextmenu.prevent.stop="openTrackMenu($event,track)">
          <div v-for="clip in clips.filter(c => c.track === track)" :key="clip.id" class="model-clip" tabindex="0" :aria-label="'选择片段 '+clip.name" :class="{selected: selectedClips.includes(clip.id),multiselected:selectedClips.includes(clip.id),'image-clip':isMediaClip(clip)}" :data-clip-id="clip.id" @contextmenu.prevent.stop="openClipMenu($event,clip)" :style="{left: clip.start / duration * 100 + '%', width: clip.duration / duration * 100 + '%'}" @click="chooseClip(clip,$event)" @pointerdown="begin($event,clip,'move')" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end">
            <ClipThumb v-if="isVideoClip(clip)" :asset-id="clip.assetId" />
            <span class="trim-handle left" title="裁剪入点" @pointerdown.stop="begin($event,clip,'left')"></span>
            <span class="clip-name">{{ isVideoClip(clip) ? '视频 · ' : isMediaClip(clip) ? '图片 · ' : '' }}{{ clip.name }}</span><small>{{ formatTimecode(clip.duration,fps) }}</small>
            <div v-for="transforms in (isMediaClip(clip) ? [true] : [true,false])" :key="String(transforms)" class="clip-key-strip" :class="{transforms}" :aria-label="transforms ? '变换关键帧' : '参数关键帧'" @pointerdown.self.stop="boxMode ? beginBox($event) : begin($event,clip,'move')"><button v-for="group in groupedClipKeys(clip,fps,transforms)" :key="group.frame" class="key-marker clip-key" :class="{chosen:group.keys.some(k=>isKeySelected(clip.id,k.key,k.frame))}" :data-key-items="JSON.stringify(group.keys.map(k=>({clipId:clip.id,key:k.key,frame:k.frame})))" :style="{left:markerPosition(clip,group.time)}" :aria-label="groupTitle(clip,group)" :title="groupTitle(clip,group)" :disabled="disabled || clip.layerLocked" @pointerdown.stop="beginGroupKey($event,clip,group)" @pointermove.stop="moveKey" @pointerup.stop="endKey" @pointercancel.stop="endKey" @lostpointercapture.stop="endKey" @click.stop="chooseGroup(clip,group,$event)" @contextmenu.prevent.stop="openKeyMenu($event,clip,group.keys)">◆</button></div>
            <span class="trim-handle right" title="裁剪出点" @pointerdown.stop="begin($event,clip,'right')"></span>
          </div>
          <b v-if="snapTime!==null" class="snap-guide" :style="{left:snapTime/duration*100+'%'}"></b><b class="playhead" :style="{left: time / duration * 100 + '%'}"></b>
        </div>
      </div>
      <template v-if="selected?.track===track && showKeyRows"><div v-for="key in expandedProperties" :key="key" class="sub-row key-property-row" @contextmenu.prevent.stop="openPropertyMenu($event,key)"><div class="track-label" :class="{active:key===keyProperty}" @contextmenu.prevent.stop="openPropertyMenu($event,key)" @click="keyProperty=key">{{ labels[key] || key }} <small>{{ (selected.keyframes[key] || []).length }}</small></div><div class="track-lane" tabindex="-1" @pointerdown.self="boxMode ? beginBox($event) : beginSeek($event)"><span v-for="segment in curveSegments(key)" :key="'curve'+segment.frame" class="curve-segment" :style="{left:segment.start/duration*100+'%',width:(segment.end-segment.start)/duration*100+'%'}"><button class="curve-label" :title="easingLabel(segment.easing)+' · '+formatTimecode(segment.start,fps)+' → '+formatTimecode(segment.end,fps)" :aria-label="(labels[key] || key)+' · '+easingLabel(segment.easing)+'速度曲线'" :disabled="editDisabled" @pointerdown.stop @click.stop="editSegmentCurve(key,segment)" @contextmenu.prevent.stop="editSegmentCurve(key,segment)">{{easingLabel(segment.easing)}}</button></span><button v-for="(kf,index) in visibleClipKeys(selected,fps).filter(k=>k.key===key)" :key="index" class="key-marker" :class="{chosen:isKeySelected(selected.id,key,kf.frame)}" :data-key-items="JSON.stringify([{clipId:selected.id,key,frame:kf.frame}])" :style="{left:kf.time/duration*100+'%'}" :aria-label="keyTitle(kf)" :title="keyTitle(kf)+' · 拖动调整时间'" :disabled="editDisabled" @pointerdown.stop="beginKey($event,kf)" @pointermove.stop="moveKey" @pointerup.stop="endKey" @pointercancel.stop="endKey" @lostpointercapture.stop="endKey" @click.stop="chooseKey(kf,$event)" @contextmenu.prevent.stop="openKeyMenu($event,selected,[kf])">◆</button><b class="playhead" :style="{left:time/duration*100+'%'}"></b></div></div></template>
      </template>
      <template v-if="selected && !isMediaClip(selected)">
        <div v-for="type in ['motion','expression']" :key="type" class="sub-row event-row"><div class="track-label">{{type==='motion' ? '动作' : '表情'}} · 选中片段</div><div class="track-lane" tabindex="-1" @pointerdown.self="selectedEventId='';beginSeek($event)" @contextmenu.prevent.stop="openEventLaneMenu($event,type)"><div v-for="event in visibleEvents(type)" :key="event.id" role="button" tabindex="0" class="event-marker event-clip" :class="{chosen:selectedEventId===event.id,motion:type==='motion',expression:type==='expression'}" :style="eventStyle(event)" :aria-label="eventTitle(event)" :title="eventTitle(event)+' · 拖动移动；右键编辑'" @pointerdown.stop="beginEvent($event,event,'move')" @click.stop="selectEvent(event)" @keydown.enter.prevent.stop="selectEvent(event)" @contextmenu.prevent.stop="openEventMenu($event,event)"><span v-if="type==='motion'" class="trim-handle left" title="裁剪动作入点" @pointerdown.stop="beginEvent($event,event,'left')"></span><span v-if="type==='expression'" class="expression-diamond">◆</span><span class="event-name">{{event.name}}</span><small v-if="type==='motion'">剩余 {{formatTimecode(eventProgress(selected,event,time,fps).remaining,fps)}}</small><span v-if="type==='motion'" class="event-progress" role="progressbar" :aria-label="event.name+'播放进度'" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(eventProgress(selected,event,time,fps).ratio*100)"><i :style="{width:eventProgress(selected,event,time,fps).ratio*100+'%'}"></i></span><span v-if="type==='motion'" class="trim-handle right" title="裁剪动作出点" @pointerdown.stop="beginEvent($event,event,'right')"></span></div><b v-if="snapTime!==null" class="snap-guide" :style="{left:snapTime/duration*100+'%'}"></b><b class="playhead" :style="{left:time/duration*100+'%'}"></b></div></div>
      </template>
      <div class="track-row background-track">
        <div class="track-label track-card" title="背景始终位于最底层，按时间切换纯色或图片">
          <span class="layer-name">背景<small v-if="!backgroundClips.length"> · 兜底</small></span><button class="layer-toggle" :disabled="disabled" :aria-label="(backgroundHidden ? '显示背景轨道' : '隐藏背景轨道')" :aria-pressed="backgroundHidden" :title="backgroundHidden ? '显示背景轨道' : '隐藏背景轨道（画面回退到兜底背景）'" @click="toggleBackgroundTrack('layerHidden')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path v-if="backgroundHidden" d="M3 3l18 18"/></svg></button><button class="layer-toggle layer-solo" :disabled="disabled" :aria-label="(backgroundSolo ? '取消独见背景' : '独见背景')" :aria-pressed="backgroundSolo" :title="backgroundSolo ? '取消独见' : '独见：只显示背景轨道'" @click="toggleBackgroundTrack('layerSolo')">独</button>
          <button :disabled="disabled" title="选择颜色，在播放头添加纯色背景片段" @click="openBackgroundColorMenu">＋纯色</button>
          <button :disabled="disabled" title="从素材库选择图片，在播放头添加背景片段" @click="openBackgroundImageMenu">＋图片</button>
        </div>
        <div class="track-lane background-lane" tabindex="-1" @pointerdown.self="clickBackgroundLane($event)" @contextmenu.prevent.stop="openBackgroundMenu($event,null)">
          <div v-for="clip in backgroundClips" :key="clip.id" class="model-clip background-clip" tabindex="0" :class="{selected:backgroundSelection===clip.id,multiselected:backgroundSelection===clip.id,image:clip.kind==='image',hidden:clip.layerHidden}" :aria-label="'背景片段 '+backgroundLabel(clip)" :title="backgroundTitle(clip)+' · 拖动移动；左右拖动两端裁剪；右键编辑'" :style="{left:clip.start/duration*100+'%',width:clip.duration/duration*100+'%',background:clip.kind==='color' ? clip.color : undefined}" @pointerdown="beginBackground($event,clip,'move')" @pointermove="moveBackground" @pointerup="endBackground" @pointercancel="endBackground" @lostpointercapture="endBackground" @contextmenu.prevent.stop="openBackgroundMenu($event,clip)">
            <span class="trim-handle left" title="调整背景入点" @pointerdown.stop="beginBackground($event,clip,'left')"></span>
            <span class="clip-name">{{backgroundLabel(clip)}}</span><small>{{formatTimecode(clip.duration,fps)}}</small>
            <span class="trim-handle right" title="调整背景出点" @pointerdown.stop="beginBackground($event,clip,'right')"></span>
          </div>
          <b v-if="snapTime!==null" class="snap-guide" :style="{left:snapTime/duration*100+'%'}"></b><b class="playhead" :style="{left:time/duration*100+'%'}"></b>
        </div>
      </div>
      <div v-for="lane in audioTracks" :key="'audio-'+lane" class="track-row audio-track">
        <div class="track-label track-card" :title="'音频轨道 '+(lane+1)+'：同轨道片段不能重叠，不同轨道可同时出声'">
          <span class="layer-name">音频 {{ lane + 1 }}<small v-if="!clipsOnAudioTrack(lane).length"> · 空</small></span><button class="layer-toggle" :disabled="disabled" :aria-label="(audioTrackMuted(lane) ? '取消静音 音频 ' + (lane+1) : '静音 音频 ' + (lane+1))" :aria-pressed="audioTrackMuted(lane)" :title="audioTrackMuted(lane) ? '取消静音' : '静音这条音频轨道'" @click="toggleAudioTrack(lane,'muted')">静</button><button class="layer-toggle layer-solo" :disabled="disabled" :aria-label="(audioTrackSoloed(lane) ? '取消独奏 音频 ' + (lane+1) : '独奏 音频 ' + (lane+1))" :aria-pressed="audioTrackSoloed(lane)" :title="audioTrackSoloed(lane) ? '取消独奏' : '独奏：只播这条音频轨道'" @click="toggleAudioTrack(lane,'solo')">独</button>
          <button :disabled="disabled" title="选择或导入音频，在播放头添加片段" @click="openAudioAddMenu($event,lane)">＋音频</button>
        </div>
        <div class="track-lane audio-lane" tabindex="-1" @pointerdown.self="clickAudioLane($event)" @contextmenu.prevent.stop="openAudioAddMenu($event,lane)">
          <div v-for="clip in clipsOnAudioTrack(lane)" :key="clip.id" class="model-clip audio-clip" tabindex="0" :class="{selected:audioSelection===clip.id,multiselected:audioSelection===clip.id,muted:clip.muted}" :aria-label="'音频片段 '+clip.name" :title="audioTitle(clip)" :style="{left:clip.start/duration*100+'%',width:clip.duration/duration*100+'%'}" @contextmenu.prevent.stop="openAudioMenu($event,clip)" @pointerdown="beginAudio($event,clip,'move')" @pointermove="moveAudio" @pointerup="endAudio" @pointercancel="endAudio" @lostpointercapture="endAudio">
            <span class="trim-handle left" title="调整音频入点" @pointerdown.stop="beginAudio($event,clip,'left')"></span>
            <AudioWaveform :clip="clip" :beats="beatSnap" />
            <span class="clip-name">{{clip.name}}</span><small>{{formatTimecode(clip.duration,fps)}}</small>
            <span class="trim-handle right" title="调整音频出点" @pointerdown.stop="beginAudio($event,clip,'right')"></span>
            <span class="audio-scrub" title="拖动波形定位播放头（吸附节拍）；拖动上方标签条移动片段" @pointerdown.stop="scrubAudio($event,clip)" @contextmenu.prevent.stop="openAudioMenu($event,clip)"></span>
            <span v-for="key in visibleVolumeKeys(clip)" :key="clip.id+'-vk-'+key.source" class="audio-volume-key" :aria-label="'音量关键帧 '+Math.round(key.value*100)+'%'" :style="{left:(key.time-clip.start)/clip.duration*100+'%',bottom:'calc(3px + (100% - 20px) * '+key.value+')'}" :title="'音量关键帧 · '+formatTimecode(key.time,fps)+' · '+Math.round(key.value*100)+'%'+(key.easing==='linear' ? '' : ' · '+easingLabel(key.easing))+' · 上下拖动改音量，左右拖动改时间'" @pointerdown.stop="beginVolumeKey($event,clip,key)"></span>
          </div>
          <b v-if="snapTime!==null" class="snap-guide" :style="{left:snapTime/duration*100+'%'}"></b><b class="playhead" :style="{left:time/duration*100+'%'}"></b>
        </div>
      </div>
      <div v-if="!clips.length && !backgroundClips.length && !audioClips.length" class="timeline-empty">添加模型或图片后，每个片段都会拥有独立轨道</div>
    </div></div></div>
    <Teleport to="body"><div v-if="boxRect" class="key-marquee" :style="boxRect"></div><div v-if="menu" class="timeline-menu" role="menu" :aria-label="menu.title" :style="{left:menu.x+'px',top:menu.y+'px'}" @keydown.esc.prevent.stop="closeMenu" @keydown="selectionShortcut" @contextmenu.prevent>
      <strong :title="menu.title">{{menu.title}}</strong><small v-if="menuLocked" class="menu-status">图层已锁定，解锁后可编辑</small>
      <template v-if="menu.kind==='track' || menu.kind==='clip'">
        <template v-if="menu.kind==='clip'"><span class="menu-section">片段 · 已选 {{selectedClips.length || 1}} 个</span>
          <button role="menuitem" :disabled="disabled || menuLocked || !selectedClips.length" @click="copyModels();closeMenu()">复制所选片段<kbd>Ctrl+C</kbd></button>
          <button role="menuitem" :disabled="disabled || menuLocked || !splitCount || !!splitError" :title="splitCount ? '切割播放头经过的 '+splitCount+' 个所选片段' : '播放头需位于所选片段内部'" @click="splitModels();closeMenu()">在播放头切割<span class="menu-hint">{{splitCount}} 个可切割</span></button>
          <button role="menuitem" class="menu-delete" :disabled="disabled || menuLocked || !selectedClips.length" @click="deleteClips();closeMenu()">删除所选片段<kbd>Delete</kbd></button>
        </template>
        <button role="menuitem" :disabled="disabled || !clipClipboard" @click="pasteModels();closeMenu()">粘贴片段到播放头<kbd>Ctrl+V</kbd></button>
        <span class="menu-section">图层 · {{layerName(menu.track)}}</span>
        <button role="menuitem" :disabled="disabled" @click="toggleLayer(menu.track,'layerLocked');closeMenu()">{{layerLocked(menu.track) ? '解锁图层' : '锁定图层'}}</button>
        <button role="menuitem" :disabled="disabled" @click="toggleLayer(menu.track,'layerHidden');closeMenu()">{{layerHidden(menu.track) ? '显示图层' : '隐藏图层'}}</button>
        <button role="menuitem" :disabled="menuLocked || tracks.indexOf(menu.track)<=0" @click="stepLayer(-1)">向上一层</button>
        <button role="menuitem" :disabled="menuLocked || tracks.indexOf(menu.track)===tracks.length-1" @click="stepLayer(1)">向下一层</button>
        <label>图层名称<input aria-label="编辑图层名称" maxlength="100" v-model="layerMenuName" :disabled="menuLocked" @keydown.enter.prevent.stop="renameMenuLayer" /></label>
        <button role="menuitem" :disabled="menuLocked || !layerMenuName.trim()" @click="renameMenuLayer">重命名图层</button>
        <span class="menu-section">{{menu.scope}}关键帧 · {{menu.items.length}} 帧</span>
        <button role="menuitem" :disabled="disabled || !menu.items.length" @click="selectMenuKeys">全选{{menu.scope}}关键帧</button>
        <button role="menuitem" :disabled="disabled" @click="showKeyRows=true;closeMenu()">展开关键帧</button>
        <button role="menuitem" class="menu-delete" :disabled="menuLocked || !menu.items.length" @click="deleteMenuKeys">删除{{menu.scope}}全部关键帧</button>
        <button role="menuitem" :disabled="editDisabled || !keyClipboard" @click="pasteSelection">粘贴关键帧到播放头<kbd>Ctrl+V</kbd></button>
      </template>
      <template v-else-if="menu.kind==='keys'">
        <fieldset class="menu-edit-fields" :disabled="menuLocked">
          <template v-if="selectedKeys.length===1"><label>数值{{menuDisplay.unit}}<input aria-label="编辑关键帧数值" type="number" :min="menuDisplay.min" :max="menuDisplay.max" step="1" v-model.number="menuValue" /></label><label>时间码<TimecodeInput label="编辑关键帧时间" :value="menuTime" :fps="fps" :max="duration" @change="menuTime=$event" /></label></template>
          <label>缓动<select aria-label="关键帧缓动" v-model="menuPreset"><option v-for="preset in EASING_PRESETS" :key="preset.value" :value="preset.value">{{preset.label}}</option><option value="custom">自定义曲线</option></select></label><button role="menuitem" @click="openCurveEditor">编辑速度曲线…</button><button role="menuitem" @click="applyMenuEdit">应用关键帧编辑</button>
        </fieldset>
        <span class="menu-section">所选关键帧 · {{selectedKeys.length}} 帧</span>
        <button role="menuitem" :disabled="disabled || !selectedKeys.length" @click="copySelection">复制关键帧<kbd>Ctrl+C</kbd></button>
        <button role="menuitem" :disabled="editDisabled || !keyClipboard" @click="pasteSelection">粘贴关键帧到播放头<kbd>Ctrl+V</kbd></button>
        <button role="menuitem" class="menu-delete" :disabled="menuLocked || !selectedKeys.length" @click="deleteSelection();closeMenu()">删除选中关键帧<kbd>Delete</kbd></button>
      </template>
      <template v-else-if="menu.kind==='event'">
        <fieldset class="menu-edit-fields" :disabled="menuLocked">
          <label>{{menu.event.type==='motion' ? '动作开始时间' : '表情切换时间'}}<TimecodeInput label="动作表情开始时间" :value="eventMenuStart" :fps="fps" :max="duration" @change="eventMenuStart=$event" /></label>
          <template v-if="menu.event.type==='motion'"><label>播放时长<TimecodeInput label="动作表情播放时长" :value="eventMenuDuration" :fps="fps" :min="1/fps" :max="duration" @change="eventMenuDuration=$event" /></label><label>源动作入点<TimecodeInput label="源动作入点" :value="eventMenuOffset" :fps="fps" :max="menu.event.sourceDuration || menu.event.duration" @change="eventMenuOffset=$event" /></label></template>
          <button role="menuitem" @click="applyEventMenu">应用{{menu.event.type==='motion' ? '动作' : '表情'}}编辑</button>
        </fieldset>
        <span class="menu-section">{{menu.event.type==='motion' ? '动作片段' : '表情切换帧'}}</span>
        <button role="menuitem" :disabled="disabled" @click="copyEvent">复制{{menu.event.type==='motion' ? '动作' : '表情'}}<kbd>Ctrl+C</kbd></button>
        <button role="menuitem" :disabled="editDisabled || !eventClipboard" @click="pasteCopiedEvent">粘贴{{(eventClipboard?.type || menu.event.type)==='expression' ? '表情' : '动作'}}到播放头<kbd>Ctrl+V</kbd></button>
        <button role="menuitem" class="menu-delete" :disabled="menuLocked" @click="deleteEvent">删除{{menu.event.type==='motion' ? '动作片段' : '表情切换帧'}}<kbd>Delete</kbd></button>
      </template>
      <template v-else-if="menu.kind==='event-lane'"><small>{{menu.eventType==='motion' ? '动作使用独立时段，不可重叠' : '表情从切换帧保持到下一表情帧'}}</small><button role="menuitem" :disabled="editDisabled || !eventClipboard || eventClipboard.type!==menu.eventType" @click="pasteCopiedEvent">粘贴{{menu.eventType==='motion' ? '动作' : '表情'}}到播放头<kbd>Ctrl+V</kbd></button></template>
      <template v-else-if="menu.kind==='property'"><span class="menu-section">该参数 · {{menu.items.length}} 帧</span><button role="menuitem" :disabled="disabled || !menu.items.length" @click="selectMenuKeys">全选该参数关键帧</button><button role="menuitem" :disabled="editDisabled || !keyClipboard" @click="pasteSelection">粘贴关键帧到播放头<kbd>Ctrl+V</kbd></button><button role="menuitem" class="menu-delete" :disabled="menuLocked || !menu.items.length" @click="deleteMenuKeys">删除该参数全部关键帧</button></template>
      <template v-if="menu.kind==='background'">
        <template v-if="menu.background">
          <span class="menu-section">背景片段 · {{backgroundLabel(menu.background)}}</span>
          <label v-if="menu.background.kind==='color'">颜色<input type="color" aria-label="背景片段颜色" :value="backgroundMenuColor" @input="applyBackgroundColor" @focus="emit('begin-edit')" @blur="emit('end-edit')" /></label>
          <button role="menuitem" :disabled="disabled" @click="copyBackgroundClip()">复制背景片段<kbd>Ctrl+C</kbd></button>
          <button role="menuitem" :disabled="disabled || !backgroundClipboard" @click="pasteBackgroundClip()">粘贴背景片段<kbd>Ctrl+V</kbd></button>
          <button role="menuitem" :disabled="disabled || !playheadInsideClip(menu.background)" @click="emit('split-background',menu.background.id);closeMenu()">在播放头切割</button><button role="menuitem" :disabled="disabled" @click="emit('background-edit',menu.background.id,{start:props.time});closeMenu()">移动到播放头</button>
          <button role="menuitem" :disabled="disabled" @click="emit('background-edit',menu.background.id,{duration:props.duration-menu.background.start});closeMenu()">延伸到工程结尾</button>
          <button role="menuitem" class="menu-delete" :disabled="disabled" @click="emit('delete-background',menu.background.id);closeMenu()">删除背景片段</button>
        </template>
        <template v-else>
          <span class="menu-history">背景轨道 · {{formatTimecode(props.time,props.fps)}} 起</span>
          <button v-if="backgroundClipboard" role="menuitem" :disabled="disabled" @click="pasteBackgroundClip()">粘贴背景片段<kbd>Ctrl+V</kbd></button>
          <span class="menu-hint">用左侧「＋纯色」「＋图片」添加片段；选中片段后 Ctrl+C 复制。</span>
        </template>
      </template>
      <template v-else-if="menu.kind==='background-color'">
        <span class="menu-section">添加纯色背景 · {{formatTimecode(props.time,props.fps)}} 起</span>
        <div class="background-swatches" role="group" aria-label="预设背景颜色"><button v-for="preset in backgroundPresets" :key="preset.color" role="menuitem" class="background-swatch" :style="{background:preset.color}" :aria-label="preset.label+' '+preset.color" :title="preset.label+' '+preset.color" :disabled="disabled" @click="addBackgroundColor(preset.color)"></button></div>
        <label>自定义颜色<input type="color" aria-label="新背景颜色" :value="backgroundDraftColor" @input="backgroundDraftColor=$event.target.value" /></label>
        <button role="menuitem" :disabled="disabled" @click="addBackgroundColor(backgroundDraftColor)">用这个颜色添加</button>
      </template>
      <template v-else-if="menu.kind==='background-image'">
        <span class="menu-section">添加图片背景 · {{formatTimecode(props.time,props.fps)}} 起</span>
        <button v-for="asset in (menu.assets || [])" :key="asset.id" role="menuitem" :disabled="disabled" @click="addBackgroundImage(asset)">{{asset.name}}</button>
        <span v-if="!(menu.assets || []).length" class="menu-hint">素材库里还没有图片，可以先导入一张。</span>
        <button role="menuitem" :disabled="disabled" @click="importBackgroundImage">导入新图片…</button>
      </template>
      <template v-else-if="menu.kind==='audio-add'">
        <span class="menu-section">添加音频 · 轨道 {{ (menu.track ?? 0) + 1 }} · {{formatTimecode(props.time,props.fps)}} 起</span>
        <button v-for="asset in (menu.assets || [])" :key="asset.id" role="menuitem" :disabled="disabled" @click="addAudioClip(asset,menu.track)">{{asset.name}}<span class="menu-hint">{{asset.duration ? asset.duration.toFixed(1)+' 秒' : ''}}</span></button>
        <span v-if="!(menu.assets || []).length" class="menu-hint">素材库里还没有音频，可以先导入一段。</span>
        <button role="menuitem" :disabled="disabled" @click="importAudio(menu.track)">导入新音频…</button>
      </template>
      <template v-else-if="menu.kind==='audio' && menu.audio">
        <fieldset class="menu-edit-fields" :disabled="disabled">
          <label>音量 %<input aria-label="音频音量" type="number" min="0" max="100" step="1" v-model.number="audioMenuVolume" /></label>
          <label>淡入 秒<input aria-label="音频淡入" type="number" min="0" step="0.1" v-model.number="audioMenuFadeIn" /></label>
          <label>淡出 秒<input aria-label="音频淡出" type="number" min="0" step="0.1" v-model.number="audioMenuFadeOut" /></label>
          <label>滤镜<select aria-label="音频滤镜" v-model="audioMenuFilter"><option v-for="preset in AUDIO_FILTER_PRESETS" :key="preset.value" :value="preset.value">{{preset.label}}</option></select></label>
          <button role="menuitem" @click="applyAudioMenu">应用音量、淡入淡出与滤镜</button>
        </fieldset>
        <fieldset class="menu-edit-fields" :disabled="disabled">
          <label>关键帧音量 %<input aria-label="音量关键帧数值" type="number" min="0" max="100" step="1" v-model.number="audioMenuKeyValue" /></label>
          <label>缓动<select aria-label="音量关键帧缓动" v-model="audioMenuKeyEasing"><option v-for="preset in EASING_PRESETS" :key="preset.value" :value="preset.value">{{preset.label}}</option></select></label>
          <button role="menuitem" :disabled="!playheadCoversClip(menu.audio)" @click="applyVolumeKeyframe">在播放头添加或更新关键帧</button>
          <button role="menuitem" :disabled="!audioMenuKeyframe" @click="removePlayheadVolumeKeyframe">删除播放头处关键帧</button>
          <button role="menuitem" :disabled="!(menu.audio.volumeKeyframes || []).length" @click="clearVolumeKeyframes">清空音量关键帧</button>
          <small class="menu-hint">关键帧记录素材内的音量包络，与总音量、淡入淡出相乘；时间线上拖动菱形可改时间与音量。</small>
        </fieldset>
        <span class="menu-section">音频片段 · {{menu.audio.name}}</span>
        <button role="menuitem" :disabled="disabled" @click="copyAudioClip()">复制音频片段<kbd>Ctrl+C</kbd></button>
        <button role="menuitem" :disabled="disabled || !audioClipboard" @click="pasteAudioClip()">粘贴音频片段<kbd>Ctrl+V</kbd></button>
        <button role="menuitem" :disabled="disabled || !playheadInsideClip(menu.audio)" @click="emit('split-audio',menu.audio.id);closeMenu()">在播放头切割</button><button role="menuitem" :disabled="disabled" @click="emit('audio-edit',menu.audio.id,{start:props.time});closeMenu()">移动到播放头</button>
        <button role="menuitem" :disabled="disabled" @click="emit('audio-edit',menu.audio.id,{duration:props.duration-menu.audio.start});closeMenu()">延伸到工程结尾</button>
        <button role="menuitem" class="menu-delete" :disabled="disabled" @click="emit('delete-audio',menu.audio.id);closeMenu()">删除音频片段</button>
      </template>
      <small class="menu-footer">修改可撤销 <kbd>Ctrl+Z</kbd> · 关闭 <kbd>Esc</kbd></small>
    </div></Teleport>
    <Teleport to="body"><KeyframeCurveEditor v-if="curveEdit" :value="curveEdit.easing" :description="curveEdit.description" :disabled="disabled || !curveEdit.refs.length || refsLocked(curveEdit.refs)" @apply="applyCurve" @cancel="closeCurve" /></Teleport>
  </section>
</template>
<script setup>
import { ref,computed,watch,nextTick,onMounted,onBeforeUnmount } from 'vue'
import KeyframeCurveEditor from './KeyframeCurveEditor.vue'
import {EASING_PRESETS,normalizeEasing,easingLabel} from '../keyframeEasing.js'
import { AUDIO_TRACK_LIMIT, audioClipTemplate, backgroundClipTemplate, isMediaClip, isVideoClip } from '../mediaTracks.js'
import {copyClips,planClipMove,planClipSplit} from '../clipSelection.js'
import { eventRange,eventProgress,planEventEdit } from '../timelineEvents.js'
import { copyKeyRefs,planKeyPaste } from '../keyframeClipboard.js'
import { stepFrameTime } from '../sceneFrameRate.js'
import { numericDisplay } from '../numericDisplay.js'
import TimecodeInput from './TimecodeInput.vue'
import AudioWaveform from './AudioWaveform.vue'
import ClipThumb from './ClipThumb.vue'
import { formatTimecode } from '../timecode.js'
import { editTimelineClip,timelineTicks } from '../timelineEditing.js'
import { assetStore } from '../assetStore.js'
import { collectBeats,snapToBeats } from '../audioBeats.js'
import { AUDIO_FILTER_PRESETS, audioFilterLabel, normalizeAudioFilter } from '../audioFilters.js'
import { nearestVolumeKeyframe, normalizeVolumeKeyframes, removeVolumeKeyframe, setVolumeKeyframe, sourceAtTimeline, timelineAtSource, visibleVolumeKeys } from '../audioVolume.js'
import { groupedClipKeys,visibleClipKeys,uniqueKeyRefs,planKeyRefMove } from '../timelineKeyframes.js'
const props=defineProps({clips:Array,backgroundClips:{type:Array,default:()=>[]},audioClips:{type:Array,default:()=>[]},audioTrackState:{type:Object,default:()=>({})},selectedIds:Array,duration:Number,fps:Number,time:Number,selectedId:String,selected:Object,labels:Object,pose:Object,runtimes:Object,transformFields:Array,disabled:Boolean,navigationDisabled:Boolean})
const emit=defineEmits(['selection-change','clear-selection','batch-clips','batch-keys','select','seek','layer-state','background-track-state','audio-track-state','rename-layer','reorder-layer','edit-clip','remove-key','move-key','toggle-key','edit-key-value','edit-event','paste-event','remove-event','begin-edit','end-edit','delete-selected','add-background-color','background-edit','delete-background','split-background','background-image','import-background-image','paste-background','add-audio','import-audio','audio-edit','delete-audio','split-audio','paste-audio'])
const timelineRoot=ref(null),scrollArea=ref(null),ruler=ref(null),selectedKeys=ref([]),boxMode=ref(true),boxRect=ref(null),menu=ref(null),menuValue=ref(0),menuNativeValue=ref(0),menuTime=ref(0),menuEasing=ref('linear')
const curveEdit=ref(null)
const menuPreset=computed({get:()=>typeof menuEasing.value==='object' ? 'custom' : menuEasing.value,set:value=>{if(value==='custom')openCurveEditor();else menuEasing.value=value}})
function openCurveEditor(){
  if(props.disabled)return
  stopFrameStep()
  const refs=uniqueKeyRefs(selectedKeys.value.length ? selectedKeys.value : currentKey.value ? [{clipId:props.selectedId,key:keyProperty.value,frame:currentKey.value.frame}] : [])
  if(!refs.length || refsLocked(refs))return
  const effective=refs.filter(item=>{const keys=props.clips.find(c=>c.id===item.clipId)?.keyframes[item.key] || [];return keys.some(k=>k.frame>item.frame)})
  const first=effective[0] || refs[0],owner=props.clips.find(c=>c.id===first.clipId),key=owner?.keyframes[first.key]?.find(k=>k.frame===first.frame)
  curveEdit.value={refs:effective,easing:normalizeEasing(menu.value?.kind==='keys' ? menuEasing.value : key?.easing),description:effective.length ? '已选 '+refs.length+' 帧 · 应用于 '+effective.length+' 个后续区间'+(refs.length>effective.length ? '（末帧无后续区间）' : '') : '此帧之后没有关键帧，请先添加下一帧。'}
  closeMenu()
}
function applyCurve(easing){if(!curveEdit.value || props.disabled || refsLocked(curveEdit.value.refs))return;emit('batch-keys',curveEdit.value.refs,{type:'edit',easing});closeCurve()}
function closeCurve(){curveEdit.value=null;nextTick(()=>timelineRoot.value?.focus({preventScroll:true}))}
const selectedClips=ref([...(props.selectedIds || [])]),clipClipboard=ref(null)
watch(()=>props.selectedIds,ids=>{if(JSON.stringify(ids)!==JSON.stringify(selectedClips.value)){selectedClips.value=[...(ids || [])];clearDetails()}},{flush:'sync'})
watch(selectedClips,ids=>{if(JSON.stringify(ids)!==JSON.stringify(props.selectedIds))emit('selection-change',ids)},{flush:'sync'})
function clearDetails(){stopFrameStep();selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value='';audioSelection.value='';closeMenu()}
function clearSelection(){clearDetails();selectedClips.value=[];emit('clear-selection')}
defineExpose({modelShortcut,copyKeyEvent,pasteKeyEvent,clearDetails,clearSelection})
const keyClipboard=ref(null),clipboardNotice=ref(''),selectedEventId=ref(''),eventClipboard=ref(null),eventMenuStart=ref(0),eventMenuDuration=ref(0),eventMenuOffset=ref(0)
const editDisabled=computed(()=>props.disabled || !!props.selected?.layerLocked)
const refsLocked=items=>items.some(item=>props.clips.find(c=>c.id===item.clipId)?.layerLocked)
const splitError=computed(()=>planClipSplit(props.clips,selectedClips.value,props.time).error)
const splitCount=computed(()=>props.clips.filter(c=>selectedClips.value.includes(c.id) && !c.layerLocked && props.time>c.start+1e-8 && props.time<c.start+c.duration-1e-8).length)
const menuLocked=computed(()=>props.disabled || (menu.value?.track!=null ? layerLocked(menu.value.track) : menu.value?.kind==='keys' ? refsLocked(selectedKeys.value) : !!props.selected?.layerLocked))
function layerLocked(track){return !!props.clips.find(c=>c.track===track)?.layerLocked}
function layerHidden(track){return !!props.clips.find(c=>c.track===track)?.layerHidden}
function layerSolo(track){return !!props.clips.find(c=>c.track===track)?.layerSolo}
const backgroundHidden=computed(()=>props.backgroundClips.some(c=>c.layerHidden))
const backgroundSolo=computed(()=>props.backgroundClips.some(c=>c.layerSolo))
const backgroundSoloActive=computed(()=>backgroundSolo.value || props.clips.some(c=>c.layerSolo))
function toggleBackgroundTrack(key){
  if(props.disabled)return
  const current=key==='layerHidden' ? backgroundHidden.value : backgroundSolo.value
  emit('background-track-state',{[key]:!current})
}
function audioTrackMuted(track){return props.audioTrackState?.[track]?.muted === true}
function audioTrackSoloed(track){return props.audioTrackState?.[track]?.solo === true}
function toggleAudioTrack(track,key){
  if(props.disabled)return
  const current=key==='muted' ? audioTrackMuted(track) : audioTrackSoloed(track)
  emit('audio-track-state',track,{[key]:!current})
}
function toggleLayer(track,key){if(props.disabled)return;stopFrameStep();selectedKeys.value=[];selectedEventId.value='';selectedClips.value=[];emit('layer-state',track,{[key]:!props.clips.find(c=>c.track===track)?.[key]})}
const selectedEvent=computed(()=>props.selected?.events.find(e=>e.id===selectedEventId.value))
const pastePlan=computed(()=>planKeyPaste(props.clips,keyClipboard.value,props.selectedId,props.time,props.fps,Object.fromEntries(Object.entries(props.runtimes || {}).map(([id,r])=>[id,r.groups]))))
function copySelection(){if(props.disabled || !selectedKeys.value.length)return;clipClipboard.value=null;eventClipboard.value=null;stopFrameStep();keyClipboard.value=copyKeyRefs(props.clips,selectedKeys.value,props.fps);clipboardNotice.value='已复制 '+keyClipboard.value.keys.length+' 帧';closeMenu()}
function pasteSelection(){if(editDisabled.value || !keyClipboard.value)return;stopFrameStep();const plan=pastePlan.value;if(plan.error){clipboardNotice.value=plan.error;closeMenu();return}selectedClips.value=[];emit('batch-keys',[],{type:'paste',entries:plan.entries});selectedKeys.value=plan.entries.map(({clipId,key,frame})=>({clipId,key,frame}));const first=plan.entries.find(e=>e.clipId===props.selectedId);if(first)keyProperty.value=first.key;showKeyRows.value=true;clipboardNotice.value='已粘贴 '+plan.entries.length+' 帧';closeMenu();timelineRoot.value?.focus({preventScroll:true})}
function chooseClip(clip,e){
  backgroundSelection.value=''
  audioSelection.value=''
  if(props.disabled || clip.layerLocked)return
  selectedKeys.value=[];selectedEventId.value=''
  if(e?.ctrlKey || e?.metaKey || e?.shiftKey)selectedClips.value=selectedClips.value.includes(clip.id) ? selectedClips.value.filter(id=>id!==clip.id) : [...selectedClips.value,clip.id]
  else if(!selectedClips.value.includes(clip.id))selectedClips.value=[clip.id]
  if(selectedClips.value.includes(clip.id))emit('select',clip.id)
}
function copyModels(){if(props.disabled)return;clipClipboard.value=copyClips(props.clips,selectedClips.value,props.fps);keyClipboard.value=null;eventClipboard.value=null;clipboardNotice.value='已复制 '+(clipClipboard.value?.clips.length || 0)+' 个片段'}
async function pasteModels(){if(props.disabled || !clipClipboard.value)return;const previous=new Set(props.clips.map(c=>c.id));emit('batch-clips',{type:'paste',clipboard:clipClipboard.value});await nextTick();const added=props.clips.filter(c=>!previous.has(c.id));if(added.length){selectedClips.value=added.map(c=>c.id);selectedKeys.value=[];selectedEventId.value='';clipboardNotice.value='已粘贴 '+added.length+' 个片段'}}
async function splitModels(){if(props.disabled || !splitCount.value)return;const previous=new Set(props.clips.map(c=>c.id));emit('batch-clips',{type:'split',ids:[...selectedClips.value]});await nextTick();const added=props.clips.filter(c=>!previous.has(c.id));if(added.length)selectedClips.value=added.map(c=>c.id)}
function renameMenuLayer(){if(menuLocked.value || !layerMenuName.value.trim())return;emit('rename-layer',menu.value.track,layerMenuName.value);closeMenu()}
function selectMenuKeys(){selectedClips.value=[];selectedEventId.value='';selectedKeys.value=[...menu.value.items];showKeyRows.value=true;closeMenu()}
function deleteMenuKeys(){if(menuLocked.value)return;emit('batch-keys',menu.value.items,{type:'delete'});selectedKeys.value=[];closeMenu()}
function deleteClips(){if(props.disabled || !selectedClips.value.length)return;emit('batch-clips',{type:'delete',ids:[...selectedClips.value]});selectedClips.value=[]}
function modelShortcut(e){
  if(e.defaultPrevented || e.isComposing || e.target.closest('input,select,textarea,[contenteditable]'))return false
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();clearSelection();return true}
  const key=e.key.toLowerCase()
  if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ((key==='c' && (selectedClips.value.length || backgroundSelection.value)) || (key==='v' && (clipClipboard.value || backgroundClipboard.value)))){
    e.preventDefault();e.stopPropagation()
    if(!e.repeat){
      if(key==='c')selectedClips.value.length ? copyModels() : copyBackgroundClip()
      else clipClipboard.value ? pasteModels() : pasteBackgroundClip()
    }
    return true
  }
  if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ((key==='c' && audioSelection.value) || (key==='v' && audioClipboard.value))){
    e.preventDefault();e.stopPropagation()
    if(!e.repeat)key==='c' ? copyAudioClip() : pasteAudioClip()
    return true
  }
  if(e.key==='Delete' && selectedClips.value.length && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey){e.preventDefault();e.stopPropagation();if(!e.repeat)deleteClips();return true}
  if(e.key==='Delete' && backgroundSelection.value && !selectedClips.value.length && !selectedKeys.value.length && !selectedEvent.value && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey){e.preventDefault();e.stopPropagation();if(!e.repeat)deleteBackgroundSelection();return true}
  if(e.key==='Delete' && audioSelection.value && !selectedClips.value.length && !selectedKeys.value.length && !selectedEvent.value && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey){e.preventDefault();e.stopPropagation();if(!e.repeat)deleteAudioSelection();return true}
  return false
}
function copyKeyEvent(e){if(e.target.closest('input,select,textarea,[contenteditable]') || props.disabled)return;if(selectedClips.value.length){e.preventDefault();copyModels()}else if(selectedEvent.value){e.preventDefault();copyEvent()}else if(selectedKeys.value.length){e.preventDefault();copySelection();e.clipboardData?.setData('text/plain',JSON.stringify({type:'tomori-keyframes',...keyClipboard.value}))}else if(backgroundSelection.value){e.preventDefault();copyBackgroundClip()}else if(audioSelection.value){e.preventDefault();copyAudioClip()}}
function pasteKeyEvent(e){if(e.target.closest('input,select,textarea,[contenteditable]') || props.disabled)return;if(clipClipboard.value){e.preventDefault();pasteModels()}else if(eventClipboard.value && !selectedKeys.value.length){e.preventDefault();pasteCopiedEvent()}else if(keyClipboard.value){e.preventDefault();pasteSelection()}else if(backgroundClipboard.value){e.preventDefault();pasteBackgroundClip()}else if(audioClipboard.value){e.preventDefault();pasteAudioClip()}}
const isKeySelected=(clipId,key,frame)=>selectedKeys.value.some(k=>k.clipId===clipId && k.key===key && k.frame===frame)
function selectKeys(items,e){selectedClips.value=[];selectedEventId.value='';if(e?.shiftKey || e?.ctrlKey || e?.metaKey){const all=items.every(k=>isKeySelected(k.clipId,k.key,k.frame));selectedKeys.value=all ? selectedKeys.value.filter(k=>!items.some(i=>i.clipId===k.clipId && i.key===k.key && i.frame===k.frame)) : uniqueKeyRefs([...selectedKeys.value,...items])}else if(!items.every(k=>isKeySelected(k.clipId,k.key,k.frame)))selectedKeys.value=uniqueKeyRefs(items)}
function deleteSelection(){if(props.disabled || refsLocked(selectedKeys.value) || !selectedKeys.value.length)return;emit('batch-keys',selectedKeys.value,{type:'delete'});selectedKeys.value=[]}
let frameStepTimer=null,frameStepKey=null,keyStepEditing=false
function stopFrameStep(){clearTimeout(frameStepTimer);clearInterval(frameStepTimer);frameStepTimer=null;frameStepKey=null;if(keyStepEditing){keyStepEditing=false;emit('end-edit')}}
function endFrameStep(e){if(e.key===frameStepKey)stopFrameStep()}
function moveFrame(key){if(props.navigationDisabled || dragging.value || box || menu.value){stopFrameStep();return}const direction=key==='ArrowLeft' ? -1 : 1;if(selectedKeys.value.length){if(props.disabled || refsLocked(selectedKeys.value)){stopFrameStep();return}const refs=selectedKeys.value,plan=planKeyRefMove(props.clips,refs,direction,props.fps);if(plan.delta){selectedKeys.value=plan.items;emit('batch-keys',refs,{type:'move',delta:plan.delta})}}else emit('seek',stepFrameTime(props.time,props.fps,direction,props.duration))}
function startFrameStep(key){stopFrameStep();timelineRoot.value?.focus({preventScroll:true});frameStepKey=key;if(selectedKeys.value.length && !props.disabled){keyStepEditing=true;emit('begin-edit')}moveFrame(key);if(!frameStepKey)return;frameStepTimer=setTimeout(()=>{moveFrame(key);if(frameStepKey)frameStepTimer=setInterval(()=>moveFrame(key),40)},350)}
function focusTimeline(e){if(!e.target.closest('input,select,textarea,[contenteditable]'))timelineRoot.value?.focus({preventScroll:true})}
function selectionShortcut(e){if(modelShortcut(e))return;if(e.defaultPrevented || e.isComposing || e.target.closest('input,select,textarea,[contenteditable]'))return;if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && ['c','v'].includes(e.key.toLowerCase())){const copy=e.key.toLowerCase()==='c';if(selectedEvent.value || (eventClipboard.value && !selectedKeys.value.length)){e.preventDefault();e.stopPropagation();if(!e.repeat)(copy ? copyEvent() : pasteCopiedEvent())}else if(copy ? selectedKeys.value.length : keyClipboard.value){e.preventDefault();e.stopPropagation();if(!e.repeat)(copy ? copySelection() : pasteSelection())}return}if(['ArrowLeft','ArrowRight'].includes(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !menu.value){e.preventDefault();e.stopPropagation();if(!e.repeat)startFrameStep(e.key);return}if(e.key==='Delete' && (selectedEvent.value || selectedKeys.value.length)){e.preventDefault();e.stopPropagation();selectedEvent.value ? deleteEvent() : deleteSelection()}else if(e.key==='Escape'){e.stopPropagation();closeMenu();selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value='';audioSelection.value=''}}
watch(()=>props.clips,()=>{selectedClips.value=selectedClips.value.filter(id=>props.clips.some(c=>c.id===id && !c.layerLocked));selectedKeys.value=selectedKeys.value.filter(i=>props.clips.find(c=>c.id===i.clipId)?.keyframes[i.key]?.some(k=>k.frame===i.frame))},{deep:true})
let box=null
function beginBox(e,kind='keys'){if(props.disabled || e.button!==0)return;selectedEventId.value='';backgroundSelection.value='';audioSelection.value='';closeMenu();timelineRoot.value.focus({preventScroll:true});if(kind==='clips')selectedKeys.value=[];box={kind,x:e.clientX,y:e.clientY,base:e.shiftKey || e.ctrlKey || e.metaKey ? (kind==='clips' ? [...selectedClips.value] : [...selectedKeys.value]) : []};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();updateBox(e)}
function updateBox(e){if(!box)return;const left=Math.min(box.x,e.clientX),top=Math.min(box.y,e.clientY),right=Math.max(box.x,e.clientX),bottom=Math.max(box.y,e.clientY);boxRect.value={left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'};if(box.kind==='clips'){const ids=[],viewport=scrollArea.value.getBoundingClientRect();for(const el of timelineRoot.value.querySelectorAll('.model-clip[data-clip-id]')){const r=el.getBoundingClientRect(),c=props.clips.find(c=>c.id===el.dataset.clipId);if(!c?.layerLocked && Math.min(r.right,viewport.right)>=Math.max(left,viewport.left+170,r.left) && Math.min(r.bottom,viewport.bottom)>=Math.max(top,viewport.top+30,r.top) && r.left<=right && r.top<=bottom)ids.push(c.id)}selectedClips.value=[...new Set([...box.base,...ids])];return}if(Math.hypot(e.clientX-box.x,e.clientY-box.y)<3)return;selectedClips.value=[];const items=[];for(const el of timelineRoot.value.querySelectorAll('[data-key-items]')){const r=el.getBoundingClientRect(),viewport=scrollArea.value.getBoundingClientRect();if(r.right>=left && r.left<=right && r.bottom>=top && r.top<=bottom && r.right>viewport.left+170 && r.left<viewport.right && r.top>=viewport.top+30 && r.bottom<=viewport.bottom)items.push(...JSON.parse(el.dataset.keyItems))}selectedKeys.value=uniqueKeyRefs([...box.base,...items]).filter(item=>!props.clips.find(c=>c.id===item.clipId)?.layerLocked)}
function endBox(){if(box?.kind==='clips'){if(selectedClips.value.length)emit('select',selectedClips.value[0]);else emit('clear-selection')}box=null;boxRect.value=null}
function allRefs(clips,key){return clips.flatMap(c=>Object.entries(c.keyframes).filter(([id])=>!key || id===key).flatMap(([id,keys])=>keys.map(k=>({clipId:c.id,key:id,frame:k.frame}))))}
async function positionMenu(e,data){if(props.disabled)return;endBox();menu.value={...data,x:Math.max(4,Math.min(e.clientX,window.innerWidth-252)),y:4};const current=menu.value;await nextTick();if(menu.value!==current)return;const rect=document.querySelector('.timeline-menu')?.getBoundingClientRect();if(rect){current.x=Math.max(4,Math.min(e.clientX,window.innerWidth-rect.width-4));current.y=Math.max(4,Math.min(e.clientY,window.innerHeight-rect.height-4))}}
function closeMenu(){const wasOpen=!!menu.value;menu.value=null;if(wasOpen)timelineRoot.value?.focus({preventScroll:true})}
function openTrackMenu(e,track){if(props.disabled)return;layerMenuName.value=layerName(track);selectTrack(track);positionMenu(e,{kind:'track',track,title:'轨道 · '+layerName(track),scope:'该轨道',items:allRefs(props.clips.filter(c=>c.track===track))})}
function openClipMenu(e,clip){if(props.disabled)return;if(clip.layerLocked)selectedClips.value=[];chooseClip(clip);layerMenuName.value=layerName(clip.track);emit('select',clip.id);selectedKeys.value=[];selectedEventId.value='';positionMenu(e,{kind:'clip',track:clip.track,title:'片段 · '+(selectedClips.value.length>1 ? '已选 '+selectedClips.value.length+' 个' : clip.name),scope:selectedClips.value.length>1 ? '所选片段' : '该片段',items:allRefs(selectedClips.value.length ? props.clips.filter(c=>selectedClips.value.includes(c.id)) : [clip])})}
function openPropertyMenu(e,key){if(!props.selected)return;selectedClips.value=[];keyProperty.value=key;positionMenu(e,{kind:'property',title:props.labels[key] || key,scope:'该参数',items:allRefs([props.selected],key)})}
function openKeyMenu(e,clip,keys){if(props.disabled)return;selectedClips.value=[];selectedEventId.value='';const refs=keys.map(k=>({clipId:clip.id,key:k.key,frame:k.frame}));if(!refs.every(k=>isKeySelected(k.clipId,k.key,k.frame)))selectedKeys.value=refs;const first=selectedKeys.value[0],owner=props.clips.find(c=>c.id===first.clipId),key=owner.keyframes[first.key].find(k=>k.frame===first.frame);menuNativeValue.value=key.value;menuValue.value=valueDisplay(first.key,first.clipId).toDisplay(key.value);menuTime.value=owner.start+key.frame/props.fps-owner.offset;menuEasing.value=key.easing || 'linear';timelineRoot.value.focus({preventScroll:true});positionMenu(e,{kind:'keys',title:'编辑关键帧 · 已选 '+selectedKeys.value.length+' 帧'})}
function applyMenuEdit(){if(menuLocked.value)return;const action={type:'edit',easing:menuEasing.value};if(selectedKeys.value.length===1){if(Number(menuValue.value)!==menuDisplay.value.toDisplay(menuNativeValue.value))action.value=menuDisplay.value.toNative(menuValue.value);action.time=Number(menuTime.value)}emit('batch-keys',selectedKeys.value,action);selectedKeys.value=[];closeMenu();timelineRoot.value.focus({preventScroll:true})}
function outsideMenu(e){if(menu.value && !e.target.closest('.timeline-menu'))closeMenu()}
const keyProperty=ref('@x'),showKeyRows=ref(false)
const visitedProperties=ref(['@x'])
watch(keyProperty,key=>{if(!visitedProperties.value.includes(key))visitedProperties.value.push(key)},{flush:'sync'})
const keyProperties=computed(()=>[...new Set(['@x','@y','@scale','@rotation','@opacity',...Object.keys(props.selected?.keyframes || {})])].sort((a,b)=>Number(b.startsWith('@'))-Number(a.startsWith('@'))))
const expandedProperties=computed(()=>keyProperties.value.filter(key=>visitedProperties.value.includes(key) || props.selected?.keyframes[key]?.length))
const currentFrame=computed(()=>props.selected ? Math.round((props.time-props.selected.start+props.selected.offset)*props.fps) : -1)
const propertyKeys=computed(()=>props.selected ? visibleClipKeys(props.selected,props.fps).filter(k=>k.key===keyProperty.value) : [])
const currentKey=computed(()=>propertyKeys.value.find(k=>k.frame===currentFrame.value)),previousKey=computed(()=>propertyKeys.value.filter(k=>k.frame<currentFrame.value).at(-1)),nextKey=computed(()=>propertyKeys.value.find(k=>k.frame>currentFrame.value))
const withinClip=computed(()=>props.selected && props.time>=props.selected.start && props.time<props.selected.start+props.selected.duration)
function valueDisplay(key,clipId=props.selectedId){const field=key.startsWith('@') ? props.transformFields?.find(f=>f.key===key.slice(1)) : props.runtimes?.[clipId]?.groups.flatMap(g=>g.params).find(p=>p.key===key);return numericDisplay(key,field)}
const menuDisplay=computed(()=>{const item=selectedKeys.value[0];return valueDisplay(item?.key || '@x',item?.clipId)})
function displayText(key,value,clipId){const display=valueDisplay(key,clipId);return display.toDisplay(value)+display.unit}
const propertyValue=computed(()=>Number((keyProperty.value.startsWith('@') ? props.pose?.transform[keyProperty.value.slice(1)] : props.pose?.params[keyProperty.value]) ?? 0))
const neighborDescription=computed(()=>{const before=currentKey.value || previousKey.value,after=nextKey.value;const text=k=>`${formatTimecode(k.time,props.fps)}: ${displayText(k.key,k.value)}`;return before && after ? text(before)+' → '+text(after) : before ? '关键帧 '+text(before) : after ? '下一帧 '+text(after) : '无关键帧'})
let pendingKeySelection=null
watch(()=>props.selectedId,id=>{visitedProperties.value=[];selectedEventId.value='';if(pendingKeySelection?.id===id){keyProperty.value=pendingKeySelection.key;showKeyRows.value=true}else{keyProperty.value='@x';showKeyRows.value=false}visitedProperties.value=[keyProperty.value];pendingKeySelection=null})
function curveSegments(key){
  const clip=props.selected,keys=clip?.keyframes[key] || []
  return keys.slice(0,-1).map((k,index)=>({...k,start:Math.max(clip.start,clip.start+k.frame/props.fps-clip.offset),end:Math.min(clip.start+clip.duration,clip.start+keys[index+1].frame/props.fps-clip.offset)})).filter(k=>k.easing && k.easing!=='linear' && k.end>k.start)
}
function editSegmentCurve(key,segment){selectedClips.value=[];selectedEventId.value='';selectedKeys.value=[{clipId:props.selectedId,key,frame:segment.frame}];keyProperty.value=key;closeMenu();openCurveEditor()}
function keyTitle(k){return `${props.labels[k.key] || k.key} · ${formatTimecode(k.time,props.fps)} · 值 ${displayText(k.key,k.value)} · ${easingLabel(k.easing)}`}
function groupTitle(clip,g){return `${clip.name} · ${formatTimecode(g.time,props.fps)} · `+g.keys.map(k=>`${props.labels[k.key] || k.key}=${displayText(k.key,k.value,clip.id)}`).join('，')}
function markerPosition(clip,time){const ratio=(time-clip.start)/clip.duration;return `calc(${ratio*100}% + ${8-16*ratio}px)`}
function chooseGroup(clip,g,e){if(e && suppressKeyClick){suppressKeyClick=false;return}if(props.disabled)return;const key=g.keys.find(k=>k.key===keyProperty.value)?.key || g.keys.find(k=>k.key==='@x')?.key || g.keys[0].key;selectKeys(g.keys.map(k=>({clipId:clip.id,key:k.key,frame:k.frame})),e);if(clip.id!==props.selectedId)pendingKeySelection={id:clip.id,key};keyProperty.value=key;showKeyRows.value=true;emit('select',clip.id);emit('seek',g.time)}
function chooseKey(k,e){if(e && suppressKeyClick){suppressKeyClick=false;return}if(props.disabled)return;selectKeys([{clipId:props.selectedId,key:k.key,frame:k.frame}],e);keyProperty.value=k.key;emit('seek',k.time)}
let keyDrag=null,suppressKeyClick=false
function beginGroupKey(e,clip,g){if(props.disabled || clip.layerLocked || refsLocked(selectedKeys.value) || e.button!==0 || e.shiftKey || e.ctrlKey || e.metaKey)return;suppressKeyClick=false;chooseGroup(clip,g);emit('begin-edit');dragging.value=true;keyDrag={origin:g.frame,applied:0,x:e.clientX,scrollLeft:scrollArea.value.scrollLeft};timelineRoot.value.setPointerCapture(e.pointerId);timelineRoot.value.focus({preventScroll:true});e.preventDefault()}
function beginKey(e,k){if(editDisabled.value || refsLocked(selectedKeys.value) || e.button!==0 || e.shiftKey || e.ctrlKey || e.metaKey)return;suppressKeyClick=false;chooseKey(k);emit('begin-edit');dragging.value=true;keyDrag={origin:k.frame,applied:0,x:e.clientX,scrollLeft:scrollArea.value.scrollLeft};timelineRoot.value.setPointerCapture(e.pointerId);timelineRoot.value.focus({preventScroll:true});e.preventDefault()}
function moveKey(e){if(!keyDrag)return;const delta=Math.round((e.clientX-keyDrag.x+scrollArea.value.scrollLeft-keyDrag.scrollLeft)/laneWidth.value*props.duration*props.fps);const refs=selectedKeys.value,plan=planKeyRefMove(props.clips,refs,delta-keyDrag.applied,props.fps);if(!plan.delta)return;selectedKeys.value=plan.items;emit('batch-keys',refs,{type:'move',delta:plan.delta});keyDrag.applied+=plan.delta;emit('seek',globalTime(keyDrag.origin+keyDrag.applied))}
function endKey(){if(keyDrag){suppressKeyClick=keyDrag.applied!==0;emit('end-edit')}keyDrag=null;dragging.value=false}
const editingLayer=ref(null),layerDraft=ref(''),layerMenuName=ref(''),layerNameInput=ref(null)
function layerName(track){const clip=props.clips.find(c=>c.track===track);return clip?.layerName || clip?.name || '模型图层'}
async function startLayerRename(track){if(props.disabled || layerLocked(track))return;editingLayer.value=track;layerDraft.value=layerName(track);await nextTick();const input=timelineRoot.value?.querySelector('.layer-name input');input?.focus();input?.select()}
function finishLayerRename(){if(editingLayer.value===null)return;const track=editingLayer.value;editingLayer.value=null;if(!props.disabled)emit('rename-layer',track,layerDraft.value)}
const layerSource=ref(null),layerTarget=ref(null)
let layerDrag=null,suppressLayerClick=false
function beginLayerDrag(e,track){if(props.disabled || layerLocked(track) || e.button!==0 || e.target.closest('button,input'))return;stopFrameStep();closeMenu();layerDrag={from:track,y:e.clientY,moved:false}}
function moveLayerDrag(e){if(!layerDrag || props.disabled)return;if(Math.abs(e.clientY-layerDrag.y)<5 && !layerDrag.moved)return;timelineRoot.value.setPointerCapture(e.pointerId);layerDrag.moved=true;layerSource.value=layerDrag.from;const viewport=scrollArea.value.getBoundingClientRect();if(e.clientY<viewport.top+24)scrollArea.value.scrollTop-=12;else if(e.clientY>viewport.bottom-24)scrollArea.value.scrollTop+=12;const cards=[...timelineRoot.value.querySelectorAll('.track-card[data-track]')];let closest=null,distance=Infinity;for(const card of cards){const r=card.getBoundingClientRect(),gap=Math.abs(e.clientY-(r.top+r.height/2));if(gap<distance){distance=gap;closest=Number(card.dataset.track)}}layerTarget.value=closest}
function endLayerDrag(e){const drag=layerDrag;layerDrag=null;suppressLayerClick=drag.moved;if(drag.moved && e.type!=='pointercancel' && !props.disabled && layerTarget.value!==null)emit('reorder-layer',drag.from,layerTarget.value);layerSource.value=null;layerTarget.value=null}
async function clickLayer(track){if(suppressLayerClick){suppressLayerClick=false;return}const expanded=props.selected?.track===track ? !showKeyRows.value : true;selectTrack(track);await nextTick();showKeyRows.value=expanded}
function stepLayer(direction){if(!menu.value || menuLocked.value)return;const from=menu.value.track,index=tracks.value.indexOf(from),to=tracks.value[index+direction];if(to!==undefined)emit('reorder-layer',from,to);closeMenu()}
const minimumTimelineHeight=ref(220),timelineHeight=ref(220),zoomLevel=ref(0),snapping=ref(true),dragging=ref(false),snapTime=ref(null),availableWidth=ref(600)
const zoom=computed(()=>2**zoomLevel.value),laneWidth=computed(()=>Math.max(80,availableWidth.value-170)*zoom.value),tracks=computed(()=>[...new Set(props.clips.map(c=>c.track))].sort((a,b)=>a-b)),ticks=computed(()=>timelineTicks(props.duration,laneWidth.value))
let resizing=null,observer=null
function maxHeight(){return Math.max(minimumTimelineHeight.value,window.innerHeight*.65)}
function beginResize(e){if(e.button!==0)return;resizing={y:e.clientY,height:timelineRoot.value.getBoundingClientRect().height};e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault()}
function resizeTimeline(e){if(resizing)timelineHeight.value=Math.max(minimumTimelineHeight.value,Math.min(maxHeight(),resizing.height+resizing.y-e.clientY))}
function endResize(){resizing=null}
async function changeZoom(level,clientX){if(dragging.value || scrubbing)return;const viewport=scrollArea.value,oldWidth=laneWidth.value,anchor=clientX==null ? Math.max(0,(viewport.clientWidth-170)/2) : Math.max(0,clientX-viewport.getBoundingClientRect().left-170),fraction=(viewport.scrollLeft+anchor)/oldWidth;zoomLevel.value=Math.max(0,Math.min(4,level));await nextTick();viewport.scrollLeft=Math.max(0,fraction*laneWidth.value-anchor)}
function wheelZoom(e){if(e.ctrlKey || e.metaKey){e.preventDefault();changeZoom(zoomLevel.value+(e.deltaY<0?1:-1),e.clientX)}}
function selectTrack(track,at=props.time){selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value='';audioSelection.value='';if(props.disabled)return;const clips=props.clips.filter(c=>c.track===track).sort((a,b)=>a.start-b.start),active=clips.find(c=>at>=c.start && at<c.start+c.duration),clip=active || clips.find(c=>c.id===props.selectedId) || clips.reduce((nearest,c)=>{const distance=v=>Math.max(v.start-at,at-v.start-v.duration,0);return !nearest || distance(c)<distance(nearest) ? c : nearest},null);if(clip){selectedClips.value=clip.layerLocked ? [] : [clip.id];emit('select',clip.id)}}
function beginTrackSeek(e,track){if(props.disabled || e.button!==0)return;const r=e.currentTarget.getBoundingClientRect();selectTrack(track,Math.max(0,Math.min(props.duration,(e.clientX-r.left)/r.width*props.duration)));beginSeek(e)}
function globalTime(frame){return props.selected.start+frame/props.fps-props.selected.offset}
function visibleEvents(type){return props.selected.events.filter(e=>e.type===type && eventRange(props.selected,e,props.fps).duration>0)}
let scrubbing=null,drag=null
// 节拍：波形里推导出来的提示点，播放头定位、片段移动与裁剪都拿它当吸附目标
const beatSnap=ref(true),beatsByAsset=ref({}),beatRequests=new Set()
async function loadBeats(assetId){
  if(!assetId || beatRequests.has(assetId) || assetId in beatsByAsset.value)return
  beatRequests.add(assetId)
  let times=null
  // 失败也要释放请求标记，否则一次解码失败会让这段素材永远不再尝试节拍。
  try{times=await assetStore.beats(assetId)}catch{times=null}finally{beatRequests.delete(assetId)}
  if(times?.length)beatsByAsset.value={...beatsByAsset.value,[assetId]:times}
}
watch(()=>props.audioClips.map(c=>c.assetId).join('|'),()=>{for(const clip of props.audioClips)loadBeats(clip.assetId)},{immediate:true})
const beatTargets=computed(()=>beatSnap.value ? collectBeats(props.audioClips,beatsByAsset.value,{end:props.duration}) : [])
function seekAt(clientX,rect,altKey){
  const raw=Math.max(0,Math.min(props.duration,(clientX-rect.left)/rect.width*props.duration))
  const hit=beatSnap.value && !altKey ? snapToBeats(raw,beatTargets.value,8/rect.width*props.duration) : {time:raw,snapped:null}
  snapTime.value=hit.snapped
  emit('seek',hit.time)
}
function beginSeek(e){if(props.disabled || e.button!==0)return;const target=e.currentTarget.closest('.track-lane') || ruler.value;scrubbing={pointerId:e.pointerId,target};target.setPointerCapture(e.pointerId);target.focus({preventScroll:true});e.preventDefault();seekAt(e.clientX,target.getBoundingClientRect(),e.altKey)}
function moveSeek(e){
  if(drag){move(e);return}
  if(backgroundDrag){moveBackground(e);return}
  if(audioDrag){moveAudio(e);return}
  if(volumeKeyDrag){moveVolumeKey(e);return}
  if(layerDrag){moveLayerDrag(e);return}
  if(eventDrag){moveEvent(e);return}
  if(keyDrag){moveKey(e);return}
  if(box){updateBox(e);return}
  if(scrubbing?.pointerId===e.pointerId && !props.disabled)seekAt(e.clientX,scrubbing.target.getBoundingClientRect(),e.altKey)
}
function endSeek(e){
  if(drag)end()
  if(backgroundDrag)endBackground()
  if(audioDrag)endAudio()
  if(volumeKeyDrag)endVolumeKey()
  if(layerDrag)endLayerDrag(e)
  if(eventDrag)endEvent()
  if(keyDrag)endKey()
  if(box)endBox()
  if(scrubbing?.pointerId===e.pointerId){scrubbing=null;snapTime.value=null}
}
function begin(e,clip,mode){if(props.disabled || clip.layerLocked || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey)return;chooseClip(clip);selectedKeys.value=[];selectedEventId.value='';e.currentTarget.closest('.model-clip').focus({preventScroll:true});emit('begin-edit');dragging.value=true;drag={original:props.clips.filter(c=>selectedClips.value.includes(c.id)).map(c=>JSON.parse(JSON.stringify(c))),id:clip.id,mode,x:e.clientX,start:clip.start,duration:clip.duration,offset:clip.offset,width:e.currentTarget.closest('.track-lane').clientWidth,scrollLeft:scrollArea.value.scrollLeft};timelineRoot.value.setPointerCapture(e.pointerId);e.preventDefault()}
function move(e){
  if(!drag)return
  const delta=(e.clientX-drag.x+scrollArea.value.scrollLeft-drag.scrollLeft)/drag.width*props.duration,tolerance=8/drag.width*props.duration
  if(drag.mode==='move'){
    const ids=new Set(drag.original.map(c=>c.id))
    const targets=snapping.value && !e.altKey ? [0,props.duration,props.time,...props.clips.filter(c=>!ids.has(c.id)).flatMap(c=>[c.start,c.start+c.duration]),...beatTargets.value] : []
    const plan=planClipMove(props.clips,drag.original,delta,{duration:props.duration,fps:props.fps,targets,tolerance})
    snapTime.value=plan.snapTime
    emit('batch-clips',{type:'move',entries:plan.entries})
    return
  }
  const targets=snapping.value && !e.altKey ? [0,props.duration,props.time,...props.clips.filter(c=>c.id!==drag.id).flatMap(c=>[c.start,c.start+c.duration]),...beatTargets.value] : []
  const result=editTimelineClip(drag,delta,{duration:props.duration,fps:props.fps,targets,tolerance})
  snapTime.value=result.snapTime
  emit('edit-clip',drag.id,result.patch)
}
function end(){if(drag)emit('end-edit');drag=null;dragging.value=false;snapTime.value=null}
function updateToolbarSize(){availableWidth.value=scrollArea.value.clientWidth;minimumTimelineHeight.value=Math.max(220,[...timelineRoot.value.querySelectorAll('.timeline-tools,.key-tools')].reduce((sum,el)=>sum+el.getBoundingClientRect().height,104))}
function observeToolbars(){for(const el of timelineRoot.value?.querySelectorAll('.timeline-tools,.key-tools') || [])observer?.observe(el);updateToolbarSize()}
watch(()=>props.selectedId,()=>nextTick(observeToolbars))
onMounted(()=>{document.addEventListener('pointerdown',outsideMenu);window.addEventListener('blur',stopFrameStep);document.addEventListener('visibilitychange',stopFrameStep);observer=new ResizeObserver(updateToolbarSize);observer.observe(scrollArea.value);observeToolbars()})
onBeforeUnmount(()=>{stopFrameStep();observer?.disconnect();document.removeEventListener('pointerdown',outsideMenu);window.removeEventListener('blur',stopFrameStep);document.removeEventListener('visibilitychange',stopFrameStep)})
function eventStyle(event){const r=eventRange(props.selected,event,props.fps);return {left:r.start/props.duration*100+'%',width:event.type==='expression' ? Math.max(18,Math.min(120,r.duration/props.duration*laneWidth.value))+'px' : r.duration/props.duration*100+'%'}}
function eventTitle(event){const r=eventRange(props.selected,event,props.fps);if(event.type==='expression')return '表情 '+event.name+' · 切换帧 '+formatTimecode(r.start,props.fps);return (event.type==='motion' ? '动作 ' : '表情 ')+event.name+' · '+formatTimecode(r.start,props.fps)+' → '+formatTimecode(r.end,props.fps)+' · 时长 '+formatTimecode(r.duration,props.fps)}
function selectEvent(event){if(props.disabled)return;selectedClips.value=[];selectedKeys.value=[];selectedEventId.value=event.id;timelineRoot.value?.focus({preventScroll:true})}
function copyEvent(){if(!selectedEvent.value || props.disabled)return;clipClipboard.value=null;keyClipboard.value=null;eventClipboard.value={...selectedEvent.value};clipboardNotice.value='已复制'+(selectedEvent.value.type==='motion' ? '动作' : '表情')+'：'+selectedEvent.value.name;closeMenu()}
function pasteCopiedEvent(){if(editDisabled.value || !eventClipboard.value)return;selectedClips.value=[];emit('paste-event',{...eventClipboard.value});closeMenu()}
function deleteEvent(){if(editDisabled.value || !selectedEvent.value)return;emit('remove-event',selectedEvent.value);selectedEventId.value='';closeMenu()}
function openEventLaneMenu(e,type){selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';positionMenu(e,{kind:'event-lane',eventType:type,title:type==='motion' ? '动作轨道' : '表情轨道'})}
function openEventMenu(e,event){selectEvent(event);const r=eventRange(props.selected,event,props.fps);eventMenuStart.value=r.start;eventMenuDuration.value=r.duration;eventMenuOffset.value=(event.offset || 0)+r.start-r.sourceStart;positionMenu(e,{kind:'event',title:(event.type==='motion' ? '动作 · ' : '表情 · ')+event.name,event})}
function applyEventMenu(){if(!selectedEvent.value || editDisabled.value)return;const patch=selectedEvent.value.type==='expression' ? {start:eventMenuStart.value} : {start:eventMenuStart.value,duration:eventMenuDuration.value,offset:eventMenuOffset.value};const plan=planEventEdit(props.selected,selectedEvent.value,patch,props.fps);if(plan.error){clipboardNotice.value=plan.error;return}emit('edit-event',selectedEventId.value,patch);closeMenu()}
let eventDrag=null
function beginEvent(e,event,mode){if(editDisabled.value || e.button!==0)return;selectEvent(event);closeMenu();const r=eventRange(props.selected,event,props.fps);eventDrag={event:{...event,duration:r.duration,offset:(event.offset || 0)+r.start-r.sourceStart},mode,x:e.clientX,start:r.start,duration:r.duration,offset:(event.offset || 0)+r.start-r.sourceStart,scrollLeft:scrollArea.value.scrollLeft};dragging.value=true;emit('begin-edit');timelineRoot.value.setPointerCapture(e.pointerId);e.preventDefault()}
function moveEvent(e){if(!eventDrag)return;const d=eventDrag,delta=(e.clientX-d.x+scrollArea.value.scrollLeft-d.scrollLeft)/laneWidth.value*props.duration;const targets=snapping.value && !e.altKey ? [props.time,props.selected.start,props.selected.start+props.selected.duration,...props.selected.events.filter(v=>v.id!==d.event.id).flatMap(v=>{const r=eventRange(props.selected,v,props.fps);return [r.start,r.end]})] : [];const result=editTimelineClip(d,delta,{duration:props.selected.start+props.selected.duration,fps:props.fps,targets,tolerance:8/laneWidth.value*props.duration});const patch={...result.patch};if(d.event.type==='motion')patch.duration ??= d.duration;if(d.mode==='move')patch.offset=d.offset;const plan=planEventEdit(props.selected,d.event,patch,props.fps);if(plan.error){clipboardNotice.value=plan.error;return}clipboardNotice.value='';snapTime.value=result.snapTime;emit('edit-event',d.event.id,patch)}
function endEvent(){eventDrag=null;dragging.value=false;snapTime.value=null;emit('end-edit')}

const backgroundDraftColor=ref('#00b140'),backgroundSelection=ref(''),backgroundMenuColor=ref('#00b140')
const backgroundPresets=[
  {label:'绿幕',color:'#00b140'},{label:'白色',color:'#ffffff'},{label:'黑色',color:'#000000'},
  {label:'灰色',color:'#808080'},{label:'红色',color:'#e02020'},{label:'黄色',color:'#ffe600'},
  {label:'蓝色',color:'#1050d0'},{label:'天蓝',color:'#7fd4ff'},{label:'紫色',color:'#7a3fd0'},
]
function backgroundLabel(clip){return clip.kind==='color' ? '纯色 '+clip.color : '图片 · '+clip.name}
function backgroundTitle(clip){return backgroundLabel(clip)+' · '+formatTimecode(clip.start,props.fps)+' → '+formatTimecode(clip.start+clip.duration,props.fps)}
function openBackgroundColorMenu(e){if(props.disabled)return;positionMenu(e,{kind:'background-color',title:'添加纯色背景'})}
async function openBackgroundImageMenu(e){
  if(props.disabled)return
  let assets=[]
  try{assets=(await assetStore.list()).filter(asset=>asset.kind==='image')}catch{assets=[]}
  positionMenu(e,{kind:'background-image',title:'添加图片背景',assets})
}
// 事件参数就是颜色字符串本身，编辑器直接交给 createColorBackgroundClip 校验。
function addBackgroundColor(color){if(props.disabled || !color)return;emit('add-background-color',color);closeMenu()}
function addBackgroundImage(asset){if(props.disabled || !asset)return;emit('background-image',asset);closeMenu()}
function importBackgroundImage(){if(props.disabled)return;emit('import-background-image');closeMenu()}
let backgroundDrag=null
function beginBackground(e,clip,mode){if(props.disabled || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey)return;closeMenu();selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';audioSelection.value='';backgroundSelection.value=clip.id;emit('begin-edit');dragging.value=true;backgroundDrag={original:{...clip},mode,x:e.clientX,start:clip.start,duration:clip.duration,offset:0,width:e.currentTarget.closest('.track-lane').clientWidth,scrollLeft:scrollArea.value.scrollLeft};timelineRoot.value.setPointerCapture(e.pointerId);e.preventDefault()}
function moveBackground(e){
  if(!backgroundDrag)return
  const d=backgroundDrag,width=Math.max(1,d.width),delta=(e.clientX-d.x+scrollArea.value.scrollLeft-d.scrollLeft)/width*props.duration,tolerance=8/width*props.duration
  const targets=snapping.value && !e.altKey ? [0,props.duration,props.time,...props.backgroundClips.filter(c=>c.id!==d.original.id).flatMap(c=>[c.start,c.start+c.duration]),...beatTargets.value] : []
  if(d.mode==='move'){
    const plan=planClipMove(props.backgroundClips,[d.original],delta,{duration:props.duration,fps:props.fps,targets,tolerance})
    snapTime.value=plan.snapTime
    if(plan.entries.length)emit('background-edit',d.original.id,{start:plan.entries[0].start})
    return
  }
  const result=editTimelineClip(d,delta,{duration:props.duration,fps:props.fps,targets,tolerance})
  snapTime.value=result.snapTime
  emit('background-edit',d.original.id,{start:result.patch.start,duration:result.patch.duration})
}
// 点选后保留选中状态，Delete 才能作用在它上面（拖动移动不改选中）。
function endBackground(){if(backgroundDrag)emit('end-edit');backgroundDrag=null;dragging.value=false;snapTime.value=null}
function deleteBackgroundSelection(){if(props.disabled || !backgroundSelection.value)return false;emit('delete-background',backgroundSelection.value);backgroundSelection.value='';return true}
function clickBackgroundLane(e){backgroundSelection.value='';beginSeek(e)}
/** 播放头严格位于片段内部时才能切割（与视觉片段的判定一致）。 */
function playheadInsideClip(clip){return !!clip && props.time>clip.start+1e-8 && props.time<clip.start+clip.duration-1e-8}
const selectedBackgroundClip=computed(()=>props.backgroundClips.find(c=>c.id===backgroundSelection.value) || null)
const selectedAudioClip=computed(()=>props.audioClips.find(c=>c.id===audioSelection.value) || null)
const backgroundClipboard=ref(null)
const audioSelection=ref(''),audioClipboard=ref(null)
const audioMenuVolume=ref(100),audioMenuFadeIn=ref(0),audioMenuFadeOut=ref(0)
const audioMenuFilter=ref('none'),audioMenuKeyValue=ref(100),audioMenuKeyEasing=ref('linear')
/** 播放头落在片段的时间范围内（含两端），音量关键帧按这一刻的素材内时间读写。 */
function playheadCoversClip(clip){return !!clip && props.time>=clip.start-1e-8 && props.time<=clip.start+clip.duration+1e-8}
const audioMenuKeyframe=computed(()=>{
  const clip=menu.value?.kind==='audio' ? menu.value.audio : null
  return clip && playheadCoversClip(clip) ? nearestVolumeKeyframe(clip.volumeKeyframes,sourceAtTimeline(clip,props.time)) : null
})
const audioTracks=computed(()=>{
  const used=[...new Set(props.audioClips.map(c=>c.track))].sort((a,b)=>a-b)
  // 始终多留一条空轨，方便把片段放到新轨道上叠放；没有任何片段时也能直接选第 2 条轨道
  const rows=used.length ? used : [0]
  const extra=rows.at(-1)+1
  return extra < AUDIO_TRACK_LIMIT ? [...rows,extra] : rows
})
function clipsOnAudioTrack(track){return props.audioClips.filter(c=>c.track===track)}
function audioTitle(clip){
  const parts=[formatTimecode(clip.start,props.fps)+' → '+formatTimecode(clip.start+clip.duration,props.fps),'音量 '+Math.round((clip.volume ?? 1)*100)+'%']
  if(clip.fadeIn)parts.push('淡入 '+clip.fadeIn.toFixed(1)+' 秒')
  if(clip.fadeOut)parts.push('淡出 '+clip.fadeOut.toFixed(1)+' 秒')
  if(normalizeAudioFilter(clip.filter)!=='none')parts.push('滤镜 '+audioFilterLabel(clip.filter))
  const keys=normalizeVolumeKeyframes(clip.volumeKeyframes).length
  if(keys)parts.push('音量关键帧 '+keys+' 个')
  return clip.name+' · '+parts.join(' · ')+' · 拖动标签条移动，拖波形定位播放头，拖菱形改关键帧；两端裁剪；右键编辑'
}
const audioAssetList=()=>assetStore.list().then(list=>list.filter(asset=>asset.kind==='audio')).catch(()=>[])
async function openAudioAddMenu(e,track){if(props.disabled)return;positionMenu(e,{kind:'audio-add',track,title:'添加音频',assets:await audioAssetList()})}
function addAudioClip(asset,track){if(props.disabled || !asset)return;emit('add-audio',asset,track);closeMenu()}
function importAudio(track){if(props.disabled)return;emit('import-audio',track);closeMenu()}
function openAudioMenu(e,clip){
  if(props.disabled)return
  audioSelection.value=clip.id
  audioMenuVolume.value=Math.round((clip.volume ?? 1)*100)
  audioMenuFadeIn.value=clip.fadeIn || 0
  audioMenuFadeOut.value=clip.fadeOut || 0
  audioMenuFilter.value=normalizeAudioFilter(clip.filter)
  const nearest=nearestVolumeKeyframe(clip.volumeKeyframes,sourceAtTimeline(clip,props.time))
  audioMenuKeyValue.value=Math.round((nearest?.value ?? clip.volume ?? 1)*100)
  audioMenuKeyEasing.value=typeof nearest?.easing==='string' ? nearest.easing : 'linear'
  positionMenu(e,{kind:'audio',title:'音频片段 · '+clip.name,audio:clip})
}
function applyAudioMenu(){
  const clip=menu.value?.audio
  if(!clip)return
  emit('audio-edit',clip.id,{volume:Math.max(0,Math.min(1,Number(audioMenuVolume.value)/100)),fadeIn:Math.max(0,Number(audioMenuFadeIn.value)||0),fadeOut:Math.max(0,Number(audioMenuFadeOut.value)||0),filter:normalizeAudioFilter(audioMenuFilter.value)})
  closeMenu()
}
function currentAudioMenuClip(){return menu.value?.kind==='audio' ? menu.value.audio : null}
/** 在播放头处写入音量关键帧：同一素材时间已有则覆盖，复用所选缓动。 */
function applyVolumeKeyframe(){
  const clip=currentAudioMenuClip()
  if(!clip || !playheadCoversClip(clip) || props.disabled)return
  emit('audio-edit',clip.id,{volumeKeyframes:setVolumeKeyframe(clip.volumeKeyframes,sourceAtTimeline(clip,props.time),Number(audioMenuKeyValue.value)/100,audioMenuKeyEasing.value)})
  closeMenu()
}
function removePlayheadVolumeKeyframe(){
  const clip=currentAudioMenuClip()
  if(!clip || !playheadCoversClip(clip) || props.disabled)return
  emit('audio-edit',clip.id,{volumeKeyframes:removeVolumeKeyframe(clip.volumeKeyframes,sourceAtTimeline(clip,props.time))})
  closeMenu()
}
function clearVolumeKeyframes(){
  const clip=currentAudioMenuClip()
  if(!clip || props.disabled)return
  emit('audio-edit',clip.id,{volumeKeyframes:[]})
  closeMenu()
}
function clickAudioLane(e){audioSelection.value='';beginSeek(e)}
let audioDrag=null
function beginAudio(e,clip,mode){if(props.disabled || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey)return;closeMenu();selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value='';audioSelection.value=clip.id;emit('begin-edit');dragging.value=true;audioDrag={original:{...clip},mode,x:e.clientX,start:clip.start,duration:clip.duration,offset:clip.offset,width:e.currentTarget.closest('.track-lane').clientWidth,scrollLeft:scrollArea.value.scrollLeft};timelineRoot.value.setPointerCapture(e.pointerId);e.preventDefault()}
function moveAudio(e){
  if(!audioDrag)return
  const d=audioDrag,width=Math.max(1,d.width),delta=(e.clientX-d.x+scrollArea.value.scrollLeft-d.scrollLeft)/width*props.duration,tolerance=8/width*props.duration
  const targets=snapping.value && !e.altKey ? [0,props.duration,props.time,...props.audioClips.filter(c=>c.id!==d.original.id).flatMap(c=>[c.start,c.start+c.duration]),...beatTargets.value] : []
  if(d.mode==='move'){
    const plan=planClipMove(props.audioClips,[d.original],delta,{duration:props.duration,fps:props.fps,targets,tolerance})
    snapTime.value=plan.snapTime
    if(plan.entries.length)emit('audio-edit',d.original.id,{start:plan.entries[0].start})
    return
  }
  const result=editTimelineClip(d,delta,{duration:props.duration,fps:props.fps,targets,tolerance})
  snapTime.value=result.snapTime
  emit('audio-edit',d.original.id,{start:result.patch.start,duration:result.patch.duration,offset:result.patch.offset})
}
function endAudio(){if(audioDrag)emit('end-edit');audioDrag=null;dragging.value=false;snapTime.value=null}
/** 波形区域拖动＝定位播放头（吸附节拍）；片段标签条才是移动片段。 */
function scrubAudio(e,clip){
  if(props.disabled || e.button!==0)return
  closeMenu()
  selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value='';audioSelection.value=clip.id
  beginSeek(e)
}
/** 拖动音量关键帧菱形：横向改素材内时间（吸附节拍）、纵向改音量（片段高度＝100%）。 */
let volumeKeyDrag=null
function beginVolumeKey(e,clip,key){
  if(props.disabled || e.button!==0 || e.ctrlKey || e.metaKey || e.shiftKey)return
  closeMenu()
  selectedClips.value=[];selectedKeys.value=[];selectedEventId.value='';backgroundSelection.value='';audioSelection.value=clip.id
  emit('begin-edit')
  dragging.value=true
  const lane=e.currentTarget.closest('.track-lane'),box=e.currentTarget.closest('.model-clip')
  // 记下起手时的关键帧表并摘掉这一颗，拖动期间始终从它出发：既不会累积，也不会复制出一颗。
  volumeKeyDrag={clip,list:removeVolumeKeyframe(normalizeVolumeKeyframes(clip.volumeKeyframes),key.source),origin:{source:key.source,value:key.value,easing:key.easing},x:e.clientX,y:e.clientY,width:Math.max(1,lane.clientWidth),height:Math.max(1,box.clientHeight),scrollLeft:scrollArea.value.scrollLeft}
  timelineRoot.value.setPointerCapture(e.pointerId)
  e.preventDefault()
}
function moveVolumeKey(e){
  if(!volumeKeyDrag)return
  const d=volumeKeyDrag,deltaTime=(e.clientX-d.x+scrollArea.value.scrollLeft-d.scrollLeft)/d.width*props.duration
  const low=d.clip.offset || 0,high=low+d.clip.duration,clamp=value=>Math.max(low,Math.min(high,value))
  let source=clamp(d.origin.source+deltaTime)
  const hit=beatSnap.value && !e.altKey ? snapToBeats(timelineAtSource(d.clip,source),beatTargets.value,8/d.width*props.duration) : {snapped:null}
  if(hit.snapped!=null)source=clamp(sourceAtTimeline(d.clip,hit.snapped))
  source=Math.round(source*props.fps)/props.fps
  const value=Math.max(0,Math.min(1,d.origin.value+(d.y-e.clientY)/d.height))
  snapTime.value=hit.snapped ?? null
  emit('audio-edit',d.clip.id,{volumeKeyframes:setVolumeKeyframe(d.list,source,value,d.origin.easing)})
}
function endVolumeKey(){if(volumeKeyDrag)emit('end-edit');volumeKeyDrag=null;dragging.value=false;snapTime.value=null}
function deleteAudioSelection(){if(props.disabled || !audioSelection.value)return false;emit('delete-audio',audioSelection.value);audioSelection.value='';return true}
function copyAudioClip(){
  const clip=props.audioClips.find(c=>c.id===audioSelection.value)
  if(props.disabled || !clip)return false
  audioClipboard.value=audioClipTemplate(clip)
  clipClipboard.value=null;keyClipboard.value=null;eventClipboard.value=null;backgroundClipboard.value=null
  clipboardNotice.value='已复制音频片段：'+clip.name
  closeMenu()
  return true
}
async function pasteAudioClip(){
  if(props.disabled || !audioClipboard.value)return false
  clipClipboard.value=null;keyClipboard.value=null;eventClipboard.value=null;backgroundClipboard.value=null
  const before=new Set(props.audioClips.map(c=>c.id))
  emit('paste-audio',audioClipTemplate(audioClipboard.value))
  clipboardNotice.value='已粘贴音频片段'
  closeMenu()
  await nextTick()
  const added=props.audioClips.find(c=>!before.has(c.id))
  audioSelection.value=added ? added.id : ''
  return true
}
function copyBackgroundClip(){
  const clip=props.backgroundClips.find(c=>c.id===backgroundSelection.value)
  if(props.disabled || !clip)return false
  backgroundClipboard.value=backgroundClipTemplate(clip)
  clipClipboard.value=null;keyClipboard.value=null;eventClipboard.value=null
  clipboardNotice.value='已复制背景片段：'+backgroundLabel(clip)
  closeMenu()
  return true
}
async function pasteBackgroundClip(){
  if(props.disabled || !backgroundClipboard.value)return false
  clipClipboard.value=null;keyClipboard.value=null;eventClipboard.value=null
  const before=new Set(props.backgroundClips.map(c=>c.id))
  emit('paste-background',backgroundClipTemplate(backgroundClipboard.value))
  clipboardNotice.value='已粘贴背景片段'
  closeMenu()
  await nextTick()
  const added=props.backgroundClips.find(c=>!before.has(c.id))
  backgroundSelection.value=added ? added.id : ''
  return true
}
function openBackgroundMenu(e,clip){if(props.disabled)return;backgroundMenuColor.value=clip?.color || '#00b140';backgroundSelection.value=clip?.id || '';positionMenu(e,{kind:'background',title:clip ? '背景片段 · '+backgroundLabel(clip) : '背景轨道',background:clip})}
function applyBackgroundColor(e){backgroundMenuColor.value=e.target.value;if(menu.value?.background)emit('background-edit',menu.value.background.id,{color:backgroundMenuColor.value})}

</script>
<style scoped>
.menu-section { border-top:1px solid var(--editor-border); padding-top:8px; font-size:11px; color:var(--editor-accent); }.timeline-menu button { display:flex; align-items:center; justify-content:space-between; gap:8px; }.timeline-menu kbd,.menu-hint { flex-shrink:0; color:var(--editor-muted); font:inherit; font-size:10px; }.menu-status { color:var(--editor-key)!important; }.menu-footer { border-top:1px solid var(--editor-border); padding-top:8px; }.timeline-menu .menu-delete { color:var(--editor-accent); }
.model-clip.multiselected { outline:2px solid var(--editor-focus); outline-offset:-2px; background:var(--editor-clip-selected); }
.menu-edit-fields { display:flex; flex-direction:column; gap:8px; border:0; margin:0; padding:0; min-width:0; }.track-card.layer-hidden .layer-name { opacity:.45; }.layer-toggle { padding:3px!important; flex-shrink:0; font-size:10px!important; }.layer-toggle svg { display:block; width:14px; height:14px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }.layer-toggle[aria-pressed=true] { border-color:var(--editor-focus)!important; color:var(--editor-accent)!important; }.track-card.layer-locked { cursor:default!important; }
.multi-timeline { height:180px; flex-shrink:0; background:var(--editor-panel); border-top:1px solid var(--editor-border); display:flex; flex-direction:column; }
.timeline-resizer { height:5px; flex-shrink:0; cursor:ns-resize; touch-action:none; display:flex; justify-content:center; align-items:center; }.timeline-resizer span { width:36px; height:2px; background:var(--editor-muted); }.timeline-resizer:hover { background:var(--editor-hover); }
.clipboard-notice { padding:3px 10px; color:var(--editor-accent); flex-shrink:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.timeline-tools,.key-tools { min-height:32px; display:flex; align-items:center; gap:6px; padding:4px 10px; flex-shrink:0; overflow-x:auto; white-space:nowrap; box-sizing:border-box; }.key-tools { border-top:1px solid var(--editor-border); }.timeline-tools button,.key-tools button { flex-shrink:0; }.timeline-tools input[type=range] { width:80px; accent-color:var(--editor-accent); }.timeline-tools label,.key-tools label { display:flex; align-items:center; gap:4px; }.timeline-tools small,.key-tools small { color:var(--editor-muted); }.key-tools select { width:155px; }.key-tools input { width:80px; }.keyed { color:var(--editor-key)!important; border-color:var(--editor-guide)!important; }
.timeline-scroll { flex:1; min-height:0; overflow:auto; }.timeline-content { min-width:100%; }
.timeline-ruler,.track-row,.sub-row { display:flex; }.timeline-ruler { height:30px; flex-shrink:0; background:var(--editor-soft); position:sticky; top:0; z-index:6; }
.timeline-ruler>span,.track-label { width:170px; flex-shrink:0; padding:6px 10px; box-sizing:border-box; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; position:sticky; left:0; z-index:5; background:var(--editor-soft); }
.timeline-ruler>div { flex:1; position:relative; cursor:crosshair; overflow:hidden; }.timeline-ruler i { position:absolute; top:5px; font-size:10px; font-style:normal; white-space:nowrap; color:var(--editor-muted); }.timeline-ruler b,.playhead { position:absolute; top:0; bottom:0; width:1px; background:var(--editor-accent); pointer-events:none; z-index:3; }.timeline-ruler b::before { content:''; position:absolute; left:-5px; top:0; width:11px; height:10px; background:var(--editor-accent); clip-path:polygon(0 0,100% 0,100% 50%,50% 100%,0 50%); }.snap-guide { position:absolute; top:0; bottom:0; width:1px; background:var(--editor-key)!important; pointer-events:none; z-index:4; }
.track-row { height:62px; border-bottom:1px solid var(--editor-border); }.sub-row { height:27px; border-bottom:1px solid var(--editor-border); }.track-lane { flex:1; position:relative; min-width:0; background-image:linear-gradient(90deg,#bcaab32b 1px,transparent 1px); background-size:10% 100%; }
.layer-name { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }.layer-name input { width:100%; min-width:0; }.layer-grip { font-style:normal; color:var(--editor-muted); }.track-card { touch-action:none; cursor:grab!important; }.track-card.layer-dragging { opacity:.55; }.track-card.layer-target { box-shadow:inset 0 3px var(--editor-focus),inset 0 -3px var(--editor-focus); background:var(--editor-hover); }
.track-card { cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:6px; }.track-card.active,.track-label.active { background:var(--editor-accent-soft); }.track-card>span { min-width:0; }.track-card small { display:block; color:var(--editor-accent); overflow:hidden; text-overflow:ellipsis; }.track-card button { flex-shrink:0; }.track-card:focus-visible,.model-clip:focus-visible { outline:2px solid var(--editor-accent); outline-offset:1px; }
.model-clip { position:absolute; top:5px; bottom:5px; background:var(--editor-clip); border:1px solid var(--editor-focus); border-radius:var(--editor-radius); overflow:hidden; display:flex; align-items:flex-start; gap:5px; padding:4px 9px 0; box-sizing:border-box; cursor:grab; touch-action:none; }.model-clip.selected { background:var(--editor-clip-selected); border-color:var(--editor-focus); }.clip-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11px; }.model-clip small { flex-shrink:0; font-size:10px; }
.trim-handle { position:absolute; top:0; bottom:0; width:7px; cursor:ew-resize; z-index:4; background:#743a5214; }.trim-handle.left { left:0; }.trim-handle.right { right:0; }.trim-handle:hover { background:#743a523d; }
.clip-key-strip { position:absolute; left:0; right:0; bottom:3px; height:12px; }.clip-key-strip.transforms { bottom:18px; }
.key-marker { position:absolute; top:3px; border:0; cursor:pointer; color:var(--editor-key); background:var(--editor-soft); font-size:10px; max-width:90px; overflow:hidden; min-width:12px; height:18px; line-height:18px; padding:0; touch-action:none; transform:translateX(-50%); }.clip-key { top:0; height:12px; line-height:12px; font-size:12px; background:transparent; }.clip-key-strip:not(.transforms) .key-marker { color:var(--editor-param); }.key-marker.chosen { color:white; outline:1px solid var(--editor-focus); background:var(--editor-accent); }
.event-progress { position:absolute; left:0; right:0; bottom:0; height:4px; background:var(--editor-soft); pointer-events:none; }.event-progress i { display:block; height:100%; background:var(--editor-focus); }
.event-row { height:38px; flex-shrink:0; }.event-clip { position:absolute; top:3px; height:30px; min-width:5px; box-sizing:border-box; display:flex; align-items:center; gap:6px; padding:0 9px; border:1px solid var(--editor-focus); border-radius:var(--editor-radius); background:var(--editor-accent-soft); color:var(--editor-text); cursor:grab; touch-action:none; overflow:hidden; }.event-clip.expression { padding:0 3px; gap:4px; background:transparent; border:0; }.expression-diamond { color:var(--editor-param); flex-shrink:0; }.event-clip.expression.chosen { background:var(--editor-accent-soft); border-radius:6px; }
.event-clip.motion { background:var(--editor-motion); }.event-clip.chosen { border-color:var(--editor-focus); outline:1px solid var(--editor-focus); }.event-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }.event-clip small { flex-shrink:0; font-size:10px; }.event-clip:focus-visible { outline:2px solid var(--editor-focus); }
.timeline-menu { max-height:calc(100vh - 8px); overflow-y:auto; position:fixed; z-index:1000; width:240px; box-sizing:border-box; display:flex; flex-direction:column; gap:8px; padding:12px; background:var(--editor-panel); color:var(--editor-text); border:1px solid var(--editor-border); border-radius:6px; box-shadow:0 8px 24px #49313c24; font-size:12px; }.timeline-menu strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.timeline-menu label { display:flex; flex-direction:column; gap:4px; }.timeline-menu input,.timeline-menu select,.timeline-menu button { box-sizing:border-box; width:100%; background:var(--editor-soft); border:1px solid var(--editor-border); color:var(--editor-text); border-radius:var(--editor-radius); padding:5px 8px; font:inherit; }.timeline-menu button { cursor:pointer; text-align:left; }.timeline-menu button:disabled { opacity:.45; }.timeline-menu small { color:var(--editor-muted); }.key-marquee { position:fixed; pointer-events:none; background:#743a5220; border:1px solid var(--editor-focus); z-index:900; }.timeline-empty { padding:20px; text-align:center; color:var(--editor-muted); }
.multi-timeline { color:var(--editor-text); }
.timeline-tools { background:var(--editor-panel); padding:7px 12px; }
.key-tools { background:var(--editor-panel); padding:7px 12px; }
.timeline-ruler { border-bottom:1px solid var(--editor-border); }
.track-label { color:var(--editor-muted); }
.track-card.active,.track-label.active { color:var(--editor-accent); box-shadow:inset 3px 0 var(--editor-accent); }
.model-clip { color:var(--editor-text); border-radius:8px; }
.model-clip.selected { border-color:var(--editor-accent); }
.model-clip.multiselected { outline-color:var(--editor-accent); }
.track-card small { color:var(--editor-muted); }
.timeline-menu { border-radius:14px; padding:14px; }
.timeline-menu strong { font-size:13px; padding:3px 0 6px; color:var(--editor-accent); }
.timeline-menu button { border-color:transparent; border-radius:8px; padding:7px 9px; }
.timeline-menu button:not(:disabled):hover { background:var(--editor-hover); }
.timeline-menu input,.timeline-menu select { border-radius:7px; border-color:var(--editor-border); padding:7px; }
.timeline-menu button:focus-visible,.timeline-menu input:focus-visible,.timeline-menu select:focus-visible { outline:2px solid var(--editor-focus); outline-offset:1px; }
.timeline-menu .menu-delete { color:var(--editor-accent); }
.key-marquee { border-color:var(--editor-accent); }
.layer-toggle[aria-pressed=true] { background:var(--editor-accent-soft)!important; color:var(--editor-accent)!important; border-color:var(--editor-focus)!important; }
.timeline-tools,.key-tools { flex-wrap:wrap; white-space:normal; overflow:visible; gap:6px 10px; }
.tool-group { display:flex; align-items:center; gap:5px; flex-wrap:wrap; min-width:0; }.tool-group + .tool-group { border-left:1px solid var(--editor-border); padding-left:10px; }.tool-group:empty { display:none; }.zoom-tools { margin-left:auto; }.timeline-tools small { font-size:9px; }.timeline-tools input[type=range] { width:60px; }.context-tools { max-width:100%; }
.neighbor-description { flex:1; min-width:90px; max-width:100%; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.multi-timeline { min-height:220px; }
.curve-segment { position:absolute; top:4px; height:19px; box-sizing:border-box; display:flex; justify-content:center; align-items:center; border-bottom:1px dotted var(--editor-focus); pointer-events:none; padding:0 8px; }
.curve-label { pointer-events:auto; max-width:100%; height:19px; padding:1px 5px!important; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:9px!important; border-radius:4px!important; background:var(--editor-accent-soft)!important; color:var(--editor-accent)!important; opacity:.8; }
.curve-label:hover { opacity:1; }.key-property-row .key-marker { z-index:2; }
.background-track .track-label { gap:6px; }.background-track .layer-name { font-weight:500; color:var(--editor-accent); }
.background-track .track-label button { padding:4px 7px!important; }
.background-swatches { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
.timeline-menu .background-swatch { height:28px; padding:0!important; border-radius:7px!important; border-color:var(--editor-border)!important; }
.timeline-menu .background-swatch:focus-visible { outline:2px solid var(--editor-focus); outline-offset:2px; }
.background-clip { background-image:repeating-linear-gradient(45deg,#00000014 0 6px,transparent 6px 12px); }
.background-clip .clip-name { text-shadow:0 1px 2px #ffffffaa; }
.timeline-menu .menu-hint { color:var(--editor-muted); font-size:11px; padding:4px 2px; line-height:1.5; }
.audio-track .track-label { gap:6px; }.audio-track .layer-name { color:var(--editor-param); }
.audio-track .track-label button { padding:4px 7px!important; }
.audio-clip { background:var(--editor-motion); }
.layer-solo { font-size:10px!important; line-height:1!important; }
.background-clip.hidden,.audio-clip.muted { opacity:.45; }
.audio-scrub { position:absolute; left:4px; right:4px; top:17px; bottom:3px; z-index:2; cursor:crosshair; }
.audio-scrub:hover { background:#ffffff40; }
.audio-volume-key { position:absolute; z-index:3; width:10px; height:10px; margin:0 0 -5px -5px; background:var(--editor-key); border:1px solid #ffffffdd; transform:rotate(45deg); cursor:ns-resize; }
.audio-volume-key:hover,.audio-volume-key:focus-visible { background:var(--editor-accent); }
.clip-thumb { position:absolute; inset:0; z-index:0; width:100%; height:100%; object-fit:cover; opacity:.32; pointer-events:none; }
.model-clip>.clip-name,.model-clip>small { position:relative; z-index:1; }
</style>
