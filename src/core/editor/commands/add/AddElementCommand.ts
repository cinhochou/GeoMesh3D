import type { Command } from '../../Command'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { Circle3 } from '../../../geometry/Circle3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'

export type ElementType = 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'face' | 'perpendicularLine'

export class AddElementCommand implements Command {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static executeMap: Record<string, (scene: Scene, element: any) => void> = {
    point: (scene, el) => scene.addPoint(el),
    line: (scene, el) => scene.addLine(el),
    straightLine: (scene, el) => scene.addStraightLine(el),
    vector: (scene, el) => scene.addVector(el),
    ray: (scene, el) => scene.addRay(el),
    perpendicularLine: (scene, el) => scene.addPerpendicularLine(el),
  }

  private static undoMap: Record<string, (scene: Scene, id: string) => void> = {
    point: (scene, id) => { scene.points.delete(id); scene.selection.points.delete(id) },
    line: (scene, id) => { scene.lines.delete(id); scene.selection.lines.delete(id) },
    straightLine: (scene, id) => { scene.straightLines.delete(id); scene.selection.straightLines.delete(id) },
    ray: (scene, id) => { scene.rays.delete(id); scene.selection.rays.delete(id) },
    vector: (scene, id) => { scene.vectors.delete(id); scene.selection.vectors.delete(id) },
    circle: (scene, id) => { scene.circles.delete(id); scene.selection.circles.delete(id) },
    perpendicularLine: (scene, id) => { scene.perpendicularLines.delete(id); scene.selection.perpendicularLines.delete(id) },
  }

  private centerPoint: Point3 | null = null
  private prevCircleId: string | null = null
  private prevCircleRole: 'center' | null = null
  private boundaryLines: Line3[] = []

  constructor(
    private scene: Scene,
    private element: Point3 | Line3 | StraightLine3 | Ray3 | GeoVector3 | Circle3 | PlanarPolygon | PerpendicularLine3,
    private type: ElementType,
    boundaryLines: Line3[] = [],
  ) {
    if (type === 'circle' && (element as Circle3).isNormalCircle()) {
      this.centerPoint = (element as Circle3).p1
      this.prevCircleId = this.centerPoint.circleId
      this.prevCircleRole = this.centerPoint.circleRole
    }
    if (type === 'face') {
      this.boundaryLines = boundaryLines
    }
  }

  execute() {
    if (this.type === 'face') {
      this.boundaryLines.forEach((line) => this.scene.addLine(line))
      this.scene.addFace(this.element as PlanarPolygon)
    } else if (this.type === 'circle') {
      this.scene.addCircle(this.element as Circle3)
      if (this.centerPoint) {
        this.centerPoint.circleId = this.element.id
        this.centerPoint.circleRole = 'center'
      }
    } else {
      AddElementCommand.executeMap[this.type]!(this.scene, this.element)
    }
  }

  undo() {
    if (this.type === 'face') {
      this.scene.removeFace(this.element.id)
      this.boundaryLines.forEach((line) => {
        this.scene.lines.delete(line.id)
        this.scene.selection.lines.delete(line.id)
      })
    } else {
      AddElementCommand.undoMap[this.type]!(this.scene, this.element.id)
      if (this.type === 'circle' && this.centerPoint) {
        this.centerPoint.circleId = this.prevCircleId
        this.centerPoint.circleRole = this.prevCircleRole
      }
    }
  }
}
