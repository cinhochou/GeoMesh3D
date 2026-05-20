import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Cone3 } from '../../../geometry/Cone3'

export class AddConeCommand implements Command {
  constructor(
    private scene: Scene,
    private cone: Cone3,
  ) {}

  execute() {
    this.scene.addCone(this.cone)
    this.cone.baseCenterPoint.coneId = this.cone.id
    this.cone.baseCenterPoint.coneRole = 'baseCenter'
    this.cone.apexPoint.coneId = this.cone.id
    this.cone.apexPoint.coneRole = 'apex'
  }

  undo() {
    this.scene.removeCone(this.cone.id)
    this.cone.baseCenterPoint.coneId = null
    this.cone.baseCenterPoint.coneRole = null
    this.cone.apexPoint.coneId = null
    this.cone.apexPoint.coneRole = null
  }
}
