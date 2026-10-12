// One decoded bitmap per asset, shared by duplicate clips. Late loads are closed
// when a clip is removed, an import replaces the project, or the canvas unmounts.
export function createImageSources({ blob, decode = createImageBitmap, changed = () => {} }) {
  const entries = new Map()
  function release(id, entry) { entries.delete(id); entry.source?.close?.() }
  function sync(ids) {
    const wanted = new Set(ids)
    for (const [id, entry] of entries) if (!wanted.has(id)) release(id, entry)
    for (const id of wanted) {
      if (entries.has(id)) continue
      const entry = { status: 'loading', source: null }
      entries.set(id, entry)
      Promise.resolve().then(() => blob(id)).then(file => {
        if (!file) throw new Error('素材缺失')
        return decode(file)
      }).then(source => {
        if (entries.get(id) !== entry) { source.close?.(); return }
        entry.source = source; entry.status = 'ready'
      }).catch(() => {
        if (entries.get(id) === entry) entry.status = 'missing'
      }).finally(() => { if (entries.get(id) === entry) changed() })
    }
    changed()
  }
  return {
    sync,
    get: id => entries.get(id)?.source,
    status: id => entries.get(id)?.status,
    destroy() { for (const [id, entry] of entries) release(id, entry) },
  }
}
