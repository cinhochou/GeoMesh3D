import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { ParallelLineConstraint } from '../../../constraints/ParallelLineConstraint'

export class DeleteStraightLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: StraightLine3,
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
    private relatedPerpendicularLines: PerpendicularLine3[] = [],
    private relatedParallelLines: ParallelLine3[] = [],
  ) {}

  execute() {
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.removePerpendicularLine(line.id)
      this.scene.selection.perpendicularLines.delete(line.id)
    })
    this.relatedParallelLines.forEach((line) => {
      this.scene.removeParallelLine(line.id)
      this.scene.selection.parallelLines.delete(line.id)
    })
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
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.addPerpendicularLine(line)
      this.scene.addPerpendicularLineConstraint(
        new PerpendicularLineConstraint(this.scene, line.id, line.target),
      )
    })
    this.relatedParallelLines.forEach((line) => {
      this.scene.addParallelLine(line)
      this.scene.addParallelLineConstraint(
        new ParallelLineConstraint(this.scene, line.id, line.target),
      )
    })
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
