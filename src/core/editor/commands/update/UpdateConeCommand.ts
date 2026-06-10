import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type ConeState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateConeCommand extends ConstraintAwareCommand {
  readonly label = '更新圆锥属性'

  private before: ConeState
  private after: ConeState

  constructor(
    private coneId: string,
    before: ConeState,
    after: ConeState,
    scene: Scene,
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

  private apply(state: ConeState) {
    const cone = this.scene.cones.get(this.coneId)
    if (!cone) return
    cone.name = state.name
    cone.nameVisible = state.nameVisible
    cone.valueVisible = state.valueVisible
    cone.labelOffsetX = state.labelOffsetX
    cone.labelOffsetY = state.labelOffsetY
    cone.visible = state.visible
    cone.userLocked = state.userLocked
  }
}
