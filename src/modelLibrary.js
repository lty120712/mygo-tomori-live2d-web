export const characterNames={tomori:'高松灯',anon:'千早爱音'}
export function describeModel(model) {
  const name=model.name.toLowerCase(),character=characterNames[model.category] || model.category
  let outfit=model.name
  if(name.includes('school_summer'))outfit='高中夏季校服'
  else if(name.includes('school_winter'))outfit=name.includes('jhs') ? '初中冬季校服' : '高中冬季校服'
  else if(name.includes('roomwear'))outfit='家居服'
  else if(name.includes('casual'))outfit='便装'
  else if(name.includes('furisode'))outfit='振袖'
  else if(name.includes('birthday'))outfit='生日服装'
  else if(name.includes('dream_festival'))outfit='梦限服装'
  else if(name.includes('collabo'))outfit='联动服装'
  else if(name.includes('live'))outfit='演出服'
  const version=name.startsWith('adv_') ? '剧情模型' : name.includes('low') ? '简化模型' : '标准模型'
  const details=[]
  if(name.includes('glasses'))details.push('眼镜版')
  const year=name.match(/20\d{2}/)?.[0];if(year)details.push(year)
  const event=name.match(/(?:event|collabo|dream_festival)_([a-z0-9_]+)$/)?.[1]?.replace(/_(?:ssr|sr|ur|r)$/,'');if(event)details.push(event.toUpperCase().replaceAll('_',' · '))
  const rarity=name.match(/_(ssr|sr|ur|r)$/)?.[1];if(rarity)details.push(rarity.toUpperCase())
  return {...model,character,outfit,version,label:outfit,detail:[version,...details].join(' · '),id:model.category+'/'+model.name}
}
export function filterModelLibrary(models,{character='',outfit='',version='',search=''}={}) {
  const terms=search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return models.filter(m=>(!character || m.category===character) && (!outfit || m.outfit===outfit) && (!version || m.version===version) && terms.every(t=>(m.character+' '+m.outfit+' '+m.detail+' '+m.category+' '+m.name).toLowerCase().includes(t)))
}
