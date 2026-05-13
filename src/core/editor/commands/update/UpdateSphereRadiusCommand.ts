import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

type SphereRadiusState = {
  radiusValue: number
}

export class UpdateSphereRadiusCommand implements Command {
  constructor(
    private scene: Scene,
    private sphere: Sphere3,
    private before: SphereRadiusState,
    private after: SphereRadiusState,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  private apply(state: SphereRadiusState) {
    this.sphere.radiusValue = state.radiusValue
    this.scene.markAllRenderDirty()
  }
}
