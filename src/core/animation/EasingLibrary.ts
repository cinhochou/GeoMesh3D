// src/core/animation/EasingLibrary.ts
// 缓动函数库。用于步间过渡的插值系数计算。

import type { EasingType } from './types'

/** 缓动函数：输入 [0,1]，输出 [0,1] */
export type EasingFn = (t: number) => number

const linear: EasingFn = (t) => t
const easeIn: EasingFn = (t) => t * t
const easeOut: EasingFn = (t) => 1 - (1 - t) * (1 - t)
const easeInOut: EasingFn = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const easeInOutCubic: EasingFn = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** 阶跃：不过渡，到达阈值瞬间切换 */
const step: EasingFn = (t) => (t >= 1 ? 1 : 0)

export const EASING_FUNCTIONS: Record<EasingType, EasingFn> = {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  easeInOutCubic,
  step,
}

/** 缓动显示名（供 UI 下拉使用） */
export const EASING_LABELS: Record<EasingType, string> = {
  linear: '匀速',
  easeIn: '渐快',
  easeOut: '渐慢',
  easeInOut: '先加速后减速',
  easeInOutCubic: '平滑（推荐）',
  step: '阶跃（无过渡）',
}

/** 按类型取缓动函数；未知类型回退到 easeInOutCubic */
export function getEasing(type: EasingType): EasingFn {
  return EASING_FUNCTIONS[type] ?? easeInOutCubic
}

/** 计算缓动值并夹紧到 [0,1] */
export function ease(type: EasingType, t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t
  return getEasing(type)(clamped)
}
