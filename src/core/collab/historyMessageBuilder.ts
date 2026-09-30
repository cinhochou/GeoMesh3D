// src/core/collab/historyMessageBuilder.ts
// 协作历史消息构建器：把一次操作的前后场景快照（before/after）差异
// 聚合为「几何对象级」的消息（而非元素级的一系列事务），并精确到对象：
// - 创建立方体只产生一条「创建了 正六面体X」，其构成点/面不再单独上报
// - 拖动立方体产生一条「移动了 正六面体X」，不会出现多条点的移动消息
// - 修改类消息对目标对象的所有可变属性标注「修改前 → 修改后」（箭头连接）

import type { SerializedScene } from '../editor/SceneSerializer'
import type { CollabHistoryMessage, CollabHistoryParam } from '@/types/collabHistory'
import type { CollabOperationIntent, CollabIntentParam } from '@/types/collabIntent'

type SVec = { x: number; y: number; z: number }

const EPS = 1e-6
const eqVec = (a: SVec | undefined, b: SVec | undefined) =>
  a !== undefined &&
  b !== undefined &&
  Math.abs(a.x - b.x) <= EPS &&
  Math.abs(a.y - b.y) <= EPS &&
  Math.abs(a.z - b.z) <= EPS
const dist = (a: SVec, b: SVec) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const fmt = (n: number) => n.toFixed(2)

function numParam(label: string, before: number, after: number): CollabHistoryParam | null {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  // 展示为两位小数时若无差异（含细微浮点抖动），不产生参数，避免「7.48→7.48」式噪声消息
  if (fmt(before) === fmt(after)) return null
  return { label, before: fmt(before), after: fmt(after) }
}

function nameParam(before: string, after: string): CollabHistoryParam | null {
  if (before === after) return null
  // 名称必填：空名称不是有效变更。旧数据/旧客户端可能残留空名称，
  // 此时不生成参数（否则会被渲染成「名称 A」，语义恰好相反）。
  if (!after || !after.trim()) return null
  return { label: '名称', before, after }
}

/** 布尔显示值：true→「开」，false→「关」 */
const on = (v: unknown) => (v ? '开' : '关')

/** 布尔属性差异（名称显示/数值显示/可见性/中心点显示/保持垂直等） */
function boolParam(label: string, before: unknown, after: unknown): CollabHistoryParam | null {
  if (before === after) return null
  return { label, before: on(before), after: on(after) }
}

/** 颜色值（number 0xRRGGBB / null）→ 展示文本，null 显示「无」 */
const colorText = (v: unknown): string => {
  const n = typeof v === 'number' ? v : null
  if (n === null) return '无'
  return `#${((n >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`
}

/** 颜色属性差异（连环） */
function colorParam(label: string, before: unknown, after: unknown): CollabHistoryParam | null {
  if (before === after) return null
  return { label, before: colorText(before), after: colorText(after) }
}

/** 数值属性差异（兼容 null↔number：锁定值从「无限制」变为具体值等） */
function nullNumParam(label: string, before: unknown, after: unknown): CollabHistoryParam | null {
  const b = typeof before === 'number' ? before : null
  const a = typeof after === 'number' ? after : null
  if (b === a) return null
  return { label, before: b === null ? '关' : fmt(b), after: a === null ? '关' : fmt(a) }
}

/** 标签位置差异（labelOffsetX / labelOffsetY 任一变化） */
function labelOffsetParam(bx: unknown, by: unknown, ax: unknown, ay: unknown): CollabHistoryParam | null {
  if (bx === ax && by === ay) return null
  return { label: '标签位置', before: `${String(bx)},${String(by)}`, after: `${String(ax)},${String(ay)}` }
}

/** 两点前后位移是否一致（用于判定整体平移：所有构成点同向同距移动 → 移动） */
const sameDisplacement = (
  bp1: SVec | undefined,
  ap1: SVec | undefined,
  bp2: SVec | undefined,
  ap2: SVec | undefined,
): boolean => {
  if (!bp1 || !ap1 || !bp2 || !ap2) return false
  return (
    Math.abs(ap1.x - bp1.x - (ap2.x - bp2.x)) <= EPS &&
    Math.abs(ap1.y - bp1.y - (ap2.y - bp2.y)) <= EPS &&
    Math.abs(ap1.z - bp1.z - (ap2.z - bp2.z)) <= EPS
  )
}

/** 两点决定的单位方向向量展示（三位小数保留） */
const unitDirText = (from: SVec | undefined, to: SVec | undefined): string | null => {
  if (!from || !to) return null
  let dx = to.x - from.x
  let dy = to.y - from.y
  let dz = to.z - from.z
  const len = Math.hypot(dx, dy, dz)
  if (len <= EPS) return null
  dx /= len
  dy /= len
  dz /= len
  return `(${dx.toFixed(2)},${dy.toFixed(2)},${dz.toFixed(2)})`
}

/** 方向向量属性差异（单位向量变化，如拖动射线/向量/直线的方向点） */
function dirParam(
  fromB: SVec | undefined,
  toB: SVec | undefined,
  fromA: SVec | undefined,
  toA: SVec | undefined,
): CollabHistoryParam | null {
  const b = unitDirText(fromB, toB)
  const a = unitDirText(fromA, toA)
  if (b === null || a === null || b === a) return null
  return { label: '方向向量', before: b, after: a }
}

/** 球体半径：有两半径点（两点球）时按实时距离计算，否则用 radiusValue（半径球） */
const sphereRadius = (s: SSphere, pos: Map<string, SVec>): number => {
  if (s.radiusPointId) {
    const c = pos.get(s.centerPointId)
    const r = pos.get(s.radiusPointId)
    if (c && r) return dist(c, r)
    return Number.NaN
  }
  return s.radiusValue
}

/**
 * 显示类属性差异（这些属性均被 Yjs 共享、且经 update 命令入历史）：
 * 名称显示 / 数值显示 / 可见性 / 标签位置（可选：中心点显示）。
 * 只 diff 快照上真实存在的字段，其余返回空。
 */
function uiDisplayParams(b: AnyObj, a: AnyObj, opts: { center?: boolean } = {}): CollabHistoryParam[] {
  const out: CollabHistoryParam[] = []
  const nb = boolParam('名称显示', b.nameVisible, a.nameVisible)
  if (nb) out.push(nb)
  const nv = boolParam('数值显示', b.valueVisible, a.valueVisible)
  if (nv) out.push(nv)
  const vis = boolParam('可见性', b.visible, a.visible)
  if (vis) out.push(vis)
  if ('labelOffsetX' in b || 'labelOffsetX' in a) {
    const lo = labelOffsetParam(b.labelOffsetX, b.labelOffsetY, a.labelOffsetX, a.labelOffsetY)
    if (lo) out.push(lo)
  }
  if (opts.center) {
    const cc = boolParam('中心点显示', b.centerVisible, a.centerVisible)
    if (cc) out.push(cc)
  }
  return out
}

const byId = <T extends { id: string }>(list: readonly T[] | undefined) => {
  const m = new Map<string, T>()
  for (const it of list ?? []) m.set(it.id, it)
  return m
}

/** 以 AnyObj（Record 形态）建立 id 索引 */
const byAnyId = (list: readonly AnyObj[] | undefined) => {
  const m = new Map<string, AnyObj>()
  for (const it of list ?? []) {
    if (typeof it.id === 'string') m.set(it.id, it)
  }
  return m
}

// ===== 快照内部结构（与 SceneSerializer 对齐，仅取本构建器所需字段） =====
type SPt = {
  id: string
  name: string
  position: SVec
  userLocked: boolean
  cubeId: string | null
  cubeRole?: 'owner' | 'dependent' | null
  prismId: string | null
  prismRole?: 'owner' | 'dependent' | null
  pyramidId: string | null
  pyramidRole?: 'owner' | 'dependent' | null
  regularPolygonId: string | null
  regularPolygonRole?: 'owner' | 'dependent' | null
  sphereId: string | null
  sphereRole?: 'center' | 'radius' | null
  coneId: string | null
  coneRole?: 'baseCenter' | 'apex' | null
  cylinderId: string | null
  cylinderRole?: 'bottomCenter' | 'topCenter' | null
  circleId: string | null
  circleRole?: 'center' | null
}
type SLine = { id: string; name: string; userLocked: boolean; lengthLocked: boolean; lockedLength: number; p1Id: string; p2Id: string }
type SLinear = { id: string; name: string; userLocked: boolean; p1Id: string; p2Id: string; displayLength?: number }
type SCircle = { id: string; name: string; userLocked: boolean; lockedRadius: number | null; centerVisible: boolean; p1Id: string; p2Id: string; p3Id: string; circleType: string }
type SSphere = { id: string; name: string; userLocked: boolean; centerPointId: string; radiusPointId: string | null; radiusValue: number }
type SCylinder = {
  id: string
  name: string
  userLocked: boolean
  bottomCenterPointId: string
  topCenterPointId: string
  radiusValue: number
  /** 底面/顶面法向圆（圆柱的构成圆）：随圆柱变化静默归并 */
  normalCircleId?: string | null
  topNormalCircleId?: string | null
}
type SCone = {
  id: string
  name: string
  userLocked: boolean
  baseCenterPointId: string
  apexPointId: string
  radiusValue: number
  /** 底面法向圆（圆锥的构成圆） */
  normalCircleId?: string | null
}
type SFace = {
  id: string
  name: string
  userLocked: boolean
  areaLocked: boolean
  lockedArea: number
  fillColor: number | null
  fillOpacity: number | null
  boundaryPointIds: string[]
  boundaryLineIds?: string[]
  isRegularPolygon: boolean
  cubeId: string | null
  prismId: string | null
  pyramidId: string | null
  regularPolygonId: string | null
}
type SPerp = { id: string; name: string; userLocked: boolean; p1Id: string; p2Position: SVec }
type SCube = { type: 'cube'; cubeId: string; solidType: 'hexahedron' | 'tetrahedron'; name: string; valueVisible: boolean; lockedEdgeLength: number | null; ownerPointIds: [string, string]; dependentLayouts: Array<{ pointId: string }>; faceIds: string[]; edgeLengthLocked: boolean }
type SRegular = { type: 'regularPolygon'; constraintId: string; name: string; valueVisible: boolean; lockedEdgeLength: number | null; ownerPointIds: [string, string]; dependentLayouts: Array<{ pointId: string }>; faceId: string; edgeLengthLocked: boolean }
type SPrism = { type: 'prism'; prismId: string; name: string; valueVisible: boolean; keepVertical: boolean; ownerPointIds: [string, string]; dependentLayouts: Array<{ pointId: string }>; bottomFaceId: string; topFaceId: string; sideFaceIds: string[] }
type SPyramid = { type: 'pyramid'; pyramidId: string; name: string; valueVisible: boolean; keepVertical: boolean; ownerPointIds: [string, string]; bottomFaceId: string; sideFaceIds: string[] }
type SNet = { id: string; name: string; color: number; visible: boolean; faceIds: string[]; unfoldRatio: number; position: SVec; mode: string }

/** 对象中文类型名 */
const KIND_LABEL: Record<string, string> = {
  net: '展开图',
  prism: '棱柱',
  pyramid: '棱锥',
  cube: '立方体',
  regularPolygon: '正多边形',
  cylinder: '圆柱',
  cone: '圆锥',
  sphere: '球体',
  circle: '圆',
  face: '面',
  perpendicularLine: '垂线',
  parallelLine: '平行线',
  straightLine: '直线',
  ray: '射线',
  vector: '向量',
  line: '线段',
  point: '点',
}

type AnyObj = Record<string, unknown> & { name?: unknown }

/**
 * objectConstrainedPoint 从属点 → 所属对象 id。
 * 立体（正六面体/棱柱/棱锥/正多边形/球/圆柱/圆锥/圆/线段等）变化时，约束在它上面的
 * 从属点会随动（如拖动正六面体顶点缩放立体，面上点跟着移动），该随动由所属对象的
 * 消息吸收，避免多出一条「移动了 点X」。面目标归并到其所属立体，独立面归其自身。
 */
function buildDependentPointParentMap(scene: SerializedScene): Map<string, string> {
  const faceOwner = new Map<string, string>()
  for (const c of scene.constraints) {
    const o = c as unknown as AnyObj
    if (o.type === 'cube') {
      for (const fid of (o.faceIds as string[]) ?? []) faceOwner.set(fid, o.cubeId as string)
    } else if (o.type === 'prism') {
      faceOwner.set(o.bottomFaceId as string, o.prismId as string)
      faceOwner.set(o.topFaceId as string, o.prismId as string)
      for (const fid of (o.sideFaceIds as string[]) ?? []) faceOwner.set(fid, o.prismId as string)
    } else if (o.type === 'pyramid') {
      faceOwner.set(o.bottomFaceId as string, o.pyramidId as string)
      for (const fid of (o.sideFaceIds as string[]) ?? []) faceOwner.set(fid, o.pyramidId as string)
    } else if (o.type === 'regularPolygon') {
      faceOwner.set(o.faceId as string, o.constraintId as string)
    }
  }
  const map = new Map<string, string>()
  for (const c of scene.constraints) {
    const o = c as unknown as AnyObj
    if (o.type !== 'objectConstrainedPoint') continue
    const { pointId, targetType, targetId } = o as unknown as {
      pointId: string
      targetType: string
      targetId: string
    }
    if (targetType === 'face') {
      map.set(pointId, faceOwner.get(targetId) ?? targetId)
    } else if (
      targetType === 'sphere' ||
      targetType === 'cone' ||
      targetType === 'coneBase' ||
      targetType === 'cylinder' ||
      targetType === 'cylinderBottom' ||
      targetType === 'cylinderTop' ||
      targetType === 'circle' ||
      targetType === 'line' ||
      targetType === 'straightLine' ||
      targetType === 'ray' ||
      targetType === 'vector' ||
      targetType === 'perpendicularLine' ||
      targetType === 'parallelLine'
    ) {
      map.set(pointId, targetId)
    }
    // 坐标轴（xAxis/yAxis/zAxis）永不移动，无所属对象
  }
  return map
}

