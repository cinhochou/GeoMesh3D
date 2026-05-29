import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'

export class DeleteFaceCommand implements Command {
  private deletedBoundaryLines: Line3[] = []

  constructor(
    private scene: Scene,
    private face: PlanarPolygon,
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
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.removeIntersectionConstraint(constraint.pointId)
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
    this.scene.removeFace(this.face.id)

    this.deletedBoundaryLines = this.face.boundaryLineIds
      .map((lineId) => this.scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)
      .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(this.scene.faces, line.id, this.face.id))

    this.deletedBoundaryLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })
  }

  undo() {
    this.deletedBoundaryLines.forEach((line) => this.scene.addLine(line))
    this.scene.addFace(this.face)
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
