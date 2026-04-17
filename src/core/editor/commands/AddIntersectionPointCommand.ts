import type { Command } from '../Command'
import { Point3 } from '../../geometry/Point3'
import { Scene } from '../../scene/Scene'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export class AddIntersectionPointCommand implements Command {
  constructor(
    private scene: Scene,
    private point: Point3,
    private constraint: IntersectionPointConstraint,
  ) {}

  execute() {
    this.scene.addPoint(this.point)
    this.scene.addIntersectionConstraint(this.constraint)
  }

  undo() {
    this.scene.removeIntersectionConstraint(this.point.id)
    this.scene.points.delete(this.point.id)
    this.scene.selection.points.delete(this.point.id)
  }
}
