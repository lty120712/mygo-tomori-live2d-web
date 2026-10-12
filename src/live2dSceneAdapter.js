/**
 * l2d 2.1.1 的 Cubism 6 release() 会调用全局 Framework.dispose()，
 * 销毁共享 ID/JSON/着色器管理器，导致其他实例失效。
 * 场景只释放该实例的模型、渲染委托和监听，全局 Framework 留给其他实例复用。
 * SDK 升级时需复核 _state / _subdelegates 结构。
 */
export function isolateModelDisposal(sdk) {
  const modern = sdk?._state?.l2d6Model
  if (!modern || modern.sceneDisposalIsolated) return
  modern.sceneDisposalIsolated = true
  modern.release = function () {
    if (this._released) return
    this._released = true
    this.stop()
    this.releaseEventListener()
    for (const delegate of this._subdelegates) {
      const manager = delegate.getLive2DManager()
      const gl = delegate.getGlManager?.()?.getGl()
      for (const model of manager?._models || []) model.release()
      if (manager) manager._models = []
      delegate.release()
      // SDK 的共享缓存仍可能持有上下文；主动归还 GPU 资源，避免反复添加删除耗尽上下文。
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
    this._subdelegates = []
    this._cubismOption = null
  }
}

// setParams 只保存覆盖表，并不会立即更新位图。暂停编辑后主动绘制，
// 确保合成预览冻结的是修改后的姿态。
export function renderModelNow(sdk) {
  const modern = sdk?._state?.l2d6Model
  if (modern && !modern._released) {
    for (const delegate of modern._subdelegates) delegate.update()
  }
}

export function stopModelMotion(sdk) {
  sdk?._state?.l2d2Model?.live2DMgr?.getModel()?.mainMotionManager?.stopAllMotions()
  for(const delegate of sdk?._state?.l2d6Model?._subdelegates || []) {
    for(const model of delegate.getLive2DManager()?._models || [])model._motionManager?.stopAllMotions()
  }
}

// Start at a trimmed source in-point. Cubism queues expose their timing entry;
// initialize it before the first render so the motion doesn't replay its intro.
export function playTimelineMotion(sdk,name,offset=0,legacyNow=()=>globalThis.UtSystem?.getUserTimeMSec() ?? Date.now()) {
  stopModelMotion(sdk)
  sdk.playMotion(name,undefined,3)
  // Cubism 2's bundled queue stores source start / fade-in / end in milliseconds.
  const legacy=sdk?._state?.l2d2Model?.live2DMgr?.getModel()?.mainMotionManager
  for(const entry of legacy?.motions || []) {
    const start=legacyNow()-offset*1000,duration=entry._$w0?.getDurationMSec()
    entry._$z2=start;entry._$bs=start
    entry._$Do=duration>0 ? start+duration : -1
  }
  for(const delegate of sdk?._state?.l2d6Model?._subdelegates || []) {
    for(const model of delegate.getLive2DManager()?._models || []) {
      const manager=model._motionManager
      for(const entry of manager?._motions || []) {
        entry._motion.setupMotionQueueEntry(entry,manager._userTimeSeconds)
        entry.setStartTime(entry.getStartTime()-offset)
        entry.setFadeInStartTime(entry.getFadeInStartTime()-offset)
        if(entry.getEndTime()>0)entry.setEndTime(entry.getEndTime()-offset)
      }
    }
  }
}

// Independent SDK loops share a wall-clock delta. Give each instance its own
// elapsed time so background/offscreen rendering cannot starve later models.
export function isolateModelTiming(sdk, now = () => performance.now()) {
  for(const delegate of sdk?._state?.l2d6Model?._subdelegates || []) {
    for(const model of delegate.getLive2DManager()?._models || []) {
      if(model.sceneTimingIsolated)continue
      model.sceneTimingIsolated=true
      let previous=now(),delta=0
      const update=model.update.bind(model)
      const manager=model._motionManager,scheduler=model._updateScheduler
      const updateMotion=manager.updateMotion.bind(manager),lateUpdate=scheduler.onLateUpdate.bind(scheduler)
      manager.updateMotion=(target)=>updateMotion(target,delta)
      scheduler.onLateUpdate=(target)=>lateUpdate(target,delta)
      model.update=()=>{
        const current=now();delta=Math.max(0,Math.min(.1,(current-previous)/1000));previous=current
        const elapsed=model._userTimeSeconds
        update();model._userTimeSeconds=elapsed+delta
      }
    }
  }
}

export function resetModelPose(sdk) {
  stopModelMotion(sdk)
  const legacy=sdk?._state?.l2d2Model?.live2DMgr?.getModel()?.live2DModel
  if(legacy) {
    for(const p of sdk.getParams())legacy.setParamFloat(p.id,p.default)
    legacy.saveParam()
  }
  for(const delegate of sdk?._state?.l2d6Model?._subdelegates || []) {
    for(const instance of delegate.getLive2DManager()?._models || []) {
      const model=instance._model
      if(!model)continue
      for(let index=0;index<model.getParameterCount();index++)model.setParameterValueByIndex(index,model.getParameterDefaultValue(index))
      model.saveParameters()
    }
  }
}

const parameterId=id=>typeof id==='string' ? id : id?.getString?.()?.s ?? id?.getString?.() ?? ''
function vectorItems(vector){return Array.isArray(vector) ? vector : vector?.getSize ? Array.from({length:vector.getSize()},(_,i)=>vector.at(i)) : []}
export function expressionParameterIds(sdk,name){
  if(!name)return []
  const ids=[]
  const legacy=sdk?._state?.l2d2Model?.live2DMgr?.getModel()?.expressions?.[name]
  for(const p of legacy?.paramList || [])ids.push(parameterId(p.id))
  for(const delegate of sdk?._state?.l2d6Model?._subdelegates || [])for(const model of delegate.getLive2DManager()?._models || []){
    const expression=model._expressions?.get(name)
    for(const p of vectorItems(expression?.getExpressionParameters?.()))ids.push(parameterId(p.parameterId))
  }
  return [...new Set(ids.filter(Boolean))]
}
export function motionEffectParameterIds(sdk,effects=[]){
  const ids=[]
  for(const delegate of sdk?._state?.l2d6Model?._subdelegates || [])for(const model of delegate.getLive2DManager()?._models || []){
    for(const [effect,key] of [['EyeBlink','_eyeBlinkIds'],['LipSync','_lipSyncIds']])if(effects.includes(effect))ids.push(...vectorItems(model[key]).map(parameterId))
  }
  return ids.filter(Boolean)
}
