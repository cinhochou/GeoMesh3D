import { Vec3 } from '../geometry/Vec3'
import type { PerpendicularLineTargetRef } from '../geometry/PerpendicularLine3'
import { computePlaneBasis, projectPointToPlane, projectPoint2D, isPointInPolygon2D } from '../geometry/PlanarUtils'
import { Scene } from '../scene/Scene'

export class PerpendicularLineConstraint {
  private static readonly EPSILON = 1e-5
  private static readonly MAX_COORD_ABS = 1e6
  private static readonly MIN_TRANSLATE_LIMIT = 2
  private static readonly MAX_TRANSLATE_LIMIT = 2_000

  private lastComputedFoot: Vec3 | null = null

  constructor(
    private scene: Scene,
    public readonly perpendicularLineId: string,
    public readonly target: PerpendicularLineTargetRef,
  ) {}

  private isSafePosition(v: Vec3) {
    return (
      Number.isFinite(v.x) &&
      Number.isFinite(v.y) &&
      Number.isFinite(v.z) &&
      Math.abs(v.x) <= PerpendicularLineConstraint.MAX_COORD_ABS &&
      Math.abs(v.y) <= PerpendicularLineConstraint.MAX_COORD_ABS &&
      Math.abs(v.z) <= PerpendicularLineConstraint.MAX_COORD_ABS
    )
  }

  private getLength(v: Vec3) {
    return Math.hypot(v.x, v.y, v.z)
  }


  private computeFootOnLine(origin: Vec3, direction: Vec3, pointPosition: Vec3) {
    const directionLenSq = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z
    if (directionLenSq <= PerpendicularLineConstraint.EPSILON ** 2) return null
    const toPoint = new Vec3(
      pointPosition.x - origin.x,
      pointPosition.y - origin.y,
      pointPosition.z - origin.z,
    )
    const t = (toPoint.x * direction.x + toPoint.y * direction.y + toPoint.z * direction.z) / directionLenSq
    return new Vec3(
      origin.x + direction.x * t,
      origin.y + direction.y * t,
      origin.z + direction.z * t,
    )
  }

  private computeFootOnFace(pointPosition: Vec3) {
    const face = this.scene.faces.get(this.target.id)
    if (!face) return null
    const supportPoints = face.getSupportPoints(this.scene.points)
    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    const plane =
      computePlaneBasis(supportPoints.map((p) => p.position)) ??
      computePlaneBasis(boundaryPoints.map((p) => p.position))
    if (!plane) return null
    return projectPointToPlane(pointPosition, plane)
  }

  private computeFootOnConeBase(pointPosition: Vec3) {
    const cone = this.scene.cones.get(this.target.id)
    if (!cone) return null
    const frame = cone.getFrame()
    if (!frame) return null
    return projectPointToPlane(pointPosition, { origin: frame.center, normal: frame.normal, uAxis: frame.uAxis, vAxis: frame.vAxis })
  }

  private computeFootOnCylinderFace(pointPosition: Vec3, which: 'cylinderBottom' | 'cylinderTop') {
    const cylinder = this.scene.cylinders.get(this.target.id)
    if (!cylinder) return null
    const frame = cylinder.getFrame()
    if (!frame) return null
    const planeOrigin = which === 'cylinderBottom' ? frame.bottomCenter : frame.topCenter
    return projectPointToPlane(pointPosition, { origin: planeOrigin, normal: frame.normal, uAxis: frame.uAxis, vAxis: frame.vAxis })
  }

  computeExpectedFoot(): Vec3 | null {
    const line = this.scene.perpendicularLines.get(this.perpendicularLineId)
    if (!line) return null
    const p1 = line.p1
    if (!this.isSafePosition(p1.position)) return null

    if (this.target.type === 'face') {
      return this.computeFootOnFace(p1.position)
    }

    if (this.target.type === 'coneBase') {
      return this.computeFootOnConeBase(p1.position)
    }

    if (this.target.type === 'cylinderBottom' || this.target.type === 'cylinderTop') {
      return this.computeFootOnCylinderFace(p1.position, this.target.type)
    }

    const entity =
      this.target.type === 'line'
        ? this.scene.lines.get(this.target.id)
        : this.target.type === 'straightLine'
          ? this.scene.straightLines.get(this.target.id)
          : this.target.type === 'ray'
            ? this.scene.rays.get(this.target.id)
            : this.scene.vectors.get(this.target.id)
    if (!entity) return null
    const origin = entity.p1.position
    const direction = new Vec3(
      entity.p2.position.x - origin.x,
      entity.p2.position.y - origin.y,
      entity.p2.position.z - origin.z,
    )
    return this.computeFootOnLine(origin, direction, p1.position)
  }

  isEffective() {
    return this.computeExpectedFoot() !== null
  }

