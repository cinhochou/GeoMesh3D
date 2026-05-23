import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'

const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const normalize = (v: Vec3) => {
  const len = length(v)
  if (len <= 1e-8) return null
  return new Vec3(v.x / len, v.y / len, v.z / len)
}

export class CylinderConstraint {
  constructor(
    private scene: Scene,
    public readonly cylinderId: string,
    public readonly bottomCircleId: string,
    public readonly topCircleId: string,
    public name: string = '圆柱1',
    public valueVisible: boolean = false,
  ) {}

  getDependencyPointIds() {
    const cylinder = this.scene.cylinders.get(this.cylinderId)
    if (!cylinder) return []
    return [cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id]
  }

  getAxisDirection(): Vec3 | null {
    const cylinder = this.scene.cylinders.get(this.cylinderId)
    if (!cylinder) return null
    const axis = sub(cylinder.topCenterPoint.position, cylinder.bottomCenterPoint.position)
    return normalize(axis)
  }

  solve() {
    const cylinder = this.scene.cylinders.get(this.cylinderId)
    if (!cylinder) return

    const bottomCircle = this.scene.circles.get(this.bottomCircleId)
    const topCircle = this.scene.circles.get(this.topCircleId)

    if (bottomCircle) {
      bottomCircle.lockedRadius = cylinder.radiusValue
    }
    if (topCircle) {
      topCircle.lockedRadius = cylinder.radiusValue
    }
  }
}
