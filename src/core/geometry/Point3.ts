import { Vec3 } from './Vec3'

export type ConstrainedToRef = {
  type:
    | 'line'
    | 'straightLine'
    | 'ray'
    | 'vector'
    | 'circle'
    | 'face'
    | 'sphere'
    | 'cone'
    | 'coneBase'
    | 'cylinder'
    | 'cylinderBottom'
    | 'cylinderTop'
    | 'perpendicularLine'
    | 'parallelLine'
    | 'xAxis'
    | 'yAxis'
    | 'zAxis'
  id: string
}

export class Point3 {
  private static readonly POSITION_EPSILON = 1e-8
  // Data-layer default label offset. Renderer adds POINT_LABEL_OFFSET_X/Y on
  // top of this, so the rendered visual offset is (3 + 3) * zoomFactor
  // (~6.6 px on a typical canvas). This keeps the label clearly offset to
  // the upper-right of the point. The clamp range in Interaction.ts is wide
  // enough to accommodate this default and still produce a drag range that
  // is symmetric about the geometry.
  static readonly DEFAULT_LABEL_OFFSET_X = 5
  static readonly DEFAULT_LABEL_OFFSET_Y = 5

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
  regularPolygonId: string | null
  regularPolygonRole: 'owner' | 'dependent' | null
  sphereId: string | null
  sphereRole: 'center' | 'radius' | null
  coneId: string | null
  coneRole: 'baseCenter' | 'apex' | null
  cylinderId: string | null
  cylinderRole: 'bottomCenter' | 'topCenter' | null
  constrainedTo: ConstrainedToRef | null = null
  onPositionChanged: ((point: Point3, previous: Vec3, next: Vec3) => void) | null = null

  get isConstrainedPoint(): boolean {
    return this.constrainedTo !== null
  }

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
    this.regularPolygonId = null
    this.regularPolygonRole = null
    this.sphereId = null
    this.sphereRole = null
    this.coneId = null
    this.coneRole = null
    this.cylinderId = null
    this.cylinderRole = null
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

  /**
   * 强制设置位置，绕过 locked 检查，但仍触发 onPositionChanged 回调。
   * 用于快照恢复等需要强制更新位置的场景。
   */
  forceSetPosition(v: Vec3) {
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
