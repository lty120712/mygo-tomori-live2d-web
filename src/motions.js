/**
 * 动作时长采集。
 *
 * 时间轴上的动作事件需要知道每个动作到底多长：判断区间是否重叠、事件条画多宽、
 * 当前位置还能放下多长的动作，都依赖它。Live2D SDK 只在动作第一次播放时才通过
 * motionstart 事件给出时长，在那之前无从得知，所以这里在模型加载后直接读动作文件算。
 *
 * 兼容两种格式：
 * - Cubism 6 的 .motion3.json：Meta.Duration 就是秒数
 * - Cubism 2 的 .mtn：形如 PARAM_X=v1,v2,... 的逐帧采样曲线，
 *   取采样点最多的一条，时长 = 采样点数 / $fps
 *   （与 Live2D 运行时一致：它对每条曲线统计全部采样点再乘以 1000/fps）
 */

/** 拿不到真实时长时的兜底值（秒），仅用于保证界面不至于空着 */
export const ESTIMATED_MOTION_SECONDS = 2

export function parseMtnDuration(text) {
  const fpsMatch = text.match(/^\s*\$fps\s*=\s*(\d+(?:\.\d+)?)\s*$/m)
  const fps = fpsMatch ? Number(fpsMatch[1]) : 30
  if (!Number.isFinite(fps) || fps <= 0) return null

  let maxSamples = 0
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    const eq = line.indexOf('=')
    if (eq <= 0 || line.startsWith('$')) continue
    const samples = line.slice(eq + 1).split(',').length
    if (samples > maxSamples) maxSamples = samples
  }
  if (maxSamples < 1) return null
  return maxSamples / fps
}

async function readMotionSeconds(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    if (/\.motion3\.json$/i.test(url)) {
      const json = await res.json()
      const duration = json?.Meta?.Duration
      return Number.isFinite(duration) && duration > 0 ? duration : null
    }
    return parseMtnDuration(await res.text())
  } catch {
    return null
  }
}

/**
 * @param {string} modelUrl 模型目录，以 / 结尾
 * @param {Record<string, string[]>} motions SDK 给的 { 组名: [动作文件相对路径] }
 * @returns {Promise<Record<string, number>>} { 组名: 秒 }
 */
export async function collectMotionDurations(modelUrl, motions) {
  const result = {}
  const tasks = []

  for (const [group, files] of Object.entries(motions || {})) {
    if (!Array.isArray(files) || files.length === 0) continue
    tasks.push((async () => {
      const seconds = await Promise.all(files.map(file => readMotionSeconds(modelUrl + file)))
      const valid = seconds.filter(v => typeof v === 'number' && v > 0)
      // 同一组可能有多个候选动作（SDK 会随机挑一个），取最长的那个来占区间
      if (valid.length > 0) result[group] = Math.max(...valid)
    })())
  }

  await Promise.all(tasks)
  return result
}

/** 把秒数格式化成人看的形式 */
export function formatSeconds(seconds) {
  return Number.isFinite(seconds) && seconds > 0 ? seconds.toFixed(1) + 's' : '未知时长'
}
