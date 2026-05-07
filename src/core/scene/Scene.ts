import { PlanarFaceConstraint } from '../constraints/PlanarFaceConstraint'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { GeoVector3 } from '../geometry/GeoVector3'
import { Circle3 } from '../geometry/Circle3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarFace } from '../geometry/Plane'
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
  rayIds: Set<string>
  vectorIds: Set<string>
  circleIds: Set<string>
  faceIds: Set<string>
}

export class Scene {
  static readonly ORIGIN_ID = 'origin'

  points = new Map<string, Point3>()
  lines = new Map<string, Line3>()
  straightLines = new Map<string, StraightLine3>()
  rays = new Map<string, Ray3>()
  vectors = new Map<string, GeoVector3>()
  circles = new Map<string, Circle3>()
  faces = new Map<string, PlanarFace>()
  selection = new Selection()
  activeDraggedPointIds = new Set<string>()
  constraints: SceneConstraint[] = []
  faceConstraints = new Map<string, SceneConstraint>()
  intersectionConstraints = new Map<string, SceneConstraint>()
  cubeConstraints = new Map<string, SceneConstraint>()

  private dirtyConstraints = new Set<SceneConstraint>()
  private dirtyPointIds = new Set<string>()
  private dirtyLineIds = new Set<string>()
  private dirtyStraightLineIds = new Set<string>()
  private dirtyRayIds = new Set<string>()
  private dirtyVectorIds = new Set<string>()
  private dirtyCircleIds = new Set<string>()
  private dirtyFaceIds = new Set<string>()
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
    this.dirtyLineIds.add(l.id)
  }

  addStraightLine(line: StraightLine3) {
    this.straightLines.set(line.id, line)
    this.dirtyStraightLineIds.add(line.id)
  }

  addRay(ray: Ray3) {
    this.rays.set(ray.id, ray)
    this.dirtyRayIds.add(ray.id)
  }

  addVector(vector: GeoVector3) {
    this.vectors.set(vector.id, vector)
    this.dirtyVectorIds.add(vector.id)
  }

  addCircle(circle: Circle3) {
    this.circles.set(circle.id, circle)
    this.dirtyCircleIds.add(circle.id)
  }

  addFace(face: PlanarFace) {
    face.normalize(this.points)
    this.faces.set(face.id, face)
    this.dirtyFaceIds.add(face.id)
    const existing = this.faceConstraints.get(face.id)
    if (existing) {
      if (!this.constraints.includes(existing)) this.constraints.push(existing)
      this.markConstraintDirty(existing)
      return
    }
    const constraint = new PlanarFaceConstraint(this, face.id)
    this.faceConstraints.set(face.id, constraint)
    this.constraints.push(constraint)
    this.markConstraintDirty(constraint)
  }

  removeFace(faceId: string) {
    this.faces.delete(faceId)
    this.selection.faces.delete(faceId)
    this.dirtyFaceIds.add(faceId)
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
    this.dirtyConstraints.clear()
  }

  rebuildConstraintIndexes() {
    this.faceConstraints.clear()
    this.intersectionConstraints.clear()
    this.cubeConstraints.clear()
    this.constraints.forEach((constraint) => {
      if (constraint.faceId) this.faceConstraints.set(constraint.faceId, constraint)
      if (constraint.pointId) this.intersectionConstraints.set(constraint.pointId, constraint)
      if (constraint.cubeId) this.cubeConstraints.set(constraint.cubeId, constraint)
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
    this.dirtyPointIds.add(pointId)
    this.circles.forEach((circle) => {
      if (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId) {
        this.dirtyCircleIds.add(circle.id)
        const centerPoint = [...this.points.values()].find(
          (p) => p.circleId === circle.id && p.circleRole === 'center',
        )
        if (centerPoint) this.dirtyPointIds.add(centerPoint.id)
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
      this.dirtyPointIds.clear()
      this.dirtyLineIds.clear()
      this.dirtyStraightLineIds.clear()
      this.dirtyRayIds.clear()
      this.dirtyVectorIds.clear()
      this.dirtyCircleIds.clear()
      this.dirtyFaceIds.clear()
      return {
        fullSync: true,
        pointIds: new Set(this.points.keys()),
        lineIds: new Set(this.lines.keys()),
        straightLineIds: new Set(this.straightLines.keys()),
        rayIds: new Set(this.rays.keys()),
        vectorIds: new Set(this.vectors.keys()),
        circleIds: new Set(this.circles.keys()),
        faceIds: new Set(this.faces.keys()),
      }
    }

    const pointIds = new Set(this.dirtyPointIds)
    const lineIds = new Set(this.dirtyLineIds)
    const straightLineIds = new Set(this.dirtyStraightLineIds)
    const rayIds = new Set(this.dirtyRayIds)
    const vectorIds = new Set(this.dirtyVectorIds)
    const circleIds = new Set(this.dirtyCircleIds)
    const faceIds = new Set(this.dirtyFaceIds)

    pointIds.forEach((pointId) => {
      this.lines.forEach((line, lineId) => {
        if (line.p1.id === pointId || line.p2.id === pointId) lineIds.add(lineId)
      })
      this.straightLines.forEach((line, lineId) => {
        if (line.p1.id === pointId || line.p2.id === pointId) straightLineIds.add(lineId)
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

    this.dirtyPointIds.clear()
    this.dirtyLineIds.clear()
    this.dirtyStraightLineIds.clear()
    this.dirtyRayIds.clear()
    this.dirtyVectorIds.clear()
    this.dirtyCircleIds.clear()
    this.dirtyFaceIds.clear()

    if (
      pointIds.size === 0 &&
      lineIds.size === 0 &&
      straightLineIds.size === 0 &&
      rayIds.size === 0 &&
      vectorIds.size === 0 &&
      circleIds.size === 0 &&
      faceIds.size === 0
    ) {
      return null
    }

    return {
      fullSync: false,
      pointIds,
      lineIds,
      straightLineIds,
      rayIds,
      vectorIds,
      circleIds,
      faceIds,
    }
  }

  private markConstraintDirty(constraint: SceneConstraint) {
    const beforeSize = this.dirtyConstraints.size
    this.dirtyConstraints.add(constraint)
    if (this.dirtyConstraints.size !== beforeSize) {
      this.solverListeners.forEach((listener) => listener())
    }
  }
}
