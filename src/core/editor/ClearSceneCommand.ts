import type { Command } from './Command'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarFace } from '../geometry/Plane'
import { Scene, type SceneConstraint } from '../scene/Scene'

export class ClearSceneCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private lines: Line3[],
    private straightLines: StraightLine3[],
    private rays: Ray3[],
    private faces: PlanarFace[],
    private constraints: SceneConstraint[],
  ) {}

  execute() {
    this.scene.lines.clear()
    this.scene.straightLines.clear()
    this.scene.rays.clear()
    this.scene.faces.clear()
    this.points.forEach((point) => this.scene.points.delete(point.id))
    this.scene.constraints.length = 0
    this.scene.selection.clear()
  }

  undo() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.lines.forEach((line) => this.scene.addLine(line))
    this.straightLines.forEach((line) => this.scene.addStraightLine(line))
    this.rays.forEach((ray) => this.scene.addRay(ray))
    this.faces.forEach((face) => this.scene.addFace(face))
    this.scene.constraints.push(...this.constraints)
  }
}
