export function formatTimecode(seconds, fps) {
  const total=Math.max(0,Math.round(seconds*fps)),whole=Math.floor(total/fps)
  return [Math.floor(whole/60),whole%60,total%fps].map(n=>String(n).padStart(2,'0')).join(':')
}
export function parseTimecode(text, fps) {
  const parts=String(text).trim().split(':')
  if(parts.length!==3 || !parts.every(p=>/^\d+$/.test(p)))return null
  const [minutes,seconds,frames]=parts.map(Number)
  if(seconds>=60 || frames>=fps)return null
  return minutes*60+seconds+frames/fps
}
