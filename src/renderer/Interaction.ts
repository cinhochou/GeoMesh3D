// src/renderer/Interaction.ts
import * as THREE from 'three'
import { Editor, EditorMode, type FacePreviewData } from '../core/editor/Editor'
import { Scene } from '../core/scene/Scene'
import type { Line3 } from '../core/geometry/Line3'
import type { Point3 } from '../core/geometry/Point3'
import type { Ray3 } from '../core/geometry/Ray3'
import type { StraightLine3 } from '../core/geometry/StraightLine3'
import { Vec3 } from '../core/geometry/Vec3'
import { ThreeRenderer } from './ThreeRenderer'

export class Interaction {
  private static readonly MOBILE_TAP_MOVE_THRESHOLD = 8
  private static readonly COLLAB_SETTLE_SYNC_MS = 250
  private static readonly TOUCH_MOUSE_GUARD_MS = 500
  private static readonly MOBILE_POINT_PICK_RADIUS_PX = 20
  private static readonly MOBILE_ENDPOINT_PROTECTION_RADIUS_PX = 2
  private static readonly MOBILE_LINE_PICK_THRESHOLD = 0.2

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()
  draggingPointId: string | null = null
  draggingLineId: string | null = null
  draggingStraightLineId: string | null = null
  draggingRayId: string | null = null
  draggingFaceId: string | null = null
  rubberBandData: { from: THREE.Vector3; to: THREE.Vector3 } | null = null //存储连线预览位置
  private dragPlane: THREE.Plane | null = null
  private dragLastPos: THREE.Vector3 | null = null
  private dragStartPointerPos: THREE.Vector3 | null = null
  private dragReferenceStartPos: THREE.Vector3 | null = null
  private dragReferenceStartMathPos: THREE.Vector3 | null = null
  private dragDepth: number | null = null
  private dragStartPositions = new Map<string, Vec3>()
  private mobileCreatePointerId: number | null = null
  private mobileCreatePreviewPos: Vec3 | null = null
  private mobileCreateHadPreviewAtPointerDown = false
  private mobileCreateMoved = false
  private mobileCreateStartClient = new THREE.Vector2()
  private mobileInteractionPointerId: number | null = null
  private mobileInteractionMoved = false
  private mobileInteractionStartedOnEmpty = false
  private mobileInteractionStartClient = new THREE.Vector2()
  private pendingToggleSelection:
    | { type: 'point' | 'line' | 'straightLine' | 'ray' | 'face'; geoId: string }
    | null = null
  private lastTouchEventAt = 0
  private liveSyncUntil = 0

  constructor(
    public editor: Editor,
    public renderer: ThreeRenderer,
  ) {
    // 设置射线检测线的灵敏度
    this.raycaster.params.Line = { threshold: 0.5 }
  }

  bind(dom: HTMLElement) {
    dom.addEventListener('mousedown', this.onMouseDown)
    dom.addEventListener('mousemove', this.onMouseMove)
    dom.addEventListener('mouseup', this.onMouseUp)
    dom.addEventListener('mouseleave', this.onMouseLeave)
    dom.addEventListener('pointerdown', this.onPointerDown, { capture: true })
    dom.addEventListener('pointermove', this.onPointerMove, { capture: true })
    dom.addEventListener('pointerup', this.onPointerUp, { capture: true })
    dom.addEventListener('pointercancel', this.onPointerCancel, { capture: true })
  }

  /** 网格吸附工具函数 */
  private snap(value: number, step: number = 0.5): number {
    return Math.round(value / step) * step
  }

  private getPointerClientRect() {
    let rect = this.renderer.renderer.domElement.getBoundingClientRect()
    if (this.renderer.isARActive()) {
      const video = this.renderer.getARVideoElement()
      if (video) {
        const videoRect = video.getBoundingClientRect()
        if (videoRect.width > 0 && videoRect.height > 0) rect = videoRect
      }
    }
    return rect
  }

  private updatePointerPosition(clientX: number, clientY: number) {
    const rect = this.getPointerClientRect()
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1
  }

  private getCreatePointPosition(shouldSnap: boolean): THREE.Vector3 {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const direction = this.raycaster.ray.direction
    const pos = this.renderer.getActiveCameraWorldPosition().add(direction.multiplyScalar(30))

    if (shouldSnap) {
      pos.set(this.snap(pos.x), this.snap(pos.y), this.snap(pos.z))
    }

    return pos
  }

  private showCreatePointPreview(pos: THREE.Vector3) {
    this.mobileCreatePreviewPos = new Vec3(pos.x, pos.y, pos.z)
    this.renderer.showAxisGuidesAt(pos)
  }

  private resetMobileCreatePointerState() {
    this.mobileCreatePointerId = null
    this.mobileCreateHadPreviewAtPointerDown = false
    this.mobileCreateMoved = false
  }

  private resetMobileInteractionState() {
    this.mobileInteractionPointerId = null
    this.mobileInteractionMoved = false
    this.mobileInteractionStartedOnEmpty = false
    this.pendingToggleSelection = null
  }

  private deselectGeometry(type: 'point' | 'line' | 'straightLine' | 'ray' | 'face', geoId: string) {
    if (type === 'point') this.editor.scene.selection.deselectPoint(geoId)
    else if (type === 'line') this.editor.scene.selection.deselectLine(geoId)
    else if (type === 'straightLine') this.editor.scene.selection.deselectStraightLine(geoId)
    else if (type === 'ray') this.editor.scene.selection.deselectRay(geoId)
    else if (type === 'face') this.editor.scene.selection.deselectFace(geoId)
  }

  private toggleCreateSelection(type: 'point' | 'line', geoId: string) {
    if (type === 'point') {
      if (this.editor.scene.selection.points.has(geoId)) {
        this.editor.scene.selection.deselectPoint(geoId)
        this.editor.selectedPoints = this.editor.selectedPoints.filter((point) => point.id !== geoId)
        return
      }
      this.editor.scene.selection.selectPoint(geoId, true)
      return
    }

    if (this.editor.scene.selection.lines.has(geoId)) {
      this.editor.scene.selection.deselectLine(geoId)
      return
    }
    this.editor.scene.selection.selectLine(geoId, true)
  }

