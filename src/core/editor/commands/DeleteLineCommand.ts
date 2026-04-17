import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Line3 } from '../../geometry/Line3'
import { Point3 } from '../../geometry/Point3'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export class DeleteLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: Line3,
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
  ) {}

  execute() {
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.removeIntersectionConstraint(constraint.pointId)
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
    this.scene.lines.delete(this.line.id)
    this.scene.selection.lines.delete(this.line.id)
  }

  undo() {
    this.scene.addLine(this.line)
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
