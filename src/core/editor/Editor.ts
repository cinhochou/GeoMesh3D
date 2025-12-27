// core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { TransformCommand } from './TransformCommand'
import { Vec3 } from '../geometry/Vec3'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { DistanceConstraint } from '../constraints/DistanceConstraint'

export enum EditorMode {
  Select,
  CreatePoint,
  CreateLine,
  CreatePlane,
}

let idCounter = 0
const genId = (prefix: string) => `${prefix}_${idCounter++}` // 生成 id

export class Editor {
  scene: Scene

  mode: EditorMode = EditorMode.Select
  selectedPoints: Point3[] = []

  // 命令历史记录，实现撤销/重做功能
  history: Command[] = []
  historyIndex = -1

  constructor(scene: Scene) {
    this.scene = scene
  }

  setMode(mode: EditorMode) {
    this.mode = mode
    this.selectedPoints = [] // 更改模式时清空选中的点
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
    this.history = this.history.slice(0, this.historyIndex + 1) //截取保留从索引0到this.historyIndex（包含）的元素
    this.history.push(cmd) //将新执行的命令添加到历史记录末尾
    this.historyIndex++
  }

  addDistanceConstraint() {
    const ids = [...this.scene.selection.points]
    if (ids.length !== 2) return

    const p1 = this.scene.points.get(ids[0]!)!
    const p2 = this.scene.points.get(ids[1]!)!

    const dx = p2.position.x - p1.position.x
    const dy = p2.position.y - p1.position.y
    const dz = p2.position.z - p1.position.z

    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    this.scene.addConstraint(new DistanceConstraint(p1, p2, dist))
  }
}
