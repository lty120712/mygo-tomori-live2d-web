const candidates = {
  mp4: ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/mp4'],
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
}

export function recordingFormats(supports = type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
  const mp4 = candidates.mp4.find(supports)
  const webm = candidates.webm.find(supports)
  return [
    ...(mp4 || webm ? [{ id:'mp4',label:'MP4',mimeType:mp4 || webm,transcode:!mp4 }] : []),
    ...(webm ? [{ id:'webm',label:'WebM',mimeType:webm,transcode:false }] : []),
  ]
}
