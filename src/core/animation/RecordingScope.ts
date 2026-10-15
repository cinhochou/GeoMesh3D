// src/core/animation/RecordingScope.ts
// 录制范围闭包：推导「一段录制波及的实体传递闭包」，以及它「接管」的约束主体集合。
//
// 用途：动画库导入播放（playbackMode = 'merge'）时，只把段真正涉及的几何对象
// 从段快照搬入目标场景 —— 见 SnapshotScopeOps.cropToScope / buildMergeSnapshotCache。
//
// 设计要点：
//  - **纯快照数据计算，不依赖 Scene 实例**：导入时「目标场景 ≠ 录制场景」，
//    且录制期的约束对象可能已被删除，也因此不能复用 getDependencyPointIds()（运行时依赖）。
//  - 引用图含三类边（与 SnapshotCommand 的快照字段一一对应，改字段时务必同步本文件）：
//      ① 实体 → 引用的点 / 实体（正向字段，见 extractEntityRefs / extractConstraintRefs）；
//      ② 反向传播：任一被引用 id 进入范围时，引用它的实体整体纳入。
//         关键场景：拖动一条「录制起点已存在」的线段端点 —— 线自身快照不因拖动而变化、
//         不会出现在 delta 里，只能靠「端点 → 引用它的线」反向找到；
//      ③ 约束：任一引用字段命中范围即整体纳入（含主体与全部引用），避免悬空引用。
//  - 展开取「实体所有版本引用字段的并集」（同一实体在 base 与各步 delta 中版本可能不同）。
//  - 宁多勿漏：闭包偏大只影响导入体积；偏小会产生悬空引用（几何体找不到构成点）。
//
// ⚠ 复合体（正六面体 / 正多边形 / 棱柱 / 棱锥）没有独立实体数组：
//    它们的身份 = 约束主体 id + 挂在该 id 下的点与面。
//    闭包中「作用域 id」可以包含这类逻辑 id（无数组条目），
//    其展开完全经「点 / 面的归属字段」与「约束扫描」完成。

import type { DeltaEntityKey, RecordingSession, SceneSnapshot, UnknownEntity } from './types'
import { DELTA_ENTITY_KEYS } from './SnapshotDelta'

/** 约束快照（从快照结构索引而来，避免反向依赖 SnapshotCommand 的内部类型） */
export type ScopeConstraintSnapshot = SceneSnapshot['constraints'][number]

/** 录制范围闭包 */
export interface RecordingScope {
  /** 范围内全部 id（点 + 13 类实体 + 复合体逻辑 id；不含约束本身） */
  ids: Set<string>
  /**
   * 段「接管」的约束主体集合（用于约束裁剪与逐步合并）：
   * 主体在范围内、且其约束在段中出现过。
   * 域内约束由段全权决定（该存在的存在、该消失的消失），域外保留目标场景约束。
   */
  subjectUniverse: Set<string>
}

/** 约束快照的主体 id（10 类逐一映射；改约束结构时务必同步） */
export function getConstraintSubjectId(c: ScopeConstraintSnapshot): string {
  switch (c.type) {
    case 'cube':
      return c.cubeId
    case 'intersection':
      return c.pointId
    case 'regularPolygon':
      return c.constraintId
    case 'prism':
      return c.prismId
    case 'pyramid':
      return c.pyramidId
    case 'planar':
      return c.faceId
    case 'cylinder':
      return c.cylinderId
    case 'objectConstrainedPoint':
      return c.pointId
    case 'perpendicularLine':
      return c.perpendicularLineId
    case 'parallelLine':
      return c.parallelLineId
  }
}

// ─────────────────────────────────────────────
// 引用字段表（与快照字段一一对应）
// ─────────────────────────────────────────────

const pushRef = (out: string[], value: unknown) => {
  if (typeof value === 'string' && value) out.push(value)
}

const pushRefs = (out: string[], values: unknown) => {
  if (!Array.isArray(values)) return
  for (const v of values) pushRef(out, v)
}

const AXIS_TARGET_TYPES = new Set(['xAxis', 'yAxis', 'zAxis'])

