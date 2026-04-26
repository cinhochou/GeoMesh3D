import type { Command } from '../Command'
import { Line3 } from '../../geometry/Line3'
import { Vec3 } from '../../geometry/Vec3'

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

export class UpdateLineCommand implements Command {
  constructor(
    private line: Line3,
    private before: LineState,
    private after: LineState,
  ) {}

  execute() {
    this.line.name = this.after.name
    this.line.nameVisible = this.after.nameVisible
    this.line.valueVisible = this.after.valueVisible
    this.line.labelOffsetX = this.after.labelOffsetX
    this.line.labelOffsetY = this.after.labelOffsetY
    this.line.visible = this.after.visible
    this.line.userLocked = this.after.userLocked
    this.line.lengthLocked = this.after.lengthLocked
    this.line.lockedLength = Line3.normalizeLockedLength(this.after.lockedLength)
    if (this.after.p1Position) this.line.p1.setPosition(this.after.p1Position.clone())
    if (this.after.p2Position) this.line.p2.setPosition(this.after.p2Position.clone())
  }

  undo() {
    this.line.name = this.before.name
    this.line.nameVisible = this.before.nameVisible
    this.line.valueVisible = this.before.valueVisible
    this.line.labelOffsetX = this.before.labelOffsetX
    this.line.labelOffsetY = this.before.labelOffsetY
    this.line.visible = this.before.visible
    this.line.userLocked = this.before.userLocked
    this.line.lengthLocked = this.before.lengthLocked
    this.line.lockedLength = Line3.normalizeLockedLength(this.before.lockedLength)
    if (this.before.p1Position) this.line.p1.setPosition(this.before.p1Position.clone())
    if (this.before.p2Position) this.line.p2.setPosition(this.before.p2Position.clone())
  }
}
