import { computePlaneBasis, projectPointToPlane, projectPoint2D } from '../geometry/PlanarUtils'
import { Vec3 } from '../geometry/Vec3'
import { Circle3 } from '../geometry/Circle3'
import { Scene } from '../scene/Scene'
import type { ConstrainedToRef } from '../geometry/Point3'

const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const add = (a: Vec3, b: Vec3) => new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)
const scale = (v: Vec3, s: number) => new Vec3(v.x * s, v.y * s, v.z * s)
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const lengthSq = (v: Vec3) => v.x * v.x + v.y * v.y + v.z * v.z
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const cross = (a: Vec3, b: Vec3) => new Vec3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
)
const normalize = (v: Vec3): Vec3 | null => {
  const len = length(v)
  return len > 1e-10 ? scale(v, 1 / len) : null
}

/** Compute the quaternion-like rotation (axis + cosHalfAngle) that rotates `from` to `to`. */
function rotationFromTo(from: Vec3, to: Vec3): { axis: Vec3; cosHalf: number; sinHalf: number } | null {
  const f = normalize(from)
  const t = normalize(to)
  if (!f || !t) return null
  const d = dot(f, t)
  // Vectors are nearly parallel — no rotation needed
  if (d > 1 - 1e-10) return { axis: new Vec3(1, 0, 0), cosHalf: 1, sinHalf: 0 }
  // Vectors are nearly opposite — pick any perpendicular axis
  if (d < -1 + 1e-10) {
    const perp = Math.abs(f.x) < 0.9 ? new Vec3(1, 0, 0) : new Vec3(0, 1, 0)
    const axis = normalize(cross(f, perp))
    if (!axis) return null
    return { axis, cosHalf: 0, sinHalf: 1 }
  }
  const axis = normalize(cross(f, t))
  if (!axis) return null
  const cosHalf = Math.sqrt((1 + d) / 2)
  const sinHalf = Math.sqrt((1 - d) / 2)
  return { axis, cosHalf, sinHalf }
}

/** Apply a rotation (computed by rotationFromTo) to a vector. */
function applyRotation(v: Vec3, rotation: { axis: Vec3; cosHalf: number; sinHalf: number }): Vec3 {
  const { axis, cosHalf, sinHalf } = rotation
  // Rodrigues' rotation formula using quaternion:
  // q = cosHalf + (axis.x*i + axis.y*j + axis.z*k)*sinHalf
  // v' = q * v * q^-1
  // Equivalent to: v' = v*cos(2*half) + (axis×v)*sin(2*half) + axis*(axis·v)*(1-cos(2*half))
  // where cos(2*half) = cosHalf^2 - sinHalf^2, sin(2*half) = 2*cosHalf*sinHalf
  const cosAngle = cosHalf * cosHalf - sinHalf * sinHalf
  const sinAngle = 2 * cosHalf * sinHalf
  const crossAV = cross(axis, v)
  const dotAV = dot(axis, v)
  return add(add(scale(v, cosAngle), scale(crossAV, sinAngle)), scale(axis, dotAV * (1 - cosAngle)))
}

export type ParametricData =
  | { type: 'line' | 'vector'; t: number }
  | { type: 'straightLine'; t: number }
  | { type: 'ray'; t: number }
  | { type: 'perpendicularLine'; t: number }
  | { type: 'parallelLine'; t: number }
  | { type: 'circle'; angle: number; normal: [number, number, number]; center: [number, number, number] }
  | { type: 'face'; barycentric: [number, number, number] }
  | { type: 'sphere'; theta: number; phi: number }
  | {
      type: 'cone'
      t: number
      angle: number
      baseCenter: [number, number, number]
      apex: [number, number, number]
      refDir: [number, number, number]
    }
  | {
      type: 'cylinder'
      t: number
      angle: number
      bottomCenter: [number, number, number]
      topCenter: [number, number, number]
      refDir: [number, number, number]
    }
  | {
      type: 'coneBase'
      radialRatio?: number
      angle: number
      baseCenter: [number, number, number]
      apex: [number, number, number]
      refDir: [number, number, number]
      onBaseCircle?: boolean
    }
  | {
      type: 'cylinderBottom' | 'cylinderTop'
      radialRatio?: number
      angle: number
      bottomCenter: [number, number, number]
      topCenter: [number, number, number]
      refDir: [number, number, number]
      onCircle?: 'top' | 'bottom' | null
    }
  | { type: 'xAxis' | 'yAxis' | 'zAxis'; t: number }

/** 单个参数化维度的范围约束 */
export type ParametricRange = {
  key: string
  label: string
  min: number
  max: number
  step: number
}

export class ObjectConstrainedPointConstraint {
  private static readonly EPSILON = 1e-5

  parametricData: ParametricData | null = null

  lastSetClamped: boolean = false

  constructor(
    private scene: Scene,
    public readonly pointId: string,
    public target: ConstrainedToRef,
  ) {}

  getDependencyPointIds() {
    const ids: string[] = [this.pointId]
    const target = this.target
    if (target.type === 'line') {
      const line = this.scene.lines.get(target.id)
      if (line) { ids.push(line.p1.id, line.p2.id) }
    } else if (target.type === 'straightLine') {
      const sl = this.scene.straightLines.get(target.id)
      if (sl) { ids.push(sl.p1.id, sl.p2.id) }
    } else if (target.type === 'ray') {
      const ray = this.scene.rays.get(target.id)
      if (ray) { ids.push(ray.p1.id, ray.p2.id) }
    } else if (target.type === 'vector') {
      const vec = this.scene.vectors.get(target.id)
      if (vec) { ids.push(vec.p1.id, vec.p2.id) }
    } else if (target.type === 'circle') {
      const circle = this.scene.circles.get(target.id)
      if (circle) {
        ids.push(circle.p1.id, circle.p2.id, circle.p3.id)
        if (circle.isNormalCircle()) {
          const coneIds = this.scene.getConesForCircle(circle.id)
          for (const coneId of coneIds) {
            const cone = this.scene.cones.get(coneId)
            if (cone) { ids.push(cone.baseCenterPoint.id, cone.apexPoint.id) }
          }
          const cylinderIds = this.scene.getCylindersForCircle(circle.id)
          for (const cylId of cylinderIds) {
            const cyl = this.scene.cylinders.get(cylId)
            if (cyl) { ids.push(cyl.bottomCenterPoint.id, cyl.topCenterPoint.id) }
          }
        }
      }
    } else if (target.type === 'face') {
      const face = this.scene.faces.get(target.id)
      if (face) { ids.push(...face.memberPointIds) }
    } else if (target.type === 'sphere') {
      const sphere = this.scene.spheres.get(target.id)
      if (sphere) { ids.push(sphere.centerPoint.id) }
    } else if (target.type === 'cone' || target.type === 'coneBase') {
      const cone = this.scene.cones.get(target.id)
      if (cone) { ids.push(cone.baseCenterPoint.id, cone.apexPoint.id) }
    } else if (
      target.type === 'cylinder' ||
      target.type === 'cylinderBottom' ||
      target.type === 'cylinderTop'
    ) {
      const cylinder = this.scene.cylinders.get(target.id)
      if (cylinder) { ids.push(cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id) }
    } else if (target.type === 'perpendicularLine') {
      const pl = this.scene.perpendicularLines.get(target.id)
      if (pl) { ids.push(pl.p1.id, pl.p2.id) }
    } else if (target.type === 'parallelLine') {
      const pll = this.scene.parallelLines.get(target.id)
      if (pll) { ids.push(pll.p1.id, pll.p2.id) }
    }
    return ids
  }

  isEffective(): boolean {
    return this.projectToConstraint(this.getPointPosition()) !== null
  }

