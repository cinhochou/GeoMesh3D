import { AbstractUpdateCommand } from '../AbstractUpdateCommand'
import { Cylinder3 } from '../../../geometry/Cylinder3'

type CylinderState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
}

export class UpdateCylinderCommand extends AbstractUpdateCommand<CylinderState> {
  constructor(
    private cylinder: Cylinder3,
    before: CylinderState,
    after: CylinderState,
  ) {
    super(before, after)
  }

  protected apply(state: CylinderState) {
    this.cylinder.name = state.name
    this.cylinder.nameVisible = state.nameVisible
    this.cylinder.valueVisible = state.valueVisible
    this.cylinder.labelOffsetX = state.labelOffsetX
    this.cylinder.labelOffsetY = state.labelOffsetY
    this.cylinder.visible = state.visible
    this.cylinder.userLocked = state.userLocked
  }
}
