export function videoExportSettings({resolution='1080',quality='high',fps=30,portrait=false}={}){
  const height=[540,720,1080].includes(Number(resolution))?Number(resolution):1080
  const width=height===540?960:height===720?1280:1920
  const frameRate=[24,30,60].includes(Number(fps))?Number(fps):30
  const level=['standard','high','maximum'].includes(quality)?quality:'high'
  const rate={standard:6,high:12,maximum:20}[level]*1e6*(height/1080)**2*(frameRate/30)
  return {width:portrait?height:width,height:portrait?width:height,fps:frameRate,videoBitsPerSecond:Math.round(rate),audioBitsPerSecond:192000}
}
