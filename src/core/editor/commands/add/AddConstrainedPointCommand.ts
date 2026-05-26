import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Scene } from '../../../scene/Scene'
import { ObjectConstrainedPointConstraint } from '../../../constraints/ObjectConstrainedPointConstraint'

export class AddConstrainedPointCommand implements Command {
  constructor(
    private scene: Scene,
    private point: Point3,
    private constraint: ObjectConstrainedPointConstraint,
  ) {}

  execute() {
    this.scene.addPoint(this.point)
    this.scene.addObjectConstrainedPointConstraint(this.constraint)
  }

  undo() {
    this.scene.removeObjectConstrainedPointConstraint(this.point.id)
    this.scene.points.delete(this.point.id)
    this.scene.selection.points.delete(this.point.id)
  }
}
