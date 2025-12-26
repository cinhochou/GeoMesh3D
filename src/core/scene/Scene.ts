import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'

export class Scene {
  points = new Map<string, Point3>()
  lines = new Map<string, Line3>()

  addPoint(p: Point3) {
    this.points.set(p.id, p)
  }

  addLine(l: Line3) {
    this.lines.set(l.id, l)
  }
}
