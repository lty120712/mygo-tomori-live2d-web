export const isPanButton=button=>button===1
export function panOffset(origin,start,pointer){return {x:origin.x+pointer.x-start.x,y:origin.y+pointer.y-start.y}}
