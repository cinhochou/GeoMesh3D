import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { Cylinder3 } from '../../../geometry/Cylinder3'

type RadiusState = {
  radiusValue: number
}

export class UpdateCylinderRadiusCommand extends AbstractUpdateCommand<RadiusState> {
  constructor(
    private scene: Scene,
    private cylinder: Cylinder3,
    before: RadiusState,
    after: RadiusState,
  ) {
    super(before, after)
  }

  protected apply(state: RadiusState) {
    this.cylinder.radiusValue = state.radiusValue
    if (this.cylinder.normalCircleId) {
      const normalCircle = this.scene.circles.get(this.cylinder.normalCircleId)
      if (normalCircle) {
        normalCircle.lockedRadius = state.radiusValue
      }
    }
    if (this.cylinder.topNormalCircleId) {
      const topNormalCircle = this.scene.circles.get(this.cylinder.topNormalCircleId)
      if (topNormalCircle) {
        topNormalCircle.lockedRadius = state.radiusValue
      }
    }
    this.scene.markAllRenderDirty()
  }
}