/**
 * 实体快照 → 引用的 id 列表（正向边；按 DeltaEntityKey 分类扫描，勿凭记忆增删字段）。
 *
 * 除本文件的闭包计算外，录制器也用它推导「一次操作把哪些既有对象当作输入」
 * （见 AnimationRecorder.collectOperationInputIds），改字段时两处同步受益。
 */
export function extractEntityRefs(key: DeltaEntityKey, e: Record<string, unknown>): string[] {
  const out: string[] = []
  if (key === 'points') {
    // 归属（复合体 / 从属对象）+ 依附（constrainedTo，坐标轴无实体 id）
    pushRef(out, e.cubeId)
    pushRef(out, e.circleId)
    pushRef(out, e.regularPolygonId)
    pushRef(out, e.sphereId)
    pushRef(out, e.coneId)
    pushRef(out, e.cylinderId)
    pushRef(out, e.prismId)
    pushRef(out, e.pyramidId)
    const constrainedTo = e.constrainedTo as { type?: unknown; id?: unknown } | null | undefined
    if (constrainedTo && !AXIS_TARGET_TYPES.has(String(constrainedTo.type))) {
      pushRef(out, constrainedTo.id)
    }
  } else if (key === 'lines' || key === 'straightLines' || key === 'rays' || key === 'vectors') {
    pushRef(out, e.p1Id)
    pushRef(out, e.p2Id)
  } else if (key === 'circles') {
    pushRef(out, e.p1Id)
    pushRef(out, e.p2Id)
    pushRef(out, e.p3Id)
    pushRef(out, e.directionId) // 法向圆的方向来源实体（线 / 射线 / 向量）
  } else if (key === 'faces') {
    pushRefs(out, e.boundaryPointIds)
    pushRefs(out, e.memberPointIds)
    pushRefs(out, e.supportPointIds)
    pushRefs(out, e.boundaryLineIds) // faceOwned 边界线
    pushRefs(out, e.cubeOwnerPointIds)
    pushRefs(out, e.cubeDependentPointIds)
    pushRefs(out, e.regularPolygonOwnerPointIds)
    pushRefs(out, e.regularPolygonDependentPointIds)
    pushRefs(out, e.prismOwnerPointIds)
    pushRefs(out, e.prismDependentPointIds)
    pushRefs(out, e.pyramidOwnerPointIds)
    pushRefs(out, e.pyramidDependentPointIds)
    pushRef(out, e.cubeId)
    pushRef(out, e.regularPolygonId)
    pushRef(out, e.prismId)
    pushRef(out, e.pyramidId)
  } else if (key === 'spheres') {
    pushRef(out, e.centerPointId)
    pushRef(out, e.radiusPointId)
  } else if (key === 'cones') {
    pushRef(out, e.baseCenterPointId)
    pushRef(out, e.apexPointId)
    pushRef(out, e.normalCircleId)
  } else if (key === 'cylinders') {
    pushRef(out, e.bottomCenterPointId)
    pushRef(out, e.topCenterPointId)
    pushRef(out, e.normalCircleId)
    pushRef(out, e.topNormalCircleId)
  } else if (key === 'perpendicularLines' || key === 'parallelLines') {
    pushRef(out, e.p1Id) // p2 为展示位置数据（p2Position），非引用
    pushRef(out, e.targetId)
  } else if (key === 'nets') {
    pushRef(out, e.solidId)
    pushRef(out, e.baseFaceId)
    pushRefs(out, e.faceIds)
    const transforms = e.faceTransforms as
      | Record<string, { hingeEdgePointIds?: unknown; parentFaceId?: unknown }>
      | undefined
    if (transforms && typeof transforms === 'object') {
      for (const t of Object.values(transforms)) {
        pushRefs(out, t?.hingeEdgePointIds)
        pushRef(out, t?.parentFaceId)
      }
    }
  }
  return out
}

/**
 * 约束快照 → 关联 id 列表（主体 + 引用点 + 引用实体；任一命中即整体纳入）。
 * 录制器同样借它识别「本次操作新建的复合体把哪些既有对象当作输入」。
 */
