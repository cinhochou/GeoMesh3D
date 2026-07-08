// src/core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { HistoryManager, type HistoryEntry } from './HistoryManager'
import { TransformCommand } from './commands/scene/TransformCommand'
import { TransformPrismOwnerPointCommand } from './commands/scene/TransformPrismOwnerPointCommand'
import { createAddElementCommand } from './commands/add/AddElementCommand'
import { SnapshotCommand } from './commands/SnapshotCommand'
import { Point3, type ConstrainedToRef } from '../geometry/Point3'
import { Line3, type FaceConstraintType } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { GeoVector3 } from '../geometry/GeoVector3'
import { Circle3, type DirectionType } from '../geometry/Circle3'
import { Sphere3 } from '../geometry/Sphere3'
import { Cone3 } from '../geometry/Cone3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarPolygon } from '../geometry/PlanarPolygon'
import { Vec3 } from '../geometry/Vec3'
import {
  buildConvexHull,
  computePlaneBasis,
  computeSupportPointIds,
  orderedLoopFromLines,
  PLANAR_EPSILON,
  projectPoint2D,
  projectPointToPlane,
  signedDistanceToPlane,
} from '../geometry/PlanarUtils'
import { TransformPointsCommand } from './commands/scene/TransformPointsCommand'
import { UpdatePointCommand } from './commands/update/UpdatePointCommand'
import { UpdateLineCommand } from './commands/update/UpdateLineCommand'
import { UpdateRayCommand } from './commands/update/UpdateRayCommand'
import { UpdateVectorCommand } from './commands/update/UpdateVectorCommand'
import { UpdateCircleCommand } from './commands/update/UpdateCircleCommand'
import { UpdateStraightLineCommand } from './commands/update/UpdateStraightLineCommand'
import { UpdatePerpendicularLineCommand } from './commands/update/UpdatePerpendicularLineCommand'
import { UpdateParallelLineCommand } from './commands/update/UpdateParallelLineCommand'
import { UpdateFaceCommand } from './commands/update/UpdateFaceCommand'
import { createDeletePointCommand } from './commands/delete/DeletePointCommand'
import { createDeleteLineCommand } from './commands/delete/DeleteLineCommand'
import { createDeleteRayCommand } from './commands/delete/DeleteRayCommand'
import { createDeleteVectorCommand } from './commands/delete/DeleteVectorCommand'
import { createDeleteStraightLineCommand } from './commands/delete/DeleteStraightLineCommand'
import { createDeleteFaceCommand } from './commands/delete/DeleteFaceCommand'
import { createDeleteRegularPolygonCommand } from './commands/delete/DeleteRegularPolygonCommand'
import { createDeleteCircleCommand } from './commands/delete/DeleteCircleCommand'
import { createDeleteSphereCommand } from './commands/delete/DeleteSphereCommand'
import { UpdateSphereCommand } from './commands/update/UpdateSphereCommand'
import { UpdateCubeCommand } from './commands/update/UpdateCubeCommand'
import { UpdateRegularPolygonCommand } from './commands/update/UpdateRegularPolygonCommand'
import { createDeleteHexahedronCommand } from './commands/delete/DeleteHexahedronCommand'
import { createClearSceneCommand } from './commands/scene/ClearSceneCommand'
import { createSyncLockStateCommand } from './commands/scene/SyncLockStateCommand'
import { createMergePointsCommand } from './commands/scene/MergePointsCommand'
import { createMergeCubePointsCommand } from './commands/scene/MergeCubePointsCommand'
import { createAddIntersectionPointCommand } from './commands/add/AddIntersectionPointCommand'
import { createAddConstrainedPointCommand } from './commands/add/AddConstrainedPointCommand'
import { ObjectConstrainedPointConstraint } from '../constraints/ObjectConstrainedPointConstraint'
import { createAddHexahedronCommand } from './commands/add/AddHexahedronCommand'
import { createAddSphereCommand } from './commands/add/AddSphereCommand'
import { createAddRadiusSphereCommand } from './commands/add/AddRadiusSphereCommand'
import { createAddConeCommand } from './commands/add/AddConeCommand'

import { UpdateSphereRadiusCommand } from './commands/update/UpdateSphereRadiusCommand'
import { createDeleteConeCommand } from './commands/delete/DeleteConeCommand'
import { UpdateConeCommand } from './commands/update/UpdateConeCommand'
import { UpdateConeRadiusCommand } from './commands/update/UpdateConeRadiusCommand'
import { UpdateConeHeightCommand } from './commands/update/UpdateConeHeightCommand'
import { createAddCylinderCommand } from './commands/add/AddCylinderCommand'
import { createDeleteCylinderCommand } from './commands/delete/DeleteCylinderCommand'
import { createDeletePerpendicularLineCommand } from './commands/delete/DeletePerpendicularLineCommand'
import { createDeleteParallelLineCommand } from './commands/delete/DeleteParallelLineCommand'
import { UpdateCylinderCommand } from './commands/update/UpdateCylinderCommand'
import { UpdateCylinderRadiusCommand } from './commands/update/UpdateCylinderRadiusCommand'
import { UpdateCylinderHeightCommand } from './commands/update/UpdateCylinderHeightCommand'
import { Cylinder3 } from '../geometry/Cylinder3'
import { createAddRegularPolygonCommand } from './commands/add/AddRegularPolygonCommand'
import { createAddPrismCommand } from './commands/add/AddPrismCommand'
import { createDeletePrismCommand } from './commands/delete/DeletePrismCommand'
import { UpdatePrismCommand } from './commands/update/UpdatePrismCommand'
import { RegularPolygonConstraint } from '../constraints/RegularPolygonConstraint'
import { PrismConstraint } from '../constraints/PrismConstraint'
import { IntersectionPointConstraint } from '../constraints/IntersectionPointConstraint'
import { CubeConstraint } from '../constraints/CubeConstraint'
import { FeatureDocument, type FeatureOperation } from '../features'
import {
  canCreateIntersectionFromTargets,
  computeIntersectionPoint,
  type IntersectionTargetRef,
  type IntersectionTargetType,
} from '../geometry/IntersectionPoint3'
import { PerpendicularLine3, type PerpendicularLineTargetRef, type PerpendicularLineTargetType } from '../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../constraints/PerpendicularLineConstraint'
import { ParallelLine3, type ParallelLineTargetRef, type ParallelLineTargetType } from '../geometry/ParallelLine3'
import { ParallelLineConstraint } from '../constraints/ParallelLineConstraint'

export enum EditorMode {
  Select,
  Delete,
  CreatePoint,
  MergePoint,
  IntersectionPoint,
  CreateLine,
  CreateStraightLine,
  CreateRay,
  CreateVector,
  CreateCircleThreePoints,
  CreateCircleNormal,
  CreatePlane,
  CreateRegularPolygon,
  CreateHexahedron,
  CreateTetrahedron,
  CreateSphereTwoPoints,
  CreateSphereRadius,
  CreateCone,
  CreateCylinder,
  CreatePrism,
  CreatePerpendicularLine,
  CreateParallelLine,
}

export type FacePreviewData = {
  boundary: Vec3[]
  adjustedPoints: Array<{
    id: string
    from: Vec3
    to: Vec3
  }>
  notices: string[]
}

const genIndexedAlphabetName = (index: number, baseCharCode: number) => {
  const letter = String.fromCharCode(baseCharCode + (index % 26))
  const suffix = Math.floor(index / 26)
  return suffix === 0 ? letter : `${letter}${suffix}`
}

const genId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const emitToast = (msg: string) => {
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: {
        msg,
        scope: 'viewport',
      },
    }),
  )
}

const getBoundsDiagonal = (points: Point3[]) => {
  if (points.length === 0) return 0
  let minX = points[0]!.position.x
  let minY = points[0]!.position.y
  let minZ = points[0]!.position.z
  let maxX = minX
  let maxY = minY
  let maxZ = minZ
  points.forEach((point) => {
    minX = Math.min(minX, point.position.x)
    minY = Math.min(minY, point.position.y)
    minZ = Math.min(minZ, point.position.z)
    maxX = Math.max(maxX, point.position.x)
    maxY = Math.max(maxY, point.position.y)
    maxZ = Math.max(maxZ, point.position.z)
  })
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
}

const autoOptimizeFacePoints = (editor: Editor, points: Point3[]) => {
  const plane = computePlaneBasis(points.map((point) => point.position))
  if (!plane)
    return {
      adjusted: 0,
      messages: [] as string[],
      positionOverrides: new Map<string, Vec3>(),
      adjustedPoints: [] as Array<{ id: string; from: Vec3; to: Vec3 }>,
    }

  const diagonal = getBoundsDiagonal(points)
  const planarTolerance = Math.max(0.02, diagonal * 0.015)
  const autoProjectTolerance = Math.max(0.18, diagonal * 0.08)
  const updates: Array<{ id: string; position: Vec3 }> = []
  const positionOverrides = new Map<string, Vec3>()
  const adjustedPoints: Array<{ id: string; from: Vec3; to: Vec3 }> = []
  let blockedLockedPoint = false
  let farOffPoint = false

  points.forEach((point) => {
    const distance = Math.abs(signedDistanceToPlane(point.position, plane))
    if (distance <= planarTolerance) return

    if (distance > autoProjectTolerance) {
      farOffPoint = true
      return
    }

    if (editor.isPointCoordinateLocked(point)) {
      blockedLockedPoint = true
      return
    }

    const projected = projectPointToPlane(point.position, plane)
    updates.push({
      id: point.id,
      position: projected,
    })
    positionOverrides.set(point.id, projected)
    adjustedPoints.push({
      id: point.id,
      from: point.position.clone(),
      to: projected.clone(),
    })
  })

  const messages: string[] = []
  if (updates.length > 0) {
    editor.setPointsPositions(updates)
    messages.push(`已自动将 ${updates.length} 个点投影到同一平面`)
  }
  if (blockedLockedPoint) {
    messages.push('部分锁定点偏离平面，未自动调整')
  }
  if (farOffPoint) {
    messages.push('部分点偏离过大，已按当前主要平面尽量创建')
  }

  return {
    adjusted: updates.length,
    messages,
    positionOverrides,
    adjustedPoints,
  }
}

const getFacesByPointId = (editor: Editor, pointId: string) =>
  [...editor.scene.faces.values()].filter((face) => face.includesPoint(pointId))

const getFacesByLineId = (editor: Editor, lineId: string) =>
  [...editor.scene.faces.values()].filter((face) => face.boundaryLineIds.includes(lineId))

const samePosition = (a: Vec3, b: Vec3, epsilon = 1e-6) =>
  Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon && Math.abs(a.z - b.z) <= epsilon

const buildFaceUnlockCascade = (editor: Editor, faces: PlanarPolygon[]) => {
  const pointTransforms = new Map<string, { point: Point3; before: boolean; after: boolean }>()
  const lineTransforms = new Map<string, { line: Line3; before: boolean; after: boolean }>()
  const faceTransforms = new Map<string, { face: PlanarPolygon; before: boolean; after: boolean }>()

  faces.forEach((face) => {
    faceTransforms.set(face.id, {
      face,
      before: face.userLocked,
      after: false,
    })

    face.memberPointIds.forEach((pointId) => {
      const point = editor.scene.points.get(pointId)
      if (!point || point.locked) return
      pointTransforms.set(pointId, {
        point,
        before: point.userLocked,
        after: false,
      })
    })

    face.boundaryLineIds.forEach((lineId) => {
      const line = editor.scene.lines.get(lineId)
      if (!line) return
      lineTransforms.set(lineId, {
        line,
        before: line.userLocked,
        after: false,
      })
    })
  })

  return {
    pointTransforms: [...pointTransforms.values()].filter(
      (transform) => transform.before !== transform.after,
    ),
    lineTransforms: [...lineTransforms.values()].filter(
      (transform) => transform.before !== transform.after,
    ),
    faceTransforms: [...faceTransforms.values()].filter(
      (transform) => transform.before !== transform.after,
    ),
  }
}

type FaceDraft = {
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
  positionOverrides: Map<string, Vec3>
  notices: string[]
  adjustedPoints: Array<{
    id: string
    from: Vec3
    to: Vec3
  }>
}

const toWorldPoint = (
  plane: NonNullable<ReturnType<typeof computePlaneBasis>>,
  x: number,
  y: number,
) =>
  new Vec3(
    plane.origin.x + plane.uAxis.x * x + plane.vAxis.x * y,
    plane.origin.y + plane.uAxis.y * x + plane.vAxis.y * y,
    plane.origin.z + plane.uAxis.z * x + plane.vAxis.z * y,
  )

const genNextAvailableName = (
  existingNames: Iterable<string>,
  baseCharCode: number,
  formatter?: (index: number) => string,
) => {
  const usedNames = new Set(existingNames)
  let index = 0

  while (true) {
    const candidate = formatter ? formatter(index) : genIndexedAlphabetName(index, baseCharCode)
    if (!usedNames.has(candidate)) return candidate
    index += 1
  }
}

const getSolidNamePrefix = (solidType: CubeConstraint['solidType']) =>
  solidType === 'tetrahedron' ? '正四面体' : '正六面体'

const AXIS_ALIGNMENT_EPSILON = 1e-6
const SOLID_ALIGNMENT_SNAP_EPSILON = 0.2

const getSharedCoordinateNormal = (a: Vec3, b: Vec3) => {
  if (Math.abs(a.x - b.x) <= AXIS_ALIGNMENT_EPSILON) return new Vec3(1, 0, 0)
  if (Math.abs(a.y - b.y) <= AXIS_ALIGNMENT_EPSILON) return new Vec3(0, 1, 0)
  if (Math.abs(a.z - b.z) <= AXIS_ALIGNMENT_EPSILON) return new Vec3(0, 0, 1)
  return null
}

const dotVec3 = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const normalizeVec3 = (v: Vec3) => {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len <= 1e-8) return null
  return new Vec3(v.x / len, v.y / len, v.z / len)
}

const crossVec3 = (a: Vec3, b: Vec3) =>
  new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

const projectPerpendicularVec3 = (vector: Vec3, axis: Vec3) => {
  const factor = dotVec3(vector, axis)
  return new Vec3(
    vector.x - axis.x * factor,
    vector.y - axis.y * factor,
    vector.z - axis.z * factor,
  )
}

const chooseFallbackAxisVec3 = (axis: Vec3) => {
  const basis = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)]
  return basis.reduce((best, candidate) =>
    Math.abs(dotVec3(candidate, axis)) < Math.abs(dotVec3(best, axis)) ? candidate : best,
  )
}

export class Editor {
  scene: Scene
  mode: EditorMode = EditorMode.Select
  selectedPoints: Point3[] = []
  /** @deprecated 使用 historyManager 代替 */
  history: Command[] = []
  /** @deprecated 使用 historyManager 代替 */
  historyIndex = -1
  /** 新的历史管理器，统一管理撤销/重做 */
  historyManager: HistoryManager
  /** 每次历史操作后递增，供 Vue watcher 检测变化（historyManager 被 markRaw 无法追踪） */
  historyVersion = 0
  isSnappingEnabled: boolean = true
  /** 基于 Feature 的文档 API，供外部程序和脚本调用作图能力 */
  featureDocument: FeatureDocument

  constructor(scene: Scene) {
    this.scene = scene
    this.historyManager = new HistoryManager(scene)
    this.featureDocument = new FeatureDocument(scene)
  }

  isPointConstrainedByLockedLinear(pointId: string) {
    for (const line of this.scene.lines.values()) {
      if (!line.userLocked) continue
      if (line.p1.id === pointId || line.p2.id === pointId) return true
    }

    for (const ray of this.scene.rays.values()) {
      if (!ray.userLocked) continue
      if (ray.p1.id === pointId || ray.p2.id === pointId) return true
    }

    for (const line of this.scene.straightLines.values()) {
      if (!line.userLocked) continue
      if (line.p1.id === pointId || line.p2.id === pointId) return true
    }

    for (const vector of this.scene.vectors.values()) {
      if (!vector.userLocked) continue
      if (vector.p1.id === pointId || vector.p2.id === pointId) return true
    }

    for (const circle of this.scene.circles.values()) {
      if (!circle.userLocked) continue
      if (circle.isNormalCircle()) {
        if (circle.p1.id === pointId) return true
      } else {
        if (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId)
          return true
      }
    }

    for (const sphere of this.scene.spheres.values()) {
      if (!sphere.userLocked) continue
      if (
        sphere.centerPoint.id === pointId ||
        (sphere.radiusPoint && sphere.radiusPoint.id === pointId)
      )
        return true
    }

    for (const cone of this.scene.cones.values()) {
      if (!cone.userLocked) continue
      if (cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId) return true
    }

    return false
  }

  isPointConstrainedByIntersection(pointId: string) {
    const constraint = this.scene.getIntersectionConstraint(pointId)
    if (!constraint) return false
    return constraint.isEffective ? constraint.isEffective() : true
  }

  getIntersectionConstraint(pointId: string) {
    const constraint = this.scene.getIntersectionConstraint(pointId)
    if (!(constraint instanceof IntersectionPointConstraint)) return null
    return constraint
  }

  getIntersectionTargetLabel(target: IntersectionTargetRef) {
    if (target.type === 'line') {
      const line = this.scene.lines.get(target.id)
      return line ? `线段${line.name}` : '线段(已删除)'
    }
    if (target.type === 'straightLine') {
      const line = this.scene.straightLines.get(target.id)
      return line ? `直线${line.name}` : '直线(已删除)'
    }
    if (target.type === 'ray') {
      const ray = this.scene.rays.get(target.id)
      return ray ? `射线${ray.name}` : '射线(已删除)'
    }
    if (target.type === 'perpendicularLine') {
      const line = this.scene.perpendicularLines.get(target.id)
      return line ? `垂线${line.name}` : '垂线(已删除)'
    }
    if (target.type === 'parallelLine') {
      const line = this.scene.parallelLines.get(target.id)
      return line ? `平行线${line.name}` : '平行线(已删除)'
    }
    const face = this.scene.faces.get(target.id)
    return face ? `多边形${face.name}` : '多边形(已删除)'
  }

  getIntersectionSummary(pointId: string) {
    const constraint = this.getIntersectionConstraint(pointId)
    if (!constraint) return null
    return {
      left: this.getIntersectionTargetLabel(constraint.sourceA),
      right: this.getIntersectionTargetLabel(constraint.sourceB),
      valid: constraint.isEffective(),
    }
  }

  collectDependentIntersectionPoints(targets: IntersectionTargetRef[]) {
    const matched = new Map<string, { point: Point3; constraint: IntersectionPointConstraint }>()

    const matchesTarget = (candidate: IntersectionTargetRef, target: IntersectionTargetRef) =>
      candidate.type === target.type && candidate.id === target.id

    this.scene.intersectionConstraints.forEach((constraint) => {
      if (!(constraint instanceof IntersectionPointConstraint)) return
      const dependsOnTarget = targets.some(
        (target) =>
          matchesTarget(constraint.sourceA, target) || matchesTarget(constraint.sourceB, target),
      )
      if (!dependsOnTarget) return

      const point = this.scene.points.get(constraint.pointId)
      if (!point) return
      matched.set(point.id, { point, constraint })
    })

    return [...matched.values()]
  }

  /**
   * 合并多组交点依赖，按 point.id 去重。
   */
  private mergeIntersectionPoints(
    ...arrays: Array<Array<{ point: Point3; constraint: IntersectionPointConstraint }>>
  ): Array<{ point: Point3; constraint: IntersectionPointConstraint }> {
    const map = new Map<string, { point: Point3; constraint: IntersectionPointConstraint }>()
    for (const arr of arrays) {
      for (const item of arr) {
        if (!map.has(item.point.id)) map.set(item.point.id, item)
      }
    }
    return [...map.values()]
  }

  /**
   * 收集依赖给定垂线/平行线的交点。
   */
  private collectIntersectionPointsFromRelatedLines(
    relatedPerpendicularLines: PerpendicularLine3[],
    relatedParallelLines: ParallelLine3[],
  ): Array<{ point: Point3; constraint: IntersectionPointConstraint }> {
    if (relatedPerpendicularLines.length === 0 && relatedParallelLines.length === 0) return []
    return this.collectDependentIntersectionPoints([
      ...relatedPerpendicularLines.map((pl) => ({ type: 'perpendicularLine' as const, id: pl.id })),
      ...relatedParallelLines.map((pl) => ({ type: 'parallelLine' as const, id: pl.id })),
    ])
  }

  collectDependentCubesByPointId(pointId: string, excludePointIds: string[] = []) {
    const bundles = new Map<
      string,
      {
        faces: PlanarPolygon[]
        dependentPoints: Point3[]
        constraint: CubeConstraint
        dependentIntersectionPoints: Array<{
          point: Point3
          constraint: IntersectionPointConstraint
        }>
      }
    >()

    this.scene.cubeConstraints.forEach((constraint) => {
      if (!(constraint instanceof CubeConstraint)) return
      const allPointIds = [
        ...constraint.ownerPointIds,
        ...constraint.dependentLayouts.map((layout) => layout.pointId),
      ]
      if (!allPointIds.includes(pointId)) return

      const faces = constraint.faceIds
        .map((faceId) => this.scene.faces.get(faceId))
        .filter((face): face is PlanarPolygon => face !== undefined)
      const dependentPoints = constraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((point): point is Point3 => point !== undefined)
        .filter((point) => !excludePointIds.includes(point.id))
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints(
        faces.map((face) => ({ type: 'face' as const, id: face.id })),
      )
      bundles.set(constraint.cubeId, {
        faces,
        dependentPoints,
        constraint,
        dependentIntersectionPoints,
      })
    })

    return [...bundles.values()]
  }

  collectDependentCubesByLineId(lineId: string) {
    const bundles = new Map<
      string,
      {
        faces: PlanarPolygon[]
        dependentPoints: Point3[]
        constraint: CubeConstraint
        dependentIntersectionPoints: Array<{
          point: Point3
          constraint: IntersectionPointConstraint
        }>
      }
    >()

    this.scene.cubeConstraints.forEach((constraint) => {
      if (!(constraint instanceof CubeConstraint)) return
      const isSourceLine = constraint.sourceLineId === lineId
      const faces = constraint.faceIds
        .map((faceId) => this.scene.faces.get(faceId))
        .filter((face): face is PlanarPolygon => face !== undefined)
      const isBoundaryLine = faces.some((face) => face.boundaryLineIds.includes(lineId))
      if (!isSourceLine && !isBoundaryLine) return
      const dependentPoints = constraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((point): point is Point3 => point !== undefined)
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints(
        faces.map((face) => ({ type: 'face' as const, id: face.id })),
      )
      bundles.set(constraint.cubeId, {
        faces,
        dependentPoints,
        constraint,
        dependentIntersectionPoints,
      })
    })

    return [...bundles.values()]
  }

  collectDependentFacesByLineId(lineId: string): PlanarPolygon[] {
    const line = this.scene.lines.get(lineId)
    if (!line) return []

    const cubeFaceIds = new Set<string>()
    this.scene.cubeConstraints.forEach((constraint) => {
      if (!(constraint instanceof CubeConstraint)) return
      constraint.faceIds.forEach((faceId) => cubeFaceIds.add(faceId))
    })

    return [...this.scene.faces.values()].filter(
      (face) => face.boundaryLineIds.includes(lineId) && !cubeFaceIds.has(face.id),
    )
  }

  getCubeConstraintByFaceId(faceId: string) {
    const face = this.scene.faces.get(faceId)
    if (!face?.cubeId) return null
    const constraint = this.scene.getCubeConstraint(face.cubeId)
    if (!(constraint instanceof CubeConstraint)) return null
    return constraint
  }

  getCubeConstraints() {
    return [...this.scene.cubeConstraints.values()].filter(
      (constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint,
    )
  }

  getRegularPolygonConstraints() {
    return [...this.scene.regularPolygonConstraints.values()].filter(
      (constraint): constraint is RegularPolygonConstraint =>
        constraint instanceof RegularPolygonConstraint,
    )
  }

  getPrismConstraints() {
    return [...this.scene.prismConstraints.values()].filter(
      (constraint): constraint is PrismConstraint => constraint instanceof PrismConstraint,
    )
  }

  getPrismConstraint(prismId: string) {
    const constraint = this.scene.getPrismConstraint(prismId)
    return constraint instanceof PrismConstraint ? constraint : null
  }

  getPrismConstraintByFaceId(faceId: string) {
    const face = this.scene.faces.get(faceId)
    if (!face?.prismId) return null
    const constraint = this.scene.getPrismConstraint(face.prismId)
    if (!(constraint instanceof PrismConstraint)) return null
    return constraint
  }

  /** 获取棱柱所有面 id（底面 + 顶面 + 侧面）。 */
  getPrismFaceIds(prismId: string) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return []
    return [constraint.bottomFaceId, constraint.topFaceId, ...constraint.sideFaceIds]
  }

  selectPrismByFaceId(faceId: string, additive = false) {
    const prismConstraint = this.getPrismConstraintByFaceId(faceId)
    if (!prismConstraint) {
      this.scene.selection.selectFace(faceId, additive)
      return
    }
    if (!additive) this.scene.selection.clear()
    this.getPrismFaceIds(prismConstraint.prismId).forEach((id) =>
      this.scene.selection.selectFace(id, true),
    )
  }

  deselectPrismByFaceId(faceId: string) {
    const prismConstraint = this.getPrismConstraintByFaceId(faceId)
    if (!prismConstraint) {
      this.scene.selection.deselectFace(faceId)
      return
    }
    this.getPrismFaceIds(prismConstraint.prismId).forEach((id) =>
      this.scene.selection.deselectFace(id),
    )
  }

  updatePrism(
    prismId: string,
    patch: {
      name?: string
      valueVisible?: boolean
      keepVertical?: boolean
    },
  ) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return

    const willToggleKeepVertical =
      patch.keepVertical !== undefined && patch.keepVertical !== constraint.keepVertical
    const topPoint = willToggleKeepVertical
      ? this.scene.points.get(constraint.ownerPointIds[1])
      : null
    const beforeTopPosition = topPoint?.position.clone()
    const afterTopPosition =
      willToggleKeepVertical && patch.keepVertical
        ? constraint.computeVerticalTopPosition() ?? beforeTopPosition
        : beforeTopPosition

