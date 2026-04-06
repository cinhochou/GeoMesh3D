// src/core/editor/Editor.ts
import { Scene } from '../scene/Scene'
import type { Command } from './Command'
import { TransformCommand } from './commands/TransformCommand'
import { AddElementCommand } from './commands/AddElementCommand'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarFace } from '../geometry/Plane'
import { Vec3 } from '../geometry/Vec3'
import {
  buildConvexHull,
  computePlaneBasis,
  computeSupportPointIds,
  orderedLoopFromLines,
  PLANAR_EPSILON,
  projectPoint2D,
  projectPointToPlane,
  signedDistanceToPlane,
} from '../geometry/PlanarUtils'
import { TransformPointsCommand } from './commands/TransformPointsCommand'
import { UpdatePointCommand } from './commands/UpdatePointCommand'
import { UpdateLineCommand } from './commands/UpdateLineCommand'
import { UpdateRayCommand } from './commands/UpdateRayCommand'
import { UpdateStraightLineCommand } from './commands/UpdateStraightLineCommand'
import { UpdateFaceCommand } from './commands/UpdateFaceCommand'
import { DeletePointCommand } from './commands/DeletePointCommand'
import { DeleteLineCommand } from './commands/DeleteLineCommand'
import { DeleteRayCommand } from './commands/DeleteRayCommand'
import { DeleteStraightLineCommand } from './commands/DeleteStraightLineCommand'
import { DeleteFaceCommand } from './commands/DeleteFaceCommand'
import { ClearSceneCommand } from './commands/ClearSceneCommand'
import { SyncLockStateCommand } from './commands/SyncLockStateCommand'
import { MergePointsCommand } from './commands/MergePointsCommand'

export enum EditorMode {
  Select,
  Delete,
  CreatePoint,
  MergePoint,
  CreateLine,
  CreateStraightLine,
  CreateRay,
  CreatePlane,
}

export type FacePreviewData = {
  boundary: Vec3[]
  adjustedPoints: Array<{
    id: string
    from: Vec3
    to: Vec3
  }>
  notices: string[]
}

const genIndexedAlphabetName = (index: number, baseCharCode: number) => {
  const letter = String.fromCharCode(baseCharCode + (index % 26))
  const suffix = Math.floor(index / 26)
  return suffix === 0 ? letter : `${letter}${suffix}`
}

const genId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const emitToast = (msg: string) => {
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: {
        msg,
        scope: 'viewport',
      },
    }),
  )
}

const getBoundsDiagonal = (points: Point3[]) => {
  if (points.length === 0) return 0
  let minX = points[0]!.position.x
  let minY = points[0]!.position.y
  let minZ = points[0]!.position.z
  let maxX = minX
  let maxY = minY
  let maxZ = minZ
  points.forEach((point) => {
    minX = Math.min(minX, point.position.x)
    minY = Math.min(minY, point.position.y)
    minZ = Math.min(minZ, point.position.z)
    maxX = Math.max(maxX, point.position.x)
    maxY = Math.max(maxY, point.position.y)
    maxZ = Math.max(maxZ, point.position.z)
  })
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
}

const autoOptimizeFacePoints = (editor: Editor, points: Point3[]) => {
  const plane = computePlaneBasis(points.map((point) => point.position))
  if (!plane)
    return {
      adjusted: 0,
      messages: [] as string[],
      positionOverrides: new Map<string, Vec3>(),
      adjustedPoints: [] as Array<{ id: string; from: Vec3; to: Vec3 }>,
    }

  const diagonal = getBoundsDiagonal(points)
  const planarTolerance = Math.max(0.02, diagonal * 0.015)
  const autoProjectTolerance = Math.max(0.18, diagonal * 0.08)
  const updates: Array<{ id: string; position: Vec3 }> = []
  const positionOverrides = new Map<string, Vec3>()
  const adjustedPoints: Array<{ id: string; from: Vec3; to: Vec3 }> = []
  let blockedLockedPoint = false
  let farOffPoint = false

  points.forEach((point) => {
    const distance = Math.abs(signedDistanceToPlane(point.position, plane))
    if (distance <= planarTolerance) return

    if (distance > autoProjectTolerance) {
      farOffPoint = true
      return
    }

    if (editor.isPointCoordinateLocked(point)) {
      blockedLockedPoint = true
      return
    }

    const projected = projectPointToPlane(point.position, plane)
    updates.push({
      id: point.id,
      position: projected,
    })
    positionOverrides.set(point.id, projected)
    adjustedPoints.push({
      id: point.id,
      from: point.position.clone(),
      to: projected.clone(),
    })
  })

  const messages: string[] = []
  if (updates.length > 0) {
    editor.setPointsPositions(updates)
    messages.push(`已自动将 ${updates.length} 个点投影到同一平面`)
  }
  if (blockedLockedPoint) {
    messages.push('部分锁定点偏离平面，未自动调整')
  }
  if (farOffPoint) {
    messages.push('部分点偏离过大，已按当前主要平面尽量创建')
  }

  return {
    adjusted: updates.length,
    messages,
    positionOverrides,
    adjustedPoints,
  }
}

const getFacesByPointId = (editor: Editor, pointId: string) =>
  [...editor.scene.faces.values()].filter((face) => face.includesPoint(pointId))

const getFacesByLineId = (editor: Editor, lineId: string) =>
  [...editor.scene.faces.values()].filter((face) => face.boundaryLineIds.includes(lineId))

