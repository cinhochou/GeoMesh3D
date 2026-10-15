// src/core/animation/SnapshotDelta.ts
// 快照增量的计算与应用。
//
// 记录系统采用「首帧全量 + 后续增量」策略：
//  - diffSnapshot(prev, next) 产出相邻两步之间的增量；
//  - applyDelta(snapshot, delta) 在「快照副本」上叠加增量，得到下一步快照；
//  - 恢复流程始终是「取锚点快照 → 依次 applyDelta 到目标步 → restoreFromSnapshot 到影子场景」。
//
// 注意：增量只在「快照数据」层面运算，不直接改 Scene；
//      最终仍由 restoreFromSnapshot 统一落地（保证不变式对齐、脏标记、约束重建）。

import type { SceneSnapshot, SnapshotDelta, DeltaEntityKey, UnknownEntity, DeltaEntityChange } from './types'

/** 参与 diff 的实体键（与 SceneSubgraphSnapshot 的数组字段一致，constraints 单独处理） */
export const DELTA_ENTITY_KEYS: DeltaEntityKey[] = [
  'points',
  'lines',
  'straightLines',
  'rays',
  'vectors',
  'circles',
  'faces',
  'spheres',
  'cones',
  'cylinders',
  'perpendicularLines',
  'parallelLines',
  'nets',
]

/** 取快照中某个实体集数组（带类型收窄） */
function entityArray(snap: SceneSnapshot, key: DeltaEntityKey): UnknownEntity[] {
  return (snap[key] ?? []) as unknown as UnknownEntity[]
}

/**
 * 计算两个快照之间的增量。
 * 按实体 id 做 upsert/removed 判定；实体变化用 JSON 深比较（实体均为纯数据）。
 */
export function diffSnapshot(prev: SceneSnapshot, next: SceneSnapshot): SnapshotDelta {
  const changes: Partial<Record<DeltaEntityKey, DeltaEntityChange>> = {}

  for (const key of DELTA_ENTITY_KEYS) {
    const prevArr = entityArray(prev, key)
    const nextArr = entityArray(next, key)

    const prevMap = new Map<string, UnknownEntity>()
    for (const item of prevArr) prevMap.set(item.id, item)

    const nextIds = new Set<string>()
    const upsert: UnknownEntity[] = []
    for (const item of nextArr) {
      nextIds.add(item.id)
      const before = prevMap.get(item.id)
      if (!before || !entitiesEqual(before, item)) {
        upsert.push(item)
      }
    }

    const removed: string[] = []
    for (const id of prevMap.keys()) {
      if (!nextIds.has(id)) removed.push(id)
    }

    if (upsert.length > 0 || removed.length > 0) {
      changes[key] = { upsert, removed }
    }
  }

  // 约束：无稳定 id 索引，按 JSON 整体比较；变化则整份记录
  const prevConstraints = prev.constraints ?? []
  const nextConstraints = next.constraints ?? []
  const constraintsChanged = !deepEqual(prevConstraints, nextConstraints)

  return {
    changes,
    constraints: constraintsChanged ? nextConstraints : null,
  }
}

/**
 * 在一个快照副本上应用增量，返回新快照。
 * 不修改传入对象（内部做浅拷贝 + 受影响数组的深拷贝）。
 */
export function applyDelta(base: SceneSnapshot, delta: SnapshotDelta): SceneSnapshot {
  const next = { ...base } as SceneSnapshot

  for (const key of Object.keys(delta.changes) as DeltaEntityKey[]) {
    const change = delta.changes[key]
    if (!change) continue

    const arr = [...entityArray(base, key)]
    const indexById = new Map<string, number>()
    arr.forEach((item, i) => indexById.set(item.id, i))

    // 删除
    if (change.removed.length > 0) {
      const removedSet = new Set(change.removed)
      const filtered = arr.filter((item) => !removedSet.has(item.id))
      arr.length = 0
      arr.push(...filtered)
      indexById.clear()
      arr.forEach((item, i) => indexById.set(item.id, i))
    }

    // 新增 / 覆盖
    for (const item of change.upsert) {
      const idx = indexById.get(item.id)
      if (idx !== undefined) {
        arr[idx] = item
      } else {
        indexById.set(item.id, arr.length)
        arr.push(item)
      }
    }

    ;(next as unknown as Record<string, unknown>)[key] = arr
  }

  if (delta.constraints !== null) {
    next.constraints = delta.constraints as SceneSnapshot['constraints']
  }

  return next
}

/**
 * 判断某步增量是否为空（无任何实体变化且约束未变）。
 */
export function isDeltaEmpty(delta: SnapshotDelta): boolean {
  return Object.keys(delta.changes).length === 0 && delta.constraints === null
}

/** 统计增量中涉及变化的实体总数（用于调试/提示） */
export function countDeltaEntities(delta: SnapshotDelta): number {
  let n = 0
  for (const change of Object.values(delta.changes)) {
    if (!change) continue
    n += change.upsert.length + change.removed.length
  }
  return n
}

// ─────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────

/** 快速判断两个实体是否相同（JSON 深比较；实体均为纯数据） */
function entitiesEqual(a: UnknownEntity, b: UnknownEntity): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** 深度相等（JSON 语义） */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