  solve() {
    const point = this.scene.points.get(this.pointId)
    if (!point || point.locked) return
    if (point.userLocked) return
    // For circle constraints, when the normal vector changes we rotate the
    // point's offset from the center by the same rotation that was applied
    // to the normal. This keeps the point at the same relative position on
    // the circle (e.g. if it was at the "right side", it stays at the
    // "right side" after the circle tilts). A simple projectToConstraint
    // would keep the absolute position, causing the angle to drift when the
    // normal changes. Using recomputePosition directly is also wrong because
    // getNormalFrame's uAxis is unstable (flips when normal crosses Y).
    if (this.target.type === 'circle') {
      const circle = this.scene.circles.get(this.target.id)
      if (!circle) return
      const newDirection = this.resolveDirectionForCircle(circle)
      const newFrame = circle.getFrame(newDirection)
      if (!newFrame) return

      if (this.parametricData && this.parametricData.type === 'circle') {
        const oldNormal = new Vec3(...this.parametricData.normal)
        const oldCenter = new Vec3(...this.parametricData.center)
        const newNormal = newFrame.normal
        const newCenter = newFrame.center

        // Compute the rotation from old normal to new normal
        const rotation = rotationFromTo(oldNormal, newNormal)
        if (rotation) {
          // Rotate the point's offset from the old center, then translate
          // to the new center
          const oldOffset = sub(point.position, oldCenter)
          const rotatedOffset = applyRotation(oldOffset, rotation)
          const rotatedPos = add(newCenter, rotatedOffset)
          // Project onto the new circle to ensure it's exactly on the circle
          const projected = this.projectToCircleWithFrame(rotatedPos, newFrame)
          if (projected) {
            const dist = length(sub(point.position, projected))
            if (dist > ObjectConstrainedPointConstraint.EPSILON) {
              point.setPosition(projected)
            }
            this.computeParametricDataFromPosition(projected)
            return
          }
        }
      }

      // No parametricData or rotation failed: project current position
      const projected = this.projectToCircleWithFrame(point.position, newFrame)
      if (!projected) return
      const dist = length(sub(point.position, projected))
      if (dist <= ObjectConstrainedPointConstraint.EPSILON) return
      point.setPosition(projected)
      this.computeParametricDataFromPosition(projected)
      return
    }
    const isBeingDragged = this.scene.activeDraggedPointIds?.has(this.pointId) ?? false
    if (!isBeingDragged && this.parametricData) {
      const recomputed = this.recomputePosition()
      if (recomputed) {
        const finalPos = this.projectToConstraint(recomputed) ?? recomputed
        const dist = length(sub(point.position, finalPos))
        if (dist <= ObjectConstrainedPointConstraint.EPSILON) return
        point.setPosition(finalPos)
        // 不重新计算 parametricData：保持原始归一化比例不变，
        // 避免 projectToConstraint 边界钳制后比例被覆写导致漂移。
        // parametricData 仅在用户拖动点时（走下方路径）更新。
        return
      }
    }
    const projected = this.projectToConstraint(point.position)
    if (!projected) return
    const dist = length(sub(point.position, projected))
    if (dist <= ObjectConstrainedPointConstraint.EPSILON) return
    point.setPosition(projected)
    this.computeParametricDataFromPosition(projected)
  }

  /** 计算点相对于三角形 (a,b,c) 的重心坐标 (a,b,c)，满足 p = a*A + b*B + c*C 且 a+b+c=1 */
  private computeBarycentricCoordinates(
    p: Vec3,
    a: Vec3,
    b: Vec3,
    c: Vec3,
  ): { a: number; b: number; c: number } | null {
    const v0 = sub(b, a)
    const v1 = sub(c, a)
    const v2 = sub(p, a)
    const d00 = dot(v0, v0)
    const d01 = dot(v0, v1)
    const d11 = dot(v1, v1)
    const d20 = dot(v2, v0)
    const d21 = dot(v2, v1)
    const denom = d00 * d11 - d01 * d01
    if (Math.abs(denom) <= 1e-10) return null
    const beta = (d11 * d20 - d01 * d21) / denom
    const gamma = (d00 * d21 - d01 * d20) / denom
    const alpha = 1 - beta - gamma
    return { a: alpha, b: beta, c: gamma }
  }

  /** 获取面约束的局部坐标系（基于支撑三角形） */
  private getFaceBasis() {
    if (this.target.type !== 'face') return null
    const face = this.scene.faces.get(this.target.id)
    if (!face) return null
    const supportPoints = face.getSupportPoints(this.scene.points)
    if (supportPoints.length < 3) return null
    const sp0 = supportPoints[0]
    const sp1 = supportPoints[1]
    const sp2 = supportPoints[2]
    if (!sp0 || !sp1 || !sp2) return null
    const origin = sp0.position
    const edge1 = sub(sp1.position, sp0.position)
    const edge1Len = length(edge1)
    if (edge1Len <= 1e-10) return null
    const uAxis = scale(edge1, 1 / edge1Len)
    const edge2 = sub(sp2.position, sp0.position)
    const nRaw = cross(edge1, edge2)
    const nLen = length(nRaw)
    if (nLen <= 1e-10) return null
    const nAxis = scale(nRaw, 1 / nLen)
    const vAxis = cross(nAxis, uAxis)
    const edge2VLen = dot(edge2, vAxis)
    if (Math.abs(edge2VLen) <= 1e-10) return null
    return { face, sp0, sp1, sp2, origin, uAxis, vAxis, edge1Len, edge2VLen, nAxis }
  }

  /** 将世界坐标点投影到面的 UV 坐标系（u 沿首边比例，v 垂直首边比例） */
  private worldToUV(pos: Vec3, basis: NonNullable<ReturnType<ObjectConstrainedPointConstraint['getFaceBasis']>>) {
    const diff = sub(pos, basis.origin)
    const u = dot(diff, basis.uAxis) / basis.edge1Len
    const v = dot(diff, basis.vAxis) / basis.edge2VLen
    return { u, v }
  }

  /** 从重心坐标计算 UV 值（u 沿首边比例 0~1，v 垂直首边比例） */
  private barycentricToUV(bary: [number, number, number], basis: NonNullable<ReturnType<ObjectConstrainedPointConstraint['getFaceBasis']>>) {
    const [a, b, c] = bary
    const pos = add(
      add(scale(basis.sp0.position, a), scale(basis.sp1.position, b)),
      scale(basis.sp2.position, c),
    )
    return this.worldToUV(pos, basis)
  }

  /** 从 UV 值计算世界坐标 */
  private uvToPosition(u: number, v: number, basis: NonNullable<ReturnType<ObjectConstrainedPointConstraint['getFaceBasis']>>): Vec3 {
    const { origin, uAxis, vAxis, edge1Len, edge2VLen } = basis
    return add(
      origin,
      add(scale(uAxis, u * edge1Len), scale(vAxis, v * edge2VLen)),
    )
  }

  /** 计算面约束的动态 UV 边界：将所有边界点投影到 UV 空间，取包围盒并添加 15% padding */
  private computeFaceUVBounds(basis: NonNullable<ReturnType<ObjectConstrainedPointConstraint['getFaceBasis']>>) {
    const boundaryPoints = basis.face.getBoundaryPoints(this.scene.points)
    if (boundaryPoints.length < 3) return null
    let minU = Infinity
    let maxU = -Infinity
    let minV = Infinity
    let maxV = -Infinity
    for (const bp of boundaryPoints) {
      const uv = this.worldToUV(bp.position, basis)
      if (uv.u < minU) minU = uv.u
      if (uv.u > maxU) maxU = uv.u
      if (uv.v < minV) minV = uv.v
      if (uv.v > maxV) maxV = uv.v
    }
    if (!isFinite(minU) || !isFinite(maxU) || !isFinite(minV) || !isFinite(maxV)) return null
    const padU = (maxU - minU) * 0.15
    const padV = (maxV - minV) * 0.15
    return {
      minU: minU - padU,
      maxU: maxU + padU,
      minV: minV - padV,
      maxV: maxV + padV,
    }
  }

