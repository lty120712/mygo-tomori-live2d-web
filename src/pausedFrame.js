// Keep one bitmap per model instead of allocating a GPU-backed canvas on every mouse move.
export function capturePausedFrame(cache, id, source, revision, create = () => document.createElement('canvas')) {
  let frame = cache.get(id)
  if (!frame || frame.image.width !== source.width || frame.image.height !== source.height) {
    const image = create()
    image.width = source.width; image.height = source.height
    frame = {image, revision, captures: 0}
    cache.set(id, frame)
  }
  if (frame.revision !== revision) {frame.revision = revision; frame.captures = 0}
  if (frame.captures < 2) {
    const ctx = frame.image.getContext('2d')
    ctx.clearRect(0, 0, source.width, source.height)
    ctx.drawImage(source, 0, 0)
    frame.captures++
  }
  return frame.image
}
