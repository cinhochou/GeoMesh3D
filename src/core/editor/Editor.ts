// src/core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { TransformCommand } from './TransformCommand'
import { AddElementCommand } from './AddElementCommand'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { Vec3 } from '../geometry/Vec3'
import { TransformPointsCommand } from './TransformPointsCommand'
import { UpdatePointCommand } from './UpdatePointCommand'
import { UpdateLineCommand } from './UpdateLineCommand'
import { UpdateRayCommand } from './UpdateRayCommand'
import { DeletePointCommand } from './DeletePointCommand'
import { DeleteLineCommand } from './DeleteLineCommand'
import { DeleteRayCommand } from './DeleteRayCommand'
import { ClearSceneCommand } from './ClearSceneCommand'

export enum EditorMode {
  Select,
  Delete,
  CreatePoint,
  CreateLine,
  CreateRay,
  CreatePlane,
}

let idCounter = 0
const genId = (prefix: string) => `${prefix}_${idCounter++}`
let nameCounter = 0
const genIndexedAlphabetName = (index: number, baseCharCode: number) => {
  const letter = String.fromCharCode(baseCharCode + (index % 26))
  const suffix = Math.floor(index / 26)
  return suffix === 0 ? letter : `${letter}${suffix}`
}

const genPointName = () => {
  // A-Z, A1-Z1, A2-Z2, ...
  return genIndexedAlphabetName(nameCounter++, 65)
}
let lineNameCounter = 0
const genLineName = () => {
  // a-z, a1-z1, a2-z2, ...
  return genIndexedAlphabetName(lineNameCounter++, 97)
}
let rayNameCounter = 0
const genRayName = () => {
  const current = rayNameCounter++
  return current === 0 ? 'r' : `r${current}`
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

  get canUndo() {
    return this.historyIndex >= 0
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1
  }

  setMode(mode: EditorMode) {
    this.mode = mode
    this.selectedPoints = []
  }

  deletePoint(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (!point || point.locked) return

    const relatedLines = [...this.scene.lines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedRays = [...this.scene.rays.values()].filter(
      (ray) => ray.p1.id === pointId || ray.p2.id === pointId,
    )

    this.executeCommand(new DeletePointCommand(this.scene, point, relatedLines, relatedRays))
    this.selectedPoints = this.selectedPoints.filter((p) => p.id !== pointId)
  }

  deleteLine(lineId: string) {
    const line = this.scene.lines.get(lineId)
    if (!line) return
    this.executeCommand(new DeleteLineCommand(this.scene, line))
  }

  deleteRay(rayId: string) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return
    this.executeCommand(new DeleteRayCommand(this.scene, ray))
  }

  clearAll() {
    const points = [...this.scene.points.values()].filter((point) => !point.locked)
    const lines = [...this.scene.lines.values()]
    const rays = [...this.scene.rays.values()]
    const constraints = [...this.scene.constraints]

    if (points.length === 0 && lines.length === 0 && rays.length === 0 && constraints.length === 0)
      return

    this.executeCommand(new ClearSceneCommand(this.scene, points, lines, rays, constraints))
    this.selectedPoints = []
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

  setPointPosition(pointId: string, position: Vec3) {
    const point = this.scene.points.get(pointId)
    if (!point || point.locked) return

    const before = point.position.clone()
    if (before.x === position.x && before.y === position.y && before.z === position.z) return

    this.executeCommand(new TransformCommand(point, before, position.clone()))
  }

  setPointsPositions(updates: Array<{ id: string; position: Vec3 }>) {
    const transforms = updates
      .map(({ id, position }) => {
        const point = this.scene.points.get(id)
        if (!point || point.locked) return null

        const before = point.position.clone()
        if (before.x === position.x && before.y === position.y && before.z === position.z) {
          return null
        }

        return {
          point,
          before,
          after: position.clone(),
        }
      })
      .filter(
        (transform): transform is { point: Point3; before: Vec3; after: Vec3 } => transform !== null,
      )

    if (transforms.length === 0) return
    if (transforms.length === 1) {
      const transform = transforms[0]!
      this.executeCommand(new TransformCommand(transform.point, transform.before, transform.after))
      return
    }

    this.executeCommand(new TransformPointsCommand(transforms))
  }

  applyPointTransformHistory(transforms: Array<{ id: string; before: Vec3; after: Vec3 }>) {
    const commandTransforms = transforms
      .map(({ id, before, after }) => {
        const point = this.scene.points.get(id)
        if (!point || point.locked) return null
        if (before.x === after.x && before.y === after.y && before.z === after.z) return null

        return {
          point,
          before: before.clone(),
          after: after.clone(),
        }
      })
      .filter(
        (transform): transform is { point: Point3; before: Vec3; after: Vec3 } => transform !== null,
      )

    if (commandTransforms.length === 0) return
    if (commandTransforms.length === 1) {
      const transform = commandTransforms[0]!
      this.executeCommand(new TransformCommand(transform.point, transform.before, transform.after))
      return
    }

    this.executeCommand(new TransformPointsCommand(commandTransforms))
  }

  updatePoint(pointId: string, patch: { name?: string; nameVisible?: boolean }) {
    const point = this.scene.points.get(pointId)
    if (!point) return

    const nextName = patch.name ?? point.name
    const nextVisible = patch.nameVisible ?? point.nameVisible
    if (nextName === point.name && nextVisible === point.nameVisible) return

    this.executeCommand(
      new UpdatePointCommand(
        point,
        { name: point.name, nameVisible: point.nameVisible },
        { name: nextName, nameVisible: nextVisible },
      ),
    )
  }

  updateLine(lineId: string, patch: { name?: string; nameVisible?: boolean }) {
    const line = this.scene.lines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextVisible = patch.nameVisible ?? line.nameVisible
    if (nextName === line.name && nextVisible === line.nameVisible) return

    this.executeCommand(
      new UpdateLineCommand(
        line,
        { name: line.name, nameVisible: line.nameVisible },
        { name: nextName, nameVisible: nextVisible },
      ),
    )
  }

  updateRay(
    rayId: string,
    patch: { name?: string; nameVisible?: boolean; visible?: boolean; displayLength?: number },
  ) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return

    const nextName = patch.name ?? ray.name
    const nextNameVisible = patch.nameVisible ?? ray.nameVisible
    const nextVisible = patch.visible ?? ray.visible
    const nextDisplayLength = Ray3.normalizeDisplayLength(patch.displayLength ?? ray.displayLength)
    if (
      nextName === ray.name &&
      nextNameVisible === ray.nameVisible &&
      nextVisible === ray.visible &&
      nextDisplayLength === ray.displayLength
    ) {
      return
    }

    this.executeCommand(
      new UpdateRayCommand(
        ray,
        {
          name: ray.name,
          nameVisible: ray.nameVisible,
          visible: ray.visible,
          displayLength: ray.displayLength,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          visible: nextVisible,
          displayLength: nextDisplayLength,
        },
      ),
    )
  }

  tryCreateLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateLine) return
    this.tryCreateLinearWith(point, 'line')
  }

  tryCreateRayWith(point: Point3) {
    if (this.mode !== EditorMode.CreateRay) return
    this.tryCreateLinearWith(point, 'ray')
  }

  tryCreateLinearWith(point: Point3, type: 'line' | 'ray') {
    this.scene.selection.selectPoint(point.id, true)

    if (!this.selectedPoints.includes(point)) {
      this.selectedPoints.push(point)
    }

    if (this.selectedPoints.length === 2) {
      const [p1, p2] = this.selectedPoints
      const exists =
        type === 'line'
          ? [...this.scene.lines.values()].some(
              (l) =>
                (l.p1.id === p1!.id && l.p2.id === p2!.id) ||
                (l.p1.id === p2!.id && l.p2.id === p1!.id),
            )
          : [...this.scene.rays.values()].some((ray) => ray.p1.id === p1!.id && ray.p2.id === p2!.id)

      if (!exists) {
        if (type === 'line') {
          const line = new Line3(genId('l'), genLineName(), p1!, p2!, true)
          this.executeCommand(new AddElementCommand(this.scene, line, 'line'))
        } else {
          const ray = new Ray3(genId('r'), genRayName(), p1!, p2!, true, true)
          this.executeCommand(new AddElementCommand(this.scene, ray, 'ray'))
        }
      } else {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              msg: type === 'line' ? '线段已存在，创建线段失败' : '射线已存在，创建射线失败',
              scope: 'viewport',
            },
          }),
        )
      }

      this.selectedPoints = []
      this.scene.selection.clear()
    }
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
