// src/core/editor/AddElementCommand.ts
import type { Command } from './Command'
import { Scene } from '../scene/Scene'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'

export type ElementType = 'point' | 'line' | 'ray'

export class AddElementCommand implements Command {
  constructor(
    private scene: Scene,
    private element: Point3 | Line3 | Ray3,
    private type: ElementType,
  ) {}

  /** 执行：将元素添加到场景 */
  execute() {
    if (this.type === 'point') {
      this.scene.addPoint(this.element as Point3)
    } else if (this.type === 'line') {
      this.scene.addLine(this.element as Line3)
    } else {
      this.scene.addRay(this.element as Ray3)
    }
  }

  /** 撤销：将元素从场景移除 */
  undo() {
    if (this.type === 'point') {
      this.scene.points.delete(this.element.id)
      this.scene.selection.points.delete(this.element.id)
    } else if (this.type === 'line') {
      this.scene.lines.delete(this.element.id)
      this.scene.selection.lines.delete(this.element.id)
    } else {
      this.scene.rays.delete(this.element.id)
      this.scene.selection.rays.delete(this.element.id)
    }
  }
}
