import type { Command } from '../../Command'
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

export class UpdateConeCommand implements Command {
  constructor(
    private cone: Cone3,
    private before: ConeState,
    private after: ConeState,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  private apply(state: ConeState) {
    this.cone.name = state.name
    this.cone.nameVisible = state.nameVisible
    this.cone.valueVisible = state.valueVisible
    this.cone.labelOffsetX = state.labelOffsetX
    this.cone.labelOffsetY = state.labelOffsetY
    this.cone.visible = state.visible
    this.cone.userLocked = state.userLocked
  }
}
