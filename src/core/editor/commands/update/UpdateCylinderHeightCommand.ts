import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { Vec3 } from '../../../geometry/Vec3'

export class UpdateCylinderHeightCommand extends ConstraintAwareCommand {
  readonly label = '更新圆柱高度'

  private beforeTopPos: Vec3
  private afterTopPos: Vec3

  constructor(
    scene: Scene,
    private cylinderId: string,
    private topPointId: string,
    newHeight: number,
  ) {
    super(scene)
    const cylinder = scene.cylinders.get(cylinderId)
    const topPoint = scene.points.get(topPointId)
    if (cylinder && topPoint) {
      this.beforeTopPos = topPoint.position.clone()
      const center = cylinder.bottomCenterPoint.position
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
      this.markAffected(cylinder.bottomCenterPoint.id, topPoint.id)
    } else {
      this.beforeTopPos = new Vec3(0, 0, 0)
      this.afterTopPos = new Vec3(0, 0, 0)
    }
  }

  protected doExecute(): void {
    const topPoint = this.scene.points.get(this.topPointId)
    if (!topPoint) return
    topPoint.setPosition(this.afterTopPos)
  }

  protected doUndo(): void {
    const topPoint = this.scene.points.get(this.topPointId)
    if (!topPoint) return
    topPoint.setPosition(this.beforeTopPos)
  }
}
