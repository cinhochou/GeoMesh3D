import type { Command } from '../Command'
import { Point3 } from '../../geometry/Point3'

type PointState = {
  name: string
  nameVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  userLocked: boolean
}

export class UpdatePointCommand implements Command {
  constructor(
    private point: Point3,
    private before: PointState,
    private after: PointState,
  ) {}

  execute() {
    this.point.name = this.after.name
    this.point.nameVisible = this.after.nameVisible
    this.point.labelOffsetX = this.after.labelOffsetX
    this.point.labelOffsetY = this.after.labelOffsetY
    this.point.userLocked = this.after.userLocked
  }

  undo() {
    this.point.name = this.before.name
    this.point.nameVisible = this.before.nameVisible
    this.point.labelOffsetX = this.before.labelOffsetX
    this.point.labelOffsetY = this.before.labelOffsetY
    this.point.userLocked = this.before.userLocked
  }
}