/**
 * faceOwned 边界线段 → 所属几何对象 id 的静态归并映射：
 * - 立体/正多边形的面（cubeId/prismId/pyramidId/regularPolygonId）→ 所属立体/正多边形；
 * - 独立面的自动边界线段 → 面自身；
 * - 用户手动创建的线段（faceOwned=false，即使被面复用为边界）不映射，保持独立上报。
 * 归并不依赖运行时「构成点归属一致性」判定，共点/共边（一个点/一条线段被多个
 * 几何对象共享，如正多边形原始点同时是两点球半径点）时依然稳定归并到父对象。
 */
function buildFaceOwnedLineParentMap(scene: SerializedScene): Map<string, string> {
  const faceOwnedIds = new Set<string>()
  for (const l of scene.lines as unknown as Array<{ id: string; faceOwned?: boolean }>) {
    if (l.faceOwned) faceOwnedIds.add(l.id)
  }
  const map = new Map<string, string>()
  if (faceOwnedIds.size === 0) return map
  const faces = scene.faces as unknown as SFace[]
  for (const f of faces) {
    const parent = f.cubeId ?? f.prismId ?? f.pyramidId ?? f.regularPolygonId ?? f.id
    for (const lid of f.boundaryLineIds ?? []) {
      // 同一线段被多个面共享（共边）时归属首个声明它的父对象
      if (faceOwnedIds.has(lid) && !map.has(lid)) map.set(lid, parent)
    }
  }
  return map
}

/**
 * 法向圆 → 所属圆柱/圆锥的静态归并映射：
 * 圆柱的 normalCircleId / topNormalCircleId、圆锥的 normalCircleId 所指的法向圆
 * 是它们的底面/顶面构成圆（构造基准），属「立体的构成部分」而非独立派生对象——
 * 立体变化（如拖动顶面圆心改高度）时圆随之联动，应静默归并，不产生「级联移动 法向圆X」标注。
 * 未被任何立体引用的法向圆（用户独立创建的圆）不映射，保持独立上报。
 */
function buildNormalCircleParentMap(scene: SerializedScene): Map<string, string> {
  const map = new Map<string, string>()
  const put = (circleId: unknown, ownerId: string) => {
    if (typeof circleId === 'string' && circleId && !map.has(circleId)) map.set(circleId, ownerId)
  }
  for (const c of scene.cylinders as unknown as SCylinder[]) {
    put(c.normalCircleId, c.id)
    put(c.topNormalCircleId, c.id)
  }
  for (const c of scene.cones as unknown as SCone[]) {
    put(c.normalCircleId, c.id)
  }
  return map
}

/** 快照上的一类对象视图 */
type SnapshotView = {
  key: string
  listBefore: AnyObj[]
  listAfter: AnyObj[]
  getId: (o: AnyObj) => string
  getName: (o: AnyObj) => string
  /** 该对象在 after 中的构成点（用于归属/移动判定） */
  getRefPointIds: (o: AnyObj) => string[]
  /** 最大层级父对象字段（如 face.cubeId/p.cubeId）：由更高对象判定时吸收 */
  getParentId: (o: AnyObj) => string | null
  /** 计算 after 相对 before 的变化参数（所有可变属性） */
  getParams: (b: AnyObj, a: AnyObj, posBefore: Map<string, SVec>, posAfter: Map<string, SVec>) => CollabHistoryParam[]
  /** 锁状态变化 */
  getLock: (b: AnyObj, a: AnyObj) => Array<{ label: string; toLocked: boolean }>
  /** 具体种类（如 三点圆/法向圆、正六面体/正四面体、多边形/正多边形），缺省用 KIND_LABEL */
  getKindLabel?: (o: AnyObj) => string
  /** 是否必须展示种类（如圆/面），不受“名称已含种类词则省略”影响 */
  forceKind?: boolean
  /** 名称含该子串即省略种类（如球体名「半径球1」「两点球1」含「球」，不显示种类前缀） */
  omitKindWhenContains?: string
  /** 移动判定覆写：仅当几何对象「整体平移」才算移动（部分点移动属于属性修改，如球拖半径点=改半径） */
  getMoved?: (b: AnyObj, a: AnyObj, refsMoved: boolean, posBefore: Map<string, SVec>, posAfter: Map<string, SVec>) => boolean
}

/** 计算消息中的“种类”文本：名称已含种类词且非必须展示时省略，避免「球体 球体1」式重复 */
const resolveKindLabel = (view: SnapshotView, o: AnyObj, name: string): string | null => {
  const label = (view.getKindLabel ? view.getKindLabel(o) : KIND_LABEL[view.key]) ?? ''
  if (view.forceKind) return label || null
  // 名称已含种类词则省略（避免「球体 球体1」式重复）
  if ((name ?? '').startsWith(label)) return null
  // 对象名含声明的子串（如球体的「半径球1」「两点球1」）同样省略种类前缀
  if (view.omitKindWhenContains && (name ?? '').includes(view.omitKindWhenContains)) return null
  return label || null
}

// ===== 引用/几何工具 =====

function pointPositions(scene: SerializedScene): Map<string, SVec> {
  const m = new Map<string, SVec>()
  for (const p of scene.points) m.set(p.id, p.position)
  return m
}

function faceBoundary(scene: SerializedScene, faceIds: string[]): string[] {
  const faces = byId<SFace>(scene.faces as unknown as SFace[])
  const ids: string[] = []
  for (const fid of faceIds) {
    const f = faces.get(fid)
    if (f) ids.push(...f.boundaryPointIds)
  }
  return ids
}

function faceUserLockChange(before: SerializedScene, after: SerializedScene, faceIds: string[]): Array<{ label: string; toLocked: boolean }> {
  const b = byId<SFace>(before.faces as unknown as SFace[])
  const a = byId<SFace>(after.faces as unknown as SFace[])
  for (const fid of faceIds) {
    const beforeFace = b.get(fid)
    const afterFace = a.get(fid)
    if (!beforeFace || !afterFace) continue
    if (beforeFace.userLocked !== afterFace.userLocked) {
      return [{ label: '几何', toLocked: afterFace.userLocked }]
    }
  }
  return []
}

function userLockChoice(before: boolean, after: boolean, label: string): Array<{ label: string; toLocked: boolean }> {
  return before === after ? [] : [{ label, toLocked: after }]
}

/** 三点外接圆半径（三角形面积法） */
function circumRadius(c: SCircle, pos: Map<string, SVec>): number {
  const p1 = pos.get(c.p1Id)
  const p2 = pos.get(c.p2Id)
  const p3 = pos.get(c.p3Id)
  if (!p1 || !p2 || !p3) return Number.NaN
  const a = dist(p2, p3)
  const b = dist(p1, p3)
  const c2 = dist(p1, p2)
  const ab = { x: p2.x - p1.x, y: p2.y - p1.y, z: p2.z - p1.z }
  const ac = { x: p3.x - p1.x, y: p3.y - p1.y, z: p3.z - p1.z }
  const crossX = ab.y * ac.z - ab.z * ac.y
  const crossY = ab.z * ac.x - ab.x * ac.z
  const crossZ = ab.x * ac.y - ab.y * ac.x
  const area = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ) / 2
  if (area <= EPS) return Number.NaN
  return (a * b * c2) / (4 * area)
}

// ===== 构建「几何对象视图」列表（views 顺序即判定优先级） =====

