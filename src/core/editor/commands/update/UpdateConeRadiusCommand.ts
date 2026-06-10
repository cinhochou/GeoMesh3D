import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type RadiusState = {
  radiusValue: number
}

export class UpdateConeRadiusCommand extends ConstraintAwareCommand {
  readonly label = '更新圆锥半径'

  private before: RadiusState
  private after: RadiusState

  constructor(
    scene: Scene,
    private coneId: string,
    before: RadiusState,
    after: RadiusState,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const cone = scene.cones.get(coneId)
    if (cone) {
      this.markAffected(cone.baseCenterPoint.id, cone.apexPoint.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: RadiusState) {
    const cone = this.scene.cones.get(this.coneId)
    if (!cone) return
    cone.radiusValue = state.radiusValue
    if (cone.normalCircleId) {
      const normalCircle = this.scene.circles.get(cone.normalCircleId)
      if (normalCircle) {
        normalCircle.lockedRadius = state.radiusValue
      }
    }
  }
}
