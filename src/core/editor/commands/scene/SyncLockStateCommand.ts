import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Circle3 } from '../../../geometry/Circle3'
import { Sphere3 } from '../../../geometry/Sphere3'
import { Cone3 } from '../../../geometry/Cone3'
import { Cylinder3 } from '../../../geometry/Cylinder3'

type PointLockTransform = {
  point: Point3
  before: boolean
  after: boolean
}

type LineLockTransform = {
  line: Line3
  before: boolean
  after: boolean
}

type StraightLineLockTransform = {
  line: StraightLine3
  before: boolean
  after: boolean
}

type RayLockTransform = {
  ray: Ray3
  before: boolean
  after: boolean
}

type VectorLockTransform = {
  vector: GeoVector3
  before: boolean
  after: boolean
}

type FaceLockTransform = {
  face: PlanarPolygon
  before: boolean
  after: boolean
}

type CircleLockTransform = {
  circle: Circle3
  before: boolean
  after: boolean
}

type SphereLockTransform = {
  sphere: Sphere3
  before: boolean
  after: boolean
}

type ConeLockTransform = {
  cone: Cone3
  before: boolean
  after: boolean
}

type CylinderLockTransform = {
  cylinder: Cylinder3
  before: boolean
  after: boolean
}

type PerpendicularLineLockTransform = {
  line: PerpendicularLine3
  before: boolean
  after: boolean
}

type ParallelLineLockTransform = {
  line: ParallelLine3
  before: boolean
  after: boolean
}

export function createSyncLockStateCommand(
  scene: Scene,
  pointTransforms: PointLockTransform[],
  lineTransforms: LineLockTransform[],
  straightLineTransforms: StraightLineLockTransform[],
  rayTransforms: RayLockTransform[],
  vectorTransforms: VectorLockTransform[] = [],
  faceTransforms: FaceLockTransform[] = [],
  circleTransforms: CircleLockTransform[] = [],
  sphereTransforms: SphereLockTransform[] = [],
  coneTransforms: ConeLockTransform[] = [],
  cylinderTransforms: CylinderLockTransform[] = [],
  perpendicularLineTransforms: PerpendicularLineLockTransform[] = [],
  parallelLineTransforms: ParallelLineLockTransform[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('SyncLockStateCommand', scene, () => {
    pointTransforms.forEach(({ point, after }) => {
      point.userLocked = after
    })
    lineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
    straightLineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
    rayTransforms.forEach(({ ray, after }) => {
      ray.userLocked = after
    })
    vectorTransforms.forEach(({ vector, after }) => {
      vector.userLocked = after
    })
    faceTransforms.forEach(({ face, after }) => {
      face.userLocked = after
    })
    circleTransforms.forEach(({ circle, after }) => {
      circle.userLocked = after
    })
    sphereTransforms.forEach(({ sphere, after }) => {
      sphere.userLocked = after
    })
    coneTransforms.forEach(({ cone, after }) => {
      cone.userLocked = after
    })
    cylinderTransforms.forEach(({ cylinder, after }) => {
      cylinder.userLocked = after
    })
    perpendicularLineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
    parallelLineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
  })

  cmd.executeAndCapture()
  return cmd
}
