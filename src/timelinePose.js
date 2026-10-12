import { resolveParamId } from './params.js'
const sine=x=>(1-Math.cos(Math.PI*Math.max(0,Math.min(1,x))))/2
export const sourceMotionTime=(event,localFrame,fps)=>Math.max(0,(event.offset || 0)+(localFrame-event.frame)/fps)

// Evaluate the loaded Cubism motion against an isolated parameter buffer.
// SDK interpolation, per-parameter fades and eye/lip effects remain authoritative.
export function sampleTimelinePose(sdk,info,motionEvent,expressionName,expressionSeconds,localFrame,fps,groups,base={}) {
  const params=groups.flatMap(g=>g.params),values=Object.fromEntries(params.map(p=>[p.key,base[p.key] ?? p.default])),written=new Set()
  const key=id=>resolveParamId(typeof id==='string' ? id : id?.getString?.()?.s ?? id?.getString?.() ?? '',groups)
  const set=(id,value,weight=1)=>{const k=key(id);if(k && Number.isFinite(value)){values[k]+=(value-values[k])*weight;written.add(k)}}
  const add=(id,value,weight=1)=>{const k=key(id);if(k){values[k]+=value*weight;written.add(k)}}
  const mult=(id,value,weight=1)=>{const k=key(id);if(k){values[k]*=1+(value-1)*weight;written.add(k)}}
  const modern=sdk?._state?.l2d6Model?._subdelegates?.[0]?.getLive2DManager()?._models?.[0]
  if(modern) {
    const model=modern._model
    const target=new Proxy(model,{get(object,prop){
      if(prop==='getParameterValueByIndex')return i=>values[paramsByIndex[i]] ?? object.getParameterDefaultValue(i)
      if(prop==='setParameterValueByIndex')return (i,v,w)=>set(paramsByIndex[i],v,w)
      if(prop==='getParameterValueById')return id=>values[key(id)] ?? 0
      if(prop==='setParameterValueById')return set
      if(prop==='addParameterValueById')return add
      if(prop==='multiplyParameterValueById')return mult
      if(prop==='setModelOapcity')return ()=>{}
      const value=object[prop];return typeof value==='function' ? value.bind(object) : value
    }})
    const paramsByIndex=Array.from({length:model.getParameterCount()},(_,i)=>key(model.getParameterId(i)))
    if(motionEvent) {
      // Candidate 0 is fixed, rather than selecting a new random take on every seek.
      const motion=modern._motions.get(motionEvent.name+'_0')
      if(motion) {
        const time=sourceMotionTime(motionEvent,localFrame,fps),duration=motion.getLoopDuration()
        const entry={isAvailable:()=>true,isFinished:()=>false,isStarted:()=>true,getStartTime:()=>0,getFadeInStartTime:()=>0,getEndTime:()=>duration,setState(){},setIsFinished(){},setEndTime(){}}
        motion.updateParameters(target,entry,Math.min(time,Math.max(0,duration-1e-7)))
      }
    }
    const expression=modern._expressions?.get(expressionName)
    if(expression)expression.doUpdateParameters(target,expressionSeconds,expression.getFadeInTime()<=0 ? 1 : sine(expressionSeconds/expression.getFadeInTime()),{})
  } else {
    const sample=motionEvent && info[motionEvent.name]?.samples?.[0]
    if(sample) {
      const time=sourceMotionTime(motionEvent,localFrame,fps),position=time*sample.fps
      const weight=(sample.fadeIn<=0 ? 1 : sine(time/sample.fadeIn))*(sample.fadeOut<=0 ? 1 : sine((sample.duration-time)/sample.fadeOut))
      for(const [id,curve] of Object.entries(sample.curves)) {
        const index=Math.min(Math.floor(position),curve.length-1),next=Math.min(index+1,curve.length-1)
        set(id,curve[index]+(curve[next]-curve[index])*(position-Math.floor(position)),weight)
      }
    }
    const expression=sdk?._state?.l2d2Model?.live2DMgr?.getModel()?.expressions?.[expressionName]
    if(expression) {
      const weight=sine(expressionSeconds/((expression.getFadeIn?.() || 1000)/1000))
      for(const p of expression.paramList || [])(p.type===0 ? set : p.type===2 ? mult : add)(p.id,p.value,weight)
    }
  }
  return Object.fromEntries([...written].map(k=>{const p=params.find(p=>p.key===k);return [k,Math.max(p.min,Math.min(p.max,values[k]))]}))
}
