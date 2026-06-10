import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type SphereRadiusState = {
  radiusValue: number
}

export class UpdateSphereRadiusCommand extends ConstraintAwareCommand {
  readonly label = '更新球体半径'

  private before: SphereRadiusState
  private after: SphereRadiusState

  constructor(
    scene: Scene,
    private sphereId: string,
    before: SphereRadiusState,
    after: SphereRadiusState,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const sphere = scene.spheres.get(sphereId)
    if (sphere) {
      this.markAffected(sphere.centerPoint.id)
      if (sphere.radiusPoint) {
        this.markAffected(sphere.radiusPoint.id)
      }
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: SphereRadiusState) {
    const sphere = this.scene.spheres.get(this.sphereId)
    if (!sphere) return
    sphere.radiusValue = state.radiusValue
  }
}
