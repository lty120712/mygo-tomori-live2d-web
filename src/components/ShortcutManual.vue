<template>
  <button class="manual-trigger" aria-haspopup="dialog" @click="dialog.showModal()">？说明书</button>
  <dialog ref="dialog" aria-labelledby="shortcut-manual-title" @click="closeOutside" @keydown.stop>
    <header><h2 id="shortcut-manual-title">说明书 · 快捷键</h2><button autofocus aria-label="关闭说明书" @click="dialog.close()">关闭</button></header>
    <h3>v2 场景编辑器</h3>
    <p>时间统一显示为整数时间码“分:秒:帧”。例如 30 FPS 下，00:05:08 表示 5 秒 8 帧。时间输入框按 ↑ / ↓ 微调一帧，输入后按 Enter 或离开输入框确认。</p>
    <p>数值统一用整数：位置按像素、旋转按角度；缩放、透明度及小范围身体参数用百分数（例如 100% 对应模型原值 1）。插值和工程文件保留原始精度。</p>
    <table><thead><tr><th>操作</th><th>Windows / Linux</th><th>macOS</th></tr></thead>
      <tbody>
        <tr><td>播放 / 暂停</td><td><kbd>Space</kbd>（空格）</td><td><kbd>Space</kbd>（空格）</td></tr>
        <tr><td>删除选中的片段</td><td><kbd>Delete</kbd></td><td><kbd>Delete</kbd>（前向删除）</td></tr>
        <tr><td>追加 / 取消模型片段选择</td><td><kbd>Ctrl / Shift + 单击</kbd></td><td><kbd>⌘ / Shift + 单击</kbd></td></tr>
        <tr><td>复制 / 粘贴所选模型片段</td><td><kbd>Ctrl + C / Ctrl + V</kbd></td><td><kbd>⌘ + C / ⌘ + V</kbd></td></tr>
        <tr><td>复制 / 粘贴选中动作或表情</td><td><kbd>Ctrl + C / Ctrl + V</kbd></td><td><kbd>⌘ + C / ⌘ + V</kbd></td></tr>
        <tr><td>复制 / 粘贴选中关键帧</td><td><kbd>Ctrl + C / Ctrl + V</kbd></td><td><kbd>⌘ + C / ⌘ + V</kbd></td></tr>
        <tr><td>移动选中的关键帧</td><td><kbd>← / →</kbd>，长按或拖动整体移动</td><td><kbd>← / →</kbd>，长按或拖动整体移动</td></tr>
        <tr><td>上一帧 / 下一帧（未选关键帧时）</td><td><kbd>← / →</kbd>，长按连续移动</td><td><kbd>← / →</kbd>，长按连续移动</td></tr>
        <tr><td>画布移动模型（画布获得焦点）</td><td><kbd>方向键</kbd> 1 像素；<kbd>Shift + 方向键</kbd> 10 像素</td><td><kbd>方向键</kbd> 1 像素；<kbd>Shift + 方向键</kbd> 10 像素</td></tr>
        <tr><td>画布拖动临时关闭对齐吸附</td><td><kbd>Alt</kbd>（按住）</td><td><kbd>Option</kbd>（按住）</td></tr>
        <tr><td>画布旋转角度吸附</td><td><kbd>Shift</kbd>（按住），15°</td><td><kbd>Shift</kbd>（按住），15°</td></tr>
        <tr><td>时间线缩放（鼠标位于时间线）</td><td><kbd>Ctrl + 滚轮</kbd></td><td><kbd>⌘ + 滚轮</kbd></td></tr>
        <tr><td>拖动 / 裁剪时临时关闭吸附</td><td><kbd>Alt</kbd>（按住）</td><td><kbd>Option</kbd>（按住）</td></tr>
        <tr><td>撤销上一步编辑</td><td><kbd>Ctrl + Z</kbd></td><td><kbd>⌘ + Z</kbd></td></tr>
        <tr><td>重做已撤销的编辑</td><td><kbd>Ctrl + Shift + Z</kbd><br /><kbd>Ctrl + Y</kbd></td><td><kbd>⌘ + Shift + Z</kbd><br /><kbd>⌘ + Y</kbd></td></tr>
      </tbody>
    </table>
    <p>选中关键帧后，← / → 每次移动所选关键帧一帧，长按连续移动；多选及拖动保持相对间隔，不覆盖未选中的关键帧、不越过片段边界，一次长按或拖动可整体撤销。Esc 清空选择后，← / → 按工程 FPS 逐帧移动播放头；播放中会先暂停，首尾不越界。输入框内保留原生操作，加载和录制期间禁用逐帧定位。FPS 同时控制时间线步长、播放采样和录制目标帧率；切换时保持镜头时长，关键帧及动作表情事件重排到新帧率的最近帧。实时录制实际帧率受设备渲染速度影响，高负载时可能低于目标。</p>
    <p>空格键切换播放和暂停；输入框、说明书内不触发，模型加载及录制期间不可用。长按空格不会反复切换。播放栏的“循环播放”默认关闭，开启后播放到工程末尾自动回到开头继续，动作、表情和关键帧重新按工程时间播放；暂停后再次播放从当前位置继续，播放中关闭循环则在本轮末尾停止。开关仅影响当前编辑会话的预览，不写入工程或撤销历史；录制始终播放完整工程一次后结束，录制期间开关禁用。</p>
    <p>单击片段或轨道左侧卡片可选中片段；同轨道优先选中播放头所在片段。在左侧卡片点击“删除”或按 Delete 删除。关键帧已选中且焦点在时间线内时，Delete 优先删除选中的关键帧。输入框内保留文字删除行为。时间标尺始终可拖动播放头；关闭“框选”后轨道空白处也可拖动播放头，拖动片段则移动片段。</p>
    <p>撤销和重做适用于片段、参数、关键帧、动作表情、工程设置及导入。播放或录制时暂停使用；在输入框中使用快捷键时，保留输入框原生行为。</p>
    <p>右键菜单按轨道、模型片段、关键帧、动作和表情分组，显示所选数量、快捷键及禁用状态；模型片段支持在播放头切割，多选时同时切割播放头经过的所选片段，整组一步撤销。锁定图层的编辑和删除禁用，解锁与显示开关仍可操作。动作菜单可编辑开始时间、播放时长和源入点，表情菜单只编辑切换时间。模型片段支持 Ctrl / Shift 单击追加选择，在轨道空白处拖动框选多个模型片段；在关键帧区域仍框选关键帧。拖动任一选中模型整体移动，保持时间间隔并吸附播放头及片段边界，Alt 临时关闭吸附。Ctrl+C / Ctrl+V 复制粘贴整组模型，最早片段对齐播放头，新副本插入顶层，保留关键帧、动作表情及源偏移；Delete 删除所选模型。整组操作一步撤销重做，锁定图层跳过多选。图层左侧的锁定和显示按钮（或右键菜单）可锁定、隐藏整组片段。锁定防止画布拖动、片段与关键帧编辑及删除，但仍参与播放和导出；隐藏不参与画布和视频导出，再次显示保留动画数据。状态随工程保存并支持撤销重做。图层名称默认使用模型名称，可双击左侧名称或在右键菜单修改；名称不随排序改变，同轨道片段共用图层名，保存到工程并支持撤销重做。模型轨道也是图层：上方图层显示在前面，点击画布优先选中前面的模型，新添加模型位于最上层。拖动时间线左侧图层卡片上下排列，或右键卡片、模型片段选择“向上一层 / 向下一层”；同轨道的所有片段一起移动，关键帧和动作表情仍跟随各自模型，时间与参数不变。调整图层可一步撤销、重做，并保存在工程中；播放或录制时禁用。</p>
    <p>时间线支持 1×–16× 缩放，放大后可用底部横向滚动条浏览；左侧轨道卡片固定显示。“适合全长”恢复完整工程视图。吸附默认开启，移动片段的入点或出点、裁剪边界可吸附到播放头、其他片段边界和工程首尾，黄色线表示已吸附；按住 Alt / Option 临时关闭。</p>
    <p>模型片段内直接显示关键帧：上排黄色菱形代表位置、缩放等变换，下排蓝色菱形代表身体与表情参数。单击菱形定位，并在关键帧栏显示参数与数值；“‹ / ›”跳到该参数的前后关键帧，“◆”添加或删除当前帧。“展开关键帧”显示参数分轨，可拖动菱形调整时间，保留数值及缓动且不覆盖相邻帧。所有关键帧编辑支持撤销与重做。</p>
    <p>“框选”默认开启：从轨道空白处或菱形之间拖出矩形，可跨参数、跨模型选中多个关键帧；Shift / Ctrl / ⌘ 点击或框选可追加选择。顶部显示已选数量，按 Delete 或“删除选中帧”批量删除；一次撤销恢复整批。片段内合并菱形代表该时间同类的全部参数帧。</p>
    <p>选中关键帧后 Ctrl+C / ⌘C 复制，Ctrl+V / ⌘V 将最早一帧对齐播放头，保留间距、数值和缓动。也可用“复制帧 / 粘贴帧”及右键菜单。单模型选择可粘贴到当前选中模型，跨模型选择则保留原模型归属。FPS 改变后按秒数保持间隔并对齐最近帧。同属性同帧会替换；超出片段或目标参数不兼容时整批不粘贴。粘贴支持一步撤销与重做；复制内容在当前编辑器内保存，刷新后清空，输入框内保留原生复制粘贴。</p>
    <p>右键关键帧只打开编辑菜单，可修改单帧数值、时间及缓动，多选可批量设置缓动。右键轨道卡片、片段或参数轨可全选、展开或删除该范围全部关键帧；“全部”包括被裁剪隐藏的帧，不影响动作表情事件。Esc 或点击外部关闭菜单。</p>
    <p>画布预览默认“适应宽度”，浏览器放大后仍按预览区可用宽度显示，超出高度时在画布区域上下滚动。“完整画面”按可用宽高显示整个镜头。两种模式均保持 16:9 和模型比例，只影响预览，录制尺寸不变。播放工具栏在空间不足时横向滚动。</p>
    <p>点击画布选中模型后，四角手柄等比缩放并固定对角，顶部圆形手柄旋转，Shift 将旋转角度吸附到 15°。拖动人物默认吸附到画布中心、边缘及其他可见模型的中心或外框边缘，黄色辅助线提示对齐；旋转模型按旋转后的外框对齐，锁定模型仍可作为对齐参考，隐藏模型不参与。吸附距离为预览中的 8 像素，Alt / Option 临时关闭。画布获得焦点后，方向键微调 1 个输出像素，Shift 微调 10 像素，长按连续移动且不吸附；焦点在时间线时仍执行逐帧操作，输入框保留原生行为。手柄、拖动和微调共用变换关键帧规则：自动添加开启或对应参数已有动画时记录当前帧，否则修改基础值；一次拖动或长按合并为一步撤销。播放、录制、锁定及不可见模型禁用这些编辑；选框和辅助线不出现在录制视频中。</p>
    <p>动作在选中模型下方显示为片段，标注名称、播放进度及剩余时间；表情以菱形切换帧和名称显示。动作必须完整放入模型片段，下一个动作只能在前一个动作结束后添加；添加、移动、裁剪和粘贴均禁止动作重叠。单击选中，拖动移动，动作左右边缘可裁剪源入点及出点，默认吸附到播放头和片段边界。表情从切换帧保持到下一表情帧，最后一张保持到模型离场，没有时长、进度或倒计时；随时可添加新表情，同帧添加、移动或粘贴会替换原表情，支持撤销恢复。右键编辑切换时间；动作还可编辑播放时长及源动作入点，也可复制或删除。焦点在时间线且选中动作或表情时，Delete 只删除该事件，Ctrl+C 复制，Ctrl+V 粘贴到当前模型的播放头；模型不兼容、同类同帧冲突或超出模型片段时拒绝粘贴。编辑、拖动、裁剪和粘贴支持撤销与重做。</p>
    <p>拖动时间线上沿可调整高度：向上展开更多轨道，向下为画布留出空间。</p>
    <p>画面变换中的“重置位置和大小”将 X、Y 恢复为 0、缩放恢复为 100%，保留旋转、透明度及动作表情。逐个参数判断：当前有关键帧时更新该帧；位于两个关键帧之间时插入当前帧；无关键帧时只恢复基础值，即使自动添加已开启也不额外造帧；已有动画范围之外不改动该参数。其他关键帧保留，一次重置可整体撤销重做。</p>
    <p>一次拖动或连续输入合并为一步。撤销后进行新编辑会清空重做记录；最多保留 100 步，刷新页面或切换编辑器会清空历史。</p>
    <h3>v1 编辑器</h3>
    <p>数值统一用整数：位置按像素、旋转按角度；缩放、透明度及小范围身体参数用百分数（例如 100% 对应模型原值 1）。插值和工程文件保留原始精度。</p>
    <table><thead><tr><th>快捷键</th><th>操作</th></tr></thead><tbody>
      <tr><td><kbd>Space</kbd>（空格）</td><td>播放 / 暂停</td></tr>
      <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>暂停时向前 / 向后移动一帧</td></tr>
    </tbody></table>
    <p>左右方向键逐帧定位仅在 v1 编辑器中生效，输入框内不触发。</p>
    <footer><kbd>Esc</kbd> 关闭说明书</footer>
  </dialog>