function buildViews(
  before: SerializedScene,
  after: SerializedScene,
  dependentParent: Map<string, string>,
): SnapshotView[] {
  // faceOwned 边界线段的静态父归并：after 为主（当前归属），before 兜底（本条目中被删除的线段）
  const faceOwnedLineParentAfter = buildFaceOwnedLineParentMap(after)
  const faceOwnedLineParentBefore = buildFaceOwnedLineParentMap(before)
  // 法向圆（圆柱/圆锥的底面/顶面构成圆）的静态父归并：随立体变化静默吸收
  const normalCircleParentAfter = buildNormalCircleParentMap(after)
  const normalCircleParentBefore = buildNormalCircleParentMap(before)
  const cubeFrom = (list: unknown[]): AnyObj[] =>
    (list as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'cube')
      .map((c) => ({ ...c, id: c.cubeId }))
  const regularFrom = (list: unknown[]): AnyObj[] =>
    (list as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'regularPolygon')
      .map((c) => ({ ...c, id: c.constraintId }))
  const prismFrom = (list: unknown[]): AnyObj[] =>
    (list as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'prism')
      .map((c) => ({ ...c, id: c.prismId }))
  const pyramidFrom = (list: unknown[]): AnyObj[] =>
    (list as Array<Record<string, unknown>>)
      .filter((c) => c.type === 'pyramid')
      .map((c) => ({ ...c, id: c.pyramidId }))

  const views: SnapshotView[] = []

  views.push({
    key: 'net',
    listBefore: (before.nets as unknown as SNet[]).map((n) => ({ ...n, id: n.id })),
    listAfter: (after.nets as unknown as SNet[]).map((n) => ({ ...n, id: n.id })),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => faceBoundary(after, o.faceIds as string[]),
    getParentId: () => null,
    getParams: (b, a) => {
      const beforeNet = b as unknown as SNet
      const afterNet = a as unknown as SNet
      const params: CollabHistoryParam[] = []
      const color = colorParam('颜色', beforeNet.color, afterNet.color)
      if (color) params.push(color)
      const visible = boolParam('可见性', beforeNet.visible, afterNet.visible)
      if (visible) params.push(visible)
      const ratio = numParam('展开比例', beforeNet.unfoldRatio, afterNet.unfoldRatio)
      if (ratio) params.push(ratio)
      if (beforeNet.mode !== afterNet.mode) params.push({ label: '模式', before: beforeNet.mode, after: afterNet.mode })
      return params
    },
    getLock: () => [],
    // 附着展开图随主体（多面体）移动，不单独产生“移动”消息；仅自由展开图可报“移动”
    getMoved: (b, a, refsMoved) => {
      const beforeNet = b as unknown as SNet
      const afterNet = a as unknown as SNet
      if (afterNet.mode === 'attached') return false
      return refsMoved || !eqVec(beforeNet.position, afterNet.position)
    },
  })

  views.push({
    key: 'prism',
    listBefore: prismFrom(before.constraints),
    listAfter: prismFrom(after.constraints),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const p = o as unknown as SPrism
      const ids = [...p.ownerPointIds, ...p.dependentLayouts.map((d) => d.pointId)]
      ids.push(...faceBoundary(after, [p.bottomFaceId, p.topFaceId, ...p.sideFaceIds]))
      return ids
    },
    getParentId: () => null,
    getParams: (b, a) => {
      const beforeP = b as unknown as SPrism
      const afterP = a as unknown as SPrism
      const params: CollabHistoryParam[] = []
      const nv = boolParam('数值显示', beforeP.valueVisible, afterP.valueVisible)
      if (nv) params.push(nv)
      const kv = boolParam('保持垂直', beforeP.keepVertical, afterP.keepVertical)
      if (kv) params.push(kv)
      return params
    },
    getLock: (_b, a) => {
      const p = a as unknown as SPrism
      return faceUserLockChange(before, after, [p.bottomFaceId, p.topFaceId, ...p.sideFaceIds])
    },
  })

  views.push({
    key: 'pyramid',
    listBefore: pyramidFrom(before.constraints),
    listAfter: pyramidFrom(after.constraints),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const p = o as unknown as SPyramid
      const ids = [...p.ownerPointIds]
      ids.push(...faceBoundary(after, [p.bottomFaceId, ...p.sideFaceIds]))
      return ids
    },
    getParentId: () => null,
    getParams: (b, a) => {
      const beforeP = b as unknown as SPyramid
      const afterP = a as unknown as SPyramid
      const params: CollabHistoryParam[] = []
      const nv = boolParam('数值显示', beforeP.valueVisible, afterP.valueVisible)
      if (nv) params.push(nv)
      const kv = boolParam('保持垂直', beforeP.keepVertical, afterP.keepVertical)
      if (kv) params.push(kv)
      return params
    },
    getLock: (_b, a) => {
      const p = a as unknown as SPyramid
      return faceUserLockChange(before, after, [p.bottomFaceId, ...p.sideFaceIds])
    },
  })

  views.push({
    key: 'cube',
    listBefore: cubeFrom(before.constraints),
    listAfter: cubeFrom(after.constraints),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const c = o as unknown as SCube
      const ids = [...c.ownerPointIds, ...c.dependentLayouts.map((d) => d.pointId)]
      ids.push(...faceBoundary(after, c.faceIds))
      return ids
    },
    getParentId: () => null,
    getParams: (b, a, pb, pa) => {
      const beforeCube = b as unknown as SCube
      const afterCube = a as unknown as SCube
      const params: CollabHistoryParam[] = []
      const nv = boolParam('数值显示', beforeCube.valueVisible, afterCube.valueVisible)
      if (nv) params.push(nv)
      const le = nullNumParam('边长限制', beforeCube.lockedEdgeLength, afterCube.lockedEdgeLength)
      if (le) params.push(le)
      const p1 = pa.get(afterCube.ownerPointIds[0])
      const p2 = pa.get(afterCube.ownerPointIds[1])
      const p3 = pb.get(beforeCube.ownerPointIds[0])
      const p4 = pb.get(beforeCube.ownerPointIds[1])
      if (p1 && p2 && p3 && p4) {
        const edge = numParam('边长', dist(p3, p4), dist(p1, p2))
        if (edge) params.push(edge)
      }
      return params
    },
    getLock: (b, a) => {
      const beforeCube = b as unknown as SCube
      const afterCube = a as unknown as SCube
      return userLockChoice(beforeCube.edgeLengthLocked, afterCube.edgeLengthLocked, '边长')
    },
    // 具体种类：正六面体 / 正四面体（名称如“正六面体1”已含种类词，展示时自动省略）
    getKindLabel: (o) => ((o as unknown as SCube).solidType === 'tetrahedron' ? '正四面体' : '正六面体'),
  })

  views.push({
    key: 'regularPolygon',
    listBefore: regularFrom(before.constraints),
    listAfter: regularFrom(after.constraints),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const r = o as unknown as SRegular
      const ids = [...r.ownerPointIds, ...r.dependentLayouts.map((d) => d.pointId)]
      ids.push(...faceBoundary(after, [r.faceId]))
      return ids
    },
    getParentId: () => null,
    getParams: (b, a, pb, pa) => {
      const beforeR = b as unknown as SRegular
      const afterR = a as unknown as SRegular
      const params: CollabHistoryParam[] = []
      params.push(...uiDisplayParams(b, a))
      const le = nullNumParam('边长限制', beforeR.lockedEdgeLength, afterR.lockedEdgeLength)
      if (le) params.push(le)
      const p1 = pa.get(afterR.ownerPointIds[0])
      const p2 = pa.get(afterR.ownerPointIds[1])
      const p3 = pb.get(beforeR.ownerPointIds[0])
      const p4 = pb.get(beforeR.ownerPointIds[1])
      if (p1 && p2 && p3 && p4) {
        const edge = numParam('边长', dist(p3, p4), dist(p1, p2))
        if (edge) params.push(edge)
      }
      return params
    },
    getLock: (b, a) => {
      const beforeR = b as unknown as SRegular
      const afterR = a as unknown as SRegular
      return userLockChoice(beforeR.edgeLengthLocked, afterR.edgeLengthLocked, '边长')
    },
  })

  const columnSolidView = (key: 'cylinder' | 'cone') => {
    const list = key === 'cylinder' ? (before.cylinders as unknown as SCylinder[]) : (before.cones as unknown as SCone[])
    const listAfterArr = key === 'cylinder' ? (after.cylinders as unknown as SCylinder[]) : (after.cones as unknown as SCone[])
    /** 轴心点 id：圆柱为 bottomCenter/topCenter，圆锥为 baseCenter/apex——
     *  两者快照字段名不同，必须按类型读取（曾误用圆柱字段导致圆锥构成点恒为 undefined：
     *  圆锥在任意操作中都被判为「移动」，且高度变化无法记录） */
    const axisPointIds = (o: AnyObj): string[] =>
      key === 'cylinder'
        ? [(o as unknown as SCylinder).bottomCenterPointId, (o as unknown as SCylinder).topCenterPointId]
        : [(o as unknown as SCone).baseCenterPointId, (o as unknown as SCone).apexPointId]
    return {
      key,
      listBefore: list.map((c) => ({ ...c, id: c.id })),
      listAfter: listAfterArr.map((c) => ({ ...c, id: c.id })),
      getId: (o: AnyObj) => o.id as string,
      getName: (o: AnyObj) => o.name as string,
      getRefPointIds: (o: AnyObj) => axisPointIds(o).filter((id) => typeof id === 'string' && id !== ''),
      getParentId: () => null,
      getParams: (b: AnyObj, a: AnyObj, pb: Map<string, SVec>, pa: Map<string, SVec>) => {
        const beforeC = b as unknown as SCylinder
        const afterC = a as unknown as SCylinder
        const params: CollabHistoryParam[] = []
        params.push(...uiDisplayParams(b, a))
        const radius = numParam('半径', beforeC.radiusValue, afterC.radiusValue)
        if (radius) params.push(radius)
        const [bLowId, bHighId] = axisPointIds(b)
        const [aLowId, aHighId] = axisPointIds(a)
        const b1 = bLowId ? pb.get(bLowId) : undefined
        const b2 = bHighId ? pb.get(bHighId) : undefined
        const a1 = aLowId ? pa.get(aLowId) : undefined
        const a2 = aHighId ? pa.get(aHighId) : undefined
        if (b1 && b2 && a1 && a2) {
          const height = numParam('高度', dist(b1, b2), dist(a1, a2))
          if (height) params.push(height)
        }
        return params
      },
      getLock: (b: AnyObj, a: AnyObj) => userLockChoice(b.userLocked as boolean, a.userLocked as boolean, '几何'),
    }
  }

  views.push(columnSolidView('cylinder') as SnapshotView)
  views.push(columnSolidView('cone') as SnapshotView)

  views.push({
    key: 'sphere',
    listBefore: (before.spheres as unknown as SSphere[]).map((s) => ({ ...s, id: s.id })),
    listAfter: (after.spheres as unknown as SSphere[]).map((s) => ({ ...s, id: s.id })),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const s = o as unknown as SSphere
      return s.radiusPointId ? [s.centerPointId, s.radiusPointId] : [s.centerPointId]
    },
    getParentId: () => null,
    getParams: (b, a, pb, pa) => {
      const beforeS = b as unknown as SSphere
      const afterS = a as unknown as SSphere
      const params: CollabHistoryParam[] = []
      params.push(...uiDisplayParams(b, a))
      const radius = numParam('半径', sphereRadius(beforeS, pb), sphereRadius(afterS, pa))
      if (radius) params.push(radius)
      return params
    },
    getLock: (b, a) => userLockChoice(b.userLocked as boolean, a.userLocked as boolean, '几何'),
    // 两点球拖动半径点 ⇒ 半径变化（[修改]）；仅当球心与半径点整体平移才报[移动]
    getMoved: (_b, _a, refsMoved, pb, pa) => {
      if (!refsMoved) return false
      const beforeS = _b as unknown as SSphere
      const afterS = _a as unknown as SSphere
      if (!beforeS.radiusPointId) return true // 半径球（无半径点）：移动即整体移动
      return sameDisplacement(
        pb.get(beforeS.centerPointId),
        pa.get(afterS.centerPointId),
        pb.get(beforeS.radiusPointId ?? ''),
        pa.get(afterS.radiusPointId ?? ''),
      )
    },
    // 球体名「半径球1」「两点球1」已含「球」，不再加「球体」种类前缀，只显示名称
    omitKindWhenContains: '球',
  })

  views.push({
    key: 'circle',
    listBefore: (before.circles as unknown as SCircle[]).map((c) => ({ ...c, id: c.id })),
    listAfter: (after.circles as unknown as SCircle[]).map((c) => ({ ...c, id: c.id })),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const c = o as unknown as SCircle
      // 过滤空/无效引用（防御）：避免 undefined 让「构成点位移」判定恒为真而产生虚假消息
      return [c.p1Id, c.p2Id, c.p3Id].filter((id) => typeof id === 'string' && id !== '')
    },
    // 圆柱/圆锥的底面(顶面)法向圆归并到该立体：属其构成圆而非独立派生对象，
    // 立体变化时静默吸收（不产生「级联移动 法向圆X」）；用户独立创建的圆保持独立上报
    getParentId: (o) => {
      const id = o.id as string
      return normalCircleParentAfter.get(id) ?? normalCircleParentBefore.get(id) ?? null
    },
    getParams: (b, a, pb, pa) => {
      const beforeC = b as unknown as SCircle
      const afterC = a as unknown as SCircle
      const params: CollabHistoryParam[] = []
      params.push(...uiDisplayParams(b, a, { center: true }))
      if (beforeC.circleType === 'normal' && afterC.circleType === 'normal') {
        const radius = numParam('半径', beforeC.lockedRadius ?? 0, afterC.lockedRadius ?? 0)
        if (radius) params.push(radius)
      } else if (beforeC.circleType === 'threePoint' && afterC.circleType === 'threePoint') {
        const radius = numParam('半径', circumRadius(beforeC, pb), circumRadius(afterC, pa))
        if (radius) params.push(radius)
      }
      return params
    },
    getLock: (b, a) => userLockChoice(b.userLocked as boolean, a.userLocked as boolean, '几何'),
    // 具体种类：三点圆 / 法向圆（名称如“圆A”不含种类词，必须展示）
    getKindLabel: (o) => ((o as unknown as SCircle).circleType === 'normal' ? '法向圆' : '三点圆'),
    forceKind: true,
  })

  views.push({
    key: 'face',
    listBefore: (before.faces as unknown as SFace[]).map((f) => ({ ...f, id: f.id })),
    listAfter: (after.faces as unknown as SFace[]).map((f) => ({ ...f, id: f.id })),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => [...((o as unknown as SFace).boundaryPointIds)],
    getParentId: (o) => {
      const f = o as unknown as SFace
      return f.cubeId ?? f.prismId ?? f.pyramidId ?? f.regularPolygonId
    },
    getParams: (b, a) => {
      const beforeF = b as unknown as SFace
      const afterF = a as unknown as SFace
      const params: CollabHistoryParam[] = []
      params.push(...uiDisplayParams(b, a))
      const area = nullNumParam('面积限制', beforeF.lockedArea, afterF.lockedArea)
      if (area) params.push(area)
      const fill = colorParam('颜色', beforeF.fillColor, afterF.fillColor)
      if (fill) params.push(fill)
      const opacity = numParam('不透明度', beforeF.fillOpacity ?? 0, afterF.fillOpacity ?? 0)
      if (opacity) params.push(opacity)
      return params
    },
    getLock: (b, a) => {
      const beforeF = b as unknown as SFace
      const afterF = a as unknown as SFace
      const locks: Array<{ label: string; toLocked: boolean }> = []
      locks.push(...userLockChoice(beforeF.userLocked, afterF.userLocked, '几何'))
      if (beforeF.areaLocked !== afterF.areaLocked) locks.push({ label: '面积', toLocked: afterF.areaLocked })
      return locks
    },
    // 具体种类：正多边形 / 多边形（展开图为其自身对象种类，另行上报）。
    // 不用 forceKind：普通多边形的面名是裸符号（F1）需要补种类词，
    // 而正多边形的面名与约束名一致（「正多边形1」）已含种类词，由 resolveKindLabel 自动省略前缀。
    getKindLabel: (o) => ((o as unknown as SFace).isRegularPolygon ? '正多边形' : '多边形'),
  })

  const linearPairView = (key: 'perpendicularLine' | 'parallelLine') => {
    const list = key === 'perpendicularLine' ? (before.perpendicularLines as unknown as SPerp[]) : (before.parallelLines as unknown as SPerp[])
    const listAfterArr = key === 'perpendicularLine' ? (after.perpendicularLines as unknown as SPerp[]) : (after.parallelLines as unknown as SPerp[])
    return {
      key,
      listBefore: list.map((l) => ({ ...l, id: l.id })),
      listAfter: listAfterArr.map((l) => ({ ...l, id: l.id })),
      getId: (o: AnyObj) => o.id as string,
      getName: (o: AnyObj) => o.name as string,
      getRefPointIds: (o: AnyObj) => [(o as unknown as SPerp).p1Id],
      getParentId: () => null,
      getParams: (b: AnyObj, a: AnyObj) => {
        const params: CollabHistoryParam[] = []
        params.push(...uiDisplayParams(b, a))
        return params
      },
      getLock: (b: AnyObj, a: AnyObj) => userLockChoice(b.userLocked as boolean, a.userLocked as boolean, '几何'),
    }
  }

  views.push(linearPairView('perpendicularLine') as SnapshotView)
  views.push(linearPairView('parallelLine') as SnapshotView)

  const linearView = (key: 'straightLine' | 'ray' | 'vector') => {
    const list =
      key === 'straightLine' ? (before.straightLines as unknown as SLinear[]) : key === 'ray' ? (before.rays as unknown as SLinear[]) : (before.vectors as unknown as SLinear[])
    const listAfterArr =
      key === 'straightLine' ? (after.straightLines as unknown as SLinear[]) : key === 'ray' ? (after.rays as unknown as SLinear[]) : (after.vectors as unknown as SLinear[])
    return {
      key,
      listBefore: list.map((l) => ({ ...l, id: l.id })),
      listAfter: listAfterArr.map((l) => ({ ...l, id: l.id })),
      getId: (o: AnyObj) => o.id as string,
      getName: (o: AnyObj) => o.name as string,
      getRefPointIds: (o: AnyObj) => {
        const l = o as unknown as SLinear
        return [l.p1Id, l.p2Id]
      },
      getParentId: () => null,
      getParams: (b: AnyObj, a: AnyObj, pb: Map<string, SVec>, pa: Map<string, SVec>) => {
        const beforeL = b as unknown as SLinear
        const afterL = a as unknown as SLinear
        const params: CollabHistoryParam[] = []
        params.push(...uiDisplayParams(b, a))
        const b1 = pb.get(beforeL.p1Id)
        const b2 = pb.get(beforeL.p2Id)
        const a1 = pa.get(afterL.p1Id)
        const a2 = pa.get(afterL.p2Id)
        if (key === 'vector') {
          // 向量：长度 = 起点→方向点距离
          if (b1 && b2 && a1 && a2) {
            const len = numParam('长度', dist(b1, b2), dist(a1, a2))
            if (len) params.push(len)
          }
        } else {
          // 直线/射线：sidebar 可调的「显示长度」
          const dl = numParam('显示长度', beforeL.displayLength as number, afterL.displayLength as number)
          if (dl) params.push(dl)
        }
        // 方向向量：方向点相对起点的单位向量变化
        const dir = dirParam(b1, b2, a1, a2)
        if (dir) params.push(dir)
        return params
      },
      getLock: (b: AnyObj, a: AnyObj) => userLockChoice(b.userLocked as boolean, a.userLocked as boolean, '几何'),
      // 整体平移（起点与方向点同向同距）才报[移动]；改长度/方向为[修改]
      getMoved: (_b: AnyObj, _a: AnyObj, refsMoved: boolean, pb: Map<string, SVec>, pa: Map<string, SVec>) => {
        if (!refsMoved) return false
        const beforeL = _b as unknown as SLinear
        const afterL = _a as unknown as SLinear
        return sameDisplacement(
          pb.get(beforeL.p1Id),
          pa.get(afterL.p1Id),
          pb.get(beforeL.p2Id),
          pa.get(afterL.p2Id),
        )
      },
    }
  }

  views.push(linearView('straightLine') as SnapshotView)
  views.push(linearView('ray') as SnapshotView)
  views.push(linearView('vector') as SnapshotView)

  views.push({
    key: 'line',
    listBefore: (before.lines as unknown as SLine[]).map((l) => ({ ...l, id: l.id })),
    listAfter: (after.lines as unknown as SLine[]).map((l) => ({ ...l, id: l.id })),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => {
      const l = o as unknown as SLine
      return [l.p1Id, l.p2Id]
    },
    // faceOwned 边界线段归并到父对象（立体/正多边形/所属面）：
    // 父对象已判定（生成消息/被吸收）时线段随动被吸收，不再单独上报，
    // 也不进入「级联标注」——边界线段是父对象的构成部分而非派生物
    getParentId: (o) => {
      const id = o.id as string
      return faceOwnedLineParentAfter.get(id) ?? faceOwnedLineParentBefore.get(id) ?? null
    },
    getParams: (b, a, pb, pa) => {
      const beforeL = b as unknown as SLine
      const afterL = a as unknown as SLine
      const params: CollabHistoryParam[] = []
      params.push(...uiDisplayParams(b, a))
      const locked = nullNumParam('长度限制', beforeL.lockedLength, afterL.lockedLength)
      if (locked) params.push(locked)
      const b1 = pb.get(beforeL.p1Id)
      const b2 = pb.get(beforeL.p2Id)
      const a1 = pa.get(afterL.p1Id)
      const a2 = pa.get(afterL.p2Id)
      if (b1 && b2 && a1 && a2) {
        const len = numParam('长度', dist(b1, b2), dist(a1, a2))
        if (len) params.push(len)
      }
      return params
    },
    getLock: (b, a) => {
      const beforeL = b as unknown as SLine
      const afterL = a as unknown as SLine
      const locks: Array<{ label: string; toLocked: boolean }> = []
      locks.push(...userLockChoice(beforeL.userLocked, afterL.userLocked, '几何'))
      if (beforeL.lengthLocked !== afterL.lengthLocked) locks.push({ label: '长度', toLocked: afterL.lengthLocked })
      return locks
    },
  })

  views.push({
    key: 'point',
    listBefore: (before.points as unknown as SPt[]).map((p) => ({ ...p, id: p.id })),
    listAfter: (after.points as unknown as SPt[]).map((p) => ({ ...p, id: p.id })),
    getId: (o) => o.id as string,
    getName: (o) => o.name as string,
    getRefPointIds: (o) => [o.id as string],
    getParentId: (o) => {
      const p = o as unknown as SPt
      return (
        p.cubeId ??
        p.prismId ??
        p.pyramidId ??
        p.regularPolygonId ??
        p.sphereId ??
        p.coneId ??
        p.cylinderId ??
        p.circleId ??
        dependentParent.get(p.id) ??
        null
      )
    },
    getParams: (b, a) => {
      const beforeP = b as unknown as SPt
      const afterP = a as unknown as SPt
      const params: CollabHistoryParam[] = []
      const name = nameParam(beforeP.name, afterP.name)
      if (name) params.push(name)
      params.push(...uiDisplayParams(b, a))
      return params
    },
    getLock: (b, a) => userLockChoice(b.userLocked as boolean, a.userLocked as boolean, '几何'),
  })

  return views
}

