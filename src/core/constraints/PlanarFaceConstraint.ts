import { computePlaneBasis, polygonArea2D, projectPoint2D, projectPointToPlane, signedDistanceToPlane, PLANAR_EPSILON } from '../geometry/PlanarUtils'
import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'

const toWorldPoint = (plane: NonNullable<ReturnType<typeof computePlaneBasis>>, x: number, y: number) =>
  new Vec3(
    plane.origin.x + plane.uAxis.x * x + plane.vAxis.x * y,
    plane.origin.y + plane.uAxis.y * x + plane.vAxis.y * y,
    plane.origin.z + plane.uAxis.z * x + plane.vAxis.z * y,
  )

export class PlanarFaceConstraint {
  constructor(
    private scene: Scene,
    public readonly faceId: string,
  ) {}

  solve() {
    const face = this.scene.faces.get(this.faceId)
    if (!face) return

    const supportPoints = face.getSupportPoints(this.scene.points)
    const plane =
      computePlaneBasis(supportPoints.map((point) => point.position)) ??
      computePlaneBasis(face.getBoundaryPoints(this.scene.points).map((point) => point.position))
    if (!plane) return

    face
      .getMemberPoints(this.scene.points)
      .filter((point): boolean => !face.supportPointIds.includes(point.id))
      .forEach((point) => {
        if (point.locked || point.userLocked) return
        if (Math.abs(signedDistanceToPlane(point.position, plane)) <= PLANAR_EPSILON) return
        point.setPosition(projectPointToPlane(point.position, plane))
      })

    if (!face.areaLocked || face.lockedArea <= PLANAR_EPSILON) return

    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    if (boundaryPoints.length < 3) return
    const projected = boundaryPoints.map((point) => projectPoint2D(point.position, plane))
    const currentArea = polygonArea2D(projected)
    if (currentArea <= PLANAR_EPSILON) return

    const lockedBoundaryIds = new Set(
      boundaryPoints
        .filter((point) => point.locked || point.userLocked)
        .map((point) => point.id),
    )
    const movableProjected = new Map(
      boundaryPoints
        .filter((point) => !lockedBoundaryIds.has(point.id))
        .map((point, index) => [point.id, projected[boundaryPoints.indexOf(point)]!]),
    )
    if (movableProjected.size === 0) return

    const centroid2D = projected.reduce(
      (acc, point) => ({ x: acc.x + point.x / projected.length, y: acc.y + point.y / projected.length }),
      { x: 0, y: 0 },
    )

    const computeAreaForScale = (scale: number) =>
      polygonArea2D(
        boundaryPoints.map((point, index) => {
          const current = projected[index]!
          if (!movableProjected.has(point.id)) return current
          return {
            x: centroid2D.x + (current.x - centroid2D.x) * scale,
            y: centroid2D.y + (current.y - centroid2D.y) * scale,
          }
        }),
      )

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
    face.getMemberPoints(this.scene.points).forEach((point) => {
      if (point.locked || point.userLocked) return
      const current = projectPoint2D(point.position, plane)
      point.setPosition(
        toWorldPoint(
          plane,
          centroid2D.x + (current.x - centroid2D.x) * scale,
          centroid2D.y + (current.y - centroid2D.y) * scale,
        ),
      )
    })
  }
}
