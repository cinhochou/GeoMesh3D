import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
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

export class SyncLockStateCommand implements Command {
  constructor(
    private pointTransforms: PointLockTransform[],
    private lineTransforms: LineLockTransform[],
    private straightLineTransforms: StraightLineLockTransform[],
    private rayTransforms: RayLockTransform[],
    private vectorTransforms: VectorLockTransform[] = [],
    private faceTransforms: FaceLockTransform[] = [],
    private circleTransforms: CircleLockTransform[] = [],
    private sphereTransforms: SphereLockTransform[] = [],
    private coneTransforms: ConeLockTransform[] = [],
    private cylinderTransforms: CylinderLockTransform[] = [],
    private perpendicularLineTransforms: PerpendicularLineLockTransform[] = [],
  ) {}

  execute() {
    this.pointTransforms.forEach(({ point, after }) => {
      point.userLocked = after
    })
    this.lineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
    this.straightLineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
    this.rayTransforms.forEach(({ ray, after }) => {
      ray.userLocked = after
    })
    this.vectorTransforms.forEach(({ vector, after }) => {
      vector.userLocked = after
    })
    this.faceTransforms.forEach(({ face, after }) => {
      face.userLocked = after
    })
    this.circleTransforms.forEach(({ circle, after }) => {
      circle.userLocked = after
    })
    this.sphereTransforms.forEach(({ sphere, after }) => {
      sphere.userLocked = after
    })
    this.coneTransforms.forEach(({ cone, after }) => {
      cone.userLocked = after
    })
    this.cylinderTransforms.forEach(({ cylinder, after }) => {
      cylinder.userLocked = after
    })
    this.perpendicularLineTransforms.forEach(({ line, after }) => {
      line.userLocked = after
    })
  }

  undo() {
    this.pointTransforms.forEach(({ point, before }) => {
      point.userLocked = before
    })
    this.lineTransforms.forEach(({ line, before }) => {
      line.userLocked = before
    })
    this.straightLineTransforms.forEach(({ line, before }) => {
      line.userLocked = before
    })
    this.rayTransforms.forEach(({ ray, before }) => {
      ray.userLocked = before
    })
    this.vectorTransforms.forEach(({ vector, before }) => {
      vector.userLocked = before
    })
    this.faceTransforms.forEach(({ face, before }) => {
      face.userLocked = before
    })
    this.circleTransforms.forEach(({ circle, before }) => {
      circle.userLocked = before
    })
    this.sphereTransforms.forEach(({ sphere, before }) => {
      sphere.userLocked = before
    })
    this.coneTransforms.forEach(({ cone, before }) => {
      cone.userLocked = before
    })
    this.cylinderTransforms.forEach(({ cylinder, before }) => {
      cylinder.userLocked = before
    })
    this.perpendicularLineTransforms.forEach(({ line, before }) => {
      line.userLocked = before
    })
  }
}
