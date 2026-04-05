import { computePlaneBasis, projectPointToPlane, signedDistanceToPlane, PLANAR_EPSILON } from '../geometry/PlanarUtils'
import { Scene } from '../scene/Scene'

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
  }
}
