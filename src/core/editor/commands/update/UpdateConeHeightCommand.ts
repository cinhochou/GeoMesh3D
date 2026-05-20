import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import { Cone3 } from '../../../geometry/Cone3'

export class UpdateConeHeightCommand implements Command {
  private beforeApexPos: Vec3
  private afterApexPos: Vec3

  constructor(
    private cone: Cone3,
    private apexPoint: Point3,
    newHeight: number,
  ) {
    this.beforeApexPos = apexPoint.position.clone()
    const center = cone.baseCenterPoint.position
    const axis = new Vec3(
      apexPoint.position.x - center.x,
      apexPoint.position.y - center.y,
      apexPoint.position.z - center.z,
    )
    const axisLength = Math.hypot(axis.x, axis.y, axis.z)
    if (axisLength <= 1e-8) {
      this.afterApexPos = this.beforeApexPos.clone()
    } else {
      const normalizedAxis = new Vec3(axis.x / axisLength, axis.y / axisLength, axis.z / axisLength)
      this.afterApexPos = new Vec3(
        center.x + normalizedAxis.x * newHeight,
        center.y + normalizedAxis.y * newHeight,
        center.z + normalizedAxis.z * newHeight,
      )
    }
  }

  execute() {
    this.apexPoint.setPosition(this.afterApexPos)
  }

  undo() {
    this.apexPoint.setPosition(this.beforeApexPos)
  }
}
