import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

export class AddSphereCommand implements Command {
  constructor(
    private scene: Scene,
    private sphere: Sphere3,
  ) {}

  execute() {
    this.scene.addSphere(this.sphere)
    this.sphere.centerPoint.sphereId = this.sphere.id
    this.sphere.centerPoint.sphereRole = 'center'
    if (this.sphere.radiusPoint) {
      this.sphere.radiusPoint.sphereId = this.sphere.id
      this.sphere.radiusPoint.sphereRole = 'radius'
    }
  }

  undo() {
    this.scene.removeSphere(this.sphere.id)
    this.sphere.centerPoint.sphereId = null
    this.sphere.centerPoint.sphereRole = null
    if (this.sphere.radiusPoint) {
      this.sphere.radiusPoint.sphereId = null
      this.sphere.radiusPoint.sphereRole = null
    }
  }
}
