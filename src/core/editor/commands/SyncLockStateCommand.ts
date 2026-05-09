import type { Command } from '../Command'
import { Point3 } from '../../geometry/Point3'
import { Line3 } from '../../geometry/Line3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { Circle3 } from '../../geometry/Circle3'

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

export class SyncLockStateCommand implements Command {
  constructor(
    private pointTransforms: PointLockTransform[],
    private lineTransforms: LineLockTransform[],
    private straightLineTransforms: StraightLineLockTransform[],
    private rayTransforms: RayLockTransform[],
    private vectorTransforms: VectorLockTransform[] = [],
    private faceTransforms: FaceLockTransform[] = [],
    private circleTransforms: CircleLockTransform[] = [],
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
  }
}
