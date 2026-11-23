// Pixels per second increase toward the edge, independently of display refresh rate.
export function edgeScrollStep(state, elapsed = 16) {
  const {point, bounds, horizontal = true, vertical = false} = state
  if (!state.active || !point || !bounds) return {x:0,y:0}
  const {left,right,top,bottom} = bounds
  if (![left,right,top,bottom,point.clientX,point.clientY].every(Number.isFinite) || right<=left || bottom<=top) return {x:0,y:0}
  const seconds=Math.max(0,Math.min(50,Number(elapsed)||0))/1000
  const speed=(at,min,max)=>{
    const margin=Math.min(40,(max-min)/3)
    const penetration=at<min+margin ? -Math.min(1,(min+margin-at)/margin) : at>max-margin ? Math.min(1,(at-max+margin)/margin) : 0
    return Math.sign(penetration)*720*penetration**2*seconds
  }
  // Keep scrolling just outside an edge, but stop when the pointer leaves the editor.
  const nearX=point.clientX>=left-170 && point.clientX<=right+60
  const nearY=point.clientY>=top-60 && point.clientY<=bottom+60
  return {x:horizontal && nearY && nearX ? speed(point.clientX,left,right) : 0,y:vertical && nearX && nearY ? speed(point.clientY,top,bottom) : 0}
}

export function createTimelineAutoScroll({getState,scroll,onScroll,requestFrame,cancelFrame}) {
  let pending=null,point=null,lastTime=null
  function stop(){if(pending!==null)cancelFrame(pending);pending=null;point=null;lastTime=null}
  function tick(time){
    pending=null
    const state=getState(),step=edgeScrollStep({...state,point},lastTime===null ? 16 : time-lastTime)
    lastTime=time
    if((!step.x && !step.y) || !scroll(step)){stop();return}
    onScroll(point)
    // onScroll can end the gesture; never revive a cancelled loop.
    if(point)pending=requestFrame(tick)
  }
  return {
    update(value){point=value;if(pending===null){lastTime=null;pending=requestFrame(tick)}},
    stop
  }
}
