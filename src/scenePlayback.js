export function playbackFrame(elapsedFrames,totalFrames,loop=false,recording=false) {
  const total=Math.max(1,Math.round(totalFrames)),elapsed=Math.max(0,elapsedFrames)
  if(loop && !recording && elapsed>=total)return {frame:Math.floor(elapsed%total),wrapped:true,ended:false,remainder:elapsed%total}
  return {frame:Math.min(total,Math.floor(elapsed)),wrapped:false,ended:elapsed>=total,remainder:0}
}
