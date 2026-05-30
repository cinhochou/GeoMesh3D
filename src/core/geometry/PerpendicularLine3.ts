import { Point3 } from './Point3'
import { Vec3 } from './Vec3'
import type { Scene } from '../scene/Scene'

export type PerpendicularLineTargetType = 'line' | 'straightLine' | 'ray' | 'vector' | 'perpendicularLine' | 'parallelLine' | 'face' | 'coneBase' | 'cylinderBottom' | 'cylinderTop'

export type PerpendicularLineTargetRef = {
  type: PerpendicularLineTargetType
  id: string
}

export class PerpendicularLine3 {
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
  target: PerpendicularLineTargetRef

  constructor(
    id: string,
    name: string,
    p1: Point3,
    p2: Point3,
    target: PerpendicularLineTargetRef,
    nameVisible: boolean = false,
    visible: boolean = true,
    displayLength: number = PerpendicularLine3.DEFAULT_DISPLAY_LENGTH,
    userLocked: boolean = false,
    labelOffsetX: number = PerpendicularLine3.DEFAULT_LABEL_OFFSET_X,
    labelOffsetY: number = PerpendicularLine3.DEFAULT_LABEL_OFFSET_Y,
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
    this.displayLength = PerpendicularLine3.normalizeDisplayLength(displayLength)
    this.target = target
  }

  static normalizeDisplayLength(length: number) {
    if (!Number.isFinite(length)) return PerpendicularLine3.DEFAULT_DISPLAY_LENGTH
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
    if (this.target.type === 'line') {
      const line = scene.lines.get(this.target.id)
      if (line) {
        const dx = line.p2.position.x - line.p1.position.x
        const dy = line.p2.position.y - line.p1.position.y
        const dz = line.p2.position.z - line.p1.position.z
        const len = Math.hypot(dx, dy, dz)
        if (len > 0) {
          const nx = -dy / len
          const ny = dx / len
          const nz = 0
          const nLen = Math.hypot(nx, ny, nz)
          if (nLen > 0) return new Vec3(nx / nLen, ny / nLen, nz / nLen)
          return new Vec3(0, 0, 1)
        }
      }
    } else if (this.target.type === 'straightLine') {
      const sl = scene.straightLines.get(this.target.id)
      if (sl) {
        const dx = sl.p2.position.x - sl.p1.position.x
        const dy = sl.p2.position.y - sl.p1.position.y
        const dz = sl.p2.position.z - sl.p1.position.z
        const len = Math.hypot(dx, dy, dz)
        if (len > 0) {
          const nx = -dy / len
          const ny = dx / len
          const nz = 0
          const nLen = Math.hypot(nx, ny, nz)
          if (nLen > 0) return new Vec3(nx / nLen, ny / nLen, nz / nLen)
          return new Vec3(0, 0, 1)
        }
      }
    } else if (this.target.type === 'ray') {
      const ray = scene.rays.get(this.target.id)
      if (ray) {
        const dx = ray.p2.position.x - ray.p1.position.x
        const dy = ray.p2.position.y - ray.p1.position.y
        const dz = ray.p2.position.z - ray.p1.position.z
        const len = Math.hypot(dx, dy, dz)
        if (len > 0) {
          const nx = -dy / len
          const ny = dx / len
          const nz = 0
          const nLen = Math.hypot(nx, ny, nz)
          if (nLen > 0) return new Vec3(nx / nLen, ny / nLen, nz / nLen)
          return new Vec3(0, 0, 1)
        }
      }
    } else if (this.target.type === 'vector') {
      const vec = scene.vectors.get(this.target.id)
      if (vec) {
        const dx = vec.p2.position.x - vec.p1.position.x
        const dy = vec.p2.position.y - vec.p1.position.y
        const dz = vec.p2.position.z - vec.p1.position.z
        const len = Math.hypot(dx, dy, dz)
        if (len > 0) {
          const nx = -dy / len
          const ny = dx / len
          const nz = 0
          const nLen = Math.hypot(nx, ny, nz)
          if (nLen > 0) return new Vec3(nx / nLen, ny / nLen, nz / nLen)
          return new Vec3(0, 0, 1)
        }
      }
    } else if (this.target.type === 'perpendicularLine') {
      const pl = scene.perpendicularLines.get(this.target.id)
      if (pl) {
        const dx = pl.p2.position.x - pl.p1.position.x
        const dy = pl.p2.position.y - pl.p1.position.y
        const dz = pl.p2.position.z - pl.p1.position.z
        const len = Math.hypot(dx, dy, dz)
        if (len > 0) {
          const nx = -dy / len
          const ny = dx / len
          const nz = 0
          const nLen = Math.hypot(nx, ny, nz)
          if (nLen > 0) return new Vec3(nx / nLen, ny / nLen, nz / nLen)
          return new Vec3(0, 0, 1)
        }
      }
    } else if (this.target.type === 'parallelLine') {
      const pll = scene.parallelLines.get(this.target.id)
      if (pll) {
        const dx = pll.p2.position.x - pll.p1.position.x
        const dy = pll.p2.position.y - pll.p1.position.y
        const dz = pll.p2.position.z - pll.p1.position.z
        const len = Math.hypot(dx, dy, dz)
        if (len > 0) {
          const nx = -dy / len
          const ny = dx / len
          const nz = 0
          const nLen = Math.hypot(nx, ny, nz)
          if (nLen > 0) return new Vec3(nx / nLen, ny / nLen, nz / nLen)
          return new Vec3(0, 0, 1)
        }
      }
    } else if (this.target.type === 'face') {
      const face = scene.faces.get(this.target.id)
      if (face) {
        const boundaryPoints = face.getBoundaryPoints(scene.points)
        if (boundaryPoints.length >= 3) {
          const p0 = boundaryPoints[0]!.position
          const p1 = boundaryPoints[1]!.position
          const p2 = boundaryPoints[2]!.position
          const v1 = new Vec3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z)
          const v2 = new Vec3(p2.x - p0.x, p2.y - p0.y, p2.z - p0.z)
          const nx = v1.y * v2.z - v1.z * v2.y
          const ny = v1.z * v2.x - v1.x * v2.z
          const nz = v1.x * v2.y - v1.y * v2.x
          const len = Math.hypot(nx, ny, nz)
          if (len > 0) return new Vec3(nx / len, ny / len, nz / len)
        }
      }
    } else if (this.target.type === 'coneBase') {
      const cone = scene.cones.get(this.target.id)
      if (cone) {
        const frame = cone.getFrame()
        if (frame) {
          const dx = frame.apex.x - frame.center.x
          const dy = frame.apex.y - frame.center.y
          const dz = frame.apex.z - frame.center.z
          const len = Math.hypot(dx, dy, dz)
          if (len > 0) return new Vec3(dx / len, dy / len, dz / len)
        }
      }
    } else if (this.target.type === 'cylinderBottom' || this.target.type === 'cylinderTop') {
      const cylinder = scene.cylinders.get(this.target.id)
      if (cylinder) {
        const frame = cylinder.getFrame()
        if (frame) {
          const dx = frame.topCenter.x - frame.bottomCenter.x
          const dy = frame.topCenter.y - frame.bottomCenter.y
          const dz = frame.topCenter.z - frame.bottomCenter.z
          const len = Math.hypot(dx, dy, dz)
          if (len > 0) return new Vec3(dx / len, dy / len, dz / len)
        }
      }
    }
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
    const halfLength = PerpendicularLine3.normalizeDisplayLength(this.displayLength) / 2
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