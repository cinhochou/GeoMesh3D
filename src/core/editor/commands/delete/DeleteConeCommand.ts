import type { Command } from '../../Command'
import { Cone3 } from '../../../geometry/Cone3'
import { Scene } from '../../../scene/Scene'

export class DeleteConeCommand implements Command {
  constructor(
    private scene: Scene,
    private cone: Cone3,
  ) {}

  execute() {
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
  }
}
