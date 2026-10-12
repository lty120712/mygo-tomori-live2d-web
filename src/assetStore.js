export const ASSET_LIMITS = { image: 64 * 1024 * 1024, audio: 512 * 1024 * 1024 }

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|avif)$/
const AUDIO_MIME = /^audio\/(mpeg|mp4|wav|x-wav|ogg|aac|flac|webm)$/
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif)$/
const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|aac|flac|weba|opus)$/

export function kindOfFile(file) {
  const name = (file.name || '').toLowerCase()
  if (IMAGE_MIME.test(file.type) || IMAGE_EXT.test(name)) return 'image'
  if (AUDIO_MIME.test(file.type) || AUDIO_EXT.test(name)) return 'audio'
  return null
}

export function sizeOk(file, kind) {
  const limit = ASSET_LIMITS[kind]
  return typeof limit === 'number' && file.size <= limit
}
