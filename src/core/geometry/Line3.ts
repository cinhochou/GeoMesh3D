import { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export class Line3 {
  id: string
  name: string
  nameVisible: boolean
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
  p1: Point3
  p2: Point3

  constructor(
    id: string,
    name: string,
    p1: Point3,
    p2: Point3,
    nameVisible: boolean = true,
    visible: boolean = true,
    lengthLocked: boolean = false,
    lockedLength?: number,
    userLocked: boolean = false,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.visible = visible
    this.userLocked = userLocked
    this.lengthLocked = lengthLocked
    this.p1 = p1
    this.p2 = p2
    this.lockedLength = Line3.normalizeLockedLength(lockedLength ?? this.getLength())
  }

  static normalizeLockedLength(length: number) {
    if (!Number.isFinite(length)) return 0
    return Math.max(0, length)
  }

  getDirectionVector() {
    return new Vec3(
      this.p2.position.x - this.p1.position.x,
      this.p2.position.y - this.p1.position.y,
      this.p2.position.z - this.p1.position.z,
    )
  }

  getLength() {
    const direction = this.getDirectionVector()
    return Math.hypot(direction.x, direction.y, direction.z)
  }

  getNormalizedDirectionVector() {
    const direction = this.getDirectionVector()
    const length = this.getLength()
    if (length === 0) return new Vec3(1, 0, 0)

    return new Vec3(direction.x / length, direction.y / length, direction.z / length)
  }
}
