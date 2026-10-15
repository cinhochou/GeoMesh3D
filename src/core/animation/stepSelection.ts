// src/core/animation/stepSelection.ts
// 「选中步」的共享工具：选中态采集、场景/快照中的对象解析、回放时把选中态落到影子场景。
//
// 背景：录制时把「有意义的选中」录成独立步骤（见 AnimationRecorder），回放时按步
// 把选中态落到影子场景（见 AnimationPlayer）。两处必须共用同一套「对象种类 ↔ 容器 ↔
// 高亮方式」的对应关系，否则会出现「录了但回放不高亮」这类静默失效。
//
// 说明：可高亮对象与 Selection 的各集合一一对应（13 类）；立方体/棱柱/棱锥/正多边形
// 这类复合体没有独立集合，其在选中态中的表示就是「它的全部面」（与编辑器
// selectCubeByFaceId 的表示一致），因此本模块只处理具体实体 id。

import type { Scene } from '../scene/Scene'
import type { Selection } from '../scene/Selection'

/** 可选中高亮的对象种类（与 Selection 集合、Scene 容器一一对应） */
export type SelectionKind =
  | 'point'
  | 'line'
  | 'straightLine'
  | 'perpendicularLine'
  | 'parallelLine'
  | 'ray'
  | 'vector'
  | 'circle'
  | 'face'
  | 'sphere'
  | 'cone'
  | 'cylinder'
  | 'net'

/**
 * 种类顺序：决定「多个对象同时被选中」时的展示顺序。
 * 与编辑器里点的引入优先级一致（先有点、再有线、面、体），
 * 保证「选中点 A、点 B」这类标签的先后与用户点击顺序接近。
 */
export const SELECTION_KIND_ORDER: readonly SelectionKind[] = [
  'point',
  'line',
  'straightLine',
  'perpendicularLine',
  'parallelLine',
  'ray',
  'vector',
  'circle',
  'face',
  'sphere',
  'cone',
  'cylinder',
  'net',
]

/** 种类 → 中文名（步标签用，与 FEATURE_TYPE_LABELS 口径保持一致） */
export const SELECTION_KIND_LABELS: Record<SelectionKind, string> = {
  point: '点',
  line: '线段',
  straightLine: '直线',
  perpendicularLine: '垂线',
  parallelLine: '平行线',
  ray: '射线',
  vector: '向量',
  circle: '圆',
  face: '多边形面',
  sphere: '两点球',
  cone: '圆锥',
  cylinder: '圆柱',
  net: '展开图',
}

/** 种类 → Selection 集合字段 / Scene 容器字段（同名，统一为复数） */
const KIND_COLLECTIONS: Record<SelectionKind, string> = {
  point: 'points',
  line: 'lines',
  straightLine: 'straightLines',
  perpendicularLine: 'perpendicularLines',
  parallelLine: 'parallelLines',
  ray: 'rays',
  vector: 'vectors',
  circle: 'circles',
  face: 'faces',
  sphere: 'spheres',
  cone: 'cones',
  cylinder: 'cylinders',
  net: 'nets',
}

/** 采集当前选中态的全部 id（按种类顺序；同种类内保持选中先后） */
export function collectSelectedIds(selection: Selection): string[] {
  const out: string[] = []
  const map = selection as unknown as Record<string, Set<string> | undefined>
  for (const kind of SELECTION_KIND_ORDER) {
    const set = map[KIND_COLLECTIONS[kind]]
    if (!set) continue
    for (const id of set) out.push(id)
  }
  return out
}

export interface SelectedEntityInfo {
  kind: SelectionKind
  name: string
}

/** 从运行中的场景解析 id 的种类与名称；不存在返回 null */
export function lookupSceneEntity(scene: Scene, id: string): SelectedEntityInfo | null {
  const map = scene as unknown as Record<
    string,
    Map<string, { name?: unknown }> | undefined
  >
  for (const kind of SELECTION_KIND_ORDER) {
    const item = map[KIND_COLLECTIONS[kind]]?.get(id)
    if (item) return { kind, name: typeof item.name === 'string' ? item.name : '' }
  }
  return null
}

/** 快照（SceneSubgraphSnapshot 与 SerializedScene 同构：各实体集数组键名一致） */
type SnapshotLike = Partial<Record<string, unknown>> & { constraints?: unknown[] }

/** 从快照解析 id 的种类与名称；不存在返回 null */
export function lookupSnapshotEntity(snapshot: unknown, id: string): SelectedEntityInfo | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const data = snapshot as SnapshotLike
  for (const kind of SELECTION_KIND_ORDER) {
    const arr = data[KIND_COLLECTIONS[kind]]
    if (!Array.isArray(arr)) continue
    for (const item of arr) {
      const entity = item as { id?: unknown; name?: unknown }
      if (entity?.id !== id) continue
      return { kind, name: typeof entity.name === 'string' ? entity.name : '' }
    }
  }
  return null
}

