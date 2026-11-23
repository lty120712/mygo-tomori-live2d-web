export function playbackFrame(frameAt,endFrame,loop=false,recording=false,inFrame=0) {
  const start=Math.max(0,Math.round(inFrame)),span=Math.max(1,Math.round(endFrame)-start)
  const elapsed=Math.max(0,frameAt-start)
  if(loop && !recording && elapsed>=span)return {frame:start+Math.floor(elapsed%span),wrapped:true,ended:false,remainder:elapsed%span}
  return {frame:start+Math.min(span,Math.floor(elapsed)),wrapped:false,ended:elapsed>=span,remainder:0}
}
