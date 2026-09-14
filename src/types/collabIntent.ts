// src/types/collabIntent.ts
// 操作级意图：命令/Feature 执行时直接声明「用户做了什么」。
// 协作历史消息生成时优先采用意图（主语/属性/标注零反推），快照差异只作无意图时的兜底。
// 这也是未来「历史操作回放动画」的素材之一（意图 + before/after 快照双份数据）。

/** 可由命令声明的历史消息分类（room/undo/redo 由系统生成，无需命令声明） */
export type CollabIntentCategory =
  | 'create'
  | 'delete'
  | 'update'
  | 'move'
  | 'lock'
  | 'unlock'
  | 'merge'
  | 'clear'

/** 单条属性变化：label 中文名（半径/边长/名称/显示/数值/颜色…），before/after 为展示文本 */
export interface CollabIntentParam {
  label: string
  before?: string
  after?: string
}

/**
 * 操作级意图。
 * targetId 是消息主语的唯一定义：用户实际点选/操作的对象（null = 无对象级目标，如清空场景）。
 * category 可缺省（如拖拽类命令在生成时无法判定是「移动」还是「修改」，交由 builder 判定）。
 */
export interface CollabOperationIntent {
  category?: CollabIntentCategory | null
  targetId: string | null
  /** 种类/名称直接声明（可选）；缺省时按 targetId 从场景解析，并沿用「名称含种类词则省略」规则 */
  targetType?: string | null
  targetName?: string | null
  /** 修改类：命令直接声明的属性变化（替代 diff，杜绝「7.48→7.48」式噪声） */
  params?: CollabIntentParam[]
  /** 补充标注，如「由N点拖动」 */
  note?: string | null
  /** 拖拽类：实际被拖动的点 id */
  draggedPointId?: string | null
  /** 合并类：保留点 id 与吸收点 id 清单 */
  keepPointId?: string | null
  removedPointIds?: string[]
}

/** 命令可携带意图的通用接口（SnapshotCommand / ConstraintAwareCommand / 其他命令均可实现） */
export interface OperationIntentAware {
  intent?: CollabOperationIntent | null
}

// ===== 展示文本格式化（与 historyMessageBuilder 兜底逻辑完全一致，保证两种来源格式统一） =====

const fmtNum = (n: number) =>
  Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : String(n)

/** 数值 before/after 展示（两位小数） */
export const numParam = (label: string, before: number, after: number): CollabIntentParam | null => {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  const b = fmtNum(before)
  const a = fmtNum(after)
  if (b === a) return null
  return { label, before: b, after: a }
}

/** 字符串 before/after（如名称）；无变化返回 null */
export const strParam = (label: string, before: string, after: string): CollabIntentParam | null => {
  if (before === after) return null
  return { label, before, after }
}

/** 布尔属性（名称显示/数值显示/可见性/中心点显示/保持垂直等）→ 开/关 */
export const onText = (v: unknown): string => (v ? '开' : '关')

export const boolParam = (label: string, before: unknown, after: unknown): CollabIntentParam | null => {
  if (before === after) return null
  return { label, before: onText(before), after: onText(after) }
}

/** 颜色值（number 0xRRGGBB / null）→ 展示文本 */
export const colorTextOf = (v: unknown): string => {
  const n = typeof v === 'number' ? v : null
  if (n === null) return '无'
  return `#${((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

export const colorParam = (label: string, before: unknown, after: unknown): CollabIntentParam | null => {
  if (before === after) return null
  return { label, before: colorTextOf(before), after: colorTextOf(after) }
}