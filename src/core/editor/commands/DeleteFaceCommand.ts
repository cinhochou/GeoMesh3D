import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { Point3 } from '../../geometry/Point3'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export class DeleteFaceCommand implements Command {
  constructor(
    private scene: Scene,
    private face: PlanarPolygon,
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
    this.scene.removeFace(this.face.id)
  }

  undo() {
    this.scene.addFace(this.face)
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
