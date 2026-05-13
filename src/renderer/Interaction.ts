// src/renderer/Interaction.ts
import * as THREE from 'three'
import { Editor, EditorMode, type FacePreviewData } from '../core/editor/Editor'
import { Scene } from '../core/scene/Scene'
import type { Line3 } from '../core/geometry/Line3'
import type { Point3 } from '../core/geometry/Point3'
import type { Ray3 } from '../core/geometry/Ray3'
import type { GeoVector3 } from '../core/geometry/GeoVector3'
import type { StraightLine3 } from '../core/geometry/StraightLine3'
import type { Circle3 } from '../core/geometry/Circle3'
import type { DirectionType } from '../core/geometry/Circle3'
import { Vec3 } from '../core/geometry/Vec3'
import { isIntersectionTargetType } from '../core/geometry/IntersectionPoint3'
import { ThreeRenderer } from './ThreeRenderer'

export class Interaction {
  private static readonly MOBILE_TAP_MOVE_THRESHOLD = 8
  private static readonly COLLAB_SETTLE_SYNC_MS = 250
  private static readonly TOUCH_MOUSE_GUARD_MS = 500
  private static readonly AR_WHEEL_ZOOM_STEP = 0.0015
  private static readonly AR_PINCH_ZOOM_MIN_DELTA = 0.01
  private static readonly MOBILE_POINT_PICK_RADIUS_PX = 20
  private static readonly MOBILE_ENDPOINT_PROTECTION_RADIUS_PX = 2
  private static readonly MOBILE_LINE_PICK_THRESHOLD = 0.2
  private static readonly POINT_LABEL_HITBOX_SCALE = 0.72
  private static readonly POINT_PICK_PROTECTION_RADIUS_PX = 14
  private static readonly POINT_LABEL_OVERLAP_PRIORITY_PX = 18
  private static readonly POINT_LABEL_SAFE_ZONE_PX = 16
  private static readonly POINT_LABEL_POINT_PRIORITY_RADIUS_PX = 16
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()
  draggingPointId: string | null = null
  draggingLineId: string | null = null
  draggingStraightLineId: string | null = null
  draggingRayId: string | null = null
  draggingVectorId: string | null = null
  draggingCircleId: string | null = null
  draggingSphereId: string | null = null
  draggingFaceId: string | null = null
  private draggingLabelTarget: {
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face'
    geoId: string
    startClientX: number
    startClientY: number
    startOffsetX: number
    startOffsetY: number
  } | null = null
  rubberBandData: { from: THREE.Vector3; to: THREE.Vector3 } | null = null //存储连线预览位置
  normalCircleCenterPointId: string | null = null
  normalCircleDirectionType: DirectionType | null = null
  normalCircleDirectionId: string | null = null
  regularPolygonFirstPointId: string | null = null
  sphereTwoPointsFirstPointId: string | null = null
  radiusSphereCenterPointId: string | null = null
  private dragPlane: THREE.Plane | null = null
  private dragLastPos: THREE.Vector3 | null = null
  private dragStartPointerPos: THREE.Vector3 | null = null
  private dragReferenceStartPos: THREE.Vector3 | null = null
  private dragReferenceStartMathPos: THREE.Vector3 | null = null
  private dragDepth: number | null = null
  private dragStartPositions = new Map<string, Vec3>()
  private dragSceneStartPositions: Map<string, Vec3> | null = null
  private dragStartAxisHints: Array<{ setAxisHint: (v: Vec3) => void; getVAxisHint: () => Vec3; before: Vec3 }> | null = null
  private mobileCreatePointerId: number | null = null
  private mobileCreatePreviewPos: Vec3 | null = null
  private mobileCreateHadPreviewAtPointerDown = false
  private mobileCreateMoved = false
  private mobileCreateStartClient = new THREE.Vector2()
  private mobileInteractionPointerId: number | null = null
  private mobileInteractionMoved = false
  private mobileInteractionStartedOnEmpty = false
  private mobileInteractionStartClient = new THREE.Vector2()
  private pendingToggleSelection: {
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face'
    geoId: string
  } | null = null
  private readonly activeTouchPoints = new Map<number, THREE.Vector2>()
  private pinchZoomDistance: number | null = null
  private activeLabelTarget: {
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face'
    geoId: string
  } | null = null
  private activePointValueTarget: { type: 'point'; geoId: string } | null = null
  private globalPointValueMode = false
  private lastTouchEventAt = 0
  private liveSyncUntil = 0
  private arMouseRotationCandidate = false
  private arMouseRotationCandidateStartClient = new THREE.Vector2()
  private arSceneRotating = false
  private arSceneRotationPointerId: number | null = null
  private arSceneRotationLastClientX = 0
  private arSceneRotationLastClientY = 0
  public onARSceneRotateStartRequest: (() => boolean) | null = null
  public onARSceneRotate: ((quaternion: THREE.Quaternion) => void) | null = null
  public onARSceneRotateEnd: (() => void) | null = null

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
    dom.addEventListener('wheel', this.onWheel, { passive: false })
    dom.addEventListener('pointerdown', this.onPointerDown, { capture: true })
    dom.addEventListener('pointermove', this.onPointerMove, { capture: true })
    dom.addEventListener('pointerup', this.onPointerUp, { capture: true })
    dom.addEventListener('pointercancel', this.onPointerCancel, { capture: true })
  }

  unbind(dom: HTMLElement) {
    dom.removeEventListener('mousedown', this.onMouseDown)
    dom.removeEventListener('mousemove', this.onMouseMove)
    dom.removeEventListener('mouseup', this.onMouseUp)
    dom.removeEventListener('mouseleave', this.onMouseLeave)
    dom.removeEventListener('wheel', this.onWheel)
    dom.removeEventListener('pointerdown', this.onPointerDown, { capture: true })
    dom.removeEventListener('pointermove', this.onPointerMove, { capture: true })
    dom.removeEventListener('pointerup', this.onPointerUp, { capture: true })
    dom.removeEventListener('pointercancel', this.onPointerCancel, { capture: true })
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
    const worldPos = this.renderer.getActiveCameraWorldPosition().add(direction.multiplyScalar(30))
    const pos = this.renderer.toMathLocalPosition(worldPos)

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

  private resetPinchZoomState() {
    this.pinchZoomDistance = null
  }

  private beginARSceneRotation(pointerId: number | null, clientX: number, clientY: number) {
    if (this.editor.mode !== EditorMode.Select) return false
    if (!this.renderer.isSharedSceneRotationAvailable()) return false
    if (this.onARSceneRotateStartRequest && !this.onARSceneRotateStartRequest()) return false
    this.arSceneRotating = true
    this.arSceneRotationPointerId = pointerId
    this.arSceneRotationLastClientX = clientX
    this.arSceneRotationLastClientY = clientY
    this.renderer.controls.enabled = false
    this.renderer.renderer.domElement.style.cursor = 'grabbing'
    return true
  }

  private resetARMouseRotationCandidate() {
    this.arMouseRotationCandidate = false
  }

  private updateARSceneRotation(clientX: number, clientY: number) {
    if (!this.arSceneRotating) return
    if (!this.renderer.isSharedSceneRotationAvailable()) {
      this.endARSceneRotation()
      return
    }
    const deltaX = clientX - this.arSceneRotationLastClientX
    const deltaY = clientY - this.arSceneRotationLastClientY
    this.arSceneRotationLastClientX = clientX
    this.arSceneRotationLastClientY = clientY
    if (deltaX === 0 && deltaY === 0) return
    const quaternion = this.renderer.rotateSharedWorldByScreenDelta(deltaX, deltaY)
    this.onARSceneRotate?.(quaternion)
  }

  private endARSceneRotation() {
    if (!this.arSceneRotating) return
    this.arSceneRotating = false
    this.arSceneRotationPointerId = null
    this.syncControlLockState()
    this.renderer.renderer.domElement.style.cursor = 'default'
    this.onARSceneRotateEnd?.()
  }

  private cancelActiveMobileDrag() {
    this.draggingPointId = null
    this.draggingLineId = null
    this.draggingStraightLineId = null
    this.draggingRayId = null
    this.draggingVectorId = null
    this.draggingCircleId = null
    this.draggingSphereId = null
    this.draggingFaceId = null
    this.draggingLabelTarget = null
    this.pendingToggleSelection = null
    this.endDrag()
    this.resetARMouseRotationCandidate()
    this.endARSceneRotation()
    this.syncControlLockState()
    this.renderer.renderer.domElement.style.cursor = 'default'
  }

  private handleARZoom(deltaScale: number) {
    if (!this.renderer.isARActive() || !Number.isFinite(deltaScale) || deltaScale === 0) return
    this.renderer.scaleARWorldBy(deltaScale)
  }

  private getActivePinchDistance() {
    if (this.activeTouchPoints.size < 2) return null
    const points = [...this.activeTouchPoints.values()]
    const first = points[0]
    const second = points[1]
    if (!first || !second) return null
    return first.distanceTo(second)
  }

  getActiveLabelTarget() {
    return this.activeLabelTarget
  }

  getActivePointValueTarget() {
    return this.activePointValueTarget
  }

  setGlobalPointValueMode(enabled: boolean) {
    this.globalPointValueMode = enabled
    if (!enabled) {
      this.clearActivePointValueTarget()
    }
  }

  getLiveSyncLabelTarget() {
    if (!this.draggingLabelTarget) return null
    return {
      type: this.draggingLabelTarget.type,
      geoId: this.draggingLabelTarget.geoId,
    }
  }

  private clearActiveLabelTarget() {
    if (this.activeLabelTarget) this.editor.scene.markAllRenderDirty()
    this.activeLabelTarget = null
  }

  private clearActivePointValueTarget() {
    if (this.activePointValueTarget) this.editor.scene.markAllRenderDirty()
    this.activePointValueTarget = null
  }

  private setActivePointValueTarget(geoId: string) {
    if (!this.globalPointValueMode) return
    if (this.activePointValueTarget?.geoId === geoId) return
    this.activePointValueTarget = { type: 'point', geoId }
    this.editor.scene.markAllRenderDirty()
  }

  private isSameActiveLabelTarget(
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face',
    geoId: string,
  ) {
    return this.activeLabelTarget?.type === type && this.activeLabelTarget?.geoId === geoId
  }

  private deselectGeometry(
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face',
    geoId: string,
  ) {
    if (type === 'point') this.editor.scene.selection.deselectPoint(geoId)
    else if (type === 'line') this.editor.scene.selection.deselectLine(geoId)
    else if (type === 'straightLine') this.editor.scene.selection.deselectStraightLine(geoId)
    else if (type === 'ray') this.editor.scene.selection.deselectRay(geoId)
    else if (type === 'vector') this.editor.scene.selection.deselectVector(geoId)
    else if (type === 'circle') this.editor.scene.selection.deselectCircle(geoId)
    else if (type === 'sphere') this.editor.scene.selection.deselectSphere(geoId)
    else if (type === 'face') this.editor.deselectCubeByFaceId(geoId)
  }

  private selectGeometry(
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face',
    geoId: string,
  ) {
    if (type === 'point') this.editor.scene.selection.selectPoint(geoId, true)
    else if (type === 'line') this.editor.scene.selection.selectLine(geoId, true)
    else if (type === 'straightLine') this.editor.scene.selection.selectStraightLine(geoId, true)
    else if (type === 'ray') this.editor.scene.selection.selectRay(geoId, true)
    else if (type === 'vector') this.editor.scene.selection.selectVector(geoId, true)
    else if (type === 'circle') this.editor.scene.selection.selectCircle(geoId, true)
    else if (type === 'sphere') this.editor.scene.selection.selectSphere(geoId, true)
    else if (type === 'face') this.editor.selectCubeByFaceId(geoId, true)
  }

  private toggleCreateSelection(type: 'point' | 'line', geoId: string) {
    if (type === 'point') {
      if (this.editor.scene.selection.points.has(geoId)) {
        this.editor.scene.selection.deselectPoint(geoId)
        this.editor.selectedPoints = this.editor.selectedPoints.filter(
          (point) => point.id !== geoId,
        )
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

  private commitCreateHexahedronSelection(type: 'point' | 'line', geoId: string) {
    this.toggleCreateSelection(type, geoId)
    this.editor.tryCreateHexahedronFromSelection()
  }

  private commitCreateTetrahedronSelection(type: 'point' | 'line', geoId: string) {
    this.toggleCreateSelection(type, geoId)
    this.editor.tryCreateTetrahedronFromSelection()
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
      this.draggingVectorId !== null ||
      this.draggingCircleId !== null ||
      this.draggingSphereId !== null ||
      this.draggingFaceId !== null ||
      this.draggingLabelTarget !== null ||
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
    this.commitLabelDrag()
    this.commitDragHistory()
    this.editor.scene.activeDraggedPointIds.clear()
    this.draggingPointId = null
    this.draggingLineId = null
    this.draggingStraightLineId = null
    this.draggingRayId = null
    this.draggingVectorId = null
    this.draggingCircleId = null
    this.draggingSphereId = null
    this.draggingFaceId = null
    this.draggingLabelTarget = null
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
          obj.userData?.type === 'ray' ||
          obj.userData?.type === 'vector',
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

  private pickIntersectionTarget() {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const candidates = [...this.renderer.meshMap.values()].filter((obj) => {
      const type = obj.userData?.type
      return (
        type === 'line' ||
        type === 'straightLine' ||
        type === 'ray' ||
        type === 'vector' ||
        type === 'circle' ||
        type === 'sphere' ||
        type === 'face'
      )
    })
    const hits = this.raycaster.intersectObjects(candidates)
    if (hits.length === 0) return null

    const linearHit = hits.find(
      (hit) =>
        hit.object.userData.type === 'line' ||
        hit.object.userData.type === 'straightLine' ||
        hit.object.userData.type === 'ray',
    )
    if (linearHit) return linearHit.object

    return hits[0]!.object
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

  private getVectorDragReferencePoint(vector: GeoVector3) {
    return new Vec3(
      (vector.p1.position.x + vector.p2.position.x) / 2,
      (vector.p1.position.y + vector.p2.position.y) / 2,
      (vector.p1.position.z + vector.p2.position.z) / 2,
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

  private getCircleDragReferencePoint(circle: Circle3) {
    const frame = circle.getFrame(this.editor.resolveDirectionVector(
      circle.directionType ?? 'point',
      circle.directionId ?? '',
    ))
    if (!frame) {
      if (circle.isNormalCircle()) {
        return circle.p1.position
      }
      return new Vec3(
        (circle.p1.position.x + circle.p2.position.x + circle.p3.position.x) / 3,
        (circle.p1.position.y + circle.p2.position.y + circle.p3.position.y) / 3,
        (circle.p1.position.z + circle.p2.position.z + circle.p3.position.z) / 3,
      )
    }
    return frame.center
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
          selection.vectors.forEach((vid) => {
            const v = this.editor.scene.vectors.get(vid)
            if (v && !this.editor.isVectorGeometryLocked(v)) {
              toMove.add(v.p1.id)
              toMove.add(v.p2.id)
            }
          })
          selection.straightLines.forEach((sid) => {
            const line = this.editor.scene.straightLines.get(sid)
            if (line && !this.editor.isStraightLineGeometryLocked(line)) {
              toMove.add(line.p1.id)
              toMove.add(line.p2.id)
            }
          })
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
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
          selection.vectors.forEach((vid) => {
            const v = this.editor.scene.vectors.get(vid)
            if (v && !this.editor.isVectorGeometryLocked(v)) {
              toMove.add(v.p1.id)
              toMove.add(v.p2.id)
            }
          })
          selection.straightLines.forEach((sid) => {
            const straightLine = this.editor.scene.straightLines.get(sid)
            if (straightLine && !this.editor.isStraightLineGeometryLocked(straightLine)) {
              toMove.add(straightLine.p1.id)
              toMove.add(straightLine.p2.id)
            }
          })
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
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
          selection.vectors.forEach((vid) => {
            const v = this.editor.scene.vectors.get(vid)
            if (v && !this.editor.isVectorGeometryLocked(v)) {
              toMove.add(v.p1.id)
              toMove.add(v.p2.id)
            }
          })
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
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
          selection.vectors.forEach((vid) => {
            const v = this.editor.scene.vectors.get(vid)
            if (v && !this.editor.isVectorGeometryLocked(v)) {
              toMove.add(v.p1.id)
              toMove.add(v.p2.id)
            }
          })
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
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

    if (this.draggingVectorId) {
      const vector = this.editor.scene.vectors.get(this.draggingVectorId)
      if (!vector) return
      if (this.editor.isVectorGeometryLocked(vector)) return

      this.handleDrag(
        this.getVectorDragReferencePoint(vector),
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
            if (straightLine && !this.editor.isStraightLineGeometryLocked(straightLine)) {
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
          selection.vectors.forEach((vid) => {
            const v = this.editor.scene.vectors.get(vid)
            if (v && !this.editor.isVectorGeometryLocked(v)) {
              toMove.add(v.p1.id)
              toMove.add(v.p2.id)
            }
          })
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(vector.p1.id)
          toMove.add(vector.p2.id)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingCircleId) {
      const circle = this.editor.scene.circles.get(this.draggingCircleId)
      if (!circle) return
      if (this.editor.isCircleGeometryLocked(circle)) return

      this.handleDrag(
        this.getCircleDragReferencePoint(circle),
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
            if (straightLine && !this.editor.isStraightLineGeometryLocked(straightLine)) {
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
          selection.vectors.forEach((vid) => {
            const v = this.editor.scene.vectors.get(vid)
            if (v && !this.editor.isVectorGeometryLocked(v)) {
              toMove.add(v.p1.id)
              toMove.add(v.p2.id)
            }
          })
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(circle.p1.id)
          if (!circle.isNormalCircle()) {
            toMove.add(circle.p2.id)
            toMove.add(circle.p3.id)
          }
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingSphereId) {
      const sphere = this.editor.scene.spheres.get(this.draggingSphereId)
      if (!sphere) return
      if (this.editor.isSphereGeometryLocked(sphere)) return

      this.handleDrag(
        sphere.centerPoint.position,
        (delta) => {
          const toMove = new Set<string>()
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
            }
          })
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(sphere.centerPoint.id)
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
          selection.circles.forEach((cid) => {
            const c = this.editor.scene.circles.get(cid)
            if (c && !this.editor.isCircleGeometryLocked(c)) {
              toMove.add(c.p1.id)
              if (!c.isNormalCircle()) {
                toMove.add(c.p2.id)
                toMove.add(c.p3.id)
              }
            }
          })
          selection.spheres.forEach((sid) => {
            const s = this.editor.scene.spheres.get(sid)
            if (s && !this.editor.isSphereGeometryLocked(s)) {
              toMove.add(s.centerPoint.id)
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
    const labelHit =
      this.editor.mode === EditorMode.Select ? this.pickLabelAtClient(e.clientX, e.clientY) : null
    const hit =
      this.editor.mode === EditorMode.IntersectionPoint
        ? this.pickIntersectionTarget()
        : this.pick()

    if (this.renderer.isARActive() && this.editor.mode === EditorMode.CreatePoint) {
      return
    }

    if (
      this.renderer.isARActive() &&
      (this.editor.mode === EditorMode.CreateLine ||
        this.editor.mode === EditorMode.CreateStraightLine ||
        this.editor.mode === EditorMode.CreateRay ||
        this.editor.mode === EditorMode.CreateVector ||
        this.editor.mode === EditorMode.CreateCircleThreePoints ||
        this.editor.mode === EditorMode.CreateCircleNormal ||
        this.editor.mode === EditorMode.CreatePlane ||
        this.editor.mode === EditorMode.CreateRegularPolygon ||
        this.editor.mode === EditorMode.CreateHexahedron ||
        this.editor.mode === EditorMode.CreateTetrahedron ||
        this.editor.mode === EditorMode.CreateSphereTwoPoints ||
        this.editor.mode === EditorMode.CreateSphereRadius ||
        this.editor.mode === EditorMode.IntersectionPoint)
    ) {
      return
    }

    if (this.editor.mode === EditorMode.CreatePoint) {
      this.renderer.controls.enabled = false
      const pos = this.getCreatePointPosition(this.editor.isSnappingEnabled && !e.altKey)
      this.editor.createPoint(new Vec3(pos.x, pos.y, pos.z))
      return
    }

    if (hit || labelHit) {
      this.renderer.controls.enabled = false
      const targetObject = this.resolvePreferredTarget(hit, labelHit, e.clientX, e.clientY)
      const isNameLabel = Boolean(targetObject?.userData.isNameLabel)
      const geoId = isNameLabel ? targetObject?.userData.geoId : targetObject?.userData.geoId
      const type = isNameLabel ? targetObject?.userData.geoType : targetObject?.userData.type
      if (!geoId || !type) return
      if (this.editor.mode === EditorMode.Delete) {
        if (type === 'point') {
          this.editor.deletePoint(geoId)
        } else if (type === 'line') {
          this.editor.deleteLine(geoId)
        } else if (type === 'straightLine') {
          this.editor.deleteStraightLine(geoId)
        } else if (type === 'ray') {
          this.editor.deleteRay(geoId)
        } else if (type === 'vector') {
          this.editor.deleteVector(geoId)
        } else if (type === 'circle') {
          this.editor.deleteCircle(geoId)
        } else if (type === 'sphere') {
          this.editor.deleteSphere(geoId)
        } else if (type === 'face') {
          this.editor.deleteFace(geoId)
        }
        return
      }
      if (this.editor.mode === EditorMode.Select) {
        this.renderer.renderer.domElement.style.cursor = 'grabbing'
        if (isNameLabel) {
          if (!this.beginLabelDrag(type, geoId, e.clientX, e.clientY)) {
            this.renderer.renderer.domElement.style.cursor = 'default'
            this.syncControlLockState()
          }
          return
        }
        this.clearActiveLabelTarget()
        this.clearActivePointValueTarget()
        if (type === 'point') {
          const alreadySelected = this.editor.scene.selection.points.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectPoint(geoId, true)
          this.setActivePointValueTarget(geoId)
          const p = this.editor.scene.points.get(geoId)
          if (p) {
            if (p.circleRole === 'center' && p.circleId) {
              const circle = this.editor.scene.circles.get(p.circleId)
              if (circle && !this.editor.isCircleGeometryLocked(circle)) {
                this.draggingCircleId = p.circleId
                this.startDrag(this.getCircleDragReferencePoint(circle))
              } else {
                this.draggingPointId = null
              }
            } else if (p.sphereRole === 'center' && p.sphereId) {
              const sphere = this.editor.scene.spheres.get(p.sphereId)
              if (sphere && !this.editor.isSphereGeometryLocked(sphere)) {
                this.draggingSphereId = p.sphereId
                this.startDrag(new THREE.Vector3(
                  sphere.centerPoint.position.x,
                  sphere.centerPoint.position.y,
                  sphere.centerPoint.position.z,
                ))
              } else {
                this.draggingPointId = null
              }
            } else if (this.editor.isPointCoordinateLocked(p)) {
              this.draggingPointId = null
            } else {
              this.draggingPointId = geoId
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
        } else if (type === 'vector') {
          const alreadySelected = this.editor.scene.selection.vectors.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectVector(geoId, true)
          const vector = this.editor.scene.vectors.get(geoId)
          if (vector) {
            if (this.editor.isVectorGeometryLocked(vector)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingVectorId = geoId
              this.startDrag(this.getVectorDragReferencePoint(vector))
            }
          }
        } else if (type === 'circle') {
          const alreadySelected = this.editor.scene.selection.circles.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectCircle(geoId, true)
          const circle = this.editor.scene.circles.get(geoId)
          if (circle) {
            if (this.editor.isCircleGeometryLocked(circle)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingCircleId = geoId
              this.startDrag(this.getCircleDragReferencePoint(circle))
            }
          }
        } else if (type === 'sphere') {
          const alreadySelected = this.editor.scene.selection.spheres.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectSphere(geoId, true)
          const sphere = this.editor.scene.spheres.get(geoId)
          if (sphere) {
            if (this.editor.isSphereGeometryLocked(sphere)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingSphereId = geoId
              this.startDrag(new THREE.Vector3(
                sphere.centerPoint.position.x,
                sphere.centerPoint.position.y,
                sphere.centerPoint.position.z,
              ))
            }
          }
        } else if (type === 'face') {
          const alreadySelected = this.editor.scene.selection.faces.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.selectCubeByFaceId(geoId, true)
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
      } else if (this.editor.mode === EditorMode.CreateVector && type === 'point') {
        this.editor.tryCreateVectorWith(this.editor.scene.points.get(geoId)!)
      } else if (this.editor.mode === EditorMode.CreateCircleThreePoints && type === 'point') {
        if (this.editor.scene.selection.points.has(geoId)) {
          this.toggleCreateSelection('point', geoId)
        } else {
          this.editor.tryCreateThreePointCircleWith(this.editor.scene.points.get(geoId)!)
        }
      } else if (this.editor.mode === EditorMode.CreateCircleNormal) {
        if (type === 'point' && !this.normalCircleCenterPointId) {
          this.normalCircleCenterPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.normalCircleCenterPointId && !this.normalCircleDirectionId) {
          if (type === 'point') {
            if (geoId === this.normalCircleCenterPointId) {
              this.normalCircleDirectionType = 'point'
              this.normalCircleDirectionId = geoId
            } else {
              this.normalCircleDirectionType = 'point'
              this.normalCircleDirectionId = geoId
              this.editor.scene.selection.selectPoint(geoId, true)
            }
          } else if (type === 'line' || type === 'straightLine' || type === 'ray' || type === 'vector') {
            this.normalCircleDirectionType = type as DirectionType
            this.normalCircleDirectionId = geoId
            this.selectGeometry(type as any, geoId)
          }
          if (this.normalCircleDirectionId) {
            window.dispatchEvent(
              new CustomEvent('show-normal-circle-radius-dialog', {
                detail: {
                  centerPointId: this.normalCircleCenterPointId,
                  directionType: this.normalCircleDirectionType,
                  directionId: this.normalCircleDirectionId,
                },
              }),
            )
          }
        }
      } else if (this.editor.mode === EditorMode.CreatePlane && type === 'point') {
        this.toggleCreateSelection('point', geoId)
      } else if (this.editor.mode === EditorMode.CreatePlane && type === 'line') {
        this.toggleCreateSelection('line', geoId)
      } else if (this.editor.mode === EditorMode.CreateRegularPolygon && type === 'point') {
        if (!this.regularPolygonFirstPointId) {
          this.regularPolygonFirstPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.regularPolygonFirstPointId !== geoId) {
          this.editor.scene.selection.selectPoint(geoId, true)
          window.dispatchEvent(
            new CustomEvent('open-regular-polygon-dialog', {
              detail: {
                firstPointId: this.regularPolygonFirstPointId,
                secondPointId: geoId,
              },
            }),
          )
        }
      } else if (this.editor.mode === EditorMode.CreateHexahedron && type === 'point') {
        this.commitCreateHexahedronSelection('point', geoId)
      } else if (this.editor.mode === EditorMode.CreateHexahedron && type === 'line') {
        this.commitCreateHexahedronSelection('line', geoId)
      } else if (this.editor.mode === EditorMode.CreateTetrahedron && type === 'point') {
        this.commitCreateTetrahedronSelection('point', geoId)
      } else if (this.editor.mode === EditorMode.CreateTetrahedron && type === 'line') {
        this.commitCreateTetrahedronSelection('line', geoId)
      } else if (this.editor.mode === EditorMode.CreateSphereTwoPoints && type === 'point') {
        if (!this.sphereTwoPointsFirstPointId) {
          this.sphereTwoPointsFirstPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.sphereTwoPointsFirstPointId !== geoId) {
          this.editor.scene.selection.selectPoint(geoId, true)
          const firstPoint = this.editor.scene.points.get(this.sphereTwoPointsFirstPointId)
          const secondPoint = this.editor.scene.points.get(geoId)
          if (firstPoint && secondPoint) {
            this.editor.tryCreateSphereTwoPoints(firstPoint, secondPoint)
          }
          this.sphereTwoPointsFirstPointId = null
        }
      } else if (this.editor.mode === EditorMode.CreateSphereRadius && type === 'point') {
        if (!this.radiusSphereCenterPointId) {
          this.radiusSphereCenterPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
          window.dispatchEvent(
            new CustomEvent('show-radius-sphere-dialog', {
              detail: { centerPointId: geoId },
            }),
          )
        }
      } else if (this.editor.mode === EditorMode.MergePoint && type === 'point') {
        this.toggleCreateSelection('point', geoId)
      } else if (
        this.editor.mode === EditorMode.IntersectionPoint &&
        isIntersectionTargetType(type)
      ) {
        this.editor.toggleIntersectionSelection(type, geoId)
      }
    } else {
      if (this.renderer.isARActive() && this.editor.mode === EditorMode.Select) {
        this.arMouseRotationCandidate = true
        this.arMouseRotationCandidateStartClient.set(e.clientX, e.clientY)
        return
      }
      if (this.editor.mode === EditorMode.Select) {
        this.editor.scene.selection.clear()
        this.clearActiveLabelTarget()
        this.clearActivePointValueTarget()
      } else if (this.editor.mode === EditorMode.CreatePlane)
        this.editor.tryCreateFaceFromSelection()
      else if (this.editor.mode === EditorMode.CreateRegularPolygon)
        this.resetRegularPolygonCreation()
      else if (
        this.editor.mode === EditorMode.CreateHexahedron ||
        this.editor.mode === EditorMode.CreateTetrahedron ||
        this.editor.mode === EditorMode.CreateSphereTwoPoints
      )
        this.editor.scene.selection.clear()
      else if (this.editor.mode === EditorMode.CreateSphereRadius) {
        this.resetRadiusSphereCreation()
      } else if (this.editor.mode === EditorMode.CreateCircleNormal) {
        this.resetNormalCircleCreation()
      } else if (this.editor.mode === EditorMode.IntersectionPoint)
        this.editor.clearIntersectionSelection()
    }
  }

  onMouseMove = (e: MouseEvent) => {
    if (this.shouldIgnoreMouseEvent()) return
    this.updateMouse(e)

    if (this.arSceneRotating) {
      this.updateARSceneRotation(e.clientX, e.clientY)
      return
    }

    if (
      this.arMouseRotationCandidate &&
      this.renderer.isARActive() &&
      this.editor.mode === EditorMode.Select &&
      this.arMouseRotationCandidateStartClient.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) >=
        Interaction.MOBILE_TAP_MOVE_THRESHOLD
    ) {
      if (this.beginARSceneRotation(null, e.clientX, e.clientY)) {
        this.resetARMouseRotationCandidate()
        return
      }
    }

    if (this.renderer.isARActive() && this.editor.mode === EditorMode.CreatePoint) {
      this.renderer.hideAxisGuides()
      return
    }

    if (
      this.renderer.isARActive() &&
      (this.editor.mode === EditorMode.CreateLine ||
        this.editor.mode === EditorMode.CreateStraightLine ||
        this.editor.mode === EditorMode.CreateRay ||
        this.editor.mode === EditorMode.CreateVector ||
        this.editor.mode === EditorMode.CreateCircleThreePoints ||
        this.editor.mode === EditorMode.CreateCircleNormal ||
        this.editor.mode === EditorMode.CreatePlane ||
        this.editor.mode === EditorMode.CreateRegularPolygon ||
        this.editor.mode === EditorMode.CreateHexahedron ||
        this.editor.mode === EditorMode.CreateTetrahedron ||
        this.editor.mode === EditorMode.CreateSphereTwoPoints ||
        this.editor.mode === EditorMode.CreateSphereRadius ||
        this.editor.mode === EditorMode.IntersectionPoint)
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
      (this.editor.mode === EditorMode.CreateLine ||
        this.editor.mode === EditorMode.CreateStraightLine ||
        this.editor.mode === EditorMode.CreateRay ||
        this.editor.mode === EditorMode.CreateVector) &&
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
      const to = this.renderer.toMathLocalPosition(this.raycaster.ray.at(30, new THREE.Vector3()))

      // 如果有吸附开关，也应用到预览线上
      if (this.editor.isSnappingEnabled && !e.altKey) {
        to.set(this.snap(to.x), this.snap(to.y), this.snap(to.z))
      }

      this.rubberBandData = { from, to }
    } else {
      this.rubberBandData = null
    }

    if (this.draggingLabelTarget) {
      this.previewLabelDrag(e.clientX, e.clientY)
      return
    }

    this.handleSelectionDragMove(e.altKey)
  }

  onMouseUp = () => {
    if (this.shouldIgnoreMouseEvent()) return
    if (this.arMouseRotationCandidate) {
      this.resetARMouseRotationCandidate()
      if (this.renderer.isARActive() && this.editor.mode === EditorMode.Select) {
        this.editor.scene.selection.clear()
        this.clearActiveLabelTarget()
        this.clearActivePointValueTarget()
      }
      return
    }
    if (this.arSceneRotating) {
      this.endARSceneRotation()
      return
    }
    if (this.draggingLabelTarget) {
      this.finishDragInteraction()
      return
    }
    if (this.pendingToggleSelection && this.dragStartPositions.size === 0) {
      this.deselectGeometry(this.pendingToggleSelection.type, this.pendingToggleSelection.geoId)
      this.draggingPointId = null
      this.draggingLineId = null
      this.draggingStraightLineId = null
      this.draggingRayId = null
      this.draggingVectorId = null
      this.draggingCircleId = null
      this.draggingSphereId = null
      this.draggingFaceId = null
      this.pendingToggleSelection = null
      this.clearActiveLabelTarget()
      this.clearActivePointValueTarget()
      this.endDrag()
      this.syncControlLockState()
      this.renderer.renderer.domElement.style.cursor = 'default'
      if (this.editor.mode !== EditorMode.CreatePoint) {
        this.renderer.hideAxisGuides()
      }
      return
    }
    this.finishDragInteraction()
    this.clearActivePointValueTarget()
  }

  onMouseLeave = () => {
    this.resetARMouseRotationCandidate()
    this.endARSceneRotation()
    this.clearPreview()
  }

  onWheel = (e: WheelEvent) => {
    if (!this.renderer.isARActive()) return
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * Interaction.AR_WHEEL_ZOOM_STEP)
    this.handleARZoom(factor)
  }

  onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()
    this.activeTouchPoints.set(e.pointerId, new THREE.Vector2(e.clientX, e.clientY))

    if (this.renderer.isARActive() && this.activeTouchPoints.size >= 2) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
      this.resetMobileCreatePointerState()
      this.resetMobileInteractionState()
      this.cancelActiveMobileDrag()
      this.pinchZoomDistance = this.getActivePinchDistance()
      return
    }

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
    const labelHit =
      this.editor.mode === EditorMode.Select ? this.pickLabelAtClient(e.clientX, e.clientY) : null
    const hit =
      this.editor.mode === EditorMode.IntersectionPoint
        ? this.pickIntersectionTarget()
        : this.pickTouchTarget(e.clientX, e.clientY)

    if (!hit && !labelHit) {
      if (this.editor.mode === EditorMode.CreatePlane) {
        e.preventDefault()
        e.stopPropagation()
        this.editor.tryCreateFaceFromSelection()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.CreateRegularPolygon) {
        e.preventDefault()
        e.stopPropagation()
        this.resetRegularPolygonCreation()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.CreateHexahedron) {
        e.preventDefault()
        e.stopPropagation()
        this.editor.scene.selection.clear()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.CreateTetrahedron) {
        e.preventDefault()
        e.stopPropagation()
        this.editor.scene.selection.clear()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.CreateSphereTwoPoints) {
        e.preventDefault()
        e.stopPropagation()
        this.resetSphereTwoPointsCreation()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.CreateSphereRadius) {
        e.preventDefault()
        e.stopPropagation()
        this.resetRadiusSphereCreation()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.IntersectionPoint) {
        e.preventDefault()
        e.stopPropagation()
        this.editor.clearIntersectionSelection()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.Select) {
        this.clearActiveLabelTarget()
      }
      this.mobileInteractionStartedOnEmpty = this.editor.mode === EditorMode.Select
      return
    }

    const targetObject = this.resolvePreferredTarget(hit, labelHit, e.clientX, e.clientY)
    const isNameLabel = Boolean(targetObject?.userData.isNameLabel)
    const geoId = isNameLabel ? targetObject?.userData.geoId : targetObject?.userData.geoId
    const type = isNameLabel ? targetObject?.userData.geoType : targetObject?.userData.type
    if (!geoId || !type) return

    if (this.editor.mode === EditorMode.Delete) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') this.editor.deletePoint(geoId)
      else if (type === 'line') this.editor.deleteLine(geoId)
      else if (type === 'straightLine') this.editor.deleteStraightLine(geoId)
      else if (type === 'ray') this.editor.deleteRay(geoId)
      else if (type === 'vector') this.editor.deleteVector(geoId)
      else if (type === 'circle') this.editor.deleteCircle(geoId)
      else if (type === 'sphere') this.editor.deleteSphere(geoId)
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

    if (this.editor.mode === EditorMode.CreateVector && type === 'point') {
      e.preventDefault()
      e.stopPropagation()
      this.editor.tryCreateVectorWith(this.editor.scene.points.get(geoId)!)
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateCircleNormal) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point' && !this.normalCircleCenterPointId) {
        this.normalCircleCenterPointId = geoId
        this.editor.scene.selection.selectPoint(geoId, true)
      } else if (this.normalCircleCenterPointId && !this.normalCircleDirectionId) {
        if (type === 'point') {
          if (geoId === this.normalCircleCenterPointId) {
            this.normalCircleDirectionType = 'point'
            this.normalCircleDirectionId = geoId
          } else {
            this.normalCircleDirectionType = 'point'
            this.normalCircleDirectionId = geoId
            this.editor.scene.selection.selectPoint(geoId, true)
          }
        } else if (type === 'line' || type === 'straightLine' || type === 'ray' || type === 'vector') {
          this.normalCircleDirectionType = type as DirectionType
          this.normalCircleDirectionId = geoId
          this.selectGeometry(type as any, geoId)
        }
        if (this.normalCircleDirectionId) {
          window.dispatchEvent(
            new CustomEvent('show-normal-circle-radius-dialog', {
              detail: {
                centerPointId: this.normalCircleCenterPointId,
                directionType: this.normalCircleDirectionType,
                directionId: this.normalCircleDirectionId,
              },
            }),
          )
        }
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateCircleThreePoints && type === 'point') {
      e.preventDefault()
      e.stopPropagation()
      if (this.editor.scene.selection.points.has(geoId)) {
        this.toggleCreateSelection('point', geoId)
      } else {
        this.editor.tryCreateThreePointCircleWith(this.editor.scene.points.get(geoId)!)
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

    if (this.editor.mode === EditorMode.CreateRegularPolygon) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') {
        if (!this.regularPolygonFirstPointId) {
          this.regularPolygonFirstPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.regularPolygonFirstPointId !== geoId) {
          this.editor.scene.selection.selectPoint(geoId, true)
          window.dispatchEvent(
            new CustomEvent('open-regular-polygon-dialog', {
              detail: {
                firstPointId: this.regularPolygonFirstPointId,
                secondPointId: geoId,
              },
            }),
          )
        }
      } else {
        this.resetRegularPolygonCreation()
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateHexahedron) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') this.commitCreateHexahedronSelection('point', geoId)
      else if (type === 'line') this.commitCreateHexahedronSelection('line', geoId)
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateTetrahedron) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') this.commitCreateTetrahedronSelection('point', geoId)
      else if (type === 'line') this.commitCreateTetrahedronSelection('line', geoId)
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateSphereTwoPoints) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') {
        if (!this.sphereTwoPointsFirstPointId) {
          this.sphereTwoPointsFirstPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.sphereTwoPointsFirstPointId !== geoId) {
          this.editor.scene.selection.selectPoint(geoId, true)
          const firstPoint = this.editor.scene.points.get(this.sphereTwoPointsFirstPointId)
          const secondPoint = this.editor.scene.points.get(geoId)
          if (firstPoint && secondPoint) {
            this.editor.tryCreateSphereTwoPoints(firstPoint, secondPoint)
          }
          this.sphereTwoPointsFirstPointId = null
        }
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateSphereRadius) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point' && !this.radiusSphereCenterPointId) {
        this.radiusSphereCenterPointId = geoId
        this.editor.scene.selection.selectPoint(geoId, true)
        window.dispatchEvent(
          new CustomEvent('show-radius-sphere-dialog', {
            detail: { centerPointId: geoId },
          }),
        )
      }
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

    if (this.editor.mode === EditorMode.IntersectionPoint && isIntersectionTargetType(type)) {
      e.preventDefault()
      e.stopPropagation()
      this.editor.toggleIntersectionSelection(type, geoId)
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode !== EditorMode.Select) {
      this.resetMobileInteractionState()
      return
    }

    if (isNameLabel) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
      if (!this.beginLabelDrag(type, geoId, e.clientX, e.clientY)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        this.resetMobileInteractionState()
        return
      }
      return
    }
    this.clearActiveLabelTarget()

    if (type === 'point') {
      const alreadySelected = this.editor.scene.selection.points.has(geoId)
      this.editor.scene.selection.selectPoint(geoId, true)
      this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
      this.setActivePointValueTarget(geoId)

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
      const point = this.editor.scene.points.get(geoId)
      if (!point) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      if (point.circleRole === 'center' && point.circleId) {
        const circle = this.editor.scene.circles.get(point.circleId)
        if (circle && !this.editor.isCircleGeometryLocked(circle)) {
          this.draggingCircleId = point.circleId
          this.startDrag(this.getCircleDragReferencePoint(circle))
        } else {
          this.syncControlLockState()
          this.renderer.renderer.domElement.style.cursor = 'default'
        }
      } else if (point.sphereRole === 'center' && point.sphereId) {
        const sphere = this.editor.scene.spheres.get(point.sphereId)
        if (sphere && !this.editor.isSphereGeometryLocked(sphere)) {
          this.draggingSphereId = point.sphereId
          this.startDrag(new THREE.Vector3(
            sphere.centerPoint.position.x,
            sphere.centerPoint.position.y,
            sphere.centerPoint.position.z,
          ))
        } else {
          this.syncControlLockState()
          this.renderer.renderer.domElement.style.cursor = 'default'
        }
      } else if (this.editor.isPointCoordinateLocked(point)) {
        this.draggingPointId = null
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
      } else {
        this.draggingPointId = geoId
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

    if (type === 'vector') {
      const alreadySelected = this.editor.scene.selection.vectors.has(geoId)
      this.editor.scene.selection.selectVector(geoId, true)
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
      const vector = this.editor.scene.vectors.get(geoId)
      if (!vector || this.editor.isVectorGeometryLocked(vector)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingVectorId = geoId
      this.startDrag(this.getVectorDragReferencePoint(vector))
      return
    }

    if (type === 'circle') {
      const alreadySelected = this.editor.scene.selection.circles.has(geoId)
      this.editor.scene.selection.selectCircle(geoId, true)
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
      const circle = this.editor.scene.circles.get(geoId)
      if (!circle || this.editor.isCircleGeometryLocked(circle)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingCircleId = geoId
      this.startDrag(this.getCircleDragReferencePoint(circle))
      return
    }

    if (type === 'sphere') {
      const alreadySelected = this.editor.scene.selection.spheres.has(geoId)
      this.editor.scene.selection.selectSphere(geoId, true)
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
      const sphere = this.editor.scene.spheres.get(geoId)
      if (!sphere || this.editor.isSphereGeometryLocked(sphere)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingSphereId = geoId
      this.startDrag(new THREE.Vector3(
        sphere.centerPoint.position.x,
        sphere.centerPoint.position.y,
        sphere.centerPoint.position.z,
      ))
      return
    }

    if (type === 'face') {
      const alreadySelected = this.editor.scene.selection.faces.has(geoId)
      this.editor.selectCubeByFaceId(geoId, true)
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
    if (this.activeTouchPoints.has(e.pointerId)) {
      this.activeTouchPoints.get(e.pointerId)!.set(e.clientX, e.clientY)
    }

    if (this.renderer.isARActive() && this.activeTouchPoints.size >= 2) {
      const distance = this.getActivePinchDistance()
      if (distance !== null) {
        if (this.pinchZoomDistance !== null) {
          const ratio = distance / this.pinchZoomDistance
          if (Math.abs(ratio - 1) >= Interaction.AR_PINCH_ZOOM_MIN_DELTA) {
            e.preventDefault()
            e.stopPropagation()
            this.handleARZoom(ratio)
            this.pinchZoomDistance = distance
          }
        } else {
          this.pinchZoomDistance = distance
        }
      }
      return
    }

    if (this.arSceneRotating) {
      if (this.arSceneRotationPointerId !== e.pointerId) return
      e.preventDefault()
      e.stopPropagation()
      this.updateMobileMoveThreshold(e.clientX, e.clientY)
      this.updateARSceneRotation(e.clientX, e.clientY)
      return
    }

    if (
      this.renderer.isARActive() &&
      this.editor.mode === EditorMode.Select &&
      this.mobileInteractionStartedOnEmpty &&
      !this.draggingPointId &&
      !this.draggingLineId &&
      !this.draggingStraightLineId &&
      !this.draggingRayId &&
      !this.draggingFaceId &&
      !this.draggingSphereId &&
      !this.draggingLabelTarget
    ) {
      this.updateMobileMoveThreshold(e.clientX, e.clientY)
      if (this.mobileInteractionMoved) {
        e.preventDefault()
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
        if (this.beginARSceneRotation(e.pointerId, e.clientX, e.clientY)) {
          return
        }
      }
    }

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
      !this.draggingVectorId &&
      !this.draggingCircleId &&
      !this.draggingSphereId &&
      !this.draggingFaceId &&
      !this.draggingLabelTarget
    )
      return

    e.preventDefault()
    e.stopPropagation()
    this.updatePointerPosition(e.clientX, e.clientY)
    if (this.draggingLabelTarget) {
      this.previewLabelDrag(e.clientX, e.clientY)
      return
    }
    this.handleSelectionDragMove(false)
  }

  onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()
    const wasPinching = this.renderer.isARActive() && this.activeTouchPoints.size >= 2
    this.activeTouchPoints.delete(e.pointerId)
    if (wasPinching) {
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      this.resetPinchZoomState()
      return
    }
    if (this.renderer.isARActive() && this.activeTouchPoints.size === 0) {
      this.resetPinchZoomState()
    }

    if (this.arSceneRotating && this.arSceneRotationPointerId === e.pointerId) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      this.endARSceneRotation()
      this.resetMobileInteractionState()
      return
    }

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
      this.draggingVectorId !== null ||
      this.draggingCircleId !== null ||
      this.draggingSphereId !== null ||
      this.draggingFaceId !== null ||
      this.draggingLabelTarget !== null

    if (hadDrag) {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      if (
        this.pendingToggleSelection &&
        !this.mobileInteractionMoved &&
        this.dragStartPositions.size === 0
      ) {
        this.deselectGeometry(this.pendingToggleSelection.type, this.pendingToggleSelection.geoId)
        this.draggingPointId = null
        this.draggingLineId = null
        this.draggingStraightLineId = null
        this.draggingRayId = null
        this.draggingCircleId = null
        this.draggingSphereId = null
        this.draggingFaceId = null
        this.pendingToggleSelection = null
        this.clearActiveLabelTarget()
        this.clearActivePointValueTarget()
        this.endDrag()
        this.syncControlLockState()
      } else {
        this.finishDragInteraction()
        this.clearActivePointValueTarget()
      }
    } else if (
      this.editor.mode === EditorMode.Select &&
      this.mobileInteractionStartedOnEmpty &&
      !this.mobileInteractionMoved
    ) {
      this.editor.scene.selection.clear()
    }

    this.resetMobileInteractionState()
    this.clearActivePointValueTarget()
    this.syncControlLockState()
  }

  onPointerCancel = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return
    this.lastTouchEventAt = performance.now()
    this.activeTouchPoints.delete(e.pointerId)
    if (this.renderer.isARActive()) {
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      if (this.activeTouchPoints.size < 2) this.resetPinchZoomState()
    }

    if (this.arSceneRotating && this.arSceneRotationPointerId === e.pointerId) {
      this.endARSceneRotation()
      this.resetMobileInteractionState()
      return
    }

    if (this.mobileCreatePointerId === e.pointerId) {
      ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
      this.resetMobileCreatePointerState()
      this.syncControlLockState()
      return
    }

    if (this.mobileInteractionPointerId !== e.pointerId) return
    ;(e.currentTarget as HTMLElement | null)?.releasePointerCapture?.(e.pointerId)
    this.finishDragInteraction()
    this.clearActivePointValueTarget()
    this.resetMobileInteractionState()
    this.syncControlLockState()
  }

  //统一的拾取函数
  pick(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const hits = this.raycaster.intersectObjects([...this.renderer.meshMap.values()], true)

    if (hits.length > 0) {
      const resolveObject = (obj: THREE.Object3D): THREE.Object3D => {
        if (obj.userData.type) return obj
        if (obj.parent && obj.parent.userData.type) return obj.parent
        return obj
      }

      const pointHit = hits.find((h) => resolveObject(h.object).userData.type === 'point')
      if (pointHit) return resolveObject(pointHit.object)

      const lineHit = hits.find(
        (h) => {
          const resolved = resolveObject(h.object)
          return resolved.userData.type === 'line' ||
            resolved.userData.type === 'straightLine' ||
            resolved.userData.type === 'ray' ||
            resolved.userData.type === 'vector' ||
            resolved.userData.type === 'circle' ||
            resolved.userData.type === 'sphere'
        },
      )
      if (lineHit) return resolveObject(lineHit.object)

      const faceHit = hits.find((h) => resolveObject(h.object).userData.type === 'face')
      if (faceHit) return resolveObject(faceHit.object)

      return resolveObject(hits[0]!.object)
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

    if (!this.dragSceneStartPositions) {
      this.dragSceneStartPositions = new Map(
        [...this.editor.scene.points.entries()].map(([id, point]) => [id, point.position.clone()]),
      )
    }

    if (!this.dragStartAxisHints) {
      this.dragStartAxisHints = [
        ...this.editor.getCubeConstraints().map((c) => ({
          setAxisHint: c.setAxisHint.bind(c),
          getVAxisHint: c.getVAxisHint.bind(c),
          before: c.getVAxisHint().clone(),
        })),
        ...this.editor.getRegularPolygonConstraints().map((c) => ({
          setAxisHint: c.setAxisHint.bind(c),
          getVAxisHint: c.getVAxisHint.bind(c),
          before: c.getVAxisHint().clone(),
        })),
      ]
    }
  }

  private previewMovePoints(pointIds: string[], delta: Vec3) {
    const expandedPointIds = this.expandLockedLinePreviewPointIds(pointIds)
    this.editor.scene.activeDraggedPointIds = new Set(expandedPointIds)
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
    const startPositions = this.dragSceneStartPositions
    if (!startPositions && this.dragStartPositions.size === 0) return

    const sourceEntries = startPositions
      ? [...startPositions.entries()]
      : [...this.dragStartPositions.entries()]
    const transforms = sourceEntries
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

    const axisHintChanges = this.dragStartAxisHints
      ?.map((entry) => ({
        setAxisHint: entry.setAxisHint,
        before: entry.before,
        after: entry.getVAxisHint().clone(),
      }))
      .filter((change) => {
        const b = change.before
        const a = change.after
        return Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.z - b.z) > 1e-6
      }) ?? []

    this.editor.applyPointTransformHistory(transforms, axisHintChanges)
    this.dragStartPositions.clear()
    this.dragSceneStartPositions = null
    this.dragStartAxisHints = null
  }

  resetNormalCircleCreation() {
    this.normalCircleCenterPointId = null
    this.normalCircleDirectionType = null
    this.normalCircleDirectionId = null
    this.editor.selectedPoints = []
    this.editor.scene.selection.clear()
  }

  resetRegularPolygonCreation() {
    this.regularPolygonFirstPointId = null
    this.editor.selectedPoints = []
    this.editor.scene.selection.clear()
  }

  private resetSphereTwoPointsCreation() {
    this.sphereTwoPointsFirstPointId = null
    this.editor.scene.selection.clear()
  }

  resetRadiusSphereCreation() {
    this.radiusSphereCenterPointId = null
    this.editor.scene.selection.clear()
  }

  confirmRadiusSphereRadius(radius: number) {
    if (!this.radiusSphereCenterPointId) return
    const centerPoint = this.editor.scene.points.get(this.radiusSphereCenterPointId)
    if (!centerPoint) return
    this.radiusSphereCenterPointId = null
    this.editor.tryCreateSphereRadius(centerPoint, radius)
  }

  cancelRadiusSphereCreation() {
    this.resetRadiusSphereCreation()
  }

  confirmRegularPolygonVertices(vertexCount: number, firstPointId: string, secondPointId: string) {
    const p1 = this.editor.scene.points.get(firstPointId)
    const p2 = this.editor.scene.points.get(secondPointId)
    if (!p1 || !p2) return
    this.editor.tryCreateRegularPolygon(p1, p2, vertexCount)
    this.resetRegularPolygonCreation()
  }

  cancelRegularPolygon() {
    this.resetRegularPolygonCreation()
  }

  confirmNormalCircleRadius(radius: number) {
    if (!this.normalCircleCenterPointId || !this.normalCircleDirectionType || !this.normalCircleDirectionId) return
    const centerPoint = this.editor.scene.points.get(this.normalCircleCenterPointId)
    if (!centerPoint) return
    this.editor.tryCreateNormalCircle(
      centerPoint,
      this.normalCircleDirectionType,
      this.normalCircleDirectionId,
      radius,
    )
    this.resetNormalCircleCreation()
  }

  cancelNormalCircleCreation() {
    this.resetNormalCircleCreation()
  }

  clearPreview() {
    this.endARSceneRotation()
    this.rubberBandData = null
    this.mobileCreatePreviewPos = null
    this.resetMobileCreatePointerState()
    this.clearActiveLabelTarget()
    this.clearActivePointValueTarget()
    this.syncControlLockState()
    this.renderer.hideAxisGuides()
    this.regularPolygonFirstPointId = null
    this.sphereTwoPointsFirstPointId = null
  }

  private endDrag() {
    this.dragPlane = null
    this.dragLastPos = null
    this.dragStartPointerPos = null
    this.dragReferenceStartPos = null
    this.dragReferenceStartMathPos = null
    this.dragDepth = null
    this.draggingLabelTarget = null
    this.editor.scene.activeDraggedPointIds.clear()
    this.dragStartPositions.clear()
    this.dragSceneStartPositions = null
    this.dragStartAxisHints = null
  }

  shouldSyncLiveScene() {
    return (
      this.draggingPointId !== null ||
      this.draggingLineId !== null ||
      this.draggingStraightLineId !== null ||
      this.draggingRayId !== null ||
      this.draggingVectorId !== null ||
      this.draggingCircleId !== null ||
      this.draggingSphereId !== null ||
      this.draggingFaceId !== null ||
      this.draggingLabelTarget !== null ||
      performance.now() < this.liveSyncUntil
    )
  }

  getLiveSyncPointIds() {
    const pointIds = new Set(this.dragStartPositions.keys())
    if (pointIds.size === 0) return []

    let changed = true
    while (changed) {
      changed = false
      this.editor.scene.intersectionConstraints.forEach((constraint) => {
        const dependencyIds = constraint.getDependencyPointIds?.()
        if (!dependencyIds || !constraint.pointId) return

        const linkedIds = new Set<string>([constraint.pointId, ...dependencyIds])
        const shouldExpand = [...linkedIds].some((id) => pointIds.has(id))
        if (!shouldExpand) return

        linkedIds.forEach((id) => {
          if (!pointIds.has(id)) {
            pointIds.add(id)
            changed = true
          }
        })
      })
    }

    return [...pointIds]
  }

  getFacePreviewData(): FacePreviewData | null {
    if (this.editor.mode !== EditorMode.CreatePlane) return null
    return this.editor.getFacePreviewFromSelection()
  }

  private clampLabelOffset(value: number) {
    return Math.max(
      -ThreeRenderer.LABEL_DRAG_LIMIT,
      Math.min(ThreeRenderer.LABEL_DRAG_LIMIT, value),
    )
  }

  private projectWorldToClient(pos: THREE.Vector3, rect: DOMRect) {
    const projected = pos.clone().project(this.renderer.getActiveCamera())
    if (projected.z < -1 || projected.z > 1) return null
    return new THREE.Vector2(
      rect.left + (projected.x + 1) * 0.5 * rect.width,
      rect.top + (1 - projected.y) * 0.5 * rect.height,
    )
  }

  private projectObjectToClient(object: THREE.Object3D, rect: DOMRect) {
    return this.projectWorldToClient(object.getWorldPosition(new THREE.Vector3()), rect)
  }

  private getPointLabelScreenMetrics(geoId: string, sprite: THREE.Sprite, rect: DOMRect) {
    const point = this.editor.scene.points.get(geoId)
    const pointCenter = point ? this.projectMathPositionToClient(point.position, rect) : null
    const labelCenter = this.projectObjectToClient(sprite, rect)
    if (!pointCenter || !labelCenter) return null

    return {
      pointCenter,
      labelCenter,
      separation: pointCenter.distanceTo(labelCenter),
    }
  }

  private resolvePreferredTarget(
    geometryHit: THREE.Object3D | null,
    labelHit: THREE.Object3D | null,
    clientX: number,
    clientY: number,
  ) {
    if (!labelHit) return geometryHit
    if (!geometryHit) return labelHit
    if (this.renderer.isARActive() && this.editor.mode === EditorMode.Select) {
      return labelHit
    }

    const labelType = labelHit.userData?.geoType as string | undefined
    if (labelType !== 'point' || geometryHit.userData?.type !== 'point') {
      return labelHit
    }

    const geoId = labelHit.userData?.geoId as string | undefined
    if (!geoId) return labelHit

    const rect = this.getPointerClientRect()
    const metrics = this.getPointLabelScreenMetrics(geoId, labelHit as THREE.Sprite, rect)
    if (!metrics) return labelHit

    const pointer = new THREE.Vector2(clientX, clientY)
    const pointDistance = pointer.distanceTo(metrics.pointCenter)
    const labelDistance = pointer.distanceTo(metrics.labelCenter)

    if (pointDistance <= Interaction.POINT_LABEL_POINT_PRIORITY_RADIUS_PX) {
      return geometryHit
    }

    if (metrics.separation <= Interaction.POINT_LABEL_OVERLAP_PRIORITY_PX) {
      return labelDistance + 4 < pointDistance ? labelHit : geometryHit
    }

    if (metrics.separation <= Interaction.POINT_LABEL_SAFE_ZONE_PX) {
      return labelDistance <= pointDistance ? labelHit : geometryHit
    }

    return labelHit
  }

  private pickLabelAtClient(clientX: number, clientY: number) {
    const rect = this.getPointerClientRect()
    const pointer = new THREE.Vector2(clientX, clientY)
    let best: {
      sprite: THREE.Sprite
      distance: number
    } | null = null

    for (const sprite of this.renderer.getNameLabelSprites()) {
      const data = sprite.userData
      const geoId = data?.geoId as string | undefined
      const type = data?.geoType as 'point' | 'line' | 'straightLine' | 'ray' | 'circle' | 'sphere' | 'face' | undefined
      if (!sprite.visible || !geoId || !type) continue

      const center = this.projectObjectToClient(sprite, rect)
      if (!center) continue

      const textPixelWidth = Number(data?.textPixelWidth ?? 0)
      const textPixelHeight = Number(data?.textPixelHeight ?? 0)
      const canvasPixelWidth = Number(data?.canvasPixelWidth ?? 256)
      const canvasPixelHeight = Number(data?.canvasPixelHeight ?? 256)
      let width =
        Math.max(
          28,
          (sprite.scale.x * rect.height * Math.max(1, textPixelWidth)) / canvasPixelWidth,
        ) + 10
      let height =
        Math.max(
          20,
          (sprite.scale.y * rect.height * Math.max(1, textPixelHeight)) / canvasPixelHeight,
        ) + 8
      if (type === 'point') {
        const metrics = this.getPointLabelScreenMetrics(geoId, sprite, rect)
        if (!metrics) continue
        if (
          metrics.separation > Interaction.POINT_LABEL_SAFE_ZONE_PX &&
          pointer.distanceTo(metrics.pointCenter) <= Interaction.POINT_PICK_PROTECTION_RADIUS_PX
        ) {
          continue
        }

        const pointHitboxScale =
          metrics.separation <= Interaction.POINT_LABEL_SAFE_ZONE_PX
            ? 0.92
            : Interaction.POINT_LABEL_HITBOX_SCALE
        width *= pointHitboxScale
        height *= pointHitboxScale
      }

      if (
        Math.abs(pointer.x - center.x) > width * 0.5 ||
        Math.abs(pointer.y - center.y) > height * 0.5
      ) {
        continue
      }

      const distance = pointer.distanceTo(center)
      if (!best || distance < best.distance) {
        best = { sprite, distance }
      }
    }

    return best?.sprite ?? null
  }

  private getGeometryByType(
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face',
    geoId: string,
  ) {
    if (type === 'point') return this.editor.scene.points.get(geoId) ?? null
    if (type === 'line') return this.editor.scene.lines.get(geoId) ?? null
    if (type === 'straightLine') return this.editor.scene.straightLines.get(geoId) ?? null
    if (type === 'ray') return this.editor.scene.rays.get(geoId) ?? null
    if (type === 'vector') return this.editor.scene.vectors.get(geoId) ?? null
    if (type === 'circle') return this.editor.scene.circles.get(geoId) ?? null
    if (type === 'sphere') return this.editor.scene.spheres.get(geoId) ?? null
    return this.editor.scene.faces.get(geoId) ?? null
  }

  private beginLabelDrag(
    type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'face',
    geoId: string,
    clientX: number,
    clientY: number,
  ) {
    const geometry = this.getGeometryByType(type, geoId)
    if (!geometry) return false

    this.selectGeometry(type, geoId)
    this.activeLabelTarget = { type, geoId }
    this.draggingLabelTarget = {
      type,
      geoId,
      startClientX: clientX,
      startClientY: clientY,
      startOffsetX: geometry.labelOffsetX,
      startOffsetY: geometry.labelOffsetY,
    }
    this.pendingToggleSelection = null
    this.renderer.controls.enabled = false
    this.renderer.renderer.domElement.style.cursor = 'grabbing'
    return true
  }

  private previewLabelDrag(clientX: number, clientY: number) {
    const target = this.draggingLabelTarget
    if (!target) return
    const geometry = this.getGeometryByType(target.type, target.geoId)
    if (!geometry) return
    geometry.labelOffsetX = this.clampLabelOffset(
      target.startOffsetX + clientX - target.startClientX,
    )
    geometry.labelOffsetY = this.clampLabelOffset(
      target.startOffsetY - (clientY - target.startClientY),
    )
    this.renderer.previewLabelOffset(target.geoId, geometry.labelOffsetX, geometry.labelOffsetY)
  }

  private commitLabelDrag() {
    const target = this.draggingLabelTarget
    if (!target) return
    const geometry = this.getGeometryByType(target.type, target.geoId)
    if (!geometry) return

    const nextOffsetX = this.clampLabelOffset(geometry.labelOffsetX)
    const nextOffsetY = this.clampLabelOffset(geometry.labelOffsetY)
    geometry.labelOffsetX = target.startOffsetX
    geometry.labelOffsetY = target.startOffsetY

    if (nextOffsetX === target.startOffsetX && nextOffsetY === target.startOffsetY) return

    if (target.type === 'point') {
      this.editor.updatePoint(target.geoId, {
        labelOffsetX: nextOffsetX,
        labelOffsetY: nextOffsetY,
      })
    } else if (target.type === 'line') {
      this.editor.updateLine(target.geoId, { labelOffsetX: nextOffsetX, labelOffsetY: nextOffsetY })
    } else if (target.type === 'straightLine') {
      this.editor.updateStraightLine(target.geoId, {
        labelOffsetX: nextOffsetX,
        labelOffsetY: nextOffsetY,
      })
    } else if (target.type === 'ray') {
      this.editor.updateRay(target.geoId, { labelOffsetX: nextOffsetX, labelOffsetY: nextOffsetY })
    } else if (target.type === 'vector') {
      this.editor.updateVector(target.geoId, { labelOffsetX: nextOffsetX, labelOffsetY: nextOffsetY })
    } else if (target.type === 'circle') {
      this.editor.updateCircle(target.geoId, {
        labelOffsetX: nextOffsetX,
        labelOffsetY: nextOffsetY,
      })
    } else if (target.type === 'sphere') {
      this.editor.updateSphere(target.geoId, {
        labelOffsetX: nextOffsetX,
        labelOffsetY: nextOffsetY,
      })
    } else {
      this.editor.updateFace(target.geoId, { labelOffsetX: nextOffsetX, labelOffsetY: nextOffsetY })
    }
  }
}
