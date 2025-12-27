// src/core/constraints/DistanceConstraint.ts
import { Point3 } from '../geometry/Point3'
import { Vec3 } from '../geometry/Vec3'

export class DistanceConstraint {
  p1: Point3
  p2: Point3
  distance: number

  constructor(p1: Point3, p2: Point3, distance: number) {
    this.p1 = p1
    this.p2 = p2
    this.distance = distance
  }

  solve() {
    const dx = this.p2.position.x - this.p1.position.x
    const dy = this.p2.position.y - this.p1.position.y
    const dz = this.p2.position.z - this.p1.position.z

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (len === 0) return

    const scale = this.distance / len

    this.p2.setPosition({
      x: this.p1.position.x + dx * scale,
      y: this.p1.position.y + dy * scale,
      z: this.p1.position.z + dz * scale,
    } as Vec3)
  }
}
