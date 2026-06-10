import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type SphereState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateSphereCommand extends ConstraintAwareCommand {
  readonly label = '更新球体属性'

  private before: SphereState
  private after: SphereState

  constructor(
    private sphereId: string,
    before: SphereState,
    after: SphereState,
    scene: Scene,
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

  private apply(state: SphereState) {
    const sphere = this.scene.spheres.get(this.sphereId)
    if (!sphere) return
    sphere.name = state.name
    sphere.nameVisible = state.nameVisible
    sphere.valueVisible = state.valueVisible
    sphere.labelOffsetX = state.labelOffsetX
    sphere.labelOffsetY = state.labelOffsetY
    sphere.visible = state.visible
    sphere.userLocked = state.userLocked
  }
}