  private isTouchPreferredDevice() {
    return (
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(hover: none)').matches
    )
  }

  syncControlLockState() {
    if (
      this.draggingPointId !== null ||
      this.draggingLineId !== null ||
      this.draggingStraightLineId !== null ||
      this.draggingRayId !== null ||
      this.draggingFaceId !== null ||
      this.mobileCreatePointerId !== null
    ) {
      this.renderer.controls.enabled = false
      return
    }

    const shouldLockPointSelection =
      !this.renderer.isARActive() &&
      this.isTouchPreferredDevice() &&
      this.editor.mode === EditorMode.Select &&
      this.editor.scene.selection.points.size > 0

    this.renderer.controls.enabled = !shouldLockPointSelection
  }

  private shouldIgnoreMouseEvent() {
    return performance.now() - this.lastTouchEventAt < Interaction.TOUCH_MOUSE_GUARD_MS
  }

  private updateMobileMoveThreshold(clientX: number, clientY: number) {
    if (
      !this.mobileInteractionMoved &&
      this.mobileInteractionStartClient.distanceTo(new THREE.Vector2(clientX, clientY)) >=
        Interaction.MOBILE_TAP_MOVE_THRESHOLD
    ) {
      this.mobileInteractionMoved = true
    }
  }

  private finishDragInteraction() {
    const hadDragPreview = this.dragStartPositions.size > 0
    this.commitDragHistory()
    this.draggingPointId = null
    this.draggingLineId = null
    this.draggingStraightLineId = null
    this.draggingRayId = null
    this.draggingFaceId = null
    this.pendingToggleSelection = null
    this.endDrag()
    if (hadDragPreview) {
      this.liveSyncUntil = performance.now() + Interaction.COLLAB_SETTLE_SYNC_MS
    }
    this.syncControlLockState()
    this.renderer.renderer.domElement.style.cursor = 'default'

    if (this.editor.mode !== EditorMode.CreatePoint) {
      this.renderer.hideAxisGuides()
    }
  }

  private projectMathPositionToClient(pos: Vec3, rect: DOMRect) {
    const worldPos = this.renderer.toMathWorldPosition(new THREE.Vector3(pos.x, pos.y, pos.z))
    const projected = worldPos.clone().project(this.renderer.getActiveCamera())
    if (projected.z < -1 || projected.z > 1) return null

    return new THREE.Vector2(
      rect.left + (projected.x + 1) * 0.5 * rect.width,
      rect.top + (1 - projected.y) * 0.5 * rect.height,
    )
  }

  private getTouchPointHit(clientX: number, clientY: number, radiusPx: number) {
    const rect = this.getPointerClientRect()
    let bestId: string | null = null
    let bestDistance = radiusPx

    this.editor.scene.points.forEach((point, id) => {
      const screenPos = this.projectMathPositionToClient(point.position, rect)
      if (!screenPos) return
      const distance = screenPos.distanceTo(new THREE.Vector2(clientX, clientY))
      if (distance <= bestDistance) {
        bestDistance = distance
        bestId = id
      }
    })

    return bestId ? (this.renderer.meshMap.get(bestId) ?? null) : null
  }

  private pickLinearWithThreshold(lineThreshold: number) {
    const previousThreshold = this.raycaster.params.Line?.threshold ?? 0.5
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    this.raycaster.params.Line = { threshold: lineThreshold }
    const lineHits = this.raycaster.intersectObjects(
      [...this.renderer.meshMap.values()].filter(
        (obj) =>
          obj.userData?.type === 'line' ||
          obj.userData?.type === 'straightLine' ||
          obj.userData?.type === 'ray',
      ),
    )
    this.raycaster.params.Line = { threshold: previousThreshold }
    return lineHits[0]?.object ?? null
  }

  private getProtectedEndpointHit(
    linearId: string,
    type: 'line' | 'straightLine' | 'ray',
    clientX: number,
    clientY: number,
    radiusPx: number,
  ) {
    const linear =
      type === 'line'
        ? this.editor.scene.lines.get(linearId)
        : type === 'straightLine'
          ? this.editor.scene.straightLines.get(linearId)
        : this.editor.scene.rays.get(linearId)
    if (!linear) return null

    const rect = this.getPointerClientRect()
    const p1Screen = this.projectMathPositionToClient(linear.p1.position, rect)
    const p2Screen = this.projectMathPositionToClient(linear.p2.position, rect)
    if (!p1Screen && !p2Screen) return null

    const pointer = new THREE.Vector2(clientX, clientY)
    const candidates = [
      p1Screen
        ? {
            id: linear.p1.id,
            distance: p1Screen.distanceTo(pointer),
          }
        : null,
      p2Screen
        ? {
            id: linear.p2.id,
            distance: p2Screen.distanceTo(pointer),
          }
        : null,
    ].filter((candidate): candidate is { id: string; distance: number } => candidate !== null)

    const nearest = candidates.sort((a, b) => a.distance - b.distance)[0]
    if (!nearest || nearest.distance > radiusPx) return null
    return this.renderer.meshMap.get(nearest.id) ?? null
  }

  private pickTouchTarget(clientX: number, clientY: number) {
    const pointHit = this.getTouchPointHit(
      clientX,
      clientY,
      Interaction.MOBILE_POINT_PICK_RADIUS_PX,
    )
    if (pointHit) return pointHit

    const lineHit = this.pickLinearWithThreshold(Interaction.MOBILE_LINE_PICK_THRESHOLD)
    if (!lineHit) return this.pick()

    const protectedEndpoint = this.getProtectedEndpointHit(
      lineHit.userData.geoId,
      lineHit.userData.type,
      clientX,
      clientY,
      Interaction.MOBILE_ENDPOINT_PROTECTION_RADIUS_PX,
    )
    return protectedEndpoint ?? lineHit
  }

