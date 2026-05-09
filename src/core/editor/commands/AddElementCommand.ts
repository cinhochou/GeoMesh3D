import type { Command } from '../Command'
import { Scene } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { Line3 } from '../../geometry/Line3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { Circle3 } from '../../geometry/Circle3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'

export type ElementType = 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'face'

export class AddElementCommand implements Command {
  private centerPoint: Point3 | null = null
  private prevCircleId: string | null = null
  private prevCircleRole: 'center' | null = null
  private boundaryLines: Line3[] = []

  constructor(
    private scene: Scene,
    private element: Point3 | Line3 | StraightLine3 | Ray3 | GeoVector3 | Circle3 | PlanarPolygon,
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
    if (this.type === 'point') {
      this.scene.addPoint(this.element as Point3)
    } else if (this.type === 'line') {
      this.scene.addLine(this.element as Line3)
    } else if (this.type === 'straightLine') {
      this.scene.addStraightLine(this.element as StraightLine3)
    } else if (this.type === 'face') {
      this.boundaryLines.forEach((line) => this.scene.addLine(line))
      this.scene.addFace(this.element as PlanarPolygon)
    } else if (this.type === 'circle') {
      this.scene.addCircle(this.element as Circle3)
      if (this.centerPoint) {
        this.centerPoint.circleId = this.element.id
        this.centerPoint.circleRole = 'center'
      }
    } else if (this.type === 'vector') {
      this.scene.addVector(this.element as GeoVector3)
    } else {
      this.scene.addRay(this.element as Ray3)
    }
  }

  undo() {
    if (this.type === 'point') {
      this.scene.points.delete(this.element.id)
      this.scene.selection.points.delete(this.element.id)
    } else if (this.type === 'line') {
      this.scene.lines.delete(this.element.id)
      this.scene.selection.lines.delete(this.element.id)
    } else if (this.type === 'straightLine') {
      this.scene.straightLines.delete(this.element.id)
      this.scene.selection.straightLines.delete(this.element.id)
    } else if (this.type === 'face') {
      this.scene.removeFace(this.element.id)
      this.boundaryLines.forEach((line) => {
        this.scene.lines.delete(line.id)
        this.scene.selection.lines.delete(line.id)
      })
    } else if (this.type === 'circle') {
      this.scene.circles.delete(this.element.id)
      this.scene.selection.circles.delete(this.element.id)
      if (this.centerPoint) {
        this.centerPoint.circleId = this.prevCircleId
        this.centerPoint.circleRole = this.prevCircleRole
      }
    } else if (this.type === 'vector') {
      this.scene.vectors.delete(this.element.id)
      this.scene.selection.vectors.delete(this.element.id)
    } else {
      this.scene.rays.delete(this.element.id)
      this.scene.selection.rays.delete(this.element.id)
    }
  }
}
