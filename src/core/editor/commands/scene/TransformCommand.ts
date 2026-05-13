import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'

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

  constructor(
    point: Point3,
    before: Vec3,
    after: Vec3,
    axisHintChanges: AxisHintChange[] = [],
  ) {
    this.point = point
    this.before = before
    this.after = after
    this.axisHintChanges = axisHintChanges
  }

  execute() {
    this.axisHintChanges.forEach(({ setAxisHint, after }) => setAxisHint(after))
    this.point.setPosition(this.after)
  }

  undo() {
    this.axisHintChanges.forEach(({ setAxisHint, before }) => setAxisHint(before))
    this.point.setPosition(this.before)
  }
}
