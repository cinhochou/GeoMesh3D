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
import { DEFAULT_POINT_COLOR } from './GeometrySyncer'

export class Interaction {
  private static readonly MOBILE_TAP_MOVE_THRESHOLD = 8
  private static readonly COLLAB_SETTLE_SYNC_MS = 250
  private static readonly TOUCH_MOUSE_GUARD_MS = 500
  private static readonly AR_WHEEL_ZOOM_STEP = 0.0015
  private static readonly CREATE_POINT_DEPTH_WHEEL_STEP = 0.005
  private static readonly CREATE_POINT_DEPTH_WHEEL_FINE_STEP = 0.001
  private static readonly CREATE_POINT_DEPTH_MIN = 0.1
  private static readonly CREATE_POINT_DEPTH_MAX = 300
  private static readonly AR_PINCH_ZOOM_MIN_DELTA = 0.01
  private static readonly MOBILE_POINT_PICK_RADIUS_PX = 20
  private static readonly MOBILE_ENDPOINT_PROTECTION_RADIUS_PX = 2
  private static readonly MOBILE_LINE_PICK_THRESHOLD = 0.2
  private static readonly AR_MOUSE_POINT_PICK_RADIUS_PX = 11
  private static readonly AR_TOUCH_POINT_PICK_RADIUS_PX = 17
  private static readonly AR_MOUSE_LINE_PICK_THRESHOLD = 0.14
  private static readonly AR_TOUCH_LINE_PICK_THRESHOLD = 0.18
  private static readonly SCREEN_POINT_HIT_RADIUS_PX = 14
  private static readonly SCREEN_POINT_HIT_RADIUS_MOBILE_PX = 20
  private static readonly SCREEN_POINT_HIT_RADIUS_AR_MOUSE_PX = 14
  private static readonly SCREEN_POINT_HIT_RADIUS_AR_TOUCH_PX = 24
  private static readonly SCREEN_LINE_HIT_RADIUS_PX = 8
  private static readonly SCREEN_LINE_HIT_RADIUS_MOBILE_PX = 14
  private static readonly SCREEN_LINE_HIT_RADIUS_AR_MOUSE_PX = 8
  private static readonly SCREEN_LINE_HIT_RADIUS_AR_TOUCH_PX = 18
  private static readonly SCREEN_CIRCLE_HIT_RADIUS_PX = 8
  private static readonly SCREEN_CIRCLE_HIT_RADIUS_MOBILE_PX = 14
  private static readonly SCREEN_CIRCLE_HIT_RADIUS_AR_MOUSE_PX = 8
  private static readonly SCREEN_CIRCLE_HIT_RADIUS_AR_TOUCH_PX = 18
  private static readonly SCREEN_POINT_PROTECTION_RADIUS_PX = 14
  private static readonly SCREEN_POINT_PROTECTION_RADIUS_MOBILE_PX = 20
  private static readonly SCREEN_POINT_PROTECTION_RADIUS_AR_MOUSE_PX = 14
  private static readonly SCREEN_POINT_PROTECTION_RADIUS_AR_TOUCH_PX = 24
  private static readonly SCREEN_TIE_BREAK_PX = 3
  private static readonly SCREEN_LABEL_GEO_BONUS_PX = 2
  private static readonly POINT_LABEL_HITBOX_SCALE = 0.72
  private static readonly POINT_LABEL_HITBOX_SCALE_AR_PX = 0.5
  private static readonly POINT_LABEL_HITBOX_SCALE_AR_TOUCH_PX = 0.42
  private static readonly POINT_PICK_PROTECTION_RADIUS_PX = 14
  private static readonly POINT_LABEL_OVERLAP_PRIORITY_PX = 18
  private static readonly POINT_LABEL_SAFE_ZONE_PX = 16
  private static readonly POINT_LABEL_SAFE_ZONE_AR_PX = 12
  private static readonly POINT_LABEL_SAFE_ZONE_AR_TOUCH_PX = 10
  private static readonly POINT_LABEL_POINT_PRIORITY_RADIUS_PX = 16
  private static readonly LABEL_GEOMETRY_PROTECTION_PX = 12
  private static readonly LABEL_GEOMETRY_PROTECTION_MOBILE_PX = 18
  private static readonly LABEL_GEOMETRY_PROTECTION_AR_PX = 12
  private static readonly LABEL_GEOMETRY_PROTECTION_AR_TOUCH_PX = 15
  private static readonly LABEL_CLOSE_PRIORITY_PX = 10
  private static readonly LABEL_CLOSE_PRIORITY_MOBILE_PX = 16
  private static readonly LABEL_CLOSE_PRIORITY_AR_PX = 10
  private static readonly LABEL_CLOSE_PRIORITY_AR_TOUCH_PX = 14
  private static readonly LABEL_HITBOX_PADDING_PX = 8
  private static readonly LABEL_HITBOX_PADDING_MOBILE_PX = 14
  private static readonly LABEL_HITBOX_PADDING_AR_PX = 8
  private static readonly LABEL_HITBOX_PADDING_AR_TOUCH_PX = 11
  private static readonly GEOMETRY_CORE_HIT_PX = 7
  private static readonly GEOMETRY_CORE_HIT_MOBILE_PX = 12
  private static readonly GEOMETRY_CORE_HIT_AR_PX = 7
  private static readonly GEOMETRY_CORE_HIT_AR_TOUCH_PX = 10
  private static readonly GEOMETRY_HARD_CORE_HIT_PX = 3
  private static readonly GEOMETRY_HARD_CORE_HIT_MOBILE_PX = 6
  private static readonly GEOMETRY_HARD_CORE_HIT_AR_PX = 3
  private static readonly GEOMETRY_HARD_CORE_HIT_AR_TOUCH_PX = 5
  private static readonly LABEL_CORE_EDGE_RATIO = 0.34

  private static readonly deselectByType: Record<string, (editor: Editor, geoId: string) => void> =
    {
      point: (e, id) => e.scene.selection.deselectPoint(id),
      line: (e, id) => e.scene.selection.deselectLine(id),
      straightLine: (e, id) => e.scene.selection.deselectStraightLine(id),
      perpendicularLine: (e, id) => e.scene.selection.deselectPerpendicularLine(id),
      parallelLine: (e, id) => e.scene.selection.deselectParallelLine(id),
      ray: (e, id) => e.scene.selection.deselectRay(id),
      vector: (e, id) => e.scene.selection.deselectVector(id),
      circle: (e, id) => e.scene.selection.deselectCircle(id),
      sphere: (e, id) => e.scene.selection.deselectSphere(id),
      cone: (e, id) => {
        e.scene.selection.deselectCone(id)
        e.scene.markAllRenderDirty()
      },
      cylinder: (e, id) => {
        e.scene.selection.deselectCylinder(id)
        e.scene.markAllRenderDirty()
      },
      face: (e, id) => e.deselectCubeByFaceId(id),
    }

  private static readonly selectByType: Record<string, (editor: Editor, geoId: string) => void> = {
    point: (e, id) => e.scene.selection.selectPoint(id, true),
    line: (e, id) => e.scene.selection.selectLine(id, true),
    straightLine: (e, id) => e.scene.selection.selectStraightLine(id, true),
    perpendicularLine: (e, id) => e.scene.selection.selectPerpendicularLine(id, true),
    parallelLine: (e, id) => e.scene.selection.selectParallelLine(id, true),
    ray: (e, id) => e.scene.selection.selectRay(id, true),
    vector: (e, id) => e.scene.selection.selectVector(id, true),
    circle: (e, id) => e.scene.selection.selectCircle(id, true),
    sphere: (e, id) => e.scene.selection.selectSphere(id, true),
    cone: (e, id) => e.scene.selection.selectCone(id, true),
    cylinder: (e, id) => e.scene.selection.selectCylinder(id, true),
    face: (e, id) => e.selectCubeByFaceId(id, true),
  }

  private static readonly deleteByType: Record<string, (editor: Editor, geoId: string) => void> = {
    point: (e, id) => e.deletePoint(id),
    line: (e, id) => e.deleteLine(id),
    straightLine: (e, id) => e.deleteStraightLine(id),
    perpendicularLine: (e, id) => e.deletePerpendicularLine(id),
    parallelLine: (e, id) => e.deleteParallelLine(id),
    ray: (e, id) => e.deleteRay(id),
    vector: (e, id) => e.deleteVector(id),
    circle: (e, id) => e.deleteCircle(id),
    sphere: (e, id) => e.deleteSphere(id),
    cone: (e, id) => e.deleteCone(id),
    cylinder: (e, id) => e.deleteCylinder(id),
    face: (e, id) => e.deleteFace(id),
  }

  private static readonly updateLabelOffsetByType: Record<
    string,
    (editor: Editor, geoId: string, offset: { labelOffsetX: number; labelOffsetY: number }) => void
  > = {
    point: (e, id, o) => e.updatePoint(id, o),
    line: (e, id, o) => e.updateLine(id, o),
    straightLine: (e, id, o) => e.updateStraightLine(id, o),
    perpendicularLine: (e, id, o) => e.updatePerpendicularLine(id, o),
    parallelLine: (e, id, o) => e.updateParallelLine(id, o),
    ray: (e, id, o) => e.updateRay(id, o),
    vector: (e, id, o) => e.updateVector(id, o),
    circle: (e, id, o) => e.updateCircle(id, o),
    sphere: (e, id, o) => e.updateSphere(id, o),
    cone: (e, id, o) => e.updateCone(id, o),
    cylinder: (e, id, o) => e.updateCylinder(id, o),
    face: (e, id, o) => e.updateFace(id, o),
  }

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()
  draggingPointId: string | null = null
  draggingLineId: string | null = null
  draggingStraightLineId: string | null = null
  draggingRayId: string | null = null
  draggingVectorId: string | null = null
  draggingCircleId: string | null = null
  draggingSphereId: string | null = null
  draggingConeId: string | null = null
  draggingCylinderId: string | null = null
  draggingFaceId: string | null = null
  draggingPerpendicularLineId: string | null = null
  draggingParallelLineId: string | null = null
  private draggingLabelTarget: {
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face'
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
  coneBaseCenterPointId: string | null = null
  coneNormalCircleId: string | null = null
  cylinderBottomCenterPointId: string | null = null
  private dragPlane: THREE.Plane | null = null
  private dragLastPos: THREE.Vector3 | null = null
  private dragStartPointerPos: THREE.Vector3 | null = null
  private dragReferenceStartPos: THREE.Vector3 | null = null
  private dragReferenceStartMathPos: THREE.Vector3 | null = null
  private dragDepth: number | null = null
  private dragStartPositions = new Map<string, Vec3>()
  private dragSceneStartPositions: Map<string, Vec3> | null = null
  private dragStartAxisHints: Array<{
    constraintType: 'cube' | 'regularPolygon'
    constraintId: string
    getVAxisHint: () => Vec3
    before: Vec3
  }> | null = null
  private mobileCreatePointerId: number | null = null
  private mobileCreatePreviewPos: Vec3 | null = null
  private createPointDraft: {
    depth: number
    position: THREE.Vector3
  } | null = null
  private mobileCreateHadPreviewAtPointerDown = false
  private mobileCreateMoved = false
  private mobileCreateStartClient = new THREE.Vector2()
  private mobileInteractionPointerId: number | null = null
  private mobileInteractionMoved = false
  private mobileInteractionStartedOnEmpty = false
  private mobileInteractionStartClient = new THREE.Vector2()
  private pendingToggleSelection: {
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face'
    geoId: string
  } | null = null
  private readonly activeTouchPoints = new Map<number, THREE.Vector2>()
  private pinchZoomDistance: number | null = null
  private activeLabelTarget: {
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face'
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
    return this.renderer.renderer.domElement.getBoundingClientRect()
  }

  private updatePointerPosition(clientX: number, clientY: number) {
    const rect = this.getPointerClientRect()
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1
  }

  private getCreatePointPosition(shouldSnap: boolean): THREE.Vector3 {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())

    const target = this.renderer.isARActive()
      ? new THREE.Vector3(0, 0, 0)
      : this.renderer.controls.target.clone()
    const cameraDir = this.renderer.getActiveCameraWorldDirection()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, target)

