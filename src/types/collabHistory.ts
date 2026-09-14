// src/types/collabHistory.ts
// 协作历史消息（按设计方案落地）：
// - 分类前缀 + 昵称 + 动作 + 对象，携带年月日-时间
// - 修改类消息对目标对象的所有可变属性标注「修改前 → 修改后」（箭头连接）
// - 撤销/重做消息引用被撤销/重做的操作（quote）
// - 与 Yjs 共享文档同步：后加入者可见此前历史，房间关闭清空重置

export type CollabHistoryCategory =
  | 'create' // 创建
  | 'delete' // 删除
  | 'update' // 修改（含参数 before→after）
  | 'move' // 移动/拖拽
  | 'lock' // 锁定
  | 'unlock' // 解锁
  | 'merge' // 合并点（结构操作）
  | 'clear' // 清空场景（结构操作）
  | 'room' // 加入/离开协作房间
  | 'undo' // 撤销
  | 'redo' // 重做

/**
 * 单条参数变化：label 为参数中文名（半径/高度/边长/长度/面积/名称…），
 * before/after 为展示字符串（数值保留 2 位小数）。
 */
export interface CollabHistoryParam {
  label: string
  before: string
  after: string
}

export interface CollabHistoryMessage {
  /** 唯一标识 */
  id: string
  /** 操作者 Yjs clientId */
  clientId: number
  /** 操作者昵称 */
  userName: string | null
  /** 消息类别（决定 [前缀] ） */
  category: CollabHistoryCategory
  /** 中文动作短语：创建了/删除了/修改了/移动了/锁定了/解锁了/合并了点/清空了场景/加入了协作/离开了协作/撤销了/重做了 */
  action: string
  /** 目标对象中文类型：点/线段/直线/圆/球体/圆锥/圆柱/立方体/正多边形/棱柱/棱锥/展开图/面/垂线/平行线/射线/向量 */
  targetType: string | null
  /** 目标对象名：点A/球体1/正六面体2… */
  targetName: string | null
  /** 修改/锁定涉及的可变属性变化（修改：before→after；锁定：仅 label） */
  params: CollabHistoryParam[]
  /** 撤销/重做引用被撤销/重做的操作描述，如「创建了 点A」 */
  quote: string | null
  /** 补充标注：如修改类消息是通过拖动某点达成的，标注「通过移动A点」 */
  note?: string | null
  /** 时间戳（展示为「2026-09-08 14:30:05」） */
  createdAt: number
}

/** 按展示顺序排列的 [分类] 前缀 */
export const COLLAB_HISTORY_PREFIX: Record<CollabHistoryCategory, string> = {
  create: '[创建]',
  delete: '[删除]',
  update: '[修改]',
  move: '[移动]',
  lock: '[锁定]',
  unlock: '[解锁]',
  merge: '[合并]',
  clear: '[清空]',
  room: '[协作]',
  undo: '[撤销]',
  redo: '[重做]',
}

/** 时间戳格式化：年月日-时间（2026-09-08 14:30:05） */
export function formatCollabHistoryTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 将结构化消息渲染为完整文本（动作 + 种类 + 名称 + 属性变化；撤销/重做带「被引用操作」） */
export function renderCollabHistoryMessage(message: CollabHistoryMessage): string {
  const parts: string[] = [COLLAB_HISTORY_PREFIX[message.category], message.userName || '其他用户']

  let main = message.action
  // 种类+名称紧密相连（点B/三点圆c），与界面一致
  if (message.targetType && message.targetName) main += ` ${message.targetType}${message.targetName}`
  else {
    if (message.targetType) main += ` ${message.targetType}`
    if (message.targetName) main += ` ${message.targetName}`
  }
  parts.push(main)

  if (message.params.length > 0) {
    const paramText = message.params
      .map((p) => {
        if (p.before && p.after) return `${p.label} ${p.before}→${p.after}`
        if (p.before) return `${p.label} ${p.before}`
        return p.label
      })
      .join('，')
    parts.push(`：${paramText}`)
  }

  if (message.quote) {
    parts.push(`「${message.quote}」`)
  }

  if (message.note) {
    parts.push(message.category === 'delete' ? `→ ${message.note}` : message.note)
  }

  return parts.join(' ')
}