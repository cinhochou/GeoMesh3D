import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'

export class AddHexahedronCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private faces: PlanarPolygon[],
    private constraint: CubeConstraint,
    private boundaryLines: Line3[] = [],
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
  ) {}

  execute() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.boundaryLines.forEach((line) => this.scene.addLine(line))
    this.faces.forEach((face) => this.scene.addFace(face))
    this.scene.addCubeConstraint(this.constraint)
  }

  undo() {
    this.scene.removeCubeConstraint(this.constraint.cubeId)
    this.faces.forEach((face) => this.scene.removeFace(face.id))
    this.boundaryLines.forEach((line) => {
      this.scene.lines.delete(line.id)
      this.scene.selection.lines.delete(line.id)
    })
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.removeIntersectionConstraint(constraint.pointId)
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
    this.points.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
  }
}
