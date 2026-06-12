import { PlanarPolygonConstraint } from '../constraints/PlanarFaceConstraint'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { GeoVector3 } from '../geometry/GeoVector3'
import { Circle3 } from '../geometry/Circle3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarPolygon } from '../geometry/PlanarPolygon'
import { Sphere3 } from '../geometry/Sphere3'
import { Cone3 } from '../geometry/Cone3'
import { PerpendicularLine3 } from '../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../constraints/PerpendicularLineConstraint'
import { ParallelLine3 } from '../geometry/ParallelLine3'
import { ParallelLineConstraint } from '../constraints/ParallelLineConstraint'
import { Cylinder3 } from '../geometry/Cylinder3'
import { CylinderConstraint } from '../constraints/CylinderConstraint'
import { ObjectConstrainedPointConstraint } from '../constraints/ObjectConstrainedPointConstraint'
import { Vec3 } from '../geometry/Vec3'
import { Selection } from './Selection'

export type SceneConstraint = {
  solve: () => void
  faceId?: string
  pointId?: string
  cubeId?: string
  isEffective?: () => boolean
  getDependencyPointIds?: () => Iterable<string>
}

export type SceneRenderSyncState = {
  fullSync: boolean
  pointIds: Set<string>
  lineIds: Set<string>
  straightLineIds: Set<string>
  perpendicularLineIds: Set<string>
  parallelLineIds: Set<string>
  rayIds: Set<string>
  vectorIds: Set<string>
  circleIds: Set<string>
  faceIds: Set<string>
  sphereIds: Set<string>
  coneIds: Set<string>
  cylinderIds: Set<string>
}

type DirtyKind = 'point' | 'line' | 'straightLine' | 'perpendicularLine' | 'parallelLine' | 'ray' | 'vector' | 'circle' | 'face' | 'sphere' | 'cone' | 'cylinder'

export class Scene {
  static readonly ORIGIN_ID = 'origin'

  points = new Map<string, Point3>()
  lines = new Map<string, Line3>()
  straightLines = new Map<string, StraightLine3>()
  perpendicularLines = new Map<string, PerpendicularLine3>()
  parallelLines = new Map<string, ParallelLine3>()
  rays = new Map<string, Ray3>()
  vectors = new Map<string, GeoVector3>()
  circles = new Map<string, Circle3>()
  faces = new Map<string, PlanarPolygon>()
  spheres = new Map<string, Sphere3>()
  cones = new Map<string, Cone3>()
  cylinders = new Map<string, Cylinder3>()
  selection = new Selection()
  activeDraggedPointIds = new Set<string>()
  constraints: SceneConstraint[] = []
  faceConstraints = new Map<string, SceneConstraint>()
  intersectionConstraints = new Map<string, SceneConstraint>()
  cubeConstraints = new Map<string, SceneConstraint>()
  regularPolygonConstraints = new Map<string, SceneConstraint>()
  cylinderConstraints = new Map<string, CylinderConstraint>()
  objectConstrainedPointConstraints = new Map<string, ObjectConstrainedPointConstraint>()
  perpendicularLineConstraints = new Map<string, PerpendicularLineConstraint>()
  parallelLineConstraints = new Map<string, ParallelLineConstraint>()

  private _pointRefIndex: Map<string, { lines: Set<string>; straightLines: Set<string>; perpendicularLines: Set<string>; parallelLines: Set<string>; rays: Set<string>; vectors: Set<string>; circles: Set<string>; faces: Set<string>; spheres: Set<string>; cones: Set<string>; cylinders: Set<string> }> | null = null
  private _lineRefIndex: Map<string, Set<string>> | null = null
  private _circleRefIndex: Map<string, { cones: Set<string>; cylinders: Set<string> }> | null = null

