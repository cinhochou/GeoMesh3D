import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Line3 } from '../../../geometry/Line3'
import { Vec3 } from '../../../geometry/Vec3'

type LineState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
  p1Position?: Vec3
  p2Position?: Vec3
}

export class UpdateLineCommand extends AbstractUpdateCommand<LineState> {
  constructor(
    private line: Line3,
    before: LineState,
    after: LineState,
  ) {
    super(before, after)
  }

  protected apply(state: LineState) {
    this.line.name = state.name
    this.line.nameVisible = state.nameVisible
    this.line.valueVisible = state.valueVisible
    this.line.labelOffsetX = state.labelOffsetX
    this.line.labelOffsetY = state.labelOffsetY
    this.line.visible = state.visible
    this.line.userLocked = state.userLocked
    this.line.lengthLocked = state.lengthLocked
    this.line.lockedLength = Line3.normalizeLockedLength(state.lockedLength)
    if (state.p1Position) this.line.p1.setPosition(state.p1Position.clone())
    if (state.p2Position) this.line.p2.setPosition(state.p2Position.clone())
  }
}