  private isFootOnLineSegment(origin: Vec3, direction: Vec3, foot: Vec3): boolean {
    const directionLenSq = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z
    if (directionLenSq <= PerpendicularLineConstraint.EPSILON ** 2) return false
    const t = ((foot.x - origin.x) * direction.x + (foot.y - origin.y) * direction.y + (foot.z - origin.z) * direction.z) / directionLenSq
    return t >= 0 && t <= 1
  }

  private isFootOnFaceArea(foot: Vec3): boolean {
    const face = this.scene.faces.get(this.target.id)
    if (!face) return false
    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    if (boundaryPoints.length < 3) return false
    const plane = computePlaneBasis(boundaryPoints.map((p) => p.position))
    if (!plane) return false
    const projectedFoot = projectPoint2D(foot, plane)
    const boundary2D = boundaryPoints.map((p) => projectPoint2D(p.position, plane))
    return isPointInPolygon2D(projectedFoot.x, projectedFoot.y, boundary2D)
  }

  isFootOnTarget(): boolean {
    const foot = this.computeExpectedFoot()
    if (!foot || !this.isSafePosition(foot)) return false

    if (this.target.type === 'face') {
      return this.isFootOnFaceArea(foot)
    }

    if (this.target.type === 'coneBase') {
      const cone = this.scene.cones.get(this.target.id)
      if (!cone) return false
      const frame = cone.getFrame()
      if (!frame) return false
      const dist = Math.hypot(foot.x - frame.center.x, foot.y - frame.center.y, foot.z - frame.center.z)
      return dist <= frame.radius
    }

    if (this.target.type === 'cylinderBottom' || this.target.type === 'cylinderTop') {
      const cylinder = this.scene.cylinders.get(this.target.id)
      if (!cylinder) return false
      const frame = cylinder.getFrame()
      if (!frame) return false
      const center = this.target.type === 'cylinderBottom' ? frame.bottomCenter : frame.topCenter
      const dist = Math.hypot(foot.x - center.x, foot.y - center.y, foot.z - center.z)
      return dist <= frame.radius
    }

    const entity =
      this.target.type === 'line'
        ? this.scene.lines.get(this.target.id)
        : this.target.type === 'straightLine'
          ? this.scene.straightLines.get(this.target.id)
          : this.target.type === 'ray'
            ? this.scene.rays.get(this.target.id)
            : this.scene.vectors.get(this.target.id)
    if (!entity) return false

    const origin = entity.p1.position
    const direction = new Vec3(
      entity.p2.position.x - origin.x,
      entity.p2.position.y - origin.y,
      entity.p2.position.z - origin.z,
    )
    return this.isFootOnLineSegment(origin, direction, foot)
  }

  getDependencyPointIds() {
    const ids = new Set<string>()
    const line = this.scene.perpendicularLines.get(this.perpendicularLineId)
    if (line) {
      ids.add(line.p1.id)
    }
    if (this.target.type === 'face') {
      const face = this.scene.faces.get(this.target.id)
      if (face) face.memberPointIds.forEach((id) => ids.add(id))
      return ids
    }
    if (this.target.type === 'coneBase') {
      const cone = this.scene.cones.get(this.target.id)
      if (cone) {
        ids.add(cone.baseCenterPoint.id)
        ids.add(cone.apexPoint.id)
      }
      return ids
    }
    if (this.target.type === 'cylinderBottom' || this.target.type === 'cylinderTop') {
      const cylinder = this.scene.cylinders.get(this.target.id)
      if (cylinder) {
        ids.add(cylinder.bottomCenterPoint.id)
        ids.add(cylinder.topCenterPoint.id)
      }
      return ids
    }
    const entity =
      this.target.type === 'line'
        ? this.scene.lines.get(this.target.id)
        : this.target.type === 'straightLine'
          ? this.scene.straightLines.get(this.target.id)
          : this.target.type === 'ray'
            ? this.scene.rays.get(this.target.id)
            : this.scene.vectors.get(this.target.id)
    if (entity) {
      ids.add(entity.p1.id)
      ids.add(entity.p2.id)
    }
    return ids
  }

  getLastComputedFoot(): Vec3 | null {
    return this.lastComputedFoot
  }

  solve() {
    const line = this.scene.perpendicularLines.get(this.perpendicularLineId)
    if (!line) return
    const p2 = line.p2
    if (p2.locked) return
    if (!this.isSafePosition(line.p1.position)) return

    const expected = this.computeExpectedFoot()
    this.lastComputedFoot = expected
    if (!expected || !this.isSafePosition(expected)) return

    const delta = new Vec3(
      expected.x - p2.position.x,
      expected.y - p2.position.y,
      expected.z - p2.position.z,
    )
    const deltaLen = this.getLength(delta)
    if (deltaLen <= PerpendicularLineConstraint.EPSILON) return
    p2.setPosition(expected)
  }
}