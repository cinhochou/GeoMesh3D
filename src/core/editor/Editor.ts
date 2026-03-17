// src/core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { TransformCommand } from './TransformCommand'
import { AddElementCommand } from './AddElementCommand' // 引入新命令
import { Vec3 } from '../geometry/Vec3'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { MoveLineCommand } from './MoveLineCommand'

export enum EditorMode {
  Select,
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

  /* ---------- 点的创建 (现在支持撤销) ---------- */
  createPoint(position: Vec3) {
    const p = new Point3(genId('p'), genPointName(), position)
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

  /* ---------- 线的创建 (现在支持撤销) ---------- */
  tryCreateLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateLine) return
    // 将点加入选中列表（用于视觉高亮）
    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length === 2) {
      const [p1, p2] = this.selectedPoints
      const line = new Line3(genId('l'), p1!, p2!)
      this.executeCommand(new AddElementCommand(this.scene, line, 'line'))

      // 创建完成后清空选中
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

    // 执行移动线段的命令
    this.executeCommand(new MoveLineCommand(line, b1, b2, a1, a2))
  }

  /* ---------- 命令调度 ---------- */
  executeCommand(cmd: Command) {
    cmd.execute()
    // 执行新命令时，删除“重做”队列中的旧命令
    this.history = this.history.slice(0, this.historyIndex + 1)
    this.history.push(cmd)
    this.historyIndex++
  }
  //切换点吸附
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
