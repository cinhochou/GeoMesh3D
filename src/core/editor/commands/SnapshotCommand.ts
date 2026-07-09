// src/core/editor/commands/SnapshotCommand.ts
import { Scene, type SceneConstraint } from '../../scene/Scene'
import { Point3, type ConstrainedToRef } from '../../geometry/Point3'
import { Line3, type FaceConstraintType } from '../../geometry/Line3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { Circle3, type CircleType, type DirectionType } from '../../geometry/Circle3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { Sphere3 } from '../../geometry/Sphere3'
import { Cone3, type ConeType } from '../../geometry/Cone3'
import { Cylinder3, type CylinderType } from '../../geometry/Cylinder3'
import { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../geometry/ParallelLine3'
import { Vec3 } from '../../geometry/Vec3'
import { CubeConstraint } from '../../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import { RegularPolygonConstraint } from '../../constraints/RegularPolygonConstraint'
import { PrismConstraint } from '../../constraints/PrismConstraint'
import { PyramidConstraint } from '../../constraints/PyramidConstraint'
import { PlanarPolygonConstraint } from '../../constraints/PlanarFaceConstraint'
import { CylinderConstraint } from '../../constraints/CylinderConstraint'
import { ObjectConstrainedPointConstraint, type ParametricData } from '../../constraints/ObjectConstrainedPointConstraint'
import { PerpendicularLineConstraint } from '../../constraints/PerpendicularLineConstraint'
import { ParallelLineConstraint } from '../../constraints/ParallelLineConstraint'
import type { HistoryEntry } from '../HistoryManager'
import type { IntersectionTargetRef } from '../../geometry/IntersectionPoint3'

const genId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// ─── 快照类型 ─────────────────────────────────────────────

type Vec3Snapshot = { x: number; y: number; z: number }

type PointSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  visible: boolean
  labelOffsetX: number
  labelOffsetY: number
  position: Vec3Snapshot
  locked: boolean
  userLocked: boolean
  cubeId: string | null
  cubeRole: 'owner' | 'dependent' | null
  circleId: string | null
  circleRole: 'center' | null
  regularPolygonId: string | null
  regularPolygonRole: 'owner' | 'dependent' | null
  sphereId: string | null
  sphereRole: 'center' | 'radius' | null
  coneId: string | null
  coneRole: 'baseCenter' | 'apex' | null
  cylinderId: string | null
  cylinderRole: 'bottomCenter' | 'topCenter' | null
  prismId: string | null
  prismRole: 'owner' | 'dependent' | null
  pyramidId: string | null
  pyramidRole: 'owner' | 'dependent' | null
  constrainedTo: { type: string; id: string } | null
}

type LineSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
  faceOwned: boolean
  faceConstraintType: FaceConstraintType | null
  p1Id: string
  p2Id: string
}

type StraightLineSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Id: string
  displayLength: number
}

type RaySnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Id: string
  displayLength: number
}

type VectorSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Id: string
}

type CircleSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerVisible: boolean
  p1Id: string
  p2Id: string
  p3Id: string
  circleType: CircleType
  directionType: DirectionType | null
  directionId: string | null
  lockedRadius: number | null
}

type FaceSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  fillColor: number | null
  fillOpacity: number | null
  cubeId: string | null
  cubeOwnerPointIds: string[]
  cubeDependentPointIds: string[]
  userLocked: boolean
  areaLocked: boolean
  lockedArea: number
  edgeLengthLocks: Array<number | null>
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
  isRegularPolygon: boolean
  regularPolygonVertexCount: number
  regularPolygonId: string | null
  regularPolygonOwnerPointIds: string[]
  regularPolygonDependentPointIds: string[]
  prismId: string | null
  prismOwnerPointIds: string[]
  prismDependentPointIds: string[]
  prismRole: 'bottom' | 'top' | 'side' | null
  pyramidId: string | null
  pyramidOwnerPointIds: string[]
  pyramidDependentPointIds: string[]
  pyramidRole: 'bottom' | 'side' | null
}

type SphereSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerPointId: string
  radiusPointId: string | null
  radiusValue: number
}

type ConeSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  baseCenterPointId: string
  apexPointId: string
  radiusValue: number
  coneType: ConeType
  normalCircleId: string | null
}

type CylinderSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  bottomCenterPointId: string
  topCenterPointId: string
  radiusValue: number
  cylinderType: CylinderType
  normalCircleId: string | null
  topNormalCircleId: string | null
}

type PerpendicularLineSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Position: Vec3Snapshot
  displayLength: number
  targetType: string
  targetId: string
}

type ParallelLineSnapshot = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Position: Vec3Snapshot
  displayLength: number
  targetType: string
  targetId: string
}

type ConstraintSnapshot =
  | { type: 'cube'; cubeId: string; solidType: 'hexahedron' | 'tetrahedron'; ownerPointIds: [string, string]; dependentLayouts: Array<{ pointId: string; x: number; y: number; z: number }>; faceIds: string[]; sourceLineId: string | null; vAxisHint: Vec3Snapshot; name: string; edgeLengthLocked: boolean; lockedEdgeLength: number | null; valueVisible: boolean }
  | { type: 'intersection'; pointId: string; sourceA: IntersectionTargetRef; sourceB: IntersectionTargetRef }
  | { type: 'regularPolygon'; constraintId: string; ownerPointIds: [string, string]; dependentLayouts: Array<{ pointId: string; angleIndex: number }>; faceId: string; vertexCount: number; vAxisHint: Vec3Snapshot; name: string; edgeLengthLocked: boolean; lockedEdgeLength: number | null; valueVisible: boolean }
  | { type: 'prism'; prismId: string; ownerPointIds: [string, string]; dependentLayouts: Array<{ pointId: string; baseIndex: number }>; bottomFaceId: string; topFaceId: string; sideFaceIds: string[]; baseReferenceIndex: number; vAxisHint: Vec3Snapshot; name: string; valueVisible: boolean }
  | { type: 'pyramid'; pyramidId: string; ownerPointIds: [string, string]; bottomFaceId: string; sideFaceIds: string[]; baseReferenceIndex: number; vAxisHint: Vec3Snapshot; name: string; valueVisible: boolean }
  | { type: 'planar'; faceId: string }
  | { type: 'cylinder'; cylinderId: string; bottomCircleId: string; topCircleId: string; name: string; valueVisible: boolean }
  | { type: 'objectConstrainedPoint'; pointId: string; targetType: ConstrainedToRef['type']; targetId: string; parametricData: ParametricData | null }
  | { type: 'perpendicularLine'; perpendicularLineId: string; targetType: string; targetId: string }
  | { type: 'parallelLine'; parallelLineId: string; targetType: string; targetId: string }

