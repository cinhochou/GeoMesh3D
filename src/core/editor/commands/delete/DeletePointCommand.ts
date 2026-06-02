import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { Circle3 } from '../../../geometry/Circle3'
import { Sphere3 } from '../../../geometry/Sphere3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import type { SceneConstraint } from '../../../scene/Scene'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { ParallelLineConstraint } from '../../../constraints/ParallelLineConstraint'

export class DeletePointCommand implements Command {
  private centerPoints: Point3[] = []
  private regularPolygonDeletedBoundaryLines: Map<string, Line3[]> = new Map()
  private cubeDeletedBoundaryLines: Map<string, Line3[]> = new Map()

  constructor(
    private scene: Scene,
    private point: Point3,
    private relatedLines: Line3[],
    private relatedStraightLines: StraightLine3[],
    private relatedRays: Ray3[],
    private relatedVectors: GeoVector3[],
    private relatedCircles: Circle3[],
    private relatedFaces: PlanarPolygon[],
    private pointConstraint: SceneConstraint | null = null,
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
    private dependentCubes: Array<{
      faces: PlanarPolygon[]
      dependentPoints: Point3[]
      constraint: CubeConstraint
      dependentIntersectionPoints: Array<{
        point: Point3
        constraint: IntersectionPointConstraint
      }>
    }> = [],
    private relatedSpheres: Sphere3[] = [],
    private dependentRegularPolygons: Array<{
      face: PlanarPolygon
      constraint: RegularPolygonConstraint
      dependentPoints: Point3[]
      dependentIntersectionPoints: Array<{
        point: Point3
        constraint: IntersectionPointConstraint
      }>
    }> = [],
    private relatedPerpendicularLines: PerpendicularLine3[] = [],
    private relatedParallelLines: ParallelLine3[] = [],
  ) {
    this.centerPoints = relatedCircles
      .map((circle) =>
        [...scene.points.values()].find(
          (p) => p.circleId === circle.id && p.circleRole === 'center',
        ),
      )
      .filter((p): p is Point3 => p !== undefined)
  }

