import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { Ray3 } from '../../../geometry/Ray3'

type RayState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateRayCommand extends ConstraintAwareCommand {
  readonly label = '更新射线属性'

  private before: RayState
  private after: RayState

  constructor(
    private rayId: string,
    before: RayState,
    after: RayState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const ray = scene.rays.get(rayId)
    if (ray) {
      this.markAffected(ray.p1.id, ray.p2.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: RayState) {
    const ray = this.scene.rays.get(this.rayId)
    if (!ray) return
    ray.name = state.name
    ray.nameVisible = state.nameVisible
    ray.valueVisible = state.valueVisible
    ray.labelOffsetX = state.labelOffsetX
    ray.labelOffsetY = state.labelOffsetY
    ray.visible = state.visible
    ray.displayLength = Ray3.normalizeDisplayLength(state.displayLength)
    ray.userLocked = state.userLocked
  }
}
