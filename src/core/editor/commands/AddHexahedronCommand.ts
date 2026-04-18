import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { PlanarFace } from '../../geometry/Plane'
import { CubeConstraint } from '../../constraints/CubeConstraint'

export class AddHexahedronCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private faces: PlanarFace[],
    private constraint: CubeConstraint,
  ) {}

  execute() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.faces.forEach((face) => this.scene.addFace(face))
    this.scene.addCubeConstraint(this.constraint)
  }

  undo() {
    this.scene.removeCubeConstraint(this.constraint.cubeId)
    this.faces.forEach((face) => this.scene.removeFace(face.id))
    this.points.forEach((point) => {
      this.scene.points.delete(point.id)
      this.scene.selection.points.delete(point.id)
    })
  }
}
