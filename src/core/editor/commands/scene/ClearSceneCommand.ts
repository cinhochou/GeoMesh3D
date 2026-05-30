import type { Command } from '../../Command'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { Circle3 } from '../../../geometry/Circle3'
import { Sphere3 } from '../../../geometry/Sphere3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Cone3 } from '../../../geometry/Cone3'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { PerpendicularLineConstraint } from '../../../constraints/PerpendicularLineConstraint'
import { ParallelLineConstraint } from '../../../constraints/ParallelLineConstraint'
import { CylinderConstraint } from '../../../constraints/CylinderConstraint'
import { Scene, type SceneConstraint } from '../../../scene/Scene'

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
    private cones: Cone3[] = [],
    private cylinders: Cylinder3[] = [],
    private cylinderConstraints: CylinderConstraint[] = [],
    private perpendicularLines: PerpendicularLine3[] = [],
    private parallelLines: ParallelLine3[] = [],
    private perpendicularLineConstraints: PerpendicularLineConstraint[] = [],
    private parallelLineConstraints: ParallelLineConstraint[] = [],
  ) {}

  execute() {
    this.scene.lines.clear()
    this.scene.straightLines.clear()
    this.scene.rays.clear()
    this.scene.vectors.clear()
    this.scene.circles.clear()
    this.scene.spheres.clear()
    this.scene.faces.clear()
    this.scene.cones.clear()
    this.scene.cylinders.clear()
    this.scene.perpendicularLines.clear()
    this.scene.parallelLines.clear()
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
    this.cones.forEach((cone) => this.scene.addCone(cone))
    this.cylinders.forEach((cylinder) => this.scene.addCylinder(cylinder))
    this.perpendicularLines.forEach((line) => this.scene.addPerpendicularLine(line))
    this.parallelLines.forEach((line) => this.scene.addParallelLine(line))
    this.scene.constraints.push(...this.constraints)
    this.cylinderConstraints.forEach((constraint) => this.scene.addCylinderConstraint(constraint))
    this.perpendicularLineConstraints.forEach((constraint) => this.scene.addPerpendicularLineConstraint(constraint))
    this.parallelLineConstraints.forEach((constraint) => this.scene.addParallelLineConstraint(constraint))
    this.scene.rebuildConstraintIndexes()
  }
}
