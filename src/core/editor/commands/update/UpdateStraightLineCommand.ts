import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { StraightLine3 } from '../../../geometry/StraightLine3'

type StraightLineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdateStraightLineCommand extends ConstraintAwareCommand {
  readonly label = '更新直线属性'

  private before: StraightLineState
  private after: StraightLineState

  constructor(
    private lineId: string,
    before: StraightLineState,
    after: StraightLineState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const line = scene.straightLines.get(lineId)
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

  private apply(state: StraightLineState) {
    const line = this.scene.straightLines.get(this.lineId)
    if (!line) return
    line.name = state.name
    line.nameVisible = state.nameVisible
    line.valueVisible = state.valueVisible
    line.labelOffsetX = state.labelOffsetX
    line.labelOffsetY = state.labelOffsetY
    line.visible = state.visible
    line.displayLength = StraightLine3.normalizeDisplayLength(state.displayLength)
    line.userLocked = state.userLocked
  }
}
