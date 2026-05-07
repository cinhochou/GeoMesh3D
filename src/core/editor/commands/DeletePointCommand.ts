import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { Line3 } from '../../geometry/Line3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { Circle3 } from '../../geometry/Circle3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { PlanarFace } from '../../geometry/Plane'
import type { SceneConstraint } from '../../scene/Scene'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import { CubeConstraint } from '../../constraints/CubeConstraint'

export class DeletePointCommand implements Command {
  private centerPoints: Point3[] = []

  constructor(
    private scene: Scene,
    private point: Point3,
    private relatedLines: Line3[],
    private relatedStraightLines: StraightLine3[],
    private relatedRays: Ray3[],
    private relatedVectors: GeoVector3[],
    private relatedCircles: Circle3[],
    private relatedFaces: PlanarFace[],
    private pointConstraint: SceneConstraint | null = null,
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
    private dependentCubes: Array<{
      faces: PlanarFace[]
      dependentPoints: Point3[]
      constraint: CubeConstraint
      dependentIntersectionPoints: Array<{
        point: Point3
        constraint: IntersectionPointConstraint
      }>
    }> = [],
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
    this.centerPoints.forEach((point) => this.scene.addPoint(point))
    this.relatedFaces.forEach((face) => this.scene.addFace(face))
    this.dependentCubes.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
      dependentPoints.forEach((point) => this.scene.addPoint(point))
      faces.forEach((face) => this.scene.addFace(face))
      this.scene.addCubeConstraint(constraint)
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        this.scene.addPoint(point)
        this.scene.addIntersectionConstraint(constraint)
      })
    })
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
    if (this.pointConstraint?.pointId) {
      this.scene.addIntersectionConstraint(this.pointConstraint as SceneConstraint & { pointId: string })
    }
  }
}
