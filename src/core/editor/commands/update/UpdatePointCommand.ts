import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'

type PointState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  userLocked: boolean
}

export class UpdatePointCommand extends ConstraintAwareCommand {
  readonly label = '更新点属性'

  private before: PointState
  private after: PointState

  constructor(
    private pointId: string,
    before: PointState,
    after: PointState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: PointState) {
    const point = this.scene.points.get(this.pointId)
    if (!point) return
    point.name = state.name
    point.nameVisible = state.nameVisible
    point.valueVisible = state.valueVisible
    point.labelOffsetX = state.labelOffsetX
    point.labelOffsetY = state.labelOffsetY
    point.userLocked = state.userLocked
  }
}
