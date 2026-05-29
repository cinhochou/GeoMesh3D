import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'

export class DeleteHexahedronCommand implements Command {
  private deletedBoundaryLines: Line3[] = []

  constructor(
    private scene: Scene,
    private faces: PlanarPolygon[],
    private dependentPoints: Point3[],
    private constraint: CubeConstraint,
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
    private relatedPerpendicularLines: PerpendicularLine3[] = [],
  ) {}

  execute() {
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.removePerpendicularLine(line.id)
      this.scene.selection.perpendicularLines.delete(line.id)
    })
    this.scene.removeCubeConstraint(this.constraint.cubeId)
    this.faces.forEach((face) => this.scene.removeFace(face.id))

    const allBoundaryLineIds = new Set(this.faces.flatMap((face) => face.boundaryLineIds))
    this.deletedBoundaryLines = [...allBoundaryLineIds]
      .map((lineId) => this.scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)

    this.deletedBoundaryLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })

    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.removeIntersectionConstraint(constraint.pointId)
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
    this.dependentPoints.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
  }

  undo() {
    this.dependentPoints.forEach((point) => this.scene.addPoint(point))
    this.deletedBoundaryLines.forEach((line) => this.scene.addLine(line))
    this.faces.forEach((face) => this.scene.addFace(face))
    this.scene.addCubeConstraint(this.constraint)
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.addPerpendicularLine(line)
      this.scene.addPerpendicularLineConstraint(
        new PerpendicularLineConstraint(this.scene, line.id, line.target),
      )
    })
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
    this.deletedBoundaryLines = []
  }
}
