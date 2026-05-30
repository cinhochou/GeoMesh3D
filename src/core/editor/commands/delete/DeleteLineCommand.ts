import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { ParallelLineConstraint } from '../../../constraints/ParallelLineConstraint'

export class DeleteLineCommand implements Command {
  private deletedFaceBoundaryLines: Line3[] = []
  private regularPolygonDeletedBoundaryLines: Map<string, Line3[]> = new Map()

  constructor(
    private scene: Scene,
    private line: Line3,
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
    private dependentFaces: PlanarPolygon[] = [],
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
  ) {}

  execute() {
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
    this.dependentFaces.forEach((face) => {
      this.scene.removeFace(face.id)
    })
    this.deletedFaceBoundaryLines = []
    this.dependentFaces.forEach((face) => {
      face.boundaryLineIds.forEach((lineId) => {
        if (lineId === this.line.id) return
        const boundaryLine = this.scene.lines.get(lineId)
        if (!boundaryLine || !boundaryLine.faceOwned) return
        if (PlanarPolygon.isBoundaryLineUsedByOtherFace(this.scene.faces, lineId, face.id)) return
        this.scene.lines.delete(lineId)
        this.scene.selection.lines.delete(lineId)
        this.deletedFaceBoundaryLines.push(boundaryLine)
      })
    })
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.removeIntersectionConstraint(constraint.pointId)
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
    this.relatedPerpendicularLines.forEach((line) => {
      this.scene.removePerpendicularLine(line.id)
      this.scene.selection.perpendicularLines.delete(line.id)
    })
    this.relatedParallelLines.forEach((line) => {
      this.scene.removeParallelLine(line.id)
      this.scene.selection.parallelLines.delete(line.id)
    })
    this.scene.lines.delete(this.line.id)
    this.scene.selection.lines.delete(this.line.id)
  }

  undo() {
    this.scene.addLine(this.line)
    this.deletedFaceBoundaryLines.forEach((line) => this.scene.addLine(line))
    this.dependentFaces.forEach((face) => this.scene.addFace(face))
    this.deletedFaceBoundaryLines = []
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
    this.dependentCubes.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
      dependentPoints.forEach((point) => this.scene.addPoint(point))
      faces.forEach((face) => this.scene.addFace(face))
      this.scene.addCubeConstraint(constraint)
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        this.scene.addPoint(point)
        this.scene.addIntersectionConstraint(constraint)
      })
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
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
