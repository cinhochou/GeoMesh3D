import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Ray3 } from '../../../geometry/Ray3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'

export class DeleteRayCommand implements Command {
  constructor(
    private scene: Scene,
    private ray: Ray3,
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
    this.scene.rays.delete(this.ray.id)
    this.scene.selection.rays.delete(this.ray.id)
  }

  undo() {
    this.scene.addRay(this.ray)
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
