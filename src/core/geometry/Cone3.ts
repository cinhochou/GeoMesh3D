import { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export type ConeType = 'twoPoint' | 'normalCircle'

const cross = (a: Vec3, b: Vec3) =>
  new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const scale = (v: Vec3, s: number) => new Vec3(v.x * s, v.y * s, v.z * s)
const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const normalize = (v: Vec3) => {
  const len = length(v)
  if (len <= 1e-8) return null
  return scale(v, 1 / len)
}

export type ConeFrame = {
  center: Vec3
  radius: number
  height: number
  normal: Vec3
  uAxis: Vec3
  vAxis: Vec3
  apex: Vec3
}

export class Cone3 {
  static readonly DEFAULT_LABEL_OFFSET_X = 0
  static readonly DEFAULT_LABEL_OFFSET_Y = 3
  static readonly RADIUS_EPSILON = 1e-6
  static readonly HEIGHT_EPSILON = 1e-6

  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  baseCenterPoint: Point3
  apexPoint: Point3
  radiusValue: number
  coneType: ConeType
  normalCircleId: string | null

  constructor(
    id: string,
    name: string,
    baseCenterPoint: Point3,
    apexPoint: Point3,
    coneType: ConeType = 'twoPoint',
    nameVisible: boolean = false,
    visible: boolean = true,
    userLocked: boolean = false,
    labelOffsetX: number = Cone3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = Cone3.DEFAULT_LABEL_OFFSET_Y,
    valueVisible: boolean = false,
    radiusValue: number = 1,
    normalCircleId: string | null = null,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.valueVisible = valueVisible
    this.labelOffsetX = labelOffsetX
    this.labelOffsetY = labelOffsetY
    this.visible = visible
    this.userLocked = userLocked
    this.baseCenterPoint = baseCenterPoint
    this.apexPoint = apexPoint
    this.coneType = coneType
    this.radiusValue = radiusValue
    this.normalCircleId = normalCircleId
  }

  getFrame(): ConeFrame | null {
    const center = this.baseCenterPoint.position
    const apex = this.apexPoint.position

    const axis = sub(apex, center)
    const height = length(axis)
    if (height <= Cone3.HEIGHT_EPSILON) return null

    const normal = normalize(axis)
    if (!normal) return null

    const radius = this.radiusValue
    if (radius <= Cone3.RADIUS_EPSILON) return null

    const fallbackAxis =
      Math.abs(normal.y) < 1 - 1e-6
        ? new Vec3(0, 1, 0)
        : new Vec3(1, 0, 0)
    const uAxisRaw = cross(normal, fallbackAxis)
    const uAxis = normalize(uAxisRaw)
    if (!uAxis) return null
    const vAxis = normalize(cross(normal, uAxis))
    if (!vAxis) return null

    return { center, radius, height, normal, uAxis, vAxis, apex }
  }

  getRadius(): number {
    return this.radiusValue
  }

  getHeight(): number {
    const c = this.baseCenterPoint.position
    const a = this.apexPoint.position
    return Math.hypot(a.x - c.x, a.y - c.y, a.z - c.z)
  }

  getLateralArea(): number {
    const radius = this.getRadius()
    const height = this.getHeight()
    const slantHeight = Math.hypot(radius, height)
    return Math.PI * radius * slantHeight
  }

  getBaseArea(): number {
    const radius = this.getRadius()
    return Math.PI * radius * radius
  }

  getSurfaceArea(): number {
    return this.getLateralArea() + this.getBaseArea()
  }

  getVolume(): number {
    const radius = this.getRadius()
    const height = this.getHeight()
    return (1 / 3) * Math.PI * radius * radius * height
  }

  isValid(): boolean {
    return this.getRadius() > Cone3.RADIUS_EPSILON && this.getHeight() > Cone3.HEIGHT_EPSILON
  }

  isNormalCircleCone(): boolean {
    return this.coneType === 'normalCircle'
  }
}
