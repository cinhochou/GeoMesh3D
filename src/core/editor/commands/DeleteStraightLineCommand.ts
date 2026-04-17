import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { Point3 } from '../../geometry/Point3'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export class DeleteStraightLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: StraightLine3,
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
    this.scene.straightLines.delete(this.line.id)
    this.scene.selection.straightLines.delete(this.line.id)
  }

  undo() {
    this.scene.addStraightLine(this.line)
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
