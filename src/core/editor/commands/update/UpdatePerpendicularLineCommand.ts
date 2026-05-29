import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
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

export class UpdatePerpendicularLineCommand extends AbstractUpdateCommand<PerpendicularLineState> {
  constructor(
    private line: PerpendicularLine3,
    before: PerpendicularLineState,
    after: PerpendicularLineState,
  ) {
    super(before, after)
  }

  protected apply(state: PerpendicularLineState) {
    this.line.name = state.name
    this.line.nameVisible = state.nameVisible
    this.line.valueVisible = state.valueVisible
    this.line.labelOffsetX = state.labelOffsetX
    this.line.labelOffsetY = state.labelOffsetY
    this.line.visible = state.visible
    this.line.displayLength = PerpendicularLine3.normalizeDisplayLength(state.displayLength)
    this.line.userLocked = state.userLocked
  }
}