  projectPosition(pos: Vec3): Vec3 | null {
    return this.projectToConstraint(pos)
  }

  /** For circle constraints, rotate the point's offset by the normal change
   *  before projecting. This keeps the point at the same relative position
   *  on the circle when the normal changes. */
  projectPositionWithRotation(pos: Vec3): Vec3 | null {
    if (this.target.type !== 'circle') return this.projectToConstraint(pos)
    const circle = this.scene.circles.get(this.target.id)
    if (!circle) return null
    const newDirection = this.resolveDirectionForCircle(circle)
    const newFrame = circle.getFrame(newDirection)
    if (!newFrame) return null

    if (this.parametricData && this.parametricData.type === 'circle') {
      const oldNormal = new Vec3(...this.parametricData.normal)
      const oldCenter = new Vec3(...this.parametricData.center)
      const newNormal = newFrame.normal
      const newCenter = newFrame.center

      const rotation = rotationFromTo(oldNormal, newNormal)
      if (rotation) {
        const oldOffset = sub(pos, oldCenter)
        const rotatedOffset = applyRotation(oldOffset, rotation)
        const rotatedPos = add(newCenter, rotatedOffset)
        return this.projectToCircleWithFrame(rotatedPos, newFrame)
      }
    }

    return this.projectToCircleWithFrame(pos, newFrame)
  }

  /** 返回当前约束类型下各参数化维度的可编辑范围 */
  getParametricRanges(): ParametricRange[] {
    const pd = this.parametricData
    if (!pd) return []
    switch (pd.type) {
      case 'line':
      case 'vector':
        return [{ key: 't', label: 't', min: 0, max: 1, step: 0.1 }]
      case 'straightLine':
        return [{ key: 't', label: 't', min: -100, max: 100, step: 0.1 }]
      case 'ray':
        return [{ key: 't', label: 't', min: 0, max: 100, step: 0.1 }]
      case 'perpendicularLine':
        return [{ key: 't', label: 't', min: -2, max: 2, step: 0.05 }]
      case 'parallelLine':
        return [{ key: 't', label: 't', min: -2, max: 2, step: 0.05 }]
      case 'circle':
        return [{ key: 'angle', label: '角度', min: 0, max: 2 * Math.PI, step: 0.1 }]
      case 'face': {
        const basis = this.getFaceBasis()
        const bounds = basis ? this.computeFaceUVBounds(basis) : null
        if (bounds) {
          return [
            { key: 'u', label: 'U', min: bounds.minU, max: bounds.maxU, step: 0.05 },
            { key: 'v', label: 'V', min: bounds.minV, max: bounds.maxV, step: 0.05 },
          ]
        }
        return [
          { key: 'u', label: 'U', min: -10, max: 10, step: 0.05 },
          { key: 'v', label: 'V', min: -10, max: 10, step: 0.05 },
        ]
      }
      case 'sphere':
        return [
          { key: 'theta', label: 'θ', min: 0, max: Math.PI, step: 0.1 },
          { key: 'phi', label: 'φ', min: 0, max: 2 * Math.PI, step: 0.1 },
        ]
      case 'cone':
        return [
          { key: 't', label: 't', min: 0, max: 1, step: 0.1 },
          { key: 'angle', label: '角度', min: 0, max: 2 * Math.PI, step: 0.1 },
        ]
      case 'coneBase':
        return [
          { key: 'radialRatio', label: '径向比', min: 0, max: 1, step: 0.1 },
          { key: 'angle', label: '角度', min: 0, max: 2 * Math.PI, step: 0.1 },
        ]
      case 'cylinder':
        return [
          { key: 't', label: 't', min: 0, max: 1, step: 0.1 },
          { key: 'angle', label: '角度', min: 0, max: 2 * Math.PI, step: 0.1 },
        ]
      case 'cylinderBottom':
      case 'cylinderTop':
        return [
          { key: 'radialRatio', label: '径向比', min: 0, max: 1, step: 0.1 },
          { key: 'angle', label: '角度', min: 0, max: 2 * Math.PI, step: 0.1 },
        ]
      case 'xAxis':
      case 'yAxis':
      case 'zAxis':
        return [{ key: 't', label: 't', min: -100, max: 100, step: 0.1 }]
      default:
        return []
    }
  }

  /** 获取当前参数化数据的某个参数值 */
  getParametricValue(key: string): number | undefined {
    const pd = this.parametricData
    if (!pd) return undefined
    if (pd.type === 'face') {
      const basis = this.getFaceBasis()
      if (!basis) return undefined
      const uv = this.barycentricToUV(pd.barycentric, basis)
      return (uv as Record<string, number>)[key]
    }
    return (pd as Record<string, unknown>)[key] as number | undefined
  }

  /** 设置当前参数化数据的某个参数值，并重新计算点位置。
   * 返回是否成功设置；lastSetClamped 标记是否被面边界钳制。 */
  setParametricValue(key: string, value: number): boolean {
    const pd = this.parametricData
    if (!pd) return false
    this.lastSetClamped = false

    if (pd.type === 'face' && (key === 'u' || key === 'v')) {
      const basis = this.getFaceBasis()
      if (!basis) return false
      const point = this.scene.points.get(this.pointId)
      if (!point || point.locked) return false
      const bounds = this.computeFaceUVBounds(basis)
      const oldPos = point.position.clone()
      // 先获取当前 UV，只更新指定轴
      const currentUV = this.barycentricToUV(pd.barycentric, basis)
      let newU = key === 'u' ? value : currentUV.u
      let newV = key === 'v' ? value : currentUV.v
      // 钳制到动态 UV 包围盒（含15% padding），防止输入极端值导致数值异常，但不触发气泡
      if (bounds) {
        if (key === 'u') {
          if (newU < bounds.minU) newU = bounds.minU
          else if (newU > bounds.maxU) newU = bounds.maxU
        } else {
          if (newV < bounds.minV) newV = bounds.minV
          else if (newV > bounds.maxV) newV = bounds.maxV
        }
      }
      const desiredPos = this.uvToPosition(newU, newV, basis)
      const finalPos = this.projectToConstraint(desiredPos) ?? desiredPos
      // 只有当设置后的位置与设置前几乎相同时，才判定为"无法移动"（已到达边界被挡住）
      const moveDist = length(sub(finalPos, oldPos))
      if (moveDist < 1e-4) {
        this.lastSetClamped = true
      }
      point.setPosition(finalPos)
      this.computeParametricDataFromPosition(finalPos)
      return true
    }

    const ranges = this.getParametricRanges()
    const range = ranges.find((r) => r.key === key)
    if (!range) return false
    const clamped = Math.max(range.min, Math.min(value, range.max))
    ;(pd as Record<string, unknown>)[key] = clamped
    const newPos = this.recomputePosition()
    if (!newPos) return false
    const point = this.scene.points.get(this.pointId)
    if (!point || point.locked) return false
    point.setPosition(newPos)
    this.computeParametricDataFromPosition(newPos)
    return true
  }

  computeParametricData() {
    const point = this.scene.points.get(this.pointId)
    if (!point) return
    this.computeParametricDataFromPosition(point.position)
  }

