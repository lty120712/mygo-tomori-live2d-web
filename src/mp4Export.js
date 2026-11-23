/** Native MediaRecorder MP4 is fragmented; rebuild a regular indexed MP4 without re-encoding. */
export function mp4ExportPlan(mimeType='',{videoBitsPerSecond}={}){
  const native=mimeType.split(';')[0].trim().toLowerCase()==='video/mp4',input=native?'input.mp4':'input.webm'
  const rate=Number(videoBitsPerSecond)
  return {input,args:['-i',input,'-map','0:v:0','-map','0:a?',...(native?['-c','copy']:['-c:v','libx264','-preset','ultrafast',...(Number.isFinite(rate)&&rate>0?['-b:v',String(Math.round(rate))]:['-crf','18']),'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k']),'-movflags','+faststart','output.mp4']}
}