</template>

<script setup>
import { ref } from 'vue'
const dialog = ref(null)
function closeOutside(event) {
  if(event.target !== dialog.value)return
  const rect=dialog.value.getBoundingClientRect()
  if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.value.close()
}
</script>

<style scoped>
.manual-trigger { white-space:nowrap; }
dialog { box-sizing:border-box; width:min(620px,calc(100vw - 32px)); max-height:calc(100vh - 48px); overflow:auto; padding:24px; color:#dce5f2; background:#182237; border:1px solid #526887; border-radius:10px; font-size:13px; line-height:1.6; box-shadow:0 20px 80px #0008; }
dialog::backdrop { background:#070b16b8; }
header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
h2 { font-size:19px; margin:0; } h3 { font-size:14px; color:#9bd6ff; margin:22px 0 10px; }
table { width:100%; border-collapse:collapse; text-align:left; } th,td { padding:9px 10px; border-bottom:1px solid #35445c; } th { font-size:12px; color:#a2b5ce; } kbd { font:12px 'Segoe UI',sans-serif; color:#eef5ff; white-space:nowrap; }
p,footer { color:#a2b5ce; font-size:12px; } footer { border-top:1px solid #35445c; margin-top:20px; padding-top:12px; }
button { background:#263751; border:1px solid #455a76; color:#dce5f2; border-radius:4px; padding:5px 8px; cursor:pointer; font:inherit; } button:hover { background:#365271; } button:focus-visible { outline:2px solid #9bd6ff; outline-offset:2px; }
</style>