  private getPointRefIndex() {
    if (this._pointRefIndex) return this._pointRefIndex
    const idx = new Map<string, { lines: Set<string>; straightLines: Set<string>; perpendicularLines: Set<string>; parallelLines: Set<string>; rays: Set<string>; vectors: Set<string>; circles: Set<string>; faces: Set<string>; spheres: Set<string>; cones: Set<string>; cylinders: Set<string> }>()
    for (const [id, line] of this.lines) {
      this._addPointRefEntry(idx, line.p1.id, 'lines', id)
      this._addPointRefEntry(idx, line.p2.id, 'lines', id)
    }
    for (const [id, line] of this.straightLines) {
      this._addPointRefEntry(idx, line.p1.id, 'straightLines', id)
      this._addPointRefEntry(idx, line.p2.id, 'straightLines', id)
    }
    for (const [id, line] of this.perpendicularLines) {
      this._addPointRefEntry(idx, line.p1.id, 'perpendicularLines', id)
      this._addPointRefEntry(idx, line.p2.id, 'perpendicularLines', id)
    }
    for (const [id, line] of this.parallelLines) {
      this._addPointRefEntry(idx, line.p1.id, 'parallelLines', id)
      this._addPointRefEntry(idx, line.p2.id, 'parallelLines', id)
    }
    for (const [id, ray] of this.rays) {
      this._addPointRefEntry(idx, ray.p1.id, 'rays', id)
      this._addPointRefEntry(idx, ray.p2.id, 'rays', id)
    }
    for (const [id, v] of this.vectors) {
      this._addPointRefEntry(idx, v.p1.id, 'vectors', id)
      this._addPointRefEntry(idx, v.p2.id, 'vectors', id)
    }
    for (const [id, c] of this.circles) {
      this._addPointRefEntry(idx, c.p1.id, 'circles', id)
      this._addPointRefEntry(idx, c.p2.id, 'circles', id)
      this._addPointRefEntry(idx, c.p3.id, 'circles', id)
    }
    for (const [id, face] of this.faces) {
      for (const pid of face.memberPointIds) {
        this._addPointRefEntry(idx, pid, 'faces', id)
      }
    }
    for (const [id, s] of this.spheres) {
      this._addPointRefEntry(idx, s.centerPoint.id, 'spheres', id)
      if (s.radiusPoint) this._addPointRefEntry(idx, s.radiusPoint.id, 'spheres', id)
    }
    for (const [id, c] of this.cones) {
      this._addPointRefEntry(idx, c.baseCenterPoint.id, 'cones', id)
      this._addPointRefEntry(idx, c.apexPoint.id, 'cones', id)
    }
    for (const [id, c] of this.cylinders) {
      this._addPointRefEntry(idx, c.bottomCenterPoint.id, 'cylinders', id)
      this._addPointRefEntry(idx, c.topCenterPoint.id, 'cylinders', id)
    }
    this._pointRefIndex = idx
    return idx
  }

  private _addPointRefEntry(
    idx: Map<string, { lines: Set<string>; straightLines: Set<string>; perpendicularLines: Set<string>; parallelLines: Set<string>; rays: Set<string>; vectors: Set<string>; circles: Set<string>; faces: Set<string>; spheres: Set<string>; cones: Set<string>; cylinders: Set<string> }>,
    pointId: string,
    kind: 'lines' | 'straightLines' | 'perpendicularLines' | 'parallelLines' | 'rays' | 'vectors' | 'circles' | 'faces' | 'spheres' | 'cones' | 'cylinders',
    geoId: string,
  ) {
    let entry = idx.get(pointId)
    if (!entry) {
      entry = { lines: new Set(), straightLines: new Set(), perpendicularLines: new Set(), parallelLines: new Set(), rays: new Set(), vectors: new Set(), circles: new Set(), faces: new Set(), spheres: new Set(), cones: new Set(), cylinders: new Set() }
      idx.set(pointId, entry)
    }
    entry[kind].add(geoId)
  }

  invalidateRenderSyncCache() {
    this._pointRefIndex = null
    this._lineRefIndex = null
    this._circleRefIndex = null
    this._circleToConesIndex = null
    this._circleToCylindersIndex = null
  }

  private getLineRefIndex() {
    if (this._lineRefIndex) return this._lineRefIndex
    const idx = new Map<string, Set<string>>()
    for (const [id, c] of this.circles) {
      if (c.isNormalCircle() && c.directionType && c.directionId) {
        let set = idx.get(c.directionId)
        if (!set) { set = new Set(); idx.set(c.directionId, set) }
        set.add(id)
      }
    }
    this._lineRefIndex = idx
    return idx
  }

  private getCircleRefIndex() {
    if (this._circleRefIndex) return this._circleRefIndex
    const idx = new Map<string, { cones: Set<string>; cylinders: Set<string> }>()
    for (const [id, c] of this.cones) {
      if (c.normalCircleId) {
        let entry = idx.get(c.normalCircleId)
        if (!entry) { entry = { cones: new Set(), cylinders: new Set() }; idx.set(c.normalCircleId, entry) }
        entry.cones.add(id)
      }
    }
    for (const [id, c] of this.cylinders) {
      if (c.normalCircleId) {
        let entry = idx.get(c.normalCircleId)
        if (!entry) { entry = { cones: new Set(), cylinders: new Set() }; idx.set(c.normalCircleId, entry) }
        entry.cylinders.add(id)
      }
      if (c.topNormalCircleId) {
        let entry = idx.get(c.topNormalCircleId)
        if (!entry) { entry = { cones: new Set(), cylinders: new Set() }; idx.set(c.topNormalCircleId, entry) }
        entry.cylinders.add(id)
      }
    }
    this._circleRefIndex = idx
    return idx
  }

