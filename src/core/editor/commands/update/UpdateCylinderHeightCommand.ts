import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import { Cylinder3 } from '../../../geometry/Cylinder3'

export class UpdateCylinderHeightCommand implements Command {
  private beforeTopPos: Vec3
  private afterTopPos: Vec3

  constructor(
    private cylinder: Cylinder3,
    private topPoint: Point3,
    newHeight: number,
  ) {
    this.beforeTopPos = topPoint.position.clone()
    const center = this.cylinder.bottomCenterPoint.position
    const axis = new Vec3(
      topPoint.position.x - center.x,
      topPoint.position.y - center.y,
      topPoint.position.z - center.z,
    )
    const axisLength = Math.hypot(axis.x, axis.y, axis.z)
    if (axisLength <= 1e-8) {
      this.afterTopPos = this.beforeTopPos.clone()
    } else {
      const normalizedAxis = new Vec3(axis.x / axisLength, axis.y / axisLength, axis.z / axisLength)
      this.afterTopPos = new Vec3(
        center.x + normalizedAxis.x * newHeight,
        center.y + normalizedAxis.y * newHeight,
        center.z + normalizedAxis.z * newHeight,
      )
    }
  }

  execute() {
    this.topPoint.setPosition(this.afterTopPos)
  }

  undo() {
    this.topPoint.setPosition(this.beforeTopPos)
  }
}