  private getLinePivotDragPoint(line: Line3): Point3 | null {
    if (line.userLocked) return null

    const p1Locked = this.editor.isPointCoordinateLocked(line.p1)
    const p2Locked = this.editor.isPointCoordinateLocked(line.p2)
    if (p1Locked === p2Locked) return null

    return p1Locked ? line.p2 : line.p1
  }

  private getLineDragReferencePoint(line: Line3) {
    const pivotPoint = this.getLinePivotDragPoint(line)
    if (pivotPoint) return pivotPoint.position

    return new Vec3(
      (line.p1.position.x + line.p2.position.x) / 2,
      (line.p1.position.y + line.p2.position.y) / 2,
      (line.p1.position.z + line.p2.position.z) / 2,
    )
  }

  private canDragRayAroundOrigin(ray: Ray3) {
    return (
      ray.p1.id === Scene.ORIGIN_ID &&
      ray.p1.locked &&
      !ray.userLocked &&
      !this.editor.isPointCoordinateLocked(ray.p2)
    )
  }

  private canDragStraightLineAroundOrigin(line: StraightLine3) {
    return (
      line.p1.id === Scene.ORIGIN_ID &&
      line.p1.locked &&
      !line.userLocked &&
      !this.editor.isPointCoordinateLocked(line.p2)
    )
  }

  private getRayDragReferencePoint(ray: Ray3) {
    const end = ray.getDisplayEndPoint()
    return new Vec3(
      (ray.p1.position.x + end.x) / 2,
      (ray.p1.position.y + end.y) / 2,
      (ray.p1.position.z + end.z) / 2,
    )
  }

  private getStraightLineDragReferencePoint(line: StraightLine3) {
    return line.getMidPoint()
  }

  private getFaceDragReferencePoint(faceId: string) {
    const face = this.editor.scene.faces.get(faceId)
    if (!face) return null
    return face.getCentroid(this.editor.scene.points)
  }

  private addSelectedFacePoints(toMove: Set<string>) {
    this.editor.scene.selection.faces.forEach((faceId) => {
      const face = this.editor.scene.faces.get(faceId)
      if (!face || this.editor.isFaceGeometryLocked(face)) return
      face.memberPointIds.forEach((pointId) => toMove.add(pointId))
    })
  }

