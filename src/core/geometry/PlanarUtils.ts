import * as THREE from 'three'
import { Line3 } from './Line3'
import type { Point3 } from './Point3'
import { Vec3 } from './Vec3'

export const PLANAR_EPSILON = 1e-4

export type PlaneBasis = {
  origin: Vec3
  normal: Vec3
  uAxis: Vec3
  vAxis: Vec3
}

export type ProjectedPoint2D = {
  id: string
  x: number
  y: number
}

const toThree = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z)

const fromThree = (v: THREE.Vector3) => new Vec3(v.x, v.y, v.z)

const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

const normalize = (v: Vec3) => {
  const len = length(v)
  if (len <= PLANAR_EPSILON) return null
  return new Vec3(v.x / len, v.y / len, v.z / len)
}

export const computePlaneBasis = (positions: Vec3[]): PlaneBasis | null => {
  if (positions.length < 3) return null

  const n = positions.length
  let sumX = 0
  let sumY = 0
  let sumZ = 0
  for (let i = 0; i < n; i += 1) {
    const p = positions[i]!
    sumX += p.x
    sumY += p.y
    sumZ += p.z
  }
  const origin = new Vec3(sumX / n, sumY / n, sumZ / n)

  for (let i = 0; i < n - 2; i += 1) {
    for (let j = i + 1; j < n - 1; j += 1) {
      for (let k = j + 1; k < n; k += 1) {
        const pi = positions[i]!
        const pj = positions[j]!
        const pk = positions[k]!
        const abx = pj.x - pi.x
        const aby = pj.y - pi.y
        const abz = pj.z - pi.z
        const acx = pk.x - pi.x
        const acy = pk.y - pi.y
        const acz = pk.z - pi.z
        let nx = aby * acz - abz * acy
        let ny = abz * acx - abx * acz
        let nz = abx * acy - aby * acx
        const nLen = Math.hypot(nx, ny, nz)
        if (nLen <= PLANAR_EPSILON) continue
        nx /= nLen
        ny /= nLen
        nz /= nLen

        const absX = Math.abs(nx)
        const absY = Math.abs(ny)
        const absZ = Math.abs(nz)
        let refX = 0
        let refY = 0
        let refZ = 0
        if (absX <= absY && absX <= absZ) refX = 1
        else if (absY <= absX && absY <= absZ) refY = 1
        else refZ = 1

        let ux = refY * nz - refZ * ny
        let uy = refZ * nx - refX * nz
        let uz = refX * ny - refY * nx
        const uLen = Math.hypot(ux, uy, uz)
        if (uLen <= PLANAR_EPSILON) continue
        ux /= uLen
        uy /= uLen
        uz /= uLen

        let vx = ny * uz - nz * uy
        let vy = nz * ux - nx * uz
        let vz = nx * uy - ny * ux
        const vLen = Math.hypot(vx, vy, vz)
        if (vLen <= PLANAR_EPSILON) continue
        vx /= vLen
        vy /= vLen
        vz /= vLen

        return {
          origin,
          normal: new Vec3(nx, ny, nz),
          uAxis: new Vec3(ux, uy, uz),
          vAxis: new Vec3(vx, vy, vz),
        }
      }
    }
  }

  return null
}

export const signedDistanceToPlane = (point: Vec3, plane: PlaneBasis) =>
  dot(sub(point, plane.origin), plane.normal)

export const projectPointToPlane = (point: Vec3, plane: PlaneBasis) => {
  const distance = signedDistanceToPlane(point, plane)
  return new Vec3(
    point.x - plane.normal.x * distance,
    point.y - plane.normal.y * distance,
    point.z - plane.normal.z * distance,
  )
}

export const areCoplanar = (positions: Vec3[], epsilon = PLANAR_EPSILON) => {
  const basis = computePlaneBasis(positions)
  if (!basis) return false
  return positions.every((point) => Math.abs(signedDistanceToPlane(point, basis)) <= epsilon)
}

export const projectPoint2D = (point: Vec3, plane: PlaneBasis) => {
  const delta = sub(point, plane.origin)
  return {
    x: dot(delta, plane.uAxis),
    y: dot(delta, plane.vAxis),
  }
}

const cross2D = (o: ProjectedPoint2D, a: ProjectedPoint2D, b: ProjectedPoint2D) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

export const buildConvexHull = (projected: ProjectedPoint2D[]) => {
  if (projected.length < 3) return []
  const sorted = [...projected].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const lower: ProjectedPoint2D[] = []
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross2D(lower[lower.length - 2]!, lower[lower.length - 1]!, point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  })
  const upper: ProjectedPoint2D[] = []
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i]!
    while (upper.length >= 2 && cross2D(upper[upper.length - 2]!, upper[upper.length - 1]!, point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }
  lower.pop()
  upper.pop()
  return [...lower, ...upper]
}

