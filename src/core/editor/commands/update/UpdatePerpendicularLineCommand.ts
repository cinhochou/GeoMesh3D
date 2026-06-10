import { ConstraintAwareCommand } from '../ConstraintAwareCommand'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'

type PerpendicularLineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  displayLength: number
  userLocked: boolean
}

export class UpdatePerpendicularLineCommand extends ConstraintAwareCommand {
  readonly label = '更新垂线属性'

  private before: PerpendicularLineState
  private after: PerpendicularLineState

  constructor(
    private lineId: string,
    before: PerpendicularLineState,
    after: PerpendicularLineState,
    scene: Scene,
  ) {
    super(scene)
    this.before = before
    this.after = after
    const line = scene.perpendicularLines.get(lineId)
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

  private apply(state: PerpendicularLineState) {
    const line = this.scene.perpendicularLines.get(this.lineId)
    if (!line) return
    line.name = state.name
    line.nameVisible = state.nameVisible
    line.valueVisible = state.valueVisible
    line.labelOffsetX = state.labelOffsetX
    line.labelOffsetY = state.labelOffsetY
    line.visible = state.visible
    line.displayLength = PerpendicularLine3.normalizeDisplayLength(state.displayLength)
    line.userLocked = state.userLocked
  }
}
