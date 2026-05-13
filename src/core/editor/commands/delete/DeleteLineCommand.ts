import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'

export class DeleteLineCommand implements Command {
  private deletedFaceBoundaryLines: Line3[] = []

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
    this.scene.lines.delete(this.line.id)
    this.scene.selection.lines.delete(this.line.id)
  }

  undo() {
    this.scene.addLine(this.line)
    this.deletedFaceBoundaryLines.forEach((line) => this.scene.addLine(line))
    this.dependentFaces.forEach((face) => this.scene.addFace(face))
    this.deletedFaceBoundaryLines = []
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
  }
}
