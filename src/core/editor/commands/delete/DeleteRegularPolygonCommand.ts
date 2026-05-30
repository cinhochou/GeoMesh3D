import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { ParallelLineConstraint } from '../../../constraints/ParallelLineConstraint'

export class DeleteRegularPolygonCommand implements Command {
  private deletedBoundaryLines: Line3[] = []

  constructor(
    private scene: Scene,
    private face: PlanarPolygon,
    private constraint: RegularPolygonConstraint,
    private dependentPoints: Point3[],
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
    private relatedPerpendicularLines: PerpendicularLine3[] = [],
    private relatedParallelLines: ParallelLine3[] = [],
  ) {}

  execute() {
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

    this.dependentPoints.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })

    this.scene.removeRegularPolygonConstraint(this.constraint.constraintId)
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

    this.dependentPoints.forEach((point) => {
      this.scene.addPoint(point)
    })

    this.scene.addFace(this.face)
    this.scene.addRegularPolygonConstraint(this.constraint)

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
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })

    this.deletedBoundaryLines = []
  }
}