/**
 * 场景子图快照 — 只包含操作波及的元素。
 * 用于 SnapshotCommand 的 before/after 对比恢复。
 */
export type SceneSubgraphSnapshot = {
  points: PointSnapshot[]
  lines: LineSnapshot[]
  straightLines: StraightLineSnapshot[]
  rays: RaySnapshot[]
  vectors: VectorSnapshot[]
  circles: CircleSnapshot[]
  faces: FaceSnapshot[]
  spheres: SphereSnapshot[]
  cones: ConeSnapshot[]
  cylinders: CylinderSnapshot[]
  perpendicularLines: PerpendicularLineSnapshot[]
  parallelLines: ParallelLineSnapshot[]
  constraints: ConstraintSnapshot[]
}

// ─── 快照工具函数 ─────────────────────────────────────────

function snapVec3(v: Vec3): Vec3Snapshot {
  return { x: v.x, y: v.y, z: v.z }
}

function snapPoint(p: Point3): PointSnapshot {
  return {
    id: p.id,
    name: p.name,
    nameVisible: p.nameVisible,
    valueVisible: p.valueVisible,
    visible: p.visible,
    labelOffsetX: p.labelOffsetX,
    labelOffsetY: p.labelOffsetY,
    position: snapVec3(p.position),
    locked: p.locked,
    userLocked: p.userLocked,
    cubeId: p.cubeId,
    cubeRole: p.cubeRole,
    circleId: p.circleId,
    circleRole: p.circleRole,
    regularPolygonId: p.regularPolygonId,
    regularPolygonRole: p.regularPolygonRole,
    sphereId: p.sphereId,
    sphereRole: p.sphereRole,
    coneId: p.coneId,
    coneRole: p.coneRole,
    cylinderId: p.cylinderId,
    cylinderRole: p.cylinderRole,
    prismId: p.prismId,
    prismRole: p.prismRole,
    pyramidId: p.pyramidId,
    pyramidRole: p.pyramidRole,
    constrainedTo: p.constrainedTo,
  }
}

function snapLine(l: Line3): LineSnapshot {
  return {
    id: l.id, name: l.name, nameVisible: l.nameVisible, valueVisible: l.valueVisible,
    labelOffsetX: l.labelOffsetX, labelOffsetY: l.labelOffsetY,
    visible: l.visible, userLocked: l.userLocked, lengthLocked: l.lengthLocked,
    lockedLength: l.lockedLength, faceOwned: l.faceOwned,
    faceConstraintType: l.faceConstraintType, p1Id: l.p1.id, p2Id: l.p2.id,
  }
}

function snapStraightLine(l: StraightLine3): StraightLineSnapshot {
  return {
    id: l.id, name: l.name, nameVisible: l.nameVisible, valueVisible: l.valueVisible,
    labelOffsetX: l.labelOffsetX, labelOffsetY: l.labelOffsetY,
    visible: l.visible, userLocked: l.userLocked, p1Id: l.p1.id, p2Id: l.p2.id,
    displayLength: l.displayLength,
  }
}

function snapRay(r: Ray3): RaySnapshot {
  return {
    id: r.id, name: r.name, nameVisible: r.nameVisible, valueVisible: r.valueVisible,
    labelOffsetX: r.labelOffsetX, labelOffsetY: r.labelOffsetY,
    visible: r.visible, userLocked: r.userLocked, p1Id: r.p1.id, p2Id: r.p2.id,
    displayLength: r.displayLength,
  }
}

function snapVector(v: GeoVector3): VectorSnapshot {
  return {
    id: v.id, name: v.name, nameVisible: v.nameVisible, valueVisible: v.valueVisible,
    labelOffsetX: v.labelOffsetX, labelOffsetY: v.labelOffsetY,
    visible: v.visible, userLocked: v.userLocked, p1Id: v.p1.id, p2Id: v.p2.id,
  }
}

function snapCircle(c: Circle3): CircleSnapshot {
  return {
    id: c.id, name: c.name, nameVisible: c.nameVisible, valueVisible: c.valueVisible,
    labelOffsetX: c.labelOffsetX, labelOffsetY: c.labelOffsetY,
    visible: c.visible, userLocked: c.userLocked, centerVisible: c.centerVisible,
    p1Id: c.p1.id, p2Id: c.p2.id, p3Id: c.p3.id,
    circleType: c.circleType, directionType: c.directionType,
    directionId: c.directionId, lockedRadius: c.lockedRadius,
  }
}

function snapFace(f: PlanarPolygon): FaceSnapshot {
  return {
    id: f.id, name: f.name, nameVisible: f.nameVisible, valueVisible: f.valueVisible,
    labelOffsetX: f.labelOffsetX, labelOffsetY: f.labelOffsetY,
    visible: f.visible, fillColor: f.fillColor, fillOpacity: f.fillOpacity,
    cubeId: f.cubeId, cubeOwnerPointIds: [...f.cubeOwnerPointIds],
    cubeDependentPointIds: [...f.cubeDependentPointIds],
    userLocked: f.userLocked, areaLocked: f.areaLocked, lockedArea: f.lockedArea,
    edgeLengthLocks: [...f.edgeLengthLocks],
    boundaryPointIds: [...f.boundaryPointIds], memberPointIds: [...f.memberPointIds],
    boundaryLineIds: [...f.boundaryLineIds], supportPointIds: [...f.supportPointIds],
    isRegularPolygon: f.isRegularPolygon, regularPolygonVertexCount: f.regularPolygonVertexCount,
    regularPolygonId: f.regularPolygonId,
    regularPolygonOwnerPointIds: [...f.regularPolygonOwnerPointIds],
    regularPolygonDependentPointIds: [...f.regularPolygonDependentPointIds],
    prismId: f.prismId,
    prismOwnerPointIds: [...f.prismOwnerPointIds],
    prismDependentPointIds: [...f.prismDependentPointIds],
    prismRole: f.prismRole,
    pyramidId: f.pyramidId,
    pyramidOwnerPointIds: [...f.pyramidOwnerPointIds],
    pyramidDependentPointIds: [...f.pyramidDependentPointIds],
    pyramidRole: f.pyramidRole,
  }
}

function snapSphere(s: Sphere3): SphereSnapshot {
  return {
    id: s.id, name: s.name, nameVisible: s.nameVisible, valueVisible: s.valueVisible,
    labelOffsetX: s.labelOffsetX, labelOffsetY: s.labelOffsetY,
    visible: s.visible, userLocked: s.userLocked,
    centerPointId: s.centerPoint.id, radiusPointId: s.radiusPoint?.id ?? null,
    radiusValue: s.radiusValue,
  }
}

