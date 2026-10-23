// 保留旧工程的等比 scale，轴向倍率默认 1，两者相乘得到实际缩放。
export const scaleX=pose=>(pose.scale ?? 1)*(pose.scaleX ?? 1)
export const scaleY=pose=>(pose.scale ?? 1)*(pose.scaleY ?? 1)
