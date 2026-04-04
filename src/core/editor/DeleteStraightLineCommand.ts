import type { Command } from './Command'
import { Scene } from '../scene/Scene'
import { StraightLine3 } from '../geometry/StraightLine3'

export class DeleteStraightLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: StraightLine3,
  ) {}

  execute() {
    this.scene.straightLines.delete(this.line.id)
    this.scene.selection.straightLines.delete(this.line.id)
  }

  undo() {
    this.scene.addStraightLine(this.line)
  }
}
