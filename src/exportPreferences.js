export const EXPORT_PREFERENCES_KEY='video-export-preferences'
export function normalizeExportPreferences(value,{formats=['mp4','webm'],offlineAvailable=false}={}){
  const data=value && typeof value==='object'?value:{}
  const format=formats.includes(data.format)?data.format:formats.includes('mp4')?'mp4':formats[0] || ''
  return {
    format,
    resolution:['540','720','1080'].includes(String(data.resolution))?String(data.resolution):'1080',
    quality:['standard','high','maximum'].includes(data.quality)?data.quality:'high',
    method:format==='mp4' && offlineAvailable && data.method!=='realtime'?'offline':'realtime',
  }
}
