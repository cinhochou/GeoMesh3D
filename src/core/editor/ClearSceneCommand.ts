import type { Command } from './Command'
import { DistanceConstraint } from '../constraints/DistanceConstraint'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { Scene } from '../scene/Scene'

export class ClearSceneCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private lines: Line3[],
    private rays: Ray3[],
    private constraints: DistanceConstraint[],
  ) {}

  execute() {
    this.scene.lines.clear()
    this.scene.rays.clear()
    this.points.forEach((point) => this.scene.points.delete(point.id))
    this.scene.constraints.length = 0
    this.scene.selection.clear()
  }

  undo() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.lines.forEach((line) => this.scene.addLine(line))
    this.rays.forEach((ray) => this.scene.addRay(ray))
    this.scene.constraints.push(...this.constraints)
  }
}