  computeParametricDataFromPosition(pos: Vec3) {
    switch (this.target.type) {
      case 'line': {
        const line = this.scene.lines.get(this.target.id)
        if (!line) return
        this.parametricData = { type: 'line', t: computeSegmentT(pos, line.p1.position, line.p2.position) }
        break
      }
      case 'vector': {
        const vec = this.scene.vectors.get(this.target.id)
        if (!vec) return
        this.parametricData = { type: 'vector', t: computeSegmentT(pos, vec.p1.position, vec.p2.position) }
        break
      }
      case 'straightLine': {
        const sl = this.scene.straightLines.get(this.target.id)
        if (!sl) return
        this.parametricData = { type: 'straightLine', t: computeSegmentT(pos, sl.p1.position, sl.p2.position) }
        break
      }
      case 'ray': {
        const ray = this.scene.rays.get(this.target.id)
        if (!ray) return
        this.parametricData = { type: 'ray', t: computeSegmentT(pos, ray.p1.position, ray.p2.position) }
        break
      }
      case 'perpendicularLine': {
        const pl = this.scene.perpendicularLines.get(this.target.id)
        if (!pl) return
        const plLen = pl.getDirectionLength()
        if (plLen <= 1e-10) return
        const plDir = pl.getNormalizedDirectionVector(this.scene)
        const plAp = sub(pos, pl.p1.position)
        // 存储归一化比例，线长度变化时保持相对位置不变
        this.parametricData = { type: 'perpendicularLine', t: dot(plAp, plDir) / plLen }
        break
      }
      case 'parallelLine': {
        const pll = this.scene.parallelLines.get(this.target.id)
        if (!pll) return
        const pllLen = pll.getDirectionLength()
        if (pllLen <= 1e-10) return
        const pllDir = pll.getNormalizedDirectionVector(this.scene)
        const pllAp = sub(pos, pll.p1.position)
        // 存储归一化比例，线长度变化时保持相对位置不变
        this.parametricData = { type: 'parallelLine', t: dot(pllAp, pllDir) / pllLen }
        break
      }
      case 'circle': {
        const circle = this.scene.circles.get(this.target.id)
        if (!circle) return
        const frame = circle.getFrame(this.resolveDirectionForCircle(circle))
        if (!frame) return
        const diff = sub(pos, frame.center)
        const angle = Math.atan2(dot(diff, frame.vAxis), dot(diff, frame.uAxis))
        this.parametricData = {
          type: 'circle',
          angle,
          normal: [frame.normal.x, frame.normal.y, frame.normal.z],
          center: [frame.center.x, frame.center.y, frame.center.z],
        }
        break
      }
      case 'face': {
        const face = this.scene.faces.get(this.target.id)
        if (!face) return
        const supportPoints = face.getSupportPoints(this.scene.points)
        if (supportPoints.length < 3) return
        const sp0 = supportPoints[0]
        const sp1 = supportPoints[1]
        const sp2 = supportPoints[2]
        if (!sp0 || !sp1 || !sp2) return
        const bary = this.computeBarycentricCoordinates(
          pos,
          sp0.position,
          sp1.position,
          sp2.position,
        )
        if (!bary) return
        // 使用重心坐标：点 = a*sp0 + b*sp1 + c*sp2，
        // 在面非均匀缩放/剪切时仍保持与支撑三角形的相对位置
        this.parametricData = {
          type: 'face',
          barycentric: [bary.a, bary.b, bary.c],
        }
        break
      }
      case 'sphere': {
        const sphere = this.scene.spheres.get(this.target.id)
        if (!sphere) return
        const diff = sub(pos, sphere.centerPoint.position)
        const theta = Math.acos(Math.max(-1, Math.min(1, diff.y / (length(diff) || 1))))
        const phi = Math.atan2(diff.z, diff.x)
        this.parametricData = { type: 'sphere', theta, phi }
        break
      }
      case 'cone': {
        const cone = this.scene.cones.get(this.target.id)
        if (!cone) return
        const baseCenter = cone.baseCenterPoint.position
        const apex = cone.apexPoint.position
        const axis = sub(apex, baseCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return
        const axisDir = scale(axis, 1 / axisLen)
        const diff = sub(pos, baseCenter)
        const alongAxis = dot(diff, axisDir)
        const radial = sub(diff, scale(axisDir, alongAxis))
        const radialLen = length(radial)
        let refDir: Vec3
        if (radialLen > ObjectConstrainedPointConstraint.EPSILON) {
          refDir = scale(radial, 1 / radialLen)
        } else {
          refDir = this.getConeRadialDir(axisDir)
        }
        const pointRadialDir = radialLen > ObjectConstrainedPointConstraint.EPSILON
          ? scale(radial, 1 / radialLen)
          : this.getConeRadialDir(axisDir)
        const baseEdge = add(baseCenter, scale(pointRadialDir, cone.radiusValue))
        const slantDir = sub(apex, baseEdge)
        const slantLen = length(slantDir)
        const slantT = slantLen > ObjectConstrainedPointConstraint.EPSILON
          ? dot(sub(pos, baseEdge), scale(slantDir, 1 / slantLen)) / slantLen
          : 0
        this.parametricData = {
          type: 'cone',
          t: Math.max(0, Math.min(1, slantT)),
          angle: 0,
          baseCenter: [baseCenter.x, baseCenter.y, baseCenter.z],
          apex: [apex.x, apex.y, apex.z],
          refDir: [refDir.x, refDir.y, refDir.z],
        }
        break
      }
      case 'coneBase': {
        const cone = this.scene.cones.get(this.target.id)
        if (!cone) return
        const baseCenter = cone.baseCenterPoint.position
        const apex = cone.apexPoint.position
        const axis = sub(apex, baseCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return
        const axisDir = scale(axis, 1 / axisLen)
        const diff = sub(pos, baseCenter)
        const alongAxis = dot(diff, axisDir)
        const radial = sub(diff, scale(axisDir, alongAxis))
        const radialLen = length(radial)
        const refDir = radialLen > ObjectConstrainedPointConstraint.EPSILON
          ? scale(radial, 1 / radialLen)
          : this.getConeRadialDir(axisDir)
        const radialRatio = cone.radiusValue > ObjectConstrainedPointConstraint.EPSILON
          ? Math.max(0, Math.min(radialLen / cone.radiusValue, 1))
          : 0
        this.parametricData = {
          type: 'coneBase',
          angle: 0,
          radialRatio,
          baseCenter: [baseCenter.x, baseCenter.y, baseCenter.z],
          apex: [apex.x, apex.y, apex.z],
          refDir: [refDir.x, refDir.y, refDir.z],
        }
        break
      }
      case 'cylinder': {
        const cylinder = this.scene.cylinders.get(this.target.id)
        if (!cylinder) return
        const bottomCenter = cylinder.bottomCenterPoint.position
        const topCenter = cylinder.topCenterPoint.position
        const axis = sub(topCenter, bottomCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return
        const axisDir = scale(axis, 1 / axisLen)
        const diff = sub(pos, bottomCenter)
        const alongAxis = dot(diff, axisDir)
        const radial = sub(diff, scale(axisDir, alongAxis))
        const radialLen = length(radial)
        let refDir: Vec3
        if (radialLen > ObjectConstrainedPointConstraint.EPSILON) {
          refDir = scale(radial, 1 / radialLen)
        } else {
          refDir = this.getConeRadialDir(axisDir)
        }
        this.parametricData = {
          type: 'cylinder',
          t: Math.max(0, Math.min(alongAxis / axisLen, 1)),
          angle: 0,
          bottomCenter: [bottomCenter.x, bottomCenter.y, bottomCenter.z],
          topCenter: [topCenter.x, topCenter.y, topCenter.z],
          refDir: [refDir.x, refDir.y, refDir.z],
        }
        break
      }
      case 'cylinderBottom':
      case 'cylinderTop': {
        const cylinder = this.scene.cylinders.get(this.target.id)
        if (!cylinder) return
        const bottomCenter = cylinder.bottomCenterPoint.position
        const topCenter = cylinder.topCenterPoint.position
        const axis = sub(topCenter, bottomCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return
        const axisDir = scale(axis, 1 / axisLen)
        const center = this.target.type === 'cylinderTop' ? topCenter : bottomCenter
        const diff = sub(pos, center)
        const radial = sub(diff, scale(axisDir, dot(diff, axisDir)))
        const radialLen = length(radial)
        const refDir = radialLen > ObjectConstrainedPointConstraint.EPSILON
          ? scale(radial, 1 / radialLen)
          : this.getConeRadialDir(axisDir)
        const radialRatio = cylinder.radiusValue > ObjectConstrainedPointConstraint.EPSILON
          ? Math.max(0, Math.min(radialLen / cylinder.radiusValue, 1))
          : 0
        this.parametricData = {
          type: this.target.type,
          angle: 0,
          radialRatio,
          bottomCenter: [bottomCenter.x, bottomCenter.y, bottomCenter.z],
          topCenter: [topCenter.x, topCenter.y, topCenter.z],
          refDir: [refDir.x, refDir.y, refDir.z],
        }
        break
      }
      case 'xAxis': {
        this.parametricData = { type: 'xAxis', t: pos.x }
        break
      }
      case 'yAxis': {
        this.parametricData = { type: 'yAxis', t: pos.y }
        break
      }
      case 'zAxis': {
        this.parametricData = { type: 'zAxis', t: pos.z }
        break
      }
    }
  }

  recomputePosition(): Vec3 | null {
    if (!this.parametricData) return null
    const pd = this.parametricData
    switch (pd.type) {
      case 'line': {
        const line = this.scene.lines.get(this.target.id)
        if (!line) return null
        return add(line.p1.position, scale(sub(line.p2.position, line.p1.position), pd.t))
      }
      case 'vector': {
        const vec = this.scene.vectors.get(this.target.id)
        if (!vec) return null
        return add(vec.p1.position, scale(sub(vec.p2.position, vec.p1.position), pd.t))
      }
      case 'straightLine': {
        const sl = this.scene.straightLines.get(this.target.id)
        if (!sl) return null
        return add(sl.p1.position, scale(sub(sl.p2.position, sl.p1.position), pd.t))
      }
      case 'ray': {
        const ray = this.scene.rays.get(this.target.id)
        if (!ray) return null
        return add(ray.p1.position, scale(sub(ray.p2.position, ray.p1.position), pd.t))
      }
      case 'perpendicularLine': {
        const pl = this.scene.perpendicularLines.get(this.target.id)
        if (!pl) return null
        const plLen = pl.getDirectionLength()
        if (plLen <= 1e-10) return null
        const plDir = pl.getNormalizedDirectionVector(this.scene)
        // 用归一化比例 × 当前线长反推位置，保持相对位置不变
        return add(pl.p1.position, scale(plDir, pd.t * plLen))
      }
      case 'parallelLine': {
        const pll = this.scene.parallelLines.get(this.target.id)
        if (!pll) return null
        const pllLen = pll.getDirectionLength()
        if (pllLen <= 1e-10) return null
        const pllDir = pll.getNormalizedDirectionVector(this.scene)
        // 用归一化比例 × 当前线长反推位置，保持相对位置不变
        return add(pll.p1.position, scale(pllDir, pd.t * pllLen))
      }
      case 'circle': {
        const circle = this.scene.circles.get(this.target.id)
        if (!circle) return null
        const frame = circle.getFrame(this.resolveDirectionForCircle(circle))
        if (!frame) return null
        return add(
          frame.center,
          add(scale(frame.uAxis, frame.radius * Math.cos(pd.angle)), scale(frame.vAxis, frame.radius * Math.sin(pd.angle))),
        )
      }
      case 'face': {
        const face = this.scene.faces.get(this.target.id)
        if (!face) return null
        const supportPoints = face.getSupportPoints(this.scene.points)
        if (supportPoints.length < 3) return null
        const sp0 = supportPoints[0]
        const sp1 = supportPoints[1]
        const sp2 = supportPoints[2]
        if (!sp0 || !sp1 || !sp2) return null
        // 使用重心坐标反推位置：P = a*sp0 + b*sp1 + c*sp2
        // 对非均匀缩放（如棱柱侧面底边改变而高度不变）仍保持相对位置
        const [a, b, c] = pd.barycentric
        return add(
          add(scale(sp0.position, a), scale(sp1.position, b)),
          scale(sp2.position, c),
        )
      }
      case 'sphere': {
        const sphere = this.scene.spheres.get(this.target.id)
        if (!sphere) return null
        const r = sphere.getRadius()
        return add(
          sphere.centerPoint.position,
          new Vec3(
            r * Math.sin(pd.theta) * Math.cos(pd.phi),
            r * Math.cos(pd.theta),
            r * Math.sin(pd.theta) * Math.sin(pd.phi),
          ),
        )
      }
      case 'cone': {
        const cone = this.scene.cones.get(this.target.id)
        if (!cone) return null
        const baseCenter = cone.baseCenterPoint.position
        const apex = cone.apexPoint.position
        const axis = sub(apex, baseCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
        const axisDir = scale(axis, 1 / axisLen)
        let refDir: Vec3
        if ('refDir' in pd && pd.refDir && 'baseCenter' in pd && pd.baseCenter && 'apex' in pd && pd.apex) {
          const oldRefDir = new Vec3(pd.refDir[0], pd.refDir[1], pd.refDir[2])
          const oldAxis = sub(new Vec3(pd.apex[0], pd.apex[1], pd.apex[2]), new Vec3(pd.baseCenter[0], pd.baseCenter[1], pd.baseCenter[2]))
          const oldAxisLen = length(oldAxis)
          if (oldAxisLen > ObjectConstrainedPointConstraint.EPSILON) {
            const oldAxisDir = scale(oldAxis, 1 / oldAxisLen)
            refDir = this.rotateVec3ByDirChange(oldRefDir, oldAxisDir, axisDir)
            const projLen = dot(refDir, axisDir)
            refDir = sub(refDir, scale(axisDir, projLen))
            const refLen = length(refDir)
            if (refLen <= 1e-10) {
              refDir = this.getConeRadialDir(axisDir)
            } else {
              refDir = scale(refDir, 1 / refLen)
            }
          } else {
            refDir = this.getConeRadialDir(axisDir)
          }
        } else {
          refDir = this.getConeRadialDir(axisDir)
        }
        const cosA = Math.cos(pd.angle)
        const sinA = Math.sin(pd.angle)
        const radialDir = add(scale(refDir, cosA), scale(this.getCrossProduct(axisDir, refDir), sinA))
        const baseEdge = add(baseCenter, scale(radialDir, cone.radiusValue))
        const slantDir = sub(apex, baseEdge)
        return add(baseEdge, scale(slantDir, pd.t))
      }
      case 'coneBase': {
        const cone = this.scene.cones.get(this.target.id)
        if (!cone) return null
        const baseCenter = cone.baseCenterPoint.position
        const apex = cone.apexPoint.position
        const axis = sub(apex, baseCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
        const axisDir = scale(axis, 1 / axisLen)
        let refDir: Vec3
        if ('refDir' in pd && pd.refDir && 'baseCenter' in pd && pd.baseCenter && 'apex' in pd && pd.apex) {
          const oldRefDir = new Vec3(pd.refDir[0], pd.refDir[1], pd.refDir[2])
          const oldAxis = sub(new Vec3(pd.apex[0], pd.apex[1], pd.apex[2]), new Vec3(pd.baseCenter[0], pd.baseCenter[1], pd.baseCenter[2]))
          const oldAxisLen = length(oldAxis)
          if (oldAxisLen > ObjectConstrainedPointConstraint.EPSILON) {
            const oldAxisDir = scale(oldAxis, 1 / oldAxisLen)
            refDir = this.rotateVec3ByDirChange(oldRefDir, oldAxisDir, axisDir)
            const projLen = dot(refDir, axisDir)
            refDir = sub(refDir, scale(axisDir, projLen))
            const refLen = length(refDir)
            refDir = refLen <= 1e-10 ? this.getConeRadialDir(axisDir) : scale(refDir, 1 / refLen)
          } else {
            refDir = this.getConeRadialDir(axisDir)
          }
        } else {
          refDir = this.getConeRadialDir(axisDir)
        }
        const cosA = Math.cos(pd.angle)
        const sinA = Math.sin(pd.angle)
        const radialDir = add(scale(refDir, cosA), scale(this.getCrossProduct(axisDir, refDir), sinA))
        const radialRatio = Math.max(0, Math.min(pd.radialRatio ?? (pd.onBaseCircle ? 1 : 0), 1))
        return add(baseCenter, scale(radialDir, cone.radiusValue * radialRatio))
      }
      case 'cylinder': {
        const cylinder = this.scene.cylinders.get(this.target.id)
        if (!cylinder) return null
        const bottomCenter = cylinder.bottomCenterPoint.position
        const topCenter = cylinder.topCenterPoint.position
        const axis = sub(topCenter, bottomCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
        const axisDir = scale(axis, 1 / axisLen)
        let refDir: Vec3
        if ('refDir' in pd && pd.refDir && 'bottomCenter' in pd && pd.bottomCenter && 'topCenter' in pd && pd.topCenter) {
          const oldRefDir = new Vec3(pd.refDir[0], pd.refDir[1], pd.refDir[2])
          const oldAxis = sub(new Vec3(pd.topCenter[0], pd.topCenter[1], pd.topCenter[2]), new Vec3(pd.bottomCenter[0], pd.bottomCenter[1], pd.bottomCenter[2]))
          const oldAxisLen = length(oldAxis)
          if (oldAxisLen > ObjectConstrainedPointConstraint.EPSILON) {
            const oldAxisDir = scale(oldAxis, 1 / oldAxisLen)
            refDir = this.rotateVec3ByDirChange(oldRefDir, oldAxisDir, axisDir)
            const projLen = dot(refDir, axisDir)
            refDir = sub(refDir, scale(axisDir, projLen))
            const refLen = length(refDir)
            if (refLen <= 1e-10) {
              refDir = this.getConeRadialDir(axisDir)
            } else {
              refDir = scale(refDir, 1 / refLen)
            }
          } else {
            refDir = this.getConeRadialDir(axisDir)
          }
        } else {
          refDir = this.getConeRadialDir(axisDir)
        }
        const cosA = Math.cos(pd.angle)
        const sinA = Math.sin(pd.angle)
        const radialDir = add(scale(refDir, cosA), scale(this.getCrossProduct(axisDir, refDir), sinA))
        const R = cylinder.radiusValue
        const onAxis = add(bottomCenter, scale(axisDir, pd.t * axisLen))
        return add(onAxis, scale(radialDir, R))
      }
      case 'cylinderBottom':
      case 'cylinderTop': {
        const cylinder = this.scene.cylinders.get(this.target.id)
        if (!cylinder) return null
        const bottomCenter = cylinder.bottomCenterPoint.position
        const topCenter = cylinder.topCenterPoint.position
        const axis = sub(topCenter, bottomCenter)
        const axisLen = length(axis)
        if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
        const axisDir = scale(axis, 1 / axisLen)
        let refDir: Vec3
        if ('refDir' in pd && pd.refDir && 'bottomCenter' in pd && pd.bottomCenter && 'topCenter' in pd && pd.topCenter) {
          const oldRefDir = new Vec3(pd.refDir[0], pd.refDir[1], pd.refDir[2])
          const oldAxis = sub(new Vec3(pd.topCenter[0], pd.topCenter[1], pd.topCenter[2]), new Vec3(pd.bottomCenter[0], pd.bottomCenter[1], pd.bottomCenter[2]))
          const oldAxisLen = length(oldAxis)
          if (oldAxisLen > ObjectConstrainedPointConstraint.EPSILON) {
            const oldAxisDir = scale(oldAxis, 1 / oldAxisLen)
            refDir = this.rotateVec3ByDirChange(oldRefDir, oldAxisDir, axisDir)
            const projLen = dot(refDir, axisDir)
            refDir = sub(refDir, scale(axisDir, projLen))
            const refLen = length(refDir)
            refDir = refLen <= 1e-10 ? this.getConeRadialDir(axisDir) : scale(refDir, 1 / refLen)
          } else {
            refDir = this.getConeRadialDir(axisDir)
          }
        } else {
          refDir = this.getConeRadialDir(axisDir)
        }
        const cosA = Math.cos(pd.angle)
        const sinA = Math.sin(pd.angle)
        const radialDir = add(scale(refDir, cosA), scale(this.getCrossProduct(axisDir, refDir), sinA))
        const center = pd.type === 'cylinderTop' ? topCenter : bottomCenter
        const radialRatio = Math.max(0, Math.min(pd.radialRatio ?? ((pd.onCircle ?? null) ? 1 : 0), 1))
        return add(center, scale(radialDir, cylinder.radiusValue * radialRatio))
      }
      case 'xAxis':
        return new Vec3(pd.t, 0, 0)
      case 'yAxis':
        return new Vec3(0, pd.t, 0)
      case 'zAxis':
        return new Vec3(0, 0, pd.t)
    }
  }

  private rotateVec3ByDirChange(v: Vec3, fromDir: Vec3, toDir: Vec3): Vec3 {
    const fromLen = length(fromDir)
    const toLen = length(toDir)
    if (fromLen <= 1e-10 || toLen <= 1e-10) return v
    const from = scale(fromDir, 1 / fromLen)
    const to = scale(toDir, 1 / toLen)
    const d = dot(from, to)
    if (d >= 1 - 1e-10) return v
    if (d <= -1 + 1e-10) {
      const perp = this.getConeRadialDir(from)
      return sub(scale(perp, 2 * dot(perp, v)), v)
    }
    const cosA = d
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA))
    const kRaw = new Vec3(
      from.y * to.z - from.z * to.y,
      from.z * to.x - from.x * to.z,
      from.x * to.y - from.y * to.x,
    )
    const kLen = length(kRaw)
    if (kLen <= 1e-10) return v
    const k = scale(kRaw, 1 / kLen)
    const kCrossV = new Vec3(
      k.y * v.z - k.z * v.y,
      k.z * v.x - k.x * v.z,
      k.x * v.y - k.y * v.x,
    )
    const kDotV = dot(k, v)
    return add(
      add(scale(v, cosA), scale(kCrossV, sinA)),
      scale(k, kDotV * (1 - cosA)),
    )
  }

  private getPointPosition(): Vec3 {
    const point = this.scene.points.get(this.pointId)
    return point ? point.position : new Vec3()
  }

  private projectToConstraint(pos: Vec3): Vec3 | null {
    switch (this.target.type) {
      case 'line': return this.projectToLine(pos)
      case 'straightLine': return this.projectToStraightLine(pos)
      case 'ray': return this.projectToRay(pos)
      case 'vector': return this.projectToVector(pos)
      case 'perpendicularLine': return this.projectToPerpendicularLine(pos)
      case 'parallelLine': return this.projectToParallelLine(pos)
      case 'circle': return this.projectToCircle(pos)
      case 'face': return this.projectToFace(pos)
      case 'sphere': return this.projectToSphere(pos)
      case 'cone': return this.projectToCone(pos)
      case 'coneBase': return this.projectToConeBase(pos)
      case 'cylinder': return this.projectToCylinder(pos)
      case 'cylinderBottom': return this.projectToCylinderBase(pos, 'bottom')
      case 'cylinderTop': return this.projectToCylinderBase(pos, 'top')
      case 'xAxis': return this.projectToAxis(pos, new Vec3(1, 0, 0))
      case 'yAxis': return this.projectToAxis(pos, new Vec3(0, 1, 0))
      case 'zAxis': return this.projectToAxis(pos, new Vec3(0, 0, 1))
      default: return null
    }
  }

  private projectToLine(pos: Vec3): Vec3 | null {
    const line = this.scene.lines.get(this.target.id)
    if (!line) return null
    return projectToSegment(pos, line.p1.position, line.p2.position)
  }

  private projectToStraightLine(pos: Vec3): Vec3 | null {
    const sl = this.scene.straightLines.get(this.target.id)
    if (!sl) return null
    return projectToInfiniteLine(pos, sl.p1.position, sl.p2.position)
  }

  private projectToRay(pos: Vec3): Vec3 | null {
    const ray = this.scene.rays.get(this.target.id)
    if (!ray) return null
    return projectToRayImpl(pos, ray.p1.position, ray.p2.position)
  }

  private projectToVector(pos: Vec3): Vec3 | null {
    const vec = this.scene.vectors.get(this.target.id)
    if (!vec) return null
    return projectToSegment(pos, vec.p1.position, vec.p2.position)
  }

  private projectToPerpendicularLine(pos: Vec3): Vec3 | null {
    const pl = this.scene.perpendicularLines.get(this.target.id)
    if (!pl) return null
    return projectToInfiniteLine(pos, pl.p1.position, pl.p2.position)
  }

  private projectToParallelLine(pos: Vec3): Vec3 | null {
    const pll = this.scene.parallelLines.get(this.target.id)
    if (!pll) return null
    return projectToInfiniteLine(pos, pll.p1.position, pll.p2.position)
  }

  private resolveDirectionForCircle(circle: Circle3): Vec3 | null {
    let resolvedDirection: Vec3 | null = circle.isNormalCircle() && circle.directionType && circle.directionId
      ? this.resolveDirectionVector(circle.directionType, circle.directionId)
      : null

    if (circle.isNormalCircle()) {
      const coneIds = this.scene.getConesForCircle(circle.id)
      for (const coneId of coneIds) {
        const cone = this.scene.cones.get(coneId)
        if (cone) {
          const axis = sub(cone.apexPoint.position, cone.baseCenterPoint.position)
          if (length(axis) > 1e-8) {
            resolvedDirection = axis
            break
          }
        }
      }
      if (!coneIds.length) {
        const cylinderIds = this.scene.getCylindersForCircle(circle.id)
        for (const cylId of cylinderIds) {
          const cyl = this.scene.cylinders.get(cylId)
          if (cyl) {
            const axis = sub(cyl.topCenterPoint.position, cyl.bottomCenterPoint.position)
            if (length(axis) > 1e-8) {
              resolvedDirection = axis
              break
            }
          }
        }
      }
    }

    return resolvedDirection
  }

  private projectToCircle(pos: Vec3): Vec3 | null {
    const circle = this.scene.circles.get(this.target.id)
    if (!circle) return null
    const frame = circle.getFrame(this.resolveDirectionForCircle(circle))
    if (!frame) return null
    return this.projectToCircleWithFrame(pos, frame)
  }

  private projectToCircleWithFrame(pos: Vec3, frame: { center: Vec3; radius: number; uAxis: Vec3; vAxis: Vec3 }): Vec3 | null {
    const diff = sub(pos, frame.center)
    const inPlaneU = dot(diff, frame.uAxis)
    const inPlaneV = dot(diff, frame.vAxis)
    const inPlaneLen = Math.hypot(inPlaneU, inPlaneV)
    if (inPlaneLen <= ObjectConstrainedPointConstraint.EPSILON) {
      return add(frame.center, scale(frame.uAxis, frame.radius))
    }
    const scaleFactor = frame.radius / inPlaneLen
    return add(frame.center, add(scale(frame.uAxis, inPlaneU * scaleFactor), scale(frame.vAxis, inPlaneV * scaleFactor)))
  }

  private projectToFace(pos: Vec3): Vec3 | null {
    const face = this.scene.faces.get(this.target.id)
    if (!face) return null
    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    if (boundaryPoints.length < 3) return null
    const supportPoints = face.getSupportPoints(this.scene.points)
    const plane =
      computePlaneBasis(supportPoints.map((p) => p.position)) ??
      computePlaneBasis(boundaryPoints.map((p) => p.position))
    if (!plane) return null

    const projected = projectPointToPlane(pos, plane)

    const projected2D = projectPoint2D(projected, plane)
    const boundary2D = boundaryPoints.map((p, i) => {
      const p2d = projectPoint2D(p.position, plane)
      return { id: `b${i}`, x: p2d.x, y: p2d.y }
    })

    if (isPointInConvexPolygon(projected2D.x, projected2D.y, boundary2D)) {
      return projected
    }

    return projectToPolygonBoundary(projected, boundaryPoints)
  }

  private projectToSphere(pos: Vec3): Vec3 | null {
    const sphere = this.scene.spheres.get(this.target.id)
    if (!sphere) return null
    const radius = sphere.getRadius()
    if (radius <= ObjectConstrainedPointConstraint.EPSILON) return null
    const diff = sub(pos, sphere.centerPoint.position)
    const dist = length(diff)
    if (dist <= ObjectConstrainedPointConstraint.EPSILON) {
      return add(sphere.centerPoint.position, new Vec3(radius, 0, 0))
    }
    return add(sphere.centerPoint.position, scale(diff, radius / dist))
  }

  private projectToCone(pos: Vec3): Vec3 | null {
    const cone = this.scene.cones.get(this.target.id)
    if (!cone) return null
    const baseCenter = cone.baseCenterPoint.position
    const apex = cone.apexPoint.position
    const axis = sub(apex, baseCenter)
    const axisLen = length(axis)
    if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
    const axisDir = scale(axis, 1 / axisLen)
    const R = cone.radiusValue
    if (R <= ObjectConstrainedPointConstraint.EPSILON) return new Vec3(apex.x, apex.y, apex.z)

    const diff = sub(pos, baseCenter)
    const alongAxis = dot(diff, axisDir)
    const radial = sub(diff, scale(axisDir, alongAxis))
    const radialLen = length(radial)

    const radialDir = radialLen > ObjectConstrainedPointConstraint.EPSILON
      ? scale(radial, 1 / radialLen)
      : this.getConeRadialDir(axisDir)

    return this.projectToConeSlant(pos, baseCenter, apex, R, radialDir)
  }

  private projectToConeBase(pos: Vec3): Vec3 | null {
    const cone = this.scene.cones.get(this.target.id)
    if (!cone) return null
    const baseCenter = cone.baseCenterPoint.position
    const apex = cone.apexPoint.position
    const axis = sub(apex, baseCenter)
    const axisLen = length(axis)
    if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
    const axisDir = scale(axis, 1 / axisLen)
    const R = cone.radiusValue
    if (R <= ObjectConstrainedPointConstraint.EPSILON) return new Vec3(baseCenter.x, baseCenter.y, baseCenter.z)
    return this.projectToConeBaseDisk(pos, baseCenter, axisDir, R)
  }

  private projectToConeBaseDisk(
    pos: Vec3,
    baseCenter: Vec3,
    axisDir: Vec3,
    R: number,
  ): Vec3 {
    const diff = sub(pos, baseCenter)
    const alongAxis = dot(diff, axisDir)
    const radial = sub(diff, scale(axisDir, alongAxis))
    const radialLen = length(radial)

    if (radialLen <= ObjectConstrainedPointConstraint.EPSILON) {
      return new Vec3(baseCenter.x, baseCenter.y, baseCenter.z)
    }

    if (radialLen <= R) {
      return add(baseCenter, radial)
    }

    const radialDir = scale(radial, 1 / radialLen)
    return add(baseCenter, scale(radialDir, R))
  }

  private projectToConeSlant(
    pos: Vec3,
    baseCenter: Vec3,
    apex: Vec3,
    R: number,
    radialDir: Vec3,
  ): Vec3 {
    const baseEdge = add(baseCenter, scale(radialDir, R))
    const slantDir = sub(apex, baseEdge)
    const slantLenSq = lengthSq(slantDir)
    if (slantLenSq <= 1e-12) return new Vec3(apex.x, apex.y, apex.z)

    const toPoint = sub(pos, baseEdge)
    const t = Math.max(0, Math.min(1, dot(toPoint, slantDir) / slantLenSq))

    const onSlant = add(baseEdge, scale(slantDir, t))
    return onSlant
  }

  private getConeRadialDir(axisDir: Vec3): Vec3 {
    const absX = Math.abs(axisDir.x)
    const absY = Math.abs(axisDir.y)
    const absZ = Math.abs(axisDir.z)
    let perp: Vec3
    if (absX <= absY && absX <= absZ) {
      perp = new Vec3(1, 0, 0)
    } else if (absY <= absZ) {
      perp = new Vec3(0, 1, 0)
    } else {
      perp = new Vec3(0, 0, 1)
    }
    const cross = new Vec3(
      axisDir.y * perp.z - axisDir.z * perp.y,
      axisDir.z * perp.x - axisDir.x * perp.z,
      axisDir.x * perp.y - axisDir.y * perp.x,
    )
    const crossLen = length(cross)
    if (crossLen <= 1e-10) return new Vec3(1, 0, 0)
    return scale(cross, 1 / crossLen)
  }

  private getCrossProduct(a: Vec3, b: Vec3): Vec3 {
    return new Vec3(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x,
    )
  }

  private projectToCylinder(pos: Vec3): Vec3 | null {
    const cylinder = this.scene.cylinders.get(this.target.id)
    if (!cylinder) return null
    const bottomCenter = cylinder.bottomCenterPoint.position
    const topCenter = cylinder.topCenterPoint.position
    const axis = sub(topCenter, bottomCenter)
    const axisLen = length(axis)
    if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
    const axisDir = scale(axis, 1 / axisLen)
    const R = cylinder.radiusValue
    if (R <= ObjectConstrainedPointConstraint.EPSILON) return new Vec3(bottomCenter.x, bottomCenter.y, bottomCenter.z)

    const diff = sub(pos, bottomCenter)
    const alongAxis = dot(diff, axisDir)
    const radial = sub(diff, scale(axisDir, alongAxis))
    const radialLen = length(radial)

    const radialDir = radialLen > ObjectConstrainedPointConstraint.EPSILON
      ? scale(radial, 1 / radialLen)
      : this.getConeRadialDir(axisDir)

    return this.projectToCylinderSide(pos, bottomCenter, topCenter, axisDir, axisLen, R, radialDir)
  }

  private projectToCylinderBase(pos: Vec3, which: 'bottom' | 'top'): Vec3 | null {
    const cylinder = this.scene.cylinders.get(this.target.id)
    if (!cylinder) return null
    const bottomCenter = cylinder.bottomCenterPoint.position
    const topCenter = cylinder.topCenterPoint.position
    const axis = sub(topCenter, bottomCenter)
    const axisLen = length(axis)
    if (axisLen <= ObjectConstrainedPointConstraint.EPSILON) return null
    const axisDir = scale(axis, 1 / axisLen)
    const center = which === 'top' ? topCenter : bottomCenter
    const R = cylinder.radiusValue
    if (R <= ObjectConstrainedPointConstraint.EPSILON) return new Vec3(center.x, center.y, center.z)
    return this.projectToCylinderDisk(pos, center, axisDir, R)
  }

  private projectToCylinderSide(
    pos: Vec3,
    bottomCenter: Vec3,
    topCenter: Vec3,
    axisDir: Vec3,
    axisLen: number,
    R: number,
    radialDir: Vec3,
  ): Vec3 {
    const diff = sub(pos, bottomCenter)
    const alongAxis = dot(diff, axisDir)
    const t = Math.max(0, Math.min(alongAxis, axisLen))
    const onAxis = add(bottomCenter, scale(axisDir, t))
    return add(onAxis, scale(radialDir, R))
  }

  private projectToCylinderDisk(
    pos: Vec3,
    center: Vec3,
    axisDir: Vec3,
    R: number,
  ): Vec3 {
    const diff = sub(pos, center)
    const radial = sub(diff, scale(axisDir, dot(diff, axisDir)))
    const radialLen = length(radial)
    if (radialLen <= ObjectConstrainedPointConstraint.EPSILON) {
      return new Vec3(center.x, center.y, center.z)
    }
    if (radialLen <= R) {
      return add(center, radial)
    }
    const radialDir = scale(radial, 1 / radialLen)
    return add(center, scale(radialDir, R))
  }

  private projectToAxis(pos: Vec3, axisDir: Vec3): Vec3 | null {
    const t = dot(pos, axisDir)
    return scale(axisDir, t)
  }

  private resolveDirectionVector(directionType: string, directionId: string): Vec3 | null {
    if (directionType === 'point') {
      return new Vec3(0, 1, 0)
    }
    if (directionType === 'line') {
      const l = this.scene.lines.get(directionId)
      return l ? l.getNormalizedDirectionVector() : null
    }
    if (directionType === 'straightLine') {
      const sl = this.scene.straightLines.get(directionId)
      return sl ? sl.getNormalizedDirectionVector() : null
    }
    if (directionType === 'ray') {
      const r = this.scene.rays.get(directionId)
      return r ? r.getNormalizedDirectionVector() : null
    }
    if (directionType === 'vector') {
      const v = this.scene.vectors.get(directionId)
      return v ? v.getNormalizedDirectionVector() : null
    }
    return null
  }
}

function projectToSegment(pos: Vec3, a: Vec3, b: Vec3): Vec3 | null {
  const ab = sub(b, a)
  const abLenSq = lengthSq(ab)
  if (abLenSq <= 1e-12) return a
  const ap = sub(pos, a)
  const t = Math.max(0, Math.min(1, dot(ap, ab) / abLenSq))
  return add(a, scale(ab, t))
}

function projectToInfiniteLine(pos: Vec3, a: Vec3, b: Vec3): Vec3 | null {
  const ab = sub(b, a)
  const abLenSq = lengthSq(ab)
  if (abLenSq <= 1e-12) return a
  const ap = sub(pos, a)
  const t = dot(ap, ab) / abLenSq
  return add(a, scale(ab, t))
}

function projectToRayImpl(pos: Vec3, origin: Vec3, through: Vec3): Vec3 | null {
  const dir = sub(through, origin)
  const dirLenSq = lengthSq(dir)
  if (dirLenSq <= 1e-12) return origin
  const diff = sub(pos, origin)
  const t = Math.max(0, dot(diff, dir) / dirLenSq)
  return add(origin, scale(dir, t))
}

function isPointInConvexPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  const n = polygon.length
  if (n < 3) return false
  let sign = 0
  for (let i = 0; i < n; i++) {
    const curr = polygon[i]!
    const next = polygon[(i + 1) % n]!
    const cross = (next.x - curr.x) * (py - curr.y) - (next.y - curr.y) * (px - curr.x)
    if (Math.abs(cross) < 1e-6) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) { sign = s } else if (s !== sign) { return false }
  }
  return true
}

function projectToPolygonBoundary(pos: Vec3, boundaryPoints: Array<{ position: Vec3 }>): Vec3 | null {
  let minDist = Infinity
  let closest: Vec3 | null = null
  const n = boundaryPoints.length
  for (let i = 0; i < n; i++) {
    const a = boundaryPoints[i]!.position
    const b = boundaryPoints[(i + 1) % n]!.position
    const projected = projectToSegment(pos, a, b)
    if (!projected) continue
    const dist = lengthSq(sub(pos, projected))
    if (dist < minDist) {
      minDist = dist
      closest = projected
    }
  }
  return closest
}

function computeSegmentT(pos: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a)
  const abLenSq = lengthSq(ab)
  if (abLenSq <= 1e-12) return 0
  const ap = sub(pos, a)
  return dot(ap, ab) / abLenSq
}
