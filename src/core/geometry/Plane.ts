import type { Point3 } from './Point3'
import {
  computePlaneBasis,
  computeSupportPointIds,
  ensureCounterClockwise,
  PLANAR_EPSILON,
  polygonArea2D,
  polygonCentroid,
  projectPoint2D,
} from './PlanarUtils'

export class PlanarFace {
  id: string
  name: string
  nameVisible: boolean
  visible: boolean
  userLocked: boolean
  areaLocked: boolean
  lockedArea: number
  edgeLengthLocks: Array<number | null>
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]

  constructor(
    id: string,
    name: string,
    boundaryPointIds: string[],
    memberPointIds: string[] = [],
    boundaryLineIds: string[] = [],
    nameVisible: boolean = true,
    visible: boolean = true,
    userLocked: boolean = false,
    supportPointIds: string[] = [],
    areaLocked: boolean = false,
    lockedArea: number = 0,
    edgeLengthLocks: Array<number | null> = [],
  ) {
    this.id = id
    this.name = name
    this.boundaryPointIds = [...new Set(boundaryPointIds)]
    this.memberPointIds = [...new Set([...this.boundaryPointIds, ...memberPointIds])]
    this.boundaryLineIds = [...new Set(boundaryLineIds)]
    this.nameVisible = nameVisible
    this.visible = visible
    this.userLocked = userLocked
    this.supportPointIds = [...new Set(supportPointIds)]
    this.areaLocked = areaLocked
    this.lockedArea = lockedArea
    this.edgeLengthLocks = [...edgeLengthLocks]
    if (this.edgeLengthLocks.length < this.boundaryPointIds.length) {
      this.edgeLengthLocks = [
        ...this.edgeLengthLocks,
        ...Array.from({ length: this.boundaryPointIds.length - this.edgeLengthLocks.length }, () => null),
      ]
    } else if (this.edgeLengthLocks.length > this.boundaryPointIds.length) {
      this.edgeLengthLocks = this.edgeLengthLocks.slice(0, this.boundaryPointIds.length)
    }
  }

  getBoundaryPoints(points: Map<string, Point3>) {
    return this.boundaryPointIds
      .map((id) => points.get(id))
      .filter((point): point is Point3 => point !== undefined)
  }

  getMemberPoints(points: Map<string, Point3>) {
    return this.memberPointIds
      .map((id) => points.get(id))
      .filter((point): point is Point3 => point !== undefined)
  }

  includesPoint(pointId: string) {
    return this.memberPointIds.includes(pointId)
  }

  getSupportPoints(points: Map<string, Point3>): Point3[] {
    const support = this.supportPointIds
      .map((id) => points.get(id))
      .filter((point): point is Point3 => point !== undefined)
    if (support.length >= 3) return support

    const fallback = computeSupportPointIds(this.getMemberPoints(points))
    if (fallback.length >= 3) {
      this.supportPointIds = fallback
      return this.getSupportPoints(points)
    }

    return []
  }

  normalize(points: Map<string, Point3>) {
    const boundaryPoints = this.getBoundaryPoints(points)
    const plane = computePlaneBasis(boundaryPoints.map((point) => point.position))
    if (!plane) return
    const nextBoundaryIds = ensureCounterClockwise(this.boundaryPointIds, points, plane)
    if (
      nextBoundaryIds.length === this.boundaryPointIds.length &&
      nextBoundaryIds.some((id, index) => id !== this.boundaryPointIds[index])
    ) {
      this.edgeLengthLocks = [...this.edgeLengthLocks].reverse()
    }
    this.boundaryPointIds = nextBoundaryIds
    if (this.edgeLengthLocks.length < this.boundaryPointIds.length) {
      this.edgeLengthLocks = [
        ...this.edgeLengthLocks,
        ...Array.from({ length: this.boundaryPointIds.length - this.edgeLengthLocks.length }, () => null),
      ]
    }
    if (this.supportPointIds.length < 3) {
      this.supportPointIds = computeSupportPointIds(this.getMemberPoints(points))
    }
  }

  getArea(points: Map<string, Point3>) {
    const boundaryPoints = this.getBoundaryPoints(points)
    const plane = computePlaneBasis(boundaryPoints.map((point) => point.position))
    if (!plane) return 0
    return polygonArea2D(boundaryPoints.map((point) => projectPoint2D(point.position, plane)))
  }

  getEdgeLength(points: Map<string, Point3>, edgeIndex: number) {
    const boundaryPoints = this.getBoundaryPoints(points)
    if (boundaryPoints.length < 2) return 0
    const current = boundaryPoints[edgeIndex]
    const next = boundaryPoints[(edgeIndex + 1) % boundaryPoints.length]
    if (!current || !next) return 0
    return Math.hypot(
      next.position.x - current.position.x,
      next.position.y - current.position.y,
      next.position.z - current.position.z,
    )
  }

  getLockedEdgeLength(edgeIndex: number) {
    return this.edgeLengthLocks[edgeIndex] ?? null
  }

  getCentroid(points: Map<string, Point3>) {
    return polygonCentroid(this.getBoundaryPoints(points).map((point) => point.position))
  }

  isGeometryValid(points: Map<string, Point3>) {
    const boundaryPoints = this.getBoundaryPoints(points)
    if (boundaryPoints.length < 3) return false
    const plane = computePlaneBasis(boundaryPoints.map((point) => point.position))
    if (!plane) return false
    return this.getMemberPoints(points).every(
      (point) => Math.abs(projectPoint2D(point.position, plane).x) < Number.POSITIVE_INFINITY + PLANAR_EPSILON,
    )
  }
}
