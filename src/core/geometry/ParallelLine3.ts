import { Point3 } from './Point3'
import { Vec3 } from './Vec3'
import type { Scene } from '../scene/Scene'

export type ParallelLineTargetType = 'line' | 'straightLine' | 'ray' | 'vector' | 'perpendicularLine' | 'parallelLine'

export type ParallelLineTargetRef = {
  type: ParallelLineTargetType
  id: string
}

export class ParallelLine3 {
  static readonly DEFAULT_DISPLAY_LENGTH = 30
  static readonly DEFAULT_LABEL_OFFSET_X = 0
  static readonly DEFAULT_LABEL_OFFSET_Y = 3

  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1: Point3
  p2: Point3
  displayLength: number
  target: ParallelLineTargetRef

  constructor(
    id: string,
    name: string,
    p1: Point3,
    p2: Point3,
    target: ParallelLineTargetRef,
    nameVisible: boolean = false,
    visible: boolean = true,
    displayLength: number = ParallelLine3.DEFAULT_DISPLAY_LENGTH,
    userLocked: boolean = false,
    labelOffsetX: number = ParallelLine3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = ParallelLine3.DEFAULT_LABEL_OFFSET_Y,
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
    this.p1 = p1
    this.p2 = p2
    this.displayLength = ParallelLine3.normalizeDisplayLength(displayLength)
    this.target = target
  }

  static normalizeDisplayLength(length: number) {
    if (!Number.isFinite(length)) return ParallelLine3.DEFAULT_DISPLAY_LENGTH
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

  getNormalizedDirectionVector(scene?: Scene) {
    const direction = this.getDirectionVector()
    const length = this.getDirectionLength()
    if (length === 0) {
      if (scene) {
        const fallback = this.computeFallbackDirection(scene)
        if (fallback) return fallback
      }
      return new Vec3(1, 0, 0)
    }
    return new Vec3(direction.x / length, direction.y / length, direction.z / length)
  }

  private computeFallbackDirection(scene: Scene): Vec3 | null {
    const entity = this.getTargetEntity(scene)
    if (!entity) return null
    const dx = entity.p2.position.x - entity.p1.position.x
    const dy = entity.p2.position.y - entity.p1.position.y
    const dz = entity.p2.position.z - entity.p1.position.z
    const len = Math.hypot(dx, dy, dz)
    if (len > 0) return new Vec3(dx / len, dy / len, dz / len)
    return null
  }

  getTargetEntity(scene: Scene): { p1: { position: Vec3 }; p2: { position: Vec3 } } | null {
    if (this.target.type === 'line') return scene.lines.get(this.target.id) ?? null
    if (this.target.type === 'straightLine') return scene.straightLines.get(this.target.id) ?? null
    if (this.target.type === 'ray') return scene.rays.get(this.target.id) ?? null
    if (this.target.type === 'vector') return scene.vectors.get(this.target.id) ?? null
    if (this.target.type === 'perpendicularLine') return scene.perpendicularLines.get(this.target.id) ?? null
    if (this.target.type === 'parallelLine') return scene.parallelLines.get(this.target.id) ?? null
    return null
  }

  getMidPoint() {
    return new Vec3(
      (this.p1.position.x + this.p2.position.x) / 2,
      (this.p1.position.y + this.p2.position.y) / 2,
      (this.p1.position.z + this.p2.position.z) / 2,
    )
  }

  getDisplayPoints(scene?: Scene) {
    const direction = this.getNormalizedDirectionVector(scene)
    const halfLength = ParallelLine3.normalizeDisplayLength(this.displayLength) / 2
    const p1 = this.p1.position

    return {
      start: new Vec3(
        p1.x - direction.x * halfLength,
        p1.y - direction.y * halfLength,
        p1.z - direction.z * halfLength,
      ),
      end: new Vec3(
        p1.x + direction.x * halfLength,
        p1.y + direction.y * halfLength,
        p1.z + direction.z * halfLength,
      ),
    }
  }
}
