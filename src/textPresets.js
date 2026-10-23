// 预设使用文字片段已有的样式结构；添加时复制数值，工程不依赖预设文件。
export const TEXT_PRESETS=[{id:'basic',name:'基础文字',description:'自由编辑内容、字体、描边与阴影',text:'请输入文字',style:{}}]
export function textPreset(id='basic'){
  return TEXT_PRESETS.find(p=>p.id===id) || TEXT_PRESETS[0]
}
