import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Point3 } from '../../../geometry/Point3'

type PointState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  userLocked: boolean
}

export class UpdatePointCommand extends AbstractUpdateCommand<PointState> {
  constructor(
    private point: Point3,
    before: PointState,
    after: PointState,
  ) {
    super(before, after)
  }

  protected apply(state: PointState) {
    this.point.name = state.name
    this.point.nameVisible = state.nameVisible
    this.point.valueVisible = state.valueVisible
    this.point.labelOffsetX = state.labelOffsetX
    this.point.labelOffsetY = state.labelOffsetY
    this.point.userLocked = state.userLocked
  }
}
