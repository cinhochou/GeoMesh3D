import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'

type RegularPolygonPointLayout = {
  pointId: string
  angleIndex: number
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

const normalize = (v: Vec3) => {
  const len = length(v)
  if (len <= 1e-8) return null
  return new Vec3(v.x / len, v.y / len, v.z / len)
}

const subtract = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)

const projectPerpendicular = (vector: Vec3, axis: Vec3) => {
  const factor = dot(vector, axis)
  return new Vec3(
    vector.x - axis.x * factor,
    vector.y - axis.y * factor,
    vector.z - axis.z * factor,
  )
}

const chooseFallbackAxis = (axis: Vec3) => {
  const basis = [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)]
  return basis.reduce((best, candidate) =>
    Math.abs(dot(candidate, axis)) < Math.abs(dot(best, axis)) ? candidate : best,
  )
}

export class RegularPolygonConstraint {
  constructor(
    private scene: Scene,
    public readonly constraintId: string,
    public readonly ownerPointIds: [string, string],
    public readonly dependentLayouts: RegularPolygonPointLayout[],
    public readonly faceId: string,
    public readonly vertexCount: number,
    private readonly vAxisHint: Vec3,
    public name: string = '正多边形1',
    public edgeLengthLocked: boolean = false,
    public lockedEdgeLength: number | null = null,
    public valueVisible: boolean = false,
  ) {}

  setAxisHint(nextHint: Vec3) {
    this.vAxisHint.x = nextHint.x
    this.vAxisHint.y = nextHint.y
    this.vAxisHint.z = nextHint.z
  }

  getVAxisHint() {
    return this.vAxisHint
  }

  getResolvedAxes() {
    const p1 = this.scene.points.get(this.ownerPointIds[0])
    const p2 = this.scene.points.get(this.ownerPointIds[1])
    if (!p1 || !p2) return null

    const edge = subtract(p2.position, p1.position)
    const uAxis = normalize(edge)
    const edgeLength = length(edge)
    if (!uAxis || edgeLength <= 1e-8) return null

    const projectedHint = projectPerpendicular(this.vAxisHint, uAxis)
    const fallbackProjected = projectPerpendicular(chooseFallbackAxis(uAxis), uAxis)
    const vAxis = normalize(projectedHint) ?? normalize(fallbackProjected)
    if (!vAxis) return null

    const circumradius = edgeLength / (2 * Math.sin(Math.PI / this.vertexCount))
    const halfTan = edgeLength / (2 * Math.tan(Math.PI / this.vertexCount))
    const center = new Vec3(
      p1.position.x + (edgeLength / 2) * uAxis.x + halfTan * vAxis.x,
      p1.position.y + (edgeLength / 2) * uAxis.y + halfTan * vAxis.y,
      p1.position.z + (edgeLength / 2) * uAxis.z + halfTan * vAxis.z,
    )

    return {
      origin: p1.position,
      edgeLength,
      uAxis,
      vAxis,
      center,
      circumradius,
    }
  }

  getLayoutPosition(
    angleIndex: number,
    axes: NonNullable<ReturnType<RegularPolygonConstraint['getResolvedAxes']>>,
  ) {
    const alpha = -Math.PI / 2 - Math.PI / this.vertexCount + (2 * Math.PI * angleIndex) / this.vertexCount
    const cosA = Math.cos(alpha)
    const sinA = Math.sin(alpha)

    return new Vec3(
      axes.center.x + axes.circumradius * (axes.uAxis.x * cosA + axes.vAxis.x * sinA),
      axes.center.y + axes.circumradius * (axes.uAxis.y * cosA + axes.vAxis.y * sinA),
      axes.center.z + axes.circumradius * (axes.uAxis.z * cosA + axes.vAxis.z * sinA),
    )
  }

  getDependencyPointIds() {
    return [this.ownerPointIds[0], this.ownerPointIds[1], ...this.dependentLayouts.map((item) => item.pointId)]
  }

  getEdgeLength() {
    const axes = this.getResolvedAxes()
    return axes?.edgeLength ?? 0
  }

  getCentroid() {
    const axes = this.getResolvedAxes()
    return axes?.center ?? null
  }

  getArea() {
    const edgeLength = this.getEdgeLength()
    if (edgeLength <= 0) return 0
    return (this.vertexCount * edgeLength * edgeLength) / (4 * Math.tan(Math.PI / this.vertexCount))
  }

  solve() {
    const axes = this.getResolvedAxes()
    if (!axes) return

    this.dependentLayouts.forEach(({ pointId, angleIndex }) => {
      const point = this.scene.points.get(pointId)
      if (!point || point.locked) return
      point.setPosition(this.getLayoutPosition(angleIndex, axes))
    })
  }
}