// ===== 生成消息 =====

type Actor = { clientId: number; userName: string | null; createdAt: number }

function makeMessage(
  category: CollabHistoryMessage['category'],
  action: string,
  actor: Actor,
  targetType: string | null,
  targetName: string | null,
  params: CollabHistoryParam[],
  quote: string | null,
  createdFrom?: string | null,
): CollabHistoryMessage {
  return {
    id: crypto.randomUUID(),
    clientId: actor.clientId,
    userName: actor.userName,
    category,
    action,
    targetType,
    targetName,
    params,
    quote,
    createdAt: actor.createdAt,
    ...(createdFrom ? { createdFrom } : {}),
  }
}

/** 意图参数（可缺省 before/after）→ 历史消息参数（必填字符串） */
const toHistoryParams = (params: CollabIntentParam[]): CollabHistoryParam[] =>
  params.map((p) => ({ label: p.label, before: p.before ?? '', after: p.after ?? '' }))


/**
 * 把新创建对象的引用点 id 反解析为「由哪些几何对象创建」的来源清单（去重）。
 * 规则：每个引用点优先解析为其所属的非点几何对象（线段/直线/圆/面/立体等）；
 * 无所属几何对象（独立点）时解析为点本身。返回「类型+名称」文本数组，无可识别来源返回空数组。
 */
function resolveCreateSources(
  views: SnapshotView[],
  pointNames: Map<string, string>,
  createdView: SnapshotView,
  createdObj: AnyObj,
): string[] {
  const createdId = createdView.getId(createdObj)
  const createdRefs = createdView.getRefPointIds(createdObj).filter((rid) => !!rid && rid !== createdId)
  if (createdRefs.length === 0) return []
  const refSet = new Set(createdRefs)

  // 引用点 id → 首个接管它的非点几何对象 id，及该对象「类型+名称」文本（首命中的高优先级对象优先）
  const pointOwner = new Map<string, string>()
  const ownerLabel = new Map<string, string>()
  for (const v of views) {
    if (v.key === 'point') continue
    for (const o of v.listBefore) {
      const oid = v.getId(o)
      if (oid === 'origin' || oid === createdId) continue
      const refs = v.getRefPointIds(o)
      let hit = false
      for (const rid of refs) {
        if (refSet.has(rid) && !pointOwner.has(rid)) {
          pointOwner.set(rid, oid)
          hit = true
        }
      }
      if (hit && !ownerLabel.has(oid)) {
        ownerLabel.set(oid, [resolveKindLabel(v, o, v.getName(o)), v.getName(o)].filter(Boolean).join(''))
      }
    }
  }

  const sources: string[] = []
  const add = (text: string) => {
    if (text && !sources.includes(text)) sources.push(text)
  }
  for (const rid of createdRefs) {
    const ownerId = pointOwner.get(rid)
    if (ownerId && ownerLabel.get(ownerId)) {
      add(ownerLabel.get(ownerId)!)
    } else {
      const name = pointNames.get(rid)
      if (name) add(name.startsWith('点') ? name : `点${name}`)
    }
  }
  return sources
}

export interface HistoryEntryLike {
  actorClientId: number
  actorName: string | null
  createdAt: number
  label: string
  before: SerializedScene
  after: SerializedScene
  /** 交互层明确记录的实际被拖动的点 id（拖动立方体顶点缩放整面等场景，可精确到点） */
  draggedPointId?: string | null
  /** 合并点操作保留点的 id（可精确定位「合并了点 X」的目标） */
  keepPointId?: string | null
  /** 删除操作真实被删目标 id（可精确定位「删除了 X」，快照无法反推） */
  deleteTargetId?: string | null
  /** 操作级意图（命令声明：主语/属性/标注零反推，消息生成优先采用） */
  intent?: CollabOperationIntent | null
}

const toActor = (entry: HistoryEntryLike): Actor => ({
  clientId: entry.actorClientId,
  userName: entry.actorName,
  createdAt: entry.createdAt,
})

/**
 * 把一次历史操作的 before/after 快照差异转为「对象级」协作历史消息。
 * 结构操作（清空场景/合并点）按命令名识别并以单条对象消息输出。
 */
export function buildMessagesFromHistoryEntry(entry: HistoryEntryLike): CollabHistoryMessage[] {
  const actor = toActor(entry)
  const { before, after, label } = entry

  if (label.startsWith('ClearScene') || entry.intent?.category === 'clear') {
    return [makeMessage('clear', '清空了场景', actor, null, null, [], null)]
  }
  if (label.startsWith('MergePoints') || label.startsWith('MergeCubePoints') || entry.intent?.category === 'merge') {
    return buildMergeMessages(entry)
  }

  return buildGeometryMessages(
    before,
    after,
    actor,
    entry.draggedPointId ?? null,
    label,
    entry.deleteTargetId ?? null,
    entry.intent ?? null,
  )
}

function buildMergeMessages(entry: HistoryEntryLike): CollabHistoryMessage[] {
  const actor = toActor(entry)
  const { before, after } = entry
  const beforePts = new Map((before.points as unknown as SPt[]).map((p) => [p.id, p]))
  const afterPts = new Map((after.points as unknown as SPt[]).map((p) => [p.id, p]))
  const removedNames: string[] = []
  const declaredRemoved = entry.intent?.removedPointIds ?? null
  if (declaredRemoved && declaredRemoved.length > 0) {
    for (const rid of declaredRemoved) {
      const p = beforePts.get(rid)
      if (p) removedNames.push(p.name)
    }
  } else {
    // 无意图声明时退回到快照差异（消失的点即吸收点）
    for (const [id, p] of beforePts) {
      if (id === 'origin') continue
      if (!afterPts.has(id)) removedNames.push(p.name)
    }
  }
  let targetName: string | null = null
  // 命令明确携带保留点 id → 直接精确定位合并目标（普通合并保留点不移动，快照无法反推）
  const keepPointId = entry.intent?.keepPointId ?? entry.keepPointId ?? null
  if (keepPointId) {
    const kept = afterPts.get(keepPointId)
    if (kept) targetName = kept.name
  }
  if (!targetName) {
    for (const [id, p] of afterPts) {
      const b = beforePts.get(id)
      if (b && !eqVec(b.position, p.position)) {
        targetName = p.name
        break
      }
    }
  }
  if (!targetName) {
    const lastAfter = [...afterPts.values()].filter((p) => p.id !== 'origin')
    targetName = lastAfter.length > 0 ? lastAfter[lastAfter.length - 1]!.name : null
  }
  const params: CollabHistoryParam[] =
    removedNames.length > 0 ? [{ label: '吸收点', before: removedNames.join('、'), after: '' }] : []
  // 目标点名如“点C”已含种类词，省略“点”种类避免重复
  const kind = targetName?.startsWith('点') ? null : '点'
  return [makeMessage('merge', '合并了点', actor, kind, targetName, params, null)]
}

/** 点角色 → 操作部位中文名（用于「准确表达」标注被直接操作的点部位）。
 *  判定顺序：锥柱角色点需先于 circleRole——圆柱/圆锥的轴心点同时是其底面(顶面)
 *  构成圆的圆心（circleRole='center'），按「圆心X」描述会丢失「哪个立体的哪个面」。 */
const pointRoleLabel = (p: SPt): string | null => {
  if (p.sphereRole === 'center') return '球心点'
  if (p.sphereRole === 'radius') return '半径点'
  if (p.coneRole === 'baseCenter') return '底面中心'
  if (p.coneRole === 'apex') return '顶点'
  if (p.cylinderRole === 'bottomCenter') return '底面圆心'
  if (p.cylinderRole === 'topCenter') return '顶面圆心'
  if (p.circleRole === 'center') return '圆心'
  return null
}

/** 点角色词表：命中则以「拖拽」措辞（点部位），对象本体（球体/圆/线段…）用「拖动」 */
const POINT_ROLE_WORDS = new Set([
  '球心点', '半径点', '圆心', '底面中心', '顶点', '底面圆心', '顶面圆心',
])

/** subject 是否为点部位（角色词或其+点名形式，如 球心点/球心点J） */
const isPointRoleSubject = (subject: string): boolean => {
  for (const r of POINT_ROLE_WORDS) {
    if (subject === r || subject.startsWith(r)) return true
  }
  return false
}

