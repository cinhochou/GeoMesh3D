import {
  computeIntersectionPoint,
  type IntersectionTargetRef,
} from '../geometry/IntersectionPoint3'
import { computePlaneBasis, projectPointToPlane } from '../geometry/PlanarUtils'
import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'

export class IntersectionPointConstraint {
  private static readonly EPSILON = 1e-5
  private static readonly MAX_COORD_ABS = 1e6
  private static readonly MIN_TRANSLATE_LIMIT = 2
  private static readonly MAX_TRANSLATE_LIMIT = 2_000

  constructor(
    private scene: Scene,
    public readonly pointId: string,
    public readonly sourceA: IntersectionTargetRef,
    public readonly sourceB: IntersectionTargetRef,
  ) {}

  private getError(point: Vec3, expected: Vec3) {
    return new Vec3(point.x - expected.x, point.y - expected.y, point.z - expected.z)
  }

  private getLength(v: Vec3) {
    return Math.hypot(v.x, v.y, v.z)
  }

  private isFiniteVec(v: Vec3) {
    return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
  }

  private isSafePosition(v: Vec3) {
    return (
      this.isFiniteVec(v) &&
      Math.abs(v.x) <= IntersectionPointConstraint.MAX_COORD_ABS &&
      Math.abs(v.y) <= IntersectionPointConstraint.MAX_COORD_ABS &&
      Math.abs(v.z) <= IntersectionPointConstraint.MAX_COORD_ABS
    )
  }

  private collectDrivenPointIds() {
    const ids = new Set<string>()
    const appendFromTarget = (target: IntersectionTargetRef) => {
      if (target.type === 'line') {
        const line = this.scene.lines.get(target.id)
        if (!line) return
        ids.add(line.p1.id)
        ids.add(line.p2.id)
        return
      }
      if (target.type === 'straightLine') {
        const line = this.scene.straightLines.get(target.id)
        if (!line) return
        ids.add(line.p1.id)
        ids.add(line.p2.id)
        return
      }
      if (target.type === 'ray') {
        const ray = this.scene.rays.get(target.id)
        if (!ray) return
        ids.add(ray.p1.id)
        ids.add(ray.p2.id)
        return
      }
      if (target.type === 'parallelLine') {
        const line = this.scene.parallelLines.get(target.id)
        if (!line) return
        ids.add(line.p1.id)
        ids.add(line.p2.id)
        return
      }
      if (target.type === 'perpendicularLine') {
        const line = this.scene.perpendicularLines.get(target.id)
        if (!line) return
        ids.add(line.p1.id)
        ids.add(line.p2.id)
        return
      }
      const face = this.scene.faces.get(target.id)
      if (!face) return
      face.memberPointIds.forEach((id) => ids.add(id))
    }

    appendFromTarget(this.sourceA)
    appendFromTarget(this.sourceB)
    return ids
  }

  getDependencyPointIds() {
    return [this.pointId, ...this.collectDrivenPointIds()]
  }

  private collectPointIdsFromTarget(target: IntersectionTargetRef) {
    const ids = new Set<string>()
    if (target.type === 'line') {
      const line = this.scene.lines.get(target.id)
      if (!line) return ids
      ids.add(line.p1.id)
      ids.add(line.p2.id)
      return ids
    }
    if (target.type === 'straightLine') {
      const line = this.scene.straightLines.get(target.id)
      if (!line) return ids
      ids.add(line.p1.id)
      ids.add(line.p2.id)
      return ids
    }
    if (target.type === 'ray') {
      const ray = this.scene.rays.get(target.id)
      if (!ray) return ids
      ids.add(ray.p1.id)
      ids.add(ray.p2.id)
      return ids
    }
    if (target.type === 'parallelLine') {
      const line = this.scene.parallelLines.get(target.id)
      if (!line) return ids
      ids.add(line.p1.id)
      ids.add(line.p2.id)
      return ids
    }
    if (target.type === 'perpendicularLine') {
      const line = this.scene.perpendicularLines.get(target.id)
      if (!line) return ids
      ids.add(line.p1.id)
      ids.add(line.p2.id)
      return ids
    }
    const face = this.scene.faces.get(target.id)
    if (!face) return ids
    face.memberPointIds.forEach((id) => ids.add(id))
    return ids
  }

  private getScaleHint() {
    const ids = this.collectDrivenPointIds()
    ids.add(this.pointId)

    const points = [...ids]
      .map((id) => this.scene.points.get(id))
      .filter((point): point is NonNullable<typeof point> => point !== undefined)
      .map((point) => point.position)
      .filter((position) => this.isSafePosition(position))

    if (points.length === 0) return 1

    let minX = points[0]!.x
    let minY = points[0]!.y
    let minZ = points[0]!.z
    let maxX = minX
    let maxY = minY
    let maxZ = minZ

    points.forEach((position) => {
      minX = Math.min(minX, position.x)
      minY = Math.min(minY, position.y)
      minZ = Math.min(minZ, position.z)
      maxX = Math.max(maxX, position.x)
      maxY = Math.max(maxY, position.y)
      maxZ = Math.max(maxZ, position.z)
    })

    return Math.max(Math.hypot(maxX - minX, maxY - minY, maxZ - minZ), 1)
  }

