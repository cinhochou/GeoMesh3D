import type { Command } from './Command'
import { Point3 } from '../geometry/Point3'
import { Vec3 } from '../geometry/Vec3'

export class TransformCommand implements Command {
  private point: Point3
  private before: Vec3
  private after: Vec3

  constructor(point: Point3, before: Vec3, after: Vec3) {
    this.point = point
    this.before = before
    this.after = after
  }

  execute() {
    this.point.setPosition(this.after)
  }

  undo() {
    this.point.setPosition(this.before)
  }
}