function snapCone(c: Cone3): ConeSnapshot {
  return {
    id: c.id, name: c.name, nameVisible: c.nameVisible, valueVisible: c.valueVisible,
    labelOffsetX: c.labelOffsetX, labelOffsetY: c.labelOffsetY,
    visible: c.visible, userLocked: c.userLocked,
    baseCenterPointId: c.baseCenterPoint.id, apexPointId: c.apexPoint.id,
    radiusValue: c.radiusValue, coneType: c.coneType, normalCircleId: c.normalCircleId,
  }
}

function snapCylinder(c: Cylinder3): CylinderSnapshot {
  return {
    id: c.id, name: c.name, nameVisible: c.nameVisible, valueVisible: c.valueVisible,
    labelOffsetX: c.labelOffsetX, labelOffsetY: c.labelOffsetY,
    visible: c.visible, userLocked: c.userLocked,
    bottomCenterPointId: c.bottomCenterPoint.id, topCenterPointId: c.topCenterPoint.id,
    radiusValue: c.radiusValue, cylinderType: c.cylinderType,
    normalCircleId: c.normalCircleId, topNormalCircleId: c.topNormalCircleId,
  }
}

function snapPerpendicularLine(l: PerpendicularLine3): PerpendicularLineSnapshot {
  return {
    id: l.id, name: l.name, nameVisible: l.nameVisible, valueVisible: l.valueVisible,
    labelOffsetX: l.labelOffsetX, labelOffsetY: l.labelOffsetY,
    visible: l.visible, userLocked: l.userLocked, p1Id: l.p1.id,
    p2Position: snapVec3(l.p2.position), displayLength: l.displayLength,
    targetType: l.target.type, targetId: l.target.id,
  }
}

function snapParallelLine(l: ParallelLine3): ParallelLineSnapshot {
  return {
    id: l.id, name: l.name, nameVisible: l.nameVisible, valueVisible: l.valueVisible,
    labelOffsetX: l.labelOffsetX, labelOffsetY: l.labelOffsetY,
    visible: l.visible, userLocked: l.userLocked, p1Id: l.p1.id,
    p2Position: snapVec3(l.p2.position), displayLength: l.displayLength,
    targetType: l.target.type, targetId: l.target.id,
  }
}

function snapConstraint(c: SceneConstraint): ConstraintSnapshot | null {
  if (c instanceof CubeConstraint) {
    return {
      type: 'cube', cubeId: c.cubeId, solidType: c.solidType,
      ownerPointIds: [...c.ownerPointIds] as [string, string],
      dependentLayouts: c.dependentLayouts.map((l) => ({ pointId: l.pointId, x: l.x, y: l.y, z: l.z })),
      faceIds: [...c.faceIds], sourceLineId: c.sourceLineId,
      vAxisHint: snapVec3(c.getVAxisHint()), name: c.name,
      edgeLengthLocked: c.edgeLengthLocked, lockedEdgeLength: c.lockedEdgeLength,
      valueVisible: c.valueVisible,
    }
  }
  if (c instanceof IntersectionPointConstraint) {
    return { type: 'intersection', pointId: c.pointId, sourceA: c.sourceA, sourceB: c.sourceB }
  }
  if (c instanceof RegularPolygonConstraint) {
    return {
      type: 'regularPolygon', constraintId: c.constraintId,
      ownerPointIds: [...c.ownerPointIds] as [string, string],
      dependentLayouts: c.dependentLayouts.map((l) => ({ pointId: l.pointId, angleIndex: l.angleIndex })),
      faceId: c.faceId, vertexCount: c.vertexCount,
      vAxisHint: snapVec3(c.getVAxisHint()), name: c.name,
      edgeLengthLocked: c.edgeLengthLocked, lockedEdgeLength: c.lockedEdgeLength,
      valueVisible: c.valueVisible,
    }
  }
  if (c instanceof PrismConstraint) {
    return {
      type: 'prism', prismId: c.prismId,
      ownerPointIds: [...c.ownerPointIds] as [string, string],
      dependentLayouts: c.dependentLayouts.map((l) => ({ pointId: l.pointId, baseIndex: l.baseIndex })),
      bottomFaceId: c.bottomFaceId, topFaceId: c.topFaceId,
      sideFaceIds: [...c.sideFaceIds], baseReferenceIndex: c.baseReferenceIndex,
      vAxisHint: snapVec3(c.getVAxisHint()), name: c.name,
      valueVisible: c.valueVisible,
    }
  }
  if (c instanceof PyramidConstraint) {
    return {
      type: 'pyramid', pyramidId: c.pyramidId,
      ownerPointIds: [c.ownerPointIds[0], c.ownerPointIds[1]],
      bottomFaceId: c.bottomFaceId,
      sideFaceIds: [...c.sideFaceIds], baseReferenceIndex: c.baseReferenceIndex,
      vAxisHint: { x: c.getVAxisHint().x, y: c.getVAxisHint().y, z: c.getVAxisHint().z },
      name: c.name, valueVisible: c.valueVisible,
    }
  }
  if (c instanceof PlanarPolygonConstraint) {
    return { type: 'planar', faceId: c.faceId }
  }
  if (c instanceof CylinderConstraint) {
    return { type: 'cylinder', cylinderId: c.cylinderId, bottomCircleId: c.bottomCircleId, topCircleId: c.topCircleId, name: c.name, valueVisible: c.valueVisible }
  }
  if (c instanceof ObjectConstrainedPointConstraint) {
    return { type: 'objectConstrainedPoint', pointId: c.pointId, targetType: c.target.type, targetId: c.target.id, parametricData: c.parametricData ? JSON.parse(JSON.stringify(c.parametricData)) : null }
  }
  if (c instanceof PerpendicularLineConstraint) {
    return { type: 'perpendicularLine', perpendicularLineId: c.perpendicularLineId, targetType: c.target.type, targetId: c.target.id }
  }
  if (c instanceof ParallelLineConstraint) {
    return { type: 'parallelLine', parallelLineId: c.parallelLineId, targetType: c.target.type, targetId: c.target.id }
  }
  return null
}

/**
 * 对整个场景做全量快照。
 */
export function takeFullSnapshot(scene: Scene): SceneSubgraphSnapshot {
  return {
    points: [...scene.points.values()].map(snapPoint),
    lines: [...scene.lines.values()].map(snapLine),
    straightLines: [...scene.straightLines.values()].map(snapStraightLine),
    rays: [...scene.rays.values()].map(snapRay),
    vectors: [...scene.vectors.values()].map(snapVector),
    circles: [...scene.circles.values()].map(snapCircle),
    faces: [...scene.faces.values()].map(snapFace),
    spheres: [...scene.spheres.values()].map(snapSphere),
    cones: [...scene.cones.values()].map(snapCone),
    cylinders: [...scene.cylinders.values()].map(snapCylinder),
    perpendicularLines: [...scene.perpendicularLines.values()].map(snapPerpendicularLine),
    parallelLines: [...scene.parallelLines.values()].map(snapParallelLine),
    constraints: scene.constraints.map(snapConstraint).filter((c): c is ConstraintSnapshot => c !== null),
  }
}

