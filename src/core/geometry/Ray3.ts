import { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export class Ray3 {
  static readonly DEFAULT_DISPLAY_LENGTH = 20
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
    displayLength: number = Ray3.DEFAULT_DISPLAY_LENGTH,
    userLocked: boolean = false,
    labelOffsetX: number = Ray3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = Ray3.DEFAULT_LABEL_OFFSET_Y,
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
    this.displayLength = Ray3.normalizeDisplayLength(displayLength)
  }

  static normalizeDisplayLength(length: number) {
    if (!Number.isFinite(length)) return Ray3.DEFAULT_DISPLAY_LENGTH
    return Math.max(1, length)
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
    const length = Math.hypot(direction.x, direction.y, direction.z)
    if (length === 0) return new Vec3(1, 0, 0)

    return new Vec3(direction.x / length, direction.y / length, direction.z / length)
  }

  getDisplayEndPoint() {
    const direction = this.getNormalizedDirectionVector()
    const length = Ray3.normalizeDisplayLength(this.displayLength)
    return new Vec3(
      this.p1.position.x + direction.x * length,
      this.p1.position.y + direction.y * length,
      this.p1.position.z + direction.z * length,
    )
  }
}
