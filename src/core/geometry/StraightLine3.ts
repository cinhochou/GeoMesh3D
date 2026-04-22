import { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export class StraightLine3 {
  static readonly DEFAULT_DISPLAY_LENGTH = 30
  static readonly DEFAULT_LABEL_OFFSET_X = 0
  static readonly DEFAULT_LABEL_OFFSET_Y = 3

  id: string
  name: string
  nameVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1: Point3
  p2: Point3
  displayLength: number

  constructor(
    id: string,
    name: string,
    p1: Point3,
    p2: Point3,
    nameVisible: boolean = false,
    visible: boolean = true,
    displayLength: number = StraightLine3.DEFAULT_DISPLAY_LENGTH,
    userLocked: boolean = false,
    labelOffsetX: number = StraightLine3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = StraightLine3.DEFAULT_LABEL_OFFSET_Y,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.labelOffsetX = labelOffsetX
    this.labelOffsetY = labelOffsetY
    this.visible = visible
    this.userLocked = userLocked
    this.p1 = p1
    this.p2 = p2
    this.displayLength = StraightLine3.normalizeDisplayLength(displayLength)
  }

  static normalizeDisplayLength(length: number) {
    if (!Number.isFinite(length)) return StraightLine3.DEFAULT_DISPLAY_LENGTH
    return Math.max(2, length)
  }

  getDirectionVector() {
    return new Vec3(
      this.p2.position.x - this.p1.position.x,
      this.p2.position.y - this.p1.position.y,
      this.p2.position.z - this.p1.position.z,
    )
  }

  getDirectionLength() {
    const direction = this.getDirectionVector()
    return Math.hypot(direction.x, direction.y, direction.z)
  }

  getNormalizedDirectionVector() {
    const direction = this.getDirectionVector()
    const length = this.getDirectionLength()
    if (length === 0) return new Vec3(1, 0, 0)

    return new Vec3(direction.x / length, direction.y / length, direction.z / length)
  }

  getMidPoint() {
    return new Vec3(
      (this.p1.position.x + this.p2.position.x) / 2,
      (this.p1.position.y + this.p2.position.y) / 2,
      (this.p1.position.z + this.p2.position.z) / 2,
    )
  }

  getDisplayPoints() {
    const mid = this.getMidPoint()
    const direction = this.getNormalizedDirectionVector()
    const halfLength = StraightLine3.normalizeDisplayLength(this.displayLength) / 2

    return {
      start: new Vec3(
        mid.x - direction.x * halfLength,
        mid.y - direction.y * halfLength,
        mid.z - direction.z * halfLength,
      ),
      end: new Vec3(
        mid.x + direction.x * halfLength,
        mid.y + direction.y * halfLength,
        mid.z + direction.z * halfLength,
      ),
    }
  }
}
