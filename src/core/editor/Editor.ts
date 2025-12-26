// core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { TransformCommand } from './TransformCommand'
import { Vec3 } from '../geometry/Vec3'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'

export enum EditorMode {
  Select,
  CreatePoint,
  CreateLine,
}

let idCounter = 0
const genId = (prefix: string) => `${prefix}_${idCounter++}`

export class Editor {
  scene: Scene
  mode: EditorMode = EditorMode.Select
  selectedPoints: Point3[] = []

  history: Command[] = []
  historyIndex = -1

  constructor(scene: Scene) {
    this.scene = scene
  }

  setMode(mode: EditorMode) {
    this.mode = mode
    this.selectedPoints = []
  }

  /* ---------- 点 ---------- */

  createPoint(position: Vec3) {
    const p = new Point3(genId('p'), position)
    this.scene.addPoint(p)
    return p
  }

  movePoint(pointId: string, delta: Vec3) {
    const point = this.scene.points.get(pointId)
    if (!point) return

    const before = point.position.clone()
    const after = before.add(delta)

    this.executeCommand(new TransformCommand(point, before, after))
  }

  /* ---------- 线 ---------- */

  tryCreateLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateLine) return

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length === 2) {
      const [p1, p2] = this.selectedPoints
      if (p1 && p2) {
        const line = new Line3(genId('l'), p1, p2)
        this.scene.addLine(line)
        this.selectedPoints = []
      }
    }
  }

  /* ---------- command ---------- */

  executeCommand(cmd: Command) {
    cmd.execute()
    this.history = this.history.slice(0, this.historyIndex + 1)
    this.history.push(cmd)
    this.historyIndex++
  }
}