  execute() {
    this.relatedLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })
    this.relatedStraightLines.forEach((line) => {
      this.scene.straightLines.delete(line.id)
      this.scene.selection.straightLines.delete(line.id)
    })
    this.relatedRays.forEach((ray) => {
      this.scene.rays.delete(ray.id)
      this.scene.selection.rays.delete(ray.id)
    })
    this.relatedVectors.forEach((vector) => {
      this.scene.vectors.delete(vector.id)
      this.scene.selection.vectors.delete(vector.id)
    })
    this.relatedCircles.forEach((circle) => {
      this.scene.circles.delete(circle.id)
      this.scene.selection.circles.delete(circle.id)
    })
    this.relatedSpheres.forEach((sphere) => {
      this.scene.removeSphere(sphere.id)
      sphere.centerPoint.sphereId = null
      sphere.centerPoint.sphereRole = null
      if (sphere.radiusPoint) {
        sphere.radiusPoint.sphereId = null
        sphere.radiusPoint.sphereRole = null
      }
    })
    this.centerPoints.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
    this.relatedFaces.forEach((face) => {
      this.scene.removeFace(face.id)
    })
    this.dependentCubes.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
      this.scene.removeCubeConstraint(constraint.cubeId)
      faces.forEach((face) => this.scene.removeFace(face.id))

      const allBoundaryLineIds = new Set(faces.flatMap((face) => face.boundaryLineIds))
      const deletedBoundaryLines = [...allBoundaryLineIds]
        .map((lineId) => this.scene.lines.get(lineId))
        .filter((line): line is Line3 => line !== undefined && line.faceOwned)

      deletedBoundaryLines.forEach((line) => {
        this.scene.lines.delete(line.id)
        this.scene.selection.lines.delete(line.id)
      })
      this.cubeDeletedBoundaryLines.set(constraint.cubeId, deletedBoundaryLines)

      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        this.scene.removeIntersectionConstraint(constraint.pointId)
        this.scene.points.delete(point.id)
        this.scene.selection.points.delete(point.id)
      })
      dependentPoints.forEach((point) => {
        this.scene.points.delete(point.id)
        this.scene.selection.points.delete(point.id)
      })
    })
    this.dependentRegularPolygons.forEach(({ face, constraint, dependentPoints, dependentIntersectionPoints }) => {
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        this.scene.removeIntersectionConstraint(constraint.pointId)
        this.scene.points.delete(point.id)
        this.scene.selection.points.delete(point.id)
      })
      dependentPoints.forEach((point) => {
        this.scene.points.delete(point.id)
        this.scene.selection.points.delete(point.id)
      })
      this.scene.removeRegularPolygonConstraint(constraint.constraintId)
      this.scene.removeFace(face.id)

      const deletedBoundaryLines = face.boundaryLineIds
        .map((lineId) => this.scene.lines.get(lineId))
        .filter((line): line is Line3 => line !== undefined && line.faceOwned)
        .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(this.scene.faces, line.id, face.id))

      deletedBoundaryLines.forEach((line) => {
        this.scene.lines.delete(line.id)
        this.scene.selection.lines.delete(line.id)
      })
      this.regularPolygonDeletedBoundaryLines.set(face.id, deletedBoundaryLines)
    })
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.removePerpendicularLine(line.id)
      this.scene.selection.perpendicularLines.delete(line.id)
    })
    this.relatedParallelLines.forEach((line) => {
      this.scene.removeParallelLine(line.id)
      this.scene.selection.parallelLines.delete(line.id)
    })
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.removeIntersectionConstraint(constraint.pointId)
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })

    if (this.pointConstraint?.pointId) {
      this.scene.removeIntersectionConstraint(this.pointConstraint.pointId)
    }

    this.scene.points.delete(this.point.id)
    this.scene.selection.points.delete(this.point.id)
  }

  undo() {
    this.scene.addPoint(this.point)
    this.relatedLines.forEach((line) => this.scene.addLine(line))
    this.relatedStraightLines.forEach((line) => this.scene.addStraightLine(line))
    this.relatedRays.forEach((ray) => this.scene.addRay(ray))
    this.relatedVectors.forEach((vector) => this.scene.addVector(vector))
    this.relatedCircles.forEach((circle) => this.scene.addCircle(circle))
    this.relatedSpheres.forEach((sphere) => {
      this.scene.addSphere(sphere)
      sphere.centerPoint.sphereId = sphere.id
      sphere.centerPoint.sphereRole = 'center'
      if (sphere.radiusPoint) {
        sphere.radiusPoint.sphereId = sphere.id
        sphere.radiusPoint.sphereRole = 'radius'
      }
    })
    this.centerPoints.forEach((point) => this.scene.addPoint(point))
    this.relatedFaces.forEach((face) => this.scene.addFace(face))
    this.dependentCubes.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
      const boundaryLines = this.cubeDeletedBoundaryLines.get(constraint.cubeId) ?? []
      boundaryLines.forEach((line) => this.scene.addLine(line))
      dependentPoints.forEach((point) => this.scene.addPoint(point))
      faces.forEach((face) => this.scene.addFace(face))
      this.scene.addCubeConstraint(constraint)
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        this.scene.addPoint(point)
        this.scene.addIntersectionConstraint(constraint)
      })
    })
    this.cubeDeletedBoundaryLines.clear()
    this.dependentRegularPolygons.forEach(({ face, constraint, dependentPoints, dependentIntersectionPoints }) => {
      const boundaryLines = this.regularPolygonDeletedBoundaryLines.get(face.id) ?? []
      boundaryLines.forEach((line) => this.scene.addLine(line))
      dependentPoints.forEach((point) => this.scene.addPoint(point))
      this.scene.addFace(face)
      this.scene.addRegularPolygonConstraint(constraint)
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        this.scene.addPoint(point)
        this.scene.addIntersectionConstraint(constraint)
      })
    })
    this.regularPolygonDeletedBoundaryLines.clear()
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.addPerpendicularLine(line)
      this.scene.addPerpendicularLineConstraint(
        new PerpendicularLineConstraint(this.scene, line.id, line.target),
      )
    })
    this.relatedParallelLines.forEach((line) => {
      this.scene.addParallelLine(line)
      this.scene.addParallelLineConstraint(
        new ParallelLineConstraint(this.scene, line.id, line.target),
      )
    })
    if (this.pointConstraint?.pointId) {
      this.scene.addIntersectionConstraint(this.pointConstraint as SceneConstraint & { pointId: string })
    }
  }
}
