import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Cone3 } from '../../../geometry/Cone3'

type ConeState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateConeCommand extends AbstractUpdateCommand<ConeState> {
  constructor(
    private cone: Cone3,
    before: ConeState,
    after: ConeState,
  ) {
    super(before, after)
  }

  protected apply(state: ConeState) {
    this.cone.name = state.name
    this.cone.nameVisible = state.nameVisible
    this.cone.valueVisible = state.valueVisible
    this.cone.labelOffsetX = state.labelOffsetX
    this.cone.labelOffsetY = state.labelOffsetY
    this.cone.visible = state.visible
    this.cone.userLocked = state.userLocked
  }
}