/** 约束快照中的主体 id（与 RecordingScope.getConstraintSubjectId 同口径的子集实现） */
function constraintSubjectId(c: Record<string, unknown>): string | null {
  const pick = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
  switch (c.type) {
    case 'cube':
      return pick(c.cubeId)
    case 'intersection':
      return pick(c.pointId)
    case 'regularPolygon':
      return pick(c.constraintId)
    case 'prism':
      return pick(c.prismId)
    case 'pyramid':
      return pick(c.pyramidId)
    case 'planar':
      return pick(c.faceId)
    case 'cylinder':
      return pick(c.cylinderId)
    case 'objectConstrainedPoint':
      return pick(c.pointId)
    case 'perpendicularLine':
      return pick(c.perpendicularLineId)
    case 'parallelLine':
      return pick(c.parallelLineId)
    default:
      return null
  }
}

/**
 * 从快照解析「复合体逻辑 id」（正六面体/棱柱/棱锥/正多边形）的名称。
 * 这类对象没有实体数组条目，名称挂在约束上（如 CubeConstraint.name）。
 */
export function lookupSolidName(snapshot: unknown, solidId: string): string | null {
  const constraints = (snapshot as SnapshotLike | null)?.constraints
  if (!Array.isArray(constraints)) return null
  for (const raw of constraints) {
    const c = raw as Record<string, unknown>
    if (constraintSubjectId(c) !== solidId) continue
    const name = c.name
    if (typeof name === 'string' && name.trim()) return name.trim()
  }
  return null
}

/**
 * 把「待高亮 id」展开为可落地的选中 id 列表。
 *
 *  - 具体实体（点/线/圆/面/球/锥/柱/展开图）→ 原样返回；
 *  - 复合体逻辑 id（正六面体等）→ 快照中归属于它的**全部面**
 *    （编辑器里选中复合体的表示就是「其全部面被选中」，见 selectCubeByFaceId）。
 */
export function resolveSelectionHighlightIds(snapshot: unknown, ids: readonly string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (lookupSnapshotEntity(snapshot, id)) {
      out.push(id)
      continue
    }
    const faces = expandSolidFaceIds(snapshot, id)
    if (faces.length > 0) out.push(...faces)
    else out.push(id) // 解析不出也不丢：回放时查不到会静默跳过
  }
  return [...new Set(out)]
}

/** 快照中归属给定复合体 id 的全部面 id（按 faces 数组中出现顺序） */
export function expandSolidFaceIds(snapshot: unknown, solidId: string): string[] {
  const faces = (snapshot as SnapshotLike | null)?.faces
  if (!Array.isArray(faces)) return []
  const out: string[] = []
  for (const raw of faces) {
    const f = raw as {
      id?: unknown
      cubeId?: unknown
      prismId?: unknown
      pyramidId?: unknown
      regularPolygonId?: unknown
    }
    if (typeof f.id !== 'string') continue
    if (
      f.cubeId === solidId ||
      f.prismId === solidId ||
      f.pyramidId === solidId ||
      f.regularPolygonId === solidId
    ) {
      out.push(f.id)
    }
  }
  return out
}

/**
 * 把「选中 id 列表」落到场景的选中态（回放用）。
 *
 * 语义为**本步状态**：先清空再逐个选中 —— 保证「选中 A → 选中 B → 创建圆锥」
 * 依次呈现 A、A+B 的高亮，而操作步不再残留上一处高亮。
 * 列表中不存在于本场景的 id 静默跳过（跨场景合并播放时可能缺少个别对象）。
 */
export function applySelectionIds(scene: Scene, ids: readonly string[]): void {
  scene.selection.clear()
  if (ids.length > 0) {
    for (const id of ids) {
      const info = lookupSceneEntity(scene, id)
      if (!info) continue
      switch (info.kind) {
        case 'point':
          scene.selection.selectPoint(id, true)
          break
        case 'line':
          scene.selection.selectLine(id, true)
          break
        case 'straightLine':
          scene.selection.selectStraightLine(id, true)
          break
        case 'perpendicularLine':
          scene.selection.selectPerpendicularLine(id, true)
          break
        case 'parallelLine':
          scene.selection.selectParallelLine(id, true)
          break
        case 'ray':
          scene.selection.selectRay(id, true)
          break
        case 'vector':
          scene.selection.selectVector(id, true)
          break
        case 'circle':
          scene.selection.selectCircle(id, true)
          break
        case 'face':
          scene.selection.selectFace(id, true)
          break
        case 'sphere':
          scene.selection.selectSphere(id, true)
          break
        case 'cone':
          scene.selection.selectCone(id, true)
          break
        case 'cylinder':
          scene.selection.selectCylinder(id, true)
          break
        case 'net':
          scene.selection.selectNet(id, true)
          break
      }
    }
  }
  // 选中态只影响渲染颜色/描边，必须标脏才会被同步器重新绘制
  scene.markAllRenderDirty()
}
