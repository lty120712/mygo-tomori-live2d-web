export const TRACK_TYPES={
  model:{label:'模型',symbol:'人',color:'#9261bf',fill:'#efe5f9'},
  image:{label:'图片',symbol:'图',color:'#327eae',fill:'#e2f0fa'},
  video:{label:'视频',symbol:'影',color:'#4666c0',fill:'#e7ebfc'},
  text:{label:'文字',symbol:'T',color:'#ae7822',fill:'#fff1cf'},
  audio:{label:'音频',symbol:'♪',color:'#378578',fill:'#def3ec'},
  background:{label:'背景',symbol:'底',color:'#a56d5c',fill:'#f5e8e0'},
  mixed:{label:'混合',symbol:'叠',color:'#777787',fill:'#ededf3'}
}
export function clipType(clip){return clip.model ? 'model' : ['text','video'].includes(clip.media) ? clip.media : 'image'}
export function visualTrackType(clips){const kinds=new Set(clips.map(clipType));return kinds.size===1 ? [...kinds][0] : 'mixed'}
export function trackStyle(type){const style=TRACK_TYPES[type] || TRACK_TYPES.mixed;return {'--track-color':style.color,'--track-fill':style.fill}}
