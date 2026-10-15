// src/core/animation/SnapshotScopeOps.ts
// 快照的「范围裁剪」与「跨场景合并」——动画库导入播放（playbackMode = 'merge'）的核心数据操作。
//
// 组成：
//  - cropToScope：把段的 baseSnapshot 裁到录制范围闭包（只保留段真正涉及的实体与约束）；
//  - mergeSnapshots：目标场景快照 ∪ 裁剪后的段快照；
//  - buildMergeSnapshotCache：构造导入模式的完整快照流水线（cache[0] = 合并起点）。
//
// 关键语义（勿回退）：
//  - **段优先**：合并时同 id 取段内实体（保证播放起点与 delta 序列的基准一致）；
//    目标场景仅保留与段无 id 交集的原有对象（即"环境对象"）。
//  - **约束「主体域接管」**：subjectUniverse（段接管的主体集合）内的约束由段全权决定
//    （该存在的存在、该消失的消失），域外保留目标场景约束（envConstraints，全程不变）。
//    每步 delta.constraints 非 null 时，整体替换为「env ∪ 段该步视图」——
//    通过在 build 阶段做 delta 预处理复用原生 applyDelta（其约束为整份替换语义），
//    **不修改 applyDelta 本身**，原生（native）播放路径零感知。
//  - **导入模式忽略锚点**：anchorSnapshot 是录制方全场景快照，若参与会把
//    "当前快照"整体替换成录制方场景、抹掉目标场景几何。本模式全程 delta 递推
//    （delta 只涉及范围内实体，不触碰环境对象）。
//
// ⚠ 目标场景快照必须包含其全部对象：restoreFromSnapshot 以快照为准全量落地，
//    快照中没有的对象会被删除。merge 保证了这一点（环境对象原样保留）。

import type { DeltaEntityKey, RecordingSession, SceneSnapshot, SnapshotDelta } from './types'
import { DELTA_ENTITY_KEYS, applyDelta } from './SnapshotDelta'
import {
  buildRecordingScope,
  getConstraintSubjectId,
  type RecordingScope,
  type ScopeConstraintSnapshot,
} from './RecordingScope'

const entityArray = (snapshot: SceneSnapshot, key: DeltaEntityKey): Array<{ id: string }> =>
  (snapshot[key] ?? []) as unknown as Array<{ id: string }>

/**
 * 裁剪：只保留范围内实体与范围内主体的约束。
 * 约束过滤依据 subjectUniverse（而非"实体在不在"）——复合体没有实体数组，
 * 其约束存在性由主体 id 决定。
 */
export function cropToScope(snapshot: SceneSnapshot, scope: RecordingScope): SceneSnapshot {
  const out = {} as Record<string, unknown>
  for (const key of DELTA_ENTITY_KEYS) {
    out[key] = entityArray(snapshot, key).filter((item) => scope.ids.has(item.id))
  }
  out.constraints = ((snapshot.constraints ?? []) as ScopeConstraintSnapshot[]).filter((c) =>
    scope.subjectUniverse.has(getConstraintSubjectId(c)),
  )
  return out as unknown as SceneSnapshot
}

/**
 * 合并：目标场景快照 ∪ 裁剪后的段快照（段优先）。
 * @param segment 已 crop 的段快照（其约束主体必然 ⊆ subjectUniverse）
 */
export function mergeSnapshots(
  target: SceneSnapshot,
  segment: SceneSnapshot,
  scope: RecordingScope,
): SceneSnapshot {
  const out = {} as Record<string, unknown>
  for (const key of DELTA_ENTITY_KEYS) {
    // 段优先：先从目标移除与范围同 id 的条目，再并入段侧条目
    const environment = entityArray(target, key).filter((item) => !scope.ids.has(item.id))
    out[key] = [...environment, ...segment[key]]
  }
  out.constraints = [
    // 环境约束：目标场景中不属于段接管主体的约束，全程保留
    ...((target.constraints ?? []) as ScopeConstraintSnapshot[]).filter(
      (c) => !scope.subjectUniverse.has(getConstraintSubjectId(c)),
    ),
    // 段侧约束：crop 后仅含主体 ⊆ subjectUniverse 的条目
    ...(segment.constraints ?? []),
  ]
  return out as unknown as SceneSnapshot
}

/**
 * 为导入模式预处理一步 delta：约束替换为「env ∪ 段该步视图」。
 * changes 原样复用（delta 只涉及范围内实体，由闭包保证）。
 */
export function prepareDeltaForImport(
  delta: SnapshotDelta,
  envConstraints: unknown[],
  subjectUniverse: Set<string>,
): SnapshotDelta {
  if (delta.constraints === null) return delta
  const segmentView = (delta.constraints as ScopeConstraintSnapshot[]).filter((c) =>
    subjectUniverse.has(getConstraintSubjectId(c)),
  )
  return {
    changes: delta.changes,
    constraints: [...envConstraints, ...segmentView],
  }
}

/**
 * 导入模式的快照流水线：
 *   cache[0] = merge(目标场景, crop(段.baseSnapshot))
 *   cache[i+1] = applyDelta(cache[i], 预处理后的 delta_i)
 * 全程忽略锚点（见文件头说明）。
 */
export function buildMergeSnapshotCache(
  session: RecordingSession,
  targetSnapshot: SceneSnapshot,
): SceneSnapshot[] {
  const scope = buildRecordingScope(session)
  const envConstraints = ((targetSnapshot.constraints ?? []) as ScopeConstraintSnapshot[]).filter(
    (c) => !scope.subjectUniverse.has(getConstraintSubjectId(c)),
  )

  const cache: SceneSnapshot[] = []
  let current = mergeSnapshots(targetSnapshot, cropToScope(session.baseSnapshot, scope), scope)
  cache.push(current)

  for (const step of session.steps) {
    const delta = prepareDeltaForImport(step.delta, envConstraints, scope.subjectUniverse)
    current = applyDelta(current, delta)
    cache.push(current)
  }
  return cache
}