const buildFaceUnlockCascade = (editor: Editor, faces: PlanarFace[]) => {
  const pointTransforms = new Map<string, { point: Point3; before: boolean; after: boolean }>()
  const lineTransforms = new Map<string, { line: Line3; before: boolean; after: boolean }>()
  const faceTransforms = new Map<string, { face: PlanarFace; before: boolean; after: boolean }>()

  faces.forEach((face) => {
    faceTransforms.set(face.id, {
      face,
      before: face.userLocked,
      after: false,
    })

    face.memberPointIds.forEach((pointId) => {
      const point = editor.scene.points.get(pointId)
      if (!point || point.locked) return
      pointTransforms.set(pointId, {
        point,
        before: point.userLocked,
        after: false,
      })
    })

    face.boundaryLineIds.forEach((lineId) => {
      const line = editor.scene.lines.get(lineId)
      if (!line) return
      lineTransforms.set(lineId, {
        line,
        before: line.userLocked,
        after: false,
      })
    })
  })

  return {
    pointTransforms: [...pointTransforms.values()].filter((transform) => transform.before !== transform.after),
    lineTransforms: [...lineTransforms.values()].filter((transform) => transform.before !== transform.after),
    faceTransforms: [...faceTransforms.values()].filter((transform) => transform.before !== transform.after),
  }
}

type FaceDraft = {
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
  positionOverrides: Map<string, Vec3>
  notices: string[]
  adjustedPoints: Array<{
    id: string
    from: Vec3
    to: Vec3
  }>
}

const toWorldPoint = (
  plane: NonNullable<ReturnType<typeof computePlaneBasis>>,
  x: number,
  y: number,
) =>
  new Vec3(
    plane.origin.x + plane.uAxis.x * x + plane.vAxis.x * y,
    plane.origin.y + plane.uAxis.y * x + plane.vAxis.y * y,
    plane.origin.z + plane.uAxis.z * x + plane.vAxis.z * y,
  )