    const before: ConstructorParameters<typeof UpdatePrismCommand>[1] = {
      name: constraint.name,
      valueVisible: constraint.valueVisible,
      keepVertical: constraint.keepVertical,
      topPointPosition: beforeTopPosition
        ? { x: beforeTopPosition.x, y: beforeTopPosition.y, z: beforeTopPosition.z }
        : undefined,
    }
    const after: ConstructorParameters<typeof UpdatePrismCommand>[2] = {
      name: patch.name ?? constraint.name,
      valueVisible: patch.valueVisible ?? constraint.valueVisible,
      keepVertical: patch.keepVertical ?? constraint.keepVertical,
      topPointPosition: afterTopPosition
        ? { x: afterTopPosition.x, y: afterTopPosition.y, z: afterTopPosition.z }
        : undefined,
    }
    this.executeCommand(new UpdatePrismCommand(constraint.prismId, before, after, this.scene))
    this.scene.markAllRenderDirty()
  }

  updatePrismName(prismId: string, name: string) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return
    constraint.name = name.trim()
    this.scene.markAllRenderDirty()
  }

  /** 获取棱柱名称去掉「棱柱」前缀后的后缀（如 "1"、"2" 等）。 */
  getPrismNameSuffix(prismId: string) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return ''
    return constraint.name.replace(/^棱柱/, '')
  }

  setPrismValueVisible(prismId: string, visible: boolean) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint || constraint.valueVisible === visible) return
    constraint.valueVisible = visible
    this.scene.markAllRenderDirty()
  }

  setPrismLockState(prismId: string, locked: boolean) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return
    constraint.ownerPointIds.forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (point) point.userLocked = locked
    })
    constraint.dependentLayouts.forEach(({ pointId }) => {
      const point = this.scene.points.get(pointId)
      if (point) point.userLocked = locked
    })
    this.getPrismFaceIds(prismId).forEach((faceId) => {
      const face = this.scene.faces.get(faceId)
      if (!face || face.userLocked === locked) return
      face.userLocked = locked
    })
  }

  /** 收集依赖某点的所有棱柱（owner 或 dependent）。 */
  collectDependentPrismsByPointId(pointId: string): Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: PrismConstraint
    bottomFaceId: string
    bottomOwnerPointIds: string[]
    topPointId: string
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
    relatedPerpendicularLines: PerpendicularLine3[]
    relatedParallelLines: ParallelLine3[]
  }> {
    const result: Array<{
      faces: PlanarPolygon[]
      dependentPoints: Point3[]
      constraint: PrismConstraint
      bottomFaceId: string
      bottomOwnerPointIds: string[]
      topPointId: string
      dependentIntersectionPoints: Array<{
        point: Point3
        constraint: IntersectionPointConstraint
      }>
      relatedPerpendicularLines: PerpendicularLine3[]
      relatedParallelLines: ParallelLine3[]
    }> = []

    this.scene.prismConstraints.forEach((constraint) => {
      if (!(constraint instanceof PrismConstraint)) return
      const bottomFaceForCheck = this.scene.faces.get(constraint.bottomFaceId)
      const bottomPointIds = bottomFaceForCheck ? [...bottomFaceForCheck.boundaryPointIds] : []
      const allPointIds = [
        ...constraint.ownerPointIds,
        ...constraint.dependentLayouts.map((layout) => layout.pointId),
        ...bottomPointIds,
      ]
      if (!allPointIds.includes(pointId)) return

      const faceIds = this.getPrismFaceIds(constraint.prismId)
      const faces = faceIds
        .map((faceId) => this.scene.faces.get(faceId))
        .filter((face): face is PlanarPolygon => face !== undefined)
      const dependentPoints = constraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((point): point is Point3 => point !== undefined)
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints(
        faces.map((face) => ({ type: 'face' as const, id: face.id })),
      )
      const allBoundaryLineIds = new Set(faces.flatMap((f) => f.boundaryLineIds))
      const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
        (pl) =>
          (pl.target.type === 'face' && faces.some((f) => f.id === pl.target.id)) ||
          (pl.target.type === 'line' && allBoundaryLineIds.has(pl.target.id)),
      )
      const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
        (pl) => pl.target.type === 'line' && allBoundaryLineIds.has(pl.target.id),
      )
      const bottomFace = this.scene.faces.get(constraint.bottomFaceId)
      result.push({
        faces,
        dependentPoints,
        constraint,
        bottomFaceId: constraint.bottomFaceId,
        bottomOwnerPointIds: bottomFace ? [...bottomFace.boundaryPointIds] : [],
        topPointId: constraint.ownerPointIds[1],
        dependentIntersectionPoints,
        relatedPerpendicularLines,
        relatedParallelLines,
      })
    })

    return result
  }

  /** 收集依赖某条线的所有棱柱（该线为棱柱任一面的边界线）。 */
  collectDependentPrismsByLineId(lineId: string): Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: PrismConstraint
    bottomFaceId: string
    bottomOwnerPointIds: string[]
    topPointId: string
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
    relatedPerpendicularLines: PerpendicularLine3[]
    relatedParallelLines: ParallelLine3[]
  }> {
    const result: Array<{
      faces: PlanarPolygon[]
      dependentPoints: Point3[]
      constraint: PrismConstraint
      bottomFaceId: string
      bottomOwnerPointIds: string[]
      topPointId: string
      dependentIntersectionPoints: Array<{
        point: Point3
        constraint: IntersectionPointConstraint
      }>
      relatedPerpendicularLines: PerpendicularLine3[]
      relatedParallelLines: ParallelLine3[]
    }> = []

    this.scene.prismConstraints.forEach((constraint) => {
      if (!(constraint instanceof PrismConstraint)) return
      const faceIds = this.getPrismFaceIds(constraint.prismId)
      const faces = faceIds
        .map((faceId) => this.scene.faces.get(faceId))
        .filter((face): face is PlanarPolygon => face !== undefined)
      const isBoundaryLine = faces.some((face) => face.boundaryLineIds.includes(lineId))
      if (!isBoundaryLine) return
      const dependentPoints = constraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((point): point is Point3 => point !== undefined)
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints(
        faces.map((face) => ({ type: 'face' as const, id: face.id })),
      )
      const allBoundaryLineIds = new Set(faces.flatMap((f) => f.boundaryLineIds))
      const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
        (pl) =>
          (pl.target.type === 'face' && faces.some((f) => f.id === pl.target.id)) ||
          (pl.target.type === 'line' && allBoundaryLineIds.has(pl.target.id)),
      )
      const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
        (pl) => pl.target.type === 'line' && allBoundaryLineIds.has(pl.target.id),
      )
      const bottomFace = this.scene.faces.get(constraint.bottomFaceId)
      result.push({
        faces,
        dependentPoints,
        constraint,
        bottomFaceId: constraint.bottomFaceId,
        bottomOwnerPointIds: bottomFace ? [...bottomFace.boundaryPointIds] : [],
        topPointId: constraint.ownerPointIds[1],
        dependentIntersectionPoints,
        relatedPerpendicularLines,
        relatedParallelLines,
      })
    })

    return result
  }

  selectCubeByFaceId(faceId: string, additive = false) {
    // 优先检查棱柱：点击棱柱任一面应高亮整个棱柱
    const prismConstraint = this.getPrismConstraintByFaceId(faceId)
    if (prismConstraint) {
      if (!additive) this.scene.selection.clear()
      this.getPrismFaceIds(prismConstraint.prismId).forEach((id) =>
        this.scene.selection.selectFace(id, true),
      )
      return
    }
    const cubeConstraint = this.getCubeConstraintByFaceId(faceId)
    if (!cubeConstraint) {
      this.scene.selection.selectFace(faceId, additive)
      return
    }
    if (!additive) this.scene.selection.clear()
    cubeConstraint.faceIds.forEach((id) => this.scene.selection.selectFace(id, true))
  }

  deselectCubeByFaceId(faceId: string) {
    // 优先检查棱柱
    const prismConstraint = this.getPrismConstraintByFaceId(faceId)
    if (prismConstraint) {
      this.getPrismFaceIds(prismConstraint.prismId).forEach((id) =>
        this.scene.selection.deselectFace(id),
      )
      return
    }
    const cubeConstraint = this.getCubeConstraintByFaceId(faceId)
    if (!cubeConstraint) {
      this.scene.selection.deselectFace(faceId)
      return
    }
    cubeConstraint.faceIds.forEach((id) => this.scene.selection.deselectFace(id))
  }

  getCubeConstraint(cubeId: string) {
    const constraint = this.scene.getCubeConstraint(cubeId)
    return constraint instanceof CubeConstraint ? constraint : null
  }

  getCubeNameSuffix(cubeId: string) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return ''
    return constraint.name.replace(new RegExp(`^${getSolidNamePrefix(constraint.solidType)}`), '')
  }

  updateCube(
    cubeId: string,
    patch: {
      name?: string
      valueVisible?: boolean
      edgeLengthLocked?: boolean
      lockedEdgeLength?: number | null
    },
  ) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    const nextEdgeLengthLocked = patch.edgeLengthLocked ?? constraint.edgeLengthLocked
    let nextLockedEdgeLength = patch.lockedEdgeLength ?? constraint.lockedEdgeLength
    if (patch.edgeLengthLocked === true && !constraint.edgeLengthLocked) {
      const p1 = this.scene.points.get(constraint.ownerPointIds[0])
      const p2 = this.scene.points.get(constraint.ownerPointIds[1])
      if (p1 && p2) {
        nextLockedEdgeLength = Math.hypot(
          p2.position.x - p1.position.x,
          p2.position.y - p1.position.y,
          p2.position.z - p1.position.z,
        )
      }
    } else if (patch.edgeLengthLocked === false) {
      nextLockedEdgeLength = null
    }
    const before = {
      name: constraint.name,
      valueVisible: constraint.valueVisible,
      edgeLengthLocked: constraint.edgeLengthLocked,
      lockedEdgeLength: constraint.lockedEdgeLength,
    }
    const after = {
      name: patch.name ?? constraint.name,
      valueVisible: patch.valueVisible ?? constraint.valueVisible,
      edgeLengthLocked: nextEdgeLengthLocked,
      lockedEdgeLength: nextLockedEdgeLength,
    }
    this.executeCommand(new UpdateCubeCommand(constraint.cubeId, before, after, this.scene))
    this.scene.markAllRenderDirty()
  }

  updateCubeName(cubeId: string, suffix: string) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    constraint.name = `${getSolidNamePrefix(constraint.solidType)}${suffix.trim()}`
    this.scene.markAllRenderDirty()
  }

  setCubeValueVisible(cubeId: string, visible: boolean) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint || constraint.valueVisible === visible) return
    constraint.valueVisible = visible
    this.scene.markAllRenderDirty()
  }

  setCubeLockState(cubeId: string, locked: boolean) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    constraint.ownerPointIds.forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.userLocked = locked
    })
    constraint.dependentLayouts.forEach(({ pointId }) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.userLocked = locked
    })
    constraint.faceIds.forEach((faceId) => {
      const face = this.scene.faces.get(faceId)
      if (!face || face.userLocked === locked) return
      face.userLocked = locked
    })
  }

  setCubeEdgeLengthLockState(cubeId: string, locked: boolean) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    constraint.edgeLengthLocked = locked
    if (!locked) {
      constraint.lockedEdgeLength = null
      return
    }
    const p1 = this.scene.points.get(constraint.ownerPointIds[0])
    const p2 = this.scene.points.get(constraint.ownerPointIds[1])
    if (!p1 || !p2) return
    constraint.lockedEdgeLength = Math.hypot(
      p2.position.x - p1.position.x,
      p2.position.y - p1.position.y,
      p2.position.z - p1.position.z,
    )
  }

  updateCubeEdgeLength(cubeId: string, nextLength: number) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    const p1 = this.scene.points.get(constraint.ownerPointIds[0])
    const p2 = this.scene.points.get(constraint.ownerPointIds[1])
    if (!p1 || !p2) return
    const current = new Vec3(
      p2.position.x - p1.position.x,
      p2.position.y - p1.position.y,
      p2.position.z - p1.position.z,
    )
    const currentLength = Math.hypot(current.x, current.y, current.z)
    if (currentLength <= 1e-6) return
    const normalizedLength = Math.max(0.1, nextLength)
    this.setPointsPositions([
      {
        id: p2.id,
        position: new Vec3(
          p1.position.x + (current.x / currentLength) * normalizedLength,
          p1.position.y + (current.y / currentLength) * normalizedLength,
          p1.position.z + (current.z / currentLength) * normalizedLength,
        ),
      },
    ])
    if (constraint.edgeLengthLocked) {
      constraint.lockedEdgeLength = normalizedLength
    }
  }

  private getCubeConstraintByPointId(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (!point?.cubeId) return null
    return this.getCubeConstraint(point.cubeId)
  }

  private getRegularPolygonConstraintByPointId(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (!point?.regularPolygonId) return null
    return this.getRegularPolygonConstraint(point.regularPolygonId)
  }

  private getPrismConstraintByPointId(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (!point?.prismId) return null
    return this.getPrismConstraint(point.prismId)
  }

  private getRegularPolygonConstraintByFaceId(faceId: string) {
    for (const constraint of this.scene.regularPolygonConstraints.values()) {
      if (constraint instanceof RegularPolygonConstraint && constraint.faceId === faceId) {
        return constraint
      }
    }
    return null
  }

  getSphere(sphereId: string): Sphere3 | null {
    return this.scene.spheres.get(sphereId) ?? null
  }

  getSpheres(): Sphere3[] {
    return [...this.scene.spheres.values()]
  }

  getSphereNameSuffix(sphereId: string): string {
    const sphere = this.getSphere(sphereId)
    if (!sphere) return ''
    return sphere.name.replace(/^(两点球|半径球)/, '')
  }

  updateSphereName(sphereId: string, suffix: string) {
    const sphere = this.getSphere(sphereId)
    if (!sphere) return
    const prefix = sphere.name.startsWith('半径球') ? '半径球' : '两点球'
    sphere.name = `${prefix}${suffix.trim()}`
    this.scene.markAllRenderDirty()
  }

  setSphereValueVisible(sphereId: string, visible: boolean) {
    const sphere = this.getSphere(sphereId)
    if (!sphere || sphere.valueVisible === visible) return
    sphere.valueVisible = visible
    this.scene.markAllRenderDirty()
  }

  setSphereNameVisible(sphereId: string, visible: boolean) {
    const sphere = this.getSphere(sphereId)
    if (!sphere || sphere.nameVisible === visible) return
    sphere.nameVisible = visible
    this.scene.markAllRenderDirty()
  }

  setSphereLockState(sphereId: string, locked: boolean) {
    const sphere = this.getSphere(sphereId)
    if (!sphere) return
    const spherePoints = sphere.radiusPoint
      ? [sphere.centerPoint, sphere.radiusPoint]
      : [sphere.centerPoint]
    const endpointTransforms = !locked
      ? spherePoints
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (sphere.userLocked === locked && endpointTransforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [],
        [],
        [],
        [],
        [],
        [{ sphere, before: sphere.userLocked, after: locked }],
      ),
    )
  }

  updateSphere(
    sphereId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
    },
  ) {
    const sphere = this.getSphere(sphereId)
    if (!sphere) return
    const before = {
      name: sphere.name,
      nameVisible: sphere.nameVisible,
      valueVisible: sphere.valueVisible,
      labelOffsetX: sphere.labelOffsetX,
      labelOffsetY: sphere.labelOffsetY,
      visible: sphere.visible,
      userLocked: sphere.userLocked,
    }
    const after = {
      name: patch.name ?? sphere.name,
      nameVisible: patch.nameVisible ?? sphere.nameVisible,
      valueVisible: patch.valueVisible ?? sphere.valueVisible,
      labelOffsetX: patch.labelOffsetX ?? sphere.labelOffsetX,
      labelOffsetY: patch.labelOffsetY ?? sphere.labelOffsetY,
      visible: patch.visible ?? sphere.visible,
      userLocked: patch.userLocked ?? sphere.userLocked,
    }
    this.executeCommand(new UpdateSphereCommand(sphere.id, before, after, this.scene))
    this.scene.markAllRenderDirty()
  }

  isSphereGeometryLocked(sphere: Sphere3): boolean {
    return (
      sphere.userLocked ||
      (this.isPointCoordinateLocked(sphere.centerPoint) &&
        (!sphere.radiusPoint || this.isPointCoordinateLocked(sphere.radiusPoint)))
    )
  }

  getSphereRadius(sphereId: string): number {
    const sphere = this.getSphere(sphereId)
    return sphere?.getRadius() ?? 0
  }

  updateSphereRadius(sphereId: string, nextRadius: number) {
    const sphere = this.getSphere(sphereId)
    if (!sphere) return
    if (sphere.isRadiusSphere()) {
      const normalizedRadius = Math.max(0.1, nextRadius)
      const before = { radiusValue: sphere.radiusValue }
      const after = { radiusValue: normalizedRadius }
      this.executeCommand(new UpdateSphereRadiusCommand(this.scene, sphere.id, before, after))
      this.scene.markAllRenderDirty()
      return
    }
    const currentRadius = sphere.getRadius()
    if (currentRadius <= 1e-6) return
    const normalizedRadius = Math.max(0.1, nextRadius)
    const center = sphere.centerPoint.position
    const radius = sphere.radiusPoint!.position
    const direction = new Vec3(radius.x - center.x, radius.y - center.y, radius.z - center.z)
    const directionLength = Math.hypot(direction.x, direction.y, direction.z)
    if (directionLength <= 1e-8) return
    const newPosition = new Vec3(
      center.x + (direction.x / directionLength) * normalizedRadius,
      center.y + (direction.y / directionLength) * normalizedRadius,
      center.z + (direction.z / directionLength) * normalizedRadius,
    )
    this.setPointsPositions([{ id: sphere.radiusPoint!.id, position: newPosition }])
  }

  deleteSphere(sphereId: string) {
    const sphere = this.getSphere(sphereId)
    if (!sphere) return
    this.removeConstrainedPointsReferencing('sphere', sphereId)
    this.executeHistoryEntry(createDeleteSphereCommand(this.scene, sphere))
  }

  tryCreateSphereTwoPoints(firstPoint: Point3, secondPoint: Point3) {
    if (firstPoint.id === secondPoint.id) {
      emitToast('请选择两个不同的点')
      return
    }
    const exists = [...this.scene.spheres.values()].some(
      (s) =>
        s.radiusPoint &&
        ((s.centerPoint.id === firstPoint.id && s.radiusPoint.id === secondPoint.id) ||
          (s.centerPoint.id === secondPoint.id && s.radiusPoint.id === firstPoint.id)),
    )
    if (exists) {
      emitToast('这两个点已经创建了球体')
      return
    }
    const sphereName = genNextAvailableName(
      [...this.scene.spheres.values()].map((s) => s.name),
      0,
      (index) => `两点球${index + 1}`,
    )
    const sphere = new Sphere3(genId('sph'), sphereName, firstPoint, secondPoint)
    this.executeHistoryEntry(createAddSphereCommand(this.scene, sphere))
    this.scene.selection.clear()
    this.scene.selection.selectSphere(sphere.id)
  }

  tryCreateSphereRadius(centerPoint: Point3, radius: number) {
    if (radius <= 0) {
      emitToast('半径必须大于0')
      return
    }
    const sphereName = genNextAvailableName(
      [...this.scene.spheres.values()].map((s) => s.name),
      0,
      (index) => `半径球${index + 1}`,
    )
    const sphere = new Sphere3(
      genId('sph'),
      sphereName,
      centerPoint,
      null,
      false,
      true,
      false,
      Sphere3.DEFAULT_LABEL_OFFSET_X,
      Sphere3.DEFAULT_LABEL_OFFSET_Y,
      false,
      radius,
    )
    this.executeHistoryEntry(createAddRadiusSphereCommand(this.scene, sphere))
    this.scene.selection.clear()
    this.scene.selection.selectSphere(sphere.id)
  }

  getSphereCenterPoint(sphereId: string): Point3 | undefined {
    const sphere = this.getSphere(sphereId)
    return sphere?.centerPoint
  }

  getSphereRadiusPoint(sphereId: string): Point3 | undefined {
    const sphere = this.getSphere(sphereId)
    return sphere?.radiusPoint ?? undefined
  }

  getCone(coneId: string): Cone3 | undefined {
    return this.scene.cones.get(coneId)
  }

  getConeNameSuffix(coneId: string): string {
    const cone = this.getCone(coneId)
    if (!cone) return ''
    return cone.name.replace(/^法向圆锥|^圆锥/, '')
  }

  updateConeName(coneId: string, suffix: string) {
    const cone = this.getCone(coneId)
    if (!cone) return
    cone.name = `圆锥${suffix.trim()}`
    this.scene.markAllRenderDirty()
  }

  setConeValueVisible(coneId: string, visible: boolean) {
    const cone = this.getCone(coneId)
    if (!cone || cone.valueVisible === visible) return
    cone.valueVisible = visible
    this.scene.markAllRenderDirty()
  }

  setConeNameVisible(coneId: string, visible: boolean) {
    const cone = this.getCone(coneId)
    if (!cone || cone.nameVisible === visible) return
    cone.nameVisible = visible
    this.scene.markAllRenderDirty()
  }

  setConeLockState(coneId: string, locked: boolean) {
    const cone = this.getCone(coneId)
    if (!cone) return
    const conePoints = [cone.baseCenterPoint, cone.apexPoint]
    const endpointTransforms = conePoints
      .filter((point) => !point.locked)
      .map((point) => ({
        point,
        before: point.userLocked,
        after: locked,
      }))
      .filter((transform) => transform.before !== transform.after)

    if (cone.userLocked === locked && endpointTransforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [{ cone, before: cone.userLocked, after: locked }],
      ),
    )
  }

  updateCone(
    coneId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
    },
  ) {
    const cone = this.getCone(coneId)
    if (!cone) return
    const before = {
      name: cone.name,
      nameVisible: cone.nameVisible,
      valueVisible: cone.valueVisible,
      labelOffsetX: cone.labelOffsetX,
      labelOffsetY: cone.labelOffsetY,
      visible: cone.visible,
      userLocked: cone.userLocked,
    }
    const after = {
      name: patch.name ?? cone.name,
      nameVisible: patch.nameVisible ?? cone.nameVisible,
      valueVisible: patch.valueVisible ?? cone.valueVisible,
      labelOffsetX: patch.labelOffsetX ?? cone.labelOffsetX,
      labelOffsetY: patch.labelOffsetY ?? cone.labelOffsetY,
      visible: patch.visible ?? cone.visible,
      userLocked: patch.userLocked ?? cone.userLocked,
    }
    this.executeCommand(new UpdateConeCommand(cone.id, before, after, this.scene))
    this.scene.markAllRenderDirty()
  }

  isConeGeometryLocked(cone: Cone3): boolean {
    return cone.userLocked
  }

  getConeRadius(coneId: string): number {
    const cone = this.getCone(coneId)
    return cone?.getRadius() ?? 0
  }

  getConeHeight(coneId: string): number {
    const cone = this.getCone(coneId)
    return cone?.getHeight() ?? 0
  }

  updateConeRadius(coneId: string, nextRadius: number) {
    const cone = this.getCone(coneId)
    if (!cone) return
    const normalizedRadius = Math.max(0.1, nextRadius)
    const before = { radiusValue: cone.radiusValue }
    const after = { radiusValue: normalizedRadius }
    this.executeCommand(new UpdateConeRadiusCommand(this.scene, cone.id, before, after))
    this.scene.markAllRenderDirty()
  }

  updateConeHeight(coneId: string, nextHeight: number) {
    const cone = this.getCone(coneId)
    if (!cone) return
    const normalizedHeight = Math.max(0.1, nextHeight)
    this.executeCommand(new UpdateConeHeightCommand(this.scene, cone.id, cone.apexPoint.id, normalizedHeight))
    this.scene.markAllRenderDirty()
  }

  deleteCone(coneId: string) {
    const cone = this.getCone(coneId)
    if (!cone) return
    this.removeConstrainedPointsReferencing('cone', coneId)
    this.removeConstrainedPointsReferencing('coneBase', coneId)
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'coneBase' && pl.target.id === coneId,
    )
    const relatedParallelLines: ParallelLine3[] = []
    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl) }
    })
    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    const cascadedIntersectionPoints = this.collectIntersectionPointsFromRelatedLines(relatedPerpendicularLines, relatedParallelLines)
    this.executeHistoryEntry(createDeleteConeCommand(this.scene, cone, cascadedIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  tryCreateConeTwoPoint(baseCenterPoint: Point3, apexPoint: Point3, radius: number) {
    if (baseCenterPoint.id === apexPoint.id) {
      emitToast('请选择两个不同的点')
      return
    }
    if (radius <= 0) {
      emitToast('半径必须大于0')
      return
    }
    const coneName = genNextAvailableName(
      [...this.scene.cones.values()].map((c) => c.name),
      0,
      (index) => `圆锥${index + 1}`,
    )
    const cone = new Cone3(
      genId('cone'),
      coneName,
      baseCenterPoint,
      apexPoint,
      'twoPoint',
      false,
      true,
      false,
      Cone3.DEFAULT_LABEL_OFFSET_X,
      Cone3.DEFAULT_LABEL_OFFSET_Y,
      false,
      radius,
    )
    this.executeHistoryEntry(createAddConeCommand(this.scene, cone))
    this.scene.selection.clear()
    this.scene.selection.selectCone(cone.id)
  }

  tryCreateConeNormalCircle(normalCircle: Circle3, apexPoint: Point3) {
    const frame = normalCircle.getFrame(
      this.resolveDirectionVector(
        normalCircle.directionType ?? 'point',
        normalCircle.directionId ?? '',
      ),
    )
    if (!frame) {
      emitToast('法向圆无效，无法创建圆锥')
      return
    }
    const coneName = genNextAvailableName(
      [...this.scene.cones.values()].map((c) => c.name),
      0,
      (index) => `圆锥${index + 1}`,
    )
    const cone = new Cone3(
      genId('cone'),
      coneName,
      normalCircle.p1,
      apexPoint,
      'normalCircle',
      false,
      true,
      false,
      Cone3.DEFAULT_LABEL_OFFSET_X,
      Cone3.DEFAULT_LABEL_OFFSET_Y,
      false,
      frame.radius,
      normalCircle.id,
    )
    this.executeHistoryEntry(createAddConeCommand(this.scene, cone))
    this.scene.selection.clear()
    this.scene.selection.selectCone(cone.id)
  }

  getConeBaseCenterPoint(coneId: string): Point3 | undefined {
    const cone = this.getCone(coneId)
    return cone?.baseCenterPoint
  }

  getConeApexPoint(coneId: string): Point3 | undefined {
    const cone = this.getCone(coneId)
    return cone?.apexPoint
  }

  getCylinder(cylinderId: string): Cylinder3 | undefined {
    return this.scene.cylinders.get(cylinderId)
  }

  getCylinderNameSuffix(cylinderId: string): string {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return ''
    return cylinder.name.replace(/^法向圆柱|^圆柱/, '')
  }

  updateCylinderName(cylinderId: string, suffix: string) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return
    cylinder.name = `圆柱${suffix.trim()}`
    this.scene.markAllRenderDirty()
  }

  setCylinderValueVisible(cylinderId: string, visible: boolean) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder || cylinder.valueVisible === visible) return
    cylinder.valueVisible = visible
    this.scene.markAllRenderDirty()
  }

  setCylinderNameVisible(cylinderId: string, visible: boolean) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder || cylinder.nameVisible === visible) return
    cylinder.nameVisible = visible
    this.scene.markAllRenderDirty()
  }

  setCylinderLockState(cylinderId: string, locked: boolean) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return
    const cylinderPoints = [cylinder.bottomCenterPoint, cylinder.topCenterPoint]
    const endpointTransforms = cylinderPoints
      .filter((point) => !point.locked)
      .map((point) => ({
        point,
        before: point.userLocked,
        after: locked,
      }))
      .filter((transform) => transform.before !== transform.after)

    const circleTransforms: { circle: Circle3; before: boolean; after: boolean }[] = []
    if (cylinder.normalCircleId) {
      const bottomCircle = this.scene.circles.get(cylinder.normalCircleId)
      if (bottomCircle && bottomCircle.userLocked !== locked) {
        circleTransforms.push({
          circle: bottomCircle,
          before: bottomCircle.userLocked,
          after: locked,
        })
      }
    }
    if (cylinder.topNormalCircleId) {
      const topCircle = this.scene.circles.get(cylinder.topNormalCircleId)
      if (topCircle && topCircle.userLocked !== locked) {
        circleTransforms.push({ circle: topCircle, before: topCircle.userLocked, after: locked })
      }
    }

    if (
      cylinder.userLocked === locked &&
      endpointTransforms.length === 0 &&
      circleTransforms.length === 0
    )
      return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [],
        [],
        [],
        [],
        circleTransforms,
        [],
        [],
        [{ cylinder, before: cylinder.userLocked, after: locked }],
      ),
    )
  }

  updateCylinder(
    cylinderId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
    },
  ) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return
    const before = {
      name: cylinder.name,
      nameVisible: cylinder.nameVisible,
      valueVisible: cylinder.valueVisible,
      labelOffsetX: cylinder.labelOffsetX,
      labelOffsetY: cylinder.labelOffsetY,
      visible: cylinder.visible,
      userLocked: cylinder.userLocked,
    }
    const after = {
      name: patch.name ?? cylinder.name,
      nameVisible: patch.nameVisible ?? cylinder.nameVisible,
      valueVisible: patch.valueVisible ?? cylinder.valueVisible,
      labelOffsetX: patch.labelOffsetX ?? cylinder.labelOffsetX,
      labelOffsetY: patch.labelOffsetY ?? cylinder.labelOffsetY,
      visible: patch.visible ?? cylinder.visible,
      userLocked: patch.userLocked ?? cylinder.userLocked,
    }
    this.executeCommand(new UpdateCylinderCommand(cylinder.id, before, after, this.scene))
    this.scene.markAllRenderDirty()
  }

  isCylinderGeometryLocked(cylinder: Cylinder3): boolean {
    return cylinder.userLocked
  }

  getCylinderRadius(cylinderId: string): number {
    const cylinder = this.getCylinder(cylinderId)
    return cylinder?.getRadius() ?? 0
  }

  getCylinderHeight(cylinderId: string): number {
    const cylinder = this.getCylinder(cylinderId)
    return cylinder?.getHeight() ?? 0
  }

  updateCylinderRadius(cylinderId: string, nextRadius: number) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return
    const normalizedRadius = Math.max(0.1, nextRadius)
    const before = { radiusValue: cylinder.radiusValue }
    const after = { radiusValue: normalizedRadius }
    this.executeCommand(new UpdateCylinderRadiusCommand(this.scene, cylinder.id, before, after))
    this.scene.markAllRenderDirty()
  }

  updateCylinderHeight(cylinderId: string, nextHeight: number) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return
    const normalizedHeight = Math.max(0.1, nextHeight)
    this.executeCommand(
      new UpdateCylinderHeightCommand(this.scene, cylinder.id, cylinder.topCenterPoint.id, normalizedHeight),
    )
    this.scene.markAllRenderDirty()
  }

  deleteCylinder(cylinderId: string) {
    const cylinder = this.getCylinder(cylinderId)
    if (!cylinder) return
    this.removeConstrainedPointsReferencing('cylinder', cylinderId)
    this.removeConstrainedPointsReferencing('cylinderBottom', cylinderId)
    this.removeConstrainedPointsReferencing('cylinderTop', cylinderId)
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => (pl.target.type === 'cylinderBottom' || pl.target.type === 'cylinderTop') && pl.target.id === cylinderId,
    )
    const relatedParallelLines: ParallelLine3[] = []
    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl) }
    })
    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    const cascadedIntersectionPoints = this.collectIntersectionPointsFromRelatedLines(relatedPerpendicularLines, relatedParallelLines)
    this.executeHistoryEntry(createDeleteCylinderCommand(this.scene, cylinder, cascadedIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  tryCreateCylinderTwoPoint(bottomCenterPoint: Point3, topCenterPoint: Point3, radius: number) {
    if (bottomCenterPoint.id === topCenterPoint.id) {
      emitToast('请选择两个不同的点')
      return
    }
    if (radius <= 0) {
      emitToast('半径必须大于0')
      return
    }
    const cylinderName = genNextAvailableName(
      [...this.scene.cylinders.values()].map((c) => c.name),
      0,
      (index) => `圆柱${index + 1}`,
    )
    const bottomCircle = new Circle3(
      genId('c'),
      genNextAvailableName(
        [...this.scene.circles.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'c' : `c${index}`),
      ),
      bottomCenterPoint,
      bottomCenterPoint,
      bottomCenterPoint,
      false,
      true,
      false,
      Circle3.DEFAULT_LABEL_OFFSET_X,
      Circle3.DEFAULT_LABEL_OFFSET_Y,
      false,
      true,
      'normal',
      'point',
      topCenterPoint.id,
      radius,
    )
    const topCircle = new Circle3(
      genId('c'),
      genNextAvailableName(
        [...this.scene.circles.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'c' : `c${index}`),
      ),
      topCenterPoint,
      topCenterPoint,
      topCenterPoint,
      false,
      true,
      false,
      Circle3.DEFAULT_LABEL_OFFSET_X,
      Circle3.DEFAULT_LABEL_OFFSET_Y,
      false,
      true,
      'normal',
      'point',
      bottomCenterPoint.id,
      radius,
    )
    const cylinder = new Cylinder3(
      genId('cylinder'),
      cylinderName,
      bottomCenterPoint,
      topCenterPoint,
      'normalCircle',
      false,
      true,
      false,
      Cylinder3.DEFAULT_LABEL_OFFSET_X,
      Cylinder3.DEFAULT_LABEL_OFFSET_Y,
      false,
      radius,
      bottomCircle.id,
      topCircle.id,
    )
    this.executeHistoryEntry(createAddCylinderCommand(this.scene, cylinder, bottomCircle, topCircle))
    this.scene.selection.clear()
    this.scene.selection.selectCylinder(cylinder.id)
  }

  getCylinderBottomCenterPoint(cylinderId: string): Point3 | undefined {
    const cylinder = this.getCylinder(cylinderId)
    return cylinder?.bottomCenterPoint
  }

  getCylinderTopCenterPoint(cylinderId: string): Point3 | undefined {
    const cylinder = this.getCylinder(cylinderId)
    return cylinder?.topCenterPoint
  }

  getRegularPolygonConstraint(constraintId: string) {
    const constraint = this.scene.getRegularPolygonConstraint(constraintId)
    return constraint instanceof RegularPolygonConstraint ? constraint : null
  }

  getRegularPolygonNameSuffix(constraintId: string) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return ''
    return constraint.name.replace(/^正多边形/, '')
  }

  updateRegularPolygon(
    constraintId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      edgeLengthLocked?: boolean
      lockedEdgeLength?: number | null
    },
  ) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return
    const nextEdgeLengthLocked = patch.edgeLengthLocked ?? constraint.edgeLengthLocked
    let nextLockedEdgeLength = patch.lockedEdgeLength ?? constraint.lockedEdgeLength
    if (patch.edgeLengthLocked === true && !constraint.edgeLengthLocked) {
      nextLockedEdgeLength = constraint.getEdgeLength()
    } else if (patch.edgeLengthLocked === false) {
      nextLockedEdgeLength = null
    }
    const before = {
      name: constraint.name,
      nameVisible: constraint.nameVisible,
      valueVisible: constraint.valueVisible,
      edgeLengthLocked: constraint.edgeLengthLocked,
      lockedEdgeLength: constraint.lockedEdgeLength,
    }
    const after = {
      name: patch.name ?? constraint.name,
      nameVisible: patch.nameVisible ?? constraint.nameVisible,
      valueVisible: patch.valueVisible ?? constraint.valueVisible,
      edgeLengthLocked: nextEdgeLengthLocked,
      lockedEdgeLength: nextLockedEdgeLength,
    }
    this.executeCommand(new UpdateRegularPolygonCommand(constraint.constraintId, before, after, this.scene))
    const face = this.scene.faces.get(constraint.faceId)
    if (face) {
      face.nameVisible = after.nameVisible
      face.valueVisible = after.valueVisible
    }
    this.scene.markAllRenderDirty()
  }

  updateRegularPolygonName(constraintId: string, suffix: string) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return
    constraint.name = `正多边形${suffix}`
  }

  setRegularPolygonValueVisible(constraintId: string, visible: boolean) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint || constraint.valueVisible === visible) return
    constraint.valueVisible = visible
    this.scene.markAllRenderDirty()
  }

  setRegularPolygonLockState(constraintId: string, locked: boolean) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return
    constraint.ownerPointIds.forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.userLocked = locked
    })
    constraint.dependentLayouts.forEach(({ pointId }) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.userLocked = locked
    })
    const face = this.scene.faces.get(constraint.faceId)
    if (face && face.userLocked !== locked) {
      face.userLocked = locked
    }
  }

  setRegularPolygonEdgeLengthLockState(constraintId: string, locked: boolean) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return
    constraint.edgeLengthLocked = locked
    if (!locked) {
      constraint.lockedEdgeLength = null
      return
    }
    constraint.lockedEdgeLength = constraint.getEdgeLength()
  }

  updateRegularPolygonEdgeLength(constraintId: string, nextLength: number) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return
    const p1 = this.scene.points.get(constraint.ownerPointIds[0])
    const p2 = this.scene.points.get(constraint.ownerPointIds[1])
    if (!p1 || !p2) return
    const current = new Vec3(
      p2.position.x - p1.position.x,
      p2.position.y - p1.position.y,
      p2.position.z - p1.position.z,
    )
    const currentLength = Math.hypot(current.x, current.y, current.z)
    if (currentLength <= 1e-6) return
    const normalizedLength = Math.max(0.1, nextLength)
    this.setPointsPositions([
      {
        id: p2.id,
        position: new Vec3(
          p1.position.x + (current.x / currentLength) * normalizedLength,
          p1.position.y + (current.y / currentLength) * normalizedLength,
          p1.position.z + (current.z / currentLength) * normalizedLength,
        ),
      },
    ])
    if (constraint.edgeLengthLocked) {
      constraint.lockedEdgeLength = normalizedLength
    }
  }

  getRegularPolygonOwnerPoints(constraintId: string) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return []
    return constraint.ownerPointIds
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)
  }

  getRegularPolygonEdgeLength(constraintId: string) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    return constraint?.getEdgeLength() ?? 0
  }

  getRegularPolygonArea(constraintId: string) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    return constraint?.getArea() ?? 0
  }

  private getCubePointIds(constraint: CubeConstraint) {
    return [
      ...new Set([
        ...constraint.ownerPointIds,
        ...constraint.dependentLayouts.map((item) => item.pointId),
      ]),
    ]
  }

  private buildCubeTranslationMergeCommand(
    keepPoint: Point3,
    removePoint: Point3,
    keepConstraint: CubeConstraint,
    removeConstraint: CubeConstraint,
  ) {
    if (keepPoint.cubeRole !== 'owner' || removePoint.cubeRole !== 'owner') {
      emitToast('不同立体之间仅支持合并两个原始点')
      return null
    }

    const movingPointIds = this.getCubePointIds(removeConstraint)
    if (movingPointIds.includes(keepPoint.id)) {
      emitToast('当前合并会让同一立体内部顶点重合，已取消')
      return null
    }

    const movingPoints = movingPointIds
      .map((pointId) => this.scene.points.get(pointId))
      .filter((point): point is Point3 => point !== undefined)

    const blockedPoint = movingPoints.find(
      (point) => point.id !== removePoint.id && this.isPointCoordinateLocked(point),
    )
    if (blockedPoint) {
      emitToast('被移动立体包含锁定点，无法合并')
      return null
    }

    const otherOwnerId =
      removeConstraint.ownerPointIds[0] === removePoint.id
        ? removeConstraint.ownerPointIds[1]
        : removeConstraint.ownerPointIds[0]
    if (otherOwnerId === keepPoint.id) {
      emitToast('当前合并会让立体的边长退化为 0，已取消')
      return null
    }

    const delta = new Vec3(
      keepPoint.position.x - removePoint.position.x,
      keepPoint.position.y - removePoint.position.y,
      keepPoint.position.z - removePoint.position.z,
    )

    const transforms = movingPoints
      .map((point) => {
        const before = point.position.clone()
        const after =
          point.id === removePoint.id
            ? keepPoint.position.clone()
            : new Vec3(before.x + delta.x, before.y + delta.y, before.z + delta.z)
        if (samePosition(before, after)) return null
        return { pointId: point.id, before, after }
      })
      .filter(
        (transform): transform is { pointId: string; before: Vec3; after: Vec3 } =>
          transform !== null,
      )

    const translatedOtherOwner = movingPoints.find((point) => point.id === otherOwnerId)
    if (!translatedOtherOwner) {
      emitToast('未找到立体的参考棱端点，无法执行合并')
      return null
    }
    const nextOtherOwnerPosition = new Vec3(
      translatedOtherOwner.position.x + delta.x,
      translatedOtherOwner.position.y + delta.y,
      translatedOtherOwner.position.z + delta.z,
    )
    if (samePosition(nextOtherOwnerPosition, keepPoint.position)) {
      emitToast('当前合并会让立体的边长退化为 0，已取消')
      return null
    }

    return createMergeCubePointsCommand(this.scene, keepPoint, removePoint, transforms)
  }

  private snapSolidOwnerPosition(constraint: CubeConstraint, position: Vec3, comparePoint: Point3) {
    const currentLength = Math.hypot(
      comparePoint.position.x - position.x,
      comparePoint.position.y - position.y,
      comparePoint.position.z - position.z,
    )
    const snapThreshold = Math.max(SOLID_ALIGNMENT_SNAP_EPSILON, currentLength * 0.08)
    const nextPosition = position.clone()

    ;(['x', 'y', 'z'] as const).forEach((axis) => {
      if (Math.abs(nextPosition[axis] - comparePoint.position[axis]) <= snapThreshold) {
        nextPosition[axis] = comparePoint.position[axis]
      }
    })

    return nextPosition
  }

  private rotateCubeByDependentPoint(cubeId: string, pointId: string, position: Vec3) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    const layout = constraint.dependentLayouts.find((item) => item.pointId === pointId)
    if (!layout) return

    const ownerA = this.scene.points.get(constraint.ownerPointIds[0])
    const ownerB = this.scene.points.get(constraint.ownerPointIds[1])
    if (!ownerA || !ownerB) return

    const edge = new Vec3(
      ownerB.position.x - ownerA.position.x,
      ownerB.position.y - ownerA.position.y,
      ownerB.position.z - ownerA.position.z,
    )
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
    if (edgeLength <= 1e-8) return
    const uAxis = normalizeVec3(edge)
    if (!uAxis) return

    const baseOffset = new Vec3(
      ownerA.position.x + uAxis.x * layout.x * edgeLength,
      ownerA.position.y + uAxis.y * layout.x * edgeLength,
      ownerA.position.z + uAxis.z * layout.x * edgeLength,
    )
    const relative = new Vec3(
      position.x - baseOffset.x,
      position.y - baseOffset.y,
      position.z - baseOffset.z,
    )
    const projected = projectPerpendicularVec3(relative, uAxis)
    const projectedDir = normalizeVec3(projected)
    const yzLength = Math.hypot(layout.y, layout.z)
    if (!projectedDir || yzLength <= 1e-8) return

    const perpAxis = normalizeVec3(crossVec3(uAxis, projectedDir))
    if (!perpAxis) return

    const vAxis = new Vec3(
      (layout.y / yzLength) * projectedDir.x - (layout.z / yzLength) * perpAxis.x,
      (layout.y / yzLength) * projectedDir.y - (layout.z / yzLength) * perpAxis.y,
      (layout.y / yzLength) * projectedDir.z - (layout.z / yzLength) * perpAxis.z,
    )
    const axisHintBefore = constraint.getVAxisHint().clone()
    constraint.setAxisHint(vAxis)
    const axes = constraint.getResolvedAxes()
    if (!axes) return

    const transforms = constraint.dependentLayouts
      .map((item) => {
        const point = this.scene.points.get(item.pointId)
        if (!point || this.isPointCoordinateLocked(point)) return null
        const after = constraint.getLayoutPosition(item, axes)
        if (
          Math.abs(after.x - point.position.x) <= 1e-6 &&
          Math.abs(after.y - point.position.y) <= 1e-6 &&
          Math.abs(after.z - point.position.z) <= 1e-6
        ) {
          return null
        }
        return {
          pointId: point.id,
          before: point.position.clone(),
          after,
        }
      })
      .filter(
        (transform): transform is { pointId: string; before: Vec3; after: Vec3 } =>
          transform !== null,
      )

    if (transforms.length === 0) return
    const axisHintChanges = [
      {
        constraintType: 'cube' as const,
        constraintId: constraint.cubeId,
        before: axisHintBefore,
        after: vAxis,
      },
    ]
    if (transforms.length === 1) {
      const transform = transforms[0]!
      this.executeCommand(
        new TransformCommand(transform.pointId, transform.before, transform.after, axisHintChanges, this.scene),
      )
      return
    }
    this.executeCommand(new TransformPointsCommand(transforms, axisHintChanges, this.scene))
  }

  private rotateRegularPolygonByDependentPoint(
    constraintId: string,
    pointId: string,
    position: Vec3,
  ) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return

    const ownerA = this.scene.points.get(constraint.ownerPointIds[0])
    const ownerB = this.scene.points.get(constraint.ownerPointIds[1])
    if (!ownerA || !ownerB) return

    const edge = new Vec3(
      ownerB.position.x - ownerA.position.x,
      ownerB.position.y - ownerA.position.y,
      ownerB.position.z - ownerA.position.z,
    )
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
    if (edgeLength <= 1e-8) return
    const uAxis = normalizeVec3(edge)
    if (!uAxis) return

    const layout = constraint.dependentLayouts.find((item) => item.pointId === pointId)
    if (!layout) return

    const circumradius = edgeLength / (2 * Math.sin(Math.PI / constraint.vertexCount))
    const alpha =
      -Math.PI / 2 -
      Math.PI / constraint.vertexCount +
      (2 * Math.PI * layout.angleIndex) / constraint.vertexCount
    const cosA = Math.cos(alpha)

    const baseOffset = new Vec3(
      ownerA.position.x + (edgeLength / 2 + circumradius * cosA) * uAxis.x,
      ownerA.position.y + (edgeLength / 2 + circumradius * cosA) * uAxis.y,
      ownerA.position.z + (edgeLength / 2 + circumradius * cosA) * uAxis.z,
    )

    const relative = new Vec3(
      position.x - baseOffset.x,
      position.y - baseOffset.y,
      position.z - baseOffset.z,
    )
    const projected = projectPerpendicularVec3(relative, uAxis)
    const projectedDir = normalizeVec3(projected)
    if (!projectedDir) return

    const axisHintBefore = constraint.getVAxisHint().clone()
    constraint.setAxisHint(projectedDir)

    const axes = constraint.getResolvedAxes()
    if (!axes) return

    const transforms = constraint.dependentLayouts
      .map((item) => {
        const point = this.scene.points.get(item.pointId)
        if (!point || this.isPointCoordinateLocked(point)) return null
        const after = constraint.getLayoutPosition(item.angleIndex, axes)
        if (
          Math.abs(after.x - point.position.x) <= 1e-6 &&
          Math.abs(after.y - point.position.y) <= 1e-6 &&
          Math.abs(after.z - point.position.z) <= 1e-6
        ) {
          return null
        }
        return {
          pointId: point.id,
          before: point.position.clone(),
          after,
        }
      })
      .filter(
        (transform): transform is { pointId: string; before: Vec3; after: Vec3 } =>
          transform !== null,
      )

    if (transforms.length === 0) return
    const axisHintChanges = [
      {
        constraintType: 'regularPolygon' as const,
        constraintId: constraint.constraintId,
        before: axisHintBefore,
        after: projectedDir,
      },
    ]
    if (transforms.length === 1) {
      this.executeCommand(
        new TransformCommand(
          transforms[0]!.pointId,
          transforms[0]!.before,
          transforms[0]!.after,
          axisHintChanges,
          this.scene,
        ),
      )
      return
    }
    this.executeCommand(new TransformPointsCommand(transforms, axisHintChanges, this.scene))
  }

  private setRegularPolygonOwnerPointPosition(
    constraintId: string,
    pointId: string,
    position: Vec3,
  ) {
    const constraint = this.getRegularPolygonConstraint(constraintId)
    if (!constraint) return
    const point = this.scene.points.get(pointId)
    if (!point) return
    const otherId =
      constraint.ownerPointIds[0] === pointId
        ? constraint.ownerPointIds[1]
        : constraint.ownerPointIds[0]
    const otherPoint = this.scene.points.get(otherId)
    if (!otherPoint) return

    if (!constraint.edgeLengthLocked || !constraint.lockedEdgeLength) {
      this.setPointsPositions([{ id: pointId, position }])
      return
    }

    let direction = new Vec3(
      position.x - otherPoint.position.x,
      position.y - otherPoint.position.y,
      position.z - otherPoint.position.z,
    )
    let directionLength = Math.hypot(direction.x, direction.y, direction.z)
    if (directionLength <= 1e-6) {
      direction = new Vec3(
        point.position.x - otherPoint.position.x,
        point.position.y - otherPoint.position.y,
        point.position.z - otherPoint.position.z,
      )
      directionLength = Math.hypot(direction.x, direction.y, direction.z)
    }
    if (directionLength <= 1e-6) {
      direction = new Vec3(1, 0, 0)
      directionLength = 1
    }

    this.setPointsPositions([
      {
        id: pointId,
        position: new Vec3(
          otherPoint.position.x + (direction.x / directionLength) * constraint.lockedEdgeLength,
          otherPoint.position.y + (direction.y / directionLength) * constraint.lockedEdgeLength,
          otherPoint.position.z + (direction.z / directionLength) * constraint.lockedEdgeLength,
        ),
      },
    ])
  }

  private resolveCubeAxesFromPositions(constraint: CubeConstraint, ownerA: Vec3, ownerB: Vec3) {
    const edge = new Vec3(ownerB.x - ownerA.x, ownerB.y - ownerA.y, ownerB.z - ownerA.z)
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
    if (edgeLength <= 1e-8) return null

    const uAxis = normalizeVec3(edge)
    if (!uAxis) return null

    const hintSource = null
    const alignmentHint =
      hintSource && Math.abs(dotVec3(hintSource, uAxis)) <= 1 - AXIS_ALIGNMENT_EPSILON
        ? crossVec3(hintSource, uAxis)
        : null

    const projectedHint = projectPerpendicularVec3(
      alignmentHint ?? constraint.getVAxisHint(),
      uAxis,
    )
    const fallbackProjected = projectPerpendicularVec3(chooseFallbackAxisVec3(uAxis), uAxis)
    const vAxis = normalizeVec3(projectedHint) ?? normalizeVec3(fallbackProjected)
    if (!vAxis) return null
    const wAxis = normalizeVec3(crossVec3(uAxis, vAxis))
    if (!wAxis) return null

    return {
      origin: ownerA,
      edgeLength,
      uAxis,
      vAxis,
      wAxis,
    }
  }

  private applyCubeConstraintPositions(positionOverrides: Map<string, Vec3>) {
    this.getCubeConstraints().forEach((constraint) => {
      const ownerA =
        positionOverrides.get(constraint.ownerPointIds[0]) ??
        this.scene.points.get(constraint.ownerPointIds[0])?.position
      const ownerB =
        positionOverrides.get(constraint.ownerPointIds[1]) ??
        this.scene.points.get(constraint.ownerPointIds[1])?.position
      if (!ownerA || !ownerB) return

      const draggedDependent = constraint.dependentLayouts.find(
        ({ pointId }) =>
          positionOverrides.has(pointId) && this.scene.activeDraggedPointIds.has(pointId),
      )

      if (draggedDependent) {
        const edge = new Vec3(ownerB.x - ownerA.x, ownerB.y - ownerA.y, ownerB.z - ownerA.z)
        const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
        const uAxis = normalizeVec3(edge)
        const desired = positionOverrides.get(draggedDependent.pointId)
        if (desired && uAxis && edgeLength > 1e-8) {
          const baseOffset = new Vec3(
            ownerA.x + uAxis.x * draggedDependent.x * edgeLength,
            ownerA.y + uAxis.y * draggedDependent.x * edgeLength,
            ownerA.z + uAxis.z * draggedDependent.x * edgeLength,
          )
          const relative = new Vec3(
            desired.x - baseOffset.x,
            desired.y - baseOffset.y,
            desired.z - baseOffset.z,
          )
          const projected = projectPerpendicularVec3(relative, uAxis)
          const projectedDir = normalizeVec3(projected)
          const yzLength = Math.hypot(draggedDependent.y, draggedDependent.z)
          if (projectedDir && yzLength > 1e-8) {
            const perpAxis = normalizeVec3(crossVec3(uAxis, projectedDir))
            if (perpAxis) {
              constraint.setAxisHint(
                new Vec3(
                  (draggedDependent.y / yzLength) * projectedDir.x -
                    (draggedDependent.z / yzLength) * perpAxis.x,
                  (draggedDependent.y / yzLength) * projectedDir.y -
                    (draggedDependent.z / yzLength) * perpAxis.y,
                  (draggedDependent.y / yzLength) * projectedDir.z -
                    (draggedDependent.z / yzLength) * perpAxis.z,
                ),
              )
            }
          }
        }
      }

      const axes = this.resolveCubeAxesFromPositions(constraint, ownerA, ownerB)
      if (!axes) return

      constraint.dependentLayouts.forEach((layout) => {
        const point = this.scene.points.get(layout.pointId)
        if (!point || this.isPointCoordinateLocked(point)) return
        positionOverrides.set(
          layout.pointId,
          new Vec3(
            axes.origin.x +
              axes.uAxis.x * layout.x * axes.edgeLength +
              axes.vAxis.x * layout.y * axes.edgeLength +
              axes.wAxis.x * layout.z * axes.edgeLength,
            axes.origin.y +
              axes.uAxis.y * layout.x * axes.edgeLength +
              axes.vAxis.y * layout.y * axes.edgeLength +
              axes.wAxis.y * layout.z * axes.edgeLength,
            axes.origin.z +
              axes.uAxis.z * layout.x * axes.edgeLength +
              axes.vAxis.z * layout.y * axes.edgeLength +
              axes.wAxis.z * layout.z * axes.edgeLength,
          ),
        )
      })
    })
  }

  private applyRegularPolygonConstraintPositions(positionOverrides: Map<string, Vec3>) {
    this.getRegularPolygonConstraints().forEach((constraint) => {
      const ownerA =
        positionOverrides.get(constraint.ownerPointIds[0]) ??
        this.scene.points.get(constraint.ownerPointIds[0])?.position
      const ownerB =
        positionOverrides.get(constraint.ownerPointIds[1]) ??
        this.scene.points.get(constraint.ownerPointIds[1])?.position
      if (!ownerA || !ownerB) return

      const edge = new Vec3(ownerB.x - ownerA.x, ownerB.y - ownerA.y, ownerB.z - ownerA.z)
      const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
      if (edgeLength <= 1e-8) return
      const uAxis = normalizeVec3(edge)
      if (!uAxis) return

      const draggedDependent = constraint.dependentLayouts.find(
        ({ pointId }) =>
          positionOverrides.has(pointId) && this.scene.activeDraggedPointIds.has(pointId),
      )

      if (draggedDependent) {
        const desired = positionOverrides.get(draggedDependent.pointId)
        if (desired && edgeLength > 1e-8) {
          const circumradius = edgeLength / (2 * Math.sin(Math.PI / constraint.vertexCount))
          const alpha =
            -Math.PI / 2 -
            Math.PI / constraint.vertexCount +
            (2 * Math.PI * draggedDependent.angleIndex) / constraint.vertexCount
          const cosA = Math.cos(alpha)
          const baseOffset = new Vec3(
            ownerA.x + (edgeLength / 2 + circumradius * cosA) * uAxis.x,
            ownerA.y + (edgeLength / 2 + circumradius * cosA) * uAxis.y,
            ownerA.z + (edgeLength / 2 + circumradius * cosA) * uAxis.z,
          )
          const relative = new Vec3(
            desired.x - baseOffset.x,
            desired.y - baseOffset.y,
            desired.z - baseOffset.z,
          )
          const projected = projectPerpendicularVec3(relative, uAxis)
          const projectedDir = normalizeVec3(projected)
          if (projectedDir) {
            constraint.setAxisHint(projectedDir)
          }
        }
      }

      const axes = this.resolveRegularPolygonAxesFromPositions(constraint, ownerA, ownerB)
      if (!axes) return

      constraint.dependentLayouts.forEach((layout) => {
        const point = this.scene.points.get(layout.pointId)
        if (!point || this.isPointCoordinateLocked(point)) return
        const alpha =
          -Math.PI / 2 -
          Math.PI / constraint.vertexCount +
          (2 * Math.PI * layout.angleIndex) / constraint.vertexCount
        const cosA = Math.cos(alpha)
        const sinA = Math.sin(alpha)
        const pos = new Vec3(
          axes.center.x + axes.circumradius * (axes.uAxis.x * cosA + axes.vAxis.x * sinA),
          axes.center.y + axes.circumradius * (axes.uAxis.y * cosA + axes.vAxis.y * sinA),
          axes.center.z + axes.circumradius * (axes.uAxis.z * cosA + axes.vAxis.z * sinA),
        )
        positionOverrides.set(layout.pointId, pos)
      })
    })
  }

  private applySphereConstraintPositions(positionOverrides: Map<string, Vec3>) {
    this.scene.spheres.forEach((sphere) => {
      const centerOverride = positionOverrides.get(sphere.centerPoint.id)
      if (!centerOverride) return
      if (!this.scene.activeDraggedPointIds.has(sphere.centerPoint.id)) return
      if (sphere.centerPoint.sphereRole !== 'center') return

      if (!sphere.radiusPoint) return

      const currentCenter =
        this.scene.points.get(sphere.centerPoint.id)?.position ?? sphere.centerPoint.position
      const delta = new Vec3(
        centerOverride.x - currentCenter.x,
        centerOverride.y - currentCenter.y,
        centerOverride.z - currentCenter.z,
      )

      const radiusPointOverride = positionOverrides.get(sphere.radiusPoint.id)
      if (radiusPointOverride) return

      const radiusPos =
        this.scene.points.get(sphere.radiusPoint.id)?.position ?? sphere.radiusPoint.position
      positionOverrides.set(
        sphere.radiusPoint.id,
        new Vec3(radiusPos.x + delta.x, radiusPos.y + delta.y, radiusPos.z + delta.z),
      )
    })
  }

  private resolveRegularPolygonAxesFromPositions(
    constraint: RegularPolygonConstraint,
    ownerA: Vec3,
    ownerB: Vec3,
  ) {
    const edge = new Vec3(ownerB.x - ownerA.x, ownerB.y - ownerA.y, ownerB.z - ownerA.z)
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
    if (edgeLength <= 1e-8) return null

    const uAxis = normalizeVec3(edge)
    if (!uAxis) return null

    const projectedHint = projectPerpendicularVec3(constraint.getVAxisHint(), uAxis)
    const fallbackProjected = projectPerpendicularVec3(chooseFallbackAxisVec3(uAxis), uAxis)
    const vAxis = normalizeVec3(projectedHint) ?? normalizeVec3(fallbackProjected)
    if (!vAxis) return null

    const circumradius = edgeLength / (2 * Math.sin(Math.PI / constraint.vertexCount))
    const halfTan = edgeLength / (2 * Math.tan(Math.PI / constraint.vertexCount))
    const center = new Vec3(
      ownerA.x + (edgeLength / 2) * uAxis.x + halfTan * vAxis.x,
      ownerA.y + (edgeLength / 2) * uAxis.y + halfTan * vAxis.y,
      ownerA.z + (edgeLength / 2) * uAxis.z + halfTan * vAxis.z,
    )

    return { center, circumradius, uAxis, vAxis, edgeLength }
  }

  translateCubeByDelta(cubeId: string, delta: Vec3) {
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) return
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    const owners = constraint.ownerPointIds
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)
    if (owners.length !== 2) return
    this.setPointsPositions(
      owners.map((point) => ({
        id: point.id,
        position: point.position.add(delta),
      })),
    )
  }

  setCubeOwnerPointPosition(cubeId: string, pointId: string, position: Vec3) {
    const constraint = this.getCubeConstraint(cubeId)
    if (!constraint) return
    const point = this.scene.points.get(pointId)
    if (!point) return
    const otherId =
      constraint.ownerPointIds[0] === pointId
        ? constraint.ownerPointIds[1]
        : constraint.ownerPointIds[0]
    const otherPoint = this.scene.points.get(otherId)
    if (!otherPoint) return
    const snappedPosition = this.snapSolidOwnerPosition(constraint, position, otherPoint)
    if (!constraint.edgeLengthLocked || !constraint.lockedEdgeLength) {
      this.setPointsPositions([{ id: pointId, position: snappedPosition }])
      return
    }

    let direction = new Vec3(
      snappedPosition.x - otherPoint.position.x,
      snappedPosition.y - otherPoint.position.y,
      snappedPosition.z - otherPoint.position.z,
    )
    let directionLength = Math.hypot(direction.x, direction.y, direction.z)
    if (directionLength <= 1e-6) {
      direction = new Vec3(
        point.position.x - otherPoint.position.x,
        point.position.y - otherPoint.position.y,
        point.position.z - otherPoint.position.z,
      )
      directionLength = Math.hypot(direction.x, direction.y, direction.z)
    }
    if (directionLength <= 1e-6) {
      direction = new Vec3(1, 0, 0)
      directionLength = 1
    }

    this.setPointsPositions([
      {
        id: pointId,
        position: new Vec3(
          otherPoint.position.x + (direction.x / directionLength) * constraint.lockedEdgeLength,
          otherPoint.position.y + (direction.y / directionLength) * constraint.lockedEdgeLength,
          otherPoint.position.z + (direction.z / directionLength) * constraint.lockedEdgeLength,
        ),
      },
    ])
  }

  /**
   * 拖动棱柱 dependent 点：平移整个棱柱（owner + 所有 dependent 点同步移动 delta）。
   */
  private translatePrism(prismId: string, draggedPointId: string, position: Vec3) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return
    const dragged = this.scene.points.get(draggedPointId)
    if (!dragged || this.isPointCoordinateLocked(dragged)) return

    const delta = new Vec3(
      position.x - dragged.position.x,
      position.y - dragged.position.y,
      position.z - dragged.position.z,
    )
    if (Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) < 1e-9 && Math.abs(delta.z) < 1e-9) return

    // 收集棱柱所有关联点（owner + dependent），统一平移
    const allPointIds = new Set<string>([
      ...constraint.ownerPointIds,
      ...constraint.dependentLayouts.map((l) => l.pointId),
    ])
    const transforms: Array<{ pointId: string; before: Vec3; after: Vec3 }> = []
    allPointIds.forEach((pid) => {
      const p = this.scene.points.get(pid)
      if (!p || this.isPointCoordinateLocked(p)) return
      const before = p.position.clone()
      const after = new Vec3(before.x + delta.x, before.y + delta.y, before.z + delta.z)
      if (
        Math.abs(after.x - before.x) <= 1e-9 &&
        Math.abs(after.y - before.y) <= 1e-9 &&
        Math.abs(after.z - before.z) <= 1e-9
      )
        return
      transforms.push({ pointId: pid, before, after })
    })

    if (transforms.length === 0) return
    if (transforms.length === 1) {
      const t = transforms[0]!
      this.executeCommand(new TransformCommand(t.pointId, t.before, t.after, [], this.scene))
      return
    }
    this.executeCommand(new TransformPointsCommand(transforms, [], this.scene))
  }

  /**
   * 拖动棱柱 owner 点（最高点或底面参考顶点）：
   * 移动该点，并重新求解所有 dependent 点位置。
   */
  private setPrismOwnerPointPosition(prismId: string, pointId: string, position: Vec3) {
    const constraint = this.getPrismConstraint(prismId)
    if (!constraint) return
    const point = this.scene.points.get(pointId)
    if (!point || this.isPointCoordinateLocked(point)) return

    const ownerBefore = point.position.clone()
    if (
      Math.abs(position.x - ownerBefore.x) <= 1e-9 &&
      Math.abs(position.y - ownerBefore.y) <= 1e-9 &&
      Math.abs(position.z - ownerBefore.z) <= 1e-9
    )
      return

    // 垂直保持模式下移动最高点时，需要同时记录并更新缓存高度
    let beforeVerticalHeight: number | null = null
    let afterVerticalHeight: number | null = null
    if (constraint.keepVertical && pointId === constraint.ownerPointIds[1]) {
      beforeVerticalHeight = constraint.getRawVerticalHeight()
      afterVerticalHeight = constraint.computeVerticalHeightForPosition(position)
    }

    this.executeCommand(
      new TransformPrismOwnerPointCommand(
        this.scene,
        constraint,
        pointId,
        ownerBefore,
        position.clone(),
        beforeVerticalHeight,
        afterVerticalHeight,
      ),
    )
  }

  isPointCoordinateLocked(point: Point3 | null | undefined) {
    return Boolean(
      point &&
        (point.locked || point.userLocked || this.isPointConstrainedByLockedLinear(point.id)),
    )
  }

  isLineLocked(line: Line3 | null | undefined) {
    return Boolean(
      line &&
        (line.userLocked ||
          (this.isPointCoordinateLocked(line.p1) && this.isPointCoordinateLocked(line.p2))),
    )
  }

  isRayLocked(ray: Ray3 | null | undefined) {
    return Boolean(
      ray &&
        (ray.userLocked ||
          (this.isPointCoordinateLocked(ray.p1) && this.isPointCoordinateLocked(ray.p2))),
    )
  }

  isStraightLineLocked(line: StraightLine3 | null | undefined) {
    return Boolean(
      line &&
        (line.userLocked ||
          (this.isPointCoordinateLocked(line.p1) && this.isPointCoordinateLocked(line.p2))),
    )
  }

  isCircleLocked(circle: Circle3 | null | undefined) {
    if (!circle) return false
    if (circle.userLocked) return true
    if (circle.isNormalCircle()) {
      return this.isPointCoordinateLocked(circle.p1)
    }
    return (
      this.isPointCoordinateLocked(circle.p1) &&
      this.isPointCoordinateLocked(circle.p2) &&
      this.isPointCoordinateLocked(circle.p3)
    )
  }

  isCircleGeometryLocked(circle: Circle3 | null | undefined) {
    if (!circle) return false
    if (circle.userLocked) return true
    if (circle.isNormalCircle()) {
      return this.isPointCoordinateLocked(circle.p1)
    }
    return (
      this.isPointCoordinateLocked(circle.p1) ||
      this.isPointCoordinateLocked(circle.p2) ||
      this.isPointCoordinateLocked(circle.p3)
    )
  }

  isLineGeometryLocked(line: Line3 | null | undefined) {
    return Boolean(
      line &&
        (line.userLocked ||
          this.isPointCoordinateLocked(line.p1) ||
          this.isPointCoordinateLocked(line.p2)),
    )
  }

  isRayGeometryLocked(ray: Ray3 | null | undefined) {
    return Boolean(
      ray &&
        (ray.userLocked ||
          this.isPointCoordinateLocked(ray.p1) ||
          this.isPointCoordinateLocked(ray.p2)),
    )
  }

  isStraightLineGeometryLocked(line: StraightLine3 | null | undefined) {
    return Boolean(
      line &&
        (line.userLocked ||
          this.isPointCoordinateLocked(line.p1) ||
          this.isPointCoordinateLocked(line.p2)),
    )
  }

  isFaceLocked(face: PlanarPolygon | null | undefined) {
    return Boolean(
      face &&
        (face.userLocked ||
          face
            .getMemberPoints(this.scene.points)
            .every((point) => this.isPointCoordinateLocked(point))),
    )
  }

  isFaceGeometryLocked(face: PlanarPolygon | null | undefined) {
    return Boolean(
      face &&
        (face.userLocked ||
          face
            .getMemberPoints(this.scene.points)
            .some((point) => this.isPointCoordinateLocked(point))),
    )
  }

  setPointLockState(pointId: string, locked: boolean) {
    const point = this.scene.points.get(pointId)
    if (!point || point.locked) return

    const relatedLines = [...this.scene.lines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedRays = [...this.scene.rays.values()].filter(
      (ray) => ray.p1.id === pointId || ray.p2.id === pointId,
    )
    const relatedVectors = [...this.scene.vectors.values()].filter(
      (vector) => vector.p1.id === pointId || vector.p2.id === pointId,
    )
    const relatedStraightLines = [...this.scene.straightLines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedCircles = [...this.scene.circles.values()].filter(
      (circle) => circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId,
    )
    const relatedSpheres = [...this.scene.spheres.values()].filter(
      (sphere) =>
        sphere.centerPoint.id === pointId ||
        (sphere.radiusPoint && sphere.radiusPoint.id === pointId),
    )
    const relatedCones = [...this.scene.cones.values()].filter(
      (cone) => cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId,
    )
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.p1.id === pointId || pl.target.id === pointId,
    )
    const relatedFaces = getFacesByPointId(this, pointId)

    if (!locked && relatedFaces.length > 0) {
      const faceCascade = buildFaceUnlockCascade(this, relatedFaces)
      if (
        faceCascade.pointTransforms.length === 0 &&
        faceCascade.lineTransforms.length === 0 &&
        faceCascade.faceTransforms.length === 0
      ) {
        return
      }

      this.executeHistoryEntry(
        createSyncLockStateCommand(
          this.scene,
          faceCascade.pointTransforms,
          faceCascade.lineTransforms,
          [],
          [],
          [],
          faceCascade.faceTransforms,
        ),
      )
      return
    }

    const pointTransforms = [
      {
        point,
        before: point.userLocked,
        after: locked,
      },
    ].filter((transform) => transform.before !== transform.after)

    const lineTransforms = locked
      ? []
      : relatedLines
          .map((line) => ({
            line,
            before: line.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const rayTransforms = locked
      ? []
      : relatedRays
          .map((ray) => ({
            ray,
            before: ray.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const straightLineTransforms = locked
      ? []
      : relatedStraightLines
          .map((line) => ({
            line,
            before: line.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const vectorTransforms = locked
      ? []
      : relatedVectors
          .map((vector) => ({
            vector,
            before: vector.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const circleTransforms = locked
      ? []
      : relatedCircles
          .map((circle) => ({
            circle,
            before: circle.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const sphereTransforms = locked
      ? []
      : relatedSpheres
          .map((sphere) => ({
            sphere,
            before: sphere.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const coneTransforms = locked
      ? []
      : relatedCones
          .map((cone) => ({
            cone,
            before: cone.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const perpendicularLineTransforms = locked
      ? []
      : relatedPerpendicularLines
          .map((line) => ({
            line,
            before: line.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    if (
      pointTransforms.length === 0 &&
      lineTransforms.length === 0 &&
      straightLineTransforms.length === 0 &&
      rayTransforms.length === 0 &&
      vectorTransforms.length === 0 &&
      circleTransforms.length === 0 &&
      sphereTransforms.length === 0 &&
      coneTransforms.length === 0 &&
      perpendicularLineTransforms.length === 0
    ) {
      return
    }

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        pointTransforms,
        lineTransforms,
        straightLineTransforms,
        rayTransforms,
        vectorTransforms,
        [],
        circleTransforms,
        sphereTransforms,
        coneTransforms,
        [],
        perpendicularLineTransforms,
      ),
    )
  }

  setLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.lines.get(lineId)
    if (!line) return
    const relatedFaces = getFacesByLineId(this, lineId)
    if (!locked && relatedFaces.length > 0) {
      const faceCascade = buildFaceUnlockCascade(this, relatedFaces)
      if (
        faceCascade.pointTransforms.length === 0 &&
        faceCascade.lineTransforms.length === 0 &&
        faceCascade.faceTransforms.length === 0
      ) {
        return
      }

      this.executeHistoryEntry(
        createSyncLockStateCommand(
          this.scene,
          faceCascade.pointTransforms,
          faceCascade.lineTransforms,
          [],
          [],
          [],
          faceCascade.faceTransforms,
        ),
      )
      return
    }

    const endpointTransforms = !locked
      ? [line.p1, line.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (line.userLocked === locked && endpointTransforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [{ line, before: line.userLocked, after: locked }],
        [],
        [],
        [],
      ),
    )
  }

  setStraightLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.straightLines.get(lineId)
    if (!line) return
    const endpointTransforms = !locked
      ? [line.p1, line.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (line.userLocked === locked && endpointTransforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [{ line, before: line.userLocked, after: locked }],
        [],
        [],
      ),
    )
  }

  setPerpendicularLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.perpendicularLines.get(lineId)
    if (!line) return
    const p1Transforms = locked
      ? [line.p1]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: true,
          }))
          .filter((transform) => transform.before !== transform.after)
      : [line.p1]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    if (line.userLocked === locked && p1Transforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        p1Transforms,
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [{ line, before: line.userLocked, after: locked }],
      ),
    )
  }

  setRayLockState(rayId: string, locked: boolean) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return
    const endpointTransforms = !locked
      ? [ray.p1, ray.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (ray.userLocked === locked && endpointTransforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [],
        [{ ray, before: ray.userLocked, after: locked }],
        [],
      ),
    )
  }

  setCircleLockState(circleId: string, locked: boolean) {
    const circle = this.scene.circles.get(circleId)
    if (!circle) return
    const circlePoints = circle.isNormalCircle() ? [circle.p1] : [circle.p1, circle.p2, circle.p3]
    const endpointTransforms = !locked
      ? circlePoints
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    const cylinderTransforms: { cylinder: Cylinder3; before: boolean; after: boolean }[] = []
    const extraCircleTransforms: { circle: Circle3; before: boolean; after: boolean }[] = []
    if (!locked && circle.isNormalCircle()) {
      for (const cylinder of this.scene.cylinders.values()) {
        if (cylinder.normalCircleId === circleId || cylinder.topNormalCircleId === circleId) {
          if (cylinder.userLocked) {
            cylinderTransforms.push({ cylinder, before: cylinder.userLocked, after: false })
          }
          const otherCircleId =
            cylinder.normalCircleId === circleId
              ? cylinder.topNormalCircleId
              : cylinder.normalCircleId
          if (otherCircleId) {
            const otherCircle = this.scene.circles.get(otherCircleId)
            if (otherCircle && otherCircle.userLocked) {
              extraCircleTransforms.push({
                circle: otherCircle,
                before: otherCircle.userLocked,
                after: false,
              })
            }
          }
          break
        }
      }
    }

    if (
      circle.userLocked === locked &&
      endpointTransforms.length === 0 &&
      cylinderTransforms.length === 0 &&
      extraCircleTransforms.length === 0
    )
      return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [],
        [],
        [],
        [],
        [{ circle, before: circle.userLocked, after: locked }, ...extraCircleTransforms],
        [],
        [],
        cylinderTransforms,
      ),
    )
  }

  setFaceLockState(faceId: string, locked: boolean) {
    const face = this.scene.faces.get(faceId)
    if (!face) return

    const pointTransforms = face.memberPointIds
      .map((pointId) => this.scene.points.get(pointId))
      .filter((point): point is Point3 => point !== undefined && !point.locked)
      .map((point) => ({
        point,
        before: point.userLocked,
        after: locked,
      }))
      .filter((transform) => transform.before !== transform.after)

    const lineTransforms = face.boundaryLineIds
      .map((lineId) => this.scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined)
      .map((line) => ({
        line,
        before: line.userLocked,
        after: locked,
      }))
      .filter((transform) => transform.before !== transform.after)

    const faceTransforms =
      face.userLocked === locked
        ? []
        : [
            {
              face,
              before: face.userLocked,
              after: locked,
            },
          ]

    if (pointTransforms.length === 0 && lineTransforms.length === 0 && faceTransforms.length === 0)
      return

    this.executeHistoryEntry(
      createSyncLockStateCommand(this.scene, pointTransforms, lineTransforms, [], [], [], faceTransforms),
    )
  }

  setFaceAreaLockState(faceId: string, locked: boolean) {
    const face = this.scene.faces.get(faceId)
    if (!face) return
    const nextLockedArea = locked ? face.getArea(this.scene.points) : face.lockedArea
    if (
      face.areaLocked === locked &&
      (!locked || Math.abs(face.lockedArea - nextLockedArea) <= 1e-6)
    ) {
      return
    }

    this.executeCommand(
      new UpdateFaceCommand(
        face.id,
        {
          name: face.name,
          nameVisible: face.nameVisible,
          valueVisible: face.valueVisible,
          labelOffsetX: face.labelOffsetX,
          labelOffsetY: face.labelOffsetY,
          visible: face.visible,
          userLocked: face.userLocked,
          areaLocked: face.areaLocked,
          lockedArea: face.lockedArea,
          edgeLengthLocks: [...face.edgeLengthLocks],
        },
        {
          name: face.name,
          nameVisible: face.nameVisible,
          valueVisible: face.valueVisible,
          labelOffsetX: face.labelOffsetX,
          labelOffsetY: face.labelOffsetY,
          visible: face.visible,
          userLocked: face.userLocked,
          areaLocked: locked,
          lockedArea: nextLockedArea,
          edgeLengthLocks: [...face.edgeLengthLocks],
        },
        this.scene,
      ),
    )
  }

  get canUndo() {
    return this.historyManager.canUndo
  }

  get canRedo() {
    return this.historyManager.canRedo
  }

  setMode(mode: EditorMode) {
    this.mode = mode
    this.selectedPoints = []
  }

  deletePoint(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (!point || (point.locked && point.circleRole !== 'center')) return
    const dependentCubes = this.collectDependentCubesByPointId(pointId, [pointId])
    const cubeFaceIds = new Set(dependentCubes.flatMap(({ faces }) => faces.map((face) => face.id)))

    const relatedLines = [...this.scene.lines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedRays = [...this.scene.rays.values()].filter(
      (ray) => ray.p1.id === pointId || ray.p2.id === pointId,
    )
    const relatedVectors = [...this.scene.vectors.values()].filter(
      (vector) => vector.p1.id === pointId || vector.p2.id === pointId,
    )
    const relatedStraightLines = [...this.scene.straightLines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedCircles = [...this.scene.circles.values()].filter(
      (circle) => circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId ||
        (point.circleId === circle.id && point.circleRole === 'center'),
    )
    const relatedSpheres = [...this.scene.spheres.values()].filter(
      (sphere) =>
        sphere.centerPoint.id === pointId ||
        (sphere.radiusPoint && sphere.radiusPoint.id === pointId),
    )
    // 删除点时级联删除依赖该点的圆锥
    const relatedCones = [...this.scene.cones.values()].filter(
      (cone) => cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId,
    )
    // 删除点时级联删除依赖该点的圆柱
    const relatedCylinders = [...this.scene.cylinders.values()].filter(
      (cylinder) => cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId,
    )
    const relatedFaces = [...this.scene.faces.values()].filter(
      (face) => face.includesPoint(pointId) && !cubeFaceIds.has(face.id),
    )
    const pointConstraint = this.scene.getIntersectionConstraint(pointId)
    // 直接依赖该点的垂线/平行线（p1/p2 引用了该点），需纳入交点依赖收集
    const directPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.p1.id === pointId || pl.p2.id === pointId,
    )
    const directParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.p1.id === pointId || pl.p2.id === pointId,
    )
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      ...relatedLines.map((line) => ({ type: 'line' as const, id: line.id })),
      ...relatedStraightLines.map((line) => ({ type: 'straightLine' as const, id: line.id })),
      ...relatedRays.map((ray) => ({ type: 'ray' as const, id: ray.id })),
      ...relatedFaces.map((face) => ({ type: 'face' as const, id: face.id })),
      ...directPerpendicularLines.map((pl) => ({ type: 'perpendicularLine' as const, id: pl.id })),
      ...directParallelLines.map((pl) => ({ type: 'parallelLine' as const, id: pl.id })),
    ]).filter(({ point }) => point.id !== pointId)

    const dependentRegularPolygonConstraints = this.getRegularPolygonConstraints().filter(
      (constraint) =>
        constraint.ownerPointIds.includes(pointId) ||
        constraint.dependentLayouts.some((layout) => layout.pointId === pointId),
    )
    const dependentRegularPolygons = dependentRegularPolygonConstraints
      .map((constraint) => {
        const face = this.scene.faces.get(constraint.faceId)
        if (!face) return null
        const dependentPoints = constraint.dependentLayouts
          .map((layout) => this.scene.points.get(layout.pointId))
          .filter((item): item is Point3 => item !== undefined)
        const rpDependentIntersectionPoints = this.collectDependentIntersectionPoints([
          { type: 'face', id: face.id },
        ])
        return {
          face,
          constraint,
          dependentPoints,
          dependentIntersectionPoints: rpDependentIntersectionPoints,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const regularPolygonFaceIds = new Set(
      dependentRegularPolygons.map((item) => item.face.id),
    )
    const dependentPrisms = this.collectDependentPrismsByPointId(pointId)
    // prismFaceIds 只包含顶面和侧面（不含底面）：
    // - 删除最高点时，底面不含最高点，不会被 relatedFaces 收集，自然保留；
    // - 删除底面顶点时，底面含该顶点，应被通用 face 删除逻辑处理（破坏删除），
    //   因此不能放入 prismFaceIds 排除，否则底面会残留。
    const prismFaceIds = new Set(
      dependentPrisms.flatMap(({ faces, bottomFaceId }) =>
        faces.filter((f) => f.id !== bottomFaceId).map((f) => f.id),
      ),
    )
    const filteredRelatedFaces = relatedFaces.filter(
      (face) => !regularPolygonFaceIds.has(face.id) && !prismFaceIds.has(face.id),
    )

    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter((pl) => {
      if (pl.p1.id === pointId || pl.p2.id === pointId) return true
      if (pl.target.type === 'line' && relatedLines.some((l) => l.id === pl.target.id)) return true
      if (pl.target.type === 'straightLine' && relatedStraightLines.some((l) => l.id === pl.target.id)) return true
      if (pl.target.type === 'ray' && relatedRays.some((r) => r.id === pl.target.id)) return true
      if (pl.target.type === 'vector' && relatedVectors.some((v) => v.id === pl.target.id)) return true
      if (pl.target.type === 'coneBase' && relatedCones.some((c) => c.id === pl.target.id)) return true
      if (pl.target.type === 'cylinderBottom' && relatedCylinders.some((c) => c.id === pl.target.id)) return true
      if (pl.target.type === 'cylinderTop' && relatedCylinders.some((c) => c.id === pl.target.id)) return true
      if (pl.target.type === 'face') {
        if (filteredRelatedFaces.some((f) => f.id === pl.target.id)) return true
        if (dependentCubes.some(({ faces }) => faces.some((f) => f.id === pl.target.id))) return true
        if (dependentRegularPolygons.some(({ face }) => face.id === pl.target.id)) return true
        if (dependentPrisms.some(({ faces }) => faces.some((f) => f.id === pl.target.id))) return true
      }
      return false
    })

    const relatedParallelLines = [...this.scene.parallelLines.values()].filter((pl) => {
      if (pl.p1.id === pointId || pl.p2.id === pointId) return true
      if (pl.target.type === 'line' && relatedLines.some((l) => l.id === pl.target.id)) return true
      if (pl.target.type === 'straightLine' && relatedStraightLines.some((l) => l.id === pl.target.id)) return true
      if (pl.target.type === 'ray' && relatedRays.some((r) => r.id === pl.target.id)) return true
      if (pl.target.type === 'vector' && relatedVectors.some((v) => v.id === pl.target.id)) return true
      return false
    })

    const relatedPerpendicularLineIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    const relatedParallelLineIds = new Set(relatedParallelLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (relatedPerpendicularLineIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && relatedPerpendicularLineIds.has(pl.target.id)) {
        relatedPerpendicularLines.push(pl)
        relatedPerpendicularLineIds.add(pl.id)
      }
      if (pl.target.type === 'parallelLine' && relatedParallelLineIds.has(pl.target.id)) {
        relatedPerpendicularLines.push(pl)
        relatedPerpendicularLineIds.add(pl.id)
      }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (relatedParallelLineIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && relatedPerpendicularLineIds.has(pl.target.id)) {
        relatedParallelLines.push(pl)
        relatedParallelLineIds.add(pl.id)
      }
      if (pl.target.type === 'parallelLine' && relatedParallelLineIds.has(pl.target.id)) {
        relatedParallelLines.push(pl)
        relatedParallelLineIds.add(pl.id)
      }
    })

    const allIntersectionPoints = this.mergeIntersectionPoints(
      dependentIntersectionPoints,
      this.collectIntersectionPointsFromRelatedLines(relatedPerpendicularLines, relatedParallelLines),
    )
    this.executeHistoryEntry(
      createDeletePointCommand(
        this.scene,
        point,
        relatedLines,
        relatedStraightLines,
        relatedRays,
        relatedVectors,
        relatedCircles,
        filteredRelatedFaces,
        pointConstraint,
        allIntersectionPoints,
        dependentCubes,
        relatedSpheres,
        dependentRegularPolygons,
        dependentPrisms,
        relatedPerpendicularLines,
        relatedParallelLines,
        relatedCones,
        relatedCylinders,
      ),
    )
    this.selectedPoints = this.selectedPoints.filter((p) => p.id !== pointId)
  }

  deleteLine(lineId: string) {
    const line = this.scene.lines.get(lineId)
    if (!line) return
    this.removeConstrainedPointsReferencing('line', lineId)
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      { type: 'line', id: lineId },
    ])
    const dependentCubes = this.collectDependentCubesByLineId(lineId)
    const dependentFaces = this.collectDependentFacesByLineId(lineId)

    const dependentRegularPolygonConstraints = this.getRegularPolygonConstraints().filter(
      (constraint) => {
        const face = this.scene.faces.get(constraint.faceId)
        if (!face) return false
        return face.boundaryLineIds.includes(lineId)
      },
    )
    const dependentRegularPolygons = dependentRegularPolygonConstraints
      .map((constraint) => {
        const face = this.scene.faces.get(constraint.faceId)
        if (!face) return null
        const dependentPoints = constraint.dependentLayouts
          .map((layout) => this.scene.points.get(layout.pointId))
          .filter((item): item is Point3 => item !== undefined)
        const rpDependentIntersectionPoints = this.collectDependentIntersectionPoints([
          { type: 'face', id: face.id },
        ])
        return {
          face,
          constraint,
          dependentPoints,
          dependentIntersectionPoints: rpDependentIntersectionPoints,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    const regularPolygonFaceIds = new Set(
      dependentRegularPolygons.map((item) => item.face.id),
    )
    const dependentPrisms = this.collectDependentPrismsByLineId(lineId)
    // prismFaceIds 只包含顶面和侧面（不含底面）：
    // - 删除棱柱边界线时，若该线属于底面，底面应由通用 face 删除逻辑处理（破坏删除），
    //   因此不能放入 prismFaceIds 排除，否则底面会残留。
    const prismFaceIds = new Set(
      dependentPrisms.flatMap(({ faces, bottomFaceId }) =>
        faces.filter((f) => f.id !== bottomFaceId).map((f) => f.id),
      ),
    )
    const cubeFaceIds = new Set(dependentCubes.flatMap(({ faces }) => faces.map((f) => f.id)))
    const filteredDependentFaces = dependentFaces.filter(
      (face) => !cubeFaceIds.has(face.id) && !regularPolygonFaceIds.has(face.id) && !prismFaceIds.has(face.id),
    )

    const allDeletedFaceIds = new Set([
      ...filteredDependentFaces.map((f) => f.id),
      ...dependentCubes.flatMap(({ faces }) => faces.map((f) => f.id)),
      ...dependentRegularPolygons.map(({ face }) => face.id),
      ...dependentPrisms.flatMap(({ faces }) => faces.map((f) => f.id)),
    ])
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) =>
        (pl.target.type === 'line' && pl.target.id === lineId) ||
        (pl.target.type === 'face' && allDeletedFaceIds.has(pl.target.id)),
    )
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'line' && pl.target.id === lineId,
    )

    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (_rllIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
    })

    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))

    const allIntersectionPoints = this.mergeIntersectionPoints(
      dependentIntersectionPoints,
      this.collectIntersectionPointsFromRelatedLines(relatedPerpendicularLines, relatedParallelLines),
    )
    this.executeHistoryEntry(
      createDeleteLineCommand(
        this.scene,
        line,
        allIntersectionPoints,
        dependentCubes,
        filteredDependentFaces,
        dependentRegularPolygons,
        dependentPrisms,
        relatedPerpendicularLines,
        relatedParallelLines,
      ),
    )
  }

  deleteRay(rayId: string) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return
    this.removeConstrainedPointsReferencing('ray', rayId)
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      { type: 'ray', id: rayId },
    ])
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'ray' && pl.target.id === rayId,
    )
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'ray' && pl.target.id === rayId,
    )
    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (_rllIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
    })
    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    this.executeHistoryEntry(createDeleteRayCommand(this.scene, ray, dependentIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  deleteCircle(circleId: string) {
    const circle = this.scene.circles.get(circleId)
    if (!circle) return
    this.removeConstrainedPointsReferencing('circle', circleId)
    // 删除法向圆时级联删除依赖该法向圆的圆锥
    const relatedCones = [...this.scene.cones.values()].filter(
      (cone) => cone.normalCircleId === circleId,
    )
    relatedCones.forEach((cone) => {
      this.removeConstrainedPointsReferencing('cone', cone.id)
      this.removeConstrainedPointsReferencing('coneBase', cone.id)
    })
    // 删除法向圆时级联删除依赖该法向圆的圆柱
    const relatedCylinders = [...this.scene.cylinders.values()].filter(
      (cylinder) => cylinder.normalCircleId === circleId || cylinder.topNormalCircleId === circleId,
    )
    relatedCylinders.forEach((cylinder) => {
      this.removeConstrainedPointsReferencing('cylinder', cylinder.id)
      this.removeConstrainedPointsReferencing('cylinderBottom', cylinder.id)
      this.removeConstrainedPointsReferencing('cylinderTop', cylinder.id)
    })
    // 收集圆锥和圆柱关联的垂线/平行线
    const allRelatedIds = new Set<string>()
    relatedCones.forEach((c) => allRelatedIds.add(c.id))
    relatedCylinders.forEach((c) => allRelatedIds.add(c.id))
    const geoPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => (pl.target.type === 'coneBase' && relatedCones.some((c) => c.id === pl.target.id)) ||
        (pl.target.type === 'cylinderBottom' && relatedCylinders.some((c) => c.id === pl.target.id)) ||
        (pl.target.type === 'cylinderTop' && relatedCylinders.some((c) => c.id === pl.target.id)),
    )
    const _cplIds = new Set(geoPerpendicularLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_cplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _cplIds.has(pl.target.id)) { geoPerpendicularLines.push(pl); _cplIds.add(pl.id) }
    })
    const geoParallelLines: ParallelLine3[] = []
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (pl.target.type === 'perpendicularLine' && _cplIds.has(pl.target.id)) { geoParallelLines.push(pl) }
    })
    geoPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    geoParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    this.executeHistoryEntry(createDeleteCircleCommand(this.scene, circle, [], relatedCones, relatedCylinders, geoPerpendicularLines, geoParallelLines))
  }

  deleteStraightLine(lineId: string) {
    const line = this.scene.straightLines.get(lineId)
    if (!line) return
    this.removeConstrainedPointsReferencing('straightLine', lineId)
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      { type: 'straightLine', id: lineId },
    ])
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'straightLine' && pl.target.id === lineId,
    )
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'straightLine' && pl.target.id === lineId,
    )
    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (_rllIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
    })
    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    this.executeHistoryEntry(
      createDeleteStraightLineCommand(this.scene, line, dependentIntersectionPoints, relatedPerpendicularLines, relatedParallelLines),
    )
  }

  deleteFace(faceId: string) {
    const face = this.scene.faces.get(faceId)
    if (!face) return
    const cubeConstraint = this.getCubeConstraintByFaceId(faceId)
    if (cubeConstraint) {
      cubeConstraint.faceIds.forEach((fid) => {
        this.removeConstrainedPointsReferencing('face', fid)
      })
      const faces = cubeConstraint.faceIds
        .map((id) => this.scene.faces.get(id))
        .filter((item): item is PlanarPolygon => item !== undefined)
      const dependentPoints = cubeConstraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((item): item is Point3 => item !== undefined)
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints(
        faces.map((cubeFace) => ({ type: 'face' as const, id: cubeFace.id })),
      )
      const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
        (pl) => pl.target.type === 'face' && faces.some((f) => f.id === pl.target.id),
      )
      const allBoundaryLineIds = new Set(faces.flatMap((f) => f.boundaryLineIds))
      const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
        (pl) => pl.target.type === 'line' && allBoundaryLineIds.has(pl.target.id),
      )
      const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
      const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
      ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
        if (_rplIds.has(pl.id)) return
        if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
        if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      })
      ;[...this.scene.parallelLines.values()].forEach((pl) => {
        if (_rllIds.has(pl.id)) return
        if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
        if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      })
      // 清理关联垂线/平行线上的约束点
      relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
      relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
      const allIntersectionPoints = this.mergeIntersectionPoints(
        dependentIntersectionPoints,
        this.collectIntersectionPointsFromRelatedLines(relatedPerpendicularLines, relatedParallelLines),
      )
      this.executeHistoryEntry(
        createDeleteHexahedronCommand(
          this.scene,
          faces,
          dependentPoints,
          cubeConstraint,
          allIntersectionPoints,
          relatedPerpendicularLines,
          relatedParallelLines,
        ),
      )
      return
    }

    const regularPolygonConstraint = this.getRegularPolygonConstraintByFaceId(faceId)
    if (regularPolygonConstraint) {
      const dependentPoints = regularPolygonConstraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((item): item is Point3 => item !== undefined)
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
        { type: 'face', id: faceId },
      ])
      const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
        (pl) => pl.target.type === 'face' && pl.target.id === faceId,
      )
      const boundaryLineIds = new Set(face.boundaryLineIds)
      const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
        (pl) => pl.target.type === 'line' && boundaryLineIds.has(pl.target.id),
      )
      const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
      const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
      ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
        if (_rplIds.has(pl.id)) return
        if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
        if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      })
      ;[...this.scene.parallelLines.values()].forEach((pl) => {
        if (_rllIds.has(pl.id)) return
        if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
        if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      })
      // 清理关联垂线/平行线上的约束点
      relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
      relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
      this.executeHistoryEntry(
        createDeleteRegularPolygonCommand(
          this.scene,
          face,
          regularPolygonConstraint,
          dependentPoints,
          dependentIntersectionPoints,
          relatedPerpendicularLines,
          relatedParallelLines,
        ),
      )
      return
    }

    const prismConstraint = this.getPrismConstraintByFaceId(faceId)
    if (prismConstraint) {
      // 棱柱所有面（底面 + 顶面 + 侧面）
      const allPrismFaceIds = this.getPrismFaceIds(prismConstraint.prismId)
      const prismFaces = allPrismFaceIds
        .map((id) => this.scene.faces.get(id))
        .filter((item): item is PlanarPolygon => item !== undefined)
      // dependent 顶点（顶面除最高点外的顶点）
      const dependentPoints = prismConstraint.dependentLayouts
        .map((layout) => this.scene.points.get(layout.pointId))
        .filter((item): item is Point3 => item !== undefined)
      const dependentIntersectionPoints = this.collectDependentIntersectionPoints(
        prismFaces.map((prismFace) => ({ type: 'face' as const, id: prismFace.id })),
      )
      const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
        (pl) => pl.target.type === 'face' && prismFaces.some((f) => f.id === pl.target.id),
      )
      const allBoundaryLineIds = new Set(prismFaces.flatMap((f) => f.boundaryLineIds))
      const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
        (pl) => pl.target.type === 'line' && allBoundaryLineIds.has(pl.target.id),
      )
      const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
      const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
      ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
        if (_rplIds.has(pl.id)) return
        if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
        if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      })
      ;[...this.scene.parallelLines.values()].forEach((pl) => {
        if (_rllIds.has(pl.id)) return
        if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
        if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      })
      // 清理关联垂线/平行线上的约束点
      relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
      relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
      const bottomFace = this.scene.faces.get(prismConstraint.bottomFaceId)
      const bottomOwnerPointIds = bottomFace ? [...bottomFace.boundaryPointIds] : []
      this.executeHistoryEntry(
        createDeletePrismCommand(
          this.scene,
          prismFaces,
          dependentPoints,
          prismConstraint,
          prismConstraint.bottomFaceId,
          bottomOwnerPointIds,
          prismConstraint.ownerPointIds[1],
          dependentIntersectionPoints,
          relatedPerpendicularLines,
          relatedParallelLines,
        ),
      )
      return
    }

    this.removeConstrainedPointsReferencing('face', faceId)
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      { type: 'face', id: faceId },
    ])
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'face' && pl.target.id === faceId,
    )
    const boundaryLineIds = new Set(face.boundaryLineIds)
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'line' && boundaryLineIds.has(pl.target.id),
    )
    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (_rllIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
    })
    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    this.executeHistoryEntry(createDeleteFaceCommand(this.scene, face, dependentIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  clearAll() {
    if (
      this.scene.points.size <= 1 &&
      this.scene.lines.size === 0 &&
      this.scene.straightLines.size === 0 &&
      this.scene.rays.size === 0 &&
      this.scene.vectors.size === 0 &&
      this.scene.circles.size === 0 &&
      this.scene.spheres.size === 0 &&
      this.scene.faces.size === 0 &&
      this.scene.cones.size === 0 &&
      this.scene.cylinders.size === 0 &&
      this.scene.constraints.length === 0 &&
      this.scene.perpendicularLines.size === 0 &&
      this.scene.parallelLines.size === 0
    )
      return

    this.executeHistoryEntry(
      createClearSceneCommand(this.scene),
    )
    this.selectedPoints = []
  }

  createPoint(position: Vec3) {
    const p = new Point3(
      genId('p'),
      genNextAvailableName(
        [...this.scene.points.values()].map((point) => point.name),
        65,
      ),
      position,
      false,
      true,
    )
    const cmd = createAddElementCommand(this.scene, p, 'point')
    this.executeHistoryEntry(cmd)
    return p
  }

  createConstrainedPoint(position: Vec3, targetType: ConstrainedToRef['type'], targetId: string) {
    const projected = this.projectPositionToConstraint(position, targetType, targetId)
    const finalPosition = projected ?? position
    const p = new Point3(
      genId('p'),
      genNextAvailableName(
        [...this.scene.points.values()].map((point) => point.name),
        65,
      ),
      finalPosition,
      false,
      true,
    )
    p.constrainedTo = { type: targetType, id: targetId }
    const constraint = new ObjectConstrainedPointConstraint(this.scene, p.id, p.constrainedTo)
    constraint.computeParametricDataFromPosition(finalPosition)
    const cmd = createAddConstrainedPointCommand(this.scene, p, constraint)
    this.executeHistoryEntry(cmd)
    return p
  }

  projectPositionToConstraint(position: Vec3, targetType: ConstrainedToRef['type'], targetId: string): Vec3 | null {
    const tempConstraint = new ObjectConstrainedPointConstraint(this.scene, '', { type: targetType, id: targetId })
    return tempConstraint.projectPosition(position)
  }

  private getSelectedSolidOwnerPoints() {
    const selectedLines = [...this.scene.selection.lines]
      .map((id) => this.scene.lines.get(id))
      .filter((line): line is Line3 => line !== undefined)
    const selectedPoints = [...this.scene.selection.points]
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)

    let ownerPoints: [Point3, Point3] | null = null
    let sourceLineId: string | null = null

    if (selectedLines.length === 1 && selectedPoints.length === 0) {
      ownerPoints = [selectedLines[0]!.p1, selectedLines[0]!.p2]
      sourceLineId = selectedLines[0]!.id
    } else if (selectedLines.length === 0 && selectedPoints.length === 2) {
      ownerPoints = [selectedPoints[0]!, selectedPoints[1]!]
    }

    return { ownerPoints, sourceLineId }
  }

  private resolveSolidAxes(
    ownerPoints: [Point3, Point3],
    solidType: CubeConstraint['solidType'] = 'hexahedron',
  ) {
    const [p1, p2] = ownerPoints
    const edge = new Vec3(
      p2.position.x - p1.position.x,
      p2.position.y - p1.position.y,
      p2.position.z - p1.position.z,
    )
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
    if (edgeLength <= 1e-6) return null

    const uAxis = new Vec3(edge.x / edgeLength, edge.y / edgeLength, edge.z / edgeLength)
    const worldAxes = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)]
    const sharedNormal =
      solidType === 'tetrahedron' ? getSharedCoordinateNormal(p1.position, p2.position) : null
    const referenceAxis =
      sharedNormal &&
      Math.abs(sharedNormal.x * uAxis.x + sharedNormal.y * uAxis.y + sharedNormal.z * uAxis.z) <=
        1 - AXIS_ALIGNMENT_EPSILON
        ? new Vec3(
            sharedNormal.y * uAxis.z - sharedNormal.z * uAxis.y,
            sharedNormal.z * uAxis.x - sharedNormal.x * uAxis.z,
            sharedNormal.x * uAxis.y - sharedNormal.y * uAxis.x,
          )
        : worldAxes.reduce((best, candidate) => {
            const bestDot = Math.abs(best.x * uAxis.x + best.y * uAxis.y + best.z * uAxis.z)
            const candidateDot = Math.abs(
              candidate.x * uAxis.x + candidate.y * uAxis.y + candidate.z * uAxis.z,
            )
            return candidateDot < bestDot ? candidate : best
          })
    const projectedReference = new Vec3(
      referenceAxis.x -
        uAxis.x *
          (referenceAxis.x * uAxis.x + referenceAxis.y * uAxis.y + referenceAxis.z * uAxis.z),
      referenceAxis.y -
        uAxis.y *
          (referenceAxis.x * uAxis.x + referenceAxis.y * uAxis.y + referenceAxis.z * uAxis.z),
      referenceAxis.z -
        uAxis.z *
          (referenceAxis.x * uAxis.x + referenceAxis.y * uAxis.y + referenceAxis.z * uAxis.z),
    )
    const projectedLength = Math.hypot(
      projectedReference.x,
      projectedReference.y,
      projectedReference.z,
    )
    if (projectedLength <= 1e-6) return null

    const vAxis = new Vec3(
      projectedReference.x / projectedLength,
      projectedReference.y / projectedLength,
      projectedReference.z / projectedLength,
    )
    const wAxisRaw = new Vec3(
      uAxis.y * vAxis.z - uAxis.z * vAxis.y,
      uAxis.z * vAxis.x - uAxis.x * vAxis.z,
      uAxis.x * vAxis.y - uAxis.y * vAxis.x,
    )
    const wAxisLength = Math.hypot(wAxisRaw.x, wAxisRaw.y, wAxisRaw.z)
    if (wAxisLength <= 1e-6) return null

    return {
      p1,
      p2,
      edgeLength,
      uAxis,
      vAxis,
      wAxis: new Vec3(wAxisRaw.x / wAxisLength, wAxisRaw.y / wAxisLength, wAxisRaw.z / wAxisLength),
    }
  }

  movePoint(pointId: string, delta: Vec3) {
    const point = this.scene.points.get(pointId)
    if (!point) return
    if (this.isPointCoordinateLocked(point)) return
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) return

    this.setPointPosition(pointId, point.position.add(delta))
  }

  setPointPosition(pointId: string, position: Vec3) {
    const point = this.scene.points.get(pointId)
    if (!point || this.isPointCoordinateLocked(point)) return

    const cubeConstraint = this.getCubeConstraintByPointId(pointId)
    if (cubeConstraint && point.cubeRole === 'dependent') {
      this.rotateCubeByDependentPoint(cubeConstraint.cubeId, pointId, position)
      return
    }
    if (cubeConstraint && point.cubeRole === 'owner') {
      this.setCubeOwnerPointPosition(cubeConstraint.cubeId, pointId, position)
      return
    }

    const rpConstraint = this.getRegularPolygonConstraintByPointId(pointId)
    if (rpConstraint && point.regularPolygonRole === 'dependent') {
      this.rotateRegularPolygonByDependentPoint(rpConstraint.constraintId, pointId, position)
      return
    }
    if (rpConstraint && point.regularPolygonRole === 'owner') {
      this.setRegularPolygonOwnerPointPosition(rpConstraint.constraintId, pointId, position)
      return
    }

    const prismConstraint = this.getPrismConstraintByPointId(pointId)
    if (prismConstraint) {
      if (point.prismRole === 'dependent') {
        // 拖动 dependent 点：平移整个棱柱（owner + 所有 dependent 点）
        this.translatePrism(prismConstraint.prismId, pointId, position)
        return
      }
      if (point.prismRole === 'owner') {
        // 拖动 owner 点（最高点或底面参考顶点）：移动该点并重新求解 dependent 点
        this.setPrismOwnerPointPosition(prismConstraint.prismId, pointId, position)
        return
      }
    }

    const before = point.position.clone()
    const nextPosition = this.resolveLockedLinePointPosition(pointId, position)
    if (before.x === nextPosition.x && before.y === nextPosition.y && before.z === nextPosition.z) {
      return
    }

    const delta = new Vec3(
      nextPosition.x - before.x,
      nextPosition.y - before.y,
      nextPosition.z - before.z,
    )
    const group = this.getLockedTranslationGroup([pointId])
    this.translatePointGroup([...group], delta)
  }

  setPointsPositions(updates: Array<{ id: string; position: Vec3 }>) {
    const resolvedPositions = this.resolveConstrainedPointPositions(
      updates.map(({ id, position }) => ({ id, position: position.clone() })),
    )
    const transforms = [...resolvedPositions.entries()]
      .map(([id, position]) => {
        const point = this.scene.points.get(id)
        if (!point || this.isPointCoordinateLocked(point)) return null
        const before = point.position.clone()
        if (before.x === position.x && before.y === position.y && before.z === position.z)
          return null
        return { pointId: point.id, before, after: position.clone() }
      })
      .filter(
        (transform): transform is { pointId: string; before: Vec3; after: Vec3 } =>
          transform !== null,
      )

    if (transforms.length === 0) return
    if (transforms.length === 1) {
      const transform = transforms[0]!
      this.executeCommand(new TransformCommand(transform.pointId, transform.before, transform.after, [], this.scene))
      return
    }

    this.executeCommand(new TransformPointsCommand(transforms, [], this.scene))
  }

  applyPointTransformHistory(
    transforms: Array<{ id: string; before: Vec3; after: Vec3 }>,
    axisHintChanges: Array<{ constraintType: 'cube' | 'regularPolygon'; constraintId: string; before: Vec3; after: Vec3 }> = [],
  ) {
    const resolvedPositions = this.resolveConstrainedPointPositions(
      transforms.map(({ id, after }) => ({ id, position: after.clone() })),
    )
    const commandTransforms = [...resolvedPositions.entries()]
      .map(([id, position]) => {
        const original = transforms.find((item) => item.id === id)
        const point = this.scene.points.get(id)
        if (!point || !original || this.isPointCoordinateLocked(point)) return null
        if (
          original.before.x === position.x &&
          original.before.y === position.y &&
          original.before.z === position.z
        ) {
          return null
        }

        return {
          pointId: id,
          before: original.before.clone(),
          after: position.clone(),
        }
      })
      .filter(
        (transform): transform is { pointId: string; before: Vec3; after: Vec3 } =>
          transform !== null,
      )

    if (commandTransforms.length === 0 && axisHintChanges.length === 0) return
    if (commandTransforms.length === 1 && axisHintChanges.length === 0) {
      const transform = commandTransforms[0]!
      this.executeCommand(new TransformCommand(transform.pointId, transform.before, transform.after, [], this.scene))
      return
    }

    this.executeCommand(new TransformPointsCommand(commandTransforms, axisHintChanges, this.scene))
  }

  updatePoint(
    pointId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      visible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      userLocked?: boolean
    },
  ) {
    const point = this.scene.points.get(pointId)
    if (!point) return

    const nextName = patch.name ?? point.name
    const nextVisible = patch.nameVisible ?? point.nameVisible
    const nextValueVisible = patch.valueVisible ?? point.valueVisible
    const nextObjVisible = patch.visible ?? point.visible
    const nextLabelOffsetX = patch.labelOffsetX ?? point.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? point.labelOffsetY
    const nextUserLocked = patch.userLocked ?? point.userLocked
    if (
      nextName === point.name &&
      nextVisible === point.nameVisible &&
      nextValueVisible === point.valueVisible &&
      nextObjVisible === point.visible &&
      nextLabelOffsetX === point.labelOffsetX &&
      nextLabelOffsetY === point.labelOffsetY &&
      nextUserLocked === point.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdatePointCommand(
        point.id,
        {
          name: point.name,
          nameVisible: point.nameVisible,
          valueVisible: point.valueVisible,
          visible: point.visible,
          labelOffsetX: point.labelOffsetX,
          labelOffsetY: point.labelOffsetY,
          userLocked: point.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextVisible,
          valueVisible: nextValueVisible,
          visible: nextObjVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          userLocked: nextUserLocked,
        },
        this.scene,
      ),
    )
  }

  updateLine(
    lineId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
      lengthLocked?: boolean
      lockedLength?: number
    },
  ) {
    const line = this.scene.lines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextNameVisible = patch.nameVisible ?? line.nameVisible
    const nextValueVisible = patch.valueVisible ?? line.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? line.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? line.labelOffsetY
    const nextVisible = patch.visible ?? line.visible
    const nextUserLocked = patch.userLocked ?? line.userLocked
    const nextLengthLocked = nextUserLocked
      ? line.lengthLocked
      : (patch.lengthLocked ?? line.lengthLocked)
    const nextLockedLength = Line3.normalizeLockedLength(
      nextUserLocked
        ? line.lockedLength
        : (patch.lockedLength ??
            (nextLengthLocked && !line.lengthLocked ? line.getLength() : line.lockedLength)),
    )

    let nextP1Position = line.p1.position.clone()
    let nextP2Position = line.p2.position.clone()
    const shouldAdjustLength =
      !nextUserLocked &&
      nextLengthLocked &&
      (!line.lengthLocked || Math.abs(nextLockedLength - line.lockedLength) > 1e-6)

    if (shouldAdjustLength) {
      const direction = line.getNormalizedDirectionVector()
      if (this.isPointCoordinateLocked(line.p2) && !this.isPointCoordinateLocked(line.p1)) {
        nextP1Position = new Vec3(
          line.p2.position.x - direction.x * nextLockedLength,
          line.p2.position.y - direction.y * nextLockedLength,
          line.p2.position.z - direction.z * nextLockedLength,
        )
      } else if (!this.isPointCoordinateLocked(line.p2)) {
        nextP2Position = new Vec3(
          line.p1.position.x + direction.x * nextLockedLength,
          line.p1.position.y + direction.y * nextLockedLength,
          line.p1.position.z + direction.z * nextLockedLength,
        )
      }
    }

    const resolvedEndpoints = this.resolveConstrainedPointPositions(
      [
        { id: line.p1.id, position: nextP1Position.clone() },
        { id: line.p2.id, position: nextP2Position.clone() },
      ].filter(({ id }, index, items) => items.findIndex((item) => item.id === id) === index),
    )
    nextP1Position = resolvedEndpoints.get(line.p1.id) ?? nextP1Position
    nextP2Position = resolvedEndpoints.get(line.p2.id) ?? nextP2Position

    if (
      nextName === line.name &&
      nextNameVisible === line.nameVisible &&
      nextValueVisible === line.valueVisible &&
      nextLabelOffsetX === line.labelOffsetX &&
      nextLabelOffsetY === line.labelOffsetY &&
      nextVisible === line.visible &&
      nextUserLocked === line.userLocked &&
      nextLengthLocked === line.lengthLocked &&
      nextLockedLength === line.lockedLength &&
      nextP1Position.x === line.p1.position.x &&
      nextP1Position.y === line.p1.position.y &&
      nextP1Position.z === line.p1.position.z &&
      nextP2Position.x === line.p2.position.x &&
      nextP2Position.y === line.p2.position.y &&
      nextP2Position.z === line.p2.position.z
    ) {
      return
    }

    this.executeCommand(
      new UpdateLineCommand(
        line.id,
        {
          name: line.name,
          nameVisible: line.nameVisible,
          valueVisible: line.valueVisible,
          labelOffsetX: line.labelOffsetX,
          labelOffsetY: line.labelOffsetY,
          visible: line.visible,
          userLocked: line.userLocked,
          lengthLocked: line.lengthLocked,
          lockedLength: line.lockedLength,
          p1Position: line.p1.position.clone(),
          p2Position: line.p2.position.clone(),
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          userLocked: nextUserLocked,
          lengthLocked: nextLengthLocked,
          lockedLength: nextLockedLength,
          p1Position: nextP1Position,
          p2Position: nextP2Position,
        },
        this.scene,
      ),
    )
  }

  updateCircle(
    circleId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
      centerVisible?: boolean
      lockedRadius?: number
    },
  ) {
    const circle = this.scene.circles.get(circleId)
    if (!circle) return
    const before = {
      name: circle.name,
      nameVisible: circle.nameVisible,
      valueVisible: circle.valueVisible,
      labelOffsetX: circle.labelOffsetX,
      labelOffsetY: circle.labelOffsetY,
      visible: circle.visible,
      userLocked: circle.userLocked,
      centerVisible: circle.centerVisible,
      lockedRadius: circle.lockedRadius,
    }
    const after = {
      name: patch.name ?? circle.name,
      nameVisible: patch.nameVisible ?? circle.nameVisible,
      valueVisible: patch.valueVisible ?? circle.valueVisible,
      labelOffsetX: patch.labelOffsetX ?? circle.labelOffsetX,
      labelOffsetY: patch.labelOffsetY ?? circle.labelOffsetY,
      visible: patch.visible ?? circle.visible,
      userLocked: patch.userLocked ?? circle.userLocked,
      centerVisible: patch.centerVisible ?? circle.centerVisible,
      lockedRadius: patch.lockedRadius ?? circle.lockedRadius,
    }
    this.executeCommand(new UpdateCircleCommand(circle.id, before, after, this.scene))
    this.scene.markAllRenderDirty()
  }

  updateRay(
    rayId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      displayLength?: number
      userLocked?: boolean
    },
  ) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return

    const nextName = patch.name ?? ray.name
    const nextNameVisible = patch.nameVisible ?? ray.nameVisible
    const nextValueVisible = patch.valueVisible ?? ray.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? ray.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? ray.labelOffsetY
    const nextVisible = patch.visible ?? ray.visible
    const nextDisplayLength = Ray3.normalizeDisplayLength(patch.displayLength ?? ray.displayLength)
    const nextUserLocked = patch.userLocked ?? ray.userLocked
    if (
      nextName === ray.name &&
      nextNameVisible === ray.nameVisible &&
      nextValueVisible === ray.valueVisible &&
      nextLabelOffsetX === ray.labelOffsetX &&
      nextLabelOffsetY === ray.labelOffsetY &&
      nextVisible === ray.visible &&
      nextDisplayLength === ray.displayLength &&
      nextUserLocked === ray.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdateRayCommand(
        ray.id,
        {
          name: ray.name,
          nameVisible: ray.nameVisible,
          valueVisible: ray.valueVisible,
          labelOffsetX: ray.labelOffsetX,
          labelOffsetY: ray.labelOffsetY,
          visible: ray.visible,
          displayLength: ray.displayLength,
          userLocked: ray.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          displayLength: nextDisplayLength,
          userLocked: nextUserLocked,
        },
        this.scene,
      ),
    )
  }

  updateStraightLine(
    lineId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      displayLength?: number
      userLocked?: boolean
    },
  ) {
    const line = this.scene.straightLines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextNameVisible = patch.nameVisible ?? line.nameVisible
    const nextValueVisible = patch.valueVisible ?? line.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? line.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? line.labelOffsetY
    const nextVisible = patch.visible ?? line.visible
    const nextDisplayLength = StraightLine3.normalizeDisplayLength(
      patch.displayLength ?? line.displayLength,
    )
    const nextUserLocked = patch.userLocked ?? line.userLocked
    if (
      nextName === line.name &&
      nextNameVisible === line.nameVisible &&
      nextValueVisible === line.valueVisible &&
      nextLabelOffsetX === line.labelOffsetX &&
      nextLabelOffsetY === line.labelOffsetY &&
      nextVisible === line.visible &&
      nextDisplayLength === line.displayLength &&
      nextUserLocked === line.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdateStraightLineCommand(
        line.id,
        {
          name: line.name,
          nameVisible: line.nameVisible,
          valueVisible: line.valueVisible,
          labelOffsetX: line.labelOffsetX,
          labelOffsetY: line.labelOffsetY,
          visible: line.visible,
          displayLength: line.displayLength,
          userLocked: line.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          displayLength: nextDisplayLength,
          userLocked: nextUserLocked,
        },
        this.scene,
      ),
    )
  }

  updatePerpendicularLine(
    lineId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      displayLength?: number
      userLocked?: boolean
    },
  ) {
    const line = this.scene.perpendicularLines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextNameVisible = patch.nameVisible ?? line.nameVisible
    const nextValueVisible = patch.valueVisible ?? line.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? line.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? line.labelOffsetY
    const nextVisible = patch.visible ?? line.visible
    const nextDisplayLength = PerpendicularLine3.normalizeDisplayLength(
      patch.displayLength ?? line.displayLength,
    )
    const nextUserLocked = patch.userLocked ?? line.userLocked
    if (
      nextName === line.name &&
      nextNameVisible === line.nameVisible &&
      nextValueVisible === line.valueVisible &&
      nextLabelOffsetX === line.labelOffsetX &&
      nextLabelOffsetY === line.labelOffsetY &&
      nextVisible === line.visible &&
      nextDisplayLength === line.displayLength &&
      nextUserLocked === line.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdatePerpendicularLineCommand(
        line.id,
        {
          name: line.name,
          nameVisible: line.nameVisible,
          valueVisible: line.valueVisible,
          labelOffsetX: line.labelOffsetX,
          labelOffsetY: line.labelOffsetY,
          visible: line.visible,
          displayLength: line.displayLength,
          userLocked: line.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          displayLength: nextDisplayLength,
          userLocked: nextUserLocked,
        },
        this.scene,
      ),
    )
  }

  updateFace(
    faceId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
      areaLocked?: boolean
      lockedArea?: number
      edgeLengthLocks?: Array<number | null>
    },
  ) {
    const face = this.scene.faces.get(faceId)
    if (!face) return

    const nextName = patch.name ?? face.name
    const nextNameVisible = patch.nameVisible ?? face.nameVisible
    const nextValueVisible = patch.valueVisible ?? face.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? face.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? face.labelOffsetY
    const nextVisible = patch.visible ?? face.visible
    const nextUserLocked = patch.userLocked ?? face.userLocked
    const nextAreaLocked = patch.areaLocked ?? face.areaLocked
    const nextLockedArea = patch.lockedArea ?? face.lockedArea
    const nextEdgeLengthLocks = patch.edgeLengthLocks ?? face.edgeLengthLocks
    if (
      nextName === face.name &&
      nextNameVisible === face.nameVisible &&
      nextValueVisible === face.valueVisible &&
      nextLabelOffsetX === face.labelOffsetX &&
      nextLabelOffsetY === face.labelOffsetY &&
      nextVisible === face.visible &&
      nextUserLocked === face.userLocked &&
      nextAreaLocked === face.areaLocked &&
      nextLockedArea === face.lockedArea &&
      JSON.stringify(nextEdgeLengthLocks) === JSON.stringify(face.edgeLengthLocks)
    ) {
      return
    }

    this.executeCommand(
      new UpdateFaceCommand(
        face.id,
        {
          name: face.name,
          nameVisible: face.nameVisible,
          valueVisible: face.valueVisible,
          labelOffsetX: face.labelOffsetX,
          labelOffsetY: face.labelOffsetY,
          visible: face.visible,
          userLocked: face.userLocked,
          areaLocked: face.areaLocked,
          lockedArea: face.lockedArea,
          edgeLengthLocks: [...face.edgeLengthLocks],
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          userLocked: nextUserLocked,
          areaLocked: nextAreaLocked,
          lockedArea: nextLockedArea,
          edgeLengthLocks: [...nextEdgeLengthLocks],
        },
        this.scene,
      ),
    )
  }

  getIntersectionSelectionTargets() {
    const targets: IntersectionTargetRef[] = []
    this.scene.selection.lines.forEach((id) => targets.push({ type: 'line', id }))
    this.scene.selection.straightLines.forEach((id) => targets.push({ type: 'straightLine', id }))
    this.scene.selection.rays.forEach((id) => targets.push({ type: 'ray', id }))
    this.scene.selection.vectors.forEach((id) => targets.push({ type: 'vector', id }))
    this.scene.selection.perpendicularLines.forEach((id) => targets.push({ type: 'perpendicularLine', id }))
    this.scene.selection.parallelLines.forEach((id) => targets.push({ type: 'parallelLine', id }))
    this.scene.selection.faces.forEach((id) => targets.push({ type: 'face', id }))
    return targets
  }

  clearIntersectionSelection() {
    this.scene.selection.points.clear()
    this.scene.selection.lines.clear()
    this.scene.selection.straightLines.clear()
    this.scene.selection.rays.clear()
    this.scene.selection.vectors.clear()
    this.scene.selection.perpendicularLines.clear()
    this.scene.selection.parallelLines.clear()
    this.scene.selection.faces.clear()
    this.selectedPoints = []
  }

  private perpendicularLinePendingFaceTarget: PerpendicularLineTargetRef | null = null

  getPerpendicularLineSelectionTargets() {
    const targets: PerpendicularLineTargetRef[] = []
    this.scene.selection.lines.forEach((id) => targets.push({ type: 'line', id }))
    this.scene.selection.straightLines.forEach((id) => targets.push({ type: 'straightLine', id }))
    this.scene.selection.rays.forEach((id) => targets.push({ type: 'ray', id }))
    this.scene.selection.vectors.forEach((id) => targets.push({ type: 'vector', id }))
    this.scene.selection.perpendicularLines.forEach((id) => targets.push({ type: 'perpendicularLine', id }))
    this.scene.selection.parallelLines.forEach((id) => targets.push({ type: 'parallelLine', id }))
    this.scene.selection.faces.forEach((id) => targets.push({ type: 'face', id }))
    if (this.perpendicularLinePendingFaceTarget) {
      targets.push(this.perpendicularLinePendingFaceTarget)
    }
    return targets
  }

  clearPerpendicularLineSelection() {
    this.scene.selection.points.clear()
    this.scene.selection.lines.clear()
    this.scene.selection.straightLines.clear()
    this.scene.selection.rays.clear()
    this.scene.selection.vectors.clear()
    this.scene.selection.perpendicularLines.clear()
    this.scene.selection.parallelLines.clear()
    this.scene.selection.faces.clear()
    this.scene.selection.cones.clear()
    this.scene.selection.cylinders.clear()
    this.perpendicularLinePendingFaceTarget = null
    this.selectedPoints = []
  }

  togglePerpendicularLineSelection(type: PerpendicularLineTargetType, geoId: string) {
    if (this.mode !== EditorMode.CreatePerpendicularLine) return

    if (type === 'coneBase') {
      const isAlreadySelected = this.perpendicularLinePendingFaceTarget?.type === 'coneBase' && this.perpendicularLinePendingFaceTarget?.id === geoId
      if (isAlreadySelected) {
        this.perpendicularLinePendingFaceTarget = null
        this.scene.selection.deselectCone(geoId)
        return
      }
      if (this.getPerpendicularLineSelectionTargets().length >= 1) {
        this.clearPerpendicularLineSelection()
      }
      this.perpendicularLinePendingFaceTarget = { type: 'coneBase', id: geoId }
      this.scene.selection.selectCone(geoId, true)
      this.tryCreatePerpendicularLineFromSelection()
      return
    }

    if (type === 'cylinderBottom' || type === 'cylinderTop') {
      const isAlreadySelected = this.perpendicularLinePendingFaceTarget?.type === type && this.perpendicularLinePendingFaceTarget?.id === geoId
      if (isAlreadySelected) {
        this.perpendicularLinePendingFaceTarget = null
        this.scene.selection.deselectCylinder(geoId)
        return
      }
      if (this.getPerpendicularLineSelectionTargets().length >= 1) {
        this.clearPerpendicularLineSelection()
      }
      this.perpendicularLinePendingFaceTarget = { type, id: geoId }
      this.scene.selection.selectCylinder(geoId, true)
      this.tryCreatePerpendicularLineFromSelection()
      return
    }

    const isSelected =
      (type === 'line' && this.scene.selection.lines.has(geoId)) ||
      (type === 'straightLine' && this.scene.selection.straightLines.has(geoId)) ||
      (type === 'ray' && this.scene.selection.rays.has(geoId)) ||
      (type === 'vector' && this.scene.selection.vectors.has(geoId)) ||
      (type === 'perpendicularLine' && this.scene.selection.perpendicularLines.has(geoId)) ||
      (type === 'parallelLine' && this.scene.selection.parallelLines.has(geoId)) ||
      (type === 'face' && this.scene.selection.faces.has(geoId))

    if (isSelected) {
      if (type === 'line') this.scene.selection.deselectLine(geoId)
      else if (type === 'straightLine') this.scene.selection.deselectStraightLine(geoId)
      else if (type === 'ray') this.scene.selection.deselectRay(geoId)
      else if (type === 'vector') this.scene.selection.deselectVector(geoId)
      else if (type === 'perpendicularLine') this.scene.selection.deselectPerpendicularLine(geoId)
      else if (type === 'parallelLine') this.scene.selection.deselectParallelLine(geoId)
      else this.scene.selection.deselectFace(geoId)
      return
    }

    if (this.getPerpendicularLineSelectionTargets().length >= 1) {
      this.clearPerpendicularLineSelection()
    }

    if (type === 'line') this.scene.selection.selectLine(geoId, true)
    else if (type === 'straightLine') this.scene.selection.selectStraightLine(geoId, true)
    else if (type === 'ray') this.scene.selection.selectRay(geoId, true)
    else if (type === 'vector') this.scene.selection.selectVector(geoId, true)
    else if (type === 'perpendicularLine') this.scene.selection.selectPerpendicularLine(geoId, true)
    else if (type === 'parallelLine') this.scene.selection.selectParallelLine(geoId, true)
    else this.scene.selection.selectFace(geoId, true)

    this.tryCreatePerpendicularLineFromSelection()
  }

  tryCreatePerpendicularLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreatePerpendicularLine) return
    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length > 1) {
      this.selectedPoints = [point]
      this.scene.selection.points.clear()
      this.scene.selection.selectPoint(point.id, true)
    }

    this.tryCreatePerpendicularLineFromSelection()
  }

  tryCreatePerpendicularLineFromSelection() {
    if (this.mode !== EditorMode.CreatePerpendicularLine) return

    const targets = this.getPerpendicularLineSelectionTargets()
    if (targets.length === 0) return
    if (this.selectedPoints.length === 0) return

    const target = targets[0]!
    const point = this.selectedPoints[0]!
    if (!target || !point) return

    if (target.type === 'line' || target.type === 'straightLine' || target.type === 'ray' || target.type === 'vector' || target.type === 'perpendicularLine' || target.type === 'parallelLine') {
      const entity =
        target.type === 'line'
          ? this.scene.lines.get(target.id)
          : target.type === 'straightLine'
            ? this.scene.straightLines.get(target.id)
            : target.type === 'ray'
              ? this.scene.rays.get(target.id)
              : target.type === 'vector'
                ? this.scene.vectors.get(target.id)
                : target.type === 'perpendicularLine'
                  ? this.scene.perpendicularLines.get(target.id)
                  : this.scene.parallelLines.get(target.id)
      if (!entity) return

      if (entity.p1.id === point.id || entity.p2.id === point.id) {
        emitToast('垂点不能位于要垂直的线上')
        return
      }
    }

    const footPoint = new Point3(
      genId('pf'),
      '',
      point.position.clone(),
      false,
      false,
      false,
    )

    const perpendicularLineName = genNextAvailableName(
      [...this.scene.perpendicularLines.values()].map((l) => l.name),
      0,
      (index) => (index === 0 ? 'z' : `z${index}`),
    )

    const perpendicularLine = new PerpendicularLine3(
      genId('pl'),
      perpendicularLineName,
      point,
      footPoint,
      { type: target.type, id: target.id },
      false,
      true,
    )

    // 使用 SnapshotCommand 统一管理垂线+约束的创建，确保撤销/重做完整
    const cmd = new SnapshotCommand('CreatePerpendicularLine', this.scene, () => {
      this.scene.addPerpendicularLine(perpendicularLine)
      const constraint = new PerpendicularLineConstraint(this.scene, perpendicularLine.id, { type: target.type, id: target.id })
      this.scene.addPerpendicularLineConstraint(constraint)
      constraint.solve()
    })
    cmd.executeAndCapture()
    this.executeHistoryEntry(cmd)

    this.clearPerpendicularLineSelection()
    this.scene.selection.clear()
    this.scene.selection.selectPerpendicularLine(perpendicularLine.id)
  }

  deletePerpendicularLine(lineId: string) {
    const line = this.scene.perpendicularLines.get(lineId)
    if (!line) return
    this.removeConstrainedPointsReferencing('perpendicularLine', lineId)
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      { type: 'perpendicularLine', id: lineId },
    ])
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'perpendicularLine' && pl.target.id === lineId,
    )
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'perpendicularLine' && pl.target.id === lineId,
    )
    // 清理关联线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    this.executeHistoryEntry(createDeletePerpendicularLineCommand(this.scene, line, dependentIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  private parallelLinePendingTarget: ParallelLineTargetRef | null = null

  getParallelLineSelectionTargets() {
    const targets: ParallelLineTargetRef[] = []
    this.scene.selection.lines.forEach((id) => targets.push({ type: 'line', id }))
    this.scene.selection.straightLines.forEach((id) => targets.push({ type: 'straightLine', id }))
    this.scene.selection.rays.forEach((id) => targets.push({ type: 'ray', id }))
    this.scene.selection.vectors.forEach((id) => targets.push({ type: 'vector', id }))
    this.scene.selection.perpendicularLines.forEach((id) => targets.push({ type: 'perpendicularLine', id }))
    this.scene.selection.parallelLines.forEach((id) => targets.push({ type: 'parallelLine', id }))
    return targets
  }

  clearParallelLineSelection() {
    this.scene.selection.points.clear()
    this.scene.selection.lines.clear()
    this.scene.selection.straightLines.clear()
    this.scene.selection.rays.clear()
    this.scene.selection.vectors.clear()
    this.scene.selection.perpendicularLines.clear()
    this.scene.selection.parallelLines.clear()
    this.parallelLinePendingTarget = null
    this.selectedPoints = []
  }

  toggleParallelLineSelection(type: ParallelLineTargetType, geoId: string) {
    if (this.mode !== EditorMode.CreateParallelLine) return

    const isSelected =
      (type === 'line' && this.scene.selection.lines.has(geoId)) ||
      (type === 'straightLine' && this.scene.selection.straightLines.has(geoId)) ||
      (type === 'ray' && this.scene.selection.rays.has(geoId)) ||
      (type === 'vector' && this.scene.selection.vectors.has(geoId)) ||
      (type === 'perpendicularLine' && this.scene.selection.perpendicularLines.has(geoId)) ||
      (type === 'parallelLine' && this.scene.selection.parallelLines.has(geoId))

    if (isSelected) {
      if (type === 'line') this.scene.selection.deselectLine(geoId)
      else if (type === 'straightLine') this.scene.selection.deselectStraightLine(geoId)
      else if (type === 'ray') this.scene.selection.deselectRay(geoId)
      else if (type === 'vector') this.scene.selection.deselectVector(geoId)
      else if (type === 'perpendicularLine') this.scene.selection.deselectPerpendicularLine(geoId)
      else this.scene.selection.deselectParallelLine(geoId)
      return
    }

    if (this.getParallelLineSelectionTargets().length >= 1) {
      this.clearParallelLineSelection()
    }

    if (type === 'line') this.scene.selection.selectLine(geoId, true)
    else if (type === 'straightLine') this.scene.selection.selectStraightLine(geoId, true)
    else if (type === 'ray') this.scene.selection.selectRay(geoId, true)
    else if (type === 'vector') this.scene.selection.selectVector(geoId, true)
    else if (type === 'perpendicularLine') this.scene.selection.selectPerpendicularLine(geoId, true)
    else this.scene.selection.selectParallelLine(geoId, true)

    this.tryCreateParallelLineFromSelection()
  }

  tryCreateParallelLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateParallelLine) return
    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length > 1) {
      this.selectedPoints = [point]
      this.scene.selection.points.clear()
      this.scene.selection.selectPoint(point.id, true)
    }

    this.tryCreateParallelLineFromSelection()
  }

  tryCreateParallelLineFromSelection() {
    if (this.mode !== EditorMode.CreateParallelLine) return

    const targets = this.getParallelLineSelectionTargets()
    if (targets.length === 0) return
    if (this.selectedPoints.length === 0) return

    const target = targets[0]!
    const point = this.selectedPoints[0]!
    if (!target || !point) return

    const entity =
      target.type === 'line'
        ? this.scene.lines.get(target.id)
        : target.type === 'straightLine'
          ? this.scene.straightLines.get(target.id)
          : target.type === 'ray'
            ? this.scene.rays.get(target.id)
            : target.type === 'vector'
              ? this.scene.vectors.get(target.id)
              : target.type === 'perpendicularLine'
                ? this.scene.perpendicularLines.get(target.id)
                : this.scene.parallelLines.get(target.id)
    if (!entity) return

    if (entity.p1.id === point.id || entity.p2.id === point.id) {
      emitToast('通过点不能位于要平行的线上')
      return
    }

    const targetDir = new Vec3(
      entity.p2.position.x - entity.p1.position.x,
      entity.p2.position.y - entity.p1.position.y,
      entity.p2.position.z - entity.p1.position.z,
    )
    const targetDirLen = Math.hypot(targetDir.x, targetDir.y, targetDir.z)
    if (targetDirLen <= 1e-5) {
      emitToast('目标线方向向量长度为零，无法创建平行线')
      return
    }
    const normalizedDir = new Vec3(targetDir.x / targetDirLen, targetDir.y / targetDirLen, targetDir.z / targetDirLen)

    const p2Position = new Vec3(
      point.position.x + normalizedDir.x * 10,
      point.position.y + normalizedDir.y * 10,
      point.position.z + normalizedDir.z * 10,
    )
    const footPoint = new Point3(
      genId('pp2'),
      '',
      p2Position,
      false,
      false,
      false,
    )

    const parallelLineName = genNextAvailableName(
      [...this.scene.parallelLines.values()].map((l) => l.name),
      0,
      (index) => (index === 0 ? 'w' : `w${index}`),
    )

    const parallelLine = new ParallelLine3(
      genId('pll'),
      parallelLineName,
      point,
      footPoint,
      { type: target.type, id: target.id },
      false,
      true,
    )

    // 使用 SnapshotCommand 统一管理平行线+约束的创建，确保撤销/重做完整
    const cmd = new SnapshotCommand('CreateParallelLine', this.scene, () => {
      this.scene.addParallelLine(parallelLine)
      const constraint = new ParallelLineConstraint(this.scene, parallelLine.id, { type: target.type, id: target.id })
      this.scene.addParallelLineConstraint(constraint)
      constraint.solve()
    })
    cmd.executeAndCapture()
    this.executeHistoryEntry(cmd)

    this.clearParallelLineSelection()
    this.scene.selection.clear()
    this.scene.selection.selectParallelLine(parallelLine.id)
  }

  deleteParallelLine(lineId: string) {
    const line = this.scene.parallelLines.get(lineId)
    if (!line) return
    this.removeConstrainedPointsReferencing('parallelLine', lineId)
    const dependentIntersectionPoints = this.collectDependentIntersectionPoints([
      { type: 'parallelLine', id: lineId },
    ])
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'parallelLine' && pl.target.id === lineId,
    )
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'parallelLine' && pl.target.id === lineId,
    )
    // 清理关联线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    this.executeHistoryEntry(createDeleteParallelLineCommand(this.scene, line, dependentIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  updateParallelLine(
    lineId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      displayLength?: number
      userLocked?: boolean
    },
  ) {
    const line = this.scene.parallelLines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextNameVisible = patch.nameVisible ?? line.nameVisible
    const nextValueVisible = patch.valueVisible ?? line.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? line.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? line.labelOffsetY
    const nextVisible = patch.visible ?? line.visible
    const nextDisplayLength = ParallelLine3.normalizeDisplayLength(
      patch.displayLength ?? line.displayLength,
    )
    const nextUserLocked = patch.userLocked ?? line.userLocked
    if (
      nextName === line.name &&
      nextNameVisible === line.nameVisible &&
      nextValueVisible === line.valueVisible &&
      nextLabelOffsetX === line.labelOffsetX &&
      nextLabelOffsetY === line.labelOffsetY &&
      nextVisible === line.visible &&
      nextDisplayLength === line.displayLength &&
      nextUserLocked === line.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdateParallelLineCommand(
        line.id,
        {
          name: line.name,
          nameVisible: line.nameVisible,
          valueVisible: line.valueVisible,
          labelOffsetX: line.labelOffsetX,
          labelOffsetY: line.labelOffsetY,
          visible: line.visible,
          displayLength: line.displayLength,
          userLocked: line.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          displayLength: nextDisplayLength,
          userLocked: nextUserLocked,
        },
        this.scene,
      ),
    )
  }

  setParallelLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.parallelLines.get(lineId)
    if (!line) return
    const p1Transforms = locked
      ? [line.p1]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: true,
          }))
          .filter((transform) => transform.before !== transform.after)
      : [line.p1]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    if (line.userLocked === locked && p1Transforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        p1Transforms,
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [{ line, before: line.userLocked, after: locked }],
      ),
    )
  }

  toggleIntersectionSelection(type: IntersectionTargetType, geoId: string) {
    if (this.mode !== EditorMode.IntersectionPoint) return

    const isSelected =
      (type === 'line' && this.scene.selection.lines.has(geoId)) ||
      (type === 'straightLine' && this.scene.selection.straightLines.has(geoId)) ||
      (type === 'ray' && this.scene.selection.rays.has(geoId)) ||
      (type === 'vector' && this.scene.selection.vectors.has(geoId)) ||
      (type === 'perpendicularLine' && this.scene.selection.perpendicularLines.has(geoId)) ||
      (type === 'parallelLine' && this.scene.selection.parallelLines.has(geoId)) ||
      (type === 'face' && this.scene.selection.faces.has(geoId))

    if (isSelected) {
      if (type === 'line') this.scene.selection.deselectLine(geoId)
      else if (type === 'straightLine') this.scene.selection.deselectStraightLine(geoId)
      else if (type === 'ray') this.scene.selection.deselectRay(geoId)
      else if (type === 'vector') this.scene.selection.deselectVector(geoId)
      else if (type === 'perpendicularLine') this.scene.selection.deselectPerpendicularLine(geoId)
      else if (type === 'parallelLine') this.scene.selection.deselectParallelLine(geoId)
      else this.scene.selection.deselectFace(geoId)
      return
    }

    if (this.getIntersectionSelectionTargets().length >= 2) {
      this.clearIntersectionSelection()
    }

    if (type === 'line') this.scene.selection.selectLine(geoId, true)
    else if (type === 'straightLine') this.scene.selection.selectStraightLine(geoId, true)
    else if (type === 'ray') this.scene.selection.selectRay(geoId, true)
    else if (type === 'vector') this.scene.selection.selectVector(geoId, true)
    else if (type === 'perpendicularLine') this.scene.selection.selectPerpendicularLine(geoId, true)
    else if (type === 'parallelLine') this.scene.selection.selectParallelLine(geoId, true)
    else this.scene.selection.selectFace(geoId, true)

    this.tryCreateIntersectionPointFromSelection()
  }

  tryCreateIntersectionPointFromSelection() {
    if (this.mode !== EditorMode.IntersectionPoint) return

    const targets = this.getIntersectionSelectionTargets()
    if (targets.length !== 2) return

    const [a, b] = targets
    if (!a || !b) return

    if (!canCreateIntersectionFromTargets(a, b)) {
      emitToast('交点仅支持两条线，或一条线与一个平面')
      return
    }

    const position = computeIntersectionPoint(this.scene, a, b)
    if (!position) {
      emitToast('所选对象平行，无法创建交点')
      return
    }

    const point = new Point3(
      genId('p'),
      genNextAvailableName(
        [...this.scene.points.values()].map((item) => item.name),
        65,
      ),
      position,
      false,
      true,
      false,
    )
    const constraint = new IntersectionPointConstraint(this.scene, point.id, a, b)
    this.executeHistoryEntry(createAddIntersectionPointCommand(this.scene, point, constraint))
    this.clearIntersectionSelection()
    this.scene.selection.selectPoint(point.id)
  }

  tryCreateLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateLine) return
    this.tryCreateLinearWith(point, 'line')
  }

  mergePoints(keepPointId: string, removePointId: string) {
    if (keepPointId === removePointId) return
    const keepPoint = this.scene.points.get(keepPointId)
    const removePoint = this.scene.points.get(removePointId)
    if (!keepPoint || !removePoint || (removePoint.locked && !removePoint.circleId)) return

    const keepConstrained = keepPoint.isConstrainedPoint
    const removeConstrained = removePoint.isConstrainedPoint
    if (keepConstrained && removeConstrained) {
      emitToast('两个约束点之间禁止合并')
      return
    }
    if (removeConstrained) {
      emitToast('约束点不支持被合并')
      return
    }

    const centerPoint =
      keepPoint.circleRole === 'center'
        ? keepPoint
        : removePoint.circleRole === 'center'
          ? removePoint
          : null
    if (centerPoint) {
      const otherPoint = centerPoint === keepPoint ? removePoint : keepPoint
      const circle = this.scene.circles.get(centerPoint.circleId!)
      if (
        circle &&
        (circle.p1.id === otherPoint.id ||
          circle.p2.id === otherPoint.id ||
          circle.p3.id === otherPoint.id)
      ) {
        emitToast('圆心不能和所属圆上的点合并')
        return
      }
    }

    const keepRpConstraint = keepPoint.regularPolygonId
      ? this.getRegularPolygonConstraint(keepPoint.regularPolygonId)
      : null
    const removeRpConstraint = removePoint.regularPolygonId
      ? this.getRegularPolygonConstraint(removePoint.regularPolygonId)
      : null

    if (
      keepRpConstraint &&
      removeRpConstraint &&
      keepRpConstraint.constraintId === removeRpConstraint.constraintId
    ) {
      emitToast('同一正多边形内部的点禁止合并')
      return
    }

    if (
      keepRpConstraint &&
      removeRpConstraint &&
      keepRpConstraint.constraintId !== removeRpConstraint.constraintId
    ) {
      emitToast('不同正多边形之间的点禁止合并')
      return
    }

    if (removePoint.regularPolygonRole === 'dependent') {
      emitToast('正多边形的受约束点不允许被外部点替换')
      return
    }

    const keepConstraint = keepPoint.cubeId ? this.getCubeConstraint(keepPoint.cubeId) : null
    const removeConstraint = removePoint.cubeId ? this.getCubeConstraint(removePoint.cubeId) : null

    if (keepConstraint && removeConstraint && keepConstraint.cubeId === removeConstraint.cubeId) {
      emitToast('同一正四/六面体内部的点禁止合并')
      return
    }

    if (removePoint.cubeRole === 'dependent') {
      emitToast('正四/六面体的受约束点不允许被外部点替换')
      return
    }

    // 棱柱守卫：同一棱柱内部的点禁止合并；棱柱 dependent 顶点不允许被外部点替换
    const keepPrismConstraint = keepPoint.prismId
      ? this.getPrismConstraint(keepPoint.prismId)
      : null
    const removePrismConstraint = removePoint.prismId
      ? this.getPrismConstraint(removePoint.prismId)
      : null
    if (
      keepPrismConstraint &&
      removePrismConstraint &&
      keepPrismConstraint.prismId === removePrismConstraint.prismId
    ) {
      emitToast('同一棱柱内部的点禁止合并')
      return
    }
    if (removePoint.prismRole === 'dependent') {
      emitToast('棱柱的受约束点不允许被外部点替换')
      return
    }

    if (
      keepPoint.cylinderId &&
      removePoint.cylinderId &&
      keepPoint.cylinderId === removePoint.cylinderId
    ) {
      emitToast('同一圆柱内部的点不支持合并')
      return
    }

    for (const pl of this.scene.parallelLines.values()) {
      const isSourcePoint = pl.p1.id === keepPoint.id || pl.p1.id === removePoint.id
      if (!isSourcePoint) continue
      const targetEntity = pl.getTargetEntity(this.scene)
      if (!targetEntity) continue
      const targetPointIds = [targetEntity.p1.id, targetEntity.p2.id]
      const isTargetPoint = targetPointIds.includes(keepPoint.id) || targetPointIds.includes(removePoint.id)
      if (isTargetPoint) {
        emitToast('平行线来源点之间不支持合并')
        return
      }
    }

    if (keepConstraint && removeConstraint && keepConstraint.cubeId !== removeConstraint.cubeId) {
      const mergeCommand = this.buildCubeTranslationMergeCommand(
        keepPoint,
        removePoint,
        keepConstraint,
        removeConstraint,
      )
      if (!mergeCommand) return
      this.executeHistoryEntry(mergeCommand)
    } else {
      this.executeHistoryEntry(createMergePointsCommand(this.scene, keepPoint, removePoint))
    }

    this.selectedPoints = []
    this.scene.selection.clear()
    this.scene.selection.selectPoint(keepPointId)
  }

  tryCreateStraightLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateStraightLine) return
    this.tryCreateLinearWith(point, 'straightLine')
  }

  tryCreateRayWith(point: Point3) {
    if (this.mode !== EditorMode.CreateRay) return
    this.tryCreateLinearWith(point, 'ray')
  }

  tryCreateVectorWith(point: Point3) {
    if (this.mode !== EditorMode.CreateVector) return

    if (this.selectedPoints.length === 1 && this.selectedPoints[0]!.id === point.id) {
      emitToast('向量的起点和终点不能是同一个点')
      return
    }

    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length === 2) {
      const [sp1, sp2] = this.selectedPoints
      const exists = [...this.scene.vectors.values()].some(
        (v) => v.p1.id === sp1!.id && v.p2.id === sp2!.id,
      )
      if (!exists) {
        const vector = new GeoVector3(
          genId('v'),
          genNextAvailableName(
            [...this.scene.vectors.values()].map((v) => v.name),
            0,
            (index) => (index === 0 ? 'v' : `v${index}`),
          ),
          sp1!,
          sp2!,
          false,
          true,
        )
        this.executeHistoryEntry(createAddElementCommand(this.scene, vector, 'vector'))
      } else {
        emitToast('向量已存在，创建向量失败')
      }

      this.selectedPoints = []
      this.scene.selection.clear()
    }
  }

  deleteVector(vectorId: string) {
    const vector = this.scene.vectors.get(vectorId)
    if (!vector) return
    this.removeConstrainedPointsReferencing('vector', vectorId)
    const relatedPerpendicularLines = [...this.scene.perpendicularLines.values()].filter(
      (pl) => pl.target.type === 'vector' && pl.target.id === vectorId,
    )
    const relatedParallelLines = [...this.scene.parallelLines.values()].filter(
      (pl) => pl.target.type === 'vector' && pl.target.id === vectorId,
    )
    const _rplIds = new Set(relatedPerpendicularLines.map((l) => l.id))
    const _rllIds = new Set(relatedParallelLines.map((l) => l.id))
    ;[...this.scene.perpendicularLines.values()].forEach((pl) => {
      if (_rplIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedPerpendicularLines.push(pl); _rplIds.add(pl.id) }
    })
    ;[...this.scene.parallelLines.values()].forEach((pl) => {
      if (_rllIds.has(pl.id)) return
      if (pl.target.type === 'perpendicularLine' && _rplIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
      if (pl.target.type === 'parallelLine' && _rllIds.has(pl.target.id)) { relatedParallelLines.push(pl); _rllIds.add(pl.id) }
    })
    // 清理关联垂线/平行线上的约束点
    relatedPerpendicularLines.forEach((pl) => this.removeConstrainedPointsReferencing('perpendicularLine', pl.id))
    relatedParallelLines.forEach((pl) => this.removeConstrainedPointsReferencing('parallelLine', pl.id))
    const cascadedIntersectionPoints = this.collectIntersectionPointsFromRelatedLines(relatedPerpendicularLines, relatedParallelLines)
    this.executeHistoryEntry(createDeleteVectorCommand(this.scene, vector, cascadedIntersectionPoints, relatedPerpendicularLines, relatedParallelLines))
  }

  isVectorLocked(vector: GeoVector3 | null | undefined) {
    return Boolean(
      vector &&
        (vector.userLocked ||
          (this.isPointCoordinateLocked(vector.p1) && this.isPointCoordinateLocked(vector.p2))),
    )
  }

  isVectorGeometryLocked(vector: GeoVector3 | null | undefined) {
    return Boolean(
      vector &&
        (vector.userLocked ||
          this.isPointCoordinateLocked(vector.p1) ||
          this.isPointCoordinateLocked(vector.p2)),
    )
  }

  setVectorLockState(vectorId: string, locked: boolean) {
    const vector = this.scene.vectors.get(vectorId)
    if (!vector) return
    const endpointTransforms = !locked
      ? [vector.p1, vector.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (vector.userLocked === locked && endpointTransforms.length === 0) return

    this.executeHistoryEntry(
      createSyncLockStateCommand(
        this.scene,
        endpointTransforms,
        [],
        [],
        [],
        [{ vector, before: vector.userLocked, after: locked }],
      ),
    )
  }

  updateVector(
    vectorId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      valueVisible?: boolean
      labelOffsetX?: number
      labelOffsetY?: number
      visible?: boolean
      userLocked?: boolean
    },
  ) {
    const vector = this.scene.vectors.get(vectorId)
    if (!vector) return

    const nextName = patch.name ?? vector.name
    const nextNameVisible = patch.nameVisible ?? vector.nameVisible
    const nextValueVisible = patch.valueVisible ?? vector.valueVisible
    const nextLabelOffsetX = patch.labelOffsetX ?? vector.labelOffsetX
    const nextLabelOffsetY = patch.labelOffsetY ?? vector.labelOffsetY
    const nextVisible = patch.visible ?? vector.visible
    const nextUserLocked = patch.userLocked ?? vector.userLocked
    if (
      nextName === vector.name &&
      nextNameVisible === vector.nameVisible &&
      nextValueVisible === vector.valueVisible &&
      nextLabelOffsetX === vector.labelOffsetX &&
      nextLabelOffsetY === vector.labelOffsetY &&
      nextVisible === vector.visible &&
      nextUserLocked === vector.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdateVectorCommand(
        this.scene,
        vector.id,
        {
          name: vector.name,
          nameVisible: vector.nameVisible,
          valueVisible: vector.valueVisible,
          labelOffsetX: vector.labelOffsetX,
          labelOffsetY: vector.labelOffsetY,
          visible: vector.visible,
          userLocked: vector.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          valueVisible: nextValueVisible,
          labelOffsetX: nextLabelOffsetX,
          labelOffsetY: nextLabelOffsetY,
          visible: nextVisible,
          userLocked: nextUserLocked,
        },
      ),
    )
  }

  tryCreateThreePointCircleWith(point: Point3) {
    if (this.mode !== EditorMode.CreateCircleThreePoints) return
    this.scene.selection.selectPoint(point.id, true)
    if (!this.selectedPoints.includes(point)) this.selectedPoints.push(point)
    if (this.selectedPoints.length !== 3) return

    const [p1, p2, p3] = this.selectedPoints
    const exists = [...this.scene.circles.values()].some((circle) => {
      const ids = [circle.p1.id, circle.p2.id, circle.p3.id]
      return [p1!.id, p2!.id, p3!.id].every((id) => ids.includes(id))
    })
    if (exists) {
      emitToast('三点圆已存在，创建圆失败')
      this.selectedPoints = []
      this.scene.selection.clear()
      return
    }

    const circle = new Circle3(
      genId('c'),
      genNextAvailableName(
        [...this.scene.circles.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'c' : `c${index}`),
      ),
      p1!,
      p2!,
      p3!,
      false,
      true,
    )
    if (!circle.isValid()) {
      emitToast('三个点不能在同一条直线上')
      this.selectedPoints = []
      this.scene.selection.clear()
      return
    }

    const frame = circle.getFrame()!
    const centerPoint = new Point3(
      genId('p'),
      genNextAvailableName(
        [...this.scene.points.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'P' : `P${index}`),
      ),
      frame.center,
      true,
      true,
      false,
      Point3.DEFAULT_LABEL_OFFSET_X,
      Point3.DEFAULT_LABEL_OFFSET_Y,
      false,
    )
    centerPoint.circleId = circle.id
    centerPoint.circleRole = 'center'

    this.beginTransaction('CreateThreePointCircle')
    this.executeHistoryEntry(createAddElementCommand(this.scene, circle, 'circle'))
    this.executeHistoryEntry(createAddElementCommand(this.scene, centerPoint, 'point'))
    this.commitTransaction()
    this.selectedPoints = []
    this.scene.selection.clear()
    this.scene.selection.selectCircle(circle.id)
  }

  resolveDirectionVector(directionType: DirectionType, directionId: string): Vec3 | null {
    if (directionType === 'point') {
      return new Vec3(0, 1, 0)
    }
    if (directionType === 'line') {
      const line = this.scene.lines.get(directionId)
      if (!line) return null
      return new Vec3(
        line.p2.position.x - line.p1.position.x,
        line.p2.position.y - line.p1.position.y,
        line.p2.position.z - line.p1.position.z,
      )
    }
    if (directionType === 'straightLine') {
      const line = this.scene.straightLines.get(directionId)
      if (!line) return null
      return new Vec3(
        line.p2.position.x - line.p1.position.x,
        line.p2.position.y - line.p1.position.y,
        line.p2.position.z - line.p1.position.z,
      )
    }
    if (directionType === 'ray') {
      const ray = this.scene.rays.get(directionId)
      if (!ray) return null
      return new Vec3(
        ray.p2.position.x - ray.p1.position.x,
        ray.p2.position.y - ray.p1.position.y,
        ray.p2.position.z - ray.p1.position.z,
      )
    }
    if (directionType === 'vector') {
      const vector = this.scene.vectors.get(directionId)
      if (!vector) return null
      return new Vec3(
        vector.p2.position.x - vector.p1.position.x,
        vector.p2.position.y - vector.p1.position.y,
        vector.p2.position.z - vector.p1.position.z,
      )
    }
    return null
  }

  tryCreateNormalCircle(
    centerPoint: Point3,
    directionType: DirectionType,
    directionId: string,
    radius: number,
  ) {
    if (radius <= 0) {
      emitToast('半径必须大于0')
      return
    }
    const directionVector = this.resolveDirectionVector(directionType, directionId)
    if (!directionVector) {
      emitToast('无法解析法向量，请检查所选对象')
      return
    }
    const circle = new Circle3(
      genId('c'),
      genNextAvailableName(
        [...this.scene.circles.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'c' : `c${index}`),
      ),
      centerPoint,
      centerPoint,
      centerPoint,
      false,
      true,
      false,
      Circle3.DEFAULT_LABEL_OFFSET_X,
      Circle3.DEFAULT_LABEL_OFFSET_Y,
      false,
      true,
      'normal',
      directionType,
      directionId,
      radius,
    )
    if (!circle.isValid(directionVector)) {
      emitToast('无法创建法向圆，请检查法向量和半径')
      return
    }
    this.executeHistoryEntry(createAddElementCommand(this.scene, circle, 'circle'))
    this.selectedPoints = []
    this.scene.selection.clear()
    this.scene.selection.selectCircle(circle.id)
  }

  tryCreateRegularPolygon(p1: Point3, p2: Point3, vertexCount: number) {
    if (vertexCount < 3) {
      emitToast('正多边形的顶点数必须大于 2')
      return
    }
    if (p1.id === p2.id) {
      emitToast('正多边形的两个端点不能相同')
      return
    }

    const edge = new Vec3(
      p2.position.x - p1.position.x,
      p2.position.y - p1.position.y,
      p2.position.z - p1.position.z,
    )
    const edgeLength = Math.hypot(edge.x, edge.y, edge.z)
    if (edgeLength <= 1e-6) {
      emitToast('两点距离过近，无法创建正多边形')
      return
    }

    const uAxis = new Vec3(edge.x / edgeLength, edge.y / edgeLength, edge.z / edgeLength)

    const worldAxes = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)]
    const referenceAxis = worldAxes.reduce((best, candidate) => {
      const bestDot = Math.abs(best.x * uAxis.x + best.y * uAxis.y + best.z * uAxis.z)
      const candidateDot = Math.abs(
        candidate.x * uAxis.x + candidate.y * uAxis.y + candidate.z * uAxis.z,
      )
      return candidateDot < bestDot ? candidate : best
    })

    const projectedReference = new Vec3(
      referenceAxis.x -
        uAxis.x *
          (referenceAxis.x * uAxis.x + referenceAxis.y * uAxis.y + referenceAxis.z * uAxis.z),
      referenceAxis.y -
        uAxis.y *
          (referenceAxis.x * uAxis.x + referenceAxis.y * uAxis.y + referenceAxis.z * uAxis.z),
      referenceAxis.z -
        uAxis.z *
          (referenceAxis.x * uAxis.x + referenceAxis.y * uAxis.y + referenceAxis.z * uAxis.z),
    )
    const projectedLength = Math.hypot(
      projectedReference.x,
      projectedReference.y,
      projectedReference.z,
    )
    if (projectedLength <= 1e-6) {
      emitToast('无法确定正多边形所在平面')
      return
    }

    const vAxis = new Vec3(
      projectedReference.x / projectedLength,
      projectedReference.y / projectedLength,
      projectedReference.z / projectedLength,
    )

    const constraintId = genId('rp')
    p1.regularPolygonId = constraintId
    p1.regularPolygonRole = 'owner'
    p2.regularPolygonId = constraintId
    p2.regularPolygonRole = 'owner'

    const usedPointNames = new Set([...this.scene.points.values()].map((point) => point.name))
    const nextPointName = () => {
      const name = genNextAvailableName(usedPointNames, 65)
      usedPointNames.add(name)
      return name
    }

    const boundaryPointIds = [p1.id, p2.id]
    const newPoints: Point3[] = []
    const dependentLayouts: Array<{ pointId: string; angleIndex: number }> = []

    const circumradius = edgeLength / (2 * Math.sin(Math.PI / vertexCount))
    const halfTan = edgeLength / (2 * Math.tan(Math.PI / vertexCount))
    const center = new Vec3(
      p1.position.x + (edgeLength / 2) * uAxis.x + halfTan * vAxis.x,
      p1.position.y + (edgeLength / 2) * uAxis.y + halfTan * vAxis.y,
      p1.position.z + (edgeLength / 2) * uAxis.z + halfTan * vAxis.z,
    )

    for (let i = 2; i < vertexCount; i++) {
      const alpha = -Math.PI / 2 - Math.PI / vertexCount + (2 * Math.PI * i) / vertexCount
      const cosA = Math.cos(alpha)
      const sinA = Math.sin(alpha)

      const worldPos = new Vec3(
        center.x + circumradius * (uAxis.x * cosA + vAxis.x * sinA),
        center.y + circumradius * (uAxis.y * cosA + vAxis.y * sinA),
        center.z + circumradius * (uAxis.z * cosA + vAxis.z * sinA),
      )

      const point = new Point3(genId('p'), nextPointName(), worldPos, false, true)
      point.regularPolygonId = constraintId
      point.regularPolygonRole = 'dependent'
      newPoints.push(point)
      boundaryPointIds.push(point.id)
      dependentLayouts.push({ pointId: point.id, angleIndex: i })
    }

    const usedFaceNames = new Set([...this.scene.faces.values()].map((face) => face.name))
    const faceName = genNextAvailableName(usedFaceNames, 0, (index) =>
      index === 0 ? 'F' : `F${index}`,
    )

    const supportPointIds =
      boundaryPointIds.length >= 3 ? boundaryPointIds.slice(0, 3) : boundaryPointIds

    const rpName = genNextAvailableName(
      [...this.scene.regularPolygonConstraints.values()]
        .map((c) => ('name' in c ? String((c as Record<string, unknown>).name) : ''))
        .filter(Boolean),
      0,
      (index) => `正多边形${index + 1}`,
    )

    const face = new PlanarPolygon(
      genId('f'),
      faceName,
      boundaryPointIds,
      boundaryPointIds,
      [],
      false,
      true,
      false,
      supportPointIds,
      false,
      0,
      [],
      PlanarPolygon.DEFAULT_LABEL_OFFSET_X,
      PlanarPolygon.DEFAULT_LABEL_OFFSET_Y,
      false,
      true,
      vertexCount,
    )

    face.regularPolygonId = constraintId
    face.regularPolygonOwnerPointIds = [p1.id, p2.id]
    face.regularPolygonDependentPointIds = newPoints.map((p) => p.id)
    face.normalize(this.scene.points)

    const { newLines, boundaryLineIds } = this.ensureBoundaryLines(
      face.boundaryPointIds,
      [],
      new Map(newPoints.map((p) => [p.id, p])),
      'regularPolygon',
    )
    face.boundaryLineIds = boundaryLineIds

    const constraint = new RegularPolygonConstraint(
      this.scene,
      constraintId,
      [p1.id, p2.id],
      dependentLayouts,
      face.id,
      vertexCount,
      vAxis.clone(),
      rpName,
    )

    this.executeHistoryEntry(
      createAddRegularPolygonCommand(this.scene, newPoints, face, constraint, newLines),
    )

    this.selectedPoints = []
    this.scene.selection.clear()
    this.scene.selection.selectFace(face.id)
  }

  tryCreateFaceFromSelection() {
    if (this.mode !== EditorMode.CreatePlane) return

    const selectedPoints = [...this.scene.selection.points]
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const selectedLines = [...this.scene.selection.lines]
      .map((id) => this.scene.lines.get(id))
      .filter((line): line is Line3 => line !== undefined)

    const draft = this.buildFaceDraftFromSelection(selectedPoints, selectedLines)
    if (!draft) return

    const { newLines, boundaryLineIds } = this.ensureBoundaryLines(
      draft.boundaryPointIds,
      draft.boundaryLineIds,
      new Map(),
      'polygon',
    )

    const face = new PlanarPolygon(
      genId('f'),
      genNextAvailableName(
        [...this.scene.faces.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'F' : `F${index}`),
      ),
      draft.boundaryPointIds,
      draft.memberPointIds,
      boundaryLineIds,
      false,
      true,
      false,
      draft.supportPointIds,
      false,
      0,
      [],
    )

    face.normalize(this.scene.points)
    this.executeHistoryEntry(createAddElementCommand(this.scene, face, 'face', newLines))
    this.scene.selection.clear()
    this.scene.selection.selectFace(face.id)
  }

  tryCreateHexahedronFromSelection() {
    const { ownerPoints, sourceLineId } = this.getSelectedSolidOwnerPoints()
    if (!ownerPoints) return
    const axes = this.resolveSolidAxes(ownerPoints, 'hexahedron')
    if (!axes) return
    const { p1, p2, edgeLength, uAxis, vAxis, wAxis } = axes

    const usedPointNames = new Set([...this.scene.points.values()].map((point) => point.name))
    const nextPointName = () => {
      const name = genNextAvailableName(usedPointNames, 65)
      usedPointNames.add(name)
      return name
    }
    const usedFaceNames = new Set([...this.scene.faces.values()].map((face) => face.name))
    const nextFaceName = () => {
      const name = genNextAvailableName(usedFaceNames, 0, (index) =>
        index === 0 ? 'F' : `F${index}`,
      )
      usedFaceNames.add(name)
      return name
    }

    const createCubePoint = (x: number, y: number, z: number) => {
      const point = new Point3(
        genId('p'),
        nextPointName(),
        new Vec3(
          p1.position.x + (uAxis.x * x + vAxis.x * y + wAxis.x * z) * edgeLength,
          p1.position.y + (uAxis.y * x + vAxis.y * y + wAxis.y * z) * edgeLength,
          p1.position.z + (uAxis.z * x + vAxis.z * y + wAxis.z * z) * edgeLength,
        ),
      )
      point.cubeRole = 'dependent'
      return point
    }

    const p3 = createCubePoint(0, 1, 0)
    const p4 = createCubePoint(1, 1, 0)
    const p5 = createCubePoint(0, 0, 1)
    const p6 = createCubePoint(1, 0, 1)
    const p7 = createCubePoint(1, 1, 1)
    const p8 = createCubePoint(0, 1, 1)
    const cubeId = genId('cube')
    const ownerPointIds = [p1.id, p2.id] as [string, string]
    p1.cubeId = cubeId
    p2.cubeId = cubeId
    p1.cubeRole = 'owner'
    p2.cubeRole = 'owner'
    const dependentPoints = [p3, p4, p5, p6, p7, p8]
    dependentPoints.forEach((point) => {
      point.cubeId = cubeId
    })
    const dependentPointIds = dependentPoints.map((point) => point.id)
    const cubeName = genNextAvailableName(
      this.getCubeConstraints().map((constraint) => constraint.name),
      0,
      (index) => `正六面体${index + 1}`,
    )
    const makeFace = (boundaryPointIds: string[]) => {
      const face = new PlanarPolygon(genId('f'), nextFaceName(), boundaryPointIds, boundaryPointIds)
      face.fillColor = 0xf4a7a7
      face.fillOpacity = 0.22
      face.userLocked = false
      face.nameVisible = false
      face.cubeId = cubeId
      face.cubeOwnerPointIds = [...ownerPointIds]
      face.cubeDependentPointIds = [...dependentPointIds]
      return face
    }

    const faces = [
      makeFace([p1.id, p2.id, p4.id, p3.id]),
      makeFace([p5.id, p6.id, p7.id, p8.id]),
      makeFace([p1.id, p2.id, p6.id, p5.id]),
      makeFace([p2.id, p4.id, p7.id, p6.id]),
      makeFace([p4.id, p3.id, p8.id, p7.id]),
      makeFace([p3.id, p1.id, p5.id, p8.id]),
    ]

    const allBoundaryLines = this.ensureBoundaryLinesForFaces(
      faces,
      new Map(dependentPoints.map((p) => [p.id, p])),
      'hexahedron',
    )

    const constraint = new CubeConstraint(
      this.scene,
      cubeId,
      'hexahedron',
      ownerPointIds,
      [
        { pointId: p3.id, x: 0, y: 1, z: 0 },
        { pointId: p4.id, x: 1, y: 1, z: 0 },
        { pointId: p5.id, x: 0, y: 0, z: 1 },
        { pointId: p6.id, x: 1, y: 0, z: 1 },
        { pointId: p7.id, x: 1, y: 1, z: 1 },
        { pointId: p8.id, x: 0, y: 1, z: 1 },
      ],
      faces.map((face) => face.id),
      sourceLineId,
      vAxis.clone(),
      cubeName,
    )

    this.executeHistoryEntry(
      createAddHexahedronCommand(this.scene, dependentPoints, faces, constraint, allBoundaryLines),
    )
    this.scene.selection.clear()
    this.selectCubeByFaceId(faces[0]!.id)
  }

  tryCreateTetrahedronFromSelection() {
    const { ownerPoints, sourceLineId } = this.getSelectedSolidOwnerPoints()
    if (!ownerPoints) return
    const axes = this.resolveSolidAxes(ownerPoints, 'tetrahedron')
    if (!axes) return
    const { p1, p2, edgeLength, uAxis, vAxis, wAxis } = axes

    const usedPointNames = new Set([...this.scene.points.values()].map((point) => point.name))
    const nextPointName = () => {
      const name = genNextAvailableName(usedPointNames, 65)
      usedPointNames.add(name)
      return name
    }
    const usedFaceNames = new Set([...this.scene.faces.values()].map((face) => face.name))
    const nextFaceName = () => {
      const name = genNextAvailableName(usedFaceNames, 0, (index) =>
        index === 0 ? 'F' : `F${index}`,
      )
      usedFaceNames.add(name)
      return name
    }

    const createTetraPoint = (x: number, y: number, z: number) => {
      const point = new Point3(
        genId('p'),
        nextPointName(),
        new Vec3(
          p1.position.x + (uAxis.x * x + vAxis.x * y + wAxis.x * z) * edgeLength,
          p1.position.y + (uAxis.y * x + vAxis.y * y + wAxis.y * z) * edgeLength,
          p1.position.z + (uAxis.z * x + vAxis.z * y + wAxis.z * z) * edgeLength,
        ),
      )
      point.cubeRole = 'dependent'
      return point
    }

    const sqrt3 = Math.sqrt(3)
    const sqrtTwoThirds = Math.sqrt(2 / 3)
    const p3 = createTetraPoint(0.5, sqrt3 / 2, 0)
    const p4 = createTetraPoint(0.5, sqrt3 / 6, sqrtTwoThirds)
    const cubeId = genId('cube')
    const ownerPointIds = [p1.id, p2.id] as [string, string]
    p1.cubeId = cubeId
    p2.cubeId = cubeId
    p1.cubeRole = 'owner'
    p2.cubeRole = 'owner'
    const dependentPoints = [p3, p4]
    dependentPoints.forEach((point) => {
      point.cubeId = cubeId
    })
    const dependentPointIds = dependentPoints.map((point) => point.id)
    const cubeName = genNextAvailableName(
      this.getCubeConstraints().map((constraint) => constraint.name),
      0,
      (index) => `正四面体${index + 1}`,
    )
    const makeFace = (boundaryPointIds: string[]) => {
      const face = new PlanarPolygon(genId('f'), nextFaceName(), boundaryPointIds, boundaryPointIds)
      face.fillColor = 0xf4a7a7
      face.fillOpacity = 0.22
      face.userLocked = false
      face.nameVisible = false
      face.cubeId = cubeId
      face.cubeOwnerPointIds = [...ownerPointIds]
      face.cubeDependentPointIds = [...dependentPointIds]
      return face
    }

    const faces = [
      makeFace([p1.id, p2.id, p3.id]),
      makeFace([p1.id, p2.id, p4.id]),
      makeFace([p2.id, p3.id, p4.id]),
      makeFace([p3.id, p1.id, p4.id]),
    ]

    const allBoundaryLines = this.ensureBoundaryLinesForFaces(
      faces,
      new Map(dependentPoints.map((p) => [p.id, p])),
      'tetrahedron',
    )

    const constraint = new CubeConstraint(
      this.scene,
      cubeId,
      'tetrahedron',
      ownerPointIds,
      [
        { pointId: p3.id, x: 0.5, y: sqrt3 / 2, z: 0 },
        { pointId: p4.id, x: 0.5, y: sqrt3 / 6, z: sqrtTwoThirds },
      ],
      faces.map((face) => face.id),
      sourceLineId,
      vAxis.clone(),
      cubeName,
    )

    this.executeHistoryEntry(
      createAddHexahedronCommand(this.scene, dependentPoints, faces, constraint, allBoundaryLines),
    )
    this.scene.selection.clear()
    this.selectCubeByFaceId(faces[0]!.id)
  }

  /**
   * 棱柱创建：以一个已存在的多边形作为底面，再选中底面外的一点作为最高点。
   * 底面多边形沿「底面参考顶点 → 最高点」向量平移得到顶面，顶面其余顶点为 dependent。
   * 参考顶点取底面 boundaryPointIds 中距离最高点最近的那个，保证几何直观。
   */
  tryCreatePrism(bottomFace: PlanarPolygon, topPoint: Point3) {
    if (bottomFace.boundaryPointIds.length < 3) {
      emitToast('棱柱的底面多边形至少需要 3 个顶点')
      return
    }
    if (bottomFace.boundaryPointIds.includes(topPoint.id)) {
      emitToast('最高点不能在底面多边形上')
      return
    }
    // 已被其他棱柱引用的底面禁止重复作为棱柱底
    if (bottomFace.prismId) {
      emitToast('该多边形已作为另一个棱柱的底面')
      return
    }
    if (topPoint.prismId) {
      emitToast('该点已属于另一个棱柱')
      return
    }

    // 1. 计算底面参考顶点（距离最高点最近的底面顶点）与平移向量
    let baseReferenceIndex = 0
    let minDist = Infinity
    bottomFace.boundaryPointIds.forEach((pid, idx) => {
      const v = this.scene.points.get(pid)
      if (!v) return
      const d = Math.hypot(
        v.position.x - topPoint.position.x,
        v.position.y - topPoint.position.y,
        v.position.z - topPoint.position.z,
      )
      if (d < minDist) {
        minDist = d
        baseReferenceIndex = idx
      }
    })
    const baseRefVertex = this.scene.points.get(
      bottomFace.boundaryPointIds[baseReferenceIndex]!,
    )
    if (!baseRefVertex) {
      emitToast('底面参考顶点缺失，无法创建棱柱')
      return
    }
    const translation = new Vec3(
      topPoint.position.x - baseRefVertex.position.x,
      topPoint.position.y - baseRefVertex.position.y,
      topPoint.position.z - baseRefVertex.position.z,
    )
    const height = Math.hypot(translation.x, translation.y, translation.z)
    if (height <= 1e-6) {
      emitToast('最高点与底面参考顶点距离过近，无法创建棱柱')
      return
    }

    const prismId = genId('prism')
    const bottomOwnerPointIds = [...bottomFace.boundaryPointIds]

    // 2. 创建顶面 dependent 顶点（底面顶点中除参考顶点外，全部平移）
    const usedPointNames = new Set([...this.scene.points.values()].map((point) => point.name))
    const nextPointName = () => {
      const name = genNextAvailableName(usedPointNames, 65)
      usedPointNames.add(name)
      return name
    }
    const usedFaceNames = new Set([...this.scene.faces.values()].map((face) => face.name))
    const nextFaceName = () => {
      const name = genNextAvailableName(usedFaceNames, 0, (index) =>
        index === 0 ? 'F' : `F${index}`,
      )
      usedFaceNames.add(name)
      return name
    }

    const dependentPoints: Point3[] = []
    const dependentLayouts: Array<{ pointId: string; baseIndex: number }> = []
    // 顶面 boundaryPointIds：按底面顺序，参考顶点位置放 topPoint.id，其余放 dependent 顶点 id
    const topBoundaryPointIds: string[] = []
    bottomFace.boundaryPointIds.forEach((pid, idx) => {
      if (idx === baseReferenceIndex) {
        topBoundaryPointIds.push(topPoint.id)
        return
      }
      const bottomVertex = this.scene.points.get(pid)
      if (!bottomVertex) return
      const point = new Point3(
        genId('p'),
        nextPointName(),
        new Vec3(
          bottomVertex.position.x + translation.x,
          bottomVertex.position.y + translation.y,
          bottomVertex.position.z + translation.z,
        ),
      )
      point.prismId = prismId
      point.prismRole = 'dependent'
      dependentPoints.push(point)
      dependentLayouts.push({ pointId: point.id, baseIndex: idx })
      topBoundaryPointIds.push(point.id)
    })

    // 3. 构建顶面 + 侧面
    const makeFace = (
      boundaryPointIds: string[],
      role: 'top' | 'side',
    ) => {
      const face = new PlanarPolygon(
        genId('f'),
        nextFaceName(),
        boundaryPointIds,
        boundaryPointIds,
      )
      face.fillColor = 0xa7c8f4
      face.fillOpacity = 0.22
      face.userLocked = false
      face.nameVisible = false
      face.prismId = prismId
      face.prismRole = role
      face.prismOwnerPointIds = [...bottomOwnerPointIds, topPoint.id]
      face.prismDependentPointIds = dependentPoints.map((p) => p.id)
      return face
    }

    const topFace = makeFace(topBoundaryPointIds, 'top')
    const sideFaces: PlanarPolygon[] = []
    const n = bottomFace.boundaryPointIds.length
    for (let i = 0; i < n; i++) {
      const cur = i
      const next = (i + 1) % n
      const bottomA = bottomFace.boundaryPointIds[cur]!
      const bottomB = bottomFace.boundaryPointIds[next]!
      const topA = topBoundaryPointIds[cur]!
      const topB = topBoundaryPointIds[next]!
      // 侧面四边形顺序：底A → 底B → 顶B → 顶A
      sideFaces.push(makeFace([bottomA, bottomB, topB, topA], 'side'))
    }

    const newFaces = [topFace, ...sideFaces]

    // 4. 创建边界线（顶面边 + 侧面竖直边），底面已有边界线复用
    const boundaryLines = this.ensureBoundaryLinesForFaces(
      newFaces,
      new Map(dependentPoints.map((p) => [p.id, p])),
      'prism',
    )

    // 5. 标记 owner 反向引用（底面所有顶点 + 最高点）
    bottomOwnerPointIds.forEach((pid) => {
      const p = this.scene.points.get(pid)
      if (p) {
        p.prismId = prismId
        p.prismRole = 'owner'
      }
    })
    topPoint.prismId = prismId
    topPoint.prismRole = 'owner'

    // 6. 创建约束
    const prismName = genNextAvailableName(
      this.getPrismConstraints().map((constraint) => constraint.name),
      0,
      (index) => `棱柱${index + 1}`,
    )
    const vAxisHint = new Vec3(
      translation.x / height,
      translation.y / height,
      translation.z / height,
    )
    const constraint = new PrismConstraint(
      this.scene,
      prismId,
      [baseRefVertex.id, topPoint.id],
      dependentLayouts,
      bottomFace.id,
      topFace.id,
      sideFaces.map((f) => f.id),
      baseReferenceIndex,
      vAxisHint,
      prismName,
    )

    // 7. 规范化面（计算法向等）
    newFaces.forEach((face) => face.normalize(this.scene.points))

    this.executeHistoryEntry(
      createAddPrismCommand(
        this.scene,
        dependentPoints,
        boundaryLines,
        newFaces,
        bottomFace.id,
        bottomOwnerPointIds,
        topPoint.id,
        constraint,
      ),
    )

    this.selectedPoints = []
    this.scene.selection.clear()
    this.selectPrismByFaceId(topFace.id)
  }

  getFacePreviewFromSelection(): FacePreviewData | null {
    if (this.mode !== EditorMode.CreatePlane) return null

    const selectedPoints = [...this.scene.selection.points]
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const selectedLines = [...this.scene.selection.lines]
      .map((id) => this.scene.lines.get(id))
      .filter((line): line is Line3 => line !== undefined)
    const draft = this.buildFaceDraftFromSelection(selectedPoints, selectedLines, false, false)
    if (!draft) return null

    const boundary = draft.boundaryPointIds
      .map((id) => draft.positionOverrides.get(id) ?? this.scene.points.get(id)?.position)
      .filter((point): point is Vec3 => point !== undefined)
      .map((point) => point.clone())
    if (boundary.length < 3) return null

    return {
      boundary,
      adjustedPoints: draft.adjustedPoints.map((item) => ({
        id: item.id,
        from: item.from.clone(),
        to: item.to.clone(),
      })),
      notices: [...draft.notices],
    }
  }

  tryCreateLinearWith(point: Point3, type: 'line' | 'straightLine' | 'ray') {
    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length === 2) {
      const [p1, p2] = this.selectedPoints
      const exists =
        type === 'line'
          ? [...this.scene.lines.values()].some(
              (l) =>
                (l.p1.id === p1!.id && l.p2.id === p2!.id) ||
                (l.p1.id === p2!.id && l.p2.id === p1!.id),
            )
          : type === 'straightLine'
            ? [...this.scene.straightLines.values()].some(
                (l) =>
                  (l.p1.id === p1!.id && l.p2.id === p2!.id) ||
                  (l.p1.id === p2!.id && l.p2.id === p1!.id),
              )
            : [...this.scene.rays.values()].some(
                (ray) => ray.p1.id === p1!.id && ray.p2.id === p2!.id,
              )

      if (!exists) {
        if (type === 'line') {
          const line = new Line3(
            genId('l'),
            genNextAvailableName(
              [...this.scene.lines.values()].map((line) => line.name),
              97,
            ),
            p1!,
            p2!,
            false,
          )
          this.executeHistoryEntry(createAddElementCommand(this.scene, line, 'line'))
        } else if (type === 'straightLine') {
          const line = new StraightLine3(
            genId('sl'),
            genNextAvailableName(
              [...this.scene.straightLines.values()].map((line) => line.name),
              0,
              (index) => (index === 0 ? 'm' : `m${index}`),
            ),
            p1!,
            p2!,
            false,
            true,
          )
          this.executeHistoryEntry(createAddElementCommand(this.scene, line, 'straightLine'))
        } else {
          const ray = new Ray3(
            genId('r'),
            genNextAvailableName(
              [...this.scene.rays.values()].map((ray) => ray.name),
              0,
              (index) => (index === 0 ? 'r' : `r${index}`),
            ),
            p1!,
            p2!,
            false,
            true,
          )
          this.executeHistoryEntry(createAddElementCommand(this.scene, ray, 'ray'))
        }
      } else {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              msg:
                type === 'line'
                  ? '线段已存在，创建线段失败'
                  : type === 'straightLine'
                    ? '直线已存在，创建直线失败'
                    : '射线已存在，创建射线失败',
              scope: 'viewport',
            },
          }),
        )
      }

      this.selectedPoints = []
      this.scene.selection.clear()
    }
  }

  buildFaceDraftFromSelection(
    points: Point3[],
    lines: Line3[],
    applyAutoAdjustments: boolean = true,
    notify: boolean = true,
  ): FaceDraft | null {
    const pointMap = new Map(points.map((point) => [point.id, point]))
    lines.forEach((line) => {
      pointMap.set(line.p1.id, line.p1)
      pointMap.set(line.p2.id, line.p2)
    })
    const uniquePoints = [...pointMap.values()]
    if (uniquePoints.length === 0) {
      return null
    }
    if (uniquePoints.length < 3) {
      if (notify) emitToast('创建多边形至少需要 3 个点，或一个由线段组成的闭环')
      return null
    }

    const optimization = autoOptimizeFacePoints(this, uniquePoints)
    const positionOverrides = applyAutoAdjustments
      ? new Map<string, Vec3>()
      : optimization.positionOverrides
    if (notify && applyAutoAdjustments && optimization.messages.length > 0) {
      emitToast(optimization.messages.join('；'))
    }

    const getPointPosition = (point: Point3) => positionOverrides.get(point.id) ?? point.position
    const allPositions = uniquePoints.map((point) => getPointPosition(point))
    const primaryPlane = computePlaneBasis(allPositions)
    if (!primaryPlane) {
      if (notify) emitToast('选中的点过于接近共线，无法创建稳定的多边形')
      return null
    }

    let boundaryPointIds: string[] = []
    const notices = [...optimization.messages]
    if (lines.length > 0) {
      const loopIds = orderedLoopFromLines(lines)
      if (loopIds && loopIds.length >= 3) {
        boundaryPointIds = loopIds
      } else {
        const hull = buildConvexHull(
          uniquePoints.map((point) => ({
            id: point.id,
            ...projectPoint2D(getPointPosition(point), primaryPlane),
          })),
        )
        boundaryPointIds = hull.map((point) => point.id)
        notices.push('所选线段未形成闭环，已按外轮廓自动建多边形')
        if (notify && applyAutoAdjustments) {
          emitToast('所选线段未形成闭环，已按外轮廓自动建多边形')
        }
      }
    } else {
      const hull = buildConvexHull(
        uniquePoints.map((point) => ({
          id: point.id,
          ...projectPoint2D(getPointPosition(point), primaryPlane),
        })),
      )
      boundaryPointIds = hull.map((point) => point.id)
      if (boundaryPointIds.length < 3) {
        if (notify) emitToast('选中的点无法形成有效面积')
        return null
      }
    }

    const boundaryPoints = boundaryPointIds
      .map((id) => pointMap.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const plane = computePlaneBasis(boundaryPoints.map((point) => getPointPosition(point)))
    if (!plane) {
      if (notify) emitToast('多边形的边界点共线，无法创建多边形')
      return null
    }

    const optimizedBoundaryIds = buildConvexHull(
      boundaryPoints.map((point) => ({
        id: point.id,
        ...projectPoint2D(getPointPosition(point), plane),
      })),
    ).map((point) => point.id)
    if (optimizedBoundaryIds.length >= 3) {
      const boundaryChanged =
        optimizedBoundaryIds.length !== boundaryPointIds.length ||
        optimizedBoundaryIds.some((id) => !boundaryPointIds.includes(id))
      boundaryPointIds = optimizedBoundaryIds
      if (boundaryChanged) {
        notices.push('已自动优化多边形的边界轮廓')
        if (notify && applyAutoAdjustments) {
          emitToast('已自动优化多边形的边界轮廓')
        }
      }
    }

    const signedArea = boundaryPointIds.reduce((sum, id, index, ids) => {
      const point = pointMap.get(id)
      const nextPoint = pointMap.get(ids[(index + 1) % ids.length]!)
      if (!point || !nextPoint) return sum
      const current2D = projectPoint2D(getPointPosition(point), plane)
      const next2D = projectPoint2D(getPointPosition(nextPoint), plane)
      return sum + current2D.x * next2D.y - next2D.x * current2D.y
    }, 0)
    if (signedArea < 0) {
      boundaryPointIds = [...boundaryPointIds].reverse()
    }
    const areaPoints = boundaryPointIds
      .map((id) => pointMap.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const area = areaPoints
      .map((point) => projectPoint2D(getPointPosition(point), plane))
      .reduce((sum, point, index, arr) => {
        const next = arr[(index + 1) % arr.length]!
        return sum + point.x * next.y - next.x * point.y
      }, 0)
    if (Math.abs(area) * 0.5 <= PLANAR_EPSILON) {
      if (notify) emitToast('多边形的面积过小，无法创建')
      return null
    }

    const memberPointIds = [
      ...new Set([...boundaryPointIds, ...uniquePoints.map((point) => point.id)]),
    ]
    const supportPointIds = computeSupportPointIds(
      memberPointIds
        .map((id) => pointMap.get(id))
        .filter((point): point is Point3 => point !== undefined),
    )
    if (supportPointIds.length < 3) {
      if (notify) emitToast('无法为该多边形建立稳定的平面约束')
      return null
    }

    const duplicate = [...this.scene.faces.values()].some((face) => {
      if (face.boundaryPointIds.length !== boundaryPointIds.length) return false
      return face.boundaryPointIds.every((id) => boundaryPointIds.includes(id))
    })
    if (duplicate) {
      if (notify) emitToast('相同边界的多边形已存在')
      return null
    }

    return {
      boundaryPointIds,
      memberPointIds,
      boundaryLineIds: lines.map((line) => line.id),
      supportPointIds,
      positionOverrides,
      notices,
      adjustedPoints: optimization.adjustedPoints,
    }
  }

  private ensureBoundaryLines(
    boundaryPointIds: string[],
    existingBoundaryLineIds: string[],
    extraPoints: Map<string, Point3> = new Map(),
    faceConstraintType?: FaceConstraintType,
  ): { newLines: Line3[]; boundaryLineIds: string[] } {
    const usedLineNames = new Set([...this.scene.lines.values()].map((line) => line.name))
    const nextLineName = () => {
      const name = genNextAvailableName(usedLineNames, 97)
      usedLineNames.add(name)
      return name
    }

    const getPoint = (id: string): Point3 | undefined => {
      return this.scene.points.get(id) ?? extraPoints.get(id)
    }

    const newLines: Line3[] = []
    const boundaryLineIds: string[] = []
    const existingLineMap = new Map<string, string>()
    existingBoundaryLineIds.forEach((lineId) => {
      const line = this.scene.lines.get(lineId)
      if (line) {
        const key = [line.p1.id, line.p2.id].sort().join('|')
        existingLineMap.set(key, lineId)
      }
    })

    for (let i = 0; i < boundaryPointIds.length; i++) {
      const p1Id = boundaryPointIds[i]!
      const p2Id = boundaryPointIds[(i + 1) % boundaryPointIds.length]!
      const key = [p1Id, p2Id].sort().join('|')

      const existingLineId = existingLineMap.get(key)
      if (existingLineId) {
        boundaryLineIds.push(existingLineId)
        continue
      }

      const foundLine = PlanarPolygon.findExistingLine(this.scene.lines, p1Id, p2Id)
      if (foundLine) {
        boundaryLineIds.push(foundLine.id)
        continue
      }

      const p1 = getPoint(p1Id)
      const p2 = getPoint(p2Id)
      if (!p1 || !p2) continue

      const line = new Line3(genId('l'), nextLineName(), p1, p2)
      line.faceOwned = true
      line.faceConstraintType = faceConstraintType ?? null
      newLines.push(line)
      boundaryLineIds.push(line.id)
      existingLineMap.set(key, line.id)
    }

    return { newLines, boundaryLineIds }
  }

  private ensureBoundaryLinesForFaces(
    faces: PlanarPolygon[],
    extraPoints: Map<string, Point3> = new Map(),
    faceConstraintType?: FaceConstraintType,
  ): Line3[] {
    const usedLineNames = new Set([...this.scene.lines.values()].map((line) => line.name))
    const nextLineName = () => {
      const name = genNextAvailableName(usedLineNames, 97)
      usedLineNames.add(name)
      return name
    }

    const allNewLines: Line3[] = []
    const edgeToLineId = new Map<string, string>()

    const getPoint = (id: string): Point3 | undefined => {
      return this.scene.points.get(id) ?? extraPoints.get(id)
    }

    faces.forEach((face) => {
      const boundaryLineIds: string[] = []
      for (let i = 0; i < face.boundaryPointIds.length; i++) {
        const p1Id = face.boundaryPointIds[i]!
        const p2Id = face.boundaryPointIds[(i + 1) % face.boundaryPointIds.length]!
        const key = [p1Id, p2Id].sort().join('|')

        const cachedLineId = edgeToLineId.get(key)
        if (cachedLineId) {
          boundaryLineIds.push(cachedLineId)
          continue
        }

        const foundLine = PlanarPolygon.findExistingLine(this.scene.lines, p1Id, p2Id)
        if (foundLine) {
          boundaryLineIds.push(foundLine.id)
          edgeToLineId.set(key, foundLine.id)
          continue
        }

        const p1 = getPoint(p1Id)
        const p2 = getPoint(p2Id)
        if (!p1 || !p2) continue

        const line = new Line3(genId('l'), nextLineName(), p1, p2)
        line.faceOwned = true
        line.faceConstraintType = faceConstraintType ?? null
        allNewLines.push(line)
        boundaryLineIds.push(line.id)
        edgeToLineId.set(key, line.id)
      }

      face.boundaryLineIds = boundaryLineIds
    })

    return allNewLines
  }

  getLockedTranslationGroup(pointIds: string[]) {
    const group = new Set(pointIds)
    const queue = [...pointIds]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      this.scene.lines.forEach((line) => {
        if (!line.lengthLocked) return
        if (line.p1.id !== currentId && line.p2.id !== currentId) return

        const otherId = line.p1.id === currentId ? line.p2.id : line.p1.id
        if (!group.has(otherId)) {
          group.add(otherId)
          queue.push(otherId)
        }
      })
    }

    return group
  }

  translatePointGroup(pointIds: string[], delta: Vec3) {
    const resolvedPositions = this.resolveConstrainedPointPositions(
      pointIds.map((id) => {
        const point = this.scene.points.get(id)
        return {
          id,
          position: point ? point.position.add(delta) : new Vec3(),
        }
      }),
    )
    const transforms = [...resolvedPositions.entries()]
      .map(([id, position]) => {
        const point = this.scene.points.get(id)
        if (!point || this.isPointCoordinateLocked(point)) return null

        const before = point.position.clone()
        if (before.x === position.x && before.y === position.y && before.z === position.z)
          return null
        return { pointId: point.id, before, after: position.clone() }
      })
      .filter(
        (transform): transform is { pointId: string; before: Vec3; after: Vec3 } =>
          transform !== null,
      )

    if (transforms.length === 0) return
    if (transforms.length === 1) {
      const transform = transforms[0]!
      this.executeCommand(new TransformCommand(transform.pointId, transform.before, transform.after, [], this.scene))
      return
    }

    this.executeCommand(new TransformPointsCommand(transforms, [], this.scene))
  }

  resolveConstrainedPointPositions(updates: Array<{ id: string; position: Vec3 }>) {
    const nextPositions = new Map<string, Vec3>()

    updates.forEach(({ id, position }) => {
      const point = this.scene.points.get(id)
      if (!point || this.isPointCoordinateLocked(point)) return
      nextPositions.set(id, position.clone())
    })

    const faceIds = new Set<string>()
    this.scene.faces.forEach((face) => {
      if (face.memberPointIds.some((id) => nextPositions.has(id))) {
        face.memberPointIds.forEach((id) => {
          const point = this.scene.points.get(id)
          if (!point || this.isPointCoordinateLocked(point)) return
          if (!nextPositions.has(id)) nextPositions.set(id, point.position.clone())
        })
        faceIds.add(face.id)
      }
    })

    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (const [id, position] of [...nextPositions.entries()]) {
        nextPositions.set(
          id,
          this.resolveLockedCubeOwnerPointPosition(
            id,
            this.resolveLockedLinePointPosition(id, position, nextPositions),
            nextPositions,
          ),
        )
      }

      this.applyCubeConstraintPositions(nextPositions)
      this.applyRegularPolygonConstraintPositions(nextPositions)
      this.applySphereConstraintPositions(nextPositions)

      const savedPositions = new Map<string, Vec3>()
      nextPositions.forEach((pos, id) => {
        const point = this.scene.points.get(id)
        if (point) {
          savedPositions.set(id, point.position.clone())
          point.setPosition(pos)
        }
      })

      this.applyObjectConstrainedPointPositions(nextPositions)

      savedPositions.forEach((pos, id) => {
        const point = this.scene.points.get(id)
        if (point) point.setPosition(pos)
      })

      faceIds.forEach((faceId) => {
        const face = this.scene.faces.get(faceId)
        if (!face) return
        const supportPoints: Vec3[] = face
          .getSupportPoints(this.scene.points)
          .map((point) => nextPositions.get(point.id) ?? point.position)
        const plane =
          computePlaneBasis(supportPoints) ??
          computePlaneBasis(
            face
              .getBoundaryPoints(this.scene.points)
              .map((point) => nextPositions.get(point.id) ?? point.position),
          )
        if (!plane) return

        face.memberPointIds.forEach((pointId) => {
          if (face.supportPointIds.includes(pointId)) return
          const point = this.scene.points.get(pointId)
          if (!point || this.isPointCoordinateLocked(point)) return
          if (point.regularPolygonId && point.regularPolygonRole === 'dependent') return
          const position = nextPositions.get(pointId) ?? point.position
          nextPositions.set(pointId, projectPointToPlane(position, plane))
        })

        if (!face.areaLocked || face.lockedArea <= PLANAR_EPSILON) return

        const boundaryPoints = face.getBoundaryPoints(this.scene.points)
        if (boundaryPoints.length < 3) return
        const projectedBoundary = boundaryPoints.map((point) =>
          projectPoint2D(nextPositions.get(point.id) ?? point.position, plane),
        )
        const currentArea =
          Math.abs(
            projectedBoundary.reduce((sum, point, index, arr) => {
              const next = arr[(index + 1) % arr.length]!
              return sum + point.x * next.y - next.x * point.y
            }, 0),
          ) * 0.5
        if (currentArea <= PLANAR_EPSILON) return

        const movableBoundaryIds = new Set(
          boundaryPoints
            .filter((point) => !this.isPointCoordinateLocked(point))
            .map((point) => point.id),
        )
        if (movableBoundaryIds.size === 0) return

        const centroid2D = projectedBoundary.reduce(
          (acc, point) => ({
            x: acc.x + point.x / projectedBoundary.length,
            y: acc.y + point.y / projectedBoundary.length,
          }),
          { x: 0, y: 0 },
        )

        const computeAreaForScale = (scale: number) =>
          Math.abs(
            boundaryPoints.reduce((sum, point, index, points) => {
              const current = projectedBoundary[index]!
              const nextBase = projectedBoundary[(index + 1) % points.length]!
              const currentScaled = movableBoundaryIds.has(point.id)
                ? {
                    x: centroid2D.x + (current.x - centroid2D.x) * scale,
                    y: centroid2D.y + (current.y - centroid2D.y) * scale,
                  }
                : current
              const nextPoint = points[(index + 1) % points.length]!
              const nextScaled = movableBoundaryIds.has(nextPoint.id)
                ? {
                    x: centroid2D.x + (nextBase.x - centroid2D.x) * scale,
                    y: centroid2D.y + (nextBase.y - centroid2D.y) * scale,
                  }
                : nextBase
              return sum + currentScaled.x * nextScaled.y - nextScaled.x * currentScaled.y
            }, 0),
          ) * 0.5

        let low = 0
        let high = Math.max(1, Math.sqrt(face.lockedArea / currentArea) * 2)
        while (computeAreaForScale(high) < face.lockedArea && high < 1024) {
          high *= 2
        }
        for (let i = 0; i < 24; i += 1) {
          const mid = (low + high) * 0.5
          if (computeAreaForScale(mid) < face.lockedArea) low = mid
          else high = mid
        }
        const scale = (low + high) * 0.5

        face.memberPointIds.forEach((pointId) => {
          const point = this.scene.points.get(pointId)
          if (!point || this.isPointCoordinateLocked(point)) return
          if (point.regularPolygonId && point.regularPolygonRole === 'dependent') return
          const current = projectPoint2D(nextPositions.get(pointId) ?? point.position, plane)
          nextPositions.set(
            pointId,
            toWorldPoint(
              plane,
              centroid2D.x + (current.x - centroid2D.x) * scale,
              centroid2D.y + (current.y - centroid2D.y) * scale,
            ),
          )
        })
      })
    }

    return nextPositions
  }

  private applyObjectConstrainedPointPositions(
    nextPositions: Map<string, Vec3>,
  ) {
    this.scene.objectConstrainedPointConstraints.forEach((constraint) => {
      const point = this.scene.points.get(constraint.pointId)
      if (!point || this.isPointCoordinateLocked(point)) return

      const depIds = constraint.getDependencyPointIds()
      const hasDepMoved = depIds.some((id) => id !== constraint.pointId && nextPositions.has(id))
      const isBeingDragged = this.scene.activeDraggedPointIds?.has(constraint.pointId) ?? false

      // For circle constraints, use the rotation-based approach to keep the
      // point at the same relative position on the circle when the normal or
      // center changes. The constraint's projectPositionWithRotation method
      // rotates the point's offset by the same rotation as the normal change,
      // then projects onto the new circle.
      if (constraint.target.type === 'circle' && hasDepMoved && !isBeingDragged) {
        const projected = constraint.projectPositionWithRotation(point.position)
        if (projected) {
          nextPositions.set(constraint.pointId, projected)
          constraint.computeParametricDataFromPosition(projected)
          return
        }
      }

      if (hasDepMoved && !isBeingDragged && constraint.parametricData) {
        const recomputed = constraint.recomputePosition()
        if (recomputed) {
          const finalPos = constraint.projectPosition(recomputed) ?? recomputed
          nextPositions.set(constraint.pointId, finalPos)
          // 不重新计算 parametricData：保持原始归一化比例不变，
          // 避免 projectPosition 边界钳制后比例被覆写导致漂移。
          return
        }
      }

      const position = nextPositions.get(constraint.pointId) ?? point.position
      const projected = constraint.projectPosition(position)
      if (projected) {
        nextPositions.set(constraint.pointId, projected)
        constraint.computeParametricDataFromPosition(projected)
      }
    })
  }

  removeConstrainedPointsReferencing(targetType: string, targetId: string) {
    const pointsToRemove: string[] = []
    this.scene.objectConstrainedPointConstraints.forEach((constraint) => {
      if (constraint.target.type === targetType && constraint.target.id === targetId) {
        pointsToRemove.push(constraint.pointId)
      }
    })
    pointsToRemove.forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (point) {
        this.scene.removeObjectConstrainedPointConstraint(pointId)
        this.scene.points.delete(pointId)
        this.scene.selection.points.delete(pointId)
        this.scene.markPointDirty(pointId)
      }
    })
  }

  resolveLockedLinePointPosition(
    pointId: string,
    position: Vec3,
    positionOverrides?: Map<string, Vec3>,
  ) {
    const point = this.scene.points.get(pointId)
    if (!point) return position.clone()

    let resolved = position.clone()

    this.scene.lines.forEach((line) => {
      if (!line.lengthLocked) return

      const isP1 = line.p1.id === pointId
      const isP2 = line.p2.id === pointId
      if (!isP1 && !isP2) return

      const anchor = isP1 ? line.p2 : line.p1
      if (!this.isPointCoordinateLocked(anchor)) return

      const anchorPosition = positionOverrides?.get(anchor.id) ?? anchor.position
      let dx = resolved.x - anchorPosition.x
      let dy = resolved.y - anchorPosition.y
      let dz = resolved.z - anchorPosition.z
      let distance = Math.hypot(dx, dy, dz)

      if (distance <= 1e-6) {
        const currentPosition = positionOverrides?.get(pointId) ?? point.position
        dx = currentPosition.x - anchorPosition.x
        dy = currentPosition.y - anchorPosition.y
        dz = currentPosition.z - anchorPosition.z
        distance = Math.hypot(dx, dy, dz)
      }

      if (distance <= 1e-6) {
        dx = isP1 ? -1 : 1
        dy = 0
        dz = 0
        distance = 1
      }

      const scale = line.lockedLength / distance
      resolved = new Vec3(
        anchorPosition.x + dx * scale,
        anchorPosition.y + dy * scale,
        anchorPosition.z + dz * scale,
      )
    })

    return resolved
  }

  resolveLockedCubeOwnerPointPosition(
    pointId: string,
    position: Vec3,
    positionOverrides?: Map<string, Vec3>,
  ) {
    const constraint = this.getCubeConstraintByPointId(pointId)
    if (!constraint || !constraint.edgeLengthLocked || !constraint.lockedEdgeLength) {
      return position.clone()
    }

    const point = this.scene.points.get(pointId)
    if (!point || point.cubeRole !== 'owner') return position.clone()
    const otherId =
      constraint.ownerPointIds[0] === pointId
        ? constraint.ownerPointIds[1]
        : constraint.ownerPointIds[0]
    const otherPoint = this.scene.points.get(otherId)
    if (!otherPoint) return position.clone()

    const anchor = positionOverrides?.get(otherId) ?? otherPoint.position
    let dx = position.x - anchor.x
    let dy = position.y - anchor.y
    let dz = position.z - anchor.z
    let distance = Math.hypot(dx, dy, dz)

    if (distance <= 1e-6) {
      const currentPosition = positionOverrides?.get(pointId) ?? point.position
      dx = currentPosition.x - anchor.x
      dy = currentPosition.y - anchor.y
      dz = currentPosition.z - anchor.z
      distance = Math.hypot(dx, dy, dz)
    }

    if (distance <= 1e-6) {
      dx = 1
      dy = 0
      dz = 0
      distance = 1
    }

    return new Vec3(
      anchor.x + (dx / distance) * constraint.lockedEdgeLength,
      anchor.y + (dy / distance) * constraint.lockedEdgeLength,
      anchor.z + (dz / distance) * constraint.lockedEdgeLength,
    )
  }

  updateFaceBoundaryEdgeLength(
    faceId: string,
    edgeIndex: number,
    nextLength: number,
    edgeTargets?: Array<number | null>,
  ): boolean {
    const face = this.scene.faces.get(faceId)
    if (!face || face.areaLocked) return false

    const normalizedLength = Line3.normalizeLockedLength(nextLength)
    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    if (boundaryPoints.length < 3) return false

    const plane =
      computePlaneBasis(face.getSupportPoints(this.scene.points).map((point) => point.position)) ??
      computePlaneBasis(boundaryPoints.map((point) => point.position))
    if (!plane) return false

    const projectedBoundary = boundaryPoints.map((point) =>
      projectPoint2D(projectPointToPlane(point.position, plane), plane),
    )
    const targetLengths = boundaryPoints.map((_, index) => {
      if (index === edgeIndex) return normalizedLength
      const target = edgeTargets?.[index]
      return typeof target === 'number' && Number.isFinite(target)
        ? Line3.normalizeLockedLength(target)
        : face.getEdgeLength(this.scene.points, index)
    })

    const startIndex = edgeIndex
    const endIndex = (edgeIndex + 1) % boundaryPoints.length
    const startPoint = boundaryPoints[startIndex]
    const endPoint = boundaryPoints[endIndex]
    if (!startPoint || !endPoint) return false

    const startLocked = this.isPointCoordinateLocked(startPoint)
    const endLocked = this.isPointCoordinateLocked(endPoint)
    if (startLocked && endLocked) return false

    const start2D = projectedBoundary[startIndex]!
    const end2D = projectedBoundary[endIndex]!
    let dirX = end2D.x - start2D.x
    let dirY = end2D.y - start2D.y
    let dirLength = Math.hypot(dirX, dirY)
    if (dirLength <= 1e-6) {
      dirX = 1
      dirY = 0
      dirLength = 1
    }
    dirX /= dirLength
    dirY /= dirLength

    const nextStart2D = { ...start2D }
    const nextEnd2D = { ...end2D }
    if (startLocked) {
      nextEnd2D.x = start2D.x + dirX * normalizedLength
      nextEnd2D.y = start2D.y + dirY * normalizedLength
    } else if (endLocked) {
      nextStart2D.x = end2D.x - dirX * normalizedLength
      nextStart2D.y = end2D.y - dirY * normalizedLength
    } else {
      const midX = (start2D.x + end2D.x) * 0.5
      const midY = (start2D.y + end2D.y) * 0.5
      const half = normalizedLength * 0.5
      nextStart2D.x = midX - dirX * half
      nextStart2D.y = midY - dirY * half
      nextEnd2D.x = midX + dirX * half
      nextEnd2D.y = midY + dirY * half
    }

    const chainIndices = [endIndex]
    let cursor = endIndex
    while (cursor !== startIndex) {
      cursor = (cursor + 1) % boundaryPoints.length
      chainIndices.push(cursor)
    }

    const chainPoints = chainIndices.map((index) => ({ ...projectedBoundary[index]! }))
    const chainLengths = chainIndices.slice(0, -1).map((index) => targetLengths[index]!)
    const fixedPositions = new Map<number, { x: number; y: number }>()
    chainPoints[0] = { ...nextEnd2D }
    chainPoints[chainPoints.length - 1] = { ...nextStart2D }
    fixedPositions.set(0, { ...nextEnd2D })
    fixedPositions.set(chainPoints.length - 1, { ...nextStart2D })
    chainIndices.forEach((boundaryIndex, chainIndex) => {
      if (chainIndex === 0 || chainIndex === chainPoints.length - 1) return
      const point = boundaryPoints[boundaryIndex]
      if (!point || !this.isPointCoordinateLocked(point)) return
      fixedPositions.set(chainIndex, { ...projectedBoundary[boundaryIndex]! })
    })

    for (let iteration = 0; iteration < 64; iteration += 1) {
      fixedPositions.forEach((fixed, index) => {
        chainPoints[index] = { ...fixed }
      })

      for (let i = 0; i < chainPoints.length - 1; i += 1) {
        const p1 = chainPoints[i]!
        const p2 = chainPoints[i + 1]!
        const target = chainLengths[i]!
        let dx = p2.x - p1.x
        let dy = p2.y - p1.y
        let distance = Math.hypot(dx, dy)
        if (distance <= 1e-6) {
          dx = 1
          dy = 0
          distance = 1
        }
        const ux = dx / distance
        const uy = dy / distance
        const p1Fixed = fixedPositions.has(i)
        const p2Fixed = fixedPositions.has(i + 1)

        if (p1Fixed && p2Fixed) continue
        if (p1Fixed) {
          p2.x = p1.x + ux * target
          p2.y = p1.y + uy * target
          continue
        }
        if (p2Fixed) {
          p1.x = p2.x - ux * target
          p1.y = p2.y - uy * target
          continue
        }

        const midX = (p1.x + p2.x) * 0.5
        const midY = (p1.y + p2.y) * 0.5
        const half = target * 0.5
        p1.x = midX - ux * half
        p1.y = midY - uy * half
        p2.x = midX + ux * half
        p2.y = midY + uy * half
      }
    }

    const solvedBoundary2D = projectedBoundary.map((point) => ({ ...point }))
    chainIndices.forEach((boundaryIndex, chainIndex) => {
      solvedBoundary2D[boundaryIndex] = { ...chainPoints[chainIndex]! }
    })
    solvedBoundary2D[startIndex] = { ...nextStart2D }
    solvedBoundary2D[endIndex] = { ...nextEnd2D }

    const tolerance = 1e-2
    const lengthsSatisfied = targetLengths.every((target, index) => {
      if (!Number.isFinite(target)) return true
      const current = solvedBoundary2D[index]!
      const next = solvedBoundary2D[(index + 1) % solvedBoundary2D.length]!
      return Math.abs(Math.hypot(next.x - current.x, next.y - current.y) - target) <= tolerance
    })
    if (!lengthsSatisfied) return false

    const updates: Array<{ id: string; position: Vec3 }> = []
    face.memberPointIds.forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (!point || this.isPointCoordinateLocked(point)) return

      const boundaryIndex = face.boundaryPointIds.indexOf(pointId)
      if (boundaryIndex >= 0) {
        const projected = solvedBoundary2D[boundaryIndex]!
        updates.push({
          id: pointId,
          position: toWorldPoint(plane, projected.x, projected.y),
        })
        return
      }

      const projected = projectPoint2D(projectPointToPlane(point.position, plane), plane)
      updates.push({
        id: pointId,
        position: toWorldPoint(plane, projected.x, projected.y),
      })
    })

    this.setPointsPositions(updates)
    return true
  }

  /**
   * 通过 Feature 操作描述执行作图命令。
   * 这是外部程序、脚本、插件调用作图能力的统一入口。
   */
  applyFeatureOperation(operation: FeatureOperation): HistoryEntry {
    const entry = this.featureDocument.applyOperation(operation)
    this.executeHistoryEntry(entry)
    return entry
  }

  executeCommand(cmd: Command | HistoryEntry) {
    // 如果已经是 HistoryEntry（SnapshotCommand / ConstraintAwareCommand）
    if ('redo' in cmd && typeof (cmd as HistoryEntry).redo === 'function') {
      const entry = cmd as HistoryEntry
      // SnapshotCommand 在 executeAndCapture() 中已经执行过，不需要再调用 redo()
      // ConstraintAwareCommand 尚未执行，需要先调用 redo()
      const isSnapshot = 'beforeSnapshot' in cmd
      if (!isSnapshot) {
        entry.redo()
        // ConstraintAwareCommand.redo() 只标记脏点，需要手动触发约束求解和渲染同步
        this.scene.solveDirtyConstraints()
        this.scene.markAllRenderDirty()
      }
      this.historyManager.push(entry)
      this.historyVersion++
      return
    }
    // 将旧 Command 接口适配为 HistoryEntry
    // 注意：命令在传入前已经执行过，所以 redo 应该重新执行，undo 应该撤销
    const legacyCmd = cmd as Command
    const entry: HistoryEntry = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      label: legacyCmd.constructor.name,
      timestamp: Date.now(),
      redo: () => legacyCmd.execute(),
      undo: () => legacyCmd.undo(),
    }
    this.historyManager.push(entry)
    this.historyVersion++
  }

  /**
   * 执行一个 HistoryEntry 并记录到历史栈。
   * 用于新的约束感知命令。
   */
  executeHistoryEntry(entry: HistoryEntry): void {
    this.historyManager.push(entry)
    this.historyVersion++
  }

  /**
   * 清空 undo/redo 栈。
   * 用于会话失效后重置编辑器状态，避免重登后还能"撤销"出旧内容。
   * 不会触发渲染副作用，调用方需要在合适的时机通知渲染层刷新。
   */
  clearHistory(): void {
    this.historyManager.clear()
    this.historyVersion++
    // 同步清理旧字段
    this.history = []
    this.historyIndex = -1
  }

  toggleSnapping() {
    this.isSnappingEnabled = !this.isSnappingEnabled
  }

  undo() {
    this.historyManager.undo()
    this.historyVersion++
  }

  redo() {
    this.historyManager.redo()
    this.historyVersion++
  }

  /**
   * 开始一个事务，将后续的多个操作合并为一个可撤销单元。
   */
  beginTransaction(label: string): void {
    this.historyManager.beginTransaction(label)
  }

  /**
   * 提交当前事务。
   */
  commitTransaction(): void {
    this.historyManager.commitTransaction()
    this.historyVersion++
  }

  /**
   * 回滚当前事务，撤销事务期间已执行的所有操作。
   */
  rollbackTransaction(): void {
    this.historyManager.rollbackTransaction()
    this.historyVersion++
  }

  /**
   * 开始协作事务。在协作模式下将多个 executeCommand 合并为一条共享历史记录；
   * 在非协作模式下退化为 beginTransaction。
   * 此方法会被 EditorView 覆盖以注入协作逻辑。
   */
  beginCollabTransaction(label: string): void {
    this.beginTransaction(label)
  }

  /**
   * 提交协作事务。
   * 此方法会被 EditorView 覆盖以注入协作逻辑。
   */
  commitCollabTransaction(): void {
    this.commitTransaction()
  }
}
