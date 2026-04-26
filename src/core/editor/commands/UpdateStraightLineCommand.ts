import type { Command } from '../Command'
import { StraightLine3 } from '../../geometry/StraightLine3'

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

export class UpdateStraightLineCommand implements Command {
  constructor(
    private line: StraightLine3,
    private before: StraightLineState,
    private after: StraightLineState,
  ) {}

  execute() {
    this.line.name = this.after.name
    this.line.nameVisible = this.after.nameVisible
    this.line.valueVisible = this.after.valueVisible
    this.line.labelOffsetX = this.after.labelOffsetX
    this.line.labelOffsetY = this.after.labelOffsetY
    this.line.visible = this.after.visible
    this.line.displayLength = StraightLine3.normalizeDisplayLength(this.after.displayLength)
    this.line.userLocked = this.after.userLocked
  }

  undo() {
    this.line.name = this.before.name
    this.line.nameVisible = this.before.nameVisible
    this.line.valueVisible = this.before.valueVisible
    this.line.labelOffsetX = this.before.labelOffsetX
    this.line.labelOffsetY = this.before.labelOffsetY
    this.line.visible = this.before.visible
    this.line.displayLength = StraightLine3.normalizeDisplayLength(this.before.displayLength)
    this.line.userLocked = this.before.userLocked
  }
}
