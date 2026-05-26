import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import type { ParametricData } from '../../../constraints/ObjectConstrainedPointConstraint'
import type { Scene } from '../../../scene/Scene'

type PointTransform = {
  point: Point3
  before: Vec3
  after: Vec3
}

type AxisHintChange = {
  setAxisHint: (v: Vec3) => void
  before: Vec3
  after: Vec3
}

type ParametricSnapshot = {
  pointId: string
  before: ParametricData | null
  after: ParametricData | null
}

export class TransformPointsCommand implements Command {
  private parametricSnapshots: ParametricSnapshot[]

  constructor(
    private transforms: PointTransform[],
    private axisHintChanges: AxisHintChange[] = [],
    private scene: Scene,
  ) {
    this.parametricSnapshots = transforms.map(({ point, before, after }) => {
      const constraint = scene.getObjectConstrainedPointConstraint(point.id)
      if (constraint) {
        const saved = constraint.parametricData
        constraint.computeParametricDataFromPosition(before)
        const beforeData = constraint.parametricData
          ? JSON.parse(JSON.stringify(constraint.parametricData))
          : null
        constraint.computeParametricDataFromPosition(after)
        const afterData = constraint.parametricData
          ? JSON.parse(JSON.stringify(constraint.parametricData))
          : null
        constraint.parametricData = saved
        return { pointId: point.id, before: beforeData, after: afterData }
      }
      return { pointId: point.id, before: null, after: null }
    })
  }

  execute() {
    this.axisHintChanges.forEach(({ setAxisHint, after }) => setAxisHint(after))
    this.transforms.forEach(({ point, after }) => point.setPosition(after))
    this.parametricSnapshots.forEach((snapshot) => {
      const constraint = this.scene.getObjectConstrainedPointConstraint(snapshot.pointId)
      if (constraint && snapshot.after) {
        constraint.parametricData = JSON.parse(JSON.stringify(snapshot.after))
      }
    })
  }

  undo() {
    this.axisHintChanges.forEach(({ setAxisHint, before }) => setAxisHint(before))
    this.transforms.forEach(({ point, before }) => point.setPosition(before))
    this.parametricSnapshots.forEach((snapshot) => {
      const constraint = this.scene.getObjectConstrainedPointConstraint(snapshot.pointId)
      if (constraint) {
        constraint.parametricData = snapshot.before
          ? JSON.parse(JSON.stringify(snapshot.before))
          : null
      }
    })
  }
}