  private handleSelectionDragMove(isAltPressed: boolean) {
    const selection = this.editor.scene.selection

    if (this.draggingPointId) {
      const point = this.editor.scene.points.get(this.draggingPointId)
      if (!point) return

      this.handleDrag(
        point.position,
        (delta) => {
          const toMove = new Set<string>()
          selection.points.forEach((id) => toMove.add(id))
          selection.lines.forEach((lid) => {
            const l = this.editor.scene.lines.get(lid)
            if (l && !this.editor.isLineGeometryLocked(l)) {
              toMove.add(l.p1.id)
              toMove.add(l.p2.id)
            }
          })
          selection.rays.forEach((rid) => {
            const ray = this.editor.scene.rays.get(rid)
            if (ray && !this.editor.isRayGeometryLocked(ray)) {
              toMove.add(ray.p1.id)
              toMove.add(ray.p2.id)
            }
          })
          selection.straightLines.forEach((sid) => {
            const line = this.editor.scene.straightLines.get(sid)
            if (line && !this.editor.isStraightLineGeometryLocked(line)) {
              toMove.add(line.p1.id)
              toMove.add(line.p2.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          toMove.add(this.draggingPointId!)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingLineId) {
      const line = this.editor.scene.lines.get(this.draggingLineId)
      if (!line) return

      const pivotPoint = this.getLinePivotDragPoint(line)
      if (pivotPoint) {
        this.handleDrag(
          pivotPoint.position,
          (delta) => {
            this.previewMovePoints([pivotPoint.id], delta)
          },
          isAltPressed,
        )
        return
      }

      if (this.editor.isLineGeometryLocked(line)) return

      const mid = this.getLineDragReferencePoint(line)
      this.handleDrag(
        mid,
        (delta) => {
          const toMove = new Set<string>()
          selection.lines.forEach((lid) => {
            const l = this.editor.scene.lines.get(lid)
            if (l && !this.editor.isLineGeometryLocked(l)) {
              toMove.add(l.p1.id)
              toMove.add(l.p2.id)
            }
          })
          selection.rays.forEach((rid) => {
            const ray = this.editor.scene.rays.get(rid)
            if (ray && !this.editor.isRayGeometryLocked(ray)) {
              toMove.add(ray.p1.id)
              toMove.add(ray.p2.id)
            }
          })
          selection.straightLines.forEach((sid) => {
            const straightLine = this.editor.scene.straightLines.get(sid)
            if (straightLine && !this.editor.isStraightLineGeometryLocked(straightLine)) {
              toMove.add(straightLine.p1.id)
              toMove.add(straightLine.p2.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(line.p1.id)
          toMove.add(line.p2.id)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingStraightLineId) {
      const line = this.editor.scene.straightLines.get(this.draggingStraightLineId)
      if (!line) return
      const canRotateAroundOrigin = this.canDragStraightLineAroundOrigin(line)
      if (!canRotateAroundOrigin && this.editor.isStraightLineGeometryLocked(line)) return

      this.handleDrag(
        this.getStraightLineDragReferencePoint(line),
        (delta) => {
          const toMove = new Set<string>()
          selection.lines.forEach((lid) => {
            const l = this.editor.scene.lines.get(lid)
            if (l && !this.editor.isLineGeometryLocked(l)) {
              toMove.add(l.p1.id)
              toMove.add(l.p2.id)
            }
          })
          selection.straightLines.forEach((sid) => {
            const straightLine = this.editor.scene.straightLines.get(sid)
            if (!straightLine) return
            if (this.canDragStraightLineAroundOrigin(straightLine)) {
              toMove.add(straightLine.p2.id)
              return
            }
            if (!this.editor.isStraightLineGeometryLocked(straightLine)) {
              toMove.add(straightLine.p1.id)
              toMove.add(straightLine.p2.id)
            }
          })
          selection.rays.forEach((rid) => {
            const ray = this.editor.scene.rays.get(rid)
            if (ray && !this.editor.isRayGeometryLocked(ray)) {
              toMove.add(ray.p1.id)
              toMove.add(ray.p2.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          if (canRotateAroundOrigin) {
            toMove.add(line.p2.id)
          } else {
            toMove.add(line.p1.id)
            toMove.add(line.p2.id)
          }
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingRayId) {
      const ray = this.editor.scene.rays.get(this.draggingRayId)
      if (!ray) return

      const canRotateAroundOrigin = this.canDragRayAroundOrigin(ray)
      if (!canRotateAroundOrigin && this.editor.isRayGeometryLocked(ray)) return

      this.handleDrag(
        this.getRayDragReferencePoint(ray),
        (delta) => {
          const toMove = new Set<string>()
          selection.lines.forEach((lid) => {
            const l = this.editor.scene.lines.get(lid)
            if (l && !this.editor.isLineGeometryLocked(l)) {
              toMove.add(l.p1.id)
              toMove.add(l.p2.id)
            }
          })
          selection.rays.forEach((rid) => {
            const selectedRay = this.editor.scene.rays.get(rid)
            if (!selectedRay) return

            if (this.canDragRayAroundOrigin(selectedRay)) {
              toMove.add(selectedRay.p2.id)
              return
            }

            if (!this.editor.isRayGeometryLocked(selectedRay)) {
              toMove.add(selectedRay.p1.id)
              toMove.add(selectedRay.p2.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          if (canRotateAroundOrigin) {
            toMove.add(ray.p2.id)
          } else {
            toMove.add(ray.p1.id)
            toMove.add(ray.p2.id)
          }
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingFaceId) {
      const face = this.editor.scene.faces.get(this.draggingFaceId)
      if (!face) return
      if (this.editor.isFaceGeometryLocked(face)) return

      const referencePoint = this.getFaceDragReferencePoint(this.draggingFaceId)
      if (!referencePoint) return

      this.handleDrag(
        referencePoint,
        (delta) => {
          const toMove = new Set<string>()
          selection.points.forEach((id) => toMove.add(id))
          selection.lines.forEach((lid) => {
            const line = this.editor.scene.lines.get(lid)
            if (line && !this.editor.isLineGeometryLocked(line)) {
              toMove.add(line.p1.id)
              toMove.add(line.p2.id)
            }
          })
          selection.straightLines.forEach((sid) => {
            const line = this.editor.scene.straightLines.get(sid)
            if (line && !this.editor.isStraightLineGeometryLocked(line)) {
              toMove.add(line.p1.id)
              toMove.add(line.p2.id)
            }
          })
          selection.rays.forEach((rid) => {
            const ray = this.editor.scene.rays.get(rid)
            if (ray && !this.editor.isRayGeometryLocked(ray)) {
              toMove.add(ray.p1.id)
              toMove.add(ray.p2.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          face.memberPointIds.forEach((pointId) => toMove.add(pointId))
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
    }
  }

  onMouseDown = (e: MouseEvent) => {
    if (this.shouldIgnoreMouseEvent()) return
    this.updateMouse(e)
    const hit = this.pick()

    if (this.renderer.isARActive() && this.editor.mode === EditorMode.CreatePoint) {
      return
    }

    if (
      this.renderer.isARActive() &&
      (
        this.editor.mode === EditorMode.CreateLine ||
        this.editor.mode === EditorMode.CreateStraightLine ||
        this.editor.mode === EditorMode.CreateRay ||
        this.editor.mode === EditorMode.CreatePlane
      )
    ) {
      return
    }

    if (this.editor.mode === EditorMode.CreatePoint) {
      this.renderer.controls.enabled = false
      const pos = this.getCreatePointPosition(this.editor.isSnappingEnabled && !e.altKey)
      this.editor.createPoint(new Vec3(pos.x, pos.y, pos.z))
      return
    }

    if (hit) {
      this.renderer.controls.enabled = false
      const { geoId, type } = hit.userData
      if (this.editor.mode === EditorMode.Delete) {
        if (type === 'point') {
          this.editor.deletePoint(geoId)
        } else if (type === 'line') {
          this.editor.deleteLine(geoId)
        } else if (type === 'straightLine') {
          this.editor.deleteStraightLine(geoId)
        } else if (type === 'ray') {
          this.editor.deleteRay(geoId)
        } else if (type === 'face') {
          this.editor.deleteFace(geoId)
        }
        return
      }
      if (this.editor.mode === EditorMode.Select) {
        this.renderer.renderer.domElement.style.cursor = 'grabbing'
        if (type === 'point') {
          const alreadySelected = this.editor.scene.selection.points.has(geoId)
          this.draggingPointId = geoId
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectPoint(geoId, true)
          const p = this.editor.scene.points.get(geoId)
          if (p) {
            if (this.editor.isPointCoordinateLocked(p)) {
              this.draggingPointId = null
            } else {
              this.startDrag(p.position)
            }
          }
        } else if (type === 'line') {
          const alreadySelected = this.editor.scene.selection.lines.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectLine(geoId, true)
          const l = this.editor.scene.lines.get(geoId)
          if (l) {
            const referencePoint = this.getLineDragReferencePoint(l)
            if (this.editor.isLineGeometryLocked(l) && !this.getLinePivotDragPoint(l)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingLineId = geoId
              this.startDrag(referencePoint)
            }
          }
        } else if (type === 'straightLine') {
          const alreadySelected = this.editor.scene.selection.straightLines.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectStraightLine(geoId, true)
          const line = this.editor.scene.straightLines.get(geoId)
          if (line) {
            if (
              this.editor.isStraightLineGeometryLocked(line) &&
              !this.canDragStraightLineAroundOrigin(line)
            ) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingStraightLineId = geoId
              this.startDrag(this.getStraightLineDragReferencePoint(line))
            }
          }
        } else if (type === 'ray') {
          const alreadySelected = this.editor.scene.selection.rays.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectRay(geoId, true)
          const ray = this.editor.scene.rays.get(geoId)
          if (ray) {
            if (this.editor.isRayGeometryLocked(ray) && !this.canDragRayAroundOrigin(ray)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingRayId = geoId
              this.startDrag(this.getRayDragReferencePoint(ray))
            }
          }
        } else if (type === 'face') {
          const alreadySelected = this.editor.scene.selection.faces.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectFace(geoId, true)
          const face = this.editor.scene.faces.get(geoId)
          const referencePoint = this.getFaceDragReferencePoint(geoId)
          if (!face || !referencePoint || this.editor.isFaceGeometryLocked(face)) {
            this.renderer.renderer.domElement.style.cursor = 'default'
          } else {
            this.draggingFaceId = geoId
            this.startDrag(referencePoint)
          }
        }
      } else if (this.editor.mode === EditorMode.CreateLine && type === 'point') {
        if (this.editor.scene.selection.points.has(geoId)) {
          this.toggleCreateSelection('point', geoId)
        } else {
          this.editor.tryCreateLineWith(this.editor.scene.points.get(geoId)!)
        }
      } else if (this.editor.mode === EditorMode.CreateStraightLine && type === 'point') {
        if (this.editor.scene.selection.points.has(geoId)) {
          this.toggleCreateSelection('point', geoId)
        } else {
          this.editor.tryCreateStraightLineWith(this.editor.scene.points.get(geoId)!)
        }
      } else if (this.editor.mode === EditorMode.CreateRay && type === 'point') {
        if (this.editor.scene.selection.points.has(geoId)) {
          this.toggleCreateSelection('point', geoId)
        } else {
          this.editor.tryCreateRayWith(this.editor.scene.points.get(geoId)!)
        }
      } else if (this.editor.mode === EditorMode.CreatePlane && type === 'point') {
        this.toggleCreateSelection('point', geoId)
      } else if (this.editor.mode === EditorMode.CreatePlane && type === 'line') {
        this.toggleCreateSelection('line', geoId)
      } else if (this.editor.mode === EditorMode.MergePoint && type === 'point') {
        this.toggleCreateSelection('point', geoId)
      }
    } else {
      if (this.editor.mode === EditorMode.Select) this.editor.scene.selection.clear()
      else if (this.editor.mode === EditorMode.CreatePlane) this.editor.tryCreateFaceFromSelection()
    }
  }

  onMouseMove = (e: MouseEvent) => {
    if (this.shouldIgnoreMouseEvent()) return
    this.updateMouse(e)

    if (this.renderer.isARActive() && this.editor.mode === EditorMode.CreatePoint) {
      this.renderer.hideAxisGuides()
      return
    }

    if (
      this.renderer.isARActive() &&
      (
        this.editor.mode === EditorMode.CreateLine ||
        this.editor.mode === EditorMode.CreateStraightLine ||
        this.editor.mode === EditorMode.CreateRay ||
        this.editor.mode === EditorMode.CreatePlane
      )
    ) {
      this.rubberBandData = null
      return
    }

    // --- 处理创建点模式下的辅助线预览 ---
    if (this.editor.mode === EditorMode.CreatePoint) {
      this.showCreatePointPreview(
        this.getCreatePointPosition(this.editor.isSnappingEnabled && !e.altKey),
      )
      return // 预览模式下不执行后续拖拽逻辑
    }

    // 橡皮筋逻辑
    if (
      (
        this.editor.mode === EditorMode.CreateLine ||
        this.editor.mode === EditorMode.CreateStraightLine ||
        this.editor.mode === EditorMode.CreateRay
      ) &&
      this.editor.selectedPoints.length === 1
    ) {
      const startPoint = this.editor.selectedPoints[0]
      const from = new THREE.Vector3(
        startPoint!.position.x,
        startPoint!.position.y,
        startPoint!.position.z,
      )

      // 计算鼠标在 3D 空间的投影点
      this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
      // 这里我们假设在以起点为准的水平面上预览，或者简单的距离相机 30 个单位
      const to = this.raycaster.ray.at(30, new THREE.Vector3())

      // 如果有吸附开关，也应用到预览线上
      if (this.editor.isSnappingEnabled && !e.altKey) {
        to.set(this.snap(to.x), this.snap(to.y), this.snap(to.z))
      }

      this.rubberBandData = { from, to }
    } else {
      this.rubberBandData = null
    }

    this.handleSelectionDragMove(e.altKey)
  }

  onMouseUp = () => {
    if (this.shouldIgnoreMouseEvent()) return
    if (this.pendingToggleSelection && this.dragStartPositions.size === 0) {
      this.deselectGeometry(this.pendingToggleSelection.type, this.pendingToggleSelection.geoId)
      this.draggingPointId = null
      this.draggingLineId = null
      this.draggingStraightLineId = null
      this.draggingRayId = null
      this.draggingFaceId = null
      this.pendingToggleSelection = null
      this.endDrag()
      this.syncControlLockState()
      this.renderer.renderer.domElement.style.cursor = 'default'
      if (this.editor.mode !== EditorMode.CreatePoint) {
        this.renderer.hideAxisGuides()
      }
      return
    }
    this.finishDragInteraction()
  }

  onMouseLeave = () => {
    this.clearPreview()
  }

  onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()

    if (this.editor.mode === EditorMode.CreatePoint) {
      if (this.renderer.isARActive()) return

      if (this.mobileCreatePointerId !== null && this.mobileCreatePointerId !== e.pointerId) {
        this.resetMobileCreatePointerState()
        this.syncControlLockState()
        return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      this.renderer.controls.enabled = false
      this.updatePointerPosition(e.clientX, e.clientY)

      this.mobileCreatePointerId = e.pointerId
      this.mobileCreateHadPreviewAtPointerDown = this.mobileCreatePreviewPos !== null
      this.mobileCreateMoved = false
      this.mobileCreateStartClient.set(e.clientX, e.clientY)

      if (!this.mobileCreateHadPreviewAtPointerDown) {
        this.showCreatePointPreview(this.getCreatePointPosition(this.editor.isSnappingEnabled))
      }
      return
    }

    if (
      this.mobileInteractionPointerId !== null &&
      this.mobileInteractionPointerId !== e.pointerId
    ) {
      this.finishDragInteraction()
      this.resetMobileInteractionState()
      return
    }

    this.mobileInteractionPointerId = e.pointerId
    this.mobileInteractionMoved = false
    this.mobileInteractionStartedOnEmpty = false
    this.mobileInteractionStartClient.set(e.clientX, e.clientY)
    this.updatePointerPosition(e.clientX, e.clientY)

    const hit = this.pickTouchTarget(e.clientX, e.clientY)

    if (!hit) {
      if (this.editor.mode === EditorMode.CreatePlane) {
        e.preventDefault()
        e.stopPropagation()
        this.editor.tryCreateFaceFromSelection()
        this.resetMobileInteractionState()
        return
      }
      this.mobileInteractionStartedOnEmpty = this.editor.mode === EditorMode.Select
      return
    }

    const { geoId, type } = hit.userData

    if (this.editor.mode === EditorMode.Delete) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') this.editor.deletePoint(geoId)
      else if (type === 'line') this.editor.deleteLine(geoId)
      else if (type === 'straightLine') this.editor.deleteStraightLine(geoId)
      else if (type === 'ray') this.editor.deleteRay(geoId)
      else if (type === 'face') this.editor.deleteFace(geoId)
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateLine && type === 'point') {
      e.preventDefault()
      e.stopPropagation()
      if (this.editor.scene.selection.points.has(geoId)) {
        this.toggleCreateSelection('point', geoId)
      } else {
        this.editor.tryCreateLineWith(this.editor.scene.points.get(geoId)!)
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateStraightLine && type === 'point') {
      e.preventDefault()
      e.stopPropagation()
      if (this.editor.scene.selection.points.has(geoId)) {
        this.toggleCreateSelection('point', geoId)
      } else {
        this.editor.tryCreateStraightLineWith(this.editor.scene.points.get(geoId)!)
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateRay && type === 'point') {
      e.preventDefault()
      e.stopPropagation()
      if (this.editor.scene.selection.points.has(geoId)) {
        this.toggleCreateSelection('point', geoId)
      } else {
        this.editor.tryCreateRayWith(this.editor.scene.points.get(geoId)!)
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreatePlane) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') this.toggleCreateSelection('point', geoId)
      else if (type === 'line') this.toggleCreateSelection('line', geoId)
      else this.editor.tryCreateFaceFromSelection()
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.MergePoint && type === 'point') {
      e.preventDefault()
      e.stopPropagation()
      this.toggleCreateSelection('point', geoId)
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode !== EditorMode.Select) {
      this.resetMobileInteractionState()
      return
    }

    if (type === 'point') {
      const alreadySelected = this.editor.scene.selection.points.has(geoId)
      this.editor.scene.selection.selectPoint(geoId, true)
      this.pendingToggleSelection = alreadySelected ? { type, geoId } : null

      if (!alreadySelected) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      this.renderer.controls.enabled = false
      this.renderer.renderer.domElement.style.cursor = 'grabbing'
      this.draggingPointId = geoId
      const point = this.editor.scene.points.get(geoId)
      if (!point || this.editor.isPointCoordinateLocked(point)) {
        this.draggingPointId = null
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
      } else {
        this.startDrag(point.position)
      }
      return
    }

    if (type === 'line') {
      const alreadySelected = this.editor.scene.selection.lines.has(geoId)
      this.editor.scene.selection.selectLine(geoId, true)
      this.pendingToggleSelection = alreadySelected ? { type, geoId } : null

      if (!alreadySelected) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      this.renderer.controls.enabled = false
      this.renderer.renderer.domElement.style.cursor = 'grabbing'
      const line = this.editor.scene.lines.get(geoId)
      if (!line || (this.editor.isLineGeometryLocked(line) && !this.getLinePivotDragPoint(line))) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingLineId = geoId
      this.startDrag(this.getLineDragReferencePoint(line))
      return
    }

    if (type === 'straightLine') {
      const alreadySelected = this.editor.scene.selection.straightLines.has(geoId)
      this.editor.scene.selection.selectStraightLine(geoId, true)
      this.pendingToggleSelection = alreadySelected ? { type, geoId } : null

      if (!alreadySelected) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      this.renderer.controls.enabled = false
      this.renderer.renderer.domElement.style.cursor = 'grabbing'
      const line = this.editor.scene.straightLines.get(geoId)
      if (
        !line ||
        (this.editor.isStraightLineGeometryLocked(line) &&
          !this.canDragStraightLineAroundOrigin(line))
      ) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingStraightLineId = geoId
      this.startDrag(this.getStraightLineDragReferencePoint(line))
      return
    }

    if (type === 'ray') {
      const alreadySelected = this.editor.scene.selection.rays.has(geoId)
      this.editor.scene.selection.selectRay(geoId, true)
      this.pendingToggleSelection = alreadySelected ? { type, geoId } : null

      if (!alreadySelected) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      this.renderer.controls.enabled = false
      this.renderer.renderer.domElement.style.cursor = 'grabbing'
      const ray = this.editor.scene.rays.get(geoId)
      if (!ray || (this.editor.isRayGeometryLocked(ray) && !this.canDragRayAroundOrigin(ray))) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingRayId = geoId
      this.startDrag(this.getRayDragReferencePoint(ray))
      return
    }

    if (type === 'face') {
      const alreadySelected = this.editor.scene.selection.faces.has(geoId)
      this.editor.scene.selection.selectFace(geoId, true)
      this.pendingToggleSelection = alreadySelected ? { type, geoId } : null

      if (!alreadySelected) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      const face = this.editor.scene.faces.get(geoId)
      const referencePoint = this.getFaceDragReferencePoint(geoId)
      if (!face || !referencePoint || this.editor.isFaceGeometryLocked(face)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.renderer.controls.enabled = false
      this.renderer.renderer.domElement.style.cursor = 'grabbing'
      this.draggingFaceId = geoId
      this.startDrag(referencePoint)
    }
  }

  onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()

    if (this.editor.mode === EditorMode.CreatePoint) {
      if (
        this.editor.mode !== EditorMode.CreatePoint ||
        this.mobileCreatePointerId !== e.pointerId
      ) {
        return
      }
      if (this.renderer.isARActive()) return

      e.preventDefault()
      e.stopPropagation()

      this.updatePointerPosition(e.clientX, e.clientY)

      if (
        !this.mobileCreateMoved &&
        this.mobileCreateStartClient.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) >=
          Interaction.MOBILE_TAP_MOVE_THRESHOLD
      ) {
        this.mobileCreateMoved = true
      }

      this.showCreatePointPreview(this.getCreatePointPosition(this.editor.isSnappingEnabled))
      return
    }

    if (this.mobileInteractionPointerId !== e.pointerId) return

    this.updateMobileMoveThreshold(e.clientX, e.clientY)

    if (
      !this.draggingPointId &&
      !this.draggingLineId &&
      !this.draggingStraightLineId &&
      !this.draggingRayId &&
      !this.draggingFaceId
    )
      return

    e.preventDefault()
    e.stopPropagation()
    this.updatePointerPosition(e.clientX, e.clientY)
    this.handleSelectionDragMove(false)
  }

  onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()

    if (this.editor.mode === EditorMode.CreatePoint) {
      if (
        this.editor.mode !== EditorMode.CreatePoint ||
        this.mobileCreatePointerId !== e.pointerId
      ) {
        return
      }
      if (this.renderer.isARActive()) return

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)

      const shouldConfirm =
        !this.mobileCreateMoved &&
        this.mobileCreateHadPreviewAtPointerDown &&
        this.mobileCreatePreviewPos !== null

      this.resetMobileCreatePointerState()
      this.syncControlLockState()

      if (shouldConfirm) {
        const pos = this.mobileCreatePreviewPos!
        this.editor.createPoint(new Vec3(pos.x, pos.y, pos.z))
      }
      return
    }

    if (this.mobileInteractionPointerId !== e.pointerId) return

    const hadDrag =
      this.draggingPointId !== null ||
      this.draggingLineId !== null ||
      this.draggingStraightLineId !== null ||
      this.draggingRayId !== null ||
      this.draggingFaceId !== null

    if (hadDrag) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      if (this.pendingToggleSelection && !this.mobileInteractionMoved && this.dragStartPositions.size === 0) {
        this.deselectGeometry(this.pendingToggleSelection.type, this.pendingToggleSelection.geoId)
        this.draggingPointId = null
        this.draggingLineId = null
        this.draggingStraightLineId = null
        this.draggingRayId = null
        this.draggingFaceId = null
        this.pendingToggleSelection = null
        this.endDrag()
        this.syncControlLockState()
      } else {
        this.finishDragInteraction()
      }
    } else if (
      this.editor.mode === EditorMode.Select &&
      this.mobileInteractionStartedOnEmpty &&
      !this.mobileInteractionMoved
    ) {
      this.editor.scene.selection.clear()
    }

    this.resetMobileInteractionState()
    this.syncControlLockState()
  }

  onPointerCancel = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()

    if (this.mobileCreatePointerId === e.pointerId) {
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      this.resetMobileCreatePointerState()
      this.syncControlLockState()
      return
    }

    if (this.mobileInteractionPointerId !== e.pointerId) return
    ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
    this.finishDragInteraction()
    this.resetMobileInteractionState()
    this.syncControlLockState()
  }

  /** 统一的拾取函数，支持点和线 */
  pick(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const hits = this.raycaster.intersectObjects([...this.renderer.meshMap.values()])

    if (hits.length > 0) {
      // 优先寻找碰撞列表中的“点”
      const pointHit = hits.find((h) => h.object.userData.type === 'point')
      if (pointHit) return pointHit.object

      // 如果没点中点，再看有没有点中“线”
      const lineHit = hits.find(
        (h) =>
          h.object.userData.type === 'line' ||
          h.object.userData.type === 'straightLine' ||
          h.object.userData.type === 'ray',
      )
      if (lineHit) return lineHit.object

      const faceHit = hits.find((h) => h.object.userData.type === 'face')
      if (faceHit) return faceHit.object

      return hits[0]!.object
    }
    return null
  }

  updateMouse(e: MouseEvent) {
    this.updatePointerPosition(e.clientX, e.clientY)
  }

  /**
   * 抽离通用的拖拽计算逻辑
   * @param referencePos 参考点坐标（Vec3）
   * @param applyDelta 回调函数，接收计算出的位移
   */
  private handleDrag(referencePos: Vec3, applyDelta: (d: Vec3) => void, isAltPressed: boolean) {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const targetPos = new THREE.Vector3()

    // 拖拽平面在拖拽开始时固定，避免 AR 相机抖动导致跳动
    if (
      !this.dragPlane ||
      !this.dragLastPos ||
      !this.dragStartPointerPos ||
      !this.dragReferenceStartPos ||
      !this.dragReferenceStartMathPos
    ) {
      this.startDrag(referencePos)
    }
    if (
      !this.dragPlane ||
      !this.dragLastPos ||
      !this.dragStartPointerPos ||
      !this.dragReferenceStartPos ||
      !this.dragReferenceStartMathPos
    ) {
      return
    }

    let hit = false

    // AR 模式使用“固定深度球面”方案，避免平面与射线接近平行造成卡顿
    if (this.renderer.isARActive() && this.dragDepth !== null) {
      const sphere = new THREE.Sphere(this.raycaster.ray.origin.clone(), this.dragDepth)
      hit = this.raycaster.ray.intersectSphere(sphere, targetPos) !== null
    }

    // 非 AR 或球面未命中时，回退到固定拖拽平面
    if (!hit) {
      hit = this.raycaster.ray.intersectPlane(this.dragPlane, targetPos) !== null
    }

    // 仍未命中时，用上一次深度兜底
    if (!hit) {
      const fallbackDepth = this.raycaster.ray.origin.distanceTo(this.dragLastPos)
      targetPos.copy(this.raycaster.ray.at(fallbackDepth, new THREE.Vector3()))
    }

    const desiredReferencePos = this.dragReferenceStartPos
      .clone()
      .add(targetPos.clone().sub(this.dragStartPointerPos))

    const desiredMathPos = this.renderer.toMathLocalPosition(desiredReferencePos)

    // 吸附到数学坐标系里的目标位置本身，而不是沿原始偏移做 0.5 增量
    if (this.editor.isSnappingEnabled && !isAltPressed) {
      desiredMathPos.set(
        this.snap(desiredMathPos.x),
        this.snap(desiredMathPos.y),
        this.snap(desiredMathPos.z),
      )
    }

    const delta = new Vec3(
      desiredMathPos.x - this.dragReferenceStartMathPos.x,
      desiredMathPos.y - this.dragReferenceStartMathPos.y,
      desiredMathPos.z - this.dragReferenceStartMathPos.z,
    )

    if (delta.x !== 0 || delta.y !== 0 || delta.z !== 0) {
      applyDelta(delta)
    }
    this.dragLastPos.copy(targetPos)
  }

  private startDrag(referencePos: Vec3) {
    const cameraDir = this.renderer.getActiveCameraWorldDirection()
    const refMath = new THREE.Vector3(referencePos.x, referencePos.y, referencePos.z)
    const ref = this.renderer.toMathWorldPosition(refMath)

    // 固定拖拽平面：法线取拖拽开始时的相机朝向
    this.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, ref)

    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const hit = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(this.dragPlane, hit)) {
      this.dragLastPos = hit.clone()
      this.dragStartPointerPos = hit.clone()
    } else {
      this.dragLastPos = ref.clone()
      this.dragStartPointerPos = ref.clone()
    }
    this.dragReferenceStartPos = ref.clone()
    this.dragReferenceStartMathPos = refMath.clone()

    // 记录拖拽起始的相机距离，用于 AR 模式的固定深度拖拽
    this.dragDepth = this.raycaster.ray.origin.distanceTo(ref)
  }

  private previewMovePoints(pointIds: string[], delta: Vec3) {
    const expandedPointIds = this.expandLockedLinePreviewPointIds(pointIds)
    expandedPointIds.forEach((id) => {
      const point = this.editor.scene.points.get(id)
      if (!point || this.editor.isPointCoordinateLocked(point)) return
      if (!this.dragStartPositions.has(id)) this.dragStartPositions.set(id, point.position.clone())
    })

    const previewPositions = this.editor.resolveConstrainedPointPositions(
      expandedPointIds
        .map((id) => {
          const point = this.editor.scene.points.get(id)
          const before = this.dragStartPositions.get(id)
          if (!point || !before || this.editor.isPointCoordinateLocked(point)) return null
          return {
            id,
            position: before.add(delta),
          }
        })
        .filter((item): item is { id: string; position: Vec3 } => item !== null),
    )

    previewPositions.forEach((position, id) => {
      const point = this.editor.scene.points.get(id)
      if (!point || this.editor.isPointCoordinateLocked(point)) return
      if (!this.dragStartPositions.has(id)) {
        this.dragStartPositions.set(id, point.position.clone())
      }
      point.setPosition(position)
    })
  }

  private expandLockedLinePreviewPointIds(pointIds: string[]) {
    const expanded = new Set(pointIds)
    const queue = [...pointIds]

    while (queue.length > 0) {
      const currentId = queue.shift()!
      this.editor.scene.lines.forEach((line) => {
        if (!line.lengthLocked) return
        if (line.p1.id !== currentId && line.p2.id !== currentId) return

        const otherId = line.p1.id === currentId ? line.p2.id : line.p1.id
        if (!expanded.has(otherId)) {
          expanded.add(otherId)
          queue.push(otherId)
        }
      })
    }

    return [...expanded]
  }

  private commitDragHistory() {
    if (this.dragStartPositions.size === 0) return

    const transforms = [...this.dragStartPositions.entries()]
      .map(([id, before]) => {
        const point = this.editor.scene.points.get(id)
        if (!point) return null

        return {
          id,
          before,
          after: point.position.clone(),
        }
      })
      .filter(
        (transform): transform is { id: string; before: Vec3; after: Vec3 } => transform !== null,
      )

    this.editor.applyPointTransformHistory(transforms)
    this.dragStartPositions.clear()
  }

  clearPreview() {
    this.rubberBandData = null
    this.mobileCreatePreviewPos = null
    this.resetMobileCreatePointerState()
    this.syncControlLockState()
    this.renderer.hideAxisGuides()
  }

  private endDrag() {
    this.dragPlane = null
    this.dragLastPos = null
    this.dragStartPointerPos = null
    this.dragReferenceStartPos = null
    this.dragReferenceStartMathPos = null
    this.dragDepth = null
    this.dragStartPositions.clear()
  }

  shouldSyncLiveScene() {
    return (
      this.draggingPointId !== null ||
      this.draggingLineId !== null ||
      this.draggingStraightLineId !== null ||
      this.draggingRayId !== null ||
      this.draggingFaceId !== null ||
      performance.now() < this.liveSyncUntil
    )
  }

  getLiveSyncPointIds() {
    return [...this.dragStartPositions.keys()]
  }

  getFacePreviewData(): FacePreviewData | null {
    if (this.editor.mode !== EditorMode.CreatePlane) return null
    return this.editor.getFacePreviewFromSelection()
  }
}
