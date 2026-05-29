import type { Command } from '../../Command'
import { Cone3 } from '../../../geometry/Cone3'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'

export class DeleteConeCommand implements Command {
  constructor(
    private scene: Scene,
    private cone: Cone3,
    private relatedPerpendicularLines: PerpendicularLine3[] = [],
  ) {}

  execute() {
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.removePerpendicularLine(line.id)
      this.scene.selection.perpendicularLines.delete(line.id)
    })
    this.scene.removeCone(this.cone.id)
    this.cone.baseCenterPoint.coneId = null
    this.cone.baseCenterPoint.coneRole = null
    this.cone.apexPoint.coneId = null
    this.cone.apexPoint.coneRole = null
  }

  undo() {
    this.scene.addCone(this.cone)
    this.cone.baseCenterPoint.coneId = this.cone.id
    this.cone.baseCenterPoint.coneRole = 'baseCenter'
    this.cone.apexPoint.coneId = this.cone.id
    this.cone.apexPoint.coneRole = 'apex'
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.addPerpendicularLine(line)
      this.scene.addPerpendicularLineConstraint(
        new PerpendicularLineConstraint(this.scene, line.id, line.target),
      )
    })
  }
}
