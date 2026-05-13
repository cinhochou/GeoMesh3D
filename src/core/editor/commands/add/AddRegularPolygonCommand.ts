import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'

export class AddRegularPolygonCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private face: PlanarPolygon,
    private constraint: RegularPolygonConstraint,
    private boundaryLines: Line3[] = [],
  ) {}

  execute() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.boundaryLines.forEach((line) => this.scene.addLine(line))
    this.scene.addFace(this.face)
    this.scene.addRegularPolygonConstraint(this.constraint)
  }

  undo() {
    this.scene.removeRegularPolygonConstraint(this.constraint.constraintId)
    this.scene.removeFace(this.face.id)
    this.boundaryLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })
    this.points.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
  }
}
