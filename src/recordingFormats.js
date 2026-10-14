const candidates = {
  mp4: ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/mp4'],
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
}

export function recordingFormats(supports = type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
  return Object.entries(candidates).flatMap(([id, types]) => {
    const mimeType = types.find(supports)
    return mimeType ? [{ id, label: id.toUpperCase(), mimeType }] : []
  })
}
