import {resolveParamId} from './params.js'
// SDK forced parameters run after motion/expression updates. Omit only the IDs
// owned by explicit animation events, retaining all unrelated parameter keys.
export function sceneParameterOverrides(body,mouse,ownedIds,groups){
  const owned=new Set(ownedIds.map(id=>resolveParamId(id,groups) || id))
  return Object.fromEntries(Object.entries({...body,...mouse}).filter(([key])=>!owned.has(key)))
}
