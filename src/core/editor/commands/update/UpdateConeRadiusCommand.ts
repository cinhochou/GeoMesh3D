import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { Cone3 } from '../../../geometry/Cone3'

type RadiusState = {
  radiusValue: number
}

export class UpdateConeRadiusCommand extends AbstractUpdateCommand<RadiusState> {
  constructor(
    private scene: Scene,
    private cone: Cone3,
    before: RadiusState,
    after: RadiusState,
  ) {
    super(before, after)
  }

  protected apply(state: RadiusState) {
    this.cone.radiusValue = state.radiusValue
    if (this.cone.normalCircleId) {
      const normalCircle = this.scene.circles.get(this.cone.normalCircleId)
      if (normalCircle) {
        normalCircle.lockedRadius = state.radiusValue
      }
    }
    this.scene.markAllRenderDirty()
  }
}
