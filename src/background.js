/**
 * 录制背景设置。
 *
 * 录制素材常常需要抠像，所以默认是绿幕纯色；也可以换成任意颜色，
 * 或者上传一张图片铺满画面。
 */

/** 默认绿幕色（常用的 chroma key 绿） */
export const DEFAULT_BG_COLOR = '#00b140'

export function createBackground() {
  return { color: DEFAULT_BG_COLOR, image: null, imageName: '' }
}

/** 有图片时图片优先，否则用纯色 */
export function resolveBgColor(background) {
  return (background && background.color) || DEFAULT_BG_COLOR
}
