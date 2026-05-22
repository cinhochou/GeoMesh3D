import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
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

export class UpdateStraightLineCommand extends AbstractUpdateCommand<StraightLineState> {
  constructor(
    private line: StraightLine3,
    before: StraightLineState,
    after: StraightLineState,
  ) {
    super(before, after)
  }

  protected apply(state: StraightLineState) {
    this.line.name = state.name
    this.line.nameVisible = state.nameVisible
    this.line.valueVisible = state.valueVisible
    this.line.labelOffsetX = state.labelOffsetX
    this.line.labelOffsetY = state.labelOffsetY
    this.line.visible = state.visible
    this.line.displayLength = StraightLine3.normalizeDisplayLength(state.displayLength)
    this.line.userLocked = state.userLocked
  }
}
