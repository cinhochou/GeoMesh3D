import type { Command } from '../Command'
import { Circle3 } from '../../geometry/Circle3'

type CircleState = {
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerVisible: boolean
  lockedRadius: number | null
}

export class UpdateCircleCommand implements Command {
  constructor(
    private circle: Circle3,
    private before: CircleState,
    private after: CircleState,
  ) {}

  execute() {
    this.apply(this.after)
  }

  undo() {
    this.apply(this.before)
  }

  private apply(state: CircleState) {
    this.circle.name = state.name
    this.circle.nameVisible = state.nameVisible
    this.circle.valueVisible = state.valueVisible
    this.circle.labelOffsetX = state.labelOffsetX
    this.circle.labelOffsetY = state.labelOffsetY
    this.circle.visible = state.visible
    this.circle.userLocked = state.userLocked
    this.circle.centerVisible = state.centerVisible
    this.circle.lockedRadius = state.lockedRadius
  }
}