/** subject 是否指向球体：球体/两点球N/半径球N（拖对象本体时主语为「种类词+名称」，
 *  而球的名称自带种类词（两点球1/半径球1），故前缀判定需覆盖这几种写法） */
const isSphereSubject = (subject: string): boolean =>
  subject.startsWith('球') || subject.startsWith('两点球') || subject.startsWith('半径球')

/** 由点 id 推导「被直接操作部位」显示词：角色+点名（球心点J/圆心A），无角色点为点A */
const subjectForPoint = (
  pid: string | null | undefined,
  pointById: Map<string, SPt>,
  pointNames: Map<string, string>,
): string | null => {
  if (!pid) return null
  const p = pointById.get(pid)
  const name = pointNames.get(pid)
  if (p) {
    const role = pointRoleLabel(p)
    if (role) return name ? `${role}${name}` : role
  }
  return name ? `点${name}` : null
}

/**
 * 「准确表达」核心：按操作位置（场景/侧边栏）与被操作部位生成来源标注。
 * - 场景拖动本体：场景拖动球体/圆/线段…
 * - 场景拖拽点：场景拖拽球心点/圆心/点A
 * - 侧边栏修改坐标：侧边栏修改球心点坐标/点A坐标
 * 意图未声明（origin 为 null）时返回 null，由调用方保留旧启发式。
 */
const buildOriginNote = (o: {
  origin: 'scene' | 'panel' | null
  subject: string | null
  draggedPointId: string | null
  movedPointIds: string[]
  pointById: Map<string, SPt>
  pointNames: Map<string, string>
}): string | null => {
  const { origin, subject, draggedPointId, movedPointIds, pointById, pointNames } = o
  if (origin === 'scene') {
    if (subject) {
      const verb = isPointRoleSubject(subject) ? '拖拽' : '拖动'
      return `场景${verb}${subject}`
    }
    const pid = draggedPointId ?? movedPointIds[0] ?? null
    const subj = subjectForPoint(pid, pointById, pointNames)
    return subj ? `场景拖拽${subj}` : null
  }
  if (origin === 'panel') {
    if (subject) return `侧边栏修改${subject}坐标`
    const subj = subjectForPoint(movedPointIds[0] ?? null, pointById, pointNames)
    return subj ? `侧边栏修改${subj}坐标` : '侧边栏修改'
  }
  return null
}

/**
 * 对象级 diff：按优先级吸收构成点/子对象，保证每个「几何对象」只产生一条消息。
 */
