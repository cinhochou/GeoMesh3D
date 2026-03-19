// src/core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { TransformCommand } from './TransformCommand'
import { AddElementCommand } from './AddElementCommand'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Vec3 } from '../geometry/Vec3'

export enum EditorMode {
  Select,
  Delete,
  CreatePoint,
  CreateLine,
  CreatePlane,
}

let idCounter = 0
const genId = (prefix: string) => `${prefix}_${idCounter++}`
let nameCounter = 0
const genPointName = () => {
  // A-Z, AA, AB, ...
  let n = nameCounter++
  let name = ''
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}
let lineNameCounter = 0
const genLineName = () => {
  // a-z, aa, ab, ...
  let n = lineNameCounter++
  let name = ''
  while (n >= 0) {
    name = String.fromCharCode(97 + (n % 26)) + name
    n = Math.floor(n / 26) - 1
  }
  return name
}

export class Editor {
  scene: Scene
  mode: EditorMode = EditorMode.Select
  selectedPoints: Point3[] = []
  history: Command[] = []
  historyIndex = -1
  isSnappingEnabled: boolean = true

  constructor(scene: Scene) {
    this.scene = scene
  }

  setMode(mode: EditorMode) {
    this.mode = mode
    this.selectedPoints = []
  }

  deletePoint(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (!point || point.locked) return

    // 删除与该点相关的线段
    const linesToDelete: string[] = []
    this.scene.lines.forEach((l, id) => {
      if (l.p1.id === pointId || l.p2.id === pointId) linesToDelete.push(id)
    })
    linesToDelete.forEach((id) => this.scene.lines.delete(id))

    this.scene.points.delete(pointId)
    this.scene.selection.points.delete(pointId)
    linesToDelete.forEach((id) => this.scene.selection.lines.delete(id))
    this.selectedPoints = this.selectedPoints.filter((p) => p.id !== pointId)
  }

  deleteLine(lineId: string) {
    if (!this.scene.lines.has(lineId)) return
    this.scene.lines.delete(lineId)
    this.scene.selection.lines.delete(lineId)
  }

  createPoint(position: Vec3) {
    const p = new Point3(genId('p'), genPointName(), position, false, true)
    const cmd = new AddElementCommand(this.scene, p, 'point')
    this.executeCommand(cmd)
    return p
  }

  movePoint(pointId: string, delta: Vec3) {
    const point = this.scene.points.get(pointId)
    if (!point) return
    if (point.locked) return
    const before = point.position.clone()
    const after = before.add(delta)
    this.executeCommand(new TransformCommand(point, before, after))
  }

  tryCreateLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateLine) return
    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length === 2) {
      const [p1, p2] = this.selectedPoints
      const exists = [...this.scene.lines.values()].some(
        (l) =>
          (l.p1.id === p1!.id && l.p2.id === p2!.id) || (l.p1.id === p2!.id && l.p2.id === p1!.id),
      )
      if (!exists) {
        const line = new Line3(genId('l'), genLineName(), p1!, p2!, true)
        this.executeCommand(new AddElementCommand(this.scene, line, 'line'))
      } else {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { msg: '线段已存在，创建线段失败', scope: 'viewport' },
          }),
        )
      }

      this.selectedPoints = []
      this.scene.selection.clear()
    }
  }

  moveLine(lineId: string, delta: Vec3) {
    const line = this.scene.lines.get(lineId)
    if (!line) return

    const b1 = line.p1.position.clone()
    const b2 = line.p2.position.clone()

    const a1 = b1.add(delta)
    const a2 = b2.add(delta)

    //this.executeCommand(new MoveLineCommand(line, b1, b2, a1, a2))
  }

  executeCommand(cmd: Command) {
    cmd.execute()
    this.history = this.history.slice(0, this.historyIndex + 1)
    this.history.push(cmd)
    this.historyIndex++
  }

  toggleSnapping() {
    this.isSnappingEnabled = !this.isSnappingEnabled
  }

  undo() {
    if (this.historyIndex >= 0) {
      this.history[this.historyIndex]!.undo()
      this.historyIndex--
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      this.history[this.historyIndex]!.execute()
    }
  }
}