export function extractConstraintRefs(c: ScopeConstraintSnapshot): string[] {
  const out: string[] = [getConstraintSubjectId(c)]
  if (c.type === 'cube') {
    pushRefs(out, c.ownerPointIds)
    pushRef(out, c.sourceLineId)
    pushRefs(out, c.faceIds)
    for (const layout of c.dependentLayouts) pushRef(out, layout.pointId)
  } else if (c.type === 'intersection') {
    pushRef(out, c.sourceA?.id)
    pushRef(out, c.sourceB?.id)
  } else if (c.type === 'regularPolygon') {
    pushRefs(out, c.ownerPointIds)
    pushRef(out, c.faceId)
    for (const layout of c.dependentLayouts) pushRef(out, layout.pointId)
  } else if (c.type === 'prism') {
    pushRefs(out, c.ownerPointIds)
    pushRef(out, c.bottomFaceId)
    pushRef(out, c.topFaceId)
    pushRefs(out, c.sideFaceIds)
    for (const layout of c.dependentLayouts) pushRef(out, layout.pointId)
  } else if (c.type === 'pyramid') {
    pushRefs(out, c.ownerPointIds)
    pushRef(out, c.bottomFaceId)
    pushRefs(out, c.sideFaceIds)
  } else if (c.type === 'planar') {
    // 主体 faceId 已含；依赖点经 face 实体的 memberPointIds 递归
  } else if (c.type === 'cylinder') {
    pushRef(out, c.bottomCircleId)
    pushRef(out, c.topCircleId)
  } else if (c.type === 'objectConstrainedPoint') {
    pushRef(out, c.targetId)
  } else if (c.type === 'perpendicularLine' || c.type === 'parallelLine') {
    pushRef(out, c.targetId)
  }
  return out
}

// ─────────────────────────────────────────────
// 闭包计算
// ─────────────────────────────────────────────

interface EntityEntry {
  key: DeltaEntityKey
  /** 该实体在 base 与各步 delta 中出现过的全部版本（引用字段取并集） */
  records: Array<Record<string, unknown>>
}

/**
 * 计算录制范围闭包。
 * 输入：录制段（baseSnapshot + steps）。输出：范围内 id 集合 + 接管约束主体集合。
 */