const genNextAvailableName = (
  existingNames: Iterable<string>,
  baseCharCode: number,
  formatter?: (index: number) => string,
) => {
  const usedNames = new Set(existingNames)
  let index = 0

  while (true) {
    const candidate = formatter ? formatter(index) : genIndexedAlphabetName(index, baseCharCode)
    if (!usedNames.has(candidate)) return candidate
    index += 1
  }
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

    for (const line of this.scene.straightLines.values()) {
      if (!line.userLocked) continue
      if (line.p1.id === pointId || line.p2.id === pointId) return true
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
    return Boolean(
      line && (line.userLocked || (this.isPointCoordinateLocked(line.p1) && this.isPointCoordinateLocked(line.p2))),
    )
  }

  isRayLocked(ray: Ray3 | null | undefined) {
    return Boolean(
      ray && (ray.userLocked || (this.isPointCoordinateLocked(ray.p1) && this.isPointCoordinateLocked(ray.p2))),
    )
  }

  isStraightLineLocked(line: StraightLine3 | null | undefined) {
    return Boolean(
      line &&
        (line.userLocked ||
          (this.isPointCoordinateLocked(line.p1) && this.isPointCoordinateLocked(line.p2))),
    )
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

  isStraightLineGeometryLocked(line: StraightLine3 | null | undefined) {
    return Boolean(
      line &&
        (line.userLocked ||
          this.isPointCoordinateLocked(line.p1) ||
          this.isPointCoordinateLocked(line.p2)),
    )
  }

  isFaceLocked(face: PlanarFace | null | undefined) {
    return Boolean(
      face &&
        (face.userLocked ||
          face
            .getMemberPoints(this.scene.points)
            .every((point) => this.isPointCoordinateLocked(point))),
    )
  }

  isFaceGeometryLocked(face: PlanarFace | null | undefined) {
    return Boolean(
      face &&
        (face.userLocked ||
          face
            .getMemberPoints(this.scene.points)
            .some((point) => this.isPointCoordinateLocked(point))),
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
    const relatedStraightLines = [...this.scene.straightLines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedFaces = getFacesByPointId(this, pointId)

    if (!locked && relatedFaces.length > 0) {
      const faceCascade = buildFaceUnlockCascade(this, relatedFaces)
      if (
        faceCascade.pointTransforms.length === 0 &&
        faceCascade.lineTransforms.length === 0 &&
        faceCascade.faceTransforms.length === 0
      ) {
        return
      }

      this.executeCommand(
        new SyncLockStateCommand(
          faceCascade.pointTransforms,
          faceCascade.lineTransforms,
          [],
          [],
          faceCascade.faceTransforms,
        ),
      )
      return
    }

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

    const straightLineTransforms = locked
      ? []
      : relatedStraightLines
          .map((line) => ({
            line,
            before: line.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)

    if (
      pointTransforms.length === 0 &&
      lineTransforms.length === 0 &&
      straightLineTransforms.length === 0 &&
      rayTransforms.length === 0
    ) {
      return
    }

    this.executeCommand(
      new SyncLockStateCommand(pointTransforms, lineTransforms, straightLineTransforms, rayTransforms),
    )
  }

  setLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.lines.get(lineId)
    if (!line) return
    const relatedFaces = getFacesByLineId(this, lineId)
    if (!locked && relatedFaces.length > 0) {
      const faceCascade = buildFaceUnlockCascade(this, relatedFaces)
      if (
        faceCascade.pointTransforms.length === 0 &&
        faceCascade.lineTransforms.length === 0 &&
        faceCascade.faceTransforms.length === 0
      ) {
        return
      }

      this.executeCommand(
        new SyncLockStateCommand(
          faceCascade.pointTransforms,
          faceCascade.lineTransforms,
          [],
          [],
          faceCascade.faceTransforms,
        ),
      )
      return
    }

    const endpointTransforms = !locked
      ? [line.p1, line.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (line.userLocked === locked && endpointTransforms.length === 0) return

    this.executeCommand(
      new SyncLockStateCommand(
        endpointTransforms,
        [{ line, before: line.userLocked, after: locked }],
        [],
        [],
        [],
      ),
    )
  }

  setStraightLineLockState(lineId: string, locked: boolean) {
    const line = this.scene.straightLines.get(lineId)
    if (!line) return
    const endpointTransforms = !locked
      ? [line.p1, line.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (line.userLocked === locked && endpointTransforms.length === 0) return

    this.executeCommand(
      new SyncLockStateCommand(
        endpointTransforms,
        [],
        [{ line, before: line.userLocked, after: locked }],
        [],
        [],
      ),
    )
  }

  setRayLockState(rayId: string, locked: boolean) {
    const ray = this.scene.rays.get(rayId)
    if (!ray) return
    const endpointTransforms = !locked
      ? [ray.p1, ray.p2]
          .filter((point) => !point.locked)
          .map((point) => ({
            point,
            before: point.userLocked,
            after: false,
          }))
          .filter((transform) => transform.before !== transform.after)
      : []

    if (ray.userLocked === locked && endpointTransforms.length === 0) return

    this.executeCommand(
      new SyncLockStateCommand(
        endpointTransforms,
        [],
        [],
        [{ ray, before: ray.userLocked, after: locked }],
        [],
      ),
    )
  }

  setFaceLockState(faceId: string, locked: boolean) {
    const face = this.scene.faces.get(faceId)
    if (!face) return

    const pointTransforms = face.memberPointIds
      .map((pointId) => this.scene.points.get(pointId))
      .filter((point): point is Point3 => point !== undefined && !point.locked)
      .map((point) => ({
        point,
        before: point.userLocked,
        after: locked,
      }))
      .filter((transform) => transform.before !== transform.after)

    const lineTransforms = face.boundaryLineIds
      .map((lineId) => this.scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined)
      .map((line) => ({
        line,
        before: line.userLocked,
        after: locked,
      }))
      .filter((transform) => transform.before !== transform.after)

    const faceTransforms =
      face.userLocked === locked
        ? []
        : [
            {
              face,
              before: face.userLocked,
              after: locked,
            },
          ]

    if (pointTransforms.length === 0 && lineTransforms.length === 0 && faceTransforms.length === 0) return

    this.executeCommand(
      new SyncLockStateCommand(pointTransforms, lineTransforms, [], [], faceTransforms),
    )
  }

  setFaceAreaLockState(faceId: string, locked: boolean) {
    const face = this.scene.faces.get(faceId)
    if (!face) return
    const nextLockedArea = locked ? face.getArea(this.scene.points) : face.lockedArea
    if (face.areaLocked === locked && (!locked || Math.abs(face.lockedArea - nextLockedArea) <= 1e-6)) {
      return
    }

    this.executeCommand(
      new UpdateFaceCommand(
        face,
        {
          name: face.name,
          nameVisible: face.nameVisible,
          visible: face.visible,
          userLocked: face.userLocked,
          areaLocked: face.areaLocked,
          lockedArea: face.lockedArea,
          edgeLengthLocks: [...face.edgeLengthLocks],
        },
        {
          name: face.name,
          nameVisible: face.nameVisible,
          visible: face.visible,
          userLocked: face.userLocked,
          areaLocked: locked,
          lockedArea: nextLockedArea,
          edgeLengthLocks: [...face.edgeLengthLocks],
        },
      ),
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
    const relatedStraightLines = [...this.scene.straightLines.values()].filter(
      (line) => line.p1.id === pointId || line.p2.id === pointId,
    )
    const relatedFaces = [...this.scene.faces.values()].filter((face) => face.includesPoint(pointId))

    this.executeCommand(
      new DeletePointCommand(
        this.scene,
        point,
        relatedLines,
        relatedStraightLines,
        relatedRays,
        relatedFaces,
      ),
    )
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

  deleteStraightLine(lineId: string) {
    const line = this.scene.straightLines.get(lineId)
    if (!line) return
    this.executeCommand(new DeleteStraightLineCommand(this.scene, line))
  }

  deleteFace(faceId: string) {
    const face = this.scene.faces.get(faceId)
    if (!face) return
    this.executeCommand(new DeleteFaceCommand(this.scene, face))
  }

  clearAll() {
    const points = [...this.scene.points.values()].filter((point) => !point.locked)
    const lines = [...this.scene.lines.values()]
    const straightLines = [...this.scene.straightLines.values()]
    const rays = [...this.scene.rays.values()]
    const faces = [...this.scene.faces.values()]
    const constraints = this.scene.constraints.filter((constraint) => !('faceId' in constraint))

    if (
      points.length === 0 &&
      lines.length === 0 &&
      straightLines.length === 0 &&
      rays.length === 0 &&
      faces.length === 0 &&
      constraints.length === 0
    )
      return

    this.executeCommand(
      new ClearSceneCommand(this.scene, points, lines, straightLines, rays, faces, constraints),
    )
    this.selectedPoints = []
  }

  createPoint(position: Vec3) {
    const p = new Point3(
      genId('p'),
      genNextAvailableName(
        [...this.scene.points.values()].map((point) => point.name),
        65,
      ),
      position,
      false,
      true,
    )
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
    const resolvedPositions = this.resolveConstrainedPointPositions(
      updates.map(({ id, position }) => ({ id, position: position.clone() })),
    )
    const transforms = [...resolvedPositions.entries()]
      .map(([id, position]) => {
        const point = this.scene.points.get(id)
        if (!point || this.isPointCoordinateLocked(point)) return null
        const before = point.position.clone()
        if (before.x === position.x && before.y === position.y && before.z === position.z) return null
        return { point, before, after: position.clone() }
      })
      .filter((transform): transform is { point: Point3; before: Vec3; after: Vec3 } => transform !== null)

    if (transforms.length === 0) return
    if (transforms.length === 1) {
      const transform = transforms[0]!
      this.executeCommand(new TransformCommand(transform.point, transform.before, transform.after))
      return
    }

    this.executeCommand(new TransformPointsCommand(transforms))
  }

  applyPointTransformHistory(transforms: Array<{ id: string; before: Vec3; after: Vec3 }>) {
    const resolvedPositions = this.resolveConstrainedPointPositions(
      transforms.map(({ id, after }) => ({ id, position: after.clone() })),
    )
    const commandTransforms = [...resolvedPositions.entries()]
      .map(([id, position]) => {
        const original = transforms.find((item) => item.id === id)
        const point = this.scene.points.get(id)
        if (!point || !original || this.isPointCoordinateLocked(point)) return null
        if (
          original.before.x === position.x &&
          original.before.y === position.y &&
          original.before.z === position.z
        ) {
          return null
        }

        return {
          point,
          before: original.before.clone(),
          after: position.clone(),
        }
      })
      .filter((transform): transform is { point: Point3; before: Vec3; after: Vec3 } => transform !== null)

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

    const resolvedEndpoints = this.resolveConstrainedPointPositions(
      [
        { id: line.p1.id, position: nextP1Position.clone() },
        { id: line.p2.id, position: nextP2Position.clone() },
      ].filter(({ id }, index, items) => items.findIndex((item) => item.id === id) === index),
    )
    nextP1Position = resolvedEndpoints.get(line.p1.id) ?? nextP1Position
    nextP2Position = resolvedEndpoints.get(line.p2.id) ?? nextP2Position

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

  updateStraightLine(
    lineId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      visible?: boolean
      displayLength?: number
      userLocked?: boolean
    },
  ) {
    const line = this.scene.straightLines.get(lineId)
    if (!line) return

    const nextName = patch.name ?? line.name
    const nextNameVisible = patch.nameVisible ?? line.nameVisible
    const nextVisible = patch.visible ?? line.visible
    const nextDisplayLength = StraightLine3.normalizeDisplayLength(
      patch.displayLength ?? line.displayLength,
    )
    const nextUserLocked = patch.userLocked ?? line.userLocked
    if (
      nextName === line.name &&
      nextNameVisible === line.nameVisible &&
      nextVisible === line.visible &&
      nextDisplayLength === line.displayLength &&
      nextUserLocked === line.userLocked
    ) {
      return
    }

    this.executeCommand(
      new UpdateStraightLineCommand(
        line,
        {
          name: line.name,
          nameVisible: line.nameVisible,
          visible: line.visible,
          displayLength: line.displayLength,
          userLocked: line.userLocked,
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

  updateFace(
    faceId: string,
    patch: {
      name?: string
      nameVisible?: boolean
      visible?: boolean
      userLocked?: boolean
      areaLocked?: boolean
      lockedArea?: number
      edgeLengthLocks?: Array<number | null>
    },
  ) {
    const face = this.scene.faces.get(faceId)
    if (!face) return

    const nextName = patch.name ?? face.name
    const nextNameVisible = patch.nameVisible ?? face.nameVisible
    const nextVisible = patch.visible ?? face.visible
    const nextUserLocked = patch.userLocked ?? face.userLocked
    const nextAreaLocked = patch.areaLocked ?? face.areaLocked
    const nextLockedArea = patch.lockedArea ?? face.lockedArea
    const nextEdgeLengthLocks = patch.edgeLengthLocks ?? face.edgeLengthLocks
    if (
      nextName === face.name &&
      nextNameVisible === face.nameVisible &&
      nextVisible === face.visible &&
      nextUserLocked === face.userLocked &&
      nextAreaLocked === face.areaLocked &&
      nextLockedArea === face.lockedArea &&
      JSON.stringify(nextEdgeLengthLocks) === JSON.stringify(face.edgeLengthLocks)
    ) {
      return
    }

    this.executeCommand(
      new UpdateFaceCommand(
        face,
        {
          name: face.name,
          nameVisible: face.nameVisible,
          visible: face.visible,
          userLocked: face.userLocked,
          areaLocked: face.areaLocked,
          lockedArea: face.lockedArea,
          edgeLengthLocks: [...face.edgeLengthLocks],
        },
        {
          name: nextName,
          nameVisible: nextNameVisible,
          visible: nextVisible,
          userLocked: nextUserLocked,
          areaLocked: nextAreaLocked,
          lockedArea: nextLockedArea,
          edgeLengthLocks: [...nextEdgeLengthLocks],
        },
      ),
    )
  }

  tryCreateLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateLine) return
    this.tryCreateLinearWith(point, 'line')
  }

  mergePoints(keepPointId: string, removePointId: string) {
    if (keepPointId === removePointId) return
    const keepPoint = this.scene.points.get(keepPointId)
    const removePoint = this.scene.points.get(removePointId)
    if (!keepPoint || !removePoint || removePoint.locked) return

    this.executeCommand(new MergePointsCommand(this.scene, keepPoint, removePoint))
    this.selectedPoints = []
    this.scene.selection.clear()
    this.scene.selection.selectPoint(keepPointId)
  }

  tryCreateStraightLineWith(point: Point3) {
    if (this.mode !== EditorMode.CreateStraightLine) return
    this.tryCreateLinearWith(point, 'straightLine')
  }

  tryCreateRayWith(point: Point3) {
    if (this.mode !== EditorMode.CreateRay) return
    this.tryCreateLinearWith(point, 'ray')
  }

  tryCreateFaceFromSelection() {
    if (this.mode !== EditorMode.CreatePlane) return

    const selectedPoints = [...this.scene.selection.points]
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const selectedLines = [...this.scene.selection.lines]
      .map((id) => this.scene.lines.get(id))
      .filter((line): line is Line3 => line !== undefined)

    const draft = this.buildFaceDraftFromSelection(selectedPoints, selectedLines)
    if (!draft) return

    const face = new PlanarFace(
      genId('f'),
      genNextAvailableName(
        [...this.scene.faces.values()].map((item) => item.name),
        0,
        (index) => (index === 0 ? 'F' : `F${index}`),
      ),
      draft.boundaryPointIds,
      draft.memberPointIds,
      draft.boundaryLineIds,
      true,
      true,
      false,
      draft.supportPointIds,
      false,
      0,
      [],
    )

    face.normalize(this.scene.points)
    this.executeCommand(new AddElementCommand(this.scene, face, 'face'))
    this.scene.selection.clear()
    this.scene.selection.selectFace(face.id)
  }

  getFacePreviewFromSelection(): FacePreviewData | null {
    if (this.mode !== EditorMode.CreatePlane) return null

    const selectedPoints = [...this.scene.selection.points]
      .map((id) => this.scene.points.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const selectedLines = [...this.scene.selection.lines]
      .map((id) => this.scene.lines.get(id))
      .filter((line): line is Line3 => line !== undefined)
    const draft = this.buildFaceDraftFromSelection(selectedPoints, selectedLines, false, false)
    if (!draft) return null

    const boundary = draft.boundaryPointIds
      .map((id) => draft.positionOverrides.get(id) ?? this.scene.points.get(id)?.position)
      .filter((point): point is Vec3 => point !== undefined)
      .map((point) => point.clone())
    if (boundary.length < 3) return null

    return {
      boundary,
      adjustedPoints: draft.adjustedPoints.map((item) => ({
        id: item.id,
        from: item.from.clone(),
        to: item.to.clone(),
      })),
      notices: [...draft.notices],
    }
  }

  tryCreateLinearWith(point: Point3, type: 'line' | 'straightLine' | 'ray') {
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
          : type === 'straightLine'
            ? [...this.scene.straightLines.values()].some(
                (l) =>
                  (l.p1.id === p1!.id && l.p2.id === p2!.id) ||
                  (l.p1.id === p2!.id && l.p2.id === p1!.id),
              )
          : [...this.scene.rays.values()].some((ray) => ray.p1.id === p1!.id && ray.p2.id === p2!.id)

      if (!exists) {
        if (type === 'line') {
          const line = new Line3(
            genId('l'),
            genNextAvailableName(
              [...this.scene.lines.values()].map((line) => line.name),
              97,
            ),
            p1!,
            p2!,
            true,
          )
          this.executeCommand(new AddElementCommand(this.scene, line, 'line'))
        } else if (type === 'straightLine') {
          const line = new StraightLine3(
            genId('sl'),
            genNextAvailableName(
              [...this.scene.straightLines.values()].map((line) => line.name),
              0,
              (index) => (index === 0 ? 'm' : `m${index}`),
            ),
            p1!,
            p2!,
            true,
            true,
          )
          this.executeCommand(new AddElementCommand(this.scene, line, 'straightLine'))
        } else {
          const ray = new Ray3(
            genId('r'),
            genNextAvailableName(
              [...this.scene.rays.values()].map((ray) => ray.name),
              0,
              (index) => (index === 0 ? 'r' : `r${index}`),
            ),
            p1!,
            p2!,
            true,
            true,
          )
          this.executeCommand(new AddElementCommand(this.scene, ray, 'ray'))
        }
      } else {
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: {
              msg:
                type === 'line'
                  ? '线段已存在，创建线段失败'
                  : type === 'straightLine'
                    ? '直线已存在，创建直线失败'
                    : '射线已存在，创建射线失败',
              scope: 'viewport',
            },
          }),
        )
      }

      this.selectedPoints = []
      this.scene.selection.clear()
    }
  }

  buildFaceDraftFromSelection(
    points: Point3[],
    lines: Line3[],
    applyAutoAdjustments: boolean = true,
    notify: boolean = true,
  ): FaceDraft | null {
    const pointMap = new Map(points.map((point) => [point.id, point]))
    lines.forEach((line) => {
      pointMap.set(line.p1.id, line.p1)
      pointMap.set(line.p2.id, line.p2)
    })
    const uniquePoints = [...pointMap.values()]
    if (uniquePoints.length === 0) {
      return null
    }
    if (uniquePoints.length < 3) {
      if (notify) emitToast('创建面至少需要 3 个点，或一个由线段组成的闭环')
      return null
    }

    const optimization = autoOptimizeFacePoints(this, uniquePoints)
    const positionOverrides = applyAutoAdjustments ? new Map<string, Vec3>() : optimization.positionOverrides
    if (notify && applyAutoAdjustments && optimization.messages.length > 0) {
      emitToast(optimization.messages.join('；'))
    }

    const getPointPosition = (point: Point3) => positionOverrides.get(point.id) ?? point.position
    const allPositions = uniquePoints.map((point) => getPointPosition(point))
    const primaryPlane = computePlaneBasis(allPositions)
    if (!primaryPlane) {
      if (notify) emitToast('选中的点过于接近共线，无法创建稳定的面')
      return null
    }

    let boundaryPointIds: string[] = []
    const notices = [...optimization.messages]
    if (lines.length > 0) {
      const loopIds = orderedLoopFromLines(lines)
      if (loopIds && loopIds.length >= 3) {
        boundaryPointIds = loopIds
      } else {
        const hull = buildConvexHull(
          uniquePoints.map((point) => ({
            id: point.id,
            ...projectPoint2D(getPointPosition(point), primaryPlane),
          })),
        )
        boundaryPointIds = hull.map((point) => point.id)
        notices.push('所选线段未形成闭环，已按外轮廓自动建面')
        if (notify && applyAutoAdjustments) {
          emitToast('所选线段未形成闭环，已按外轮廓自动建面')
        }
      }
    } else {
      const hull = buildConvexHull(
        uniquePoints.map((point) => ({
          id: point.id,
          ...projectPoint2D(getPointPosition(point), primaryPlane),
        })),
      )
      boundaryPointIds = hull.map((point) => point.id)
      if (boundaryPointIds.length < 3) {
        if (notify) emitToast('选中的点无法形成有效面积')
        return null
      }
    }

    const boundaryPoints = boundaryPointIds
      .map((id) => pointMap.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const plane = computePlaneBasis(boundaryPoints.map((point) => getPointPosition(point)))
    if (!plane) {
      if (notify) emitToast('面的边界点共线，无法创建面')
      return null
    }

    const optimizedBoundaryIds = buildConvexHull(
      boundaryPoints.map((point) => ({
        id: point.id,
        ...projectPoint2D(getPointPosition(point), plane),
      })),
    ).map((point) => point.id)
    if (optimizedBoundaryIds.length >= 3) {
      const boundaryChanged =
        optimizedBoundaryIds.length !== boundaryPointIds.length ||
        optimizedBoundaryIds.some((id) => !boundaryPointIds.includes(id))
      boundaryPointIds = optimizedBoundaryIds
      if (boundaryChanged) {
        notices.push('已自动优化面的边界轮廓')
        if (notify && applyAutoAdjustments) {
          emitToast('已自动优化面的边界轮廓')
        }
      }
    }

    const signedArea = boundaryPointIds.reduce((sum, id, index, ids) => {
      const point = pointMap.get(id)
      const nextPoint = pointMap.get(ids[(index + 1) % ids.length]!)
      if (!point || !nextPoint) return sum
      const current2D = projectPoint2D(getPointPosition(point), plane)
      const next2D = projectPoint2D(getPointPosition(nextPoint), plane)
      return sum + current2D.x * next2D.y - next2D.x * current2D.y
    }, 0)
    if (signedArea < 0) {
      boundaryPointIds = [...boundaryPointIds].reverse()
    }
    const areaPoints = boundaryPointIds
      .map((id) => pointMap.get(id))
      .filter((point): point is Point3 => point !== undefined)
    const area = areaPoints
      .map((point) => projectPoint2D(getPointPosition(point), plane))
      .reduce((sum, point, index, arr) => {
        const next = arr[(index + 1) % arr.length]!
        return sum + point.x * next.y - next.x * point.y
      }, 0)
    if (Math.abs(area) * 0.5 <= PLANAR_EPSILON) {
      if (notify) emitToast('面的面积过小，无法创建')
      return null
    }

    const memberPointIds = [...new Set([...boundaryPointIds, ...uniquePoints.map((point) => point.id)])]
    const supportPointIds = computeSupportPointIds(
      memberPointIds
        .map((id) => pointMap.get(id))
        .filter((point): point is Point3 => point !== undefined),
    )
    if (supportPointIds.length < 3) {
      if (notify) emitToast('无法为该面建立稳定的平面约束')
      return null
    }

    const duplicate = [...this.scene.faces.values()].some((face) => {
      if (face.boundaryPointIds.length !== boundaryPointIds.length) return false
      return face.boundaryPointIds.every((id) => boundaryPointIds.includes(id))
    })
    if (duplicate) {
      if (notify) emitToast('相同边界的面已存在')
      return null
    }

    return {
      boundaryPointIds,
      memberPointIds,
      boundaryLineIds: lines.map((line) => line.id),
      supportPointIds,
      positionOverrides,
      notices,
      adjustedPoints: optimization.adjustedPoints,
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
    const resolvedPositions = this.resolveConstrainedPointPositions(
      pointIds.map((id) => {
        const point = this.scene.points.get(id)
        return {
          id,
          position: point ? point.position.add(delta) : new Vec3(),
        }
      }),
    )
    const transforms = [...resolvedPositions.entries()]
      .map(([id, position]) => {
        const point = this.scene.points.get(id)
        if (!point || this.isPointCoordinateLocked(point)) return null

        const before = point.position.clone()
        if (before.x === position.x && before.y === position.y && before.z === position.z) return null
        return { point, before, after: position.clone() }
      })
      .filter((transform): transform is { point: Point3; before: Vec3; after: Vec3 } => transform !== null)

    if (transforms.length === 0) return
    if (transforms.length === 1) {
      const transform = transforms[0]!
      this.executeCommand(new TransformCommand(transform.point, transform.before, transform.after))
      return
    }

    this.executeCommand(new TransformPointsCommand(transforms))
  }

  resolveConstrainedPointPositions(updates: Array<{ id: string; position: Vec3 }>) {
    const nextPositions = new Map<string, Vec3>()

    updates.forEach(({ id, position }) => {
      const point = this.scene.points.get(id)
      if (!point || this.isPointCoordinateLocked(point)) return
      nextPositions.set(id, position.clone())
    })

    const faceIds = new Set<string>()
    this.scene.faces.forEach((face) => {
      if (face.memberPointIds.some((id) => nextPositions.has(id))) {
        face.memberPointIds.forEach((id) => {
          const point = this.scene.points.get(id)
          if (!point || this.isPointCoordinateLocked(point)) return
          if (!nextPositions.has(id)) nextPositions.set(id, point.position.clone())
        })
        faceIds.add(face.id)
      }
    })

    for (let iteration = 0; iteration < 3; iteration += 1) {
      for (const [id, position] of [...nextPositions.entries()]) {
        nextPositions.set(id, this.resolveLockedLinePointPosition(id, position, nextPositions))
      }

      faceIds.forEach((faceId) => {
        const face = this.scene.faces.get(faceId)
        if (!face) return
        const supportPoints: Vec3[] = face
          .getSupportPoints(this.scene.points)
          .map((point) => nextPositions.get(point.id) ?? point.position)
        const plane =
          computePlaneBasis(supportPoints) ??
          computePlaneBasis(
            face
              .getBoundaryPoints(this.scene.points)
              .map((point) => nextPositions.get(point.id) ?? point.position),
          )
        if (!plane) return

        face.memberPointIds.forEach((pointId) => {
          if (face.supportPointIds.includes(pointId)) return
          const point = this.scene.points.get(pointId)
          if (!point || this.isPointCoordinateLocked(point)) return
          const position = nextPositions.get(pointId) ?? point.position
          nextPositions.set(pointId, projectPointToPlane(position, plane))
        })

        if (!face.areaLocked || face.lockedArea <= PLANAR_EPSILON) return

        const boundaryPoints = face.getBoundaryPoints(this.scene.points)
        if (boundaryPoints.length < 3) return
        const projectedBoundary = boundaryPoints.map((point) =>
          projectPoint2D(nextPositions.get(point.id) ?? point.position, plane),
        )
        const currentArea =
          Math.abs(
            projectedBoundary.reduce((sum, point, index, arr) => {
              const next = arr[(index + 1) % arr.length]!
              return sum + point.x * next.y - next.x * point.y
            }, 0),
          ) * 0.5
        if (currentArea <= PLANAR_EPSILON) return

        const movableBoundaryIds = new Set(
          boundaryPoints
            .filter((point) => !this.isPointCoordinateLocked(point))
            .map((point) => point.id),
        )
        if (movableBoundaryIds.size === 0) return

        const centroid2D = projectedBoundary.reduce(
          (acc, point) => ({
            x: acc.x + point.x / projectedBoundary.length,
            y: acc.y + point.y / projectedBoundary.length,
          }),
          { x: 0, y: 0 },
        )

        const computeAreaForScale = (scale: number) =>
          Math.abs(
            boundaryPoints.reduce((sum, point, index, points) => {
              const current = projectedBoundary[index]!
              const nextBase = projectedBoundary[(index + 1) % points.length]!
              const currentScaled = movableBoundaryIds.has(point.id)
                ? {
                    x: centroid2D.x + (current.x - centroid2D.x) * scale,
                    y: centroid2D.y + (current.y - centroid2D.y) * scale,
                  }
                : current
              const nextPoint = points[(index + 1) % points.length]!
              const nextScaled = movableBoundaryIds.has(nextPoint.id)
                ? {
                    x: centroid2D.x + (nextBase.x - centroid2D.x) * scale,
                    y: centroid2D.y + (nextBase.y - centroid2D.y) * scale,
                  }
                : nextBase
              return sum + currentScaled.x * nextScaled.y - nextScaled.x * currentScaled.y
            }, 0),
          ) * 0.5

        let low = 0
        let high = Math.max(1, Math.sqrt(face.lockedArea / currentArea) * 2)
        while (computeAreaForScale(high) < face.lockedArea && high < 1024) {
          high *= 2
        }
        for (let i = 0; i < 24; i += 1) {
          const mid = (low + high) * 0.5
          if (computeAreaForScale(mid) < face.lockedArea) low = mid
          else high = mid
        }
        const scale = (low + high) * 0.5

        face.memberPointIds.forEach((pointId) => {
          const point = this.scene.points.get(pointId)
          if (!point || this.isPointCoordinateLocked(point)) return
          const current = projectPoint2D(nextPositions.get(pointId) ?? point.position, plane)
          nextPositions.set(
            pointId,
            toWorldPoint(
              plane,
              centroid2D.x + (current.x - centroid2D.x) * scale,
              centroid2D.y + (current.y - centroid2D.y) * scale,
            ),
          )
        })
      })
    }

    return nextPositions
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

  updateFaceBoundaryEdgeLength(
    faceId: string,
    edgeIndex: number,
    nextLength: number,
    edgeTargets?: Array<number | null>,
  ) {
    const face = this.scene.faces.get(faceId)
    if (!face || face.areaLocked) return

    const normalizedLength = Line3.normalizeLockedLength(nextLength)
    const boundaryPoints = face.getBoundaryPoints(this.scene.points)
    if (boundaryPoints.length < 3) return

    const plane =
      computePlaneBasis(face.getSupportPoints(this.scene.points).map((point) => point.position)) ??
      computePlaneBasis(boundaryPoints.map((point) => point.position))
    if (!plane) return

    const projectedBoundary = boundaryPoints.map((point) =>
      projectPoint2D(projectPointToPlane(point.position, plane), plane),
    )
    const targetLengths = boundaryPoints.map((_, index) => {
      if (index === edgeIndex) return normalizedLength
      const target = edgeTargets?.[index]
      return typeof target === 'number' && Number.isFinite(target)
        ? Line3.normalizeLockedLength(target)
        : face.getEdgeLength(this.scene.points, index)
    })

    const startIndex = edgeIndex
    const endIndex = (edgeIndex + 1) % boundaryPoints.length
    const startPoint = boundaryPoints[startIndex]
    const endPoint = boundaryPoints[endIndex]
    if (!startPoint || !endPoint) return

    const startLocked = this.isPointCoordinateLocked(startPoint)
    const endLocked = this.isPointCoordinateLocked(endPoint)
    if (startLocked && endLocked) return

    const start2D = projectedBoundary[startIndex]!
    const end2D = projectedBoundary[endIndex]!
    let dirX = end2D.x - start2D.x
    let dirY = end2D.y - start2D.y
    let dirLength = Math.hypot(dirX, dirY)
    if (dirLength <= 1e-6) {
      dirX = 1
      dirY = 0
      dirLength = 1
    }
    dirX /= dirLength
    dirY /= dirLength

    const nextStart2D = { ...start2D }
    const nextEnd2D = { ...end2D }
    if (startLocked) {
      nextEnd2D.x = start2D.x + dirX * normalizedLength
      nextEnd2D.y = start2D.y + dirY * normalizedLength
    } else if (endLocked) {
      nextStart2D.x = end2D.x - dirX * normalizedLength
      nextStart2D.y = end2D.y - dirY * normalizedLength
    } else {
      const midX = (start2D.x + end2D.x) * 0.5
      const midY = (start2D.y + end2D.y) * 0.5
      const half = normalizedLength * 0.5
      nextStart2D.x = midX - dirX * half
      nextStart2D.y = midY - dirY * half
      nextEnd2D.x = midX + dirX * half
      nextEnd2D.y = midY + dirY * half
    }

    const chainIndices = [endIndex]
    let cursor = endIndex
    while (cursor !== startIndex) {
      cursor = (cursor + 1) % boundaryPoints.length
      chainIndices.push(cursor)
    }

    const chainPoints = chainIndices.map((index) => ({ ...projectedBoundary[index]! }))
    const chainLengths = chainIndices.slice(0, -1).map((index) => targetLengths[index]!)
    const fixedPositions = new Map<number, { x: number; y: number }>()
    chainPoints[0] = { ...nextEnd2D }
    chainPoints[chainPoints.length - 1] = { ...nextStart2D }
    fixedPositions.set(0, { ...nextEnd2D })
    fixedPositions.set(chainPoints.length - 1, { ...nextStart2D })
    chainIndices.forEach((boundaryIndex, chainIndex) => {
      if (chainIndex === 0 || chainIndex === chainPoints.length - 1) return
      const point = boundaryPoints[boundaryIndex]
      if (!point || !this.isPointCoordinateLocked(point)) return
      fixedPositions.set(chainIndex, { ...projectedBoundary[boundaryIndex]! })
    })

    for (let iteration = 0; iteration < 64; iteration += 1) {
      fixedPositions.forEach((fixed, index) => {
        chainPoints[index] = { ...fixed }
      })

      for (let i = 0; i < chainPoints.length - 1; i += 1) {
        const p1 = chainPoints[i]!
        const p2 = chainPoints[i + 1]!
        const target = chainLengths[i]!
        let dx = p2.x - p1.x
        let dy = p2.y - p1.y
        let distance = Math.hypot(dx, dy)
        if (distance <= 1e-6) {
          dx = 1
          dy = 0
          distance = 1
        }
        const ux = dx / distance
        const uy = dy / distance
        const p1Fixed = fixedPositions.has(i)
        const p2Fixed = fixedPositions.has(i + 1)

        if (p1Fixed && p2Fixed) continue
        if (p1Fixed) {
          p2.x = p1.x + ux * target
          p2.y = p1.y + uy * target
          continue
        }
        if (p2Fixed) {
          p1.x = p2.x - ux * target
          p1.y = p2.y - uy * target
          continue
        }

        const midX = (p1.x + p2.x) * 0.5
        const midY = (p1.y + p2.y) * 0.5
        const half = target * 0.5
        p1.x = midX - ux * half
        p1.y = midY - uy * half
        p2.x = midX + ux * half
        p2.y = midY + uy * half
      }
    }

    const solvedBoundary2D = projectedBoundary.map((point) => ({ ...point }))
    chainIndices.forEach((boundaryIndex, chainIndex) => {
      solvedBoundary2D[boundaryIndex] = { ...chainPoints[chainIndex]! }
    })
    solvedBoundary2D[startIndex] = { ...nextStart2D }
    solvedBoundary2D[endIndex] = { ...nextEnd2D }

    const tolerance = 1e-2
    const lengthsSatisfied = targetLengths.every((target, index) => {
      if (!Number.isFinite(target)) return true
      const current = solvedBoundary2D[index]!
      const next = solvedBoundary2D[(index + 1) % solvedBoundary2D.length]!
      return Math.abs(Math.hypot(next.x - current.x, next.y - current.y) - target) <= tolerance
    })
    if (!lengthsSatisfied) return

    const updates: Array<{ id: string; position: Vec3 }> = []
    face.memberPointIds.forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (!point || this.isPointCoordinateLocked(point)) return

      const boundaryIndex = face.boundaryPointIds.indexOf(pointId)
      if (boundaryIndex >= 0) {
        const projected = solvedBoundary2D[boundaryIndex]!
        updates.push({
          id: pointId,
          position: toWorldPoint(plane, projected.x, projected.y),
        })
        return
      }

      const projected = projectPoint2D(projectPointToPlane(point.position, plane), plane)
      updates.push({
        id: pointId,
        position: toWorldPoint(plane, projected.x, projected.y),
      })
    })

    this.setPointsPositions(updates)
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
