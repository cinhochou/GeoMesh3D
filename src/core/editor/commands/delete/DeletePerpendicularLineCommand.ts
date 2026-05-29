import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'

export class DeletePerpendicularLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: PerpendicularLine3,
  ) {}

  execute() {
    this.scene.removePerpendicularLine(this.line.id)
    this.scene.selection.perpendicularLines.delete(this.line.id)
  }

  undo() {
    this.scene.addPerpendicularLine(this.line)
    this.scene.addPerpendicularLineConstraint(
      new PerpendicularLineConstraint(this.scene, this.line.id, this.line.target),
    )
  }
}
