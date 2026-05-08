import { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export type CircleFrame = {
  center: Vec3
  radius: number
  normal: Vec3
  uAxis: Vec3
  vAxis: Vec3
}

export type CircleType = 'threePoint' | 'normal'

export type DirectionType = 'line' | 'straightLine' | 'ray' | 'vector' | 'point'

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3) =>
  new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const scale = (v: Vec3, s: number) => new Vec3(v.x * s, v.y * s, v.z * s)
const add = (a: Vec3, b: Vec3) => new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)
const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const normalize = (v: Vec3) => {
  const len = length(v)
  if (len <= 1e-8) return null
  return scale(v, 1 / len)
}

export class Circle3 {
  static readonly DEFAULT_LABEL_OFFSET_X = 0
  static readonly DEFAULT_LABEL_OFFSET_Y = 3
  static readonly COLLINEAR_EPSILON = 1e-6

  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerVisible: boolean
  p1: Point3
  p2: Point3
  p3: Point3
  circleType: CircleType
  directionType: DirectionType | null
  directionId: string | null
  lockedRadius: number | null

  constructor(
    id: string,
    name: string,
    p1: Point3,
    p2: Point3,
    p3: Point3,
    nameVisible: boolean = false,
    visible: boolean = true,
    userLocked: boolean = false,
    labelOffsetX: number = Circle3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = Circle3.DEFAULT_LABEL_OFFSET_Y,
    valueVisible: boolean = false,
    centerVisible: boolean = true,
    circleType: CircleType = 'threePoint',
    directionType: DirectionType | null = null,
    directionId: string | null = null,
    lockedRadius: number | null = null,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.valueVisible = valueVisible
    this.labelOffsetX = labelOffsetX
    this.labelOffsetY = labelOffsetY
    this.visible = visible
    this.userLocked = userLocked
    this.centerVisible = centerVisible
    this.p1 = p1
    this.p2 = p2
    this.p3 = p3
    this.circleType = circleType
    this.directionType = directionType
    this.directionId = directionId
    this.lockedRadius = lockedRadius
  }

  getFrame(resolvedDirection?: Vec3 | null): CircleFrame | null {
    if (this.circleType === 'normal') {
      return this.getNormalFrame(resolvedDirection)
    }
    return this.getThreePointFrame()
  }

  private getNormalFrame(resolvedDirection?: Vec3 | null): CircleFrame | null {
    const center = this.p1.position
    const radius = this.lockedRadius
    if (radius === null || radius <= 0) return null

    let normalVec: Vec3 | null = resolvedDirection ?? null
    if (!normalVec && this.directionType === 'point') {
      normalVec = new Vec3(0, 1, 0)
    }
    if (!normalVec) return null

    const normal = normalize(normalVec)
    if (!normal) return null

    const fallbackAxis =
      Math.abs(normal.y) < 1 - 1e-6
        ? new Vec3(0, 1, 0)
        : new Vec3(1, 0, 0)
    const uAxisRaw = cross(normal, fallbackAxis)
    const uAxis = normalize(uAxisRaw)
    if (!uAxis) return null
    const vAxis = normalize(cross(normal, uAxis))
    if (!vAxis) return null

    return { center, radius, normal, uAxis, vAxis }
  }

  private getThreePointFrame(): CircleFrame | null {
    const a = this.p1.position
    const b = this.p2.position
    const c = this.p3.position
    const ab = sub(b, a)
    const ac = sub(c, a)
    const normalRaw = cross(ab, ac)
    const normalLengthSq = dot(normalRaw, normalRaw)
    if (normalLengthSq <= Circle3.COLLINEAR_EPSILON) return null

    const abLengthSq = dot(ab, ab)
    const acLengthSq = dot(ac, ac)
    const term1 = scale(cross(normalRaw, ab), acLengthSq)
    const term2 = scale(cross(ac, normalRaw), abLengthSq)
    const center = add(a, scale(add(term1, term2), 1 / (2 * normalLengthSq)))
    const radius = length(sub(center, a))
    const uAxis = normalize(sub(a, center))
    const normal = normalize(normalRaw)
    if (!uAxis || !normal || radius <= Circle3.COLLINEAR_EPSILON) return null
    const vAxis = normalize(cross(normal, uAxis))
    if (!vAxis) return null
    return { center, radius, normal, uAxis, vAxis }
  }

  getRadius(resolvedDirection?: Vec3 | null) {
    return this.getFrame(resolvedDirection)?.radius ?? 0
  }

  getArea(resolvedDirection?: Vec3 | null) {
    const radius = this.getRadius(resolvedDirection)
    return Math.PI * radius * radius
  }

  getCircumference(resolvedDirection?: Vec3 | null) {
    return 2 * Math.PI * this.getRadius(resolvedDirection)
  }

  isValid(resolvedDirection?: Vec3 | null) {
    return Boolean(this.getFrame(resolvedDirection))
  }

  isNormalCircle() {
    return this.circleType === 'normal'
  }
}
