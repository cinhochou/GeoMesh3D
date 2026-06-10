import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type RadiusState = {
  radiusValue: number
}

export class UpdateCylinderRadiusCommand extends ConstraintAwareCommand {
  readonly label = '更新圆柱半径'

  private before: RadiusState
  private after: RadiusState

  constructor(
    scene: Scene,
    private cylinderId: string,
    before: RadiusState,
    after: RadiusState,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const cylinder = scene.cylinders.get(cylinderId)
    if (cylinder) {
      this.markAffected(cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: RadiusState) {
    const cylinder = this.scene.cylinders.get(this.cylinderId)
    if (!cylinder) return
    cylinder.radiusValue = state.radiusValue
    if (cylinder.normalCircleId) {
      const normalCircle = this.scene.circles.get(cylinder.normalCircleId)
      if (normalCircle) {
        normalCircle.lockedRadius = state.radiusValue
      }
    }
    if (cylinder.topNormalCircleId) {
      const topNormalCircle = this.scene.circles.get(cylinder.topNormalCircleId)
      if (topNormalCircle) {
        topNormalCircle.lockedRadius = state.radiusValue
      }
    }
  }
}
