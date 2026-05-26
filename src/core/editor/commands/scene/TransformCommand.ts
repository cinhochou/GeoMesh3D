import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import type { ParametricData } from '../../../constraints/ObjectConstrainedPointConstraint'
import type { Scene } from '../../../scene/Scene'

type AxisHintChange = {
  setAxisHint: (v: Vec3) => void
  before: Vec3
  after: Vec3
}

export class TransformCommand implements Command {
  private point: Point3
  private before: Vec3
  private after: Vec3
  private axisHintChanges: AxisHintChange[]
  private scene: Scene
  private beforeParametricData: ParametricData | null
  private afterParametricData: ParametricData | null

  constructor(
    point: Point3,
    before: Vec3,
    after: Vec3,
    axisHintChanges: AxisHintChange[] = [],
    scene: Scene,
  ) {
    this.point = point
    this.before = before
    this.after = after
    this.axisHintChanges = axisHintChanges
    this.scene = scene
    const constraint = scene.getObjectConstrainedPointConstraint(point.id)
    if (constraint) {
      const saved = constraint.parametricData
      constraint.computeParametricDataFromPosition(before)
      this.beforeParametricData = constraint.parametricData
        ? JSON.parse(JSON.stringify(constraint.parametricData))
        : null
      constraint.computeParametricDataFromPosition(after)
      this.afterParametricData = constraint.parametricData
        ? JSON.parse(JSON.stringify(constraint.parametricData))
        : null
      constraint.parametricData = saved
    } else {
      this.beforeParametricData = null
      this.afterParametricData = null
    }
  }

  execute() {
    this.axisHintChanges.forEach(({ setAxisHint, after }) => setAxisHint(after))
    this.point.setPosition(this.after)
    const constraint = this.scene.getObjectConstrainedPointConstraint(this.point.id)
    if (constraint && this.afterParametricData) {
      constraint.parametricData = JSON.parse(JSON.stringify(this.afterParametricData))
    }
  }

  undo() {
    this.axisHintChanges.forEach(({ setAxisHint, before }) => setAxisHint(before))
    this.point.setPosition(this.before)
    const constraint = this.scene.getObjectConstrainedPointConstraint(this.point.id)
    if (constraint) {
      constraint.parametricData = this.beforeParametricData
        ? JSON.parse(JSON.stringify(this.beforeParametricData))
        : null
    }
  }
}
