import { computePlaneBasis, projectPointToPlane, projectPoint2D } from '../geometry/PlanarUtils'
import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'
import type { ConstrainedToRef } from '../geometry/Point3'

const sub = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const add = (a: Vec3, b: Vec3) => new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)
const scale = (v: Vec3, s: number) => new Vec3(v.x * s, v.y * s, v.z * s)
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const lengthSq = (v: Vec3) => v.x * v.x + v.y * v.y + v.z * v.z
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

export type ParametricData =
  | { type: 'line' | 'vector'; t: number }
  | { type: 'straightLine'; t: number }
  | { type: 'ray'; t: number }
  | { type: 'circle'; angle: number }
  | { type: 'face'; localU: number; localV: number }
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

export class ObjectConstrainedPointConstraint {
  private static readonly EPSILON = 1e-5

  parametricData: ParametricData | null = null

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
      if (circle) { ids.push(circle.p1.id, circle.p2.id, circle.p3.id) }
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
    const isBeingDragged = this.scene.activeDraggedPointIds?.has(this.pointId) ?? false
    if (!isBeingDragged && this.parametricData) {
      const recomputed = this.recomputePosition()
      if (recomputed) {
        const finalPos = this.projectToConstraint(recomputed) ?? recomputed
        const dist = length(sub(point.position, finalPos))
        if (dist <= ObjectConstrainedPointConstraint.EPSILON) return
        point.setPosition(finalPos)
        this.computeParametricDataFromPosition(finalPos)
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

  projectPosition(pos: Vec3): Vec3 | null {
    return this.projectToConstraint(pos)
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
      case 'circle': {
        const circle = this.scene.circles.get(this.target.id)
        if (!circle) return
        const frame = circle.getFrame(
          this.resolveDirectionVector(circle.directionType ?? 'point', circle.directionId ?? ''),
        )
        if (!frame) return
        const diff = sub(pos, frame.center)
        const angle = Math.atan2(dot(diff, frame.vAxis), dot(diff, frame.uAxis))
        this.parametricData = { type: 'circle', angle }
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
        const origin = sp0.position
        const edge1 = sub(sp1.position, sp0.position)
        const edge1Len = length(edge1)
        if (edge1Len <= 1e-10) return
        const uAxis = scale(edge1, 1 / edge1Len)
        const edge2 = sub(sp2.position, sp0.position)
        const nRaw = this.getCrossProduct(edge1, edge2)
        const nLen = length(nRaw)
        if (nLen <= 1e-10) return
        const nAxis = scale(nRaw, 1 / nLen)
        const vAxis = this.getCrossProduct(nAxis, uAxis)
        const diff = sub(pos, origin)
        const localU = dot(diff, uAxis)
        const localV = dot(diff, vAxis)
        this.parametricData = { type: 'face', localU, localV }
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
        const R = cylinder.radiusValue
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
      case 'circle': {
        const circle = this.scene.circles.get(this.target.id)
        if (!circle) return null
        const frame = circle.getFrame(
          this.resolveDirectionVector(circle.directionType ?? 'point', circle.directionId ?? ''),
        )
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
        const origin = sp0.position
        const edge1 = sub(sp1.position, sp0.position)
        const edge1Len = length(edge1)
        if (edge1Len <= 1e-10) return null
        const uAxis = scale(edge1, 1 / edge1Len)
        const edge2 = sub(sp2.position, sp0.position)
        const nRaw = this.getCrossProduct(edge1, edge2)
        const nLen = length(nRaw)
        if (nLen <= 1e-10) return null
        const nAxis = scale(nRaw, 1 / nLen)
        const vAxis = this.getCrossProduct(nAxis, uAxis)
        return add(origin, add(scale(uAxis, pd.localU), scale(vAxis, pd.localV)))
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

  private projectToCircle(pos: Vec3): Vec3 | null {
    const circle = this.scene.circles.get(this.target.id)
    if (!circle) return null
    const frame = circle.getFrame(
      this.scene.points.size > 0
        ? this.resolveDirectionVector(circle.directionType ?? 'point', circle.directionId ?? '')
        : null,
    )
    if (!frame) return null
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
      const p = this.scene.points.get(directionId)
      return p ? p.position : null
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