  private _circleToConesIndex: Map<string, string[]> | null = null
  private _circleToCylindersIndex: Map<string, string[]> | null = null

  getConesForCircle(circleId: string): string[] {
    if (!this._circleToConesIndex) {
      const idx = new Map<string, string[]>()
      for (const [id, c] of this.cones) {
        if (c.normalCircleId) {
          let arr = idx.get(c.normalCircleId)
          if (!arr) { arr = []; idx.set(c.normalCircleId, arr) }
          arr.push(id)
        }
      }
      this._circleToConesIndex = idx
    }
    return this._circleToConesIndex.get(circleId) ?? []
  }

  getCylindersForCircle(circleId: string): string[] {
    if (!this._circleToCylindersIndex) {
      const idx = new Map<string, string[]>()
      for (const [id, c] of this.cylinders) {
        if (c.normalCircleId) {
          let arr = idx.get(c.normalCircleId)
          if (!arr) { arr = []; idx.set(c.normalCircleId, arr) }
          arr.push(id)
        }
        if (c.topNormalCircleId) {
          let arr = idx.get(c.topNormalCircleId)
          if (!arr) { arr = []; idx.set(c.topNormalCircleId, arr) }
          arr.push(id)
        }
      }
      this._circleToCylindersIndex = idx
    }
    return this._circleToCylindersIndex.get(circleId) ?? []
  }

  private dirtyConstraints = new Set<SceneConstraint>()
  private dirtyIds: Record<DirtyKind, Set<string>> = {
    point: new Set(),
    line: new Set(),
    straightLine: new Set(),
    perpendicularLine: new Set(),
    parallelLine: new Set(),
    ray: new Set(),
    vector: new Set(),
    circle: new Set(),
    face: new Set(),
    sphere: new Set(),
    cone: new Set(),
    cylinder: new Set(),
  }
  private fullRenderSyncPending = true
  private solverListeners = new Set<() => void>()

  /** 快照恢复期间抑制约束脏标记，避免中间状态触发无效求解 */
  private suppressConstraintDirty = false

  constructor() {
    const origin = new Point3(Scene.ORIGIN_ID, 'O', new Vec3(0, 0, 0), true, true)
    this.addPoint(origin)
  }

  addPoint(p: Point3) {
    p.onPositionChanged = (point) => {
      this.markPointDirty(point.id)
    }
    this.points.set(p.id, p)
    this.markPointDirty(p.id)
  }

  addLine(l: Line3) {
    this.lines.set(l.id, l)
    this.dirtyIds.line.add(l.id)
    this.invalidateRenderSyncCache()
  }

  addStraightLine(line: StraightLine3) {
    this.straightLines.set(line.id, line)
    this.dirtyIds.straightLine.add(line.id)
    this.invalidateRenderSyncCache()
  }

  addPerpendicularLine(line: PerpendicularLine3) {
    line.p2.onPositionChanged = (point) => {
      this.markPointDirty(point.id)
    }
    this.perpendicularLines.set(line.id, line)
    this.dirtyIds.perpendicularLine.add(line.id)
    this.invalidateRenderSyncCache()
  }

  removePerpendicularLine(lineId: string) {
    this.removePerpendicularLineConstraint(lineId)
    const line = this.perpendicularLines.get(lineId)
    if (line) line.p2.onPositionChanged = null
    this.perpendicularLines.delete(lineId)
    this.selection.perpendicularLines.delete(lineId)
    this.dirtyIds.perpendicularLine.add(lineId)
    this.invalidateRenderSyncCache()
  }

  addParallelLine(line: ParallelLine3) {
    line.p2.onPositionChanged = (point) => {
      this.markPointDirty(point.id)
    }
    this.parallelLines.set(line.id, line)
    this.dirtyIds.parallelLine.add(line.id)
    this.invalidateRenderSyncCache()
  }

  removeParallelLine(lineId: string) {
    this.removeParallelLineConstraint(lineId)
    const line = this.parallelLines.get(lineId)
    if (line) line.p2.onPositionChanged = null
    this.parallelLines.delete(lineId)
    this.selection.parallelLines.delete(lineId)
    this.dirtyIds.parallelLine.add(lineId)
    this.invalidateRenderSyncCache()
  }

  addRay(ray: Ray3) {
    this.rays.set(ray.id, ray)
    this.dirtyIds.ray.add(ray.id)
    this.invalidateRenderSyncCache()
  }