function buildGeometryMessages(
  before: SerializedScene,
  after: SerializedScene,
  actor: Actor,
  draggedPointId: string | null = null,
  deleteIntentLabel: string | null = null,
  deleteTargetId: string | null = null,
  intent: CollabOperationIntent | null = null,
): CollabHistoryMessage[] {
  const posBefore = pointPositions(before)
  const posAfter = pointPositions(after)
  const pointNames = new Map<string, string>()
  for (const p of before.points) pointNames.set(p.id, p.name)
  /** after 点按 id 索引（含角色字段），供「准确表达」按被操作点部位生成来源标注 */
  const afterPointById = new Map<string, SPt>()
  for (const p of after.points) afterPointById.set(p.id, p)
  /** before 点按 id 索引（被删除的点也能按角色反查所属对象） */
  const beforePointById = new Map<string, SPt>()
  for (const p of before.points) beforePointById.set(p.id, p)
  const messages: CollabHistoryMessage[] = []
  const covered = new Set<string>()
  const judgedParentIds = new Set<string>()
  /** 引用点 → 吸收它的根对象 id（用于把随动的独立派生物级联到根对象消息） */
  const refOwner = new Map<string, string>()
  /** 已生成消息的主对象 id → 消息（级联标注挂载目标） */
  const msgByTargetId = new Map<string, CollabHistoryMessage>()
  /** 根对象 id → 级联结果清单（如「级联移动 垂线N」） */
  const cascadeByRoot = new Map<string, Array<{ action: string; text: string }>>()

  // 从属点归属：after 映射为当前归属；仅 before 有（本条目中被删除的点）用 before 兜底
  const afterPointIdSet = new Set(after.points.map((p) => p.id))
  const dependentParent = buildDependentPointParentMap(after)
  for (const [pid, owner] of buildDependentPointParentMap(before)) {
    if (!afterPointIdSet.has(pid)) dependentParent.set(pid, owner)
  }

  const views = buildViews(before, after, dependentParent)

  // 被删除的点集（before 存在、after 消失）：用于识别「引用该点的对象被级联删除」
  const afterPointIds = new Set(after.points.map((p) => p.id))
  const pointDeleteIds = new Set<string>()
  for (const p of before.points) if (!afterPointIds.has(p.id)) pointDeleteIds.add(p.id)
  /** 某被删点 → 因它消失而被级联删除的对象文本（如 [B] → ['射线X']） */
  const cascadeByPoint = new Map<string, string[]>()
  /** 主删除消息索引：被删对象 id → 消息（用于挂级联标注） */
  const deleteMsgByTarget = new Map<string, CollabHistoryMessage>()

  // ---- 根因点判定：同一次操作中，多个构成点随同一父对象（立方体/球体等）消失时，
  // 只把其中一个作为被删「根因点」生成主消息，其余点并入级联标注，避免删一个点刷出 N 条 ----
  const pointParentId = (p: { cubeId?: string | null; prismId?: string | null; pyramidId?: string | null; regularPolygonId?: string | null; sphereId?: string | null; coneId?: string | null; cylinderId?: string | null; circleId?: string | null } & { id: string }) =>
    p.cubeId ?? p.prismId ?? p.pyramidId ?? p.regularPolygonId ?? p.sphereId ?? p.coneId ?? p.cylinderId ?? p.circleId ?? dependentParent.get(p.id) ?? null
  // 父对象 → 集结在其下的点（立体移动/修改时这些从属点随动，应吸收不单独上报）
  const pointsByParent = new Map<string, Set<string>>()
  for (const p of after.points) {
    const owner = pointParentId(p)
    if (!owner) continue
    let set = pointsByParent.get(owner)
    if (!set) {
      set = new Set()
      pointsByParent.set(owner, set)
    }
    set.add(p.id)
  }
  /** 吸收根对象的构成点（含从属点）为已上报，避免「移动了 正六面体6」之外又冒出「移动了 点F1」。
   *  共点（一个点同时属于多个几何对象，如正多边形原始点又是两点球半径点）时，
   *  归属取首个吸收者（views 顺序即判定优先级：立体/正多边形先于球/圆等），
   *  后续对象不再覆盖，避免「先归并到正多边形、又被两点球改写」导致
   *  引用该点的边界线段/派生对象级联归属判定漂移而独立上报。 */
  const absorbRefs = (rids: string[], ownerId: string) => {
    for (const rid of rids) {
      covered.add(rid)
      if (!refOwner.has(rid)) refOwner.set(rid, ownerId)
    }
    for (const cid of pointsByParent.get(ownerId) ?? []) {
      covered.add(cid)
      if (!refOwner.has(cid)) refOwner.set(cid, ownerId)
    }
  }
  const constraintObjectId = (c: AnyObj): string | null => {
    if (typeof c !== 'object' || c === null) return null
    const id =
      typeof c.cubeId === 'string'
        ? c.cubeId
        : typeof c.prismId === 'string'
          ? c.prismId
          : typeof c.pyramidId === 'string'
            ? c.pyramidId
            : typeof c.regularPolygonId === 'string'
              ? c.regularPolygonId
              : typeof c.sphereId === 'string'
                ? c.sphereId
                : typeof c.coneId === 'string'
                  ? c.coneId
                  : typeof c.cylinderId === 'string'
                    ? c.cylinderId
                    : typeof c.circleId === 'string'
                      ? c.circleId
                      : null
    return id
  }
  const collectObjectIds = (scene: SerializedScene): Set<string> => {
    const s = new Set<string>()
    for (const c of scene.constraints) {
      const obj = c as unknown as AnyObj
      // 正多边形约束的对象 id 字段为 constraintId（其余立体为 cubeId/prismId/pyramidId）
      const id = constraintObjectId(obj) ?? (typeof obj.constraintId === 'string' ? obj.constraintId : null)
      if (id) s.add(id)
    }
    for (const obj of [...scene.spheres, ...scene.cones, ...scene.cylinders, ...scene.circles]) {
      s.add(obj.id)
    }
    return s
  }
  const beforeObjIds = collectObjectIds(before)
  const afterObjIds = collectObjectIds(after)

  // ---- 主操作对象（用户实际操作的几何对象）判定：用于「我操作了什么」置顶与来源标注聚焦 ----
  // 消息按视图顺序生成（prism→…→regularPolygon→…→sphere→…）只保证吸收/去重正确，
  // 与「用户实际操作哪个对象」无关：拖动与正多边形共点的球心点时，正多边形（连带变形）
  // 会先于两点球（被操作对象）出消息。共点时一个点可同时属于多个对象
  // （如球心点又是正多边形顶点），固定的层级优先级不足以消歧，需结合操作意图的
  // subject（如「球心点A」/「圆心A」/「球体」）判定主操作对象。
  /** 某点所属的全部几何对象 id（共点时不止一个） */
  const ownerIdsOfPoint = (pid: string | null): string[] => {
    if (!pid) return []
    const p = afterPointById.get(pid) ?? beforePointById.get(pid)
    if (!p) return []
    const ids: string[] = []
    for (const oid of [
      p.cubeId,
      p.prismId,
      p.pyramidId,
      p.regularPolygonId,
      p.sphereId,
      p.coneId,
      p.cylinderId,
      p.circleId,
    ]) {
      if (typeof oid === 'string' && oid) ids.push(oid)
    }
    return ids
  }
  /** 意图 targetId 直接指向对象（而非点）时，该对象即被操作对象 */
  const intentObjectId =
    intent?.targetId && (afterObjIds.has(intent.targetId) || beforeObjIds.has(intent.targetId))
      ? intent.targetId
      : null
  /** 由 subject 的点部位词 + 点名反查被操作点：拖球心点/圆心等「拖对象整体」的分支
   *  不设置 draggingPointId（Interaction 走 draggingSphereId/draggingCircleId），
   *  此时只能从「球心点A」这类声明反查 A，并要求角色匹配以避免同名点误配。 */
  const findOperatedPointBySubject = (): string | null => {
    const subject = intent?.subject ?? null
    if (!subject) return null
    const matchers: Array<[RegExp, (p: SPt) => boolean]> = [
      [/^球心点/, (p) => p.sphereRole === 'center' && !!p.sphereId],
      [/^半径点/, (p) => p.sphereRole === 'radius' && !!p.sphereId],
      [/^圆心/, (p) => p.circleRole === 'center' && !!p.circleId],
    ]
    for (const [re, matchesRole] of matchers) {
      const m = re.exec(subject)
      if (!m) continue
      const name = subject.slice(m[0].length)
      if (!name) continue
      for (const p of afterPointById.values()) {
        if (p.name === name && matchesRole(p)) return p.id
      }
    }
    return null
  }
  /** 被拖动的点（draggedPointId 优先，其次 targetId 为点 id，最后按 subject 反查） */
  const operatedPointId =
    (draggedPointId && (afterPointById.has(draggedPointId) || beforePointById.has(draggedPointId))
      ? draggedPointId
      : null) ??
    (intent?.targetId && (afterPointById.has(intent.targetId) || beforePointById.has(intent.targetId))
      ? intent.targetId
      : null) ??
    findOperatedPointBySubject()
  /** 构成圆（圆柱底面/顶面、圆锥底面的法向圆）→ 父立体 id。
   *  构成圆是立体的构成部分（被静默归并、不产生消息），不能被当作操作对象：
   *  拖动该圆（或其圆心）实际改变的是立体（如圆柱高度），主操作对象须取父立体，
   *  否则来源标注挂到无消息的圆上而被丢弃，退化为旧启发式「由X点拖动」。 */
  const solidParentOfCircle = (circleId: string): string | null => {
    const scan = (scene: SerializedScene): string | null => {
      for (const c of scene.cylinders as unknown as SCylinder[]) {
        if (c.normalCircleId === circleId || c.topNormalCircleId === circleId) return c.id
      }
      for (const c of scene.cones as unknown as SCone[]) {
        if (c.normalCircleId === circleId) return c.id
      }
      return null
    }
    return scan(after) ?? scan(before)
  }
  /** 点作为「对象角色点」的所属对象，角色语义优先于层级优先级：
   *  球心点/半径点 → 球，圆心 → 圆，锥柱角色点 → 锥柱，立体的构成点 → 立体。
   *  用于兜底判定主操作对象——拖动与正多边形顶点共点的球半径点时，用户改的是球半径，
   *  主语应为球（而非按层级取到的正多边形）。
   *  构成圆（圆柱/圆锥的底面、顶面法向圆）不是独立对象，须剔除，落到其父立体。 */
  const roleOwnerIdsOfPoint = (pid: string | null): string[] => {
    if (!pid) return []
    const p = afterPointById.get(pid) ?? beforePointById.get(pid)
    if (!p) return []
    const ids: string[] = []
    const constituentCircleId = p.circleId && solidParentOfCircle(p.circleId) ? p.circleId : null
    for (const oid of [p.sphereId, p.circleId, p.coneId, p.cylinderId, p.regularPolygonId, p.cubeId, p.prismId, p.pyramidId]) {
      // 构成圆本身不算「角色点所属对象」，但保留其父立体（cylinderId/coneId 已在列）
      if (oid === constituentCircleId) continue
      if (typeof oid === 'string' && oid) ids.push(oid)
    }
    return ids
  }
  /** 本次操作涉及的对象集合（主操作对象 + 共点连带对象） */
  const operatedIds = new Set<string>()
  if (intentObjectId) operatedIds.add(intentObjectId)
  for (const oid of ownerIdsOfPoint(operatedPointId)) operatedIds.add(oid)
  /** 主操作对象：由 subject 消歧——按被操作点的角色词确定「用户抓的是哪个对象」 */
  const primaryOperatedId = ((): string | null => {
    if (intentObjectId) return intentObjectId
    const subject = intent?.subject ?? null
    if (!subject || !operatedPointId) return null
    const p = afterPointById.get(operatedPointId) ?? beforePointById.get(operatedPointId)
    if (!p) return null
    // 注意判定顺序：「圆锥/圆柱」需先于「圆」
    if (subject.startsWith('圆锥') && p.coneId) return p.coneId
    if (subject.startsWith('圆柱') && p.cylinderId) return p.cylinderId
    // 「圆心X」若指圆柱/圆锥的底面(顶面)构成圆，实际操作的是父立体（构成圆无独立消息）
    if (subject.startsWith('圆') && p.circleId) return solidParentOfCircle(p.circleId) ?? p.circleId
    if (isSphereSubject(subject) && p.sphereId) return p.sphereId
    return null
  })()
  /** 来源标注（场景拖动X/场景拖拽X）只挂在实际被操作对象上：
   *  主操作对象明确时仅它可挂，旁及（共点/共边连带）对象不得误标；
   *  无法消歧时回退为「属于本次操作对象集合即挂」。 */
  const isOriginSubjectTarget = (id: string): boolean => {
    if (primaryOperatedId) return id === primaryOperatedId
    return operatedIds.size === 0 || operatedIds.has(id)
  }
  /** subject 为对象本体词（「球体」「面」「棱柱」…，不含点名）时的对象类型过滤器：
   *  拖对象本体的分支以 draggingXxxId 记录目标，intent 未携带 id，需按类型 + diff 消歧。
   *  注意「面」只匹配立体/正多边形/面自身，不匹配球/圆/锥柱——拖动面时连带变化的球不是操作对象。 */
  const subjectKindFilter = ((): ((id: string) => boolean) | null => {
    const subject = intent?.subject ?? null
    if (!subject) return null
    const idsOf = (list: unknown[]) => new Set(list.map((it) => (it as { id: string }).id))
    const constraintIds = (type: string) =>
      new Set(
        after.constraints
          .map((c) => c as unknown as AnyObj)
          .filter((c) => c.type === type)
          .map(
            (c) =>
              // 正多边形约束的对象 id 字段为 constraintId（其余立体为 cubeId/prismId/pyramidId）
              constraintObjectId(c) ?? (typeof c.constraintId === 'string' ? c.constraintId : null),
          )
          .filter((v): v is string => typeof v === 'string'),
      )
    // 注意：拖对象本体时主语为「种类词+名称」（如 线段l / 圆c / 正六面体1），
    // 一律用前缀判定，不能用等值比较
    if (isSphereSubject(subject)) return (id) => idsOf(after.spheres).has(id)
    if (subject.startsWith('圆锥')) return (id) => idsOf(after.cones).has(id)
    if (subject.startsWith('圆柱')) return (id) => idsOf(after.cylinders).has(id)
    if (subject.startsWith('圆')) return (id) => idsOf(after.circles).has(id)
    if (subject.startsWith('棱柱')) return (id) => constraintIds('prism').has(id)
    if (subject.startsWith('棱锥')) return (id) => constraintIds('pyramid').has(id)
    if (subject.startsWith('正六面体') || subject.startsWith('正四面体'))
      return (id) => constraintIds('cube').has(id)
    if (subject.startsWith('正多边形')) return (id) => constraintIds('regularPolygon').has(id)
    if (subject.startsWith('面'))
      return (id) =>
        constraintIds('cube').has(id) ||
        constraintIds('prism').has(id) ||
        constraintIds('pyramid').has(id) ||
        constraintIds('regularPolygon').has(id) ||
        idsOf(after.faces).has(id)
    if (subject.startsWith('线段')) return (id) => idsOf(after.lines).has(id)
    if (subject.startsWith('直线')) return (id) => idsOf(after.straightLines).has(id)
    if (subject.startsWith('射线')) return (id) => idsOf(after.rays).has(id)
    if (subject.startsWith('向量')) return (id) => idsOf(after.vectors).has(id)
    if (subject.startsWith('垂线')) return (id) => idsOf(after.perpendicularLines).has(id)
    if (subject.startsWith('平行线')) return (id) => idsOf(after.parallelLines).has(id)
    return null
  })()
  /** 消息 → 其归属几何对象 id（用于按主操作对象置顶重排） */
  const msgOwnerId = new Map<CollabHistoryMessage, string>()

  // ---- 删除意图（来自命令 label，如 delete-sphere）：用户直接删除的是「最高层级对象」，
  // 其构成点消失只是连带。快照 diff 无法区分「删点→对象级联」与「删对象→点级联」，
  // 按 label 把被删对象本身升为主消息，构成点降为级联标注 ----
  const INTENT_VIEW_KEY: Record<string, string> = {
    point: 'point',
    line: 'line',
    straightLine: 'straightLine',
    perpendicularLine: 'perpendicularLine',
    parallelLine: 'parallelLine',
    ray: 'ray',
    vector: 'vector',
    circle: 'circle',
    sphere: 'sphere',
    cone: 'cone',
    cylinder: 'cylinder',
    hexahedron: 'cube',
    tetrahedron: 'cube',
    regularPolygon: 'regularPolygon',
    prism: 'prism',
    pyramid: 'pyramid',
    face: 'face',
  }
  /** 本次操作中消失的对象 id 集合（before 有、after 无）。
   *  用于判断「某构成点的消失是否已由其所属几何对象（同样被删除）表达」，
   *  避免级联标注里出现「级联删除 正六面体1、点G、点H、点I…」式冗余——范围由顶层对象表达即可。 */
  const vanishedObjectIds = new Set<string>()
  for (const v of views) {
    const afterIds = byAnyId(v.listAfter)
    for (const o of v.listBefore) {
      const oid = v.getId(o)
      if (oid !== 'origin' && !afterIds.has(oid)) vanishedObjectIds.add(oid)
    }
  }
  let intentMain: {
    view: SnapshotView
    o: AnyObj
    id: string
    name: string
    ownedPointIds: Set<string>
  } | null = null
  if (deleteIntentLabel && deleteIntentLabel.startsWith('delete-')) {
    const intentViewKey = INTENT_VIEW_KEY[deleteIntentLabel.slice('delete-'.length)]
    const intentView = intentViewKey ? views.find((v) => v.key === intentViewKey) : undefined
    if (intentView) {
      const intentAfterMap = byAnyId(intentView.listAfter)
      // 优先用命令携带的真实被删目标 id（删点会连带消失同一立方体的多个顶点，
      // 快照无法反推哪个是被删点，只能取“第一个消失对象”）
      const deleteTargetPreference =
        intent?.category === 'delete' && intent.targetId ? intent.targetId : deleteTargetId
      let deleted =
        (deleteTargetPreference && !intentAfterMap.has(deleteTargetPreference)
          ? intentView.listBefore.find((o) => intentView.getId(o) === deleteTargetPreference)
          : undefined) ?? null
      if (!deleted) {
        deleted =
          intentView.listBefore.find((o) => {
            const id = intentView.getId(o)
            return id !== 'origin' && !intentAfterMap.has(id)
          }) ?? null
      }
      if (deleted) {
        const id = intentView.getId(deleted)
        const ownedPointIds = new Set<string>()
        // 种子：意图对象的构成点（点视图 refs 即其自身；立体为它约束下的点）
        for (const p of before.points) {
          if (pointParentId(p) === id) ownedPointIds.add(p.id)
        }
        for (const rid of intentView.getRefPointIds(deleted)) ownedPointIds.add(rid)
        // 传递闭包：本操作中被删的对象链沿「对象↔构成点」双向扩散。
        // 例如删点 Z 导致正六面体级联删除，则立方体全部顶点/面/线都归入 Z 的级联，
        // 不再让其他顶点（E1 等）成为第二条主消息。
        const deletedObjects: Array<{ view: SnapshotView; o: AnyObj; nodeId: string }> = []
        for (const v of views) {
          const am = byAnyId(v.listAfter)
          for (const o of v.listBefore) {
            const oid = v.getId(o)
            if (oid !== 'origin' && !am.has(oid)) deletedObjects.push({ view: v, o, nodeId: oid })
          }
        }
        let changed = true
        let guard = 0
        while (changed && guard++ < 32) {
          changed = false
          for (const node of deletedObjects) {
            if (node.nodeId === id) continue
            const refs = node.view.getRefPointIds(node.o)
            if (refs.some((rid) => ownedPointIds.has(rid))) {
              refs.forEach((rid) => ownedPointIds.add(rid))
              changed = true
              continue
            }
            // 兜底：对象按 pointParentId 归属（如立体约束下的顶点）
            for (const p of before.points) {
              if (ownedPointIds.has(p.id) && pointParentId(p) === node.nodeId) {
                refs.forEach((rid) => ownedPointIds.add(rid))
                changed = true
                break
              }
            }
          }
        }
        intentMain = { view: intentView, o: deleted, id, name: intentView.getName(deleted), ownedPointIds }
      }
    }
  }

  /** 消失点按「消失的父对象」分组，每组选一个根因点 */
  const groupByParent = new Map<string, string[]>()
  const freeRootPointIds: string[] = []
  for (const p of before.points) {
    if (!pointDeleteIds.has(p.id) || p.id === 'origin') continue
    // 属于「用户直接删除的对象」的构成点：不单独作为根因点，统一并入主对象级联
    if (intentMain && intentMain.ownedPointIds.has(p.id)) continue
    const parent = pointParentId(p)
    if (parent && beforeObjIds.has(parent) && !afterObjIds.has(parent)) {
      const list = groupByParent.get(parent) ?? []
      list.push(p.id)
      groupByParent.set(parent, list)
    } else {
      freeRootPointIds.push(p.id)
    }
  }
  /** 最终根因点（生成主删除消息） */
  const rootPointIds = new Set<string>(freeRootPointIds)
  /** 被并入根因点的消失点 → 根因点 id */
  const cascadePointTarget = new Map<string, string>()
  for (const [parent, ids] of groupByParent) {
    // 有删除意图时：非意图对象的消失点组（如同一条目内被连带的另一个同类型对象）
    // 不再另选根因点，统一并入主对象级联，避免「每次操作仍可能冒出第二个根」。
    if (intentMain && parent !== intentMain.id) {
      for (const id of ids) cascadePointTarget.set(id, intentMain.id)
      continue
    }
    const sorted = [...ids].sort((a, b) => a.localeCompare(b))
    const root = sorted[0]!
    rootPointIds.add(root)
    for (const id of ids) if (id !== root) cascadePointTarget.set(id, root)
  }
  /** 解析最终根因点（兼容被merge链） */
  const resolveRoot = (pointId: string): string => {
    let cur = pointId
    let guard = 0
    while (cascadePointTarget.has(cur) && guard++ < 32) cur = cascadePointTarget.get(cur)!
    return cur
  }
  const appendCascade = (root: string, text: string) => {
    const texts = cascadeByPoint.get(root) ?? []
    if (!texts.includes(text)) texts.push(text)
    cascadeByPoint.set(root, texts)
  }

  // 有删除意图：先生成被删「最高层级对象」的主消息，其构成点/子对象作为级联标注挂在它下面
  if (intentMain) {
    const message = makeMessage(
      'delete',
      '删除了',
      actor,
      resolveKindLabel(intentMain.view, intentMain.o, intentMain.name),
      intentMain.name,
      [],
      null,
    )
    messages.push(message)
    deleteMsgByTarget.set(intentMain.id, message)
    msgOwnerId.set(message, intentMain.id)
    // 主对象本身已判定：其构成子对象（面/边界线段/从属点）在删除循环中随父被吸收，
    // 不再逐个进入级联标注——范围由顶层对象表达，避免「删除了 正多边形1 → 级联删除 面、线段a…e」式冗余
    judgedParentIds.add(intentMain.id)
  }

  // 创建意图：命令声明了被创建对象 → 直接生成主创建消息，其构成点/子对象被吸收不单发
  let intentCreateId: string | null = null
  if (intent?.category === 'create' && intent.targetId) {
    for (const v of views) {
      if (byAnyId(v.listBefore).has(intent.targetId)) continue
      const o = v.listAfter.find((item) => v.getId(item) === intent.targetId)
      if (!o) continue
      const name = v.getName(o)
      const createdFrom = resolveCreateSources(views, pointNames, v, o).join('、') || null
      const createMsg = makeMessage('create', '创建了', actor, resolveKindLabel(v, o, name), name, [], null, createdFrom)
      messages.push(createMsg)
      msgOwnerId.set(createMsg, intent.targetId)
      absorbRefs(v.getRefPointIds(o), intent.targetId)
      judgedParentIds.add(intent.targetId)
      intentCreateId = intent.targetId
      break
    }
  }

  // 锁定归并：同一操作中「同属一个多面体的多个成员」同时锁定/解锁（如锁定正六面体→锁其各面各点），
// 只发该多面体一条消息，避免逐个面/点刷消息。
const lockGroupByCube = new Map<string, { count: number; toLocked: boolean }>()
for (const v of views) {
  const bm = byAnyId(v.listBefore)
  for (const o of v.listAfter) {
    const b = bm.get(v.getId(o))
    if (!b) continue
    const locks = v.getLock(b, o)
    if (locks.length === 0) continue
    const parentCube = v.key === 'cube' ? null : v.getParentId(o) ?? null
    if (!parentCube) continue
    const g = lockGroupByCube.get(parentCube) ?? { count: 0, toLocked: false }
    g.count++
    g.toLocked = locks.some((l) => l.toLocked)
    lockGroupByCube.set(parentCube, g)
  }
}

for (const view of views) {
    const beforeMap = byAnyId(view.listBefore)
    const afterMap = byAnyId(view.listAfter)

    // ---- 新增对象 ----
    for (const o of view.listAfter) {
      const id = view.getId(o)
      if (id === 'origin') continue
      if (beforeMap.has(id)) continue
      // 创建意图目标对象：主消息已按意图生成
      if (intentCreateId && id === intentCreateId) continue
      const parentId = view.getParentId(o)
      if (parentId && judgedParentIds.has(parentId)) continue
      const refs = view.getRefPointIds(o)
      if (refs.length > 0 && refs.every((rid) => covered.has(rid))) continue

      const name = view.getName(o)
      const createdFrom = resolveCreateSources(views, pointNames, view, o).join('、') || null
      const createMsg = makeMessage('create', '创建了', actor, resolveKindLabel(view, o, name), name, [], null, createdFrom)
      messages.push(createMsg)
      msgOwnerId.set(createMsg, id)
      absorbRefs(refs, id)
      judgedParentIds.add(id)
    }

    // ---- 删除对象 ----
    // 级联删除判定：非点对象的引用点中有「被删除的点」→ 该对象是因点消失而级联删除，
    // 不单独发消息，而是登记到对应点的主删除消息标注（如 「删除了 点B 级联删除 射线X」）。
    for (const o of view.listBefore) {
      const id = view.getId(o)
      if (id === 'origin') continue
      if (afterMap.has(id)) continue
      // 被删主对象自身：主消息已按删除意图单独生成
      if (intentMain && id === intentMain.id) continue
      const parentId = view.getParentId(o)
      // 子元素（如立方体的面）在父对象被删除/级联删除时跳过不单发；
      // 但点例外：用户删除的构成点是根因，即使父对象（立方体/球体）被级联删除也必须发点删除主消息
      if (view.key !== 'point' && parentId && judgedParentIds.has(parentId)) continue
      const refs = view.getRefPointIds(o)
      // 构成点已被更高级对象（如同属立方体）吸收 → 不单独上报子元素
      if (refs.length > 0 && refs.every((rid) => covered.has(rid))) continue

      const name = view.getName(o)
      // 非点对象因引用点消失被级联删除 → 登记（统一挂到根因点/主对象），不生成独立消息
      const lostRefPointIds = refs.filter((rid) => pointDeleteIds.has(rid))
      if (view.key !== 'point' && lostRefPointIds.length > 0) {
        let root: string
        if (intentMain && lostRefPointIds.some((rid) => intentMain.ownedPointIds.has(rid))) {
          root = intentMain.id
        } else {
          const target = lostRefPointIds.find((rid) => rootPointIds.has(rid)) ?? lostRefPointIds[0]!
          root = resolveRoot(target)
        }
        if (root === intentMain?.id || rootPointIds.has(root)) {
          appendCascade(root, [resolveKindLabel(view, o, name), name].filter(Boolean).join(''))
        }
        judgedParentIds.add(id)
        continue
      }

      // 点对象：若该点因父对象（立方体/球体）连带消失 → 转为级联标注，不生成主消息；
      // 属被删主对象的构成点统一挂到主对象；其余并入根因点
      if (view.key === 'point' && !rootPointIds.has(id)) {
        // 其所属几何对象同样在本次操作中消失 → 该点的消失已由顶层对象表达，
        // 不再逐个列出（如删正六面体顶点只需「级联删除 正六面体1」，无需再列 7 个顶点）
        const parent = pointParentId(o as unknown as SPt)
        if (!parent || !vanishedObjectIds.has(parent)) {
          if (intentMain && intentMain.ownedPointIds.has(id)) {
            appendCascade(intentMain.id, [resolveKindLabel(view, o, name), name].filter(Boolean).join(''))
          } else {
            const root = resolveRoot(id)
            appendCascade(root, [resolveKindLabel(view, o, name), name].filter(Boolean).join(''))
          }
        }
        judgedParentIds.add(id)
        continue
      }

      // 删除意图存在：本操作消失的其他对象若未被「引用已删点」识别
      // （如正六面体的构建源线段，其端点往往不随立体删除），统一作为主对象的级联标注，
      // 不再生成独立消息，避免「删了立体却多出一条线段消息」
      if (intentMain && view.key !== 'point') {
        appendCascade(intentMain.id, [resolveKindLabel(view, o, name), name].filter(Boolean).join(''))
        judgedParentIds.add(id)
        continue
      }

      const message = makeMessage('delete', '删除了', actor, resolveKindLabel(view, o, name), name, [], null)
      messages.push(message)
      deleteMsgByTarget.set(id, message)
      msgOwnerId.set(message, id)
      absorbRefs(refs, id)
      judgedParentIds.add(id)
    }

    // ---- 存在但发生变化的对象 ----
    for (const o of view.listAfter) {
      const id = view.getId(o)
      if (id === 'origin') continue
      const beforeObj = beforeMap.get(id)
      if (!beforeObj) continue

      const refs = view.getRefPointIds(o)
      const refsMoved = refs.some((rid) => !eqVec(posBefore.get(rid), posAfter.get(rid)))
      const p2Moved =
        (view.key === 'perpendicularLine' || view.key === 'parallelLine') &&
        !eqVec(
          (beforeObj.p2Position as SVec | undefined),
          (o.p2Position as SVec | undefined),
        )

      const locks = view.getLock(beforeObj, o)
      const params = view.getParams(beforeObj, o, posBefore, posAfter)
      const nameBefore = beforeObj.name as string | undefined
      const nameAfter = o.name as string | undefined
      const renamed = nameBefore !== nameAfter
      // 空名称不是有效变更：nameParam 会返回 null，此时不追加「名称」参数
      const nameChange = renamed ? nameParam(nameBefore ?? '', nameAfter ?? '') : null
      const effectiveParams = nameChange ? [...params, nameChange] : params
      const moved = view.getMoved
        ? view.getMoved(beforeObj, o, refsMoved, posBefore, posAfter)
        : refsMoved || p2Moved

      if (locks.length === 0 && effectiveParams.length === 0 && !moved) {
        // 意图目标对象：命令已声明本次改动（如移动依赖点旋转立方体，快照差异可能是纯位移）
        if (!(intent && intent.targetId && intent.targetId === id)) continue
      }
      const parentId = view.getParentId(o)
      if (parentId && judgedParentIds.has(parentId)) continue
      const name = view.getName(o)
      // 级联归属：对象的所有构成点都被「已判定的根对象」吸收（随根对象变化而联动）。
      // 共点（一个点同时属于多个几何对象）时构成点可能分属多个根——只要全部有归属
      // 即视为随动派生物，不再因归属不一致而退化为独立消息；级联标注择根挂载：
      // 操作意图目标 > 已生成消息的根 > 首个根。
      const refOwners = new Set<string>()
      let firstOwner: string | null = null
      let allOwned = refs.length > 0
      for (const rid of refs) {
        const owner = refOwner.get(rid)
        if (!owner) {
          allOwned = false
          break
        }
        if (firstOwner === null) firstOwner = owner
        refOwners.add(owner)
      }
      const ownedByRoot = allOwned && refOwners.size > 0
      let ownerRoot: string | null = firstOwner
      if (ownedByRoot && refOwners.size > 1) {
        if (intent?.targetId && refOwners.has(intent.targetId)) {
          ownerRoot = intent.targetId
        } else {
          ownerRoot = [...refOwners].find((oid) => msgByTargetId.has(oid)) ?? firstOwner
        }
      }
      if (ownedByRoot && ownerRoot) {
        // 点/归属某父对象的子元素是主体的构成部分 → 吸收，不单独上报（避免拖动立体刷屏）
        if (view.key === 'point' || parentId != null) continue
        // 独立派生对象（垂线/平行线等随基点移动而重绘）→ 作为主对象的「级联…」结果标注，
        // 清晰表达「操作了什么 → 导致什么结果」，不再静默丢弃
        const cascadeAction = moved ? '移动' : effectiveParams.length > 0 ? '修改' : ''
        if (cascadeAction) {
          const text = [resolveKindLabel(view, o, name), name].filter(Boolean).join('')
          const list = cascadeByRoot.get(ownerRoot) ?? []
          if (!list.some((i) => i.text === text)) list.push({ action: `级联${cascadeAction}`, text })
          cascadeByRoot.set(ownerRoot, list)
          // 已并入级联的构成点继续往上归属，使更深层随动对象也归到同一根
          refs.forEach((rid) => refOwner.set(rid, ownerRoot))
        }
        judgedParentIds.add(id)
        continue
      }
      // 操作级意图：目标对象按命令声明的分类/属性生成消息（主语/属性/标注零反推）
      if (intent && intent.targetId && id === intent.targetId && intent.category) {
        const cat = intent.category
        const movedPointIds = refs.filter((rid) => !eqVec(posBefore.get(rid), posAfter.get(rid)))
        const originNote = buildOriginNote({
          origin: intent.origin ?? null,
          subject: intent.subject ?? null,
          draggedPointId,
          movedPointIds,
          pointById: afterPointById,
          pointNames,
        })
        let message: CollabHistoryMessage | null = null
        if (cat === 'update') {
          const kind = renamed ? null : resolveKindLabel(view, o, name)
          const updateParams = intent.params ? toHistoryParams(intent.params) : effectiveParams
          message = makeMessage('update', '修改了', actor, kind, name, updateParams, intent.note ?? originNote)
        } else if (cat === 'move') {
          message = makeMessage('move', '移动了', actor, resolveKindLabel(view, o, name), name, [], intent.note ?? originNote)
        } else if (cat === 'lock' || cat === 'unlock') {
          const lockParams = intent.params
            ? toHistoryParams(intent.params)
            : locks.map((l) => ({ label: l.label, before: '', after: '' }))
          message = makeMessage(
            cat,
            cat === 'lock' ? '锁定了' : '解锁了',
            actor,
            resolveKindLabel(view, o, name),
            name,
            lockParams,
            intent.note ?? null,
          )
        }
        if (message) {
          messages.push(message)
          msgByTargetId.set(id, message)
          msgOwnerId.set(message, id)
        }
        absorbRefs(refs, id)
        judgedParentIds.add(id)
        continue
      }
      if (locks.length > 0) {
        // 该锁定归属于其所属多面体（同 op 内 ≥2 成员同时锁）→ 跳过成员细节，主消息在循环后统一输出
        const parentCube = view.key === 'cube' ? null : view.getParentId(o) ?? null
        if (parentCube && (lockGroupByCube.get(parentCube)?.count ?? 0) >= 2) {
          absorbRefs(refs, parentCube)
          judgedParentIds.add(id)
          continue
        }
        const toLocked = locks.some((l) => l.toLocked)
        const lockMsg = makeMessage(
          toLocked ? 'lock' : 'unlock',
          toLocked ? '锁定了' : '解锁了',
          actor,
          resolveKindLabel(view, o, name),
          name,
          locks.map((l) => ({ label: l.label, before: '', after: '' })),
          null,
        )
        messages.push(lockMsg)
        msgByTargetId.set(id, lockMsg)
        msgOwnerId.set(lockMsg, id)
      } else if (effectiveParams.length > 0) {
        // 改名时省略种类前缀（与立体「修改了 正六面体2：名称 …」格式一致），
        // 名称参数已用对象新名标识对象本身；其余显示/数值修改才带种类
        const kind = renamed ? null : resolveKindLabel(view, o, name)
        const message = makeMessage('update', '修改了', actor, kind, name, effectiveParams, null)
        // 通过某点移动导致的修改：区分来源
        // - 操作级意图（origin/subject 明确）→「场景拖动X/场景拖拽X/侧边栏修改X坐标」
        // - 旧命令兜底：场景拖动（draggedPointId 明确）→「由X点拖动」；侧边栏坐标编辑→「由X点坐标修改」
        if (refsMoved) {
          // 来源标注只挂在实际被操作对象上：共点/共边连带变化的对象（如拖球心点时被带动的正多边形）不误标
          const originNote = isOriginSubjectTarget(id)
            ? buildOriginNote({
                origin: intent?.origin ?? null,
                subject: intent?.subject ?? null,
                draggedPointId,
                movedPointIds: refs.filter((rid) => !eqVec(posBefore.get(rid), posAfter.get(rid))),
                pointById: afterPointById,
                pointNames,
              })
            : null
          if (originNote) {
            message.note = originNote
          } else {
            const draggedName = draggedPointId ? pointNames.get(draggedPointId) : null
            if (draggedName && draggedPointId && refs.includes(draggedPointId)) {
              message.note = `由${draggedName}点拖动`
            } else {
              const seen = new Set<string>()
              const movedNames: string[] = []
              for (const rid of refs) {
                if (rid && !eqVec(posBefore.get(rid), posAfter.get(rid))) {
                  const pointName = pointNames.get(rid)
                  if (pointName && !seen.has(pointName)) {
                    seen.add(pointName)
                    movedNames.push(pointName)
                  }
                }
              }
              if (movedNames.length > 0 && movedNames.length <= 2) {
                // 明确了拖动点（场景拖动）→ 标注「拖动」；否则为坐标修改（侧边栏）
                const sceneDrag = !!draggedPointId || intent?.origin === 'scene'
                message.note = sceneDrag
                  ? `由${movedNames.join('、')}点拖动`
                  : `由${movedNames.join('、')}点坐标修改`
              }
            }
          }
        }
        messages.push(message)
        msgByTargetId.set(id, message)
        msgOwnerId.set(message, id)
      } else if (moved) {
        // 来源标注只挂在实际被操作对象上：共点/共边连带移动的对象不误标
        const originNote = isOriginSubjectTarget(id)
          ? buildOriginNote({
              origin: intent?.origin ?? null,
              subject: intent?.subject ?? null,
              draggedPointId,
              movedPointIds: refs.filter((rid) => !eqVec(posBefore.get(rid), posAfter.get(rid))),
              pointById: afterPointById,
              pointNames,
            })
          : null
        const moveMsg = makeMessage('move', '移动了', actor, resolveKindLabel(view, o, name), name, [], originNote)
        messages.push(moveMsg)
        msgByTargetId.set(id, moveMsg)
        msgOwnerId.set(moveMsg, id)
      }

      absorbRefs(refs, id)
      judgedParentIds.add(id)
    }
  }

  // 锁定归并：为「整体锁定/解锁的多面体」输出单条消息（成员细节已在循环内跳过）
  const cubeView = views.find((v) => v.key === 'cube')
  for (const [cubeId, g] of lockGroupByCube) {
    if (g.count < 2) continue
    const cubeObj = cubeView?.listAfter.find((o) => cubeView.getId(o) === cubeId)
    if (!cubeObj) continue
    const name = cubeView!.getName(cubeObj)
    const groupMsg = makeMessage(
      g.toLocked ? 'lock' : 'unlock',
      g.toLocked ? '锁定了' : '解锁了',
      actor,
      resolveKindLabel(cubeView!, cubeObj, name),
      name,
      [{ label: '几何', before: '', after: '' }],
      null,
    )
    messages.push(groupMsg)
    msgOwnerId.set(groupMsg, cubeId)
  }

  // 将级联删除对象标注到对应的主删除消息（如「删除了 点B」→ 「级联删除 射线X」）
  for (const [pointId, texts] of cascadeByPoint) {
    if (texts.length === 0) continue
    const msg = deleteMsgByTarget.get(pointId)
    if (msg) msg.cascade = `级联删除 ${texts.join('、')}`
  }

  // 将随动派生物的级联结果挂到主对象消息（如「移动了 点B」→ 「级联移动 垂线N」）
  for (const [rootId, items] of cascadeByRoot) {
    if (items.length === 0) continue
    const msg = msgByTargetId.get(rootId)
    if (msg) msg.cascade = items.map((i) => `${i.action} ${i.text}`).join('、')
  }

  // ---- 主操作对象消歧兜底：subject 为对象本体词（「球体」「面」…）时，
  // 按「该类型中实际生成消息的对象」推定主操作对象（如拖正多边形面时，面所属对象为正多边形） ----
  let effectivePrimary = primaryOperatedId
  if (!effectivePrimary && subjectKindFilter) {
    const owners = new Set<string>()
    for (const m of messages) {
      const ownerId = msgOwnerId.get(m)
      if (ownerId && subjectKindFilter(ownerId)) owners.add(ownerId)
    }
    if (owners.size === 1) effectivePrimary = [...owners][0]!
  }
  // ---- 主操作对象兜底：无 subject/类型线索时（如拖两点球半径点），
  // 取「被操作点作为角色点的所属对象」中实际生成了消息的第一个
  // （角色语义优先：球半径点 → 球；无角色字段时才落到立体构成点） ----
  if (!effectivePrimary) {
    const ordered = [...(intentObjectId ? [intentObjectId] : []), ...roleOwnerIdsOfPoint(operatedPointId)]
    const ownersWithMsg = new Set(msgOwnerId.values())
    effectivePrimary = ordered.find((oid) => ownersWithMsg.has(oid)) ?? null
  }
  // ---- 来源标注收敛：主操作对象明确时，清除旁及对象上的同款标注 ----
  // （如拖正多边形面时两点球仅连带变化，其消息不应显示「场景拖动面」）
  // 注意：移动类消息的来源标注落在 quote 字段（makeMessage 第 7 参），修改类落在 note 字段
  if (effectivePrimary && intent?.origin === 'scene' && intent.subject) {
    const subjectNote = `场景${isPointRoleSubject(intent.subject) ? '拖拽' : '拖动'}${intent.subject}`
    for (const [msg, ownerId] of msgOwnerId) {
      if (ownerId === effectivePrimary) continue
      if (msg.quote === subjectNote) msg.quote = null
      if (msg.note === subjectNote) msg.note = null
    }
  }
  // ---- 设计规则：一个操作只产生一条消息 ----
  // 主操作对象确定时，其余受连带影响的对象不再单独成条，而是作为「级联…」条目挂在主消息下方，
  // 并保留其属性变化（如「级联修改 正多边形1：边长 6.02→5.83」），用户据此了解本次操作的完整影响范围。
  // 边界：无法确定主操作对象时（多目标批量操作、无意图声明的旧命令）保持逐条输出，避免给出错误主语。
  if (effectivePrimary && messages.length > 1) {
    const mainMsg = messages.find((m) => msgOwnerId.get(m) === effectivePrimary)
    if (mainMsg) {
      const items: string[] = []
      const pushItem = (text: string) => {
        if (!text) return
        // 主消息既有级联（如随动派生的「级联移动 垂线N」）已在文本中则不重复
        if (mainMsg.cascade?.includes(text)) return
        if (!items.includes(text)) items.push(text)
      }
      for (const m of messages) {
        if (m === mainMsg) continue
        const paramText =
          m.params.length > 0
            ? '：' +
              m.params
                .map((p) =>
                  p.before && p.after
                    ? `${p.label} ${p.before}→${p.after}`
                    : p.before
                      ? `${p.label} ${p.before}`
                      : p.label,
                )
                .join('，')
            : ''
        const target = `${m.targetType ?? ''}${m.targetName ?? ''}`
        pushItem(`级联${m.action.replace(/了$/, '')} ${target}${paramText}`.trim())
        // 该被合并消息自身携带的级联结果（更深层连带）一并保留
        if (m.cascade) pushItem(m.cascade)
      }
      if (items.length > 0) {
        mainMsg.cascade = mainMsg.cascade ? `${mainMsg.cascade}、${items.join('、')}` : items.join('、')
      }
      messages.length = 0
      messages.push(mainMsg)
    }
  }

  // ---- 「我操作了什么」置顶：按主操作对象对消息做稳定重排 ----
  // 消息按视图顺序生成（只保证吸收/去重正确）；用户期望自己实际操作的几何对象排在最前。
  // 分档：0 = 主操作对象，1 = 本次操作涉及的其他对象，2 = 旁及（共点/共边连带）对象；
  // 档内保持原顺序（吸收/去重/级联的既有顺序不变）。
  // （聚合规则生效时仅剩一条消息，此步自然无影响；仅对未聚合的多目标场景生效）
  if (effectivePrimary || operatedIds.size > 0) {
    const rankOf = (m: CollabHistoryMessage): number => {
      const ownerId = msgOwnerId.get(m)
      if (!ownerId) return 2
      if (effectivePrimary && ownerId === effectivePrimary) return 0
      return operatedIds.has(ownerId) ? 1 : 2
    }
    const ranked = messages.map((m, index) => ({ m, rank: rankOf(m), index }))
    ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
    messages.length = 0
    for (const item of ranked) messages.push(item.m)
  }

  return messages
}

