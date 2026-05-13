import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

export class DeleteRadiusSphereCommand implements Command {
  constructor(
    private scene: Scene,
    private sphere: Sphere3,
  ) {}

  execute() {
    this.scene.removeSphere(this.sphere.id)
    this.sphere.centerPoint.sphereId = null
    this.sphere.centerPoint.sphereRole = null
  }

  undo() {
    this.scene.addSphere(this.sphere)
    this.sphere.centerPoint.sphereId = this.sphere.id
    this.sphere.centerPoint.sphereRole = 'center'
  }
}
