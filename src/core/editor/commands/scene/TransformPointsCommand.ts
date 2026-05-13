import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'

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

export class TransformPointsCommand implements Command {
  constructor(
    private transforms: PointTransform[],
    private axisHintChanges: AxisHintChange[] = [],
  ) {}

  execute() {
    this.axisHintChanges.forEach(({ setAxisHint, after }) => setAxisHint(after))
    this.transforms.forEach(({ point, after }) => point.setPosition(after))
  }

  undo() {
    this.axisHintChanges.forEach(({ setAxisHint, before }) => setAxisHint(before))
    this.transforms.forEach(({ point, before }) => point.setPosition(before))
  }
}
