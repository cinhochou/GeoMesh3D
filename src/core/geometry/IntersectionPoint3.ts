import type { PlanarPolygon } from './PlanarPolygon'
import type { Point3 } from './Point3'
import type { Ray3 } from './Ray3'
import type { GeoVector3 } from './GeoVector3'
import type { StraightLine3 } from './StraightLine3'
import type { Line3 } from './Line3'
import type { ParallelLine3 } from './ParallelLine3'
import type { PerpendicularLine3 } from './PerpendicularLine3'
import { Vec3 } from './Vec3'
import { computePlaneBasis } from './PlanarUtils'

export type IntersectionLinearType = 'line' | 'straightLine' | 'ray' | 'vector' | 'parallelLine' | 'perpendicularLine'
export type IntersectionTargetType = IntersectionLinearType | 'face'

export type IntersectionTargetRef = {
  type: IntersectionTargetType
  id: string
}

type IntersectionSceneAccess = {
  points: Map<string, Point3>
  lines: Map<string, Line3>
  straightLines: Map<string, StraightLine3>
  rays: Map<string, Ray3>
  vectors: Map<string, GeoVector3>
  faces: Map<string, PlanarPolygon>
  parallelLines: Map<string, ParallelLine3>
  perpendicularLines: Map<string, PerpendicularLine3>
}

type LinearData = {
  origin: Vec3
  direction: Vec3
}

export type LinearLinearIntersectionData = {
  point: Vec3
  pointOnA: Vec3
  pointOnB: Vec3
  skewDistance: number
}

const EPSILON = 1e-6
// Guard against numerically unstable "almost parallel" linear pairs.
const MIN_LINEAR_SIN2 = 1e-8
// Guard against parameter explosion when intersection is effectively at infinity.
const MAX_LINEAR_PARAM_ABS = 1e6

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)

const add = (a: Vec3, b: Vec3) => new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)

const scale = (v: Vec3, t: number) => new Vec3(v.x * t, v.y * t, v.z * t)

const normSq = (v: Vec3) => dot(v, v)

const resolveLinearData = (
  scene: IntersectionSceneAccess,
  target: IntersectionTargetRef,
): LinearData | null => {
  const entity =
    target.type === 'line'
      ? scene.lines.get(target.id)
      : target.type === 'straightLine'
        ? scene.straightLines.get(target.id)
        : target.type === 'ray'
          ? scene.rays.get(target.id)
          : target.type === 'vector'
            ? scene.vectors.get(target.id)
            : target.type === 'parallelLine'
              ? scene.parallelLines.get(target.id)
              : target.type === 'perpendicularLine'
                ? scene.perpendicularLines.get(target.id)
                : null
  if (!entity) return null

  const origin = entity.p1.position
  const direction = sub(entity.p2.position, entity.p1.position)
  if (normSq(direction) <= EPSILON * EPSILON) return null
  return {
    origin: origin.clone(),
    direction,
  }
}

const computeLinearLinearIntersectionDataFromLinear = (
  a: LinearData,
  b: LinearData,
): LinearLinearIntersectionData | null => {
  const w0 = sub(a.origin, b.origin)
  const aa = dot(a.direction, a.direction)
  const ab = dot(a.direction, b.direction)
  const bb = dot(b.direction, b.direction)
  const ad = dot(a.direction, w0)
  const bd = dot(b.direction, w0)
  const denominator = aa * bb - ab * ab
  if (Math.abs(denominator) <= EPSILON) return null
  const norm = Math.max(aa * bb, EPSILON)
  const sin2 = denominator / norm
  if (sin2 <= MIN_LINEAR_SIN2) return null

  const ta = (ab * bd - bb * ad) / denominator
  const tb = (aa * bd - ab * ad) / denominator
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  if (Math.abs(ta) > MAX_LINEAR_PARAM_ABS || Math.abs(tb) > MAX_LINEAR_PARAM_ABS) return null
  const pa = add(a.origin, scale(a.direction, ta))
  const pb = add(b.origin, scale(b.direction, tb))
  const point = scale(add(pa, pb), 0.5)
  return {
    point,
    pointOnA: pa,
    pointOnB: pb,
    skewDistance: Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z),
  }
}

const computeLinearFaceIntersection = (
  scene: IntersectionSceneAccess,
  linear: LinearData,
  faceId: string,
): Vec3 | null => {
  const face = scene.faces.get(faceId)
  if (!face) return null

  const supportPoints = face.getSupportPoints(scene.points)
  const boundaryPoints = face.getBoundaryPoints(scene.points)
  const plane =
    computePlaneBasis(supportPoints.map((point) => point.position)) ??
    computePlaneBasis(boundaryPoints.map((point) => point.position))
  if (!plane) return null

  const denominator = dot(plane.normal, linear.direction)
  if (Math.abs(denominator) <= EPSILON) return null

  const t = dot(plane.normal, sub(plane.origin, linear.origin)) / denominator
  return add(linear.origin, scale(linear.direction, t))
}

export const isIntersectionTargetType = (type: string): type is IntersectionTargetType =>
  type === 'line' || type === 'straightLine' || type === 'ray' || type === 'vector' || type === 'parallelLine' || type === 'perpendicularLine' || type === 'face'

export const isLinearIntersectionTarget = (
  type: IntersectionTargetType,
): type is IntersectionLinearType => type === 'line' || type === 'straightLine' || type === 'ray' || type === 'vector' || type === 'parallelLine' || type === 'perpendicularLine'

export const canCreateIntersectionFromTargets = (a: IntersectionTargetRef, b: IntersectionTargetRef) =>
  (isLinearIntersectionTarget(a.type) && isLinearIntersectionTarget(b.type)) ||
  (a.type === 'face' && isLinearIntersectionTarget(b.type)) ||
  (b.type === 'face' && isLinearIntersectionTarget(a.type))

export const computeLinearLinearIntersectionData = (
  scene: IntersectionSceneAccess,
  a: IntersectionTargetRef,
  b: IntersectionTargetRef,
) => {
  if (!isLinearIntersectionTarget(a.type) || !isLinearIntersectionTarget(b.type)) return null
  const linearA = resolveLinearData(scene, a)
  const linearB = resolveLinearData(scene, b)
  if (!linearA || !linearB) return null
  return computeLinearLinearIntersectionDataFromLinear(linearA, linearB)
}

export const computeIntersectionPoint = (
  scene: IntersectionSceneAccess,
  a: IntersectionTargetRef,
  b: IntersectionTargetRef,
): Vec3 | null => {
  if (!canCreateIntersectionFromTargets(a, b)) return null

  if (isLinearIntersectionTarget(a.type) && isLinearIntersectionTarget(b.type)) {
    const data = computeLinearLinearIntersectionData(scene, a, b)
    return data?.point ?? null
  }

  const linearTarget = isLinearIntersectionTarget(a.type) ? a : b
  const faceTarget = a.type === 'face' ? a : b
  const linear = resolveLinearData(scene, linearTarget)
  if (!linear) return null
  return computeLinearFaceIntersection(scene, linear, faceTarget.id)
}