// ─── 从快照恢复（就地更新模式，保留对象身份） ─────────────

/**
 * 从快照恢复场景状态。
 * 采用就地更新模式：对已存在的对象更新属性（保留对象身份），
 * 对新增的对象创建，对多余的对象删除。
 * 这确保了其他 HistoryEntry（如 TransformCommand）持有的直接引用不会失效。
 */
export function restoreFromSnapshot(scene: Scene, snapshot: SceneSubgraphSnapshot): void {
  // 抑制约束脏标记，避免中间状态（几何体已更新但约束尚未重建）触发无效求解
  scene.beginSnapshotRestore()

  scene.selection.clear()

  // ─── 1. Points：就地更新，保留对象身份 ───
  const snapshotPointIds = new Set<string>()
  for (const sp of snapshot.points) {
    snapshotPointIds.add(sp.id)
    const existing = scene.points.get(sp.id)
    if (existing) {
      // 就地更新 — 保留对象身份，其他命令持有的引用仍然有效
      existing.name = sp.name
      existing.nameVisible = sp.nameVisible
      existing.valueVisible = sp.valueVisible
      existing.visible = sp.visible ?? true
      // 同步圆心点的 visible 到圆的 centerVisible
      if (existing.circleRole === 'center' && existing.circleId) {
        const circle = scene.circles.get(existing.circleId)
        if (circle) {
          circle.centerVisible = sp.visible ?? true
        }
      }
      existing.labelOffsetX = sp.labelOffsetX
      existing.labelOffsetY = sp.labelOffsetY
      existing.forceSetPosition(new Vec3(sp.position.x, sp.position.y, sp.position.z))
      existing.locked = sp.locked
      existing.userLocked = sp.userLocked
      existing.cubeId = sp.cubeId
      existing.cubeRole = sp.cubeRole
      existing.circleId = sp.circleId
      existing.circleRole = sp.circleRole
      existing.regularPolygonId = sp.regularPolygonId
      existing.regularPolygonRole = sp.regularPolygonRole
      existing.sphereId = sp.sphereId
      existing.sphereRole = sp.sphereRole
      existing.coneId = sp.coneId
      existing.coneRole = sp.coneRole
      existing.cylinderId = sp.cylinderId
      existing.cylinderRole = sp.cylinderRole
      existing.prismId = sp.prismId
      existing.prismRole = sp.prismRole
      existing.pyramidId = sp.pyramidId
      existing.pyramidRole = sp.pyramidRole
      existing.constrainedTo = (sp.constrainedTo as ConstrainedToRef | null) ?? null
    } else {
      // 场景中不存在，创建新点
      const p = new Point3(sp.id, sp.name, new Vec3(sp.position.x, sp.position.y, sp.position.z), sp.locked, sp.nameVisible, sp.userLocked, sp.labelOffsetX, sp.labelOffsetY, sp.valueVisible, sp.visible ?? true)
      p.cubeId = sp.cubeId; p.cubeRole = sp.cubeRole
      p.circleId = sp.circleId; p.circleRole = sp.circleRole
      p.regularPolygonId = sp.regularPolygonId; p.regularPolygonRole = sp.regularPolygonRole
      p.sphereId = sp.sphereId; p.sphereRole = sp.sphereRole
      p.coneId = sp.coneId; p.coneRole = sp.coneRole
      p.cylinderId = sp.cylinderId; p.cylinderRole = sp.cylinderRole
      p.prismId = sp.prismId; p.prismRole = sp.prismRole
      p.pyramidId = sp.pyramidId; p.pyramidRole = sp.pyramidRole
      p.constrainedTo = (sp.constrainedTo as ConstrainedToRef | null) ?? null
      scene.addPoint(p)
    }
  }
  // 删除场景中存在但快照中不存在的点
  for (const id of [...scene.points.keys()]) {
    if (!snapshotPointIds.has(id)) {
      const p = scene.points.get(id)!
      p.onPositionChanged = null
      scene.points.delete(id)
    }
  }

  // ─── 2. Lines：就地更新 ───
  const snapshotLineIds = new Set<string>()
  for (const sl of snapshot.lines) {
    snapshotLineIds.add(sl.id)
    const existing = scene.lines.get(sl.id)
    if (existing) {
      existing.name = sl.name
      existing.nameVisible = sl.nameVisible
      existing.valueVisible = sl.valueVisible
      existing.labelOffsetX = sl.labelOffsetX
      existing.labelOffsetY = sl.labelOffsetY
      existing.visible = sl.visible
      existing.userLocked = sl.userLocked
      existing.lengthLocked = sl.lengthLocked
      existing.lockedLength = sl.lockedLength
      existing.faceOwned = sl.faceOwned
      existing.faceConstraintType = sl.faceConstraintType
      if (existing.p1.id !== sl.p1Id) { const p1 = scene.points.get(sl.p1Id); if (p1) existing.p1 = p1 }
      if (existing.p2.id !== sl.p2Id) { const p2 = scene.points.get(sl.p2Id); if (p2) existing.p2 = p2 }
    } else {
      const p1 = scene.points.get(sl.p1Id)
      const p2 = scene.points.get(sl.p2Id)
      if (!p1 || !p2) continue
      const l = new Line3(sl.id, sl.name, p1, p2, sl.nameVisible, sl.visible, sl.lengthLocked, sl.lockedLength, sl.userLocked, sl.labelOffsetX, sl.labelOffsetY, sl.valueVisible)
      l.faceOwned = sl.faceOwned; l.faceConstraintType = sl.faceConstraintType
      scene.addLine(l)
    }
  }
  for (const id of [...scene.lines.keys()]) {
    if (!snapshotLineIds.has(id)) scene.lines.delete(id)
  }

  // ─── 3. StraightLines：就地更新 ───
  const snapshotStraightLineIds = new Set<string>()
  for (const sl of snapshot.straightLines) {
    snapshotStraightLineIds.add(sl.id)
    const existing = scene.straightLines.get(sl.id)
    if (existing) {
      existing.name = sl.name
      existing.nameVisible = sl.nameVisible
      existing.valueVisible = sl.valueVisible
      existing.labelOffsetX = sl.labelOffsetX
      existing.labelOffsetY = sl.labelOffsetY
      existing.visible = sl.visible
      existing.userLocked = sl.userLocked
      existing.displayLength = sl.displayLength
      if (existing.p1.id !== sl.p1Id) { const p1 = scene.points.get(sl.p1Id); if (p1) existing.p1 = p1 }
      if (existing.p2.id !== sl.p2Id) { const p2 = scene.points.get(sl.p2Id); if (p2) existing.p2 = p2 }
    } else {
      const p1 = scene.points.get(sl.p1Id)
      const p2 = scene.points.get(sl.p2Id)
      if (!p1 || !p2) continue
      scene.addStraightLine(new StraightLine3(sl.id, sl.name, p1, p2, sl.nameVisible, sl.visible, sl.displayLength, sl.userLocked, sl.labelOffsetX, sl.labelOffsetY, sl.valueVisible))
    }
  }
  for (const id of [...scene.straightLines.keys()]) {
    if (!snapshotStraightLineIds.has(id)) scene.straightLines.delete(id)
  }

  // ─── 4. Rays：就地更新 ───
  const snapshotRayIds = new Set<string>()
  for (const sr of snapshot.rays) {
    snapshotRayIds.add(sr.id)
    const existing = scene.rays.get(sr.id)
    if (existing) {
      existing.name = sr.name
      existing.nameVisible = sr.nameVisible
      existing.valueVisible = sr.valueVisible
      existing.labelOffsetX = sr.labelOffsetX
      existing.labelOffsetY = sr.labelOffsetY
      existing.visible = sr.visible
      existing.userLocked = sr.userLocked
      existing.displayLength = sr.displayLength
      if (existing.p1.id !== sr.p1Id) { const p1 = scene.points.get(sr.p1Id); if (p1) existing.p1 = p1 }
      if (existing.p2.id !== sr.p2Id) { const p2 = scene.points.get(sr.p2Id); if (p2) existing.p2 = p2 }
    } else {
      const p1 = scene.points.get(sr.p1Id)
      const p2 = scene.points.get(sr.p2Id)
      if (!p1 || !p2) continue
      scene.addRay(new Ray3(sr.id, sr.name, p1, p2, sr.nameVisible, sr.visible, sr.displayLength, sr.userLocked, sr.labelOffsetX, sr.labelOffsetY, sr.valueVisible))
    }
  }
  for (const id of [...scene.rays.keys()]) {
    if (!snapshotRayIds.has(id)) scene.rays.delete(id)
  }

  // ─── 5. Vectors：就地更新 ───
  const snapshotVectorIds = new Set<string>()
  for (const sv of snapshot.vectors) {
    snapshotVectorIds.add(sv.id)
    const existing = scene.vectors.get(sv.id)
    if (existing) {
      existing.name = sv.name
      existing.nameVisible = sv.nameVisible
      existing.valueVisible = sv.valueVisible
      existing.labelOffsetX = sv.labelOffsetX
      existing.labelOffsetY = sv.labelOffsetY
      existing.visible = sv.visible
      existing.userLocked = sv.userLocked
      if (existing.p1.id !== sv.p1Id) { const p1 = scene.points.get(sv.p1Id); if (p1) existing.p1 = p1 }
      if (existing.p2.id !== sv.p2Id) { const p2 = scene.points.get(sv.p2Id); if (p2) existing.p2 = p2 }
    } else {
      const p1 = scene.points.get(sv.p1Id)
      const p2 = scene.points.get(sv.p2Id)
      if (!p1 || !p2) continue
      scene.addVector(new GeoVector3(sv.id, sv.name, p1, p2, sv.nameVisible, sv.visible, sv.userLocked, sv.labelOffsetX, sv.labelOffsetY, sv.valueVisible))
    }
  }
  for (const id of [...scene.vectors.keys()]) {
    if (!snapshotVectorIds.has(id)) scene.vectors.delete(id)
  }

  // ─── 6. Circles：就地更新 ───
  const snapshotCircleIds = new Set<string>()
  for (const sc of snapshot.circles) {
    snapshotCircleIds.add(sc.id)
    const existing = scene.circles.get(sc.id)
    if (existing) {
      existing.name = sc.name
      existing.nameVisible = sc.nameVisible
      existing.valueVisible = sc.valueVisible
      existing.labelOffsetX = sc.labelOffsetX
      existing.labelOffsetY = sc.labelOffsetY
      existing.visible = sc.visible
      existing.userLocked = sc.userLocked
      existing.centerVisible = sc.centerVisible
      // 同步圆心点的 visible 属性
      if (existing.isNormalCircle()) {
        if (existing.p1.circleRole === 'center' && existing.p1.circleId === existing.id) {
          existing.p1.visible = sc.centerVisible
        }
      } else {
        for (const pt of scene.points.values()) {
          if (pt.circleRole === 'center' && pt.circleId === existing.id) {
            pt.visible = sc.centerVisible
            break
          }
        }
      }
      existing.circleType = sc.circleType
      existing.directionType = sc.directionType
      existing.directionId = sc.directionId
      existing.lockedRadius = sc.lockedRadius
      if (existing.p1.id !== sc.p1Id) { const p1 = scene.points.get(sc.p1Id); if (p1) existing.p1 = p1 }
      if (existing.p2.id !== sc.p2Id) { const p2 = scene.points.get(sc.p2Id); if (p2) existing.p2 = p2 }
      if (existing.p3.id !== sc.p3Id) { const p3 = scene.points.get(sc.p3Id); if (p3) existing.p3 = p3 }
    } else {
      const p1 = scene.points.get(sc.p1Id)
      const p2 = scene.points.get(sc.p2Id)
      const p3 = scene.points.get(sc.p3Id)
      if (!p1 || !p2 || !p3) continue
      scene.addCircle(new Circle3(sc.id, sc.name, p1, p2, p3, sc.nameVisible, sc.visible, sc.userLocked, sc.labelOffsetX, sc.labelOffsetY, sc.valueVisible, sc.centerVisible, sc.circleType, sc.directionType, sc.directionId, sc.lockedRadius))
    }
  }
  for (const id of [...scene.circles.keys()]) {
    if (!snapshotCircleIds.has(id)) scene.circles.delete(id)
  }

  // ─── 7. Faces：就地更新 ───
  const snapshotFaceIds = new Set<string>()
  for (const sf of snapshot.faces) {
    snapshotFaceIds.add(sf.id)
    const existing = scene.faces.get(sf.id)
    if (existing) {
      existing.name = sf.name
      existing.nameVisible = sf.nameVisible
      existing.valueVisible = sf.valueVisible
      existing.labelOffsetX = sf.labelOffsetX
      existing.labelOffsetY = sf.labelOffsetY
      existing.visible = sf.visible
      existing.fillColor = sf.fillColor
      existing.fillOpacity = sf.fillOpacity
      existing.cubeId = sf.cubeId
      existing.cubeOwnerPointIds = [...sf.cubeOwnerPointIds]
      existing.cubeDependentPointIds = [...sf.cubeDependentPointIds]
      existing.userLocked = sf.userLocked
      existing.areaLocked = sf.areaLocked
      existing.lockedArea = sf.lockedArea
      existing.edgeLengthLocks = [...sf.edgeLengthLocks]
      existing.boundaryPointIds = [...sf.boundaryPointIds]
      existing.memberPointIds = [...sf.memberPointIds]
      existing.boundaryLineIds = [...sf.boundaryLineIds]
      existing.supportPointIds = [...sf.supportPointIds]
      existing.isRegularPolygon = sf.isRegularPolygon
      existing.regularPolygonVertexCount = sf.regularPolygonVertexCount
      existing.regularPolygonId = sf.regularPolygonId
      existing.regularPolygonOwnerPointIds = [...sf.regularPolygonOwnerPointIds]
      existing.regularPolygonDependentPointIds = [...sf.regularPolygonDependentPointIds]
      existing.prismId = sf.prismId
      existing.prismOwnerPointIds = [...sf.prismOwnerPointIds]
      existing.prismDependentPointIds = [...sf.prismDependentPointIds]
      existing.prismRole = sf.prismRole
      existing.pyramidId = sf.pyramidId
      existing.pyramidOwnerPointIds = [...sf.pyramidOwnerPointIds]
      existing.pyramidDependentPointIds = [...sf.pyramidDependentPointIds]
      existing.pyramidRole = sf.pyramidRole
      existing.normalize(scene.points)
    } else {
      const f = new PlanarPolygon(sf.id, sf.name, sf.boundaryPointIds, sf.memberPointIds, sf.boundaryLineIds, sf.nameVisible, sf.visible, sf.userLocked, sf.supportPointIds, sf.areaLocked, sf.lockedArea, sf.edgeLengthLocks, sf.labelOffsetX, sf.labelOffsetY, sf.valueVisible, sf.isRegularPolygon, sf.regularPolygonVertexCount)
      f.fillColor = sf.fillColor; f.fillOpacity = sf.fillOpacity
      f.cubeId = sf.cubeId; f.cubeOwnerPointIds = sf.cubeOwnerPointIds; f.cubeDependentPointIds = sf.cubeDependentPointIds
      f.regularPolygonId = sf.regularPolygonId; f.regularPolygonOwnerPointIds = sf.regularPolygonOwnerPointIds; f.regularPolygonDependentPointIds = sf.regularPolygonDependentPointIds
      f.prismId = sf.prismId; f.prismOwnerPointIds = sf.prismOwnerPointIds; f.prismDependentPointIds = sf.prismDependentPointIds; f.prismRole = sf.prismRole
      f.pyramidId = sf.pyramidId; f.pyramidOwnerPointIds = sf.pyramidOwnerPointIds; f.pyramidDependentPointIds = sf.pyramidDependentPointIds; f.pyramidRole = sf.pyramidRole
      scene.addFace(f)
    }
  }
  for (const id of [...scene.faces.keys()]) {
    if (!snapshotFaceIds.has(id)) {
      scene.removeFace(id)
    }
  }

  // ─── 8. Spheres：就地更新 ───
  const snapshotSphereIds = new Set<string>()
  for (const ss of snapshot.spheres) {
    snapshotSphereIds.add(ss.id)
    const existing = scene.spheres.get(ss.id)
    if (existing) {
      existing.name = ss.name
      existing.nameVisible = ss.nameVisible
      existing.valueVisible = ss.valueVisible
      existing.labelOffsetX = ss.labelOffsetX
      existing.labelOffsetY = ss.labelOffsetY
      existing.visible = ss.visible
      existing.userLocked = ss.userLocked
      existing.radiusValue = ss.radiusValue
      if (existing.centerPoint.id !== ss.centerPointId) {
        const cp = scene.points.get(ss.centerPointId); if (cp) existing.centerPoint = cp
      }
      const newRadiusPointId = ss.radiusPointId ?? ''
      const curRadiusPointId = existing.radiusPoint?.id ?? ''
      if (newRadiusPointId !== curRadiusPointId) {
        existing.radiusPoint = ss.radiusPointId ? scene.points.get(ss.radiusPointId) ?? null : null
      }
    } else {
      const centerPoint = scene.points.get(ss.centerPointId)
      const radiusPoint = ss.radiusPointId ? scene.points.get(ss.radiusPointId) ?? null : null
      if (!centerPoint) continue
      scene.addSphere(new Sphere3(ss.id, ss.name, centerPoint, radiusPoint, ss.nameVisible, ss.visible, ss.userLocked, ss.labelOffsetX, ss.labelOffsetY, ss.valueVisible, ss.radiusValue))
    }
  }
  for (const id of [...scene.spheres.keys()]) {
    if (!snapshotSphereIds.has(id)) scene.removeSphere(id)
  }

  // ─── 9. Cones：就地更新 ───
  const snapshotConeIds = new Set<string>()
  for (const sc of snapshot.cones) {
    snapshotConeIds.add(sc.id)
    const existing = scene.cones.get(sc.id)
    if (existing) {
      existing.name = sc.name
      existing.nameVisible = sc.nameVisible
      existing.valueVisible = sc.valueVisible
      existing.labelOffsetX = sc.labelOffsetX
      existing.labelOffsetY = sc.labelOffsetY
      existing.visible = sc.visible
      existing.userLocked = sc.userLocked
      existing.radiusValue = sc.radiusValue
      existing.coneType = sc.coneType
      existing.normalCircleId = sc.normalCircleId
      if (existing.baseCenterPoint.id !== sc.baseCenterPointId) {
        const p = scene.points.get(sc.baseCenterPointId); if (p) existing.baseCenterPoint = p
      }
      if (existing.apexPoint.id !== sc.apexPointId) {
        const p = scene.points.get(sc.apexPointId); if (p) existing.apexPoint = p
      }
    } else {
      const baseCenterPoint = scene.points.get(sc.baseCenterPointId)
      const apexPoint = scene.points.get(sc.apexPointId)
      if (!baseCenterPoint || !apexPoint) continue
      scene.addCone(new Cone3(sc.id, sc.name, baseCenterPoint, apexPoint, sc.coneType, sc.nameVisible, sc.visible, sc.userLocked, sc.labelOffsetX, sc.labelOffsetY, sc.valueVisible, sc.radiusValue, sc.normalCircleId))
    }
  }
  for (const id of [...scene.cones.keys()]) {
    if (!snapshotConeIds.has(id)) scene.removeCone(id)
  }

  // ─── 10. Cylinders：就地更新 ───
  const snapshotCylinderIds = new Set<string>()
  for (const sc of snapshot.cylinders) {
    snapshotCylinderIds.add(sc.id)
    const existing = scene.cylinders.get(sc.id)
    if (existing) {
      existing.name = sc.name
      existing.nameVisible = sc.nameVisible
      existing.valueVisible = sc.valueVisible
      existing.labelOffsetX = sc.labelOffsetX
      existing.labelOffsetY = sc.labelOffsetY
      existing.visible = sc.visible
      existing.userLocked = sc.userLocked
      existing.radiusValue = sc.radiusValue
      existing.cylinderType = sc.cylinderType
      existing.normalCircleId = sc.normalCircleId
      existing.topNormalCircleId = sc.topNormalCircleId
      if (existing.bottomCenterPoint.id !== sc.bottomCenterPointId) {
        const p = scene.points.get(sc.bottomCenterPointId)
        if (p) { existing.bottomCenterPoint = p; p.cylinderId = sc.id; p.cylinderRole = 'bottomCenter' }
      }
      if (existing.topCenterPoint.id !== sc.topCenterPointId) {
        const p = scene.points.get(sc.topCenterPointId)
        if (p) { existing.topCenterPoint = p; p.cylinderId = sc.id; p.cylinderRole = 'topCenter' }
      }
    } else {
      const bottomCenterPoint = scene.points.get(sc.bottomCenterPointId)
      const topCenterPoint = scene.points.get(sc.topCenterPointId)
      if (!bottomCenterPoint || !topCenterPoint) continue
      const c = new Cylinder3(sc.id, sc.name, bottomCenterPoint, topCenterPoint, sc.cylinderType, sc.nameVisible, sc.visible, sc.userLocked, sc.labelOffsetX, sc.labelOffsetY, sc.valueVisible, sc.radiusValue, sc.normalCircleId, sc.topNormalCircleId)
      scene.addCylinder(c)
      bottomCenterPoint.cylinderId = c.id; bottomCenterPoint.cylinderRole = 'bottomCenter'
      topCenterPoint.cylinderId = c.id; topCenterPoint.cylinderRole = 'topCenter'
    }
  }
  for (const id of [...scene.cylinders.keys()]) {
    if (!snapshotCylinderIds.has(id)) scene.removeCylinder(id)
  }

  // ─── 11. PerpendicularLines：就地更新 ───
  const snapshotPerpLineIds = new Set<string>()
  for (const sl of snapshot.perpendicularLines) {
    snapshotPerpLineIds.add(sl.id)
    const existing = scene.perpendicularLines.get(sl.id)
    if (existing) {
      existing.name = sl.name
      existing.nameVisible = sl.nameVisible
      existing.valueVisible = sl.valueVisible
      existing.labelOffsetX = sl.labelOffsetX
      existing.labelOffsetY = sl.labelOffsetY
      existing.visible = sl.visible
      existing.userLocked = sl.userLocked
      existing.displayLength = sl.displayLength
      existing.target = { type: sl.targetType as PerpendicularLine3['target']['type'], id: sl.targetId }
      if (existing.p1.id !== sl.p1Id) { const p1 = scene.points.get(sl.p1Id); if (p1) existing.p1 = p1 }
      // 就地更新内部 p2 的位置，保留对象身份
      existing.p2.forceSetPosition(new Vec3(sl.p2Position.x, sl.p2Position.y, sl.p2Position.z))
    } else {
      const p1 = scene.points.get(sl.p1Id)
      if (!p1) continue
      const p2 = new Point3(`${sl.id}_p2`, '', new Vec3(sl.p2Position.x, sl.p2Position.y, sl.p2Position.z), false, false, false)
      scene.addPerpendicularLine(new PerpendicularLine3(sl.id, sl.name, p1, p2, { type: sl.targetType as PerpendicularLine3['target']['type'], id: sl.targetId }, sl.nameVisible, sl.visible, sl.displayLength, sl.userLocked, sl.labelOffsetX, sl.labelOffsetY, sl.valueVisible))
    }
  }
  for (const id of [...scene.perpendicularLines.keys()]) {
    if (!snapshotPerpLineIds.has(id)) scene.removePerpendicularLine(id)
  }

  // ─── 12. ParallelLines：就地更新 ───
  const snapshotParallelLineIds = new Set<string>()
  for (const sl of snapshot.parallelLines) {
    snapshotParallelLineIds.add(sl.id)
    const existing = scene.parallelLines.get(sl.id)
    if (existing) {
      existing.name = sl.name
      existing.nameVisible = sl.nameVisible
      existing.valueVisible = sl.valueVisible
      existing.labelOffsetX = sl.labelOffsetX
      existing.labelOffsetY = sl.labelOffsetY
      existing.visible = sl.visible
      existing.userLocked = sl.userLocked
      existing.displayLength = sl.displayLength
      existing.target = { type: sl.targetType as ParallelLine3['target']['type'], id: sl.targetId }
      if (existing.p1.id !== sl.p1Id) { const p1 = scene.points.get(sl.p1Id); if (p1) existing.p1 = p1 }
      // 就地更新内部 p2 的位置，保留对象身份
      existing.p2.forceSetPosition(new Vec3(sl.p2Position.x, sl.p2Position.y, sl.p2Position.z))
    } else {
      const p1 = scene.points.get(sl.p1Id)
      if (!p1) continue
      const p2 = new Point3(`${sl.id}_p2`, '', new Vec3(sl.p2Position.x, sl.p2Position.y, sl.p2Position.z), false, false, false)
      scene.addParallelLine(new ParallelLine3(sl.id, sl.name, p1, p2, { type: sl.targetType as ParallelLine3['target']['type'], id: sl.targetId }, sl.nameVisible, sl.visible, sl.displayLength, sl.userLocked, sl.labelOffsetX, sl.labelOffsetY, sl.valueVisible))
    }
  }
  for (const id of [...scene.parallelLines.keys()]) {
    if (!snapshotParallelLineIds.has(id)) scene.removeParallelLine(id)
  }

  // ─── 13. 约束：清空重建（约束不需要保留对象身份） ───
  scene.clearAllConstraints()

  const seenFaceIds = new Set<string>()
  const seenPointIds = new Set<string>()
  const seenCubeIds = new Set<string>()
  const seenPrismIds = new Set<string>()
  const seenPyramidIds = new Set<string>()
  const seenRegularPolygonIds = new Set<string>()
  const seenCylinderIds = new Set<string>()
  const seenPerpendicularLineIds = new Set<string>()
  const seenParallelLineIds = new Set<string>()
  const seenObjectConstrainedPointIds = new Set<string>()

  for (const sc of snapshot.constraints) {
    if (sc.type === 'cube') {
      if (seenCubeIds.has(sc.cubeId)) continue
      seenCubeIds.add(sc.cubeId)
      scene.addCubeConstraint(new CubeConstraint(scene, sc.cubeId, sc.solidType, sc.ownerPointIds, sc.dependentLayouts, sc.faceIds, sc.sourceLineId, new Vec3(sc.vAxisHint.x, sc.vAxisHint.y, sc.vAxisHint.z), sc.name, sc.edgeLengthLocked, sc.lockedEdgeLength, sc.valueVisible))
    } else if (sc.type === 'intersection') {
      if (seenPointIds.has(sc.pointId)) continue
      seenPointIds.add(sc.pointId)
      scene.addIntersectionConstraint(new IntersectionPointConstraint(scene, sc.pointId, sc.sourceA, sc.sourceB))
    } else if (sc.type === 'regularPolygon') {
      if (seenRegularPolygonIds.has(sc.constraintId)) continue
      seenRegularPolygonIds.add(sc.constraintId)
      scene.addRegularPolygonConstraint(new RegularPolygonConstraint(scene, sc.constraintId, sc.ownerPointIds, sc.dependentLayouts, sc.faceId, sc.vertexCount, new Vec3(sc.vAxisHint.x, sc.vAxisHint.y, sc.vAxisHint.z), sc.name, sc.edgeLengthLocked, sc.lockedEdgeLength, sc.valueVisible))
    } else if (sc.type === 'prism') {
      if (seenPrismIds.has(sc.prismId)) continue
      seenPrismIds.add(sc.prismId)
      scene.addPrismConstraint(new PrismConstraint(scene, sc.prismId, sc.ownerPointIds, sc.dependentLayouts, sc.bottomFaceId, sc.topFaceId, sc.sideFaceIds, sc.baseReferenceIndex, new Vec3(sc.vAxisHint.x, sc.vAxisHint.y, sc.vAxisHint.z), sc.name, sc.valueVisible))
    } else if (sc.type === 'pyramid') {
      if (seenPyramidIds.has(sc.pyramidId)) continue
      seenPyramidIds.add(sc.pyramidId)
      scene.addPyramidConstraint(new PyramidConstraint(scene, sc.pyramidId, sc.ownerPointIds, sc.bottomFaceId, sc.sideFaceIds, sc.baseReferenceIndex, new Vec3(sc.vAxisHint.x, sc.vAxisHint.y, sc.vAxisHint.z), sc.name, sc.valueVisible))
    } else if (sc.type === 'planar') {
      if (seenFaceIds.has(sc.faceId)) continue
      seenFaceIds.add(sc.faceId)
      scene.addConstraint(new PlanarPolygonConstraint(scene, sc.faceId))
    } else if (sc.type === 'cylinder') {
      if (seenCylinderIds.has(sc.cylinderId)) continue
      seenCylinderIds.add(sc.cylinderId)
      scene.addCylinderConstraint(new CylinderConstraint(scene, sc.cylinderId, sc.bottomCircleId, sc.topCircleId, sc.name, sc.valueVisible))
    } else if (sc.type === 'objectConstrainedPoint') {
      if (seenObjectConstrainedPointIds.has(sc.pointId)) continue
      seenObjectConstrainedPointIds.add(sc.pointId)
      const point = scene.points.get(sc.pointId)
      if (point) {
        point.constrainedTo = { type: sc.targetType as ConstrainedToRef['type'], id: sc.targetId }
        const constraint = new ObjectConstrainedPointConstraint(scene, sc.pointId, point.constrainedTo)
        constraint.parametricData = sc.parametricData
        scene.addObjectConstrainedPointConstraint(constraint)
      }
    } else if (sc.type === 'perpendicularLine') {
      if (seenPerpendicularLineIds.has(sc.perpendicularLineId)) continue
      seenPerpendicularLineIds.add(sc.perpendicularLineId)
      scene.addPerpendicularLineConstraint(new PerpendicularLineConstraint(scene, sc.perpendicularLineId, { type: sc.targetType as PerpendicularLineConstraint['target']['type'], id: sc.targetId }))
    } else if (sc.type === 'parallelLine') {
      if (seenParallelLineIds.has(sc.parallelLineId)) continue
      seenParallelLineIds.add(sc.parallelLineId)
      scene.addParallelLineConstraint(new ParallelLineConstraint(scene, sc.parallelLineId, { type: sc.targetType as ParallelLineConstraint['target']['type'], id: sc.targetId }))
    }
  }

  scene.invalidateRenderSyncCache()
  scene.markAllRenderDirty()

  // 恢复约束脏标记，并标记所有约束为脏以便后续求解
  scene.endSnapshotRestore()
}

