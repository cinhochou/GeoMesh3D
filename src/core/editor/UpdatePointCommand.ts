import type { Command } from './Command'
import { Point3 } from '../geometry/Point3'

type PointState = {
  name: string
  nameVisible: boolean
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
  }

  undo() {
    this.point.name = this.before.name
    this.point.nameVisible = this.before.nameVisible
  }
}
