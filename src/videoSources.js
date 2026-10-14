/**
 * 视频片段在画布上要画「播放头那一刻的一帧」，这里负责把每个素材的 <video> 元素对齐到那一刻：
 *
 * - 暂停或拖动播放头时按素材内时间 seek，画面随 seek 完成自动刷新；
 * - 播放与录制时让视频按原生速度自己播，只有和播放头偏差超过容差才纠正，
 *   避免每帧 seek 造成的卡顿；
 * - 播放头离开片段（画面里没有这个片段）时暂停，不空转。
 *
 * 元素工厂、素材地址与变更通知都可注入，方便在无浏览器环境测试。
 */
export function createVideoSources(options = {}) {
  const {
    url = async () => null,
    create = () => document.createElement('video'),
    changed = () => {},
    driftTolerance = .15,
    seekTolerance = .04,
  } = options
  const entries = new Map()

  function release(id, entry) {
    entries.delete(id)
    try { entry.el.pause?.() } catch {}
    try { entry.el.removeAttribute?.('src') } catch {}
    try { entry.el.load?.() } catch {}
  }

  function load(id, entry) {
    Promise.resolve().then(() => url(id)).then(source => {
      if (entries.get(id) !== entry) return
      if (!source) { entry.status = 'missing'; return }
      entry.el.src = source
      entry.el.load?.()
    }).catch(() => {
      if (entries.get(id) === entry) entry.status = 'missing'
    }).finally(() => {
      if (entries.get(id) === entry) changed()
    })
  }

  function sync(ids) {
    const wanted = new Set(ids)
    for (const [id, entry] of entries) if (!wanted.has(id)) release(id, entry)
    for (const id of wanted) {
      if (entries.has(id)) continue
      const el = create()
      el.muted = true
      el.playsInline = true
      el.preload = 'auto'
      const entry = { el, status: 'loading' }
      entries.set(id, entry)
      el.addEventListener?.('loadeddata', () => {
        if (entries.get(id) !== entry) return
        entry.status = 'ready'
        changed()
      })
      el.addEventListener?.('error', () => {
        if (entries.get(id) !== entry) return
        entry.status = 'missing'
        changed()
      })
      load(id, entry)
    }
    changed()
  }

  /** 把素材内时间对齐到视频元素：播放时跟随、暂停时 seek，返回元素本身。 */
  function align(id, sourceTime, { playing = false } = {}) {
    const entry = entries.get(id)
    if (!entry) return null
    const el = entry.el
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0
    const target = duration ? Math.max(0, Math.min(duration - 1e-3, sourceTime)) : Math.max(0, sourceTime)
    if (playing) {
      if (el.paused !== false) {
        const started = el.play?.()
        if (started && typeof started.catch === 'function') started.catch(() => {})
      }
      if (Math.abs(target - el.currentTime) > driftTolerance) el.currentTime = target
    } else {
      if (el.paused === false) el.pause?.()
      if (Math.abs(target - el.currentTime) > seekTolerance) el.currentTime = target
    }
    return el
  }

  /** 暂停播放头这次没有用到的视频，避免离开片段后还在空转。 */
  function pauseExcept(ids) {
    const keep = new Set(ids)
    for (const [id, entry] of entries) {
      if (keep.has(id) || entry.el.paused !== false) continue
      entry.el.pause?.()
    }
  }

  return {
    sync,
    align,
    pauseExcept,
    get: id => entries.get(id)?.el || null,
    status: id => entries.get(id)?.status || 'missing',
    /** 首帧是否已经可以画：readyState≥2 表示有当前帧的像素数据。 */
    drawable: id => (entries.get(id)?.el.readyState ?? 0) >= 2,
    destroy() { for (const [id, entry] of entries) release(id, entry) },
  }
}
