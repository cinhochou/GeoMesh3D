import type { Command } from '../Command'
import { Point3 } from '../../geometry/Point3'
import { Line3 } from '../../geometry/Line3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { Circle3 } from '../../geometry/Circle3'
import { Sphere3 } from '../../geometry/Sphere3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { Scene, type SceneConstraint } from '../../scene/Scene'

export class ClearSceneCommand implements Command {
  constructor(
    private scene: Scene,
    private points: Point3[],
    private lines: Line3[],
    private straightLines: StraightLine3[],
    private rays: Ray3[],
    private vectors: GeoVector3[],
    private circles: Circle3[],
    private spheres: Sphere3[],
    private faces: PlanarPolygon[],
    private constraints: SceneConstraint[],
  ) {}

  execute() {
    this.scene.lines.clear()
    this.scene.straightLines.clear()
    this.scene.rays.clear()
    this.scene.vectors.clear()
    this.scene.circles.clear()
    this.scene.spheres.clear()
    this.scene.faces.clear()
    this.points.forEach((point) => this.scene.points.delete(point.id))
    this.scene.clearAllConstraints()
    this.scene.selection.clear()
  }

  undo() {
    this.points.forEach((point) => this.scene.addPoint(point))
    this.lines.forEach((line) => this.scene.addLine(line))
    this.straightLines.forEach((line) => this.scene.addStraightLine(line))
    this.rays.forEach((ray) => this.scene.addRay(ray))
    this.vectors.forEach((vector) => this.scene.addVector(vector))
    this.circles.forEach((circle) => this.scene.addCircle(circle))
    this.spheres.forEach((sphere) => this.scene.addSphere(sphere))
    this.faces.forEach((face) => this.scene.addFace(face))
    this.scene.constraints.push(...this.constraints)
    this.scene.rebuildConstraintIndexes()
  }
}
