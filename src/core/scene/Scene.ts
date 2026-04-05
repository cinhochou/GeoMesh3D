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
}

export class Scene {
  static readonly ORIGIN_ID = 'origin'
  points = new Map<string, Point3>()
  lines = new Map<string, Line3>()
  straightLines = new Map<string, StraightLine3>()
  rays = new Map<string, Ray3>()
  faces = new Map<string, PlanarFace>()
  selection = new Selection()
  constraints: SceneConstraint[] = []
  faceConstraints = new Map<string, SceneConstraint>()

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
  }
}
