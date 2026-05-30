import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
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

export class UpdateParallelLineCommand extends AbstractUpdateCommand<ParallelLineState> {
  constructor(
    private line: ParallelLine3,
    before: ParallelLineState,
    after: ParallelLineState,
  ) {
    super(before, after)
  }

  protected apply(state: ParallelLineState) {
    this.line.name = state.name
    this.line.nameVisible = state.nameVisible
    this.line.valueVisible = state.valueVisible
    this.line.labelOffsetX = state.labelOffsetX
    this.line.labelOffsetY = state.labelOffsetY
    this.line.visible = state.visible
    this.line.displayLength = ParallelLine3.normalizeDisplayLength(state.displayLength)
    this.line.userLocked = state.userLocked
  }
}
