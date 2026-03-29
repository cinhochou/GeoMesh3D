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
import { SyncLockStateCommand } from './SyncLockStateCommand'

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

  isPointConstrainedByLockedLinear(pointId: string) {
    for (const line of this.scene.lines.values()) {
      if (!line.userLocked) continue
      if (line.p1.id === pointId || line.p2.id === pointId) return true
    }

    for (const ray of this.scene.rays.values()) {
      if (!ray.userLocked) continue
      if (ray.p1.id === pointId || ray.p2.id === pointId) return true
    }

    return false
  }

  isPointCoordinateLocked(point: Point3 | null | undefined) {
    return Boolean(
      point &&
        (point.locked || point.userLocked || this.isPointConstrainedByLockedLinear(point.id)),
    )
  }

  isLineLocked(line: Line3 | null | undefined) {
    return Boolean(line && line.userLocked)
  }

  isRayLocked(ray: Ray3 | null | undefined) {
    return Boolean(ray && ray.userLocked)
  }

  isLineGeometryLocked(line: Line3 | null | undefined) {
    return Boolean(
      line && (line.userLocked || this.isPointCoordinateLocked(line.p1) || this.isPointCoordinateLocked(line.p2)),
    )
  }

  isRayGeometryLocked(ray: Ray3 | null | undefined) {
    return Boolean(
      ray && (ray.userLocked || this.isPointCoordinateLocked(ray.p1) || this.isPointCoordinateLocked(ray.p2)),
    )
  }

  setPointLockState(pointId: string, locked: boolean) {
    const point = this.scene.points.get(pointId)
    if (!point || point.locked) return

    const relatedLines = [...this.scene.lines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedRays = [...this.scene.rays.values()].filter(
      (ray) => ray.p1.id === pointId || ray.p2.id === pointId,
    )

    const pointTransforms = [
      {
        point,
        before: point.userLocked,
        after: locked,
      },
    ].filter((transform) => transform.before !== transform.after)

    const lineTransforms = locked
      ? []
      : relatedLines
          .map((line) => ({
            line,
            before: line.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    const rayTransforms = locked
      ? []
      : relatedRays
          .map((ray) => ({
            ray,
            before: ray.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    if (pointTransforms.length === 0 && lineTransforms.length === 0 && rayTransforms.length === 0) {
      return
    }

    this.executeCommand(new SyncLockStateCommand(pointTransforms, lineTransforms, rayTransforms))
  }

  setLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.lines.get(lineId)
    if (!line) return
    if (line.userLocked === locked) return

    this.executeCommand(
      new SyncLockStateCommand([], [{ line, before: line.userLocked, after: locked }], []),
    )
  }

  setRayLockState(rayId: string, locked: boolean) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return
    if (ray.userLocked === locked) return

    this.executeCommand(
      new SyncLockStateCommand([], [], [{ ray, before: ray.userLocked, after: locked }]),
    )
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
    if (this.isPointCoordinateLocked(point)) return
    if (delta.x === 0 && delta.y === 0 && delta.z === 0) return

    this.setPointPosition(pointId, point.position.add(delta))
  }

  setPointPosition(pointId: string, position: Vec3) {
    const point = this.scene.points.get(pointId)
    if (!point || this.isPointCoordinateLocked(point)) return

    const before = point.position.clone()
    const nextPosition = this.resolveLockedLinePointPosition(pointId, position)
    if (
      before.x === nextPosition.x &&
      before.y === nextPosition.y &&
      before.z === nextPosition.z
    ) {
      return
    }

    const delta = new Vec3(
      nextPosition.x - before.x,
      nextPosition.y - before.y,
      nextPosition.z - before.z,
    )
    const group = this.getLockedTranslationGroup([pointId])
    this.translatePointGroup([...group], delta)
  }

  setPointsPositions(updates: Array<{ id: string; position: Vec3 }>) {
    const transforms = updates
      .map(({ id, position }) => {
        const point = this.scene.points.get(id)
        if (!point || this.isPointCoordinateLocked(point)) return null

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
        if (!point || this.isPointCoordinateLocked(point)) return null
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

  updatePoint(pointId: string, patch: { name?: string; nameVisible?: boolean; userLocked?: boolean }) {
    const point = this.scene.points.get(pointId)
    if (!point) return

    const nextName = patch.name ?? point.name
    const nextVisible = patch.nameVisible ?? point.nameVisible
    const nextUserLocked = patch.userLocked ?? point.userLocked
    if (
      nextName === point.name &&
      nextVisible === point.nameVisible &&
      nextUserLocked === point.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdatePointCommand(
        point,
        { name: point.name, nameVisible: point.nameVisible, userLocked: point.userLocked },
        { name: nextName, nameVisible: nextVisible, userLocked: nextUserLocked },
      ),
    )
  }

  updateLine(
    lineId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      visible?: boolean
      userLocked?: boolean
      lengthLocked?: boolean
      lockedLength?: number
    },
  ) {
    const line = this.scene.lines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextNameVisible = patch.nameVisible ?? line.nameVisible
    const nextVisible = patch.visible ?? line.visible
    const nextUserLocked = patch.userLocked ?? line.userLocked
    const nextLengthLocked = nextUserLocked ? line.lengthLocked : (patch.lengthLocked ?? line.lengthLocked)
    const nextLockedLength = Line3.normalizeLockedLength(
      nextUserLocked
        ? line.lockedLength
        : (patch.lockedLength ??
            (nextLengthLocked && !line.lengthLocked ? line.getLength() : line.lockedLength)),
    )

    let nextP1Position = line.p1.position.clone()
    let nextP2Position = line.p2.position.clone()
    const shouldAdjustLength =
      !nextUserLocked &&
      nextLengthLocked &&
      (!line.lengthLocked || Math.abs(nextLockedLength - line.lockedLength) > 1e-6)

    if (shouldAdjustLength) {
      const direction = line.getNormalizedDirectionVector()
      if (this.isPointCoordinateLocked(line.p2) && !this.isPointCoordinateLocked(line.p1)) {
        nextP1Position = new Vec3(
          line.p2.position.x - direction.x * nextLockedLength,
          line.p2.position.y - direction.y * nextLockedLength,
          line.p2.position.z - direction.z * nextLockedLength,
        )
      } else if (!this.isPointCoordinateLocked(line.p2)) {
        nextP2Position = new Vec3(
          line.p1.position.x + direction.x * nextLockedLength,
          line.p1.position.y + direction.y * nextLockedLength,
          line.p1.position.z + direction.z * nextLockedLength,
        )
      }
    }

    if (
      nextName === line.name &&
      nextNameVisible === line.nameVisible &&
      nextVisible === line.visible &&
      nextUserLocked === line.userLocked &&
      nextLengthLocked === line.lengthLocked &&
      nextLockedLength === line.lockedLength &&
      nextP1Position.x === line.p1.position.x &&
      nextP1Position.y === line.p1.position.y &&
      nextP1Position.z === line.p1.position.z &&
      nextP2Position.x === line.p2.position.x &&
      nextP2Position.y === line.p2.position.y &&
      nextP2Position.z === line.p2.position.z
    ) {
      return
    }

    this.executeCommand(
      new UpdateLineCommand(
        line,
        {
          name: line.name,
          nameVisible: line.nameVisible,
          visible: line.visible,
          userLocked: line.userLocked,
          lengthLocked: line.lengthLocked,
          lockedLength: line.lockedLength,
          p1Position: line.p1.position.clone(),
          p2Position: line.p2.position.clone(),
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          visible: nextVisible,
          userLocked: nextUserLocked,
          lengthLocked: nextLengthLocked,
          lockedLength: nextLockedLength,
          p1Position: nextP1Position,
          p2Position: nextP2Position,
        },
      ),
    )
  }

  updateRay(
    rayId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      visible?: boolean
      displayLength?: number
      userLocked?: boolean
    },
  ) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return

    const nextName = patch.name ?? ray.name
    const nextNameVisible = patch.nameVisible ?? ray.nameVisible
    const nextVisible = patch.visible ?? ray.visible
    const nextDisplayLength = Ray3.normalizeDisplayLength(patch.displayLength ?? ray.displayLength)
    const nextUserLocked = patch.userLocked ?? ray.userLocked
    if (
      nextName === ray.name &&
      nextNameVisible === ray.nameVisible &&
      nextVisible === ray.visible &&
      nextDisplayLength === ray.displayLength &&
      nextUserLocked === ray.userLocked
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
          userLocked: ray.userLocked,
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          visible: nextVisible,
          displayLength: nextDisplayLength,
          userLocked: nextUserLocked,
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

  getLockedTranslationGroup(pointIds: string[]) {
    const group = new Set(pointIds)
    const queue = [...pointIds]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      this.scene.lines.forEach((line) => {
        if (!line.lengthLocked) return
        if (line.p1.id !== currentId && line.p2.id !== currentId) return

        const otherId = line.p1.id === currentId ? line.p2.id : line.p1.id
        if (!group.has(otherId)) {
          group.add(otherId)
          queue.push(otherId)
        }
      })
    }

    return group
  }

  translatePointGroup(pointIds: string[], delta: Vec3) {
    const transforms = pointIds
      .map((id) => {
        const point = this.scene.points.get(id)
        if (!point || this.isPointCoordinateLocked(point)) return null

        const before = point.position.clone()
        const after = before.add(delta)
        if (before.x === after.x && before.y === after.y && before.z === after.z) return null

        return { point, before, after }
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

  resolveLockedLinePointPosition(
    pointId: string,
    position: Vec3,
    positionOverrides?: Map<string, Vec3>,
  ) {
    const point = this.scene.points.get(pointId)
    if (!point) return position.clone()

    let resolved = position.clone()

    this.scene.lines.forEach((line) => {
      if (!line.lengthLocked) return

      const isP1 = line.p1.id === pointId
      const isP2 = line.p2.id === pointId
      if (!isP1 && !isP2) return

      const anchor = isP1 ? line.p2 : line.p1
      if (!this.isPointCoordinateLocked(anchor)) return

      const anchorPosition = positionOverrides?.get(anchor.id) ?? anchor.position
      let dx = resolved.x - anchorPosition.x
      let dy = resolved.y - anchorPosition.y
      let dz = resolved.z - anchorPosition.z
      let distance = Math.hypot(dx, dy, dz)

      if (distance <= 1e-6) {
        const currentPosition = positionOverrides?.get(pointId) ?? point.position
        dx = currentPosition.x - anchorPosition.x
        dy = currentPosition.y - anchorPosition.y
        dz = currentPosition.z - anchorPosition.z
        distance = Math.hypot(dx, dy, dz)
      }

      if (distance <= 1e-6) {
        dx = isP1 ? -1 : 1
        dy = 0
        dz = 0
        distance = 1
      }

      const scale = line.lockedLength / distance
      resolved = new Vec3(
        anchorPosition.x + dx * scale,
        anchorPosition.y + dy * scale,
        anchorPosition.z + dz * scale,
      )
    })

    return resolved
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
