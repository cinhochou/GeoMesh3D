import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export class DeleteHexahedronCommand implements Command {
  constructor(
    private scene: Scene,
    private faces: PlanarPolygon[],
    private dependentPoints: Point3[],
    private constraint: CubeConstraint,
    private dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }> = [],
  ) {}

  execute() {
    this.scene.removeCubeConstraint(this.constraint.cubeId)
    this.faces.forEach((face) => this.scene.removeFace(face.id))
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
    this.faces.forEach((face) => this.scene.addFace(face))
    this.scene.addCubeConstraint(this.constraint)
    this.dependentIntersectionPoints.forEach(({ point, constraint }) => {
      this.scene.addPoint(point)
      this.scene.addIntersectionConstraint(constraint)
    })
  }
}
