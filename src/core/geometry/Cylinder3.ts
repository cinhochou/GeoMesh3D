import { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export type CylinderType = 'twoPoint' | 'normalCircle'

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

export type CylinderFrame = {
  center: Vec3
  radius: number
  height: number
  normal: Vec3
  uAxis: Vec3
  vAxis: Vec3
  bottomCenter: Vec3
  topCenter: Vec3
}

export class Cylinder3 {
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
  bottomCenterPoint: Point3
  topCenterPoint: Point3
  radiusValue: number
  cylinderType: CylinderType
  normalCircleId: string | null
  topNormalCircleId: string | null

  constructor(
    id: string,
    name: string,
    bottomCenterPoint: Point3,
    topCenterPoint: Point3,
    cylinderType: CylinderType = 'twoPoint',
    nameVisible: boolean = false,
    visible: boolean = true,
    userLocked: boolean = false,
    labelOffsetX: number = Cylinder3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = Cylinder3.DEFAULT_LABEL_OFFSET_Y,
    valueVisible: boolean = false,
    radiusValue: number = 1,
    normalCircleId: string | null = null,
    topNormalCircleId: string | null = null,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.valueVisible = valueVisible
    this.labelOffsetX = labelOffsetX
    this.labelOffsetY = labelOffsetY
    this.visible = visible
    this.userLocked = userLocked
    this.bottomCenterPoint = bottomCenterPoint
    this.topCenterPoint = topCenterPoint
    this.cylinderType = cylinderType
    this.radiusValue = radiusValue
    this.normalCircleId = normalCircleId
    this.topNormalCircleId = topNormalCircleId
  }

  getFrame(): CylinderFrame | null {
    const bottomCenter = this.bottomCenterPoint.position
    const topCenter = this.topCenterPoint.position

    const axis = sub(topCenter, bottomCenter)
    const height = length(axis)
    if (height <= Cylinder3.HEIGHT_EPSILON) return null

    const normal = normalize(axis)
    if (!normal) return null

    const radius = this.radiusValue
    if (radius <= Cylinder3.RADIUS_EPSILON) return null

    const center = new Vec3(
      (bottomCenter.x + topCenter.x) / 2,
      (bottomCenter.y + topCenter.y) / 2,
      (bottomCenter.z + topCenter.z) / 2,
    )

    const fallbackAxis =
      Math.abs(normal.y) < 1 - 1e-6
        ? new Vec3(0, 1, 0)
        : new Vec3(1, 0, 0)
    const uAxisRaw = cross(normal, fallbackAxis)
    const uAxis = normalize(uAxisRaw)
    if (!uAxis) return null
    const vAxis = normalize(cross(normal, uAxis))
    if (!vAxis) return null

    return { center, radius, height, normal, uAxis, vAxis, bottomCenter, topCenter }
  }

  getRadius(): number {
    return this.radiusValue
  }

  getHeight(): number {
    const b = this.bottomCenterPoint.position
    const t = this.topCenterPoint.position
    return Math.hypot(t.x - b.x, t.y - b.y, t.z - b.z)
  }

  getLateralArea(): number {
    const radius = this.getRadius()
    const height = this.getHeight()
    return 2 * Math.PI * radius * height
  }

  getBottomArea(): number {
    const radius = this.getRadius()
    return Math.PI * radius * radius
  }

  getTopArea(): number {
    const radius = this.getRadius()
    return Math.PI * radius * radius
  }

  getSurfaceArea(): number {
    return this.getLateralArea() + this.getBottomArea() + this.getTopArea()
  }

  getVolume(): number {
    const radius = this.getRadius()
    const height = this.getHeight()
    return Math.PI * radius * radius * height
  }

  isValid(): boolean {
    return this.getRadius() > Cylinder3.RADIUS_EPSILON && this.getHeight() > Cylinder3.HEIGHT_EPSILON
  }

  isNormalCircleCylinder(): boolean {
    return this.cylinderType === 'normalCircle'
  }
}
