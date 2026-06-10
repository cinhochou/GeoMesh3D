import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

type ParallelLineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateParallelLineCommand extends ConstraintAwareCommand {
  readonly label = '更新平行线属性'

  private before: ParallelLineState
  private after: ParallelLineState

  constructor(
    private lineId: string,
    before: ParallelLineState,
    after: ParallelLineState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const line = scene.parallelLines.get(lineId)
    if (line) {
      this.markAffected(line.p1.id, line.p2.id)
    }
  }

  protected doExecute(): void {
    this.apply(this.after)
  }

  protected doUndo(): void {
    this.apply(this.before)
  }

  private apply(state: ParallelLineState) {
    const line = this.scene.parallelLines.get(this.lineId)
    if (!line) return
    line.name = state.name
    line.nameVisible = state.nameVisible
    line.valueVisible = state.valueVisible
    line.labelOffsetX = state.labelOffsetX
    line.labelOffsetY = state.labelOffsetY
    line.visible = state.visible
    line.displayLength = ParallelLine3.normalizeDisplayLength(state.displayLength)
    line.userLocked = state.userLocked
  }
}
