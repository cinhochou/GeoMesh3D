import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { Vec3 } from '../../geometry/Vec3'
import { Line3 } from '../../geometry/Line3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { Circle3, type CircleType, type DirectionType } from '../../geometry/Circle3'
import { Sphere3 } from '../../geometry/Sphere3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../constraints/RegularPolygonConstraint'

type LinearSnapshot<T extends Line3 | Ray3 | StraightLine3 | GeoVector3> = {
  item: T
  p1: Point3
  p2: Point3
}

type FaceSnapshot = {
  face: PlanarPolygon
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
  cubeOwnerPointIds: string[]
  cubeDependentPointIds: string[]
  regularPolygonOwnerPointIds: string[]
  regularPolygonDependentPointIds: string[]
}

type CubeSnapshot = {
  constraint: CubeConstraint
  ownerPointIds: [string, string]
  dependentLayouts: Array<{ pointId: string; x: number; y: number; z: number }>
}

type PointCubeSnapshot = {
  point: Point3
  cubeId: string | null
  cubeRole: 'owner' | 'dependent' | null
}

type RegularPolygonSnapshot = {
  constraint: RegularPolygonConstraint
  ownerPointIds: [string, string]
  dependentLayouts: Array<{ pointId: string; angleIndex: number }>
}

type PointRegularPolygonSnapshot = {
  point: Point3
  regularPolygonId: string | null
  regularPolygonRole: 'owner' | 'dependent' | null
}

type CircleSnapshot = {
  circle: Circle3
  p1: Point3
  p2: Point3
  p3: Point3
  centerPoint: Point3 | null
  centerPosition: Vec3 | null
  centerCircleId: string | null
  centerCircleRole: string | null
  movedPoints: Array<{ point: Point3; originalPosition: Vec3 }>
  circleType: CircleType
  directionType: DirectionType | null
  directionId: string | null
  lockedRadius: number | null
  keepPointCircleId: string | null
  keepPointCircleRole: 'center' | null
}

type SphereSnapshot = {
  sphere: Sphere3
  centerPoint: Point3
  radiusPoint: Point3 | null
  centerSphereId: string | null
  centerSphereRole: 'center' | 'radius' | null
  radiusSphereId: string | null
  radiusSphereRole: 'center' | 'radius' | null
}

export class MergePointsCommand implements Command {
  private lineSnapshots: Array<LinearSnapshot<Line3>>
  private straightLineSnapshots: Array<LinearSnapshot<StraightLine3>>
  private raySnapshots: Array<LinearSnapshot<Ray3>>
  private vectorSnapshots: Array<LinearSnapshot<GeoVector3>>
  private faceSnapshots: FaceSnapshot[]
  private cubeSnapshots: CubeSnapshot[]
  private pointCubeSnapshots: PointCubeSnapshot[]
  private regularPolygonSnapshots: RegularPolygonSnapshot[]
  private pointRegularPolygonSnapshots: PointRegularPolygonSnapshot[]
  private circleSnapshots: CircleSnapshot[]
  private sphereSnapshots: SphereSnapshot[]
  private keepPointCircleId: string | null
  private keepPointCircleRole: 'center' | null
  private keepPointLocked: boolean
  private keepPointUserLocked: boolean
  private removedLines = new Set<string>()
  private removedStraightLines = new Set<string>()
  private removedRays = new Set<string>()
  private removedVectors = new Set<string>()
  private removedFaces = new Set<string>()
  private removedCircles = new Set<string>()
  private removedSpheres = new Set<string>()

