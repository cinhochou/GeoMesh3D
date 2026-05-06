import { Vec3 } from './Vec3'

export class Point3 {
  private static readonly POSITION_EPSILON = 1e-8
  static readonly DEFAULT_LABEL_OFFSET_X = 3
  static readonly DEFAULT_LABEL_OFFSET_Y = 3

  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  position: Vec3
  locked: boolean
  userLocked: boolean
  cubeId: string | null
  cubeRole: 'owner' | 'dependent' | null
  circleId: string | null
  circleRole: 'center' | null
  onPositionChanged: ((point: Point3, previous: Vec3, next: Vec3) => void) | null = null

  constructor(
    id: string,
    name: string,
    position = new Vec3(),
    locked: boolean = false,
    nameVisible: boolean = true,
    userLocked: boolean = false,
    labelOffsetX: number = Point3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = Point3.DEFAULT_LABEL_OFFSET_Y,
    valueVisible: boolean = false,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.valueVisible = valueVisible
    this.labelOffsetX = labelOffsetX
    this.labelOffsetY = labelOffsetY
    this.position = position
    this.locked = locked
    this.userLocked = userLocked
    this.cubeId = null
    this.cubeRole = null
    this.circleId = null
    this.circleRole = null
  }

  setPosition(v: Vec3) {
    if (this.locked) return
    const previous = this.position
    const unchanged =
      Math.abs(previous.x - v.x) <= Point3.POSITION_EPSILON &&
      Math.abs(previous.y - v.y) <= Point3.POSITION_EPSILON &&
      Math.abs(previous.z - v.z) <= Point3.POSITION_EPSILON
    if (unchanged) return
    this.position = v
    this.onPositionChanged?.(this, previous, v)
  }
}
