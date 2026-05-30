import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLineConstraint } from '../../../constraints/ParallelLineConstraint'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'

export class DeleteParallelLineCommand implements Command {
  constructor(
    private scene: Scene,
    private line: ParallelLine3,
    private relatedPerpendicularLines: PerpendicularLine3[] = [],
    private relatedParallelLines: ParallelLine3[] = [],
  ) {}

  execute() {
    this.relatedPerpendicularLines.forEach((l) => {
      this.scene.removePerpendicularLine(l.id)
      this.scene.selection.perpendicularLines.delete(l.id)
    })
    this.relatedParallelLines.forEach((l) => {
      this.scene.removeParallelLine(l.id)
      this.scene.selection.parallelLines.delete(l.id)
    })
    this.scene.removeParallelLine(this.line.id)
    this.scene.selection.parallelLines.delete(this.line.id)
  }

  undo() {
    this.scene.addParallelLine(this.line)
    this.scene.addParallelLineConstraint(
      new ParallelLineConstraint(this.scene, this.line.id, this.line.target),
    )
    this.relatedPerpendicularLines.forEach((l) => {
      this.scene.addPerpendicularLine(l)
      this.scene.addPerpendicularLineConstraint(
        new PerpendicularLineConstraint(this.scene, l.id, l.target),
      )
    })
    this.relatedParallelLines.forEach((l) => {
      this.scene.addParallelLine(l)
      this.scene.addParallelLineConstraint(
        new ParallelLineConstraint(this.scene, l.id, l.target),
      )
    })
  }
}
