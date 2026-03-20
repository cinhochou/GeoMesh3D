import type { Command } from './Command'
import { Scene } from '../scene/Scene'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'

export class DeletePointCommand implements Command {
  constructor(
    private scene: Scene,
    private point: Point3,
    private relatedLines: Line3[],
  ) {}

  execute() {
    this.relatedLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })

    this.scene.points.delete(this.point.id)
    this.scene.selection.points.delete(this.point.id)
  }

  undo() {
    this.scene.addPoint(this.point)
    this.relatedLines.forEach((line) => this.scene.addLine(line))
  }
}
