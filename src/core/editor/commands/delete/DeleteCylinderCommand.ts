import type { Command } from '../../Command'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Scene } from '../../../scene/Scene'
import { Circle3 } from '../../../geometry/Circle3'
import { CylinderConstraint } from '../../../constraints/CylinderConstraint'

export class DeleteCylinderCommand implements Command {
  private bottomCircle: Circle3 | null = null
  private topCircle: Circle3 | null = null
  private constraint: CylinderConstraint | null = null

  constructor(
    private scene: Scene,
    private cylinder: Cylinder3,
  ) {}

  execute() {
    if (this.cylinder.normalCircleId) {
      this.bottomCircle = this.scene.circles.get(this.cylinder.normalCircleId) ?? null
      if (this.bottomCircle) {
        this.scene.circles.delete(this.bottomCircle.id)
        this.scene.selection.circles.delete(this.bottomCircle.id)
        this.bottomCircle.p1.circleId = null
        this.bottomCircle.p1.circleRole = null
      }
    }
    if (this.cylinder.topNormalCircleId) {
      this.topCircle = this.scene.circles.get(this.cylinder.topNormalCircleId) ?? null
      if (this.topCircle) {
        this.scene.circles.delete(this.topCircle.id)
        this.scene.selection.circles.delete(this.topCircle.id)
        this.topCircle.p1.circleId = null
        this.topCircle.p1.circleRole = null
      }
    }
    this.constraint = this.scene.cylinderConstraints.get(this.cylinder.id) ?? null
    this.scene.removeCylinder(this.cylinder.id)
    this.cylinder.bottomCenterPoint.cylinderId = null
    this.cylinder.bottomCenterPoint.cylinderRole = null
    this.cylinder.topCenterPoint.cylinderId = null
    this.cylinder.topCenterPoint.cylinderRole = null
  }

  undo() {
    this.scene.addCylinder(this.cylinder)
    this.cylinder.bottomCenterPoint.cylinderId = this.cylinder.id
    this.cylinder.bottomCenterPoint.cylinderRole = 'bottomCenter'
    this.cylinder.topCenterPoint.cylinderId = this.cylinder.id
    this.cylinder.topCenterPoint.cylinderRole = 'topCenter'
    if (this.bottomCircle) {
      this.scene.addCircle(this.bottomCircle)
      this.bottomCircle.p1.circleId = this.bottomCircle.id
      this.bottomCircle.p1.circleRole = 'center'
    }
    if (this.topCircle) {
      this.scene.addCircle(this.topCircle)
      this.topCircle.p1.circleId = this.topCircle.id
      this.topCircle.p1.circleRole = 'center'
    }
    if (this.constraint) {
      this.scene.addCylinderConstraint(this.constraint)
    }
  }
}