export const polygonArea2D = (projected: Array<{ x: number; y: number }>) => {
  if (projected.length < 3) return 0
  let area = 0
  for (let i = 0; i < projected.length; i += 1) {
    const current = projected[i]!
    const next = projected[(i + 1) % projected.length]!
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) * 0.5
}

export const polygonCentroid = (positions: Vec3[]) => {
  if (positions.length === 0) return new Vec3()
  const sum = positions.reduce((acc, point) => acc.add(point), new Vec3())
  return new Vec3(sum.x / positions.length, sum.y / positions.length, sum.z / positions.length)
}

export const newellNormal = (positions: Vec3[]) => {
  if (positions.length < 3) return null
  const normal = new Vec3()
  for (let i = 0; i < positions.length; i += 1) {
    const current = positions[i]!
    const next = positions[(i + 1) % positions.length]!
    normal.x += (current.y - next.y) * (current.z + next.z)
    normal.y += (current.z - next.z) * (current.x + next.x)
    normal.z += (current.x - next.x) * (current.y + next.y)
  }
  return normalize(normal)
}

export const orderedLoopFromLines = (lines: Line3[]) => {
  if (lines.length < 3) return null

  const adjacency = new Map<string, Set<string>>()
  lines.forEach((line) => {
    if (!adjacency.has(line.p1.id)) adjacency.set(line.p1.id, new Set())
    if (!adjacency.has(line.p2.id)) adjacency.set(line.p2.id, new Set())
    adjacency.get(line.p1.id)!.add(line.p2.id)
    adjacency.get(line.p2.id)!.add(line.p1.id)
  })

  if ([...adjacency.values()].some((neighbors) => neighbors.size !== 2)) return null

  const startId = lines[0]!.p1.id
  const orderedIds = [startId]
  let previousId: string | null = null
  let currentId = startId

  while (true) {
    const nextCandidates = [...(adjacency.get(currentId) ?? [])].filter((id) => id !== previousId)
    if (nextCandidates.length === 0) return null
    const nextId = nextCandidates[0]!
    if (nextId === startId) break
    if (orderedIds.includes(nextId)) return null
    orderedIds.push(nextId)
    previousId = currentId
    currentId = nextId
  }

  return orderedIds.length === adjacency.size ? orderedIds : null
}

export const getUniquePointIdsFromLines = (lines: Line3[]) => {
  const ids = new Set<string>()
  lines.forEach((line) => {
    ids.add(line.p1.id)
    ids.add(line.p2.id)
  })
  return [...ids]
}

export const computeSupportPointIds = (points: Point3[]) => {
  for (let i = 0; i < points.length - 2; i += 1) {
    for (let j = i + 1; j < points.length - 1; j += 1) {
      for (let k = j + 1; k < points.length; k += 1) {
        const basis = computePlaneBasis([
          points[i]!.position,
          points[j]!.position,
          points[k]!.position,
        ])
        if (basis) return [points[i]!.id, points[j]!.id, points[k]!.id]
      }
    }
  }
  return []
}

export const ensureCounterClockwise = (pointIds: string[], pointMap: Map<string, Point3>, plane: PlaneBasis) => {
  const projected = pointIds
    .map((id) => pointMap.get(id))
    .filter((point): point is Point3 => point !== undefined)
    .map((point) => projectPoint2D(point.position, plane))
  if (projected.length < 3) return pointIds
  let signedArea = 0
  for (let i = 0; i < projected.length; i += 1) {
    const current = projected[i]!
    const next = projected[(i + 1) % projected.length]!
    signedArea += current.x * next.y - next.x * current.y
  }
  return signedArea >= 0 ? pointIds : [...pointIds].reverse()
}

export const triangulateFace = (pointIds: string[], pointMap: Map<string, Point3>) => {
  const points = pointIds
    .map((id) => pointMap.get(id))
    .filter((point): point is Point3 => point !== undefined)
  if (points.length < 3) return null
  const positions = points.map((point) => toThree(point.position))
  const basis = computePlaneBasis(points.map((point) => point.position))
  if (!basis) return null
  const contour = points.map((point) => {
    const projected = projectPoint2D(point.position, basis)
    return new THREE.Vector2(projected.x, projected.y)
  })
  const faces = THREE.ShapeUtils.triangulateShape(contour, [])
  return { basis, positions, indices: faces.flat() }
}

export const isPointInPolygon2D = (px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean => {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export const cloneVec3Map = (map: Map<string, Vec3>) =>
  new Map([...map.entries()].map(([id, position]) => [id, position.clone()]))

export const toVec3 = fromThree
