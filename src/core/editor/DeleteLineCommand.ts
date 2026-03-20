import type { Command } from './Command'
import { Scene } from '../scene/Scene'
import { Line3 } from '../geometry/Line3'

export class DeleteLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: Line3,
  ) {}

  execute() {
    this.scene.lines.delete(this.line.id)
    this.scene.selection.lines.delete(this.line.id)
  }

  undo() {
    this.scene.addLine(this.line)
  }
}
