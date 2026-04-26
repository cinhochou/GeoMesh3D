import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'

type CubePointLayout = {
  pointId: string
  x: number
  y: number
  z: number
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

const normalize = (v: Vec3) => {
  const len = length(v)
  if (len <= 1e-8) return null
  return new Vec3(v.x / len, v.y / len, v.z / len)
}

const cross = (a: Vec3, b: Vec3) =>
  new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)

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

const AXIS_ALIGNMENT_EPSILON = 1e-6

const getSharedCoordinateNormal = (a: Vec3, b: Vec3) => {
  if (Math.abs(a.x - b.x) <= AXIS_ALIGNMENT_EPSILON) return new Vec3(1, 0, 0)
  if (Math.abs(a.y - b.y) <= AXIS_ALIGNMENT_EPSILON) return new Vec3(0, 1, 0)
  if (Math.abs(a.z - b.z) <= AXIS_ALIGNMENT_EPSILON) return new Vec3(0, 0, 1)
  return null
}

export class CubeConstraint {
  constructor(
    private scene: Scene,
    public readonly cubeId: string,
    public readonly solidType: 'hexahedron' | 'tetrahedron' = 'hexahedron',
    public readonly ownerPointIds: [string, string],
    public readonly dependentLayouts: CubePointLayout[],
    public readonly faceIds: string[],
    public readonly sourceLineId: string | null,
    private readonly vAxisHint: Vec3,
    public name: string = '正六面体1',
    public edgeLengthLocked: boolean = false,
    public lockedEdgeLength: number | null = null,
    public valueVisible: boolean = false,
  ) {}

  setAxisHint(nextHint: Vec3) {
    this.vAxisHint.x = nextHint.x
    this.vAxisHint.y = nextHint.y
    this.vAxisHint.z = nextHint.z
  }

  getResolvedAxes() {
    const p1 = this.scene.points.get(this.ownerPointIds[0])
    const p2 = this.scene.points.get(this.ownerPointIds[1])
    if (!p1 || !p2) return null

    const edge = subtract(p2.position, p1.position)
    const uAxis = normalize(edge)
    const edgeLength = length(edge)
    if (!uAxis || edgeLength <= 1e-8) return null

    const sharedNormal =
      this.solidType === 'tetrahedron' ? getSharedCoordinateNormal(p1.position, p2.position) : null
    const alignmentHint =
      sharedNormal &&
      Math.abs(dot(sharedNormal, uAxis)) <= 1 - AXIS_ALIGNMENT_EPSILON
        ? cross(sharedNormal, uAxis)
        : null

    const projectedHint = projectPerpendicular(alignmentHint ?? this.vAxisHint, uAxis)
    const fallbackProjected = projectPerpendicular(chooseFallbackAxis(uAxis), uAxis)
    const vAxis = normalize(projectedHint) ?? normalize(fallbackProjected)
    if (!vAxis) return null
    const wAxis = normalize(cross(uAxis, vAxis))
    if (!wAxis) return null

    return {
      origin: p1.position,
      edgeLength,
      uAxis,
      vAxis,
      wAxis,
    }
  }

  getLayoutPosition(
    layout: { x: number; y: number; z: number },
    axes: NonNullable<ReturnType<CubeConstraint['getResolvedAxes']>>,
  ) {
    return new Vec3(
      axes.origin.x +
        axes.uAxis.x * layout.x * axes.edgeLength +
        axes.vAxis.x * layout.y * axes.edgeLength +
        axes.wAxis.x * layout.z * axes.edgeLength,
      axes.origin.y +
        axes.uAxis.y * layout.x * axes.edgeLength +
        axes.vAxis.y * layout.y * axes.edgeLength +
        axes.wAxis.y * layout.z * axes.edgeLength,
      axes.origin.z +
        axes.uAxis.z * layout.x * axes.edgeLength +
        axes.vAxis.z * layout.y * axes.edgeLength +
        axes.wAxis.z * layout.z * axes.edgeLength,
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
    if (!axes) return null
    const edgeLength = axes.edgeLength
    const uFactor = 0.5
    const vFactor = this.solidType === 'tetrahedron' ? Math.sqrt(3) / 6 : 0.5
    const wFactor = this.solidType === 'tetrahedron' ? Math.sqrt(2 / 3) / 4 : 0.5

    return new Vec3(
      axes.origin.x +
        (axes.uAxis.x * uFactor + axes.vAxis.x * vFactor + axes.wAxis.x * wFactor) * edgeLength,
      axes.origin.y +
        (axes.uAxis.y * uFactor + axes.vAxis.y * vFactor + axes.wAxis.y * wFactor) * edgeLength,
      axes.origin.z +
        (axes.uAxis.z * uFactor + axes.vAxis.z * vFactor + axes.wAxis.z * wFactor) * edgeLength,
    )
  }

  getVolume() {
    const edgeLength = this.getEdgeLength()
    if (edgeLength <= 0) return 0
    return this.solidType === 'tetrahedron'
      ? (Math.sqrt(2) / 12) * edgeLength ** 3
      : edgeLength ** 3
  }

  solve() {
    const axes = this.getResolvedAxes()
    if (!axes) return

    this.dependentLayouts.forEach(({ pointId, x, y, z }) => {
      const point = this.scene.points.get(pointId)
      if (!point || point.locked) return

      point.setPosition(this.getLayoutPosition({ x, y, z }, axes))
    })
  }
}
