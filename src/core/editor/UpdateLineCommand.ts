import type { Command } from './Command'
import { Line3 } from '../geometry/Line3'

type LineState = {
  name: string
  nameVisible: boolean
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
  }

  undo() {
    this.line.name = this.before.name
    this.line.nameVisible = this.before.nameVisible
  }
}
