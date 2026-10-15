<script setup lang="ts">
// 动画系统统一图标组件（全部为内联 SVG）。
//
// 为什么不用 emoji / Unicode 符号：符号字形由系统字体决定，
// 在不同平台与字号下基线位置、笔画粗细、颜色继承都不可控；
// 内联 SVG 使用 currentColor，可精确控制尺寸与对齐。
//
// 图标全部按 24×24 视口绘制，默认渲染为 14px。
export type AnimIconName =
  | 'play'
  | 'pause'
  | 'stepPrev'
  | 'stepNext'
  | 'skipStart'
  | 'skipEnd'
  | 'orderForward'
  | 'orderReverse'
  | 'rhythm'
  | 'loop'
  | 'inline'
  | 'float'
  | 'settings'
  | 'close'
  | 'reset'
  | 'axes'
  | 'upload'

const props = withDefaults(defineProps<{ name: AnimIconName; size?: number }>(), {
  size: 14,
})

/** 图标路径（全部为填充式剪影，配合 currentColor 使用） */
const ICONS: Record<AnimIconName, string> = {
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  stepPrev: '<path d="M12 5v14L2 12zM22 5v14l-10-7z"/>',
  stepNext: '<path d="M12 5v14l10-7zM2 5v14l10-7z"/>',
  skipStart: '<path d="M6 5h2.5v14H6zM21 5v14L9 12z"/>',
  skipEnd: '<path d="M15.5 5H18v14h-2.5zM3 5v14l12-7z"/>',
  /**
   * 播放顺序：表达**沿步骤序列推进的方向**（进程走向），而不是数值升降。
   *
   * 构成 = 竖线（进程起点）+ 横向带杆箭头（推进方向）。
   *
   * ⚠ 关键约束：箭头必须保留**明显长于箭头部的杆**。
   * 播放键是「裸三角」（无杆）、单步键是「双三角」、跳转键是「三角+竖条」，
   * 只要箭头带杆，就与它们分属不同形状族，放大到 48px 也不会被误认。
   * 切勿把它简化成单条三角或去掉杆。
   */
  orderForward: '<path d="M3 6.5h2.5v11H3zM8.5 10.75h8v2.5h-8zM16.5 7.75L23 12 16.5 16.25z"/>',
  orderReverse: '<path d="M18.5 6.5H21v11h-2.5zM7.5 10.75h8v2.5h-8zM7.5 7.75L1 12 7.5 16.25z"/>',
  rhythm:
    '<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16z"/><path d="M13 6v6.2l4.6 2.7-1 1.7L11 13V6z"/>',
  loop: '<path d="M17 3l4 4-4 4V8H8a3 3 0 00-3 3v1H3v-1a5 5 0 015-5h9V3z"/><path d="M7 21l-4-4 4-4v3h9a3 3 0 003-3v-1h2v1a5 5 0 01-5 5H7v3z"/>',
  // 原地：完整画框
  inline: '<path d="M4 4h16v2H4zM4 18h16v2H4zM4 4h2v16H4zM18 4h2v16h-2z"/>',
  // 浮窗：画框 + 右下角小窗
  float:
    '<path d="M3 4h18v2H3zM3 18h18v2H3zM3 4h2v16H3zM19 4h2v16h-2z"/><path d="M11 11h7v6h-7z"/>',
  settings:
    '<path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.48.48 0 00-.59-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 110-7.2 3.6 3.6 0 010 7.2z"/>',
  close:
    '<path d="M6.4 5L5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"/>',
  // 复位：准星
  reset:
    '<path d="M11 2h2v4h-2zM11 18h2v4h-2zM2 11h4v2H2zM18 11h4v2h-4z"/><path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0 2a4 4 0 110 8 4 4 0 010-8z"/>',
  // 坐标系：三轴
  axes: '<path d="M4 19h16v2H4zM4 19V3h2v16z"/><path d="M5.6 19.4L18 7l1.4 1.4L7 20.8z"/>',
  // 上传（保存到动画库）：上箭头 + 底座
  upload: '<path d="M12 3.2l4.3 4.3h-2.9v5.2h-2.8V7.5H7.7z"/><path d="M5 16.6h14V20H5z"/>',
}
</script>

<template>
  <svg
    class="anim-icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="currentColor"
    focusable="false"
    aria-hidden="true"
    v-html="ICONS[props.name]"
  />
</template>

<style scoped>
.anim-icon {
  display: block;
  flex: 0 0 auto;
  /* 与文字基线视觉对齐：按钮内多为 12px 文字，图标略高一点更均衡 */
  pointer-events: none;
}
</style>