  constructor(
    private scene: Scene,
    private keepPoint: Point3,
    private removePoint: Point3,
  ) {
    this.keepPointCircleId = keepPoint.circleId
    this.keepPointCircleRole = keepPoint.circleRole
    this.keepPointLocked = keepPoint.locked
    this.keepPointUserLocked = keepPoint.userLocked
    this.lineSnapshots = [...scene.lines.values()]
      .filter((line) => line.p1.id === keepPoint.id || line.p2.id === keepPoint.id || line.p1.id === removePoint.id || line.p2.id === removePoint.id)
      .map((line) => ({ item: line, p1: line.p1, p2: line.p2 }))
    this.straightLineSnapshots = [...scene.straightLines.values()]
      .filter((line) => line.p1.id === keepPoint.id || line.p2.id === keepPoint.id || line.p1.id === removePoint.id || line.p2.id === removePoint.id)
      .map((line) => ({ item: line, p1: line.p1, p2: line.p2 }))
    this.raySnapshots = [...scene.rays.values()]
      .filter((ray) => ray.p1.id === keepPoint.id || ray.p2.id === keepPoint.id || ray.p1.id === removePoint.id || ray.p2.id === removePoint.id)
      .map((ray) => ({ item: ray, p1: ray.p1, p2: ray.p2 }))
    this.vectorSnapshots = [...scene.vectors.values()]
      .filter((vector) => vector.p1.id === keepPoint.id || vector.p2.id === keepPoint.id || vector.p1.id === removePoint.id || vector.p2.id === removePoint.id)
      .map((vector) => ({ item: vector, p1: vector.p1, p2: vector.p2 }))
    this.faceSnapshots = [...scene.faces.values()]
      .filter((face) => face.includesPoint(keepPoint.id) || face.includesPoint(removePoint.id))
      .map((face) => ({
        face,
        boundaryPointIds: [...face.boundaryPointIds],
        memberPointIds: [...face.memberPointIds],
        boundaryLineIds: [...face.boundaryLineIds],
        supportPointIds: [...face.supportPointIds],
        cubeOwnerPointIds: [...face.cubeOwnerPointIds],
        cubeDependentPointIds: [...face.cubeDependentPointIds],
        regularPolygonOwnerPointIds: [...face.regularPolygonOwnerPointIds],
        regularPolygonDependentPointIds: [...face.regularPolygonDependentPointIds],
      }))
    this.cubeSnapshots = [...scene.cubeConstraints.values()]
      .filter((constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint)
      .filter((constraint) =>
        [constraint.ownerPointIds[0], constraint.ownerPointIds[1], ...constraint.dependentLayouts.map((item) => item.pointId)].some(
          (pointId) => pointId === keepPoint.id || pointId === removePoint.id,
        ),
      )
      .map((constraint) => ({
        constraint,
        ownerPointIds: [...constraint.ownerPointIds] as [string, string],
        dependentLayouts: constraint.dependentLayouts.map((item) => ({ ...item })),
      }))
    const pointsToSnapshot = new Map<string, Point3>([
      [keepPoint.id, keepPoint],
      [removePoint.id, removePoint],
    ])
    this.cubeSnapshots.forEach(({ constraint }) => {
      const ownerA = scene.points.get(constraint.ownerPointIds[0])
      const ownerB = scene.points.get(constraint.ownerPointIds[1])
      if (ownerA) pointsToSnapshot.set(ownerA.id, ownerA)
      if (ownerB) pointsToSnapshot.set(ownerB.id, ownerB)
      constraint.dependentLayouts.forEach(({ pointId }) => {
        const point = scene.points.get(pointId)
        if (point) pointsToSnapshot.set(point.id, point)
      })
    })
    this.pointCubeSnapshots = [...pointsToSnapshot.values()].map((point) => ({
      point,
      cubeId: point.cubeId,
      cubeRole: point.cubeRole,
    }))

    this.regularPolygonSnapshots = [...scene.regularPolygonConstraints.values()]
      .filter((constraint): constraint is RegularPolygonConstraint => constraint instanceof RegularPolygonConstraint)
      .filter((constraint) =>
        [constraint.ownerPointIds[0], constraint.ownerPointIds[1], ...constraint.dependentLayouts.map((item) => item.pointId)].some(
          (pointId) => pointId === keepPoint.id || pointId === removePoint.id,
        ),
      )
      .map((constraint) => ({
        constraint,
        ownerPointIds: [...constraint.ownerPointIds] as [string, string],
        dependentLayouts: constraint.dependentLayouts.map((item) => ({ ...item })),
      }))
    const rpPointsToSnapshot = new Map<string, Point3>([
      [keepPoint.id, keepPoint],
      [removePoint.id, removePoint],
    ])
    this.regularPolygonSnapshots.forEach(({ constraint }) => {
      const ownerA = scene.points.get(constraint.ownerPointIds[0])
      const ownerB = scene.points.get(constraint.ownerPointIds[1])
      if (ownerA) rpPointsToSnapshot.set(ownerA.id, ownerA)
      if (ownerB) rpPointsToSnapshot.set(ownerB.id, ownerB)
      constraint.dependentLayouts.forEach(({ pointId }) => {
        const point = scene.points.get(pointId)
        if (point) rpPointsToSnapshot.set(point.id, point)
      })
    })
    this.pointRegularPolygonSnapshots = [...rpPointsToSnapshot.values()].map((point) => ({
      point,
      regularPolygonId: point.regularPolygonId,
      regularPolygonRole: point.regularPolygonRole,
    }))

    this.circleSnapshots = [...scene.circles.values()]
      .filter((circle) =>
        circle.p1.id === keepPoint.id || circle.p2.id === keepPoint.id || circle.p3.id === keepPoint.id ||
        circle.p1.id === removePoint.id || circle.p2.id === removePoint.id || circle.p3.id === removePoint.id ||
        [...scene.points.values()].some(
          (p) => p.circleId === circle.id && p.circleRole === 'center' &&
            (p.id === keepPoint.id || p.id === removePoint.id),
        ),
      )
      .map((circle) => {
        const centerPoint = [...scene.points.values()].find(
          (p) => p.circleId === circle.id && p.circleRole === 'center',
        ) ?? null
        return {
          circle,
          p1: circle.p1,
          p2: circle.p2,
          p3: circle.p3,
          centerPoint,
          centerPosition: centerPoint ? centerPoint.position.clone() : null,
          centerCircleId: centerPoint ? centerPoint.circleId : null,
          centerCircleRole: centerPoint ? centerPoint.circleRole : null,
          movedPoints: [],
          circleType: circle.circleType,
          directionType: circle.directionType,
          directionId: circle.directionId,
          lockedRadius: circle.lockedRadius,
          keepPointCircleId: this.keepPoint.circleId,
          keepPointCircleRole: this.keepPoint.circleRole,
        }
      })

    this.sphereSnapshots = [...scene.spheres.values()]
      .filter((sphere) =>
        sphere.centerPoint.id === keepPoint.id || (sphere.radiusPoint && sphere.radiusPoint.id === keepPoint.id) ||
        sphere.centerPoint.id === removePoint.id || (sphere.radiusPoint && sphere.radiusPoint.id === removePoint.id),
      )
      .map((sphere) => ({
        sphere,
        centerPoint: sphere.centerPoint,
        radiusPoint: sphere.radiusPoint,
        centerSphereId: sphere.centerPoint.sphereId,
        centerSphereRole: sphere.centerPoint.sphereRole,
        radiusSphereId: sphere.radiusPoint?.sphereId ?? null,
        radiusSphereRole: sphere.radiusPoint?.sphereRole ?? null,
      }))
  }

  private replacePointId(ids: string[]) {
    return [...new Set(ids.map((id) => (id === this.removePoint.id ? this.keepPoint.id : id)))]
  }

  execute() {
    this.lineSnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.lines.delete(item.id)
        this.scene.selection.lines.delete(item.id)
        this.removedLines.add(item.id)
      }
    })

    this.straightLineSnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.straightLines.delete(item.id)
        this.scene.selection.straightLines.delete(item.id)
        this.removedStraightLines.add(item.id)
      }
    })

    this.raySnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.rays.delete(item.id)
        this.scene.selection.rays.delete(item.id)
        this.removedRays.add(item.id)
      }
    })

    this.vectorSnapshots.forEach(({ item }) => {
      if (item.p1.id === this.removePoint.id) item.p1 = this.keepPoint
      if (item.p2.id === this.removePoint.id) item.p2 = this.keepPoint
      if (item.p1.id === item.p2.id) {
        this.scene.vectors.delete(item.id)
        this.scene.selection.vectors.delete(item.id)
        this.removedVectors.add(item.id)
      }
    })

    this.faceSnapshots.forEach(({ face }) => {
      face.boundaryPointIds = this.replacePointId(face.boundaryPointIds)
      face.memberPointIds = this.replacePointId(face.memberPointIds)
      face.supportPointIds = this.replacePointId(face.supportPointIds)
      face.cubeOwnerPointIds = this.replacePointId(face.cubeOwnerPointIds)
      face.cubeDependentPointIds = this.replacePointId(face.cubeDependentPointIds)
      face.regularPolygonOwnerPointIds = this.replacePointId(face.regularPolygonOwnerPointIds)
      face.regularPolygonDependentPointIds = this.replacePointId(face.regularPolygonDependentPointIds)
      face.boundaryLineIds = face.boundaryLineIds.filter((lineId) => this.scene.lines.has(lineId))

      if (face.boundaryPointIds.length < 3 || face.memberPointIds.length < 3) {
        this.scene.removeFace(face.id)
        this.removedFaces.add(face.id)
        return
      }

      this.rebuildBoundaryLineIds(face)

      face.normalize(this.scene.points)
      if (face.supportPointIds.length < 3) {
        this.scene.removeFace(face.id)
        this.removedFaces.add(face.id)
      }
    })

    this.cubeSnapshots.forEach(({ constraint }) => {
      if (constraint.ownerPointIds[0] === this.removePoint.id) constraint.ownerPointIds[0] = this.keepPoint.id
      if (constraint.ownerPointIds[1] === this.removePoint.id) constraint.ownerPointIds[1] = this.keepPoint.id
      constraint.dependentLayouts.forEach((layout) => {
        if (layout.pointId === this.removePoint.id) layout.pointId = this.keepPoint.id
      })
    })

    const inheritedCubeSnapshot =
      !this.keepPoint.cubeId &&
      this.pointCubeSnapshots.find(({ point }) => point.id === this.removePoint.id && point.cubeId)
    if (inheritedCubeSnapshot) {
      this.keepPoint.cubeId = inheritedCubeSnapshot.cubeId
      this.keepPoint.cubeRole = inheritedCubeSnapshot.cubeRole
    }

    this.regularPolygonSnapshots.forEach(({ constraint }) => {
      if (constraint.ownerPointIds[0] === this.removePoint.id) constraint.ownerPointIds[0] = this.keepPoint.id
      if (constraint.ownerPointIds[1] === this.removePoint.id) constraint.ownerPointIds[1] = this.keepPoint.id
      constraint.dependentLayouts.forEach((layout) => {
        if (layout.pointId === this.removePoint.id) layout.pointId = this.keepPoint.id
      })
    })

    const inheritedRpSnapshot =
      !this.keepPoint.regularPolygonId &&
      this.pointRegularPolygonSnapshots.find(({ point }) => point.id === this.removePoint.id && point.regularPolygonId)
    if (inheritedRpSnapshot) {
      this.keepPoint.regularPolygonId = inheritedRpSnapshot.regularPolygonId
      this.keepPoint.regularPolygonRole = inheritedRpSnapshot.regularPolygonRole
    }

    this.circleSnapshots.forEach((snapshot) => {
      const { circle } = snapshot
      const isRemoveCenter = snapshot.centerPoint?.id === this.removePoint.id
      const isKeepCenter = snapshot.centerPoint?.id === this.keepPoint.id

      if (circle.isNormalCircle()) {
        if (circle.p1.id === this.removePoint.id) {
          circle.p1 = this.keepPoint
          this.keepPoint.circleId = circle.id
          this.keepPoint.circleRole = 'center'
        }
        if (circle.directionType === 'point' && circle.directionId === this.removePoint.id) {
          circle.directionId = this.keepPoint.id
        }
        return
      }

      if (isRemoveCenter) {
        const frame = circle.getFrame()
        if (frame) {
          const delta = new Vec3(
            this.keepPoint.position.x - frame.center.x,
            this.keepPoint.position.y - frame.center.y,
            this.keepPoint.position.z - frame.center.z,
          )
          const movedPoints: Array<{ point: Point3; originalPosition: Vec3 }> = []
          const pointIds = new Set([circle.p1.id, circle.p2.id, circle.p3.id])
          pointIds.forEach((pid) => {
            const pt = this.scene.points.get(pid)
            if (pt && pt.id !== this.keepPoint.id) {
              movedPoints.push({ point: pt, originalPosition: pt.position.clone() })
              pt.position = new Vec3(
                pt.position.x + delta.x,
                pt.position.y + delta.y,
                pt.position.z + delta.z,
              )
            }
          })
          snapshot.movedPoints = movedPoints
        }
        this.keepPoint.circleId = circle.id
        this.keepPoint.circleRole = 'center'
        this.keepPoint.locked = true
        this.keepPoint.userLocked = false
      }

      if (circle.p1.id === this.removePoint.id) circle.p1 = this.keepPoint
      if (circle.p2.id === this.removePoint.id) circle.p2 = this.keepPoint
      if (circle.p3.id === this.removePoint.id) circle.p3 = this.keepPoint

      const pointIds = [circle.p1.id, circle.p2.id, circle.p3.id]
      const uniqueIds = new Set(pointIds)
      if (uniqueIds.size < 3) {
        this.scene.circles.delete(circle.id)
        this.scene.selection.circles.delete(circle.id)
        this.removedCircles.add(circle.id)
        if (snapshot.centerPoint) {
          this.scene.points.delete(snapshot.centerPoint.id)
          this.scene.selection.points.delete(snapshot.centerPoint.id)
        }
        if (isRemoveCenter) {
          this.keepPoint.circleId = null
          this.keepPoint.circleRole = null
          this.keepPoint.locked = false
        }
        if (isKeepCenter && snapshot.centerPoint) {
          snapshot.centerPoint.circleId = null
          snapshot.centerPoint.circleRole = null
          snapshot.centerPoint.locked = false
        }
        return
      }

      if (!circle.isValid()) {
        this.scene.circles.delete(circle.id)
        this.scene.selection.circles.delete(circle.id)
        this.removedCircles.add(circle.id)
        if (snapshot.centerPoint) {
          this.scene.points.delete(snapshot.centerPoint.id)
          this.scene.selection.points.delete(snapshot.centerPoint.id)
        }
        if (isRemoveCenter) {
          this.keepPoint.circleId = null
          this.keepPoint.circleRole = null
          this.keepPoint.locked = false
        }
        if (isKeepCenter && snapshot.centerPoint) {
          snapshot.centerPoint.circleId = null
          snapshot.centerPoint.circleRole = null
          snapshot.centerPoint.locked = false
        }
        return
      }

      if (isKeepCenter && snapshot.centerPoint) {
        const newFrame = circle.getFrame()
        if (newFrame) {
          snapshot.centerPoint.position = newFrame.center
        }
      }
    })

    this.sphereSnapshots.forEach((snapshot) => {
      const { sphere } = snapshot
      if (sphere.centerPoint.id === this.removePoint.id) {
        sphere.centerPoint = this.keepPoint
        this.keepPoint.sphereId = sphere.id
        this.keepPoint.sphereRole = 'center'
      }
      if (sphere.radiusPoint && sphere.radiusPoint.id === this.removePoint.id) {
        sphere.radiusPoint = this.keepPoint
        this.keepPoint.sphereId = sphere.id
        this.keepPoint.sphereRole = 'radius'
      }
      if (sphere.radiusPoint && sphere.centerPoint.id === sphere.radiusPoint.id) {
        this.scene.removeSphere(sphere.id)
        this.removedSpheres.add(sphere.id)
        this.keepPoint.sphereId = null
        this.keepPoint.sphereRole = null
      }
    })

    this.scene.points.delete(this.removePoint.id)
    this.scene.selection.points.delete(this.removePoint.id)
    this.scene.markPointDirty(this.keepPoint.id)
    this.scene.selection.selectPoint(this.keepPoint.id, true)
  }

  undo() {
    this.scene.addPoint(this.removePoint)

    this.circleSnapshots.forEach((snapshot) => {
      const { circle } = snapshot
      circle.p1 = snapshot.p1
      circle.p2 = snapshot.p2
      circle.p3 = snapshot.p3

      if (circle.isNormalCircle()) {
        circle.circleType = snapshot.circleType
        circle.directionType = snapshot.directionType
        circle.directionId = snapshot.directionId
        circle.lockedRadius = snapshot.lockedRadius
      }

      snapshot.movedPoints.forEach(({ point, originalPosition }) => {
        point.position = originalPosition
      })

      if (snapshot.centerPoint) {
        if (!this.scene.points.has(snapshot.centerPoint.id)) {
          this.scene.addPoint(snapshot.centerPoint)
        }
        snapshot.centerPoint.position = snapshot.centerPosition!
        snapshot.centerPoint.circleId = snapshot.centerCircleId
        snapshot.centerPoint.circleRole = snapshot.centerCircleRole as 'center' | null
      }

      const isRemoveCenter = snapshot.centerPoint?.id === this.removePoint.id
      if (isRemoveCenter) {
        this.keepPoint.circleId = this.keepPointCircleId
        this.keepPoint.circleRole = this.keepPointCircleRole
        this.keepPoint.locked = this.keepPointLocked
        this.keepPoint.userLocked = this.keepPointUserLocked
      }

      if (circle.isNormalCircle() && circle.p1.id === this.keepPoint.id) {
        this.keepPoint.circleId = snapshot.keepPointCircleId
        this.keepPoint.circleRole = snapshot.keepPointCircleRole as 'center' | null
      }

      if (this.removedCircles.has(circle.id)) {
        this.scene.addCircle(circle)
      }
    })

    this.lineSnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedLines.has(item.id)) this.scene.addLine(item)
    })
    this.straightLineSnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedStraightLines.has(item.id)) this.scene.addStraightLine(item)
    })
    this.raySnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedRays.has(item.id)) this.scene.addRay(item)
    })
    this.vectorSnapshots.forEach(({ item, p1, p2 }) => {
      item.p1 = p1
      item.p2 = p2
      if (this.removedVectors.has(item.id)) this.scene.addVector(item)
    })
    this.faceSnapshots.forEach(({ face, boundaryPointIds, memberPointIds, boundaryLineIds, supportPointIds }) => {
      face.boundaryPointIds = [...boundaryPointIds]
      face.memberPointIds = [...memberPointIds]
      face.boundaryLineIds = [...boundaryLineIds]
      face.supportPointIds = [...supportPointIds]
      const snapshot = this.faceSnapshots.find((item) => item.face.id === face.id)
      if (snapshot) {
        face.cubeOwnerPointIds = [...snapshot.cubeOwnerPointIds]
        face.cubeDependentPointIds = [...snapshot.cubeDependentPointIds]
        face.regularPolygonOwnerPointIds = [...snapshot.regularPolygonOwnerPointIds]
        face.regularPolygonDependentPointIds = [...snapshot.regularPolygonDependentPointIds]
      }
      if (this.removedFaces.has(face.id)) this.scene.addFace(face)
      else face.normalize(this.scene.points)
    })

    this.cubeSnapshots.forEach(({ constraint, ownerPointIds, dependentLayouts }) => {
      constraint.ownerPointIds[0] = ownerPointIds[0]
      constraint.ownerPointIds[1] = ownerPointIds[1]
      constraint.dependentLayouts.splice(
        0,
        constraint.dependentLayouts.length,
        ...dependentLayouts.map((item) => ({ ...item })),
      )
    })
    this.pointCubeSnapshots.forEach(({ point, cubeId, cubeRole }) => {
      point.cubeId = cubeId
      point.cubeRole = cubeRole
    })
    this.regularPolygonSnapshots.forEach(({ constraint, ownerPointIds, dependentLayouts }) => {
      constraint.ownerPointIds[0] = ownerPointIds[0]
      constraint.ownerPointIds[1] = ownerPointIds[1]
      constraint.dependentLayouts.splice(
        0,
        constraint.dependentLayouts.length,
        ...dependentLayouts.map((item) => ({ ...item })),
      )
    })
    this.pointRegularPolygonSnapshots.forEach(({ point, regularPolygonId, regularPolygonRole }) => {
      point.regularPolygonId = regularPolygonId
      point.regularPolygonRole = regularPolygonRole
    })

    this.sphereSnapshots.forEach((snapshot) => {
      const { sphere } = snapshot
      sphere.centerPoint = snapshot.centerPoint
      sphere.radiusPoint = snapshot.radiusPoint
      snapshot.centerPoint.sphereId = snapshot.centerSphereId
      snapshot.centerPoint.sphereRole = snapshot.centerSphereRole
      if (snapshot.radiusPoint) {
        snapshot.radiusPoint.sphereId = snapshot.radiusSphereId
        snapshot.radiusPoint.sphereRole = snapshot.radiusSphereRole
      }
      if (this.removedSpheres.has(sphere.id)) {
        this.scene.addSphere(sphere)
      }
    })

    this.scene.markPointDirty(this.keepPoint.id)
    this.scene.markPointDirty(this.removePoint.id)

    this.scene.selection.clear()
    this.scene.selection.selectPoint(this.keepPoint.id, true)
    this.scene.selection.selectPoint(this.removePoint.id, true)
  }

  private rebuildBoundaryLineIds(face: PlanarPolygon) {
    const boundaryLineIds: string[] = []
    for (let i = 0; i < face.boundaryPointIds.length; i++) {
      const p1Id = face.boundaryPointIds[i]!
      const p2Id = face.boundaryPointIds[(i + 1) % face.boundaryPointIds.length]!
      const foundLine = PlanarPolygon.findExistingLine(this.scene.lines, p1Id, p2Id)
      if (foundLine) {
        boundaryLineIds.push(foundLine.id)
      }
    }
    face.boundaryLineIds = boundaryLineIds
  }
}
