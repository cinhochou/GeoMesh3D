import { Point3 } from './Point3'

export class Sphere3 {
  static readonly DEFAULT_LABEL_OFFSET_X = 0
  static readonly DEFAULT_LABEL_OFFSET_Y = 3
  static readonly RADIUS_EPSILON = 1e-6

  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerPoint: Point3
  radiusPoint: Point3

  constructor(
    id: string,
    name: string,
    centerPoint: Point3,
    radiusPoint: Point3,
    nameVisible: boolean = false,
    visible: boolean = true,
    userLocked: boolean = false,
    labelOffsetX: number = Sphere3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = Sphere3.DEFAULT_LABEL_OFFSET_Y,
    valueVisible: boolean = false,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.valueVisible = valueVisible
    this.labelOffsetX = labelOffsetX
    this.labelOffsetY = labelOffsetY
    this.visible = visible
    this.userLocked = userLocked
    this.centerPoint = centerPoint
    this.radiusPoint = radiusPoint
  }

  getRadius(): number {
    const c = this.centerPoint.position
    const r = this.radiusPoint.position
    const dx = c.x - r.x
    const dy = c.y - r.y
    const dz = c.z - r.z
    return Math.hypot(dx, dy, dz)
  }

  getArea(): number {
    const radius = this.getRadius()
    return 4 * Math.PI * radius * radius
  }

  getVolume(): number {
    const radius = this.getRadius()
    return (4 / 3) * Math.PI * radius * radius * radius
  }

  isValid(): boolean {
    return this.getRadius() > Sphere3.RADIUS_EPSILON
  }
}