// ─── SnapshotCommand ──────────────────────────────────────

/**
 * 基于快照的命令 — 用于级联影响深的操作。
 *
 * 在执行操作前拍摄 before 快照，执行后拍摄 after 快照。
 * undo 恢复 before，redo 恢复 after。
 *
 * 优点：不需要手动管理复杂的级联副作用，快照自动覆盖所有状态。
 * 代价：内存开销比命令模式大，但对于复杂操作（MergePoints、DeletePoint）
 *       这比手动快照管理更可靠。
 */
export class SnapshotCommand implements HistoryEntry {
  readonly id = genId('snap')
  readonly label: string
  readonly timestamp = Date.now()

  private beforeSnapshot: SceneSubgraphSnapshot | null = null
  private afterSnapshot: SceneSubgraphSnapshot | null = null

  constructor(
    label: string,
    private scene: Scene,
    private executeFn: () => void,
  ) {
    this.label = label
  }

  /**
   * 执行操作并捕获 before/after 快照。
   * 必须在 push 到 HistoryManager 之前调用。
   */
  executeAndCapture(): void {
    this.beforeSnapshot = takeFullSnapshot(this.scene)
    this.executeFn()
    this.afterSnapshot = takeFullSnapshot(this.scene)
  }

  redo(): void {
    if (this.afterSnapshot) {
      restoreFromSnapshot(this.scene, this.afterSnapshot)
    }
  }

  undo(): void {
    if (this.beforeSnapshot) {
      restoreFromSnapshot(this.scene, this.beforeSnapshot)
    }
  }

  dispose(): void {
    this.beforeSnapshot = null
    this.afterSnapshot = null
  }

  /** 获取 before 快照（用于协作历史同步） */
  getBeforeSnapshot(): SceneSubgraphSnapshot | null {
    return this.beforeSnapshot
  }

  /** 获取 after 快照（用于协作历史同步） */
  getAfterSnapshot(): SceneSubgraphSnapshot | null {
    return this.afterSnapshot
  }
}
