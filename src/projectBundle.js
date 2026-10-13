/** 二进制工程包：12 字节前缀 + UTF-8 清单 + 原始素材，避免 base64 膨胀。 */
const MAGIC = 'TOMORI01'
const HEADER_LIMIT = 16 * 1024 * 1024
/** 汇总工程引用的素材 ID。清单可能来自外部文件，字段不是数组时跳过，交给调用方统一报错。 */
export function projectAssetIds(project) {
  const lists = [project?.imageClips, project?.backgroundClips, project?.audioClips]
  return [...new Set(lists.filter(Array.isArray).flat().map(clip => clip?.assetId).filter(Boolean))]
}

export async function packProject(project, store) {
  const catalog = new Map((await store.list()).map(meta => [meta.id, meta]))
  const entries = [], blobs = []
  for (const id of projectAssetIds(project)) {
    const meta = catalog.get(id), blob = await store.blob(id)
    if (!meta || !blob) throw new Error('素材缺失，无法完整打包：' + (meta?.name || id))
    entries.push({ id, name: meta.name, type: blob.type || meta.mimeType, size: blob.size })
    blobs.push(blob)
  }
  const manifest = new TextEncoder().encode(JSON.stringify({ format: MAGIC, project, assets: entries }))
  if (manifest.byteLength > HEADER_LIMIT) throw new Error('工程清单过大，无法打包')
  const prefix = new Uint8Array(12)
  prefix.set(new TextEncoder().encode(MAGIC))
  new DataView(prefix.buffer).setUint32(8, manifest.byteLength, true)
  return new Blob([prefix, manifest, ...blobs], { type: 'application/octet-stream' })
}

export async function unpackProject(file) {
  if (file.size < 12) throw new Error('工程包不完整')
  const prefix = await file.slice(0, 12).arrayBuffer()
  const magic = new TextDecoder().decode(new Uint8Array(prefix, 0, 8))
  const length = new DataView(prefix).getUint32(8, true)
  if (magic !== MAGIC || length > HEADER_LIMIT || 12 + length > file.size) throw new Error('不支持或损坏的工程包')
  const manifest = JSON.parse(await file.slice(12, 12 + length).text())
  if (manifest.format !== MAGIC || !manifest.project || !Array.isArray(manifest.assets) || manifest.assets.length > 160) throw new Error('工程包清单无效')
  let offset = 12 + length
  const assets = [], ids = new Set()
  for (const entry of manifest.assets) {
    if (typeof entry.id !== 'string' || ids.has(entry.id) || typeof entry.name !== 'string' || typeof entry.type !== 'string' || !Number.isSafeInteger(entry.size) || entry.size < 0 || offset + entry.size > file.size) throw new Error('工程包素材无效或不完整')
    ids.add(entry.id)
    assets.push({ id: entry.id, file: new File([file.slice(offset, offset + entry.size)], entry.name, { type: entry.type }) })
    offset += entry.size
  }
  if (offset !== file.size || projectAssetIds(manifest.project).some(id => !ids.has(id))) throw new Error('工程包素材不完整')
  return { project: manifest.project, assets }
}

/** 导入重新分配素材 ID，避免覆盖浏览器中同 ID 的其它素材。失败则回收本次新增素材。 */
export async function restoreBundle(bundle, store) {
  const project = JSON.parse(JSON.stringify(bundle.project)), remap = new Map(), added = []
  try {
    for (const entry of bundle.assets) {
      const meta = await store.importFile(entry.file)
      added.push(meta.id); remap.set(entry.id, meta.id)
    }
    for (const clip of [...(project.imageClips || []), ...(project.backgroundClips || []), ...(project.audioClips || [])]) {
      if (clip.assetId) clip.assetId = remap.get(clip.assetId)
    }
    return project
  } catch (error) {
    await Promise.allSettled(added.map(id => store.remove(id)))
    throw error
  }
}
