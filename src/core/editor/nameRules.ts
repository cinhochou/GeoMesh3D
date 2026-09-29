// src/core/editor/nameRules.ts
// 几何对象「名称」的统一规则入口。
//
// 规则（名称必填）：
// 用户在侧边栏清空名称输入框属于无效输入，不得被当作一次真实修改：
//  - 不得写入本地撤销/重做历史（避免出现「名称改为空」的空历史）；
//  - 不得写入协作共享历史，也不得生成「名称改为空」的协作消息；
//  - 输入框在提交后回退显示为当前有效名称。
//
// 实现约定：空串 / 纯空白 → 归一为 undefined，与「patch 未提供该字段」等价，
// 由各 update* 方法的下发逻辑决定保留原值。

/** 归一化名称文本：全角空格转半角、去除首尾空白 */
export function normalizeNameText(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\u3000/g, ' ').trim()
}

/** 名称文本是否有效（归一化后非空） */
export function isValidNameText(raw: string | null | undefined): boolean {
  return normalizeNameText(raw).length > 0
}

/**
 * 归一化名称补丁。
 * 返回 undefined 表示「本次名称变更无效，应忽略」，调用方应沿用原名称
 * （与非名称字段的 `patch.x ?? current.x` 语义保持一致）。
 */
export function normalizeNamePatch(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const text = normalizeNameText(raw)
  return text.length > 0 ? text : undefined
}

/**
 * 归一化「名称片段」（后缀部件，如立体的编号）。
 * 无效时返回 undefined，调用方应放弃本次名称变更。
 */
export function normalizeNamePart(raw: string | null | undefined): string | undefined {
  const text = normalizeNameText(raw)
  return text.length > 0 ? text : undefined
}
