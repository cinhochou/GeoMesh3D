import { PlanarFaceConstraint } from '../constraints/PlanarFaceConstraint'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
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
}

export class Scene {
  static readonly ORIGIN_ID = 'origin'
  points = new Map<string, Point3>()
  lines = new Map<string, Line3>()
  straightLines = new Map<string, StraightLine3>()
  rays = new Map<string, Ray3>()
  faces = new Map<string, PlanarFace>()
  selection = new Selection()
  activeDraggedPointIds = new Set<string>()
  constraints: SceneConstraint[] = []
  faceConstraints = new Map<string, SceneConstraint>()
  intersectionConstraints = new Map<string, SceneConstraint>()
  cubeConstraints = new Map<string, SceneConstraint>()

  constructor() {
    // 固定原点：可参与连线/选择，但不可移动
    const origin = new Point3(Scene.ORIGIN_ID, 'O', new Vec3(0, 0, 0), true, true)
    this.points.set(origin.id, origin)
  }

  addPoint(p: Point3) {
    this.points.set(p.id, p)
  }

  addLine(l: Line3) {
    this.lines.set(l.id, l)
  }

  addStraightLine(line: StraightLine3) {
    this.straightLines.set(line.id, line)
  }

  addRay(ray: Ray3) {
    this.rays.set(ray.id, ray)
  }

  addFace(face: PlanarFace) {
    face.normalize(this.points)
    this.faces.set(face.id, face)
    const existing = this.faceConstraints.get(face.id)
    if (existing) {
      if (!this.constraints.includes(existing)) this.constraints.push(existing)
      return
    }
    const constraint = new PlanarFaceConstraint(this, face.id)
    this.faceConstraints.set(face.id, constraint)
    this.constraints.push(constraint)
  }

  removeFace(faceId: string) {
    this.faces.delete(faceId)
    this.selection.faces.delete(faceId)
    const constraint = this.faceConstraints.get(faceId)
    if (!constraint) return
    this.constraints = this.constraints.filter((item) => item !== constraint)
    this.faceConstraints.delete(faceId)
  }

  addConstraint(c: SceneConstraint) {
    this.constraints.push(c)
    if (c.faceId) this.faceConstraints.set(c.faceId, c)
    if (c.pointId) this.intersectionConstraints.set(c.pointId, c)
    if (c.cubeId) this.cubeConstraints.set(c.cubeId, c)
  }

  addIntersectionConstraint(c: SceneConstraint & { pointId: string }) {
    const existing = this.intersectionConstraints.get(c.pointId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
    }
    this.intersectionConstraints.set(c.pointId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
  }

  removeIntersectionConstraint(pointId: string) {
    const existing = this.intersectionConstraints.get(pointId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.intersectionConstraints.delete(pointId)
  }

  addCubeConstraint(c: SceneConstraint & { cubeId: string }) {
    const existing = this.cubeConstraints.get(c.cubeId)
    if (existing) {
      this.constraints = this.constraints.filter((item) => item !== existing)
    }
    this.cubeConstraints.set(c.cubeId, c)
    if (!this.constraints.includes(c)) {
      this.constraints.push(c)
    }
  }

  removeCubeConstraint(cubeId: string) {
    const existing = this.cubeConstraints.get(cubeId)
    if (!existing) return
    this.constraints = this.constraints.filter((item) => item !== existing)
    this.cubeConstraints.delete(cubeId)
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

  clearAllConstraints() {
    this.constraints = []
    this.faceConstraints.clear()
    this.intersectionConstraints.clear()
    this.cubeConstraints.clear()
  }

  rebuildConstraintIndexes() {
    this.faceConstraints.clear()
    this.intersectionConstraints.clear()
    this.cubeConstraints.clear()
    this.constraints.forEach((constraint) => {
      if (constraint.faceId) this.faceConstraints.set(constraint.faceId, constraint)
      if (constraint.pointId) this.intersectionConstraints.set(constraint.pointId, constraint)
      if (constraint.cubeId) this.cubeConstraints.set(constraint.cubeId, constraint)
    })
  }
}
