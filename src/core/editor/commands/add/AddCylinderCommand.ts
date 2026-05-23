import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Circle3 } from '../../../geometry/Circle3'
import { CylinderConstraint } from '../../../constraints/CylinderConstraint'

export class AddCylinderCommand implements Command {
  private constraint: CylinderConstraint | null = null

  constructor(
    private scene: Scene,
    private cylinder: Cylinder3,
    private bottomCircle: Circle3,
    private topCircle: Circle3,
  ) {}

  execute() {
    this.scene.addCylinder(this.cylinder)
    this.cylinder.bottomCenterPoint.cylinderId = this.cylinder.id
    this.cylinder.bottomCenterPoint.cylinderRole = 'bottomCenter'
    this.cylinder.topCenterPoint.cylinderId = this.cylinder.id
    this.cylinder.topCenterPoint.cylinderRole = 'topCenter'
    this.scene.addCircle(this.bottomCircle)
    this.bottomCircle.p1.circleId = this.bottomCircle.id
    this.bottomCircle.p1.circleRole = 'center'
    this.scene.addCircle(this.topCircle)
    this.topCircle.p1.circleId = this.topCircle.id
    this.topCircle.p1.circleRole = 'center'
    this.constraint = new CylinderConstraint(
      this.scene,
      this.cylinder.id,
      this.bottomCircle.id,
      this.topCircle.id,
      this.cylinder.name,
      this.cylinder.valueVisible,
    )
    this.scene.addCylinderConstraint(this.constraint)
  }

  undo() {
    this.scene.circles.delete(this.bottomCircle.id)
    this.scene.selection.circles.delete(this.bottomCircle.id)
    this.bottomCircle.p1.circleId = null
    this.bottomCircle.p1.circleRole = null
    this.scene.circles.delete(this.topCircle.id)
    this.scene.selection.circles.delete(this.topCircle.id)
    this.topCircle.p1.circleId = null
    this.topCircle.p1.circleRole = null
    this.scene.removeCylinder(this.cylinder.id)
    this.cylinder.bottomCenterPoint.cylinderId = null
    this.cylinder.bottomCenterPoint.cylinderRole = null
    this.cylinder.topCenterPoint.cylinderId = null
    this.cylinder.topCenterPoint.cylinderRole = null
  }
}