  addVector(vector: GeoVector3) {
    this.vectors.set(vector.id, vector)
    this.dirtyIds.vector.add(vector.id)
    this.invalidateRenderSyncCache()
  }

  addCircle(circle: Circle3) {
    this.circles.set(circle.id, circle)
    this.dirtyIds.circle.add(circle.id)
    this.invalidateRenderSyncCache()
  }

  addSphere(sphere: Sphere3) {
    this.spheres.set(sphere.id, sphere)
    this.dirtyIds.sphere.add(sphere.id)
    this.invalidateRenderSyncCache()
  }

  removeSphere(sphereId: string) {
    this.spheres.delete(sphereId)
    this.selection.spheres.delete(sphereId)
    this.dirtyIds.sphere.add(sphereId)
    this.invalidateRenderSyncCache()
  }

  addCone(cone: Cone3) {
    this.cones.set(cone.id, cone)
    this.dirtyIds.cone.add(cone.id)
    this.invalidateRenderSyncCache()
  }

  removeCone(coneId: string) {
    this.cones.delete(coneId)
    this.selection.cones.delete(coneId)
    this.dirtyIds.cone.add(coneId)
    this.invalidateRenderSyncCache()
  }

  addCylinder(cylinder: Cylinder3) {
    this.cylinders.set(cylinder.id, cylinder)
    this.dirtyIds.cylinder.add(cylinder.id)
    this.invalidateRenderSyncCache()
  }

  removeCylinder(cylinderId: string) {
    this.removeCylinderConstraint(cylinderId)
    this.cylinders.delete(cylinderId)
    this.selection.cylinders.delete(cylinderId)
    this.dirtyIds.cylinder.add(cylinderId)
    this.invalidateRenderSyncCache()
  }

  addFace(face: PlanarPolygon) {
    face.normalize(this.points)
    this.faces.set(face.id, face)
    this.dirtyIds.face.add(face.id)
    this.invalidateRenderSyncCache()
    const existing = this.faceConstraints.get(face.id)
    if (existing) {
      if (!this.constraints.includes(existing)) this.constraints.push(existing)
      this.markConstraintDirty(existing)
      return
    }
    const constraint = new PlanarPolygonConstraint(this, face.id)
    this.faceConstraints.set(face.id, constraint)
    this.constraints.push(constraint)
    this.markConstraintDirty(constraint)
  }

  removeFace(faceId: string) {
    this.faces.delete(faceId)
    this.selection.faces.delete(faceId)
    this.dirtyIds.face.add(faceId)
    this.invalidateRenderSyncCache()
    const constraint = this.faceConstraints.get(faceId)
    if (!constraint) return
    const idx = this.constraints.indexOf(constraint)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.dirtyConstraints.delete(constraint)
    this.faceConstraints.delete(faceId)
  }