    const hitPoint = new THREE.Vector3()
    const hasHit = this.raycaster.ray.intersectPlane(plane, hitPoint)

    let worldPos: THREE.Vector3
    if (hasHit) {
      worldPos = hitPoint
    } else {
      const fallbackDist = this.renderer.isARActive()
        ? 30
        : this.renderer.getActiveCameraWorldPosition().distanceTo(target)
      worldPos = this.raycaster.ray.at(fallbackDist, new THREE.Vector3())
    }

    const pos = this.renderer.toMathLocalPosition(worldPos)

    if (shouldSnap) {
      pos.set(this.snap(pos.x), this.snap(pos.y), this.snap(pos.z))
    }

    return pos
  }

  private getDefaultCreatePointWorldPosition(): THREE.Vector3 {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())

    const target = this.renderer.isARActive()
      ? new THREE.Vector3(0, 0, 0)
      : this.renderer.controls.target.clone()
    const cameraDir = this.renderer.getActiveCameraWorldDirection()
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, target)

    const hitPoint = new THREE.Vector3()
    if (this.raycaster.ray.intersectPlane(plane, hitPoint)) return hitPoint

    const fallbackDist = this.renderer.isARActive()
      ? 30
      : this.renderer.getActiveCameraWorldPosition().distanceTo(target)
    return this.raycaster.ray.at(fallbackDist, new THREE.Vector3())
  }

  private getSnappedCreatePointPosition(worldPos: THREE.Vector3, shouldSnap: boolean) {
    const pos = this.renderer.toMathLocalPosition(worldPos)
    if (shouldSnap) {
      pos.set(this.snap(pos.x), this.snap(pos.y), this.snap(pos.z))
    }
    return pos
  }

  private beginCreatePointDraft(shouldSnap: boolean) {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const worldPos = this.getDefaultCreatePointWorldPosition()
    const depth = THREE.MathUtils.clamp(
      worldPos.clone().sub(this.raycaster.ray.origin).dot(this.raycaster.ray.direction),
      Interaction.CREATE_POINT_DEPTH_MIN,
      Interaction.CREATE_POINT_DEPTH_MAX,
    )
    const pos = this.getSnappedCreatePointPosition(worldPos, shouldSnap)
    this.createPointDraft = { depth, position: pos.clone() }
    this.showCreatePointPreview(pos)
  }

  private updateCreatePointDraftFromPointer(shouldSnap: boolean) {
    if (!this.createPointDraft) {
      this.showCreatePointPreview(this.getCreatePointPosition(shouldSnap))
      return
    }
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const worldPos = this.raycaster.ray.at(this.createPointDraft.depth, new THREE.Vector3())
    const pos = this.getSnappedCreatePointPosition(worldPos, shouldSnap)
    this.createPointDraft.position.copy(pos)
    this.showCreatePointPreview(pos)
  }

  private adjustCreatePointDraftDepth(deltaY: number, shouldSnap: boolean, fine: boolean) {
    if (!this.createPointDraft) {
      this.beginCreatePointDraft(shouldSnap)
    }
    const draft = this.createPointDraft
    if (!draft) return
    const step = fine
      ? Interaction.CREATE_POINT_DEPTH_WHEEL_FINE_STEP
      : Interaction.CREATE_POINT_DEPTH_WHEEL_STEP
    draft.depth = THREE.MathUtils.clamp(
      draft.depth + deltaY * step,
      Interaction.CREATE_POINT_DEPTH_MIN,
      Interaction.CREATE_POINT_DEPTH_MAX,
    )
    this.updateCreatePointDraftFromPointer(shouldSnap)
  }

  private getCurrentCreatePointPosition(shouldSnap: boolean) {
    if (!this.createPointDraft) {
      return this.getCreatePointPosition(shouldSnap)
    }
    this.updateCreatePointDraftFromPointer(shouldSnap)
    return this.createPointDraft.position.clone()
  }

  private commitCurrentCreatePoint(shouldSnap: boolean) {
    const pos = this.getCurrentCreatePointPosition(shouldSnap)
    const mathPos = new Vec3(pos.x, pos.y, pos.z)
    const rect = this.getPointerClientRect()
    const snapResult = this.detectAxisProximityScreen(mathPos, rect)
    if (snapResult) {
      this.editor.createConstrainedPoint(snapResult.snappedPos, snapResult.axis, snapResult.axis)
    } else {
      this.editor.createPoint(mathPos)
    }
    this.createPointDraft = null
    this.mobileCreatePreviewPos = null
    this.renderer.hideAxisGuides()
    return true
  }

  private detectAxisProximityScreen(
    pos: Vec3,
    rect: DOMRect,
  ): { axis: 'xAxis' | 'yAxis' | 'zAxis'; snappedPos: Vec3 } | null {
    const thresholdPx = 8
    const pointScreen = this.projectMathPositionToClient(pos, rect)
    if (!pointScreen) return null

    const axisSize = this.renderer.getAxisGridSize()
    const steps = 20
    const maxSegLen = Math.max(rect.width, rect.height)

    const axes: { axis: 'xAxis' | 'yAxis' | 'zAxis'; getPoint: (t: number) => Vec3 }[] = [
      { axis: 'xAxis', getPoint: (t) => new Vec3(t * axisSize, 0, 0) },
      { axis: 'yAxis', getPoint: (t) => new Vec3(0, t * axisSize, 0) },
      { axis: 'zAxis', getPoint: (t) => new Vec3(0, 0, t * axisSize) },
    ]

    let bestAxis: 'xAxis' | 'yAxis' | 'zAxis' | null = null
    let bestDist = thresholdPx
    let bestSnappedPos: Vec3 | null = null

    for (const { axis, getPoint } of axes) {
      const samples: { screen: THREE.Vector2; pos3d: Vec3 }[] = []
      for (let i = 0; i <= steps; i++) {
        const t = -1 + (2 * i) / steps
        const p3d = getPoint(t)
        const sp = this.projectMathPositionToClient(p3d, rect)
        if (sp) samples.push({ screen: sp, pos3d: p3d })
      }

      for (let i = 0; i < samples.length - 1; i++) {
        const sa = samples[i]!
        const sb = samples[i + 1]!
        if (sa.screen.distanceTo(sb.screen) > maxSegLen) continue
        const { dist, t } = this.pointToSegmentInfo(pointScreen, sa.screen, sb.screen)
        if (dist < bestDist) {
          bestDist = dist
          bestAxis = axis
          const ax = sa.pos3d.x + t * (sb.pos3d.x - sa.pos3d.x)
          const ay = sa.pos3d.y + t * (sb.pos3d.y - sa.pos3d.y)
          const az = sa.pos3d.z + t * (sb.pos3d.z - sa.pos3d.z)
          bestSnappedPos = new Vec3(ax, ay, az)
        }
      }
    }

    if (bestAxis && bestSnappedPos) {
      return { axis: bestAxis, snappedPos: bestSnappedPos }
    }
    return null
  }

  private pointToSegmentInfo(
    p: THREE.Vector2,
    a: THREE.Vector2,
    b: THREE.Vector2,
  ): { dist: number; t: number } {
    const ab = new THREE.Vector2().subVectors(b, a)
    const ap = new THREE.Vector2().subVectors(p, a)
    const lenSq = ab.lengthSq()
    if (lenSq === 0) return { dist: p.distanceTo(a), t: 0 }
    const t = Math.max(0, Math.min(1, ap.dot(ab) / lenSq))
    const closest = a.clone().add(ab.multiplyScalar(t))
    return { dist: p.distanceTo(closest), t }
  }

  private showCreatePointPreview(pos: THREE.Vector3) {
    this.mobileCreatePreviewPos = new Vec3(pos.x, pos.y, pos.z)
    const rect = this.getPointerClientRect()
    const mathPos = new Vec3(pos.x, pos.y, pos.z)
    const nearAxis = this.detectAxisProximityScreen(mathPos, rect)
    const hasConstrainedTarget = this.pickConstrainedTarget() !== null
    this.renderer.showAxisGuidesAt(pos)
    if (nearAxis || hasConstrainedTarget) {
      this.renderer.setGuideLinesVisible(false)
      this.renderer.setGuideLabelVisible(false)
    } else {
      this.renderer.setGuideLinesVisible(true)
      this.renderer.setGuideLabelVisible(true)
    }
    this.renderer.setGuidePointColor(hasConstrainedTarget ? 0xffff00 : DEFAULT_POINT_COLOR)
  }

  private pickConstrainedTarget(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const validTypes = new Set([
      'line',
      'straightLine',
      'ray',
      'vector',
      'circle',
      'sphere',
      'face',
      'cone',
      'coneBase',
      'cylinder',
      'cylinderBottom',
      'cylinderTop',
    ])
    const meshCandidates = [...this.renderer.geometrySyncer.meshMap.values()].filter((obj) => {
      return validTypes.has(obj.userData?.type)
    })
    const groupCandidates = [...this.renderer.geometrySyncer.groupMap.values()].filter((obj) => {
      return validTypes.has(obj.userData?.type)
    })
    const allCandidates = [...meshCandidates, ...groupCandidates]
    const hits = this.raycaster.intersectObjects(allCandidates, true)
    if (hits.length === 0) return null
    return hits[0]!.object
  }

  private tryCreateConstrainedPointFromHit(hit: THREE.Object3D): boolean {
    let resolvedHit: THREE.Object3D = hit
    while (!resolvedHit.userData?.type && resolvedHit.parent) {
      resolvedHit = resolvedHit.parent
    }
    const type = resolvedHit.userData?.type as string | undefined
    const geoId = resolvedHit.userData?.geoId as string | undefined
    if (!type || !geoId) return false

    const validTypes = new Set([
      'line',
      'straightLine',
      'ray',
      'vector',
      'circle',
      'face',
      'sphere',
      'cone',
      'coneBase',
      'cylinder',
      'cylinderBottom',
      'cylinderTop',
    ])
    if (!validTypes.has(type)) return false

    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())

    const closestHit = this.findClosestHitOnObject(type, geoId)
    if (!closestHit) return false

    const pos = this.renderer.toMathLocalPosition(closestHit)
    this.editor.createConstrainedPoint(
      new Vec3(pos.x, pos.y, pos.z),
      type as
        | 'line'
        | 'straightLine'
        | 'ray'
        | 'vector'
        | 'circle'
        | 'face'
        | 'sphere'
        | 'cone'
        | 'coneBase'
        | 'cylinder'
        | 'cylinderBottom'
        | 'cylinderTop',
      geoId,
    )
    this.createPointDraft = null
    this.mobileCreatePreviewPos = null
    this.renderer.hideAxisGuides()
    return true
  }

  private findClosestHitOnObject(_type: string, _geoId: string): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const candidates = [...this.renderer.geometrySyncer.meshMap.values()].filter((obj) => {
      const t = obj.userData?.type
      const gid = obj.userData?.geoId
      return t === _type && gid === _geoId
    })
    const groupCandidates = [...this.renderer.geometrySyncer.groupMap.values()].filter((obj) => {
      const t = obj.userData?.type
      const gid = obj.userData?.geoId
      return t === _type && gid === _geoId
    })
    const fallbackGroups = [...this.renderer.geometrySyncer.groupMap.values()].filter((obj) => {
      const gid = obj.userData?.geoId
      return gid === _geoId && (obj.userData?.type === 'cone' || obj.userData?.type === 'cylinder')
    })
    const allCandidates = [...candidates, ...groupCandidates, ...fallbackGroups]
    if (allCandidates.length === 0) return null

    const hits = this.raycaster.intersectObjects(allCandidates, true)
    for (const hit of hits) {
      let obj: THREE.Object3D = hit.object
      while (obj && !obj.userData?.type && obj.parent) obj = obj.parent
      if (obj.userData?.type === _type && hit.point) {
        return hit.point.clone()
      }
    }

    return null
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

  private clearDraggingIds() {
    this.draggingPointId = null
    this.draggingLineId = null
    this.draggingStraightLineId = null
    this.draggingRayId = null
    this.draggingVectorId = null
    this.draggingCircleId = null
    this.draggingSphereId = null
    this.draggingConeId = null
    this.draggingCylinderId = null
    this.draggingFaceId = null
    this.draggingPerpendicularLineId = null
    this.draggingParallelLineId = null
    this.draggingLabelTarget = null
    this.pendingToggleSelection = null
  }

  private cancelActiveMobileDrag() {
    this.clearDraggingIds()
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
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face',
    geoId: string,
  ) {
    return this.activeLabelTarget?.type === type && this.activeLabelTarget?.geoId === geoId
  }

  private deselectGeometry(
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face',
    geoId: string,
  ) {
    Interaction.deselectByType[type]?.(this.editor, geoId)
  }

  private selectGeometry(
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face',
    geoId: string,
  ) {
    Interaction.selectByType[type]?.(this.editor, geoId)
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

  private isARCoarsePointer() {
    return this.renderer.isARActive() && this.isTouchPreferredDevice()
  }

  private getARPointPickRadiusPx() {
    return this.isARCoarsePointer()
      ? Interaction.AR_TOUCH_POINT_PICK_RADIUS_PX
      : Interaction.AR_MOUSE_POINT_PICK_RADIUS_PX
  }

  private getARLinePickThreshold() {
    return (
      (this.isARCoarsePointer()
        ? Interaction.AR_TOUCH_LINE_PICK_THRESHOLD
        : Interaction.AR_MOUSE_LINE_PICK_THRESHOLD) * this.renderer.getWorldScale()
    )
  }

  private static readonly DEVICE_PARAM_PRESETS = {
    labelHitboxPadding: {
      arTouch: Interaction.LABEL_HITBOX_PADDING_AR_TOUCH_PX,
      arMouse: Interaction.LABEL_HITBOX_PADDING_AR_PX,
      mobile: Interaction.LABEL_HITBOX_PADDING_MOBILE_PX,
      desktop: Interaction.LABEL_HITBOX_PADDING_PX,
    },
    pointLabelSafeZone: {
      arTouch: Interaction.POINT_LABEL_SAFE_ZONE_AR_TOUCH_PX,
      arMouse: Interaction.POINT_LABEL_SAFE_ZONE_AR_PX,
      mobile: Interaction.POINT_LABEL_SAFE_ZONE_PX,
      desktop: Interaction.POINT_LABEL_SAFE_ZONE_PX,
    },
    pointLabelHitboxScale: {
      arTouch: Interaction.POINT_LABEL_HITBOX_SCALE_AR_TOUCH_PX,
      arMouse: Interaction.POINT_LABEL_HITBOX_SCALE_AR_PX,
      mobile: Interaction.POINT_LABEL_HITBOX_SCALE,
      desktop: Interaction.POINT_LABEL_HITBOX_SCALE,
    },
    geometryProtection: {
      arTouch: Interaction.LABEL_GEOMETRY_PROTECTION_AR_TOUCH_PX,
      arMouse: Interaction.LABEL_GEOMETRY_PROTECTION_AR_PX,
      mobile: Interaction.LABEL_GEOMETRY_PROTECTION_MOBILE_PX,
      desktop: Interaction.LABEL_GEOMETRY_PROTECTION_PX,
    },
    labelClosePriority: {
      arTouch: Interaction.LABEL_CLOSE_PRIORITY_AR_TOUCH_PX,
      arMouse: Interaction.LABEL_CLOSE_PRIORITY_AR_PX,
      mobile: Interaction.LABEL_CLOSE_PRIORITY_MOBILE_PX,
      desktop: Interaction.LABEL_CLOSE_PRIORITY_PX,
    },
    geometryCoreHit: {
      arTouch: Interaction.GEOMETRY_CORE_HIT_AR_TOUCH_PX,
      arMouse: Interaction.GEOMETRY_CORE_HIT_AR_PX,
      mobile: Interaction.GEOMETRY_CORE_HIT_MOBILE_PX,
      desktop: Interaction.GEOMETRY_CORE_HIT_PX,
    },
    geometryHardCoreHit: {
      arTouch: Interaction.GEOMETRY_HARD_CORE_HIT_AR_TOUCH_PX,
      arMouse: Interaction.GEOMETRY_HARD_CORE_HIT_AR_PX,
      mobile: Interaction.GEOMETRY_HARD_CORE_HIT_MOBILE_PX,
      desktop: Interaction.GEOMETRY_HARD_CORE_HIT_PX,
    },
  }

  private getDeviceParam(presets: {
    arTouch: number
    arMouse: number
    mobile: number
    desktop: number
  }): number {
    if (this.renderer.isARActive()) {
      return this.isARCoarsePointer() ? presets.arTouch : presets.arMouse
    }
    return this.isTouchPreferredDevice() ? presets.mobile : presets.desktop
  }

  private getLabelHitboxPaddingPx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.labelHitboxPadding)
  }

  private getPointLabelSafeZonePx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.pointLabelSafeZone)
  }

  private getPointLabelHitboxScalePx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.pointLabelHitboxScale)
  }

  private getGeometryProtectionPx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.geometryProtection)
  }

  private getLabelClosePriorityPx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.labelClosePriority)
  }

  private getLabelClosePriorityEffectivePx() {
    return this.getLabelClosePriorityPx() * this.getInteractionZoomScale()
  }

  private getGeometryCoreHitPx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.geometryCoreHit)
  }

  private getGeometryCoreHitEffectivePx() {
    return this.getGeometryCoreHitPx() * this.getInteractionZoomScale()
  }

  private getInteractionZoomScale(): number {
    const zoomFactor = this.renderer.geometrySyncer?.getPointZoomFactor?.() ?? 1
    return Math.max(0.3, Math.min(1, zoomFactor))
  }

  private getGeometryHardCoreHitPx() {
    return this.getDeviceParam(Interaction.DEVICE_PARAM_PRESETS.geometryHardCoreHit)
  }

  private getScreenPointHitRadiusPx(): number {
    return this.getDeviceParam({
      arTouch: Interaction.SCREEN_POINT_HIT_RADIUS_AR_TOUCH_PX,
      arMouse: Interaction.SCREEN_POINT_HIT_RADIUS_AR_MOUSE_PX,
      mobile: Interaction.SCREEN_POINT_HIT_RADIUS_MOBILE_PX,
      desktop: Interaction.SCREEN_POINT_HIT_RADIUS_PX,
    })
  }

  private getScreenLineHitRadiusPx(): number {
    return this.getDeviceParam({
      arTouch: Interaction.SCREEN_LINE_HIT_RADIUS_AR_TOUCH_PX,
      arMouse: Interaction.SCREEN_LINE_HIT_RADIUS_AR_MOUSE_PX,
      mobile: Interaction.SCREEN_LINE_HIT_RADIUS_MOBILE_PX,
      desktop: Interaction.SCREEN_LINE_HIT_RADIUS_PX,
    })
  }

  private getScreenCircleHitRadiusPx(): number {
    return this.getDeviceParam({
      arTouch: Interaction.SCREEN_CIRCLE_HIT_RADIUS_AR_TOUCH_PX,
      arMouse: Interaction.SCREEN_CIRCLE_HIT_RADIUS_AR_MOUSE_PX,
      mobile: Interaction.SCREEN_CIRCLE_HIT_RADIUS_MOBILE_PX,
      desktop: Interaction.SCREEN_CIRCLE_HIT_RADIUS_PX,
    })
  }

  private getScreenPointProtectionRadiusPx(): number {
    return this.getDeviceParam({
      arTouch: Interaction.SCREEN_POINT_PROTECTION_RADIUS_AR_TOUCH_PX,
      arMouse: Interaction.SCREEN_POINT_PROTECTION_RADIUS_AR_MOUSE_PX,
      mobile: Interaction.SCREEN_POINT_PROTECTION_RADIUS_MOBILE_PX,
      desktop: Interaction.SCREEN_POINT_PROTECTION_RADIUS_PX,
    })
  }

  private get isAnyDragging(): boolean {
    return (
      this.draggingPointId !== null ||
      this.draggingLineId !== null ||
      this.draggingStraightLineId !== null ||
      this.draggingRayId !== null ||
      this.draggingVectorId !== null ||
      this.draggingCircleId !== null ||
      this.draggingSphereId !== null ||
      this.draggingConeId !== null ||
      this.draggingFaceId !== null ||
      this.draggingLabelTarget !== null ||
      this.mobileCreatePointerId !== null
    )
  }

  syncControlLockState() {
    if (this.isAnyDragging) {
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
    this.clearDraggingIds()
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

    return bestId ? (this.renderer.geometrySyncer.meshMap.get(bestId) ?? null) : null
  }

  private pickLinearWithThreshold(lineThreshold: number) {
    const previousThreshold = this.raycaster.params.Line?.threshold ?? 0.5
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    this.raycaster.params.Line = { threshold: lineThreshold }
    const lineHits = this.raycaster.intersectObjects(
      [...this.renderer.geometrySyncer.meshMap.values()].filter(
        (obj) =>
          obj.userData?.type === 'line' ||
          obj.userData?.type === 'straightLine' ||
          obj.userData?.type === 'perpendicularLine' ||
          obj.userData?.type === 'parallelLine' ||
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
    return this.renderer.geometrySyncer.meshMap.get(nearest.id) ?? null
  }

  private pickTouchTarget(clientX: number, clientY: number) {
    return this.pickScreenSpace(clientX, clientY)
  }

  private pickIntersectionTarget() {
    this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
    const candidates = [...this.renderer.geometrySyncer.meshMap.values()].filter((obj) => {
      const type = obj.userData?.type
      return (
        type === 'line' ||
        type === 'straightLine' ||
        type === 'perpendicularLine' ||
        type === 'parallelLine' ||
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
        hit.object.userData.type === 'perpendicularLine' ||
        hit.object.userData.type === 'parallelLine' ||
        hit.object.userData.type === 'ray',
    )
    if (linearHit) return linearHit.object

    return hits[0]!.object
  }

  private pickScreenSpace(clientX?: number, clientY?: number): THREE.Object3D | null {
    const rect = this.getPointerClientRect()
    const cx = clientX ?? rect.left + (this.mouse.x + 1) * 0.5 * rect.width
    const cy = clientY ?? rect.top + (1 - this.mouse.y) * 0.5 * rect.height
    const pointer = new THREE.Vector2(cx, cy)
    const camera = this.renderer.getActiveCamera()
    const cameraPos = camera.getWorldPosition(new THREE.Vector3())

    this.renderer.world.updateMatrixWorld(true)

    const isAR = this.renderer.isARActive()
    const pointHitRadius = this.getScreenPointHitRadiusPx()
    const lineHitRadius = this.getScreenLineHitRadiusPx()
    const circleHitRadius = this.getScreenCircleHitRadiusPx()
    const pointProtectionRadius = this.getScreenPointProtectionRadiusPx()

    interface PickCandidate {
      object: THREE.Object3D
      screenDist: number
      depth: number
      type: string
      geoId: string
    }

    const candidates: PickCandidate[] = []

    const pointScreenPositions = new Map<string, THREE.Vector2>()

    for (const [id, point] of this.editor.scene.points) {
      const screenPos = this.projectMathPositionToClient(point.position, rect)
      if (!screenPos) continue
      pointScreenPositions.set(id, screenPos)
      const dist = pointer.distanceTo(screenPos)
      if (dist > pointHitRadius) continue
      const mesh = this.renderer.geometrySyncer.meshMap.get(id)
      if (!mesh) continue
      const worldPos = this.renderer.toMathWorldPosition(
        new THREE.Vector3(point.position.x, point.position.y, point.position.z),
      )
      const depth = cameraPos.distanceTo(worldPos)
      candidates.push({ object: mesh, screenDist: dist, depth, type: 'point', geoId: id })
    }

    const protectedPointIds = new Set<string>()
    for (const [id, screenPos] of pointScreenPositions) {
      if (pointer.distanceTo(screenPos) <= pointProtectionRadius) {
        protectedPointIds.add(id)
      }
    }

    const constrainedPointsOnObject = new Map<string, Set<string>>()
    for (const [, constraint] of this.editor.scene.objectConstrainedPointConstraints) {
      if (protectedPointIds.has(constraint.pointId)) {
        let set = constrainedPointsOnObject.get(constraint.target.id)
        if (!set) {
          set = new Set()
          constrainedPointsOnObject.set(constraint.target.id, set)
        }
        set.add(constraint.pointId)
      }
    }

    const addLinearCandidate = (
      id: string,
      p1Pos: Vec3,
      p2Pos: Vec3,
      type: string,
      endpointIds: string[],
      isConstrainedProtected: boolean,
    ) => {
      const p1Screen = this.projectMathPositionToClient(p1Pos, rect)
      const p2Screen = this.projectMathPositionToClient(p2Pos, rect)
      if (!p1Screen || !p2Screen) return
      const dist = this.distanceToSegment2D(pointer, p1Screen, p2Screen)
      if (dist > lineHitRadius) return
      if (isConstrainedProtected) return
      // 端点接近惩罚：和圆的修复同理，鼠标落在端点 ≤ 4px 时让点赢。
      // 不能用"端点保护"直接 skip 线——线段 8px 命中半径会与点的 14px
      // 命中半径在端点附近大面积重叠，14px 的端点保护会把线段在端点
      // 附近 4-14px 的"线段方向上"位置也屏蔽掉，导致视觉上"鼠标在线
      // 上"却选不到线。4px 是真正的"鼠标就在端点上"范围。
      let endpointPenalty = 0
      for (const pid of endpointIds) {
        const screenPos = pointScreenPositions.get(pid)
        if (screenPos && pointer.distanceTo(screenPos) <= 4) {
          endpointPenalty = 6
          break
        }
      }
      const mesh = this.renderer.geometrySyncer.meshMap.get(id)
      if (!mesh) return
      const midWorld = this.renderer.toMathWorldPosition(
        new THREE.Vector3(
          (p1Pos.x + p2Pos.x) / 2,
          (p1Pos.y + p2Pos.y) / 2,
          (p1Pos.z + p2Pos.z) / 2,
        ),
      )
      const depth = cameraPos.distanceTo(midWorld)
      candidates.push({
        object: mesh,
        screenDist: dist + endpointPenalty,
        depth,
        type,
        geoId: id,
      })
    }

    const isConstrainedProtected = (objectId: string): boolean => {
      const cpSet = constrainedPointsOnObject.get(objectId)
      if (!cpSet) return false
      for (const cpId of cpSet) {
        if (protectedPointIds.has(cpId)) return true
      }
      return false
    }

    const isObjectProtected = (objectId: string, endpointIds: string[]): boolean => {
      if (endpointIds.some((pid) => protectedPointIds.has(pid))) return true
      const cpSet = constrainedPointsOnObject.get(objectId)
      if (cpSet) {
        for (const cpId of cpSet) {
          if (protectedPointIds.has(cpId)) return true
        }
      }
      return false
    }

    for (const [id, line] of this.editor.scene.lines) {
      addLinearCandidate(
        id,
        line.p1.position,
        line.p2.position,
        'line',
        [line.p1.id, line.p2.id],
        isConstrainedProtected(id),
      )
    }

    for (const [id, sl] of this.editor.scene.straightLines) {
      const dp = sl.getDisplayPoints()
      addLinearCandidate(
        id,
        dp.start,
        dp.end,
        'straightLine',
        [sl.p1.id, sl.p2.id],
        isConstrainedProtected(id),
      )
    }

    for (const [id, ray] of this.editor.scene.rays) {
      const endPos = ray.getDisplayEndPoint()
      addLinearCandidate(
        id,
        ray.p1.position,
        endPos,
        'ray',
        [ray.p1.id, ray.p2.id],
        isConstrainedProtected(id),
      )
    }

    for (const [id, vec] of this.editor.scene.vectors) {
      addLinearCandidate(
        id,
        vec.p1.position,
        vec.p2.position,
        'vector',
        [vec.p1.id, vec.p2.id],
        isConstrainedProtected(id),
      )
    }

    for (const [id, pl] of this.editor.scene.perpendicularLines) {
      const dp = pl.getDisplayPoints(this.editor.scene)
      addLinearCandidate(
        id,
        dp.start,
        dp.end,
        'perpendicularLine',
        [pl.p1.id],
        isConstrainedProtected(id),
      )
    }

    for (const [id, pl] of this.editor.scene.parallelLines) {
      const dp = pl.getDisplayPoints(this.editor.scene)
      addLinearCandidate(
        id,
        dp.start,
        dp.end,
        'parallelLine',
        [pl.p1.id],
        isConstrainedProtected(id),
      )
    }

    for (const [id, circle] of this.editor.scene.circles) {
      const frame = circle.getFrame(
        this.editor.resolveDirectionVector(
          circle.directionType ?? 'point',
          circle.directionId ?? '',
        ),
      )
      if (!frame) continue
      const centerScreen = this.projectMathPositionToClient(frame.center, rect)
      if (!centerScreen) continue
      // 沿圆周采样计算"鼠标到圆周最近点的屏幕距离"。
      // 仅用 uAxis 端点算 radiusScreenPx 在平视时会几乎为 0（uAxis 沿视线
      // 被压缩），导致 ringDist = centerDist 错误地把命中范围限制在圆心
      // 附近，恰好不覆盖视觉上的"圆圈线"。采样能正确处理平视、斜视、
      // 透视等所有情况。
      const CIRCLE_SAMPLES = 24
      let minDist = Number.POSITIVE_INFINITY
      let maxRadiusScreen = 0
      for (let i = 0; i < CIRCLE_SAMPLES; i++) {
        const angle = (i / CIRCLE_SAMPLES) * Math.PI * 2
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const samplePoint = new Vec3(
          frame.center.x + (frame.uAxis.x * cos + frame.vAxis.x * sin) * frame.radius,
          frame.center.y + (frame.uAxis.y * cos + frame.vAxis.y * sin) * frame.radius,
          frame.center.z + (frame.uAxis.z * cos + frame.vAxis.z * sin) * frame.radius,
        )
        const sampleScreen = this.projectMathPositionToClient(samplePoint, rect)
        if (!sampleScreen) continue
        const d = pointer.distanceTo(sampleScreen)
        if (d < minDist) minDist = d
        const cd = centerScreen.distanceTo(sampleScreen)
        if (cd > maxRadiusScreen) maxRadiusScreen = cd
      }
      // 动态调整命中半径：小圆（平视）时半径小，避免覆盖中心点；
      // 大圆保持原 circleHitRadius（细线圆需要 8px 容差）。
      const dynamicHitRadius = Math.max(
        2,
        Math.min(circleHitRadius, maxRadiusScreen * 0.3 + 2),
      )
      if (minDist > dynamicHitRadius) continue
      // 圆不应用端点保护：圆是连续曲线，p1/p2/p3 只是定义圆的 3 个
      // 参考点，圆圈线上的任何位置（不只是这 3 个点）都应该是圆的一部分。
      // 鼠标落在圆圈线上时，应优先选中圆；端点 p1/p2/p3 自身有自己的
      // hitbox，candidates 排序时会按屏幕距离自动选出最近的。
      // 只保留 constrained points 的保护（这些是真正被圆约束的其他点）。
      const nearPoint = isObjectProtected(id, [])
      if (nearPoint) continue
      const mesh = this.renderer.geometrySyncer.meshMap.get(id)
      if (!mesh) continue
      const centerWorld = this.renderer.toMathWorldPosition(
        new THREE.Vector3(frame.center.x, frame.center.y, frame.center.z),
      )
      const depth = cameraPos.distanceTo(centerWorld)
      // 端点优先：p1/p2/p3 都在圆周上，鼠标"视觉上落在 p1"时（≤ 4px
      // 接近某个端点），圆和点的 screenDist 几乎相同，tie break 几乎
      // 随机。加一个端点接近惩罚让点自然赢。注意不能用"端点保护"直接
      // 跳过圆——那样圆圈线上的非端点位置也会被误保护（之前的 bug）。
      let endpointPenalty = 0
      const CIRCLE_ENDPOINT_PROTECT_PX = 4
      for (const pid of [circle.p1.id, circle.p2.id, circle.p3.id]) {
        const screenPos = pointScreenPositions.get(pid)
        if (screenPos && pointer.distanceTo(screenPos) <= CIRCLE_ENDPOINT_PROTECT_PX) {
          endpointPenalty = 6
          break
        }
      }
      candidates.push({
        object: mesh,
        screenDist: minDist + endpointPenalty,
        depth,
        type: 'circle',
        geoId: id,
      })
    }

    this.raycaster.setFromCamera(this.mouse, camera)
    if (isAR) {
      const previousThreshold = this.raycaster.params.Line?.threshold ?? 0.5
      this.raycaster.params.Line = { threshold: this.getARLinePickThreshold() }

      const allObjects = [
        ...this.renderer.geometrySyncer.meshMap.values(),
        ...this.renderer.geometrySyncer.groupMap.values(),
      ]
      const hits = this.raycaster.intersectObjects(allObjects, true)
      this.raycaster.params.Line = { threshold: previousThreshold }

      const resolveObject = (obj: THREE.Object3D): THREE.Object3D => {
        if (obj.userData.type) return obj
        if (obj.parent && obj.parent.userData.type) return obj.parent
        return obj
      }

      for (const hit of hits) {
        const resolved = resolveObject(hit.object)
        const type = resolved.userData?.type as string | undefined
        const geoId = resolved.userData?.geoId as string | undefined
        if (!type || !geoId) continue
        const existing = candidates.find((c) => c.geoId === geoId && c.type === type)
        if (existing) continue
        if (type === 'point') {
          if (protectedPointIds.has(geoId)) continue
          const point = this.editor.scene.points.get(geoId)
          const screenPos = point ? this.projectMathPositionToClient(point.position, rect) : null
          const screenDist = screenPos ? pointer.distanceTo(screenPos) : pointHitRadius + 1
          if (screenDist > pointHitRadius) continue
          candidates.push({
            object: resolved,
            screenDist,
            depth: hit.distance,
            type,
            geoId,
          })
        } else if (
          type === 'line' ||
          type === 'straightLine' ||
          type === 'perpendicularLine' ||
          type === 'parallelLine' ||
          type === 'ray' ||
          type === 'vector' ||
          type === 'circle'
        ) {
          const nearPoint = this.isLinearNearProtectedPoint(
            type,
            geoId,
            protectedPointIds,
            constrainedPointsOnObject,
          )
          if (nearPoint) continue
          candidates.push({
            object: resolved,
            screenDist: 0,
            depth: hit.distance,
            type,
            geoId,
          })
        } else if (type === 'face') {
          const face = this.editor.scene.faces.get(geoId)
          if (face && isObjectProtected(geoId, face.memberPointIds)) continue
          candidates.push({
            object: resolved,
            screenDist: 0,
            depth: hit.distance,
            type,
            geoId,
          })
        } else {
          candidates.push({
            object: resolved,
            screenDist: 0,
            depth: hit.distance,
            type,
            geoId,
          })
        }
      }
    } else {
      const faceCandidates = [...this.renderer.geometrySyncer.meshMap.values()].filter(
        (obj) => obj.userData?.type === 'face',
      )
      const faceHits = this.raycaster.intersectObjects(faceCandidates)
      for (const hit of faceHits) {
        const obj = hit.object
        const type = obj.userData?.type as string | undefined
        const geoId = obj.userData?.geoId as string | undefined
        if (!type || !geoId) continue
        const face = this.editor.scene.faces.get(geoId)
        if (face && isObjectProtected(geoId, face.memberPointIds)) continue
        candidates.push({
          object: obj,
          screenDist: 0,
          depth: hit.distance + cameraPos.length(),
          type,
          geoId,
        })
      }

      const sphereCandidates = [...this.renderer.geometrySyncer.meshMap.values()].filter(
        (obj) => obj.userData?.type === 'sphere',
      )
      const sphereHits = this.raycaster.intersectObjects(sphereCandidates)
      for (const hit of sphereHits) {
        const obj = hit.object
        const geoId = obj.userData?.geoId as string | undefined
        if (!geoId) continue
        const sphere = this.editor.scene.spheres.get(geoId)
        if (sphere && isObjectProtected(geoId, [sphere.centerPoint.id])) continue
        candidates.push({
          object: obj,
          screenDist: 0,
          depth: hit.distance + cameraPos.length(),
          type: 'sphere',
          geoId,
        })
      }

      const coneCandidates = [...this.renderer.geometrySyncer.groupMap.values()].filter(
        (obj) => obj.userData?.type === 'cone',
      )
      const coneHits = this.raycaster.intersectObjects(coneCandidates, true)
      for (const hit of coneHits) {
        let obj: THREE.Object3D = hit.object
        if (!obj.userData?.type && obj.parent?.userData?.type) obj = obj.parent
        const rawType = obj.userData?.type as string | undefined
        const geoId = obj.userData?.geoId as string | undefined
        if (!rawType || !geoId) continue
        const cone = this.editor.scene.cones.get(geoId)
        if (cone && isObjectProtected(geoId, [cone.baseCenterPoint.id, cone.apexPoint.id])) continue
        if (rawType === 'coneBase' && this.editor.mode === EditorMode.CreatePerpendicularLine) {
          candidates.push({
            object: obj,
            screenDist: 0,
            depth: hit.distance + cameraPos.length(),
            type: 'coneBase',
            geoId,
          })
        } else {
          candidates.push({
            object: obj,
            screenDist: 0,
            depth: hit.distance + cameraPos.length(),
            type: rawType === 'coneBase' ? 'cone' : rawType,
            geoId,
          })
        }
      }

      const cylinderCandidates = [...this.renderer.geometrySyncer.groupMap.values()].filter(
        (obj) => obj.userData?.type === 'cylinder',
      )
      const cylinderHits = this.raycaster.intersectObjects(cylinderCandidates, true)
      for (const hit of cylinderHits) {
        let obj: THREE.Object3D = hit.object
        if (!obj.userData?.type && obj.parent?.userData?.type) obj = obj.parent
        const rawType = obj.userData?.type as string | undefined
        const geoId = obj.userData?.geoId as string | undefined
        if (!rawType || !geoId) continue
        const cylinder = this.editor.scene.cylinders.get(geoId)
        if (
          cylinder &&
          isObjectProtected(geoId, [cylinder.bottomCenterPoint.id, cylinder.topCenterPoint.id])
        )
          continue
        if (
          (rawType === 'cylinderBottom' || rawType === 'cylinderTop') &&
          this.editor.mode === EditorMode.CreatePerpendicularLine
        ) {
          candidates.push({
            object: obj,
            screenDist: 0,
            depth: hit.distance + cameraPos.length(),
            type: rawType,
            geoId,
          })
        } else {
          candidates.push({
            object: obj,
            screenDist: 0,
            depth: hit.distance + cameraPos.length(),
            type: rawType === 'cylinderBottom' || rawType === 'cylinderTop' ? 'cylinder' : rawType,
            geoId,
          })
        }
      }
    }

    if (candidates.length === 0) return null

    const getPointPriority = (geoId: string): number => {
      const point = this.editor.scene.points.get(geoId)
      if (!point) return 0
      if (point.isConstrainedPoint) return 3
      if (point.id === Scene.ORIGIN_ID) return 2
      return 1
    }

    candidates.sort((a, b) => {
      const screenDiff = a.screenDist - b.screenDist
      if (Math.abs(screenDiff) > Interaction.SCREEN_TIE_BREAK_PX) return screenDiff
      if (a.type === 'point' && b.type === 'point') {
        const priorityDiff = getPointPriority(b.geoId) - getPointPriority(a.geoId)
        if (priorityDiff !== 0) return priorityDiff
      }
      return a.depth - b.depth
    })

    return candidates[0]!.object
  }

  private isLinearNearProtectedPoint(
    type: string,
    geoId: string,
    protectedPointIds: Set<string>,
    constrainedPointsOnObject?: Map<string, Set<string>>,
  ): boolean {
    const checkEndpoints = (endpointIds: string[]): boolean => {
      if (endpointIds.some((pid) => protectedPointIds.has(pid))) return true
      if (constrainedPointsOnObject) {
        const cpSet = constrainedPointsOnObject.get(geoId)
        if (cpSet) {
          for (const cpId of cpSet) {
            if (protectedPointIds.has(cpId)) return true
          }
        }
      }
      return false
    }
    if (type === 'line') {
      const line = this.editor.scene.lines.get(geoId)
      return line ? checkEndpoints([line.p1.id, line.p2.id]) : false
    }
    if (type === 'straightLine') {
      const sl = this.editor.scene.straightLines.get(geoId)
      return sl ? checkEndpoints([sl.p1.id, sl.p2.id]) : false
    }
    if (type === 'perpendicularLine') {
      const pl = this.editor.scene.perpendicularLines.get(geoId)
      return pl ? checkEndpoints([pl.p1.id, pl.p2.id]) : false
    }
    if (type === 'parallelLine') {
      const pl = this.editor.scene.parallelLines.get(geoId)
      return pl ? checkEndpoints([pl.p1.id, pl.p2.id]) : false
    }
    if (type === 'ray') {
      const ray = this.editor.scene.rays.get(geoId)
      return ray ? checkEndpoints([ray.p1.id, ray.p2.id]) : false
    }
    if (type === 'vector') {
      const vec = this.editor.scene.vectors.get(geoId)
      return vec ? checkEndpoints([vec.p1.id, vec.p2.id]) : false
    }
    if (type === 'circle') {
      const circle = this.editor.scene.circles.get(geoId)
      return circle ? checkEndpoints([circle.p1.id, circle.p2.id, circle.p3.id]) : false
    }
    return false
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
    const frame = circle.getFrame(
      this.editor.resolveDirectionVector(circle.directionType ?? 'point', circle.directionId ?? ''),
    )
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(sphere.centerPoint.id)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingConeId) {
      const cone = this.editor.scene.cones.get(this.draggingConeId)
      if (!cone) return
      if (this.editor.isConeGeometryLocked(cone)) return

      this.handleDrag(
        cone.baseCenterPoint.position,
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
          toMove.add(cone.baseCenterPoint.id)
          toMove.add(cone.apexPoint.id)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingCylinderId) {
      const cylinder = this.editor.scene.cylinders.get(this.draggingCylinderId)
      if (!cylinder) return
      if (this.editor.isCylinderGeometryLocked(cylinder)) return

      this.handleDrag(
        cylinder.bottomCenterPoint.position,
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
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
            }
          })
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
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
          toMove.add(cylinder.bottomCenterPoint.id)
          toMove.add(cylinder.topCenterPoint.id)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingPerpendicularLineId) {
      const pl = this.editor.scene.perpendicularLines.get(this.draggingPerpendicularLineId)
      if (!pl) return
      if (pl.userLocked || this.editor.isPointCoordinateLocked(pl.p1)) return

      this.handleDrag(
        pl.p1.position,
        (delta) => {
          const toMove = new Set<string>()
          selection.perpendicularLines.forEach((plid) => {
            const pLine = this.editor.scene.perpendicularLines.get(plid)
            if (pLine && !pLine.userLocked && !this.editor.isPointCoordinateLocked(pLine.p1)) {
              toMove.add(pLine.p1.id)
            }
          })
          selection.lines.forEach((lid) => {
            const l = this.editor.scene.lines.get(lid)
            if (l && !this.editor.isLineGeometryLocked(l)) {
              toMove.add(l.p1.id)
              toMove.add(l.p2.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(pl.p1.id)
          this.previewMovePoints([...toMove], delta)
        },
        isAltPressed,
      )
      return
    }

    if (this.draggingParallelLineId) {
      const pl = this.editor.scene.parallelLines.get(this.draggingParallelLineId)
      if (!pl) return
      if (pl.userLocked || this.editor.isPointCoordinateLocked(pl.p1)) return

      this.handleDrag(
        pl.p1.position,
        (delta) => {
          const toMove = new Set<string>()
          selection.parallelLines.forEach((plid) => {
            const pLine = this.editor.scene.parallelLines.get(plid)
            if (pLine && !pLine.userLocked && !this.editor.isPointCoordinateLocked(pLine.p1)) {
              toMove.add(pLine.p1.id)
            }
          })
          selection.lines.forEach((lid) => {
            const l = this.editor.scene.lines.get(lid)
            if (l && !this.editor.isLineGeometryLocked(l)) {
              toMove.add(l.p1.id)
              toMove.add(l.p2.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
            }
          })
          this.addSelectedFacePoints(toMove)
          selection.points.forEach((id) => toMove.add(id))
          toMove.add(pl.p1.id)
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
          selection.cones.forEach((cid) => {
            const c = this.editor.scene.cones.get(cid)
            if (c && !this.editor.isConeGeometryLocked(c)) {
              toMove.add(c.baseCenterPoint.id)
              toMove.add(c.apexPoint.id)
            }
          })
          selection.cylinders.forEach((cid) => {
            const c = this.editor.scene.cylinders.get(cid)
            if (c && !this.editor.isCylinderGeometryLocked(c)) {
              toMove.add(c.bottomCenterPoint.id)
              toMove.add(c.topCenterPoint.id)
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
        this.editor.mode === EditorMode.CreateCone ||
        this.editor.mode === EditorMode.CreateCylinder ||
        this.editor.mode === EditorMode.CreatePerpendicularLine ||
        this.editor.mode === EditorMode.IntersectionPoint)
    ) {
      return
    }

    if (this.editor.mode === EditorMode.CreatePoint) {
      const constrainedHit = this.pickConstrainedTarget()
      if (constrainedHit) {
        const constrainedResult = this.tryCreateConstrainedPointFromHit(constrainedHit)
        if (constrainedResult) return
      }
      this.renderer.controls.enabled = false
      this.commitCurrentCreatePoint(this.editor.isSnappingEnabled && !e.altKey)
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
        Interaction.deleteByType[type]?.(this.editor, geoId)
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
                this.startDrag(
                  new THREE.Vector3(
                    sphere.centerPoint.position.x,
                    sphere.centerPoint.position.y,
                    sphere.centerPoint.position.z,
                  ),
                )
              } else {
                this.draggingPointId = null
              }
            } else if (p.coneId && (p.coneRole === 'baseCenter' || p.coneRole === 'apex')) {
              if (this.editor.isConeGeometryLocked(this.editor.scene.cones.get(p.coneId)!)) {
                this.draggingPointId = null
              } else {
                this.draggingPointId = geoId
                this.startDrag(p.position)
              }
            } else if (
              p.cylinderId &&
              (p.cylinderRole === 'bottomCenter' || p.cylinderRole === 'topCenter')
            ) {
              if (
                this.editor.isCylinderGeometryLocked(this.editor.scene.cylinders.get(p.cylinderId)!)
              ) {
                this.draggingPointId = null
              } else {
                this.draggingPointId = geoId
                this.startDrag(p.position)
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
        } else if (type === 'perpendicularLine') {
          const alreadySelected = this.editor.scene.selection.perpendicularLines.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectPerpendicularLine(geoId, true)
          this.editor.scene.markAllRenderDirty()
          const pl = this.editor.scene.perpendicularLines.get(geoId)
          if (pl) {
            if (pl.userLocked || this.editor.isPointCoordinateLocked(pl.p1)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingPerpendicularLineId = geoId
              const mid = pl.getMidPoint()
              this.startDrag(new THREE.Vector3(mid.x, mid.y, mid.z))
            }
          }
        } else if (type === 'parallelLine') {
          const alreadySelected = this.editor.scene.selection.parallelLines.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectParallelLine(geoId, true)
          this.editor.scene.markAllRenderDirty()
          const pl = this.editor.scene.parallelLines.get(geoId)
          if (pl) {
            if (pl.userLocked || this.editor.isPointCoordinateLocked(pl.p1)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingParallelLineId = geoId
              const mid = pl.getMidPoint()
              this.startDrag(new THREE.Vector3(mid.x, mid.y, mid.z))
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
              this.startDrag(
                new THREE.Vector3(
                  sphere.centerPoint.position.x,
                  sphere.centerPoint.position.y,
                  sphere.centerPoint.position.z,
                ),
              )
            }
          }
        } else if (type === 'cone') {
          const alreadySelected = this.editor.scene.selection.cones.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectCone(geoId, true)
          this.editor.scene.markAllRenderDirty()
          const cone = this.editor.scene.cones.get(geoId)
          if (cone) {
            if (this.editor.isConeGeometryLocked(cone)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingConeId = geoId
              this.startDrag(
                new THREE.Vector3(
                  cone.baseCenterPoint.position.x,
                  cone.baseCenterPoint.position.y,
                  cone.baseCenterPoint.position.z,
                ),
              )
            }
          }
        } else if (type === 'cylinder') {
          const alreadySelected = this.editor.scene.selection.cylinders.has(geoId)
          this.pendingToggleSelection = alreadySelected ? { type, geoId } : null
          this.editor.scene.selection.selectCylinder(geoId, true)
          this.editor.scene.markAllRenderDirty()
          const cylinder = this.editor.scene.cylinders.get(geoId)
          if (cylinder) {
            if (this.editor.isCylinderGeometryLocked(cylinder)) {
              this.renderer.renderer.domElement.style.cursor = 'default'
            } else {
              this.draggingCylinderId = geoId
              this.startDrag(
                new THREE.Vector3(
                  cylinder.bottomCenterPoint.position.x,
                  cylinder.bottomCenterPoint.position.y,
                  cylinder.bottomCenterPoint.position.z,
                ),
              )
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
          } else if (
            type === 'line' ||
            type === 'straightLine' ||
            type === 'ray' ||
            type === 'vector'
          ) {
            this.normalCircleDirectionType = type as DirectionType
            this.normalCircleDirectionId = geoId
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      } else if (this.editor.mode === EditorMode.CreateCone && type === 'point') {
        if (this.coneNormalCircleId) {
          const normalCircle = this.editor.scene.circles.get(this.coneNormalCircleId)
          const apexPoint = this.editor.scene.points.get(geoId)
          if (normalCircle && apexPoint) {
            this.editor.tryCreateConeNormalCircle(normalCircle, apexPoint)
          }
          this.coneNormalCircleId = null
        } else if (!this.coneBaseCenterPointId) {
          this.coneBaseCenterPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.coneBaseCenterPointId) {
          if (this.coneBaseCenterPointId !== geoId) {
            this.editor.scene.selection.selectPoint(geoId, true)
            const baseCenterPoint = this.editor.scene.points.get(this.coneBaseCenterPointId)
            const apexPoint = this.editor.scene.points.get(geoId)
            if (baseCenterPoint && apexPoint) {
              window.dispatchEvent(
                new CustomEvent('show-cone-radius-dialog', {
                  detail: { baseCenterPointId: this.coneBaseCenterPointId, apexPointId: geoId },
                }),
              )
            }
          }
        }
      } else if (this.editor.mode === EditorMode.CreateCone && type === 'circle') {
        const circle = this.editor.scene.circles.get(geoId)
        if (circle && circle.isNormalCircle()) {
          this.coneNormalCircleId = geoId
          this.coneBaseCenterPointId = null
          this.editor.scene.selection.selectCircle(geoId, true)
        }
      } else if (this.editor.mode === EditorMode.CreateCylinder && type === 'point') {
        if (!this.cylinderBottomCenterPointId) {
          this.cylinderBottomCenterPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.cylinderBottomCenterPointId && this.cylinderBottomCenterPointId !== geoId) {
          this.editor.scene.selection.selectPoint(geoId, true)
          const bottomCenterPoint = this.editor.scene.points.get(this.cylinderBottomCenterPointId)
          const topCenterPoint = this.editor.scene.points.get(geoId)
          if (bottomCenterPoint && topCenterPoint) {
            window.dispatchEvent(
              new CustomEvent('show-cylinder-radius-dialog', {
                detail: {
                  bottomCenterPointId: this.cylinderBottomCenterPointId,
                  topCenterPointId: geoId,
                },
              }),
            )
          }
        }
      } else if (this.editor.mode === EditorMode.MergePoint && type === 'point') {
        this.toggleCreateSelection('point', geoId)
      } else if (
        this.editor.mode === EditorMode.IntersectionPoint &&
        isIntersectionTargetType(type)
      ) {
        this.editor.toggleIntersectionSelection(type, geoId)
      } else if (this.editor.mode === EditorMode.CreatePerpendicularLine) {
        if (type === 'point') {
          this.editor.tryCreatePerpendicularLineWith(this.editor.scene.points.get(geoId)!)
        } else if (
          type === 'line' ||
          type === 'straightLine' ||
          type === 'ray' ||
          type === 'vector' ||
          type === 'perpendicularLine' ||
          type === 'parallelLine' ||
          type === 'face' ||
          type === 'coneBase' ||
          type === 'cylinderBottom' ||
          type === 'cylinderTop'
        ) {
          this.editor.togglePerpendicularLineSelection(type, geoId)
        }
      } else if (this.editor.mode === EditorMode.CreateParallelLine) {
        if (type === 'point') {
          this.editor.tryCreateParallelLineWith(this.editor.scene.points.get(geoId)!)
        } else if (
          type === 'line' ||
          type === 'straightLine' ||
          type === 'ray' ||
          type === 'vector' ||
          type === 'perpendicularLine' ||
          type === 'parallelLine'
        ) {
          this.editor.toggleParallelLineSelection(type, geoId)
        }
      }
    } else {
      if (this.renderer.isARActive() && this.editor.mode === EditorMode.Select) {
        this.arMouseRotationCandidate = true
        this.arMouseRotationCandidateStartClient.set(e.clientX, e.clientY)
        return
      }
      if (this.editor.mode === EditorMode.Select) {
        this.editor.scene.selection.clear()
        this.editor.scene.markAllRenderDirty()
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
      } else if (this.editor.mode === EditorMode.CreateCone) {
        this.resetConeCreation()
      } else if (this.editor.mode === EditorMode.CreateCylinder) {
        this.resetCylinderCreation()
      } else if (this.editor.mode === EditorMode.CreateCircleNormal) {
        this.resetNormalCircleCreation()
      } else if (this.editor.mode === EditorMode.IntersectionPoint)
        this.editor.clearIntersectionSelection()
      else if (this.editor.mode === EditorMode.CreatePerpendicularLine)
        this.editor.clearPerpendicularLineSelection()
      else if (this.editor.mode === EditorMode.CreateParallelLine)
        this.editor.clearParallelLineSelection()
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
      this.arMouseRotationCandidateStartClient.distanceTo(
        new THREE.Vector2(e.clientX, e.clientY),
      ) >= Interaction.MOBILE_TAP_MOVE_THRESHOLD
    ) {
      if (this.beginARSceneRotation(null, e.clientX, e.clientY)) {
        this.resetARMouseRotationCandidate()
        return
      }
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
        this.editor.mode === EditorMode.CreateCone ||
        this.editor.mode === EditorMode.CreateCylinder ||
        this.editor.mode === EditorMode.CreatePerpendicularLine ||
        this.editor.mode === EditorMode.IntersectionPoint)
    ) {
      this.rubberBandData = null
      return
    }

    // --- 处理创建点模式下的辅助线预览 ---
    if (this.editor.mode === EditorMode.CreatePoint) {
      this.updateCreatePointDraftFromPointer(this.editor.isSnappingEnabled && !e.altKey)
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

      this.raycaster.setFromCamera(this.mouse, this.renderer.getActiveCamera())
      const fromWorld = this.renderer.toMathWorldPosition(from.clone())
      const cameraDir = this.renderer.getActiveCameraWorldDirection()
      const rubberBandPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(cameraDir, fromWorld)
      const rubberBandHit = new THREE.Vector3()
      let to: THREE.Vector3
      if (this.raycaster.ray.intersectPlane(rubberBandPlane, rubberBandHit)) {
        to = this.renderer.toMathLocalPosition(rubberBandHit)
      } else {
        const fallbackDist = this.renderer.getActiveCameraWorldPosition().distanceTo(fromWorld)
        to = this.renderer.toMathLocalPosition(
          this.raycaster.ray.at(fallbackDist, new THREE.Vector3()),
        )
      }

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
        this.editor.scene.markAllRenderDirty()
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
      this.draggingConeId = null
      this.draggingCylinderId = null
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
    if (this.editor.mode === EditorMode.CreatePoint) {
      e.preventDefault()
      this.updatePointerPosition(e.clientX, e.clientY)
      this.adjustCreatePointDraftDepth(
        e.deltaY,
        this.editor.isSnappingEnabled && !e.altKey,
        e.shiftKey,
      )
      return
    }
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

      this.updatePointerPosition(e.clientX, e.clientY)

      const touchTarget = this.pickConstrainedTarget()
      if (touchTarget) {
        const constrainedResult = this.tryCreateConstrainedPointFromHit(touchTarget)
        if (constrainedResult) return
      }

      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)

      this.renderer.controls.enabled = false

      this.mobileCreatePointerId = e.pointerId
      this.mobileCreateHadPreviewAtPointerDown = false
      this.mobileCreateMoved = false
      this.mobileCreateStartClient.set(e.clientX, e.clientY)

      this.updateCreatePointDraftFromPointer(this.editor.isSnappingEnabled)
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
      if (this.editor.mode === EditorMode.CreateCone) {
        e.preventDefault()
        e.stopPropagation()
        this.resetConeCreation()
        this.resetMobileInteractionState()
        return
      }
      if (this.editor.mode === EditorMode.CreateCylinder) {
        e.preventDefault()
        e.stopPropagation()
        this.resetCylinderCreation()
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
      Interaction.deleteByType[type]?.(this.editor, geoId)
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
        } else if (
          type === 'line' ||
          type === 'straightLine' ||
          type === 'ray' ||
          type === 'vector'
        ) {
          this.normalCircleDirectionType = type as DirectionType
          this.normalCircleDirectionId = geoId
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    if (this.editor.mode === EditorMode.CreateCone) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') {
        if (!this.coneBaseCenterPointId && !this.coneNormalCircleId) {
          this.coneBaseCenterPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (
          this.coneBaseCenterPointId &&
          !this.coneNormalCircleId &&
          this.coneBaseCenterPointId !== geoId
        ) {
          this.editor.scene.selection.selectPoint(geoId, true)
          const baseCenterPoint = this.editor.scene.points.get(this.coneBaseCenterPointId)
          const apexPoint = this.editor.scene.points.get(geoId)
          if (baseCenterPoint && apexPoint) {
            window.dispatchEvent(
              new CustomEvent('show-cone-radius-dialog', {
                detail: { baseCenterPointId: this.coneBaseCenterPointId, apexPointId: geoId },
              }),
            )
          }
        } else if (this.coneNormalCircleId && type === 'point') {
          const normalCircle = this.editor.scene.circles.get(this.coneNormalCircleId)
          const apexPoint = this.editor.scene.points.get(geoId)
          if (normalCircle && apexPoint) {
            this.editor.tryCreateConeNormalCircle(normalCircle, apexPoint)
          }
          this.coneNormalCircleId = null
        }
      } else if (type === 'circle') {
        const circle = this.editor.scene.circles.get(geoId)
        if (circle && circle.isNormalCircle()) {
          this.coneNormalCircleId = geoId
          this.coneBaseCenterPointId = null
          this.editor.scene.selection.selectCircle(geoId, true)
        }
      }
      this.resetMobileInteractionState()
      return
    }

    if (this.editor.mode === EditorMode.CreateCylinder) {
      e.preventDefault()
      e.stopPropagation()
      if (type === 'point') {
        if (!this.cylinderBottomCenterPointId) {
          this.cylinderBottomCenterPointId = geoId
          this.editor.scene.selection.selectPoint(geoId, true)
        } else if (this.cylinderBottomCenterPointId && this.cylinderBottomCenterPointId !== geoId) {
          this.editor.scene.selection.selectPoint(geoId, true)
          const bottomCenterPoint = this.editor.scene.points.get(this.cylinderBottomCenterPointId)
          const topCenterPoint = this.editor.scene.points.get(geoId)
          if (bottomCenterPoint && topCenterPoint) {
            window.dispatchEvent(
              new CustomEvent('show-cylinder-radius-dialog', {
                detail: {
                  bottomCenterPointId: this.cylinderBottomCenterPointId,
                  topCenterPointId: geoId,
                },
              }),
            )
          }
        }
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
          this.startDrag(
            new THREE.Vector3(
              sphere.centerPoint.position.x,
              sphere.centerPoint.position.y,
              sphere.centerPoint.position.z,
            ),
          )
        } else {
          this.syncControlLockState()
          this.renderer.renderer.domElement.style.cursor = 'default'
        }
      } else if (point.coneId && (point.coneRole === 'baseCenter' || point.coneRole === 'apex')) {
        if (this.editor.isConeGeometryLocked(this.editor.scene.cones.get(point.coneId)!)) {
          this.draggingPointId = null
          this.syncControlLockState()
          this.renderer.renderer.domElement.style.cursor = 'default'
        } else {
          this.draggingPointId = geoId
          this.startDrag(point.position)
        }
      } else if (
        point.cylinderId &&
        (point.cylinderRole === 'bottomCenter' || point.cylinderRole === 'topCenter')
      ) {
        if (
          this.editor.isCylinderGeometryLocked(this.editor.scene.cylinders.get(point.cylinderId)!)
        ) {
          this.draggingPointId = null
          this.syncControlLockState()
          this.renderer.renderer.domElement.style.cursor = 'default'
        } else {
          this.draggingPointId = geoId
          this.startDrag(point.position)
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

    if (type === 'perpendicularLine') {
      const alreadySelected = this.editor.scene.selection.perpendicularLines.has(geoId)
      this.editor.scene.selection.selectPerpendicularLine(geoId, true)
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
      const pl = this.editor.scene.perpendicularLines.get(geoId)
      if (!pl) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingPerpendicularLineId = geoId
      const mid = pl.getMidPoint()
      this.startDrag(new THREE.Vector3(mid.x, mid.y, mid.z))
      return
    }

    if (type === 'parallelLine') {
      const alreadySelected = this.editor.scene.selection.parallelLines.has(geoId)
      this.editor.scene.selection.selectParallelLine(geoId, true)
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
      const pl = this.editor.scene.parallelLines.get(geoId)
      if (!pl) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingParallelLineId = geoId
      const mid = pl.getMidPoint()
      this.startDrag(new THREE.Vector3(mid.x, mid.y, mid.z))
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
      this.startDrag(
        new THREE.Vector3(
          sphere.centerPoint.position.x,
          sphere.centerPoint.position.y,
          sphere.centerPoint.position.z,
        ),
      )
      return
    }

    if (type === 'cone') {
      const alreadySelected = this.editor.scene.selection.cones.has(geoId)
      this.editor.scene.selection.selectCone(geoId, true)
      this.editor.scene.markAllRenderDirty()
      const cone = this.editor.scene.cones.get(geoId)
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
      if (!cone || this.editor.isConeGeometryLocked(cone)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingConeId = geoId
      this.startDrag(
        new THREE.Vector3(
          cone.baseCenterPoint.position.x,
          cone.baseCenterPoint.position.y,
          cone.baseCenterPoint.position.z,
        ),
      )
      return
    }

    if (type === 'cylinder') {
      const alreadySelected = this.editor.scene.selection.cylinders.has(geoId)
      this.editor.scene.selection.selectCylinder(geoId, true)
      this.editor.scene.markAllRenderDirty()
      const cylinder = this.editor.scene.cylinders.get(geoId)
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
      if (!cylinder || this.editor.isCylinderGeometryLocked(cylinder)) {
        this.syncControlLockState()
        this.renderer.renderer.domElement.style.cursor = 'default'
        return
      }
      this.draggingCylinderId = geoId
      this.startDrag(
        new THREE.Vector3(
          cylinder.bottomCenterPoint.position.x,
          cylinder.bottomCenterPoint.position.y,
          cylinder.bottomCenterPoint.position.z,
        ),
      )
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
      !this.draggingConeId &&
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

      this.updateCreatePointDraftFromPointer(this.editor.isSnappingEnabled)
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
      !this.draggingConeId &&
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

      const shouldConfirm = !this.mobileCreateMoved

      this.resetMobileCreatePointerState()
      this.syncControlLockState()

      if (shouldConfirm) {
        this.commitCurrentCreatePoint(this.editor.isSnappingEnabled)
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
      this.draggingConeId !== null ||
      this.draggingFaceId !== null ||
      this.draggingPerpendicularLineId !== null ||
      this.draggingParallelLineId !== null ||
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
        this.draggingConeId = null
        this.draggingCylinderId = null
        this.draggingFaceId = null
        this.draggingPerpendicularLineId = null
        this.draggingParallelLineId = null
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
      this.editor.scene.markAllRenderDirty()
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

  pick(): THREE.Object3D | null {
    return this.pickScreenSpace()
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
          constraintType: 'cube' as const,
          constraintId: c.cubeId,
          getVAxisHint: c.getVAxisHint.bind(c),
          before: c.getVAxisHint().clone(),
        })),
        ...this.editor.getRegularPolygonConstraints().map((c) => ({
          constraintType: 'regularPolygon' as const,
          constraintId: c.constraintId,
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

    this.editor.scene.solveDirtyConstraints()
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

    const axisHintChanges =
      this.dragStartAxisHints
        ?.map((entry) => ({
          constraintType: entry.constraintType,
          constraintId: entry.constraintId,
          before: entry.before,
          after: entry.getVAxisHint().clone(),
        }))
        .filter((change) => {
          const b = change.before
          const a = change.after
          return (
            Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.z - b.z) > 1e-6
          )
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

  resetConeCreation() {
    this.coneBaseCenterPointId = null
    this.coneNormalCircleId = null
    this.editor.scene.selection.clear()
  }

  confirmConeRadius(baseCenterPointId: string, apexPointId: string, radius: number) {
    const baseCenterPoint = this.editor.scene.points.get(baseCenterPointId)
    const apexPoint = this.editor.scene.points.get(apexPointId)
    if (!baseCenterPoint || !apexPoint) return
    this.coneBaseCenterPointId = null
    this.editor.tryCreateConeTwoPoint(baseCenterPoint, apexPoint, radius)
  }

  cancelConeCreation() {
    this.resetConeCreation()
  }

  resetCylinderCreation() {
    this.cylinderBottomCenterPointId = null
    this.editor.scene.selection.clear()
  }

  confirmCylinderRadius(bottomCenterPointId: string, topCenterPointId: string, radius: number) {
    const bottomCenterPoint = this.editor.scene.points.get(bottomCenterPointId)
    const topCenterPoint = this.editor.scene.points.get(topCenterPointId)
    if (!bottomCenterPoint || !topCenterPoint) return
    this.cylinderBottomCenterPointId = null
    this.editor.tryCreateCylinderTwoPoint(bottomCenterPoint, topCenterPoint, radius)
  }

  cancelCylinderCreation() {
    this.resetCylinderCreation()
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
    if (
      !this.normalCircleCenterPointId ||
      !this.normalCircleDirectionType ||
      !this.normalCircleDirectionId
    )
      return
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
    this.createPointDraft = null
    this.resetMobileCreatePointerState()
    this.clearActiveLabelTarget()
    this.clearActivePointValueTarget()
    this.syncControlLockState()
    this.renderer.hideAxisGuides()
    this.regularPolygonFirstPointId = null
    this.sphereTwoPointsFirstPointId = null
    this.cylinderBottomCenterPointId = null
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
      this.draggingConeId !== null ||
      this.draggingCylinderId !== null ||
      this.draggingFaceId !== null ||
      this.draggingPerpendicularLineId !== null ||
      this.draggingParallelLineId !== null ||
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

      this.editor.scene.objectConstrainedPointConstraints.forEach((constraint) => {
        if (!constraint.pointId) return
        const depIds = constraint.getDependencyPointIds?.()
        if (!depIds) return

        const linkedIds = new Set<string>([constraint.pointId, ...depIds])
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

  private clampLabelOffset(value: number, zoomFactor: number, baseOffset: number = 0) {
    // The data-layer geometry.labelOffset is added on top of baseOffset and
    // multiplied by zoomFactor when rendered:
    //   screenPixels = (baseOffset + labelOffset) * zoomFactor
    // We want the SCREEN-PIXEL drag range to be ±LABEL_DRAG_LIMIT * zoomFactor
    // about the geometry, regardless of the label's default position. This
    // means:
    //   (baseOffset + labelOffset) * zoomFactor ∈ [-L, +L] * zoomFactor
    //   baseOffset + labelOffset ∈ [-L, +L]
    //   labelOffset ∈ [-baseOffset - L, -baseOffset + L]
    // This is symmetric in DATA-LAYER space, so when the user pulls the label
    // to the upper bound the rendered screen offset is exactly +L*zoomFactor,
    // and the lower bound is exactly -L*zoomFactor, with the geometry in the
    // middle. The label's default position does not bias the range.
    const limit = ThreeRenderer.LABEL_DRAG_LIMIT
    return Math.max(-baseOffset - limit, Math.min(-baseOffset + limit, value))
  }

  private getLabelBaseOffsets(
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face',
  ): { x: number; y: number } {
    // The renderer composes the on-screen label offset as
    //   screenPixels = (baseOffset + geometry.labelOffset) * zoomFactor
    // and the sprite's center is (0.5, 0.5), so the visual center equals
    // `label.position` (no extra sprite-center shift).
    // To keep the visual center in ±LABEL_DRAG_LIMIT * zoomFactor about the
    // geometry, we need labelOffset ∈ [-baseOffset - LIMIT, -baseOffset + LIMIT].
    if (type === 'point') {
      return { x: 3, y: 3 }
    }
    return { x: 0, y: 0 }
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

  private distanceToSegment2D(point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) {
    const ab = b.clone().sub(a)
    const lengthSq = ab.lengthSq()
    if (lengthSq === 0) return point.distanceTo(a)
    const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / lengthSq, 0, 1)
    return point.distanceTo(a.clone().add(ab.multiplyScalar(t)))
  }

  private getGeometryScreenDistance(
    object: THREE.Object3D | null,
    clientX: number,
    clientY: number,
    rect: DOMRect,
  ) {
    if (!object) return Number.POSITIVE_INFINITY
    const pointer = new THREE.Vector2(clientX, clientY)
    const type = object.userData?.type as string | undefined
    const geoId = object.userData?.geoId as string | undefined

    if (type === 'point' && geoId) {
      const point = this.editor.scene.points.get(geoId)
      const center = point ? this.projectMathPositionToClient(point.position, rect) : null
      return center ? pointer.distanceTo(center) : Number.POSITIVE_INFINITY
    }

    const getPointScreen = (point: Point3 | undefined) =>
      point ? this.projectMathPositionToClient(point.position, rect) : null

    if (geoId && (type === 'line' || type === 'vector')) {
      const linear =
        type === 'line' ? this.editor.scene.lines.get(geoId) : this.editor.scene.vectors.get(geoId)
      const p1 = getPointScreen(linear?.p1)
      const p2 = getPointScreen(linear?.p2)
      if (p1 && p2) return this.distanceToSegment2D(pointer, p1, p2)
    }

    if (
      geoId &&
      (type === 'ray' ||
        type === 'straightLine' ||
        type === 'perpendicularLine' ||
        type === 'parallelLine')
    ) {
      const linear =
        type === 'ray'
          ? this.editor.scene.rays.get(geoId)
          : type === 'straightLine'
            ? this.editor.scene.straightLines.get(geoId)
            : type === 'perpendicularLine'
              ? this.editor.scene.perpendicularLines.get(geoId)
              : this.editor.scene.parallelLines.get(geoId)
      const p1 = getPointScreen(linear?.p1)
      const p2 = getPointScreen(linear?.p2)
      if (p1 && p2) return this.distanceToSegment2D(pointer, p1, p2)
    }

    const anchor = object.userData?.__labelAnchor as THREE.Vector3 | undefined
    const center = anchor
      ? this.projectWorldToClient(this.renderer.toMathWorldPosition(anchor.clone()), rect)
      : this.projectObjectToClient(object, rect)
    return center ? pointer.distanceTo(center) : Number.POSITIVE_INFINITY
  }

  private findNearestScreenGeometry(clientX: number, clientY: number, rect: DOMRect) {
    let best: { object: THREE.Object3D; distance: number } | null = null
    const objects = [
      ...this.renderer.geometrySyncer.meshMap.values(),
      ...this.renderer.geometrySyncer.groupMap.values(),
    ]

    for (const object of objects) {
      const type = object.userData?.type
      if (!type || type === 'axisLabel') continue
      const distance = this.getGeometryScreenDistance(object, clientX, clientY, rect)
      if (!Number.isFinite(distance)) continue
      if (!best || distance < best.distance) {
        best = { object, distance }
      }
    }

    return best
  }

  private getLabelHitMetrics(
    sprite: THREE.Sprite,
    clientX: number,
    clientY: number,
    rect: DOMRect,
  ) {
    const data = sprite.userData
    const geoId = data?.geoId as string | undefined
    const type = data?.geoType as
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face'
      | undefined
    if (!sprite.visible || !geoId || !type) return null

    const textPixelWidth = Number(data?.textPixelWidth ?? 0)
    const textPixelHeight = Number(data?.textPixelHeight ?? 0)
    const canvasPixelWidth = Number(data?.canvasPixelWidth ?? 256)
    const canvasPixelHeight = Number(data?.canvasPixelHeight ?? 256)
    const padding = this.getLabelHitboxPaddingPx()
    const spriteScreenWidth = sprite.scale.x * rect.width
    const spriteScreenHeight = sprite.scale.y * rect.height
    const hasText = textPixelWidth > 0 && textPixelHeight > 0
    const textRatioX =
      hasText && canvasPixelWidth > 0 ? Math.min(1, textPixelWidth / canvasPixelWidth) : 1
    const textRatioY =
      hasText && canvasPixelHeight > 0 ? Math.min(1, textPixelHeight / canvasPixelHeight) : 1
    const tightPadding = padding * 0.4
    let width = spriteScreenWidth * textRatioX + tightPadding
    let height = spriteScreenHeight * textRatioY + tightPadding
    const anchor = this.projectObjectToClient(sprite, rect)
    if (!anchor) return null
    const center = new THREE.Vector2(
      anchor.x + (0.5 - sprite.center.x) * spriteScreenWidth,
      anchor.y - (0.5 - sprite.center.y) * spriteScreenHeight,
    )

    if (type === 'point') {
      const point = this.editor.scene.points.get(geoId)
      const pointCenter = point ? this.projectMathPositionToClient(point.position, rect) : null
      if (!pointCenter) return null
      const separation = pointCenter.distanceTo(center)
      const safeZone = this.getPointLabelSafeZonePx()
      const innerScale = this.getPointLabelHitboxScalePx()
      // Inside the safe zone, collapse the hitbox aggressively so the
      // label doesn't swallow clicks aimed at the point. Outside the safe
      // zone, use a much gentler shrink so the label still has a generous
      // hitbox for dragging.
      const pointHitboxScale = separation <= safeZone ? innerScale : 0.96
      width *= pointHitboxScale
      height *= pointHitboxScale
    }

    const pointer = new THREE.Vector2(clientX, clientY)
    const dx = Math.abs(pointer.x - center.x)
    const dy = Math.abs(pointer.y - center.y)
    if (dx > width * 0.5 || dy > height * 0.5) return null

    const edgeDistance = Math.max(dx / Math.max(width * 0.5, 1), dy / Math.max(height * 0.5, 1))
    const centerDistance = pointer.distanceTo(center)
    return { sprite, center, width, height, edgeDistance, centerDistance, geoId, type }
  }

  private resolvePreferredTarget(
    geometryHit: THREE.Object3D | null,
    labelHit: THREE.Object3D | null,
    clientX: number,
    clientY: number,
  ) {
    if (!labelHit && !geometryHit) return null
    if (!labelHit) return geometryHit
    if (!geometryHit) return labelHit

    const rect = this.getPointerClientRect()
    const labelMetrics = this.getLabelHitMetrics(labelHit as THREE.Sprite, clientX, clientY, rect)
    if (!labelMetrics) return geometryHit

    const geoDist = this.getGeometryScreenDistance(geometryHit, clientX, clientY, rect)
    const labelDist = labelMetrics.centerDistance
    const cursorOnLabel = labelMetrics.edgeDistance <= 1

    // The cursor is inside the label's hitbox. Decide based on which
    // object the cursor is *closer* to in screen space, not blindly on
    // hitbox containment. This way:
    //   - clicking on the label text itself (near the label center) picks
    //     the label — even in AR mode where the label's default 3px
    //     offset puts the (shrunk) hitbox on top of the point;
    //   - clicking near the label's outer edge, where the hitbox extends
    //     past the point, picks the point because the cursor is actually
    //     closer to the point.
    // Result: AR behaves like desktop — "where the cursor lands wins".
    if (cursorOnLabel) {
      if (labelDist <= geoDist) return labelHit
      return geometryHit
    }

    return geoDist - Interaction.SCREEN_LABEL_GEO_BONUS_PX <= labelDist ? geometryHit : labelHit
  }

  private pickLabelAtClient(clientX: number, clientY: number) {
    const rect = this.getPointerClientRect()
    let best: {
      sprite: THREE.Sprite
      score: number
    } | null = null

    for (const sprite of this.renderer.getNameLabelSprites()) {
      const metrics = this.getLabelHitMetrics(sprite, clientX, clientY, rect)
      if (!metrics) continue
      const score = metrics.edgeDistance * 100 + metrics.centerDistance * 0.01
      if (!best || score < best.score) {
        best = { sprite, score }
      }
    }

    return best?.sprite ?? null
  }

  private getGeometryByType(
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face',
    geoId: string,
  ) {
    if (type === 'point') return this.editor.scene.points.get(geoId) ?? null
    if (type === 'line') return this.editor.scene.lines.get(geoId) ?? null
    if (type === 'straightLine') return this.editor.scene.straightLines.get(geoId) ?? null
    if (type === 'perpendicularLine') return this.editor.scene.perpendicularLines.get(geoId) ?? null
    if (type === 'parallelLine') return this.editor.scene.parallelLines.get(geoId) ?? null
    if (type === 'ray') return this.editor.scene.rays.get(geoId) ?? null
    if (type === 'vector') return this.editor.scene.vectors.get(geoId) ?? null
    if (type === 'circle') return this.editor.scene.circles.get(geoId) ?? null
    if (type === 'sphere') return this.editor.scene.spheres.get(geoId) ?? null
    if (type === 'cone') return this.editor.scene.cones.get(geoId) ?? null
    if (type === 'cylinder') return this.editor.scene.cylinders.get(geoId) ?? null
    return this.editor.scene.faces.get(geoId) ?? null
  }

  private beginLabelDrag(
    type:
      | 'point'
      | 'line'
      | 'straightLine'
      | 'perpendicularLine'
      | 'parallelLine'
      | 'ray'
      | 'vector'
      | 'circle'
      | 'sphere'
      | 'cone'
      | 'cylinder'
      | 'face',
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
    const zoomFactor = this.getDragZoomFactor()
    const invZoom = zoomFactor > 0 ? 1 / zoomFactor : 1
    const baseOffsets = this.getLabelBaseOffsets(target.type)
    geometry.labelOffsetX = this.clampLabelOffset(
      target.startOffsetX + (clientX - target.startClientX) * invZoom,
      zoomFactor,
      baseOffsets.x,
    )
    geometry.labelOffsetY = this.clampLabelOffset(
      target.startOffsetY - (clientY - target.startClientY) * invZoom,
      zoomFactor,
      baseOffsets.y,
    )
    this.renderer.previewLabelOffset(target.geoId, geometry.labelOffsetX, geometry.labelOffsetY)
  }

  private getDragZoomFactor(): number {
    return this.renderer.geometrySyncer?.getPointZoomFactor?.() ?? 1
  }

  private commitLabelDrag() {
    const target = this.draggingLabelTarget
    if (!target) return
    const geometry = this.getGeometryByType(target.type, target.geoId)
    if (!geometry) return

    const zoomFactor = this.getDragZoomFactor()
    const baseOffsets = this.getLabelBaseOffsets(target.type)
    const nextOffsetX = this.clampLabelOffset(geometry.labelOffsetX, zoomFactor, baseOffsets.x)
    const nextOffsetY = this.clampLabelOffset(geometry.labelOffsetY, zoomFactor, baseOffsets.y)
    geometry.labelOffsetX = target.startOffsetX
    geometry.labelOffsetY = target.startOffsetY

    if (nextOffsetX === target.startOffsetX && nextOffsetY === target.startOffsetY) return

    Interaction.updateLabelOffsetByType[target.type]?.(this.editor, target.geoId, {
      labelOffsetX: nextOffsetX,
      labelOffsetY: nextOffsetY,
    })
  }
}
