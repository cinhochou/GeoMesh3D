import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Vec3 } from '../geometry/Vec3'
import { Selection } from './Selection'
import { DistanceConstraint } from '../constraints/DistanceConstraint'

export class Scene {
  static readonly ORIGIN_ID = 'origin'
  points = new Map<string, Point3>()
  lines = new Map<string, Line3>()
  selection = new Selection()
  constraints: DistanceConstraint[] = []

  constructor() {
    // 固定原点：可参与连线/选择，但不可移动
    const origin = new Point3(Scene.ORIGIN_ID, 'O', new Vec3(0, 0, 0), true)
    this.points.set(origin.id, origin)
  }

  addPoint(p: Point3) {
    this.points.set(p.id, p)
  }

  addLine(l: Line3) {
    this.lines.set(l.id, l)
  }

  addConstraint(c: DistanceConstraint) {
    this.constraints.push(c)
  }
}
