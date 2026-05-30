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
  }

  addStraightLine(line: StraightLine3) {
    this.straightLines.set(line.id, line)
    this.dirtyIds.straightLine.add(line.id)
  }

  addPerpendicularLine(line: PerpendicularLine3) {
    line.p2.onPositionChanged = (point) => {
      this.markPointDirty(point.id)
    }
    this.perpendicularLines.set(line.id, line)
    this.dirtyIds.perpendicularLine.add(line.id)
  }

  removePerpendicularLine(lineId: string) {
    this.removePerpendicularLineConstraint(lineId)
    const line = this.perpendicularLines.get(lineId)
    if (line) line.p2.onPositionChanged = undefined
    this.perpendicularLines.delete(lineId)
    this.selection.perpendicularLines.delete(lineId)
    this.dirtyIds.perpendicularLine.add(lineId)
  }

  addParallelLine(line: ParallelLine3) {
    line.p2.onPositionChanged = (point) => {
      this.markPointDirty(point.id)
    }
    this.parallelLines.set(line.id, line)
    this.dirtyIds.parallelLine.add(line.id)
  }

  removeParallelLine(lineId: string) {
    this.removeParallelLineConstraint(lineId)
    const line = this.parallelLines.get(lineId)
    if (line) line.p2.onPositionChanged = undefined
    this.parallelLines.delete(lineId)
    this.selection.parallelLines.delete(lineId)
    this.dirtyIds.parallelLine.add(lineId)
  }

  addRay(ray: Ray3) {
    this.rays.set(ray.id, ray)
    this.dirtyIds.ray.add(ray.id)
  }

  addVector(vector: GeoVector3) {
    this.vectors.set(vector.id, vector)
    this.dirtyIds.vector.add(vector.id)
  }

  addCircle(circle: Circle3) {
    this.circles.set(circle.id, circle)
    this.dirtyIds.circle.add(circle.id)
  }

  addSphere(sphere: Sphere3) {
    this.spheres.set(sphere.id, sphere)
    this.dirtyIds.sphere.add(sphere.id)
  }

  removeSphere(sphereId: string) {
    this.spheres.delete(sphereId)
    this.selection.spheres.delete(sphereId)
    this.dirtyIds.sphere.add(sphereId)
  }

  addCone(cone: Cone3) {
    this.cones.set(cone.id, cone)
    this.dirtyIds.cone.add(cone.id)
  }

  removeCone(coneId: string) {
    this.cones.delete(coneId)
    this.selection.cones.delete(coneId)
    this.dirtyIds.cone.add(coneId)
  }

  addCylinder(cylinder: Cylinder3) {
    this.cylinders.set(cylinder.id, cylinder)
    this.dirtyIds.cylinder.add(cylinder.id)
  }

  removeCylinder(cylinderId: string) {
    this.removeCylinderConstraint(cylinderId)
    this.cylinders.delete(cylinderId)
    this.selection.cylinders.delete(cylinderId)
    this.dirtyIds.cylinder.add(cylinderId)
  }

  addFace(face: PlanarPolygon) {
    face.normalize(this.points)
    this.faces.set(face.id, face)
    this.dirtyIds.face.add(face.id)
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
    const constraint = this.faceConstraints.get(faceId)
    if (!constraint) return
    this.constraints = this.constraints.filter((item) => item !== constraint)
    this.dirtyConstraints.delete(constraint)
    this.faceConstraints.delete(faceId)
  }

  addConstraint(c: SceneConstraint) {
    this.constraints.push(c)
    if (c.faceId) this.faceConstraints.set(c.faceId, c)
    if (c.pointId) this.intersectionConstraints.set(c.pointId, c)
    if (c.cubeId) this.cubeConstraints.set(c.cubeId, c)
    this.markConstraintDirty(c)
  }

  addIntersectionConstraint(c: SceneConstraint & { pointId: string }) {
    const existing = this.intersectionConstraints.get(c.pointId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.intersectionConstraints.set(c.pointId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  removeIntersectionConstraint(pointId: string) {
    const existing = this.intersectionConstraints.get(pointId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.intersectionConstraints.delete(pointId)
    this.dirtyConstraints.delete(existing)
    this.markPointDirty(pointId)
  }

  addCubeConstraint(c: SceneConstraint & { cubeId: string }) {
    const existing = this.cubeConstraints.get(c.cubeId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.cubeConstraints.set(c.cubeId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  removeCubeConstraint(cubeId: string) {
    const existing = this.cubeConstraints.get(cubeId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.cubeConstraints.delete(cubeId)
    this.dirtyConstraints.delete(existing)
  }

  removeCylinderConstraint(cylinderId: string) {
    const existing = this.cylinderConstraints.get(cylinderId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.cylinderConstraints.delete(cylinderId)
    this.dirtyConstraints.delete(existing)
  }

  addPerpendicularLineConstraint(c: PerpendicularLineConstraint) {
    const existing = this.perpendicularLineConstraints.get(c.perpendicularLineId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.perpendicularLineConstraints.set(c.perpendicularLineId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  removePerpendicularLineConstraint(lineId: string) {
    const existing = this.perpendicularLineConstraints.get(lineId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.perpendicularLineConstraints.delete(lineId)
    this.dirtyConstraints.delete(existing)
  }

  addParallelLineConstraint(c: ParallelLineConstraint) {
    const existing = this.parallelLineConstraints.get(c.parallelLineId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.parallelLineConstraints.set(c.parallelLineId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  removeParallelLineConstraint(lineId: string) {
    const existing = this.parallelLineConstraints.get(lineId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.parallelLineConstraints.delete(lineId)
    this.dirtyConstraints.delete(existing)
  }

  addObjectConstrainedPointConstraint(c: ObjectConstrainedPointConstraint) {
    const existing = this.objectConstrainedPointConstraints.get(c.pointId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.objectConstrainedPointConstraints.set(c.pointId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  removeObjectConstrainedPointConstraint(pointId: string) {
    const existing = this.objectConstrainedPointConstraints.get(pointId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
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
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.regularPolygonConstraints.set(c.constraintId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  addCylinderConstraint(c: CylinderConstraint) {
    const existing = this.cylinderConstraints.get(c.cylinderId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
      this.dirtyConstraints.delete(existing)
    }
    this.cylinderConstraints.set(c.cylinderId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
    this.markConstraintDirty(c)
  }

  removeRegularPolygonConstraint(constraintId: string) {
    const existing = this.regularPolygonConstraints.get(constraintId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
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
        this.markConstraintDirty(
          this.perpendicularLineConstraints.get(perpendicularLine.id)!,
        )
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
        this.markConstraintDirty(
          this.parallelLineConstraints.get(parallelLine.id)!,
        )
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

  solveDirtyConstraints(maxPasses: number = 6) {
    let passes = 0
    while (this.dirtyConstraints.size > 0 && passes < maxPasses) {
      const batch = [...this.dirtyConstraints]
      this.dirtyConstraints.clear()
      batch.forEach((constraint) => constraint.solve())
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

    pointIds.forEach((pointId) => {
      this.lines.forEach((line, lineId) => {
        if (line.p1.id === pointId || line.p2.id === pointId) lineIds.add(lineId)
      })
      this.straightLines.forEach((line, lineId) => {
        if (line.p1.id === pointId || line.p2.id === pointId) straightLineIds.add(lineId)
      })
      this.perpendicularLines.forEach((line, lineId) => {
        if (line.p1.id === pointId || line.p2.id === pointId) perpendicularLineIds.add(lineId)
      })
      this.parallelLines.forEach((line, lineId) => {
        if (line.p1.id === pointId || line.p2.id === pointId) parallelLineIds.add(lineId)
      })
      this.rays.forEach((ray, rayId) => {
        if (ray.p1.id === pointId || ray.p2.id === pointId) rayIds.add(rayId)
      })
      this.vectors.forEach((vector, vectorId) => {
        if (vector.p1.id === pointId || vector.p2.id === pointId) vectorIds.add(vectorId)
      })
      this.circles.forEach((circle, circleId) => {
        if (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId) {
          circleIds.add(circleId)
        }
      })
      this.faces.forEach((face, faceId) => {
        if (face.includesPoint(pointId)) faceIds.add(faceId)
      })
    })

    lineIds.forEach((lineId) => {
      this.circles.forEach((circle, circleId) => {
        if (circle.isNormalCircle() && circle.directionType === 'line' && circle.directionId === lineId) {
          circleIds.add(circleId)
        }
      })
    })

    straightLineIds.forEach((straightLineId) => {
      this.circles.forEach((circle, circleId) => {
        if (circle.isNormalCircle() && circle.directionType === 'straightLine' && circle.directionId === straightLineId) {
          circleIds.add(circleId)
        }
      })
    })

    rayIds.forEach((rayId) => {
      this.circles.forEach((circle, circleId) => {
        if (circle.isNormalCircle() && circle.directionType === 'ray' && circle.directionId === rayId) {
          circleIds.add(circleId)
        }
      })
    })

    vectorIds.forEach((vectorId) => {
      this.circles.forEach((circle, circleId) => {
        if (circle.isNormalCircle() && circle.directionType === 'vector' && circle.directionId === vectorId) {
          circleIds.add(circleId)
        }
      })
    })

    pointIds.forEach((pointId) => {
      this.spheres.forEach((sphere, sphereId) => {
        if (sphere.centerPoint.id === pointId || (sphere.radiusPoint && sphere.radiusPoint.id === pointId)) {
          sphereIds.add(sphereId)
        }
      })
      this.cones.forEach((cone, coneId) => {
        if (cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId) {
          coneIds.add(coneId)
        }
      })
      this.cylinders.forEach((cylinder, cylinderId) => {
        if (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId) {
          cylinderIds.add(cylinderId)
        }
      })
    })

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
      this.cylinders.forEach((cylinder, cylinderId) => {
        if (cylinder.normalCircleId === circleId || cylinder.topNormalCircleId === circleId) {
          cylinderIds.add(cylinderId)
        }
      })
      this.cones.forEach((cone, coneId) => {
        if (cone.normalCircleId === circleId) {
          coneIds.add(coneId)
        }
      })
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
    const beforeSize = this.dirtyConstraints.size
    this.dirtyConstraints.add(constraint)
    if (this.dirtyConstraints.size !== beforeSize) {
      this.solverListeners.forEach((listener) => listener())
    }
  }
}
