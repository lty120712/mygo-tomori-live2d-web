const clamp=(value,low,high)=>Math.max(low,Math.min(high,value))

// Leave room to move past the current content without extending playback or export.
export function timelineEditEnd(duration,fps,limit){
  if(duration>=limit)return limit
  const room=clamp(duration*.2,2,30)
  return Math.min(limit,Math.round((duration+room)*fps)/fps)
}

export function clipEditScope({clips,backgroundClips,audioClips,visualIds=[],backgroundId,audioId}){
  if(backgroundId && backgroundClips.some(c=>c.id===backgroundId))return {kind:'background',clips:backgroundClips}
  const audio=audioId && audioClips.find(c=>c.id===audioId)
  if(audio)return {kind:'audio',track:audio.track,clips:audioClips.filter(c=>c.track===audio.track)}
  const ids=new Set(visualIds),tracks=new Set(clips.filter(c=>ids.has(c.id)).map(c=>c.track))
  if(tracks.size===1){
    const [track]=tracks
    return {kind:'visual',track,clips:clips.filter(c=>c.track===track)}
  }
  return {kind:'all',clips:[...clips,...backgroundClips,...audioClips]}
}

export function clipEditFrames(clips,duration,fps){
  if(!Number.isFinite(duration) || !Number.isFinite(fps) || duration<=0 || fps<=0)return []
  const times=new Set(),last=Math.round(duration*fps)
  for(const clip of clips){
    if(!Number.isFinite(clip.start) || !Number.isFinite(clip.duration) || clip.duration<=0)continue
    for(const time of [clip.start,clip.start+clip.duration]){
      const frame=Math.round(time*fps)
      if(frame>=0 && frame<=last)times.add(frame)
    }
  }
  return [...times].sort((a,b)=>a-b)
}

/** A shared seam is one edit point; never stop on the current frame again. */
export function neighborEditFrames(frames,at){
  let low=0,high=frames.length
  while(low<high){
    const middle=(low+high)>>>1
    if(frames[middle]<at)low=middle+1
    else high=middle
  }
  return {previous:frames[low-1] ?? null,next:frames[low+(frames[low]===at ? 1 : 0)] ?? null}
}

/** scrollLeft 的原点对应时间零；左侧固定的轨道名称宽度应由调用方扣除。 */
export function revealTimelineTime(time,{duration,laneWidth,visibleWidth,scrollLeft=0,center=false,padding=24}){
  if(![time,duration,laneWidth,visibleWidth,scrollLeft].every(Number.isFinite) || duration<=0 || laneWidth<=0 || visibleWidth<=0)return null
  const maximum=Math.max(0,laneWidth-visibleWidth),left=clamp(scrollLeft,0,maximum)
  const x=clamp(time,0,duration)/duration*laneWidth,margin=clamp(padding,0,visibleWidth/4)
  if(center)return clamp(x-visibleWidth/2,0,maximum)
  if(x>left+visibleWidth-margin)return clamp(x-margin,0,maximum)
  if(x<left+margin)return clamp(x-visibleWidth+margin,0,maximum)
  return left
}

export function timelineRange(items,duration){
  const valid=items.filter(item=>item && Number.isFinite(item.start) && Number.isFinite(item.duration) && item.duration>=0 && item.start<=duration && item.start+item.duration>=0)
  if(!valid.length)return null
  return {start:clamp(Math.min(...valid.map(item=>item.start)),0,duration),end:clamp(Math.max(...valid.map(item=>item.start+item.duration)),0,duration)}
}

/** 选择能容纳整个选区的最大离散缩放级别，首尾留出可操作的空隙。 */
export function fitTimelineRange(range,{duration,visibleWidth,maxLevel=4,padding=32}){
  if(!range || ![range.start,range.end,duration,visibleWidth].every(Number.isFinite) || duration<=0 || visibleWidth<=0 || range.end<range.start)return null
  const start=clamp(range.start,0,duration),end=clamp(range.end,0,duration),span=end-start
  const room=Math.max(1,visibleWidth-2*clamp(padding,0,visibleWidth/4))
  let level=0
  for(let candidate=1;candidate<=maxLevel;candidate++){
    if(span/duration*visibleWidth*2**candidate>room)break
    level=candidate
  }
  const laneWidth=visibleWidth*2**level
  return {level,scrollLeft:revealTimelineTime((start+end)/2,{duration,laneWidth,visibleWidth,center:true})}
}
