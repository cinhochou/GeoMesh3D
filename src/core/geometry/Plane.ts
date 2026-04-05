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
    this.boundaryPointIds = ensureCounterClockwise(this.boundaryPointIds, points, plane)
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
