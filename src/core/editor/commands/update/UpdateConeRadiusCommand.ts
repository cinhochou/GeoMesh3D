import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Cone3 } from '../../../geometry/Cone3'

type RadiusState = {
  radiusValue: number
}

export class UpdateConeRadiusCommand implements Command {
  constructor(
    private scene: Scene,
    private cone: Cone3,
    private before: RadiusState,
    private after: RadiusState,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  private apply(state: RadiusState) {
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