  private getTranslateLimit(multiplier: number) {
    const limit = this.getScaleHint() * multiplier
    return Math.min(
      Math.max(limit, IntersectionPointConstraint.MIN_TRANSLATE_LIMIT),
      IntersectionPointConstraint.MAX_TRANSLATE_LIMIT,
    )
  }

  private translateTarget(target: IntersectionTargetRef, delta: Vec3, limit: number) {
    const deltaLength = this.getLength(delta)
    if (
      !this.isFiniteVec(delta) ||
      !Number.isFinite(deltaLength) ||
      deltaLength <= IntersectionPointConstraint.EPSILON ||
      deltaLength > limit
    ) {
      return
    }

    this.collectPointIdsFromTarget(target).forEach((id) => {
      const point = this.scene.points.get(id)
      if (!point || point.locked || point.userLocked || point.id === this.pointId) return
      const nextPosition = new Vec3(
        point.position.x + delta.x,
        point.position.y + delta.y,
        point.position.z + delta.z,
      )
      if (!this.isSafePosition(nextPosition)) return
      point.setPosition(nextPosition)
    })
  }

  private isPointBeingDragged() {
    return this.scene.activeDraggedPointIds.has(this.pointId)
  }

  private isTargetBeingDragged(target: IntersectionTargetRef) {
    return [...this.collectPointIdsFromTarget(target)].some((id) =>
      this.scene.activeDraggedPointIds.has(id),
    )
  }

  private getTargetCorrection(target: IntersectionTargetRef, pointPosition: Vec3) {
    if (target.type === 'line' || target.type === 'straightLine' || target.type === 'ray' || target.type === 'parallelLine' || target.type === 'perpendicularLine') {
      const entity =
        target.type === 'line'
          ? this.scene.lines.get(target.id)
          : target.type === 'straightLine'
            ? this.scene.straightLines.get(target.id)
            : target.type === 'ray'
              ? this.scene.rays.get(target.id)
              : target.type === 'parallelLine'
                ? this.scene.parallelLines.get(target.id)
                : this.scene.perpendicularLines.get(target.id)
      if (!entity) return null

      const origin = entity.p1.position
      const direction = new Vec3(
        entity.p2.position.x - origin.x,
        entity.p2.position.y - origin.y,
        entity.p2.position.z - origin.z,
      )
      const directionLengthSq =
        direction.x * direction.x + direction.y * direction.y + direction.z * direction.z
      if (directionLengthSq <= IntersectionPointConstraint.EPSILON ** 2) return null

      const toPoint = new Vec3(
        pointPosition.x - origin.x,
        pointPosition.y - origin.y,
        pointPosition.z - origin.z,
      )
      const t =
        (toPoint.x * direction.x + toPoint.y * direction.y + toPoint.z * direction.z) /
        directionLengthSq
      const closest = new Vec3(
        origin.x + direction.x * t,
        origin.y + direction.y * t,
        origin.z + direction.z * t,
      )
      const delta = new Vec3(
        pointPosition.x - closest.x,
        pointPosition.y - closest.y,
        pointPosition.z - closest.z,
      )
      return {
        target,
        delta,
        errorLength: this.getLength(delta),
      }
    }

    const face = this.scene.faces.get(target.id)
    if (!face) return null
    const supportPoints = face.getSupportPoints(this.scene.points)
    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    const plane =
      computePlaneBasis(supportPoints.map((item) => item.position)) ??
      computePlaneBasis(boundaryPoints.map((item) => item.position))
    if (!plane) return null

    const projected = projectPointToPlane(pointPosition, plane)
    const delta = new Vec3(
      pointPosition.x - projected.x,
      pointPosition.y - projected.y,
      pointPosition.z - projected.z,
    )
    return {
      target,
      delta,
      errorLength: this.getLength(delta),
    }
  }

  private driveTargetsToPoint(pointPosition: Vec3, preferDraggedTargets: boolean) {
    const corrections = [this.sourceA, this.sourceB]
      .map((target) => this.getTargetCorrection(target, pointPosition))
      .filter(
        (
          correction,
        ): correction is {
          target: IntersectionTargetRef
          delta: Vec3
          errorLength: number
        } => correction !== null && correction.errorLength > IntersectionPointConstraint.EPSILON,
      )

    if (corrections.length === 0) return

    const preferred = preferDraggedTargets
      ? corrections.filter(({ target }) => this.isTargetBeingDragged(target))
      : corrections
    const finalCorrections = preferred.length > 0 ? preferred : corrections
    const driveLimit = this.getTranslateLimit(8)

    finalCorrections.forEach(({ target, delta }) => {
      this.translateTarget(target, delta, driveLimit)
    })
  }

  isEffective() {
    return computeIntersectionPoint(this.scene, this.sourceA, this.sourceB) !== null
  }

  solve() {
    const point = this.scene.points.get(this.pointId)
    if (!point || point.locked) return
    if (!this.isSafePosition(point.position)) return

    if (point.userLocked) {
      this.driveTargetsToPoint(point.position, true)
      return
    }

    if (this.isPointBeingDragged()) {
      this.driveTargetsToPoint(point.position, false)
      return
    }

    const expected = computeIntersectionPoint(this.scene, this.sourceA, this.sourceB)
    if (!expected || !this.isSafePosition(expected)) return

    const error = this.getError(point.position, expected)
    const errorLength = this.getLength(error)
    if (errorLength <= IntersectionPointConstraint.EPSILON) return
    point.setPosition(expected)
  }
}
