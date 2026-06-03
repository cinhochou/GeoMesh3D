import { computePlaneBasis, polygonArea2D, PLANAR_EPSILON } from '../geometry/PlanarUtils'
import { Vec3 } from '../geometry/Vec3'
import { Point3 } from '../geometry/Point3'
import { Scene } from '../scene/Scene'

export class PlanarPolygonConstraint {
  constructor(
    private scene: Scene,
    public readonly faceId: string,
  ) {}

  getDependencyPointIds() {
    const face = this.scene.faces.get(this.faceId)
    return face ? face.memberPointIds : []
  }

  solve() {
    const face = this.scene.faces.get(this.faceId)
    if (!face) return

    const supportPoints = face.getSupportPoints(this.scene.points)
    let plane = computePlaneBasis(supportPoints.map((point) => point.position))
    let boundaryPoints: Point3[] | null = null
    if (!plane) {
      boundaryPoints = face.getBoundaryPoints(this.scene.points)
      plane = computePlaneBasis(boundaryPoints.map((point) => point.position))
      if (!plane) return
    }

    const supportSet = face.supportPointIds.length > 8 ? new Set(face.supportPointIds) : null
    const memberPoints = face.getMemberPoints(this.scene.points)
    const normal = plane.normal
    const origin = plane.origin
    for (let i = 0; i < memberPoints.length; i += 1) {
      const point = memberPoints[i]!
      if (supportSet ? supportSet.has(point.id) : face.supportPointIds.includes(point.id)) continue
      if (point.locked || point.userLocked) continue
      const dx = point.position.x - origin.x
      const dy = point.position.y - origin.y
      const dz = point.position.z - origin.z
      const distance = dx * normal.x + dy * normal.y + dz * normal.z
      if (Math.abs(distance) <= PLANAR_EPSILON) continue
      point.setPosition(
        new Vec3(
          point.position.x - normal.x * distance,
          point.position.y - normal.y * distance,
          point.position.z - normal.z * distance,
        ),
      )
    }

    if (!face.areaLocked || face.lockedArea <= PLANAR_EPSILON) return

    if (!boundaryPoints) {
      boundaryPoints = face.getBoundaryPoints(this.scene.points)
    }
    if (boundaryPoints.length < 3) return
    const uAxis = plane.uAxis
    const vAxis = plane.vAxis
    const projected: Array<{ x: number; y: number; id: string }> = new Array(boundaryPoints.length)
    for (let i = 0; i < boundaryPoints.length; i += 1) {
      const p = boundaryPoints[i]!
      const dx = p.position.x - origin.x
      const dy = p.position.y - origin.y
      const dz = p.position.z - origin.z
      projected[i] = {
        id: p.id,
        x: dx * uAxis.x + dy * uAxis.y + dz * uAxis.z,
        y: dx * vAxis.x + dy * vAxis.y + dz * vAxis.z,
      }
    }
    const currentArea = polygonArea2D(projected)
    if (currentArea <= PLANAR_EPSILON) return

    const centroid2D = { x: 0, y: 0 }
    for (let i = 0; i < projected.length; i += 1) {
      centroid2D.x += projected[i]!.x / projected.length
      centroid2D.y += projected[i]!.y / projected.length
    }

    const movableFlags = new Uint8Array(boundaryPoints.length)
    let movableCount = 0
    for (let i = 0; i < boundaryPoints.length; i += 1) {
      const p = boundaryPoints[i]!
      if (!p.locked && !p.userLocked) {
        movableFlags[i] = 1
        movableCount += 1
      }
    }
    if (movableCount === 0) return

    const n = projected.length
    const computeAreaForScale = (scale: number) => {
      let area = 0
      for (let i = 0; i < n; i += 1) {
        const cur = projected[i]!
        const nxt = projected[(i + 1) % n]!
        const nxtIdx = (i + 1) % n
        const curX = movableFlags[i] ? centroid2D.x + (cur.x - centroid2D.x) * scale : cur.x
        const curY = movableFlags[i] ? centroid2D.y + (cur.y - centroid2D.y) * scale : cur.y
        const nxtX = movableFlags[nxtIdx] ? centroid2D.x + (nxt.x - centroid2D.x) * scale : nxt.x
        const nxtY = movableFlags[nxtIdx] ? centroid2D.y + (nxt.y - centroid2D.y) * scale : nxt.y
        area += curX * nxtY - nxtX * curY
      }
      return Math.abs(area) * 0.5
    }

    let low = 0
    let high = Math.max(1, Math.sqrt(face.lockedArea / currentArea) * 2)
    while (computeAreaForScale(high) < face.lockedArea && high < 1024) {
      high *= 2
    }
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) * 0.5
      if (computeAreaForScale(mid) < face.lockedArea) low = mid
      else high = mid
    }

    const scale = (low + high) * 0.5
    const memberAll = face.getMemberPoints(this.scene.points)
    for (let i = 0; i < memberAll.length; i += 1) {
      const point = memberAll[i]!
      if (point.locked || point.userLocked) continue
      const dx = point.position.x - origin.x
      const dy = point.position.y - origin.y
      const dz = point.position.z - origin.z
      const px = dx * uAxis.x + dy * uAxis.y + dz * uAxis.z
      const py = dx * vAxis.x + dy * vAxis.y + dz * vAxis.z
      point.setPosition(
        new Vec3(
          origin.x + uAxis.x * (centroid2D.x + (px - centroid2D.x) * scale) + vAxis.x * (centroid2D.y + (py - centroid2D.y) * scale),
          origin.y + uAxis.y * (centroid2D.x + (px - centroid2D.x) * scale) + vAxis.y * (centroid2D.y + (py - centroid2D.y) * scale),
          origin.z + uAxis.z * (centroid2D.x + (px - centroid2D.x) * scale) + vAxis.z * (centroid2D.y + (py - centroid2D.y) * scale),
        ),
      )
    }
  }
}
