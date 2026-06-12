import { SnapshotCommand } from '../SnapshotCommand'
import { Scene, type SceneConstraint } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { Circle3 } from '../../../geometry/Circle3'
import { Sphere3 } from '../../../geometry/Sphere3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { Cone3 } from '../../../geometry/Cone3'
import { Cylinder3 } from '../../../geometry/Cylinder3'

export function createDeletePointCommand(
  scene: Scene,
  point: Point3,
  relatedLines: Line3[],
  relatedStraightLines: StraightLine3[],
  relatedRays: Ray3[],
  relatedVectors: GeoVector3[],
  relatedCircles: Circle3[],
  relatedFaces: PlanarPolygon[],
  pointConstraint: SceneConstraint | null = null,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  dependentCubes: Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: CubeConstraint
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  relatedSpheres: Sphere3[] = [],
  dependentRegularPolygons: Array<{
    face: PlanarPolygon
    constraint: RegularPolygonConstraint
    dependentPoints: Point3[]
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
  relatedCones: Cone3[] = [],
  relatedCylinders: Cylinder3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeletePointCommand', scene, () => {
    relatedLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })
    relatedStraightLines.forEach((line) => {
      scene.straightLines.delete(line.id)
      scene.selection.straightLines.delete(line.id)
    })
    relatedRays.forEach((ray) => {
      scene.rays.delete(ray.id)
      scene.selection.rays.delete(ray.id)
    })
    relatedVectors.forEach((vector) => {
      scene.vectors.delete(vector.id)
      scene.selection.vectors.delete(vector.id)
    })
    relatedCircles.forEach((circle) => {
      scene.circles.delete(circle.id)
      scene.selection.circles.delete(circle.id)
    })
    relatedSpheres.forEach((sphere) => {
      scene.removeSphere(sphere.id)
      sphere.centerPoint.sphereId = null
      sphere.centerPoint.sphereRole = null
      if (sphere.radiusPoint) {
        sphere.radiusPoint.sphereId = null
        sphere.radiusPoint.sphereRole = null
      }
    })
    const centerPoints = relatedCircles
      .map((circle) =>
        [...scene.points.values()].find(
          (p) => p.circleId === circle.id && p.circleRole === 'center',
        ),
      )
      .filter((p): p is Point3 => p !== undefined)
    centerPoints.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    relatedFaces.forEach((face) => {
      scene.removeFace(face.id)
    })
    dependentCubes.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
      scene.removeCubeConstraint(constraint.cubeId)
      faces.forEach((face) => scene.removeFace(face.id))

      const allBoundaryLineIds = new Set(faces.flatMap((face) => face.boundaryLineIds))
      const deletedBoundaryLines = [...allBoundaryLineIds]
        .map((lineId) => scene.lines.get(lineId))
        .filter((line): line is Line3 => line !== undefined && line.faceOwned)

      deletedBoundaryLines.forEach((line) => {
        scene.lines.delete(line.id)
        scene.selection.lines.delete(line.id)
      })

      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        scene.removeIntersectionConstraint(constraint.pointId)
        scene.points.delete(point.id)
        scene.selection.points.delete(point.id)
      })
      dependentPoints.forEach((point) => {
        scene.points.delete(point.id)
        scene.selection.points.delete(point.id)
      })
    })
    dependentRegularPolygons.forEach(({ face, constraint, dependentPoints, dependentIntersectionPoints }) => {
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        scene.removeIntersectionConstraint(constraint.pointId)
        scene.points.delete(point.id)
        scene.selection.points.delete(point.id)
      })
      dependentPoints.forEach((point) => {
        scene.points.delete(point.id)
        scene.selection.points.delete(point.id)
      })
      scene.removeRegularPolygonConstraint(constraint.constraintId)
      scene.removeFace(face.id)

      const deletedBoundaryLines = face.boundaryLineIds
        .map((lineId) => scene.lines.get(lineId))
        .filter((line): line is Line3 => line !== undefined && line.faceOwned)
        .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, line.id, face.id))

      deletedBoundaryLines.forEach((line) => {
        scene.lines.delete(line.id)
        scene.selection.lines.delete(line.id)
      })
    })
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    relatedCones.forEach((cone) => {
      // 删除圆锥关联的法向圆
      if (cone.normalCircleId) {
        const circle = scene.circles.get(cone.normalCircleId)
        if (circle) {
          scene.circles.delete(circle.id)
          scene.selection.circles.delete(circle.id)
          circle.p1.circleId = null
          circle.p1.circleRole = null
        }
      }
      scene.removeCone(cone.id)
      cone.baseCenterPoint.coneId = null
      cone.baseCenterPoint.coneRole = null
      cone.apexPoint.coneId = null
      cone.apexPoint.coneRole = null
      scene.selection.cones.delete(cone.id)
    })
    relatedCylinders.forEach((cylinder) => {
      // 删除圆柱关联的法向圆
      if (cylinder.normalCircleId) {
        const circle = scene.circles.get(cylinder.normalCircleId)
        if (circle) {
          scene.circles.delete(circle.id)
          scene.selection.circles.delete(circle.id)
          circle.p1.circleId = null
          circle.p1.circleRole = null
        }
      }
      if (cylinder.topNormalCircleId) {
        const circle = scene.circles.get(cylinder.topNormalCircleId)
        if (circle) {
          scene.circles.delete(circle.id)
          scene.selection.circles.delete(circle.id)
          circle.p1.circleId = null
          circle.p1.circleRole = null
        }
      }
      scene.removeCylinder(cylinder.id)
      cylinder.bottomCenterPoint.cylinderId = null
      cylinder.bottomCenterPoint.cylinderRole = null
      cylinder.topCenterPoint.cylinderId = null
      cylinder.topCenterPoint.cylinderRole = null
      scene.selection.cylinders.delete(cylinder.id)
    })
    dependentIntersectionPoints.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })

    if (pointConstraint?.pointId) {
      scene.removeIntersectionConstraint(pointConstraint.pointId)
    }

    scene.points.delete(point.id)
    scene.selection.points.delete(point.id)
  })

  cmd.executeAndCapture()
  return cmd
}
