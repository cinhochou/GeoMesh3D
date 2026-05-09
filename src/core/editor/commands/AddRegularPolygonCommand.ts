import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { RegularPolygonConstraint } from '../../constraints/RegularPolygonConstraint'

export class AddRegularPolygonCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private face: PlanarPolygon,
    private constraint: RegularPolygonConstraint,
  ) {}

  execute() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.scene.addFace(this.face)
    this.scene.addRegularPolygonConstraint(this.constraint)
  }

  undo() {
    this.scene.removeRegularPolygonConstraint(this.constraint.constraintId)
    this.scene.removeFace(this.face.id)
    this.points.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
  }
}