/**
 * 房间初始基线（首位成员加载关联项目）消息：系统消息、固定文案。
 * - 不带操作者昵称：项目导入由系统自动完成，不是某个用户的操作；
 * - 不做 diff 展开：该条目的 before/after 是「空场景 → 整份项目场景」，
 *   任何展开都会伪造成「创建了 N 个对象」，撤销/重做的引用同样固定为该文案。
 */
export function buildProjectImportMessage(createdAt: number = Date.now()): CollabHistoryMessage {
  return {
    ...makeMessage('import', '项目导入加载完成', { clientId: 0, userName: null, createdAt }, null, null, [], null),
    system: true,
  }
}

/**
 * 场景文件导入的方式短语（覆盖 / 合并）。
 * 依据条目 label 判定：'MergeImportScene' 为合并导入，其余（含历史条目 'ImportScene'）为覆盖导入。
 * label 随 Yjs 持久化，因此房间内所有成员、以及撤销/重做的引用都能得到一致文案。
 */
const sceneImportActionText = (label: string): string =>
  label === 'MergeImportScene' ? '合并导入了场景文件' : '覆盖导入了场景文件'

/**
 * 房间内导入场景文件：单条消息。
 * 导入会整体替换（覆盖）或在原场景上追加（合并），若按 before/after 做 diff 展开会刷出
 * 几十条「创建了/删除了…」，因此这里只产生一条带文件名（含后缀）的消息，
 * 并在动作短语中标注是覆盖导入还是合并导入；撤销/重做的引用也用同一文案。
 */
