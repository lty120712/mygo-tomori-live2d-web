// Snap in screen pixels so precision remains predictable at every zoom level.
export function editTimelineClip(drag, delta, { duration, fps, targets = [], tolerance = 0 }) {
  const frame = 1 / fps, round = value => Math.round(value * fps) / fps
  const end = drag.start + drag.duration
  let value, low, high, edges
  if (drag.mode === 'move') {
    low = 0; high = duration - drag.duration
    value = Math.max(low, Math.min(high, round(drag.start + delta)))
    edges = [0, drag.duration]
  } else if (drag.mode === 'right') {
    low = drag.start + frame; high = duration
    value = Math.max(low, Math.min(high, round(end + delta)))
    edges = [0]
  } else {
    low = Math.max(0, drag.start - drag.offset); high = end - frame
    value = Math.max(low, Math.min(high, round(drag.start + delta)))
    edges = [0]
  }
  let snapTime = null, distance = Infinity, snapped = value
  for (const target of targets) {
    const at = round(target)
    for (const edge of edges) {
      const candidate = at - edge, gap = Math.abs(candidate - value)
      if (candidate >= low - 1e-9 && candidate <= high + 1e-9 && gap <= tolerance && gap < distance) {
        snapped = Math.max(low, Math.min(high, candidate)); distance = gap; snapTime = at
      }
    }
  }
  const patch = drag.mode === 'move' ? { start: snapped }
    : drag.mode === 'right' ? { duration: snapped - drag.start }
    : { start: snapped, duration: end - snapped, offset: drag.offset + snapped - drag.start }
  return { patch, snapTime }
}

export function timelineTicks(duration, width) {
  const desired = duration * 80 / Math.max(1, width)
  const magnitude = 10 ** Math.floor(Math.log10(desired))
  const step = [1, 2, 5, 10].find(n => n * magnitude >= desired) * magnitude
  return Array.from({ length: Math.ceil(duration / step) }, (_, i) => Number((i * step).toPrecision(8)))
}