export function buildRecordingScope(session: RecordingSession): RecordingScope {
  // ─── 1) 实体版本索引 + 反向索引 + 约束集合 + 种子 ───
  const entityIndex = new Map<string, EntityEntry>()
  /** 被引用 id → 引用它的实体 id 集合（反向边；对"所有版本"建立） */
  const reverseIndex = new Map<string, Set<string>>()
  const seeds = new Set<string>()

  const indexEntityVersion = (key: DeltaEntityKey, item: UnknownEntity) => {
    const record = item as unknown as Record<string, unknown>
    let entry = entityIndex.get(item.id)
    if (!entry) {
      entry = { key, records: [] }
      entityIndex.set(item.id, entry)
    }
    entry.records.push(record)
    for (const ref of extractEntityRefs(key, record)) {
      let owners = reverseIndex.get(ref)
      if (!owners) {
        owners = new Set()
        reverseIndex.set(ref, owners)
      }
      owners.add(item.id)
    }
  }

  for (const key of DELTA_ENTITY_KEYS) {
    const arr = (session.baseSnapshot[key] ?? []) as unknown as UnknownEntity[]
    for (const item of arr) indexEntityVersion(key, item)
  }

  const constraintsByKey = new Map<string, ScopeConstraintSnapshot>()
  const collectConstraints = (list: unknown[] | null | undefined) => {
    if (!Array.isArray(list)) return
    for (const raw of list) {
      const c = raw as ScopeConstraintSnapshot
      const text = JSON.stringify(c)
      if (!constraintsByKey.has(text)) constraintsByKey.set(text, c)
    }
  }
  collectConstraints(session.baseSnapshot.constraints)

  for (const step of session.steps) {
    for (const id of step.focusElementIds ?? []) seeds.add(id)
    const changes = step.delta?.changes ?? {}
    for (const key of Object.keys(changes) as DeltaEntityKey[]) {
      const change = changes[key]
      if (!change) continue
      for (const item of change.upsert) {
        seeds.add(item.id)
        indexEntityVersion(key, item)
      }
      for (const id of change.removed) seeds.add(id)
    }
    collectConstraints(step.delta?.constraints)
  }

  // ─── 2) BFS：三类边展开至不动点 ───
  const ids = new Set<string>()
  const pending: string[] = []
  const addId = (id: string | null | undefined): boolean => {
    if (!id || ids.has(id)) return false
    ids.add(id)
    pending.push(id)
    return true
  }
  for (const seed of seeds) addId(seed)

  const expandedEntities = new Set<string>()
  const includedConstraints = new Set<string>()

  for (;;) {
    // ① 排空待处理 id：先反向（谁引用了我），再正向（我引用了谁）
    while (pending.length > 0) {
      const id = pending.shift()!
      for (const owner of reverseIndex.get(id) ?? []) addId(owner)
      const entry = entityIndex.get(id)
      if (entry && !expandedEntities.has(id)) {
        expandedEntities.add(id)
        for (const record of entry.records) {
          for (const ref of extractEntityRefs(entry.key, record)) addId(ref)
        }
      }
    }
    // ② 约束扫描：任一引用命中即整体纳入（含主体与全部引用）
    let constraintProgress = false
    for (const [text, constraint] of constraintsByKey) {
      if (includedConstraints.has(text)) continue
      const refs = extractConstraintRefs(constraint)
      if (refs.some((ref) => ids.has(ref))) {
        includedConstraints.add(text)
        for (const ref of refs) {
          if (addId(ref)) constraintProgress = true
        }
      }
    }
    if (!constraintProgress) break
  }

  // ─── 3) 接管主体集合：主体在范围内、且其约束在段中出现过 ───
  const subjectUniverse = new Set<string>()
  for (const constraint of constraintsByKey.values()) {
    const subject = getConstraintSubjectId(constraint)
    if (ids.has(subject)) subjectUniverse.add(subject)
  }

  return { ids, subjectUniverse }
}

// ─────────────────────────────────────────────
// 引用完整性校验（开发期工具，不入生产链路）
// ─────────────────────────────────────────────

/**
 * 检查快照内全部引用字段指向的 id 是否都存在于同一快照中。
 *
 * 白名单说明：复合体（正六面体 / 正多边形 / 棱柱 / 棱锥）没有独立数组条目，
 * 其 id 只出现在「归属字段」与「约束主体」上 —— 只要约束在快照中即视为存在。
 *
 * @returns 悬空引用描述列表；空数组 = 通过
 */
export function validateSnapshotReferences(snapshot: SceneSnapshot): string[] {
  const ids = new Set<string>()
  for (const key of DELTA_ENTITY_KEYS) {
    const arr = (snapshot[key] ?? []) as Array<{ id: string }>
    for (const item of arr) ids.add(item.id)
  }
  const complexIds = new Set<string>()
  for (const constraint of snapshot.constraints ?? []) {
    complexIds.add(getConstraintSubjectId(constraint))
  }

  const problems: string[] = []
  const check = (ref: string, from: string) => {
    if (!ids.has(ref) && !complexIds.has(ref)) problems.push(`${from} → 悬空引用 ${ref}`)
  }

  for (const key of DELTA_ENTITY_KEYS) {
    const arr = (snapshot[key] ?? []) as unknown as UnknownEntity[]
    for (const item of arr) {
      for (const ref of extractEntityRefs(key, item as unknown as Record<string, unknown>)) {
        check(ref, `${key}[${item.id}]`)
      }
    }
  }
  for (const constraint of snapshot.constraints ?? []) {
    const subject = getConstraintSubjectId(constraint)
    for (const ref of extractConstraintRefs(constraint)) {
      check(ref, `constraint(${subject})`)
    }
  }
  return problems
}
