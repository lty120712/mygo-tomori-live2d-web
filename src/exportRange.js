import {frameCountForDuration} from './timecode.js'

/** 导出区间采用左闭右开的工程帧，不改片段和素材的源入点。 */
export function exportRange(duration,fps,request={}){
  const rate=[24,30,60].includes(Number(fps))?Number(fps):30
  const total=frameCountForDuration(Number(duration),rate)
  if(!Number.isFinite(total) || total<1)throw new Error('工程没有可导出的时长')
  const custom=request?.mode==='custom'
  const start=custom?Number(request.start):0,end=custom?Number(request.end):total/rate
  if(!Number.isFinite(start) || !Number.isFinite(end) || start<0 || end>total/rate || end<0)throw new Error('导出时间须在工程范围内')
  const startFrame=Math.round(start*rate),endFrame=Math.min(total,Math.round(end*rate))
  if(endFrame<=startFrame)throw new Error('结束时间必须晚于开始时间，至少保留一帧')
  return {startFrame,endFrame,start:startFrame/rate,end:endFrame/rate,duration:(endFrame-startFrame)/rate,frames:endFrame-startFrame}
}
/** Only the marked edges are remembered; unmarked edges follow the project. */
export function timelineExportRange(points,duration,fps){
  if(!points || (points.start==null && points.end==null))return null
  try{
    const full=exportRange(duration,fps)
    return exportRange(duration,fps,{
      mode:'custom',
      start:points.start==null ? 0 : Math.min(full.end,points.start),
      end:points.end==null ? full.end : Math.min(full.end,points.end),
    })
  }catch{return null}
}

export function markTimelineExportEdge(points,edge,time,duration,fps){
  if(!['start','end'].includes(edge) || !Number.isFinite(time) || time<0 || time>duration)return null
  const next={...points,[edge]:time},range=timelineExportRange(next,duration,fps)
  return range ? {...next,[edge]:range[edge]} : null
}

export function reconcileTimelineExportEdges(points,duration,fps){
  const range=timelineExportRange(points,duration,fps)
  return range ? {start:points.start==null ? null : range.start,end:points.end==null ? null : range.end} : null
}

