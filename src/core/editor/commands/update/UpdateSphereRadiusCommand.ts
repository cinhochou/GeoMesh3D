import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

type SphereRadiusState = {
  radiusValue: number
}

export class UpdateSphereRadiusCommand extends AbstractUpdateCommand<SphereRadiusState> {
  constructor(
    private scene: Scene,
    private sphere: Sphere3,
    before: SphereRadiusState,
    after: SphereRadiusState,
  ) {
    super(before, after)
  }

  protected apply(state: SphereRadiusState) {
    this.sphere.radiusValue = state.radiusValue
    this.scene.markAllRenderDirty()
  }
}
