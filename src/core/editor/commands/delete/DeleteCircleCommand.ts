import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Circle3 } from '../../../geometry/Circle3'
import { Point3 } from '../../../geometry/Point3'

export class DeleteCircleCommand implements Command {
  private centerPoint: Point3 | null
  private centerPointExisted: boolean
  private centerPointWasReferenced: boolean = false

  constructor(
    private scene: Scene,
    private circle: Circle3,
  ) {
    if (circle.isNormalCircle()) {
      this.centerPoint = null
      this.centerPointExisted = false
    } else {
      this.centerPoint = [...scene.points.values()].find(
        (p) => p.circleId === circle.id && p.circleRole === 'center',
      ) ?? null
      this.centerPointExisted = false
      if (this.centerPoint) {
        this.centerPointWasReferenced = this.isPointReferencedByOtherGeometry(this.centerPoint.id, circle.id)
      }
    }
  }

  private isPointReferencedByOtherGeometry(pointId: string, excludeCircleId: string): boolean {
    for (const line of this.scene.lines.values()) {
      if (line.p1.id === pointId || line.p2.id === pointId) return true
    }
    for (const ray of this.scene.rays.values()) {
      if (ray.p1.id === pointId || ray.p2.id === pointId) return true
    }
    for (const vec of this.scene.vectors.values()) {
      if (vec.p1.id === pointId || vec.p2.id === pointId) return true
    }
    for (const sl of this.scene.straightLines.values()) {
      if (sl.p1.id === pointId || sl.p2.id === pointId) return true
    }
    for (const circle of this.scene.circles.values()) {
      if (circle.id !== excludeCircleId &&
        (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId)) return true
    }
    for (const face of this.scene.faces.values()) {
      if (face.includesPoint(pointId)) return true
    }
    return false
  }

  execute() {
    if (this.circle.isNormalCircle()) {
      this.circle.p1.circleId = null
      this.circle.p1.circleRole = null
    } else if (this.centerPoint) {
      if (this.centerPointWasReferenced) {
        this.centerPoint.circleId = null
        this.centerPoint.circleRole = null
      } else {
        this.scene.points.delete(this.centerPoint.id)
        this.scene.selection.points.delete(this.centerPoint.id)
      }
    }
    this.scene.circles.delete(this.circle.id)
    this.scene.selection.circles.delete(this.circle.id)
  }

  undo() {
    this.scene.addCircle(this.circle)
    if (this.circle.isNormalCircle()) {
      this.circle.p1.circleId = this.circle.id
      this.circle.p1.circleRole = 'center'
    } else if (this.centerPoint) {
      if (this.centerPointWasReferenced) {
        this.centerPoint.circleId = this.circle.id
        this.centerPoint.circleRole = 'center'
      } else {
        this.scene.addPoint(this.centerPoint)
      }
    }
  }
}
