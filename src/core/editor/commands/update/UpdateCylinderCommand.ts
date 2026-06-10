import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type CylinderState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateCylinderCommand extends ConstraintAwareCommand {
  readonly label = '更新圆柱属性'

  private before: CylinderState
  private after: CylinderState

  constructor(
    private cylinderId: string,
    before: CylinderState,
    after: CylinderState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const cylinder = scene.cylinders.get(cylinderId)
    if (cylinder) {
      this.markAffected(cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: CylinderState) {
    const cylinder = this.scene.cylinders.get(this.cylinderId)
    if (!cylinder) return
    cylinder.name = state.name
    cylinder.nameVisible = state.nameVisible
    cylinder.valueVisible = state.valueVisible
    cylinder.labelOffsetX = state.labelOffsetX
    cylinder.labelOffsetY = state.labelOffsetY
    cylinder.visible = state.visible
    cylinder.userLocked = state.userLocked
  }
}
