import { audibleAudioClips, isVideoClip, visualClips, visualLayerFilter } from './mediaTracks.js'

export function sceneAudioClips(project) {
  const visuals = visualClips(project)
  const visibility = visualLayerFilter(visuals, project.backgroundClips)
  const videos = visuals.filter(c => isVideoClip(c) && !c.layerHidden && visibility.clipVisible(c) && !c.videoMuted)
    .map(c => ({ ...c, volume: c.videoVolume ?? 1 }))
  return [...audibleAudioClips(project.audioClips, project.audioTrackState), ...videos]
}