export function buildSceneFileImportMessage(
  fileName: string,
  actor: Actor,
  label = 'ImportScene',
): CollabHistoryMessage {
  return makeMessage('import', sceneImportActionText(label), actor, null, fileName, [], null)
}

/**
 * 房间内导出场景文件：单条通知消息。
 * 导出不改变场景，因此不产生历史条目（不占撤销步骤），只留一条消息供协作者知悉。
 */
export function buildSceneFileExportMessage(fileName: string, actor: Actor): CollabHistoryMessage {
  return makeMessage('export', '导出了场景文件', actor, null, fileName, [], null)
}

/** 撤销/重做消息：引用被撤销/重做的操作描述 */
export function buildUndoRedoMessage(
  entry: {
    before: SerializedScene
    after: SerializedScene
    label: string
    keepPointId?: string | null
    deleteTargetId?: string | null
    intent?: CollabOperationIntent | null
    /** 初始基线条目（项目导入）：引用文案固定为「项目导入加载完成」 */
    isBase?: boolean
    /** 场景文件导入：引用文案固定为「覆盖/合并导入了场景文件 xxx.json」 */
    sceneFileName?: string | null
  },
  actor: Actor,
  kind: 'undo' | 'redo',
): CollabHistoryMessage {
  const quote = buildOperationQuote(entry)
  return {
    id: crypto.randomUUID(),
    clientId: actor.clientId,
    userName: actor.userName,
    category: kind,
    action: kind === 'undo' ? '撤销了' : '重做了',
    targetType: null,
    targetName: null,
    params: [],
    quote,
    createdAt: actor.createdAt,
  }
}

/** 生成操作摘要文本（用于撤销/重做引用），如「创建了 球体1」 */
export function buildOperationQuote(entry: {
  before: SerializedScene
  after: SerializedScene
  label: string
  keepPointId?: string | null
  deleteTargetId?: string | null
  intent?: CollabOperationIntent | null
  /** 初始基线条目（项目导入）：引用文案固定，不做 diff 展开 */
  isBase?: boolean
  /** 场景文件导入：引用文案固定为「覆盖/合并导入了场景文件 xxx.json」，不做 diff 展开 */
  sceneFileName?: string | null
}): string {
  if (entry.isBase) return '项目导入加载完成'
  if (entry.sceneFileName) return `${sceneImportActionText(entry.label)} ${entry.sceneFileName}`
  const messages = buildMessagesFromHistoryEntry({
    actorClientId: 0,
    actorName: null,
    createdAt: 0,
    label: entry.label,
    before: entry.before,
    after: entry.after,
    keepPointId: entry.keepPointId ?? null,
    deleteTargetId: entry.deleteTargetId ?? null,
    intent: entry.intent ?? null,
  })
  if (messages.length === 0) return '场景操作'
  return messages
    .map((m) => {
      let text = m.action
      // 完整组成：动作 + 种类名称（种类与名称紧密相连：点N/三点圆c）
      if (m.targetName) text += ` ${m.targetType ?? ''}${m.targetName}`
      if (m.params.length > 0) {
        // 与消息正文一致：仅有 before 的参数（如合并的「吸收点 H」）也要带上值
        const paramText = m.params
          .map((p) => {
            if (p.before && p.after) return `${p.label} ${p.before}→${p.after}`
            if (p.before) return `${p.label} ${p.before}`
            return p.label
          })
          .join('，')
        text += `：${paramText}`
      }
      // 级联影响范围（如「级联删除 正六面体1」）并入引用文本：
      // 撤销/重做条目据此表达该操作实际影响（将恢复/移除）的对象范围，
      // 而非只显示「删除了 点L」让用户无从感知连带删除的几何对象
      if (m.cascade) text += `（${m.cascade}）`
      return text
    })
    .join('、')
}