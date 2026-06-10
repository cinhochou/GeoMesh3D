import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { Vec3 } from '../../../geometry/Vec3'

export class UpdateConeHeightCommand extends ConstraintAwareCommand {
  readonly label = '更新圆锥高度'

  private beforeApexPos: Vec3
  private afterApexPos: Vec3

  constructor(
    scene: Scene,
    private coneId: string,
    private apexPointId: string,
    newHeight: number,
  ) {
    super(scene)
    const cone = scene.cones.get(coneId)
    const apexPoint = scene.points.get(apexPointId)
    if (cone && apexPoint) {
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
      this.markAffected(cone.baseCenterPoint.id, apexPoint.id)
    } else {
      this.beforeApexPos = new Vec3(0, 0, 0)
      this.afterApexPos = new Vec3(0, 0, 0)
    }
  }

  protected doExecute(): void {
    const apexPoint = this.scene.points.get(this.apexPointId)
    if (!apexPoint) return
    apexPoint.setPosition(this.afterApexPos)
  }

  protected doUndo(): void {
    const apexPoint = this.scene.points.get(this.apexPointId)
    if (!apexPoint) return
    apexPoint.setPosition(this.beforeApexPos)
  }
}
