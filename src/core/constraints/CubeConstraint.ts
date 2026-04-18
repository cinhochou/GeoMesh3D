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

export class CubeConstraint {
  constructor(
    private scene: Scene,
    public readonly cubeId: string,
    public readonly ownerPointIds: [string, string],
    public readonly dependentLayouts: CubePointLayout[],
    public readonly faceIds: string[],
    public readonly sourceLineId: string | null,
    private readonly vAxisHint: Vec3,
    public name: string = '正六面体1',
    public edgeLengthLocked: boolean = false,
    public lockedEdgeLength: number | null = null,
  ) {}

  private resolveAxes() {
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

  solve() {
    const axes = this.resolveAxes()
    if (!axes) return

    const draggedDependentLayout = this.dependentLayouts.find(({ pointId }) =>
      this.scene.activeDraggedPointIds.has(pointId),
    )
    if (draggedDependentLayout) {
      const draggedPoint = this.scene.points.get(draggedDependentLayout.pointId)
      const ownerA = this.scene.points.get(this.ownerPointIds[0])
      const ownerB = this.scene.points.get(this.ownerPointIds[1])
      if (draggedPoint && ownerA && ownerB && !ownerA.locked && !ownerB.locked) {
        const expectedPosition = new Vec3(
          axes.origin.x +
            axes.uAxis.x * draggedDependentLayout.x * axes.edgeLength +
            axes.vAxis.x * draggedDependentLayout.y * axes.edgeLength +
            axes.wAxis.x * draggedDependentLayout.z * axes.edgeLength,
          axes.origin.y +
            axes.uAxis.y * draggedDependentLayout.x * axes.edgeLength +
            axes.vAxis.y * draggedDependentLayout.y * axes.edgeLength +
            axes.wAxis.y * draggedDependentLayout.z * axes.edgeLength,
          axes.origin.z +
            axes.uAxis.z * draggedDependentLayout.x * axes.edgeLength +
            axes.vAxis.z * draggedDependentLayout.y * axes.edgeLength +
            axes.wAxis.z * draggedDependentLayout.z * axes.edgeLength,
        )
        const delta = subtract(draggedPoint.position, expectedPosition)
        if (length(delta) > 1e-8) {
          ownerA.setPosition(ownerA.position.add(delta))
          ownerB.setPosition(ownerB.position.add(delta))
          axes.origin = ownerA.position
        }
      }
    }

    this.dependentLayouts.forEach(({ pointId, x, y, z }) => {
      const point = this.scene.points.get(pointId)
      if (!point || point.locked) return

      point.setPosition(
        new Vec3(
          axes.origin.x +
            axes.uAxis.x * x * axes.edgeLength +
            axes.vAxis.x * y * axes.edgeLength +
            axes.wAxis.x * z * axes.edgeLength,
          axes.origin.y +
            axes.uAxis.y * x * axes.edgeLength +
            axes.vAxis.y * y * axes.edgeLength +
            axes.wAxis.y * z * axes.edgeLength,
          axes.origin.z +
            axes.uAxis.z * x * axes.edgeLength +
            axes.vAxis.z * y * axes.edgeLength +
            axes.wAxis.z * z * axes.edgeLength,
        ),
      )
    })
  }
}