  addConstraint(c: SceneConstraint) {
    if (c.faceId && this.faceConstraints.has(c.faceId)) {
      const existing = this.faceConstraints.get(c.faceId)!
      const existingIndex = this.constraints.indexOf(existing)
      if (existingIndex >= 0) this.constraints.splice(existingIndex, 1)
      this.dirtyConstraints.delete(existing)
    }
    if (c.pointId && this.intersectionConstraints.has(c.pointId)) {
      const existing = this.intersectionConstraints.get(c.pointId)!
      const existingIndex = this.constraints.indexOf(existing)
      if (existingIndex >= 0) this.constraints.splice(existingIndex, 1)
      this.dirtyConstraints.delete(existing)
    }
    if (c.cubeId && this.cubeConstraints.has(c.cubeId)) {
      const existing = this.cubeConstraints.get(c.cubeId)!
      const existingIndex = this.constraints.indexOf(existing)
      if (existingIndex >= 0) this.constraints.splice(existingIndex, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.constraints.push(c)
    if (c.faceId) this.faceConstraints.set(c.faceId, c)
    if (c.pointId) this.intersectionConstraints.set(c.pointId, c)
    if (c.cubeId) this.cubeConstraints.set(c.cubeId, c)
    this.markConstraintDirty(c)
  }

  addIntersectionConstraint(c: SceneConstraint & { pointId: string }) {
    const existing = this.intersectionConstraints.get(c.pointId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.intersectionConstraints.set(c.pointId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  removeIntersectionConstraint(pointId: string) {
    const existing = this.intersectionConstraints.get(pointId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.intersectionConstraints.delete(pointId)
    this.dirtyConstraints.delete(existing)
    this.markPointDirty(pointId)
  }

  addCubeConstraint(c: SceneConstraint & { cubeId: string }) {
    const existing = this.cubeConstraints.get(c.cubeId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.cubeConstraints.set(c.cubeId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  removeCubeConstraint(cubeId: string) {
    const existing = this.cubeConstraints.get(cubeId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.cubeConstraints.delete(cubeId)
    this.dirtyConstraints.delete(existing)
  }

  removeCylinderConstraint(cylinderId: string) {
    const existing = this.cylinderConstraints.get(cylinderId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.cylinderConstraints.delete(cylinderId)
    this.dirtyConstraints.delete(existing)
  }

  addPerpendicularLineConstraint(c: PerpendicularLineConstraint) {
    const existing = this.perpendicularLineConstraints.get(c.perpendicularLineId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.perpendicularLineConstraints.set(c.perpendicularLineId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  removePerpendicularLineConstraint(lineId: string) {
    const existing = this.perpendicularLineConstraints.get(lineId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.perpendicularLineConstraints.delete(lineId)
    this.dirtyConstraints.delete(existing)
  }

  addParallelLineConstraint(c: ParallelLineConstraint) {
    const existing = this.parallelLineConstraints.get(c.parallelLineId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.parallelLineConstraints.set(c.parallelLineId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  removeParallelLineConstraint(lineId: string) {
    const existing = this.parallelLineConstraints.get(lineId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.parallelLineConstraints.delete(lineId)
    this.dirtyConstraints.delete(existing)
  }

  addObjectConstrainedPointConstraint(c: ObjectConstrainedPointConstraint) {
    const existing = this.objectConstrainedPointConstraints.get(c.pointId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.objectConstrainedPointConstraints.set(c.pointId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  removeObjectConstrainedPointConstraint(pointId: string) {
    const existing = this.objectConstrainedPointConstraints.get(pointId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.objectConstrainedPointConstraints.delete(pointId)
    this.dirtyConstraints.delete(existing)
    this.markPointDirty(pointId)
  }

  getObjectConstrainedPointConstraint(pointId: string): ObjectConstrainedPointConstraint | null {
    return this.objectConstrainedPointConstraints.get(pointId) ?? null
  }

  addRegularPolygonConstraint(c: SceneConstraint & { constraintId: string }) {
    const existing = this.regularPolygonConstraints.get(c.constraintId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.regularPolygonConstraints.set(c.constraintId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  addCylinderConstraint(c: CylinderConstraint) {
    const existing = this.cylinderConstraints.get(c.cylinderId)
    if (existing) {
      const idx = this.constraints.indexOf(existing)
      if (idx >= 0) this.constraints.splice(idx, 1)
      this.dirtyConstraints.delete(existing)
    }
    this.cylinderConstraints.set(c.cylinderId, c)
    this.constraints.push(c)
    this.markConstraintDirty(c)
  }

  removeRegularPolygonConstraint(constraintId: string) {
    const existing = this.regularPolygonConstraints.get(constraintId)
    if (!existing) return
    const idx = this.constraints.indexOf(existing)
    if (idx >= 0) this.constraints.splice(idx, 1)
    this.regularPolygonConstraints.delete(constraintId)
    this.dirtyConstraints.delete(existing)
  }

  getRegularPolygonConstraint(constraintId: string) {
    const constraint = this.regularPolygonConstraints.get(constraintId)
    if (!constraint) return null
    return constraint
  }

  requestRegularPolygonConstraintSolve(constraintId: string) {
    this.requestConstraintSolve(this.regularPolygonConstraints.get(constraintId))
  }

  getCubeConstraint(cubeId: string) {
    const constraint = this.cubeConstraints.get(cubeId)
    if (!constraint || !constraint.cubeId) return null
    return constraint
  }

  getIntersectionConstraint(pointId: string) {
    const constraint = this.intersectionConstraints.get(pointId)
    if (!constraint || !constraint.pointId) return null
    return constraint
  }

  requestConstraintSolve(constraint: SceneConstraint | null | undefined) {
    if (!constraint) return
    this.markConstraintDirty(constraint)
  }

  requestFaceConstraintSolve(faceId: string) {
    this.requestConstraintSolve(this.faceConstraints.get(faceId))
  }

  requestIntersectionConstraintSolve(pointId: string) {
    this.requestConstraintSolve(this.intersectionConstraints.get(pointId))
  }

  requestCubeConstraintSolve(cubeId: string) {
    this.requestConstraintSolve(this.cubeConstraints.get(cubeId))
  }

  clearAllConstraints() {
    this.constraints = []
    this.faceConstraints.clear()
    this.intersectionConstraints.clear()
    this.cubeConstraints.clear()
    this.regularPolygonConstraints.clear()
    this.cylinderConstraints.clear()
    this.objectConstrainedPointConstraints.clear()
    this.perpendicularLineConstraints.clear()
    this.parallelLineConstraints.clear()
    this.dirtyConstraints.clear()
  }

  clearDirtyConstraints() {
    this.dirtyConstraints.clear()
  }

  rebuildConstraintIndexes() {
    this.faceConstraints.clear()
    this.intersectionConstraints.clear()
    this.cubeConstraints.clear()
    this.regularPolygonConstraints.clear()
    this.cylinderConstraints.clear()
    this.objectConstrainedPointConstraints.clear()
    this.perpendicularLineConstraints.clear()
    this.parallelLineConstraints.clear()
    this.constraints.forEach((constraint) => {
      if (constraint.faceId) this.faceConstraints.set(constraint.faceId, constraint)
      if (constraint.pointId) this.intersectionConstraints.set(constraint.pointId, constraint)
      if (constraint.cubeId) this.cubeConstraints.set(constraint.cubeId, constraint)
      if ('constraintId' in constraint && typeof (constraint as { constraintId: string }).constraintId === 'string') {
        this.regularPolygonConstraints.set((constraint as { constraintId: string }).constraintId, constraint)
      }
      if (constraint instanceof CylinderConstraint) {
        this.cylinderConstraints.set((constraint as CylinderConstraint).cylinderId, constraint as CylinderConstraint)
      }
      if (constraint instanceof ObjectConstrainedPointConstraint) {
        this.objectConstrainedPointConstraints.set((constraint as ObjectConstrainedPointConstraint).pointId, constraint as ObjectConstrainedPointConstraint)
      }
      if (constraint instanceof PerpendicularLineConstraint) {
        this.perpendicularLineConstraints.set((constraint as PerpendicularLineConstraint).perpendicularLineId, constraint as PerpendicularLineConstraint)
      }
      if (constraint instanceof ParallelLineConstraint) {
        this.parallelLineConstraints.set((constraint as ParallelLineConstraint).parallelLineId, constraint as ParallelLineConstraint)
      }
      this.markConstraintDirty(constraint)
    })
  }

  onSolverWork(listener: () => void) {
    this.solverListeners.add(listener)
    return () => {
      this.solverListeners.delete(listener)
    }
  }

  markPointDirty(pointId: string) {
    this.dirtyIds.point.add(pointId)
    this.circles.forEach((circle) => {
      if (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId) {
        this.dirtyIds.circle.add(circle.id)
        const centerPoint = [...this.points.values()].find(
          (p) => p.circleId === circle.id && p.circleRole === 'center',
        )
        if (centerPoint) this.dirtyIds.point.add(centerPoint.id)
      }
    })
    this.spheres.forEach((sphere) => {
      if (sphere.centerPoint.id === pointId || (sphere.radiusPoint && sphere.radiusPoint.id === pointId)) {
        this.dirtyIds.sphere.add(sphere.id)
      }
    })
    this.cones.forEach((cone) => {
      if (cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId) {
        this.dirtyIds.cone.add(cone.id)
      }
    })
    this.cylinders.forEach((cylinder) => {
      if (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId) {
        this.dirtyIds.cylinder.add(cylinder.id)
      }
    })
    this.cylinderConstraints.forEach((constraint, cylinderId) => {
      const cylinder = this.cylinders.get(cylinderId)
      if (cylinder && (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId)) {
        this.markConstraintDirty(constraint)
      }
    })
    this.cylinders.forEach((cylinder) => {
      if (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId) {
        if (cylinder.normalCircleId) {
          this.dirtyIds.circle.add(cylinder.normalCircleId)
        }
        if (cylinder.topNormalCircleId) {
          this.dirtyIds.circle.add(cylinder.topNormalCircleId)
        }
      }
    })
    this.perpendicularLines.forEach((perpendicularLine) => {
      if (perpendicularLine.p1.id === pointId) {
        this.dirtyIds.perpendicularLine.add(perpendicularLine.id)
        const constraint = this.perpendicularLineConstraints.get(perpendicularLine.id)
        if (constraint) this.markConstraintDirty(constraint)
      }
    })
    this.perpendicularLineConstraints.forEach((constraint) => {
      let found = false
      if (constraint.target.type === 'line') {
        const line = this.lines.get(constraint.target.id)
        if (line && (line.p1.id === pointId || line.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'straightLine') {
        const sl = this.straightLines.get(constraint.target.id)
        if (sl && (sl.p1.id === pointId || sl.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'ray') {
        const ray = this.rays.get(constraint.target.id)
        if (ray && (ray.p1.id === pointId || ray.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'vector') {
        const vec = this.vectors.get(constraint.target.id)
        if (vec && (vec.p1.id === pointId || vec.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'perpendicularLine') {
        const pl = this.perpendicularLines.get(constraint.target.id)
        if (pl && (pl.p1.id === pointId || pl.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'parallelLine') {
        const pll = this.parallelLines.get(constraint.target.id)
        if (pll && (pll.p1.id === pointId || pll.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'face') {
        const face = this.faces.get(constraint.target.id)
        if (face && face.memberPointIds.includes(pointId)) found = true
      } else if (constraint.target.type === 'coneBase') {
        const cone = this.cones.get(constraint.target.id)
        if (cone && (cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId)) found = true
      } else if (constraint.target.type === 'cylinderBottom' || constraint.target.type === 'cylinderTop') {
        const cylinder = this.cylinders.get(constraint.target.id)
        if (cylinder && (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId)) found = true
      }
      if (found) {
        this.dirtyIds.perpendicularLine.add(constraint.perpendicularLineId)
        this.markConstraintDirty(constraint)
      }
    })
    this.parallelLines.forEach((parallelLine) => {
      if (parallelLine.p1.id === pointId) {
        this.dirtyIds.parallelLine.add(parallelLine.id)
        const constraint = this.parallelLineConstraints.get(parallelLine.id)
        if (constraint) this.markConstraintDirty(constraint)
      }
    })
    this.parallelLineConstraints.forEach((constraint) => {
      let found = false
      if (constraint.target.type === 'line') {
        const line = this.lines.get(constraint.target.id)
        if (line && (line.p1.id === pointId || line.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'straightLine') {
        const sl = this.straightLines.get(constraint.target.id)
        if (sl && (sl.p1.id === pointId || sl.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'ray') {
        const ray = this.rays.get(constraint.target.id)
        if (ray && (ray.p1.id === pointId || ray.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'vector') {
        const vec = this.vectors.get(constraint.target.id)
        if (vec && (vec.p1.id === pointId || vec.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'perpendicularLine') {
        const pl = this.perpendicularLines.get(constraint.target.id)
        if (pl && (pl.p1.id === pointId || pl.p2.id === pointId)) found = true
      } else if (constraint.target.type === 'parallelLine') {
        const pll = this.parallelLines.get(constraint.target.id)
        if (pll && (pll.p1.id === pointId || pll.p2.id === pointId)) found = true
      }
      if (found) {
        this.dirtyIds.parallelLine.add(constraint.parallelLineId)
        this.markConstraintDirty(constraint)
      }
    })
    this.constraints.forEach((constraint) => {
      if (constraint.pointId === pointId) {
        this.markConstraintDirty(constraint)
        return
      }
      const dependencyIds = constraint.getDependencyPointIds?.()
      if (!dependencyIds) return
      for (const dependencyId of dependencyIds) {
        if (dependencyId === pointId) {
          this.markConstraintDirty(constraint)
          return
        }
      }
    })
  }

  markAllRenderDirty() {
    this.fullRenderSyncPending = true
  }

  hasPendingConstraintWork() {
    return this.dirtyConstraints.size > 0
  }

  solveDirtyConstraints(maxPasses: number = 10) {
    let passes = 0
    while (this.dirtyConstraints.size > 0 && passes < maxPasses) {
      const batch = [...this.dirtyConstraints]
      this.dirtyConstraints.clear()
      batch.forEach((constraint) => {
        if (!constraint) return
        try {
          if (constraint.isEffective && !constraint.isEffective()) return
          constraint.solve()
        } catch (e) {
          console.warn('[solveDirtyConstraints] constraint solve failed:', e)
        }
      })
      passes += 1
    }
    return passes
  }

  consumeRenderSyncState(): SceneRenderSyncState | null {
    const fullSync = this.fullRenderSyncPending
    if (fullSync) {
      this.fullRenderSyncPending = false
      this.clearAllDirtyIds()
      return {
        fullSync: true,
        pointIds: new Set(this.points.keys()),
        lineIds: new Set(this.lines.keys()),
        straightLineIds: new Set(this.straightLines.keys()),
        perpendicularLineIds: new Set(this.perpendicularLines.keys()),
        parallelLineIds: new Set(this.parallelLines.keys()),
        rayIds: new Set(this.rays.keys()),
        vectorIds: new Set(this.vectors.keys()),
        circleIds: new Set(this.circles.keys()),
        faceIds: new Set(this.faces.keys()),
        sphereIds: new Set(this.spheres.keys()),
        coneIds: new Set(this.cones.keys()),
        cylinderIds: new Set(this.cylinders.keys()),
      }
    }

    const pointIds = new Set(this.dirtyIds.point)
    const lineIds = new Set(this.dirtyIds.line)
    const straightLineIds = new Set(this.dirtyIds.straightLine)
    const perpendicularLineIds = new Set(this.dirtyIds.perpendicularLine)
    const parallelLineIds = new Set(this.dirtyIds.parallelLine)
    const rayIds = new Set(this.dirtyIds.ray)
    const vectorIds = new Set(this.dirtyIds.vector)
    const circleIds = new Set(this.dirtyIds.circle)
    const faceIds = new Set(this.dirtyIds.face)
    const sphereIds = new Set(this.dirtyIds.sphere)
    const coneIds = new Set(this.dirtyIds.cone)
    const cylinderIds = new Set(this.dirtyIds.cylinder)

    const pointRefIndex = this.getPointRefIndex()
    const lineRefIndex = this.getLineRefIndex()
    const circleRefIndex = this.getCircleRefIndex()

    pointIds.forEach((pointId) => {
      const refs = pointRefIndex.get(pointId)
      if (!refs) return
      refs.lines.forEach((id) => lineIds.add(id))
      refs.straightLines.forEach((id) => straightLineIds.add(id))
      refs.perpendicularLines.forEach((id) => perpendicularLineIds.add(id))
      refs.parallelLines.forEach((id) => parallelLineIds.add(id))
      refs.rays.forEach((id) => rayIds.add(id))
      refs.vectors.forEach((id) => vectorIds.add(id))
      refs.circles.forEach((id) => circleIds.add(id))
      refs.faces.forEach((id) => faceIds.add(id))
      refs.spheres.forEach((id) => sphereIds.add(id))
      refs.cones.forEach((id) => coneIds.add(id))
      refs.cylinders.forEach((id) => cylinderIds.add(id))
    })

    const propagateLineTypeToCircles = (kind: 'line' | 'straightLine' | 'ray' | 'vector', ids: Set<string>) => {
      ids.forEach((geoId) => {
        const circles = lineRefIndex.get(geoId)
        if (circles) circles.forEach((id) => circleIds.add(id))
      })
    }
    propagateLineTypeToCircles('line', lineIds)
    propagateLineTypeToCircles('straightLine', straightLineIds)
    propagateLineTypeToCircles('ray', rayIds)
    propagateLineTypeToCircles('vector', vectorIds)

    this.clearAllDirtyIds()

    coneIds.forEach((coneId) => {
      const cone = this.cones.get(coneId)
      if (cone?.normalCircleId) {
        circleIds.add(cone.normalCircleId)
      }
    })

    cylinderIds.forEach((cylinderId) => {
      const cylinder = this.cylinders.get(cylinderId)
      if (cylinder?.normalCircleId) {
        circleIds.add(cylinder.normalCircleId)
      }
      if (cylinder?.topNormalCircleId) {
        circleIds.add(cylinder.topNormalCircleId)
      }
    })

    circleIds.forEach((circleId) => {
      const refs = circleRefIndex.get(circleId)
      if (!refs) return
      refs.cones.forEach((id) => coneIds.add(id))
      refs.cylinders.forEach((id) => cylinderIds.add(id))
    })

    if ([pointIds, lineIds, straightLineIds, perpendicularLineIds, parallelLineIds, rayIds, vectorIds, circleIds, faceIds, sphereIds, coneIds, cylinderIds].every((s) => s.size === 0)) {
      return null
    }

    return {
      fullSync: false,
      pointIds,
      lineIds,
      straightLineIds,
      perpendicularLineIds,
      parallelLineIds,
      rayIds,
      vectorIds,
      circleIds,
      faceIds,
      sphereIds,
      coneIds,
      cylinderIds,
    }
  }

  private clearAllDirtyIds() {
    for (const set of Object.values(this.dirtyIds)) set.clear()
  }

  private markConstraintDirty(constraint: SceneConstraint) {
    if (this.suppressConstraintDirty) return
    const beforeSize = this.dirtyConstraints.size
    this.dirtyConstraints.add(constraint)
    if (this.dirtyConstraints.size !== beforeSize) {
      this.solverListeners.forEach((listener) => listener())
    }
  }

  /**
   * 在快照恢复期间抑制约束脏标记。
   * 调用 beginSnapshotRestore 后，所有 markConstraintDirty 调用会被跳过，
   * 直到调用 endSnapshotRestore。
   */
  beginSnapshotRestore() {
    this.suppressConstraintDirty = true
  }

  /**
   * 结束快照恢复，重新启用约束脏标记，并标记所有约束为脏。
   */
  endSnapshotRestore() {
    this.suppressConstraintDirty = false
    this.constraints.forEach((c) => this.dirtyConstraints.add(c))
  }
}
