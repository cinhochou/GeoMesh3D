import type { Command } from './Command'
import { Scene } from '../scene/Scene'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { StraightLine3 } from '../geometry/StraightLine3'

export class DeletePointCommand implements Command {
  constructor(
    private scene: Scene,
    private point: Point3,
    private relatedLines: Line3[],
    private relatedStraightLines: StraightLine3[],
    private relatedRays: Ray3[],
  ) {}

  execute() {
    this.relatedLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })
    this.relatedStraightLines.forEach((line) => {
      this.scene.straightLines.delete(line.id)
      this.scene.selection.straightLines.delete(line.id)
    })
    this.relatedRays.forEach((ray) => {
      this.scene.rays.delete(ray.id)
      this.scene.selection.rays.delete(ray.id)
    })

    this.scene.points.delete(this.point.id)
    this.scene.selection.points.delete(this.point.id)
  }

  undo() {
    this.scene.addPoint(this.point)
    this.relatedLines.forEach((line) => this.scene.addLine(line))
    this.relatedStraightLines.forEach((line) => this.scene.addStraightLine(line))
    this.relatedRays.forEach((ray) => this.scene.addRay(ray))
  }
}
