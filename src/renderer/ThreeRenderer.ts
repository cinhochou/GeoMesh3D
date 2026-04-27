// src/renderer/ThreeRenderer.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Scene as GeoScene, type SceneRenderSyncState } from '../core/scene/Scene'
import { Ray3 } from '../core/geometry/Ray3'
import { computePlaneBasis, projectPoint2D, triangulateFace } from '../core/geometry/PlanarUtils'
import { CubeConstraint } from '../core/constraints/CubeConstraint'
import type { FacePreviewData } from '../core/editor/Editor'

type Matrix4WithLegacyGetInverse = THREE.Matrix4 & {
  getInverse?: (m: THREE.Matrix4) => THREE.Matrix4
}

type ARToolkitSourceLike = {
  domElement?: HTMLVideoElement
  ready?: boolean
  init: (onReady: () => void) => void
  onResizeElement?: () => void
  onResize?: () => void
  copyElementSizeTo?: (el: HTMLElement) => void
  copySizeTo?: (el: HTMLElement) => void
}

type ARToolkitContextLike = {
  init: (onReady: () => void) => void
  getProjectionMatrix: () => THREE.Matrix4
  update: (sourceElement: HTMLElement) => void
}

type RenderObjectType = 'point' | 'line' | 'straightLine' | 'ray' | 'face' | 'axisLabel'

type RenderObjectUserData = THREE.Object3D['userData'] & {
  type?: RenderObjectType
  geoId?: string
  __labelSprite?: THREE.Sprite
  __valueLabelSprite?: THREE.Sprite
  __labelAnchor?: THREE.Vector3
  __labelOffsetX?: number
  __labelOffsetY?: number
  __arrowHead?: THREE.Mesh
}

type LabelSpriteUserData = THREE.Object3D['userData'] & {
  text?: string
  isNameLabel?: boolean
  isValueLabel?: boolean
  layoutMode?: 'name' | 'combined' | 'value'
  geoId?: string
  geoType?: Exclude<RenderObjectType, 'axisLabel'>
  textPixelWidth?: number
  textPixelHeight?: number
  canvasPixelWidth?: number
  canvasPixelHeight?: number
}

type AxisArrowUserData = THREE.Object3D['userData'] & {
  __baseLength?: number
  __baseHeadLength?: number
  __baseHeadWidth?: number
}

type AxisLabelUserData = THREE.Object3D['userData'] & {
  __axisDir?: THREE.Vector3
  __axisLength?: number
  __axisLabelOffset?: number
  __axisYOffset?: number
}
// 为新版 Three.js 补上旧版的 getInverse 方法，防止 AR.js 崩溃
const matrix4Prototype = THREE.Matrix4.prototype as Matrix4WithLegacyGetInverse
if (typeof matrix4Prototype.getInverse !== 'function') {
  matrix4Prototype.getInverse = function (m: THREE.Matrix4) {
    return this.copy(m).invert()
  }
}
export class ThreeRenderer {
  private static readonly POINT_PIXEL = 9
  private static readonly POINT_SCALE_REFERENCE_DISTANCE = Math.sqrt(15 * 15 * 3)
  private static readonly POINT_SCALE_EXPONENT = 0.72
  private static readonly POINT_MIN_SCALE_FACTOR = 0.45
  private static readonly POINT_MAX_SCALE_FACTOR = 1.08
  private static readonly POINT_LABEL_BASE_PIXEL = 70
  private static readonly LINE_LABEL_BASE_PIXEL = 68
  private static readonly POINT_LABEL_SCALE_MULTIPLIER = 5.6
  private static readonly LINE_LABEL_SCALE_MULTIPLIER = 5.4
  private static readonly LABEL_MIN_SCALE_FACTOR = 0.52
  private static readonly LABEL_MAX_SCALE_FACTOR = 1.38
  private static readonly LABEL_OFFSET_EXPONENT = 0.65
  private static readonly LABEL_OFFSET_MIN_FACTOR = 0.7
  private static readonly LABEL_OFFSET_MAX_FACTOR = 1.15
  private static readonly POINT_LABEL_OFFSET_X = 3
  private static readonly POINT_LABEL_OFFSET_Y = 3
  private static readonly LINE_LABEL_OFFSET_Y = 3
  private static readonly GUIDE_LABEL_OFFSET_X = 12
  private static readonly GUIDE_LABEL_OFFSET_Y = 0
  private static readonly AXIS_LABEL_PIXEL = 28
  private static readonly POINT_LABEL_CENTER_X = 0.32
  private static readonly POINT_LABEL_CENTER_Y = 0.32
  private static readonly LINE_LABEL_CENTER_X = 0.5
  private static readonly LINE_LABEL_CENTER_Y = 0.3
  static readonly LABEL_DRAG_LIMIT = 30
  private static readonly LINEAR_COLOR = 0xffffff
  private static readonly LINEAR_WIDTH = 2
  private static readonly INTERSECTION_POINT_COLOR = 0xffd84a
  private static readonly CUBE_DEPENDENT_POINT_COLOR = 0xcfd3d8
  private static readonly FACE_FILL_COLOR = 0x74a4ff
  private static readonly FACE_SELECTED_COLOR = 0x43f260
  private static readonly FACE_FILL_OPACITY = 0.22
  private static readonly FACE_SELECTED_OPACITY = 0.3
  private static readonly FACE_PREVIEW_COLOR = 0x7fffd4
  private static readonly FACE_PREVIEW_OPACITY = 0.16
  private static readonly RAY_HEAD_LENGTH = 0.7
  private static readonly RAY_HEAD_RADIUS = 0.22
  /** 让坐标轴与网格共面，避免放大坐标系后出现明显“分层” */
  private static readonly AXIS_LIFT_Y = 0
  /** AR 模式下点大小缩放系数（相对当前尺寸） */
  private static readonly AR_POINT_SCALE_FACTOR = 2 / 3
  private static readonly AR_POINT_ZOOM_RESPONSE_EXPONENT = 0.85
  private static readonly AR_POINT_ZOOM_MIN_FACTOR = 0.65
  private static readonly AR_POINT_ZOOM_MAX_FACTOR = 2.4
  private static readonly AXIS_ARROW_BASE_LENGTH = 0.8
  private static readonly AXIS_ARROW_BASE_HEAD_LENGTH = 0.5
  private static readonly AXIS_ARROW_BASE_HEAD_WIDTH = 0.3
  private static readonly AXIS_ARROW_MIN_SCALE_FACTOR = 0.6
  private static readonly AXIS_ARROW_MAX_SCALE_FACTOR = 3.2

  scene: THREE.Scene
  /** 承载所有几何物体的分组，便于在 AR 模式下整体缩放 */
  world: THREE.Group
  private arAnchorGroup: THREE.Group
  private arMarkerRoot: THREE.Group
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  arCamera: THREE.PerspectiveCamera
  private container: HTMLElement
  private projectionGroup: THREE.Group | null = null
  private guideLabel: THREE.Sprite | null = null
  private guidePoint: THREE.Sprite | null = null
  private rubberBand?: THREE.Line
  private facePreviewGroup: THREE.Group | null = null

  private arToolkitSource: ARToolkitSourceLike | null = null
  private arToolkitContext: ARToolkitContextLike | null = null
  private isARMode = false
  private arAnchorInitialized = false
  private arLastMarkerSeenAt = 0
  /** 记录当前世界缩放，普通模式 1，AR 模式会缩小 */
  private worldScale = 1
  private arInitialWorldScale = 1
  private sharedWorldTargetQuaternion = new THREE.Quaternion()
  private sharedWorldRotationInitialized = false
  private axisGridGroup: THREE.Group
  private gridHelper: THREE.GridHelper | null = null
  private axisArrows: THREE.ArrowHelper[] = []
  private axisLabels: THREE.Sprite[] = []
  private axisGridSize = 10
  private isGridVisible = true
  private coordinateSystemVisible = true
  private pointTexture: THREE.CanvasTexture | null = null
  private static readonly AR_MARKER_FOLLOW_LERP = 0.35
  private static readonly AR_MARKER_REACQUIRE_LERP = 0.18
  private static readonly AR_MARKER_PERSIST_MS = 1500
  private static readonly AR_WORLD_SCALE_MIN = 0.02
  private static readonly AR_WORLD_SCALE_MAX = 1.6
  private static readonly SHARED_WORLD_ROTATION_LERP = 0.22

  // 用于备份进入 AR 前的相机和控制器状态
  private backupState = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(), // OrbitControls 的聚焦点
    worldQuaternion: new THREE.Quaternion(),
    zoom: 1,
    fov: 60,
    controlsEnabled: true,
  }

  /** geoId -> mesh */
  meshMap = new Map<string, THREE.Object3D>()
  private cubeValueLabels = new Map<string, THREE.Sprite>()
  private currentSceneRef: GeoScene | null = null
  private activeLabelTarget: { type: string; geoId: string } | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x111111)
    this.arAnchorGroup = new THREE.Group()
    this.scene.add(this.arAnchorGroup)
    this.world = new THREE.Group()
    this.arAnchorGroup.add(this.world)
    this.sharedWorldTargetQuaternion.copy(this.world.quaternion)
    this.arMarkerRoot = new THREE.Group()
    this.arMarkerRoot.matrixAutoUpdate = false
    this.arMarkerRoot.visible = false
    this.scene.add(this.arMarkerRoot)
    this.axisGridGroup = new THREE.Group()
    this.world.add(this.axisGridGroup)

    const w = container.clientWidth
    const h = container.clientHeight

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    this.camera.position.set(15, 15, 15)
    this.camera.lookAt(0, 0, 0)

    this.arCamera = new THREE.PerspectiveCamera()
    this.arCamera.matrixAutoUpdate = false
    this.scene.add(this.arCamera)

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.updateRendererPixelRatio()
    this.renderer.setSize(w, h, false)

    // 设置 Canvas 样式，确保它覆盖在视频之上
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.zIndex = '10' // Canvas 层级设为 10
    this.renderer.domElement.style.pointerEvents = 'auto' // 允许鼠标交互
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 5)
    this.scene.add(light)
    this.scene.add(new THREE.AmbientLight(0x404040))
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 5
    this.controls.maxDistance = 100

    this.setAxisGridSize(this.axisGridSize)
  }

  dispose() {
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  /** 当前用于渲染/拾取的相机（AR 模式下为 arCamera） */
  getActiveCamera(): THREE.Camera {
    return this.isARMode ? this.arCamera : this.camera
  }

  /** 是否处于 AR 模式（供交互层判断） */
  isARActive(): boolean {
    return this.isARMode
  }

  isSharedSceneRotationAvailable(): boolean {
    if (!this.isARMode) return false
    return this.arMarkerRoot.visible || this.shouldRenderPersistentARWorld()
  }

  /** 返回 AR 视频元素，便于在拾取时获取真实显示区域 */
  getARVideoElement(): HTMLVideoElement | null {
    // arToolkitSource.domElement 即为 <video>
    return this.isARMode && this.arToolkitSource?.domElement
      ? (this.arToolkitSource.domElement as HTMLVideoElement)
      : null
  }

  /** 获取当前相机的世界坐标（兼容 AR 相机 matrixAutoUpdate=false 的情况） */
  getActiveCameraWorldPosition(): THREE.Vector3 {
    const cam = this.getActiveCamera()
    return cam.getWorldPosition(new THREE.Vector3())
  }

  /** 获取当前相机的世界朝向 */
  getActiveCameraWorldDirection(): THREE.Vector3 {
    const cam = this.getActiveCamera()
    return cam.getWorldDirection(new THREE.Vector3())
  }

  /** 数学世界局部坐标 -> 当前渲染世界坐标 */
  toMathWorldPosition(point: THREE.Vector3): THREE.Vector3 {
    return this.world.localToWorld(point.clone())
  }

  /** 当前渲染世界坐标 -> 数学世界局部坐标 */
  toMathLocalPosition(point: THREE.Vector3): THREE.Vector3 {
    return this.world.worldToLocal(point.clone())
  }

  private getRenderUserData(object: THREE.Object3D): RenderObjectUserData {
    return object.userData as RenderObjectUserData
  }

  private getLabelUserData(sprite: THREE.Sprite): LabelSpriteUserData {
    return sprite.userData as LabelSpriteUserData
  }

  getNameLabelSprites() {
    const labels: THREE.Sprite[] = []
    this.meshMap.forEach((obj) => {
      const label = this.getRenderUserData(obj).__labelSprite
      if (label) labels.push(label)
      const valueLabel = this.getRenderUserData(obj).__valueLabelSprite
      if (valueLabel) labels.push(valueLabel)
    })
    this.cubeValueLabels.forEach((label) => labels.push(label))
    return labels
  }

  previewLabelOffset(geoId: string, offsetX: number, offsetY: number) {
    const object = this.meshMap.get(geoId)
    if (!object) return
    const userData = this.getRenderUserData(object)
    userData.__labelOffsetX = offsetX
    userData.__labelOffsetY = offsetY

    const label = userData.__labelSprite
    const valueLabel = userData.__valueLabelSprite
    if ((!label || !label.visible) && (!valueLabel || !valueLabel.visible)) return

    const valueExtraOffset = this.getValueLabelOffsetPx(label, userData.type === 'point')

    if (userData.type === 'point') {
      if (label?.visible) {
        label.position.copy(this.getScreenOffsetPosition(object.position, offsetX, offsetY))
      }
      if (valueLabel?.visible) {
        valueLabel.position.copy(
          this.getScreenOffsetPosition(object.position, offsetX + valueExtraOffset, offsetY),
        )
      }
      return
    }

    if (
      userData.type === 'line' ||
      userData.type === 'straightLine' ||
      userData.type === 'ray' ||
      userData.type === 'face'
    ) {
      const anchor = userData.__labelAnchor?.clone()
      if (!anchor) return
      if (label?.visible) {
        label.position.copy(this.getScreenOffsetPosition(anchor, offsetX, offsetY))
      }
      if (valueLabel?.visible) {
        valueLabel.position.copy(
          this.getScreenOffsetPosition(anchor, offsetX + valueExtraOffset, offsetY),
        )
      }
    }
  }

  private getAxisArrowUserData(arrow: THREE.ArrowHelper): AxisArrowUserData {
    return arrow.userData as AxisArrowUserData
  }

  private getAxisLabelUserData(label: THREE.Sprite): AxisLabelUserData {
    return label.userData as AxisLabelUserData
  }

  /** AR 下让网格平面中心尽量贴近 marker 中心，便于把整个坐标系“坐”在标记上 */
  private updateARWorldPlacement() {
    this.world.position.set(0, 0, 0)
  }

  /** 按不同网格档位优化 AR 下的整体可见性 */
  private getARSceneScaleForAxisSize(size: number) {
    if (size >= 40) return 0.05
    if (size >= 20) return 0.095
    return 0.16
  }

  /** 统一设置世界缩放，同时保持标记点/浮窗等屏幕尺寸不变 */
  private setWorldScale(scale: number) {
    const clampedScale = THREE.MathUtils.clamp(
      scale,
      ThreeRenderer.AR_WORLD_SCALE_MIN,
      ThreeRenderer.AR_WORLD_SCALE_MAX,
    )
    this.worldScale = clampedScale
    this.world.scale.setScalar(clampedScale)
    this.updateARWorldPlacement()

    this.refreshScreenSpaceScales()
  }

  getWorldScale() {
    return this.worldScale
  }

  private getSharedWorldRotationDeltaAngle(deltaPixels: number) {
    const elementHeight = Math.max(this.renderer.domElement.clientHeight, 1)
    return ((2 * Math.PI * deltaPixels) / elementHeight) * this.controls.rotateSpeed
  }

  getSharedWorldQuaternion() {
    return this.world.quaternion.clone()
  }

  setSharedWorldQuaternion(quaternion: THREE.Quaternion, immediate: boolean = false) {
    const normalized = quaternion.clone().normalize()
    this.sharedWorldTargetQuaternion.copy(normalized)
    if (!this.sharedWorldRotationInitialized || immediate) {
      this.world.quaternion.copy(normalized)
      this.sharedWorldRotationInitialized = true
    }
    this.world.updateMatrixWorld(true)
  }

  rotateSharedWorldByScreenDelta(deltaX: number, deltaY: number) {
    if ((!Number.isFinite(deltaX) && !Number.isFinite(deltaY)) || (deltaX === 0 && deltaY === 0)) {
      return this.getSharedWorldQuaternion()
    }

    const rotateLeftAngle = this.getSharedWorldRotationDeltaAngle(deltaX)
    const rotateUpAngle = this.getSharedWorldRotationDeltaAngle(deltaY)
    const camera = this.getActiveCamera()
    const cameraQuaternion = camera.getWorldQuaternion(new THREE.Quaternion())
    const parentQuaternion = this.world.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? null
    const parentInverseQuaternion = parentQuaternion?.invert() ?? new THREE.Quaternion()
    const cameraUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(cameraQuaternion)
      .applyQuaternion(parentInverseQuaternion)
      .normalize()
    const cameraRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(cameraQuaternion)
      .applyQuaternion(parentInverseQuaternion)
      .normalize()

    // Match OrbitControls' drag-to-angle mapping, but apply it to the AR world
    // so the user can continue rotating past the usual polar-angle limits.
    const yaw = new THREE.Quaternion().setFromAxisAngle(cameraUp, rotateLeftAngle)
    const pitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, rotateUpAngle)
    const deltaQuaternion = yaw.multiply(pitch).normalize()
    const nextQuaternion = deltaQuaternion.multiply(this.world.quaternion.clone()).normalize()
    this.setSharedWorldQuaternion(nextQuaternion, true)
    return nextQuaternion
  }

  setARWorldScale(scale: number) {
    if (!this.isARMode) return
    this.setWorldScale(scale)
  }

  scaleARWorldBy(factor: number) {
    if (!this.isARMode || !Number.isFinite(factor) || factor <= 0) return
    this.setWorldScale(this.worldScale * factor)
  }

  /** 重新按当前画布尺寸刷新点与标签的屏幕空间大小 */
  private refreshScreenSpaceScales() {
    const h = this.renderer.domElement.clientHeight || 1
    const spriteScale = this.getPointSpriteScale()
    const labelScale = this.getPointLabelScale()
    const lineLabelScale = this.getLineLabelScale()
    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      if ((obj as THREE.Sprite).isSprite && userData.type === 'point') {
        ;(obj as THREE.Sprite).scale.set(spriteScale, spriteScale, 1)
        const label = userData.__labelSprite
        if (label) this.setLabelSpriteScale(label, labelScale)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.setAdaptiveSpriteScale(valueLabel, labelScale)
      } else if (
        userData.type === 'line' ||
        userData.type === 'ray' ||
        userData.type === 'straightLine' ||
        userData.type === 'face'
      ) {
        const label = userData.__labelSprite
        if (label) this.setLabelSpriteScale(label, lineLabelScale)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.setAdaptiveSpriteScale(valueLabel, lineLabelScale)
      }
    })
    this.cubeValueLabels.forEach((label) => this.setAdaptiveSpriteScale(label, lineLabelScale))
    this.axisGridGroup.children.forEach((obj) => {
      if ((obj as THREE.Sprite).isSprite && obj.userData?.type === 'axisLabel') {
        const axisLabelScale = ThreeRenderer.AXIS_LABEL_PIXEL / h / this.worldScale
        ;(obj as THREE.Sprite).scale.set(axisLabelScale, axisLabelScale, 1)
      }
    })

    // 引导浮窗大小也保持稳定
    if (this.guideLabel) {
      this.guideLabel.scale.set(0.18 / this.worldScale, 0.1 / this.worldScale, 1)
    }
    if (this.guidePoint) {
      this.guidePoint.scale.set(spriteScale, spriteScale, 1)
    }
  }

  /** 点大小随缩放距离变化，但不随绕中心旋转的视角角度变化 */
  private getPointSpriteScale() {
    const h = this.renderer.domElement.clientHeight || 1
    const baseScale = ThreeRenderer.POINT_PIXEL / h / this.worldScale
    if (this.isARMode) {
      const safeInitialScale = Math.max(this.arInitialWorldScale, 0.0001)
      const zoomRatio = this.worldScale / safeInitialScale
      const zoomFactor = THREE.MathUtils.clamp(
        Math.pow(zoomRatio, ThreeRenderer.AR_POINT_ZOOM_RESPONSE_EXPONENT),
        ThreeRenderer.AR_POINT_ZOOM_MIN_FACTOR,
        ThreeRenderer.AR_POINT_ZOOM_MAX_FACTOR,
      )
      return baseScale * ThreeRenderer.AR_POINT_SCALE_FACTOR * zoomFactor
    }

    const distance = this.camera.position.distanceTo(this.controls.target)
    const safeDistance = Math.max(distance, 0.001)
    const rawFactor = Math.pow(
      ThreeRenderer.POINT_SCALE_REFERENCE_DISTANCE / safeDistance,
      ThreeRenderer.POINT_SCALE_EXPONENT,
    )
    const clampedFactor = Math.min(
      ThreeRenderer.POINT_MAX_SCALE_FACTOR,
      Math.max(ThreeRenderer.POINT_MIN_SCALE_FACTOR, rawFactor),
    )

    return baseScale * clampedFactor
  }

  private getPointLabelScale() {
    return this.getResponsiveLabelScale(
      ThreeRenderer.POINT_LABEL_BASE_PIXEL,
      ThreeRenderer.POINT_LABEL_SCALE_MULTIPLIER,
    )
  }

  private getLineLabelScale() {
    return this.getResponsiveLabelScale(
      ThreeRenderer.LINE_LABEL_BASE_PIXEL,
      ThreeRenderer.LINE_LABEL_SCALE_MULTIPLIER,
    )
  }

  /** 标签跟随点缩放，但限制最大/最小范围，避免远处标签压过点或近处过大 */
  private getResponsiveLabelScale(basePixel: number, pointScaleMultiplier: number) {
    const h = this.renderer.domElement.clientHeight || 1
    const baseScale = basePixel / h / this.worldScale
    const pointDrivenScale = this.getPointSpriteScale() * pointScaleMultiplier
    const minScale = baseScale * ThreeRenderer.LABEL_MIN_SCALE_FACTOR
    const maxScale = baseScale * ThreeRenderer.LABEL_MAX_SCALE_FACTOR
    return Math.min(maxScale, Math.max(minScale, pointDrivenScale))
  }

  /** 屏幕空间偏移距离随缩放距离变化，但不随绕中心旋转的视角角度变化 */
  private getZoomResponsivePixelOffset(basePixel: number) {
    if (this.isARMode) return basePixel

    const distance = this.camera.position.distanceTo(this.controls.target)
    const safeDistance = Math.max(distance, 0.001)
    const rawFactor = Math.pow(
      ThreeRenderer.POINT_SCALE_REFERENCE_DISTANCE / safeDistance,
      ThreeRenderer.LABEL_OFFSET_EXPONENT,
    )
    const clampedFactor = Math.min(
      ThreeRenderer.LABEL_OFFSET_MAX_FACTOR,
      Math.max(ThreeRenderer.LABEL_OFFSET_MIN_FACTOR, rawFactor),
    )
    return basePixel * clampedFactor
  }

  private updateResponsiveScales() {
    const spriteScale = this.getPointSpriteScale()
    const pointLabelScale = this.getPointLabelScale()
    const lineLabelScale = this.getLineLabelScale()
    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      if ((obj as THREE.Sprite).isSprite && userData.type === 'point') {
        ;(obj as THREE.Sprite).scale.set(spriteScale, spriteScale, 1)
        const label = userData.__labelSprite
        if (label) this.setLabelSpriteScale(label, pointLabelScale)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.setAdaptiveSpriteScale(valueLabel, pointLabelScale)
      } else if (
        userData.type === 'line' ||
        userData.type === 'straightLine' ||
        userData.type === 'ray' ||
        userData.type === 'face'
      ) {
        const label = userData.__labelSprite
        if (label) this.setLabelSpriteScale(label, lineLabelScale)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.setAdaptiveSpriteScale(valueLabel, lineLabelScale)
      }
    })
    this.cubeValueLabels.forEach((label) => this.setAdaptiveSpriteScale(label, lineLabelScale))

    if (this.guidePoint) {
      this.guidePoint.scale.set(spriteScale, spriteScale, 1)
    }

    this.updateAxisArrowScales()
  }

  /** 让坐标轴箭头在透视相机下保持接近恒定屏幕尺寸 */
  private updateAxisArrowScales() {
    if (this.axisArrows.length === 0) return

    let factor = 1
    if (!this.isARMode) {
      const distance = this.camera.position.distanceTo(this.controls.target)
      const safeDistance = Math.max(distance, 0.001)
      factor = safeDistance / ThreeRenderer.POINT_SCALE_REFERENCE_DISTANCE
      factor = Math.min(
        ThreeRenderer.AXIS_ARROW_MAX_SCALE_FACTOR,
        Math.max(ThreeRenderer.AXIS_ARROW_MIN_SCALE_FACTOR, factor),
      )
    }

    this.axisArrows.forEach((arrow) => {
      const data = this.getAxisArrowUserData(arrow)
      const baseLength = data.__baseLength ?? ThreeRenderer.AXIS_ARROW_BASE_LENGTH
      const baseHeadLength = data.__baseHeadLength ?? ThreeRenderer.AXIS_ARROW_BASE_HEAD_LENGTH
      const baseHeadWidth = data.__baseHeadWidth ?? ThreeRenderer.AXIS_ARROW_BASE_HEAD_WIDTH
      arrow.setLength(baseLength * factor, baseHeadLength * factor, baseHeadWidth * factor)
    })

    this.axisLabels.forEach((label) => {
      const data = this.getAxisLabelUserData(label)
      const dir = data.__axisDir
      const axisLength = data.__axisLength
      const labelOffset = data.__axisLabelOffset
      const yOffset = data.__axisYOffset ?? 0
      if (!dir || axisLength === undefined || labelOffset === undefined) return

      const extra =
        (ThreeRenderer.AXIS_ARROW_BASE_LENGTH + ThreeRenderer.AXIS_ARROW_BASE_HEAD_LENGTH * 0.35) *
        Math.max(0, factor - 1)
      const labelPos = dir.clone().multiplyScalar(axisLength + labelOffset + extra)
      if (Math.abs(dir.y) < 1e-6) {
        labelPos.y = yOffset
      } else {
        labelPos.y += yOffset
      }
      label.position.copy(labelPos)
    })
  }

  /**
   * 大网格档位下原点附近会同时出现大量细线。
   * 像素比按 10 -> 20 -> 40 做梯度下降，避免档位切换时观感割裂过强。
   */
  private updateRendererPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1
    let cap = deviceRatio
    if (this.axisGridSize >= 40) {
      cap = Math.min(deviceRatio, 1.45)
    } else if (this.axisGridSize >= 20) {
      cap = Math.min(deviceRatio, 1.7)
    }
    this.renderer.setPixelRatio(cap)
  }
  /* ---------- Scene → Three ---------- */

  sync(
    geoScene: GeoScene,
    previewData?: { from: THREE.Vector3; to: THREE.Vector3 } | null,
    facePreviewData?: FacePreviewData | null,
    activeLabelTarget?: { type: string; geoId: string } | null,
  ) {
    this.currentSceneRef = geoScene
    this.activeLabelTarget = activeLabelTarget ?? null
    const dirtyState = geoScene.consumeRenderSyncState()
    if (dirtyState) {
      this.cleanupMissingMeshes(geoScene)
      this.syncPoints(geoScene, dirtyState)
      this.syncLines(geoScene, dirtyState)
      this.syncStraightLines(geoScene, dirtyState)
      this.syncRays(geoScene, dirtyState)
      this.syncFaces(geoScene, dirtyState)
      this.syncCubeValueLabels(geoScene)
    }
    this.updateRubberBand(previewData) // 处理虚线
    this.updateFacePreview(facePreviewData)
  }

  private resetARAnchor() {
    this.arAnchorInitialized = false
    this.arLastMarkerSeenAt = 0
    this.arAnchorGroup.position.set(0, 0, 0)
    this.arAnchorGroup.quaternion.identity()
    this.arAnchorGroup.scale.set(1, 1, 1)
    this.arAnchorGroup.updateMatrixWorld(true)
    this.arMarkerRoot.visible = false
    this.arMarkerRoot.matrix.identity()
    this.arMarkerRoot.matrixWorld.identity()
    this.arMarkerRoot.position.set(0, 0, 0)
    this.arMarkerRoot.quaternion.identity()
    this.arMarkerRoot.scale.set(1, 1, 1)
  }

  private syncARAnchorFromMarker() {
    if (!this.arMarkerRoot.visible) return

    this.arMarkerRoot.updateMatrixWorld(true)

    const nextPosition = new THREE.Vector3()
    const nextQuaternion = new THREE.Quaternion()
    const nextScale = new THREE.Vector3()
    this.arMarkerRoot.matrixWorld.decompose(nextPosition, nextQuaternion, nextScale)

    const now = performance.now()
    const lerpAlpha = !this.arAnchorInitialized
      ? 1
      : now - this.arLastMarkerSeenAt <= 120
        ? ThreeRenderer.AR_MARKER_FOLLOW_LERP
        : ThreeRenderer.AR_MARKER_REACQUIRE_LERP

    this.arAnchorGroup.position.lerp(nextPosition, lerpAlpha)
    this.arAnchorGroup.quaternion.slerp(nextQuaternion, lerpAlpha)
    this.arAnchorGroup.scale.lerp(nextScale, lerpAlpha)
    this.arAnchorGroup.updateMatrixWorld(true)

    this.arAnchorInitialized = true
    this.arLastMarkerSeenAt = now
  }

  private shouldRenderPersistentARWorld() {
    return (
      this.arAnchorInitialized &&
      performance.now() - this.arLastMarkerSeenAt <= ThreeRenderer.AR_MARKER_PERSIST_MS
    )
  }

  /** 删除已从场景移除的点/线对应的 Mesh 与标签 */
  private cleanupMissingMeshes(scene: GeoScene) {
    this.meshMap.forEach((obj, id) => {
      const userData = this.getRenderUserData(obj)
      const type = userData.type
      if (type === 'point' && !scene.points.has(id)) {
        const label = userData.__labelSprite
        if (label) this.world.remove(label)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.world.remove(valueLabel)
        this.world.remove(obj)
        this.meshMap.delete(id)
      } else if (type === 'line' && !scene.lines.has(id)) {
        const label = userData.__labelSprite
        if (label) this.world.remove(label)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.world.remove(valueLabel)
        this.world.remove(obj)
        this.meshMap.delete(id)
      } else if (type === 'straightLine' && !scene.straightLines.has(id)) {
        const label = userData.__labelSprite
        if (label) this.world.remove(label)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.world.remove(valueLabel)
        this.world.remove(obj)
        this.meshMap.delete(id)
      } else if (type === 'ray' && !scene.rays.has(id)) {
        const label = userData.__labelSprite
        if (label) this.world.remove(label)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.world.remove(valueLabel)
        this.world.remove(obj)
        this.meshMap.delete(id)
      } else if (type === 'face' && !scene.faces.has(id)) {
        const label = userData.__labelSprite
        if (label) this.world.remove(label)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.world.remove(valueLabel)
        this.world.remove(obj)
        this.meshMap.delete(id)
      }
    })
    const activeCubeIds = new Set(
      [...scene.cubeConstraints.values()]
        .filter((constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint)
        .map((constraint) => constraint.cubeId),
    )
    this.cubeValueLabels.forEach((label, cubeId) => {
      if (activeCubeIds.has(cubeId)) return
      this.world.remove(label)
      this.cubeValueLabels.delete(cubeId)
    })
  }

  // 切换 AR 模式
  async toggleAR(enabled: boolean) {
    this.isARMode = enabled

    if (enabled) {
      // ===== 进入 AR=====
      this.backupState.position.copy(this.camera.position)
      this.backupState.quaternion.copy(this.camera.quaternion)
      this.backupState.target.copy(this.controls.target)
      this.backupState.worldQuaternion.copy(this.world.quaternion)
      this.backupState.zoom = this.camera.zoom
      this.backupState.fov = this.camera.fov
      this.backupState.controlsEnabled = this.controls.enabled

      this.renderer.setClearColor(0x000000, 0)
      this.scene.background = null
      this.controls.enabled = false
      this.resetARAnchor()
      // AR 模式整体缩放，避免相机贴得太近导致看不到边缘
      this.setWorldScale(this.getARSceneScaleForAxisSize(this.axisGridSize))
      this.arInitialWorldScale = this.worldScale

      try {
        this.initAR()
      } catch (err) {
        this.isARMode = false
        this.restoreFromBackupState()
        throw err
      }
    } else {
      this.restoreFromBackupState()
    }
  }

  private restoreFromBackupState() {
    this.isARMode = false
    this.arInitialWorldScale = 1
    this.resetARAnchor()
    // 恢复世界缩放
    this.setWorldScale(1)
    this.setSharedWorldQuaternion(this.backupState.worldQuaternion, true)
    // ===== 退出 AR =====
    if (this.arToolkitSource) {
      if (this.arToolkitSource.domElement) {
        const srcObject = this.arToolkitSource.domElement.srcObject
        if (srcObject instanceof MediaStream) {
          srcObject.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        }
        this.arToolkitSource.domElement.remove()
      }
      this.arToolkitSource = null
    }
    this.arToolkitContext = null

    this.scene.visible = true
    this.camera.visible = true

    // 恢复 matrixAutoUpdate
    this.camera.matrixAutoUpdate = true

    // 强制清空 AR 留下的矩阵
    this.camera.matrix.identity()
    this.camera.matrixWorld.identity()

    // --- 原有恢复逻辑 ---
    this.camera.fov = this.backupState.fov
    this.camera.near = 0.1
    this.camera.far = 1000
    this.camera.zoom = this.backupState.zoom
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight

    this.camera.projectionMatrix.identity()
    this.camera.updateProjectionMatrix()

    this.camera.position.copy(this.backupState.position)
    this.camera.quaternion.copy(this.backupState.quaternion)
    this.camera.updateMatrixWorld(true)

    this.controls.target.copy(this.backupState.target)
    this.controls.enabled = this.backupState.controlsEnabled
    this.controls.update()

    this.renderer.setClearColor(0x111111, 1)
    this.scene.background = new THREE.Color(0x111111)

    const canvas = this.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.marginTop = '0px'
    canvas.style.marginLeft = '0px'

    this.onResize()
  }

  private initAR() {
    //@ts-expect-error THREEx
    // source
    this.arToolkitSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' })
    const source = this.arToolkitSource
    if (!source) return
    source.init(() => {
      const video = source.domElement as HTMLVideoElement
      if (!video) return

      //  AR.js 会把video插到body里，必须移走
      if (video.parentElement !== this.container) {
        video.parentElement?.removeChild(video)
        this.container.appendChild(video)
      }

      this.applyVideoForceStyle(video)

      setTimeout(() => {
        if (this.isARMode) this.onResize()
      }, 200)
    })

    //@ts-expect-error THREEx
    // context
    this.arToolkitContext = new THREEx.ArToolkitContext({
      cameraParametersUrl: '/data/camera_para.dat',
      detectionMode: 'mono',
    })

    const context = this.arToolkitContext
    if (!context) return
    context.init(() => {
      this.arCamera.projectionMatrix.copy(context.getProjectionMatrix())
      // Three.js r150+ 需要同步 projectionMatrixInverse，否则 Raycaster 在 AR 模式下会算出错误射线
      this.arCamera.projectionMatrixInverse.copy(this.arCamera.projectionMatrix).invert()
      this.arCamera.matrix.identity()
      this.arCamera.matrixWorld.identity()
      this.arCamera.position.set(0, 0, 0)
      this.arCamera.quaternion.identity()
      this.arCamera.updateMatrixWorld(true)
    })

    //@ts-expect-error THREEx
    // marker 仅作为数学世界锚点的初始化/校准来源
    new THREEx.ArMarkerControls(this.arToolkitContext, this.arMarkerRoot, {
      type: 'pattern',
      patternUrl: '/arcode/myTraining.patt',
      changeMatrixMode: 'modelViewMatrix',
      maxDetectionRate: 60,
    })

    this.scene.visible = false
  }

  // 强制样式工具函数
  private applyVideoForceStyle(video: HTMLVideoElement) {
    video.style.position = 'absolute'
    video.style.top = '0'
    video.style.left = '0'
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover' // contain可以确保完整显示画面
    video.style.zIndex = '0'
    video.style.pointerEvents = 'none'

    // 关键：清除 AR.js 可能会自动生成的负 margin
    video.style.marginLeft = '0px'
    video.style.marginTop = '0px'
  }

  render() {
    if (this.isARMode) {
      if (!this.arToolkitContext || this.arToolkitSource?.ready === false) return

      const sourceElement = this.arToolkitSource?.domElement
      if (!sourceElement) return
      this.arToolkitContext.update(sourceElement)
      this.arCamera.updateMatrixWorld(true)
      this.syncARAnchorFromMarker()
      this.scene.visible = this.arMarkerRoot.visible || this.shouldRenderPersistentARWorld()
    } else {
      this.scene.visible = true
      this.controls.update()
    }

    this.updateSharedWorldRotation()
    this.updateResponsiveScales()
    this.updateScreenSpaceLabels()
    this.renderer.render(this.scene, this.getActiveCamera())
  }

  private updateSharedWorldRotation() {
    if (!this.sharedWorldRotationInitialized) {
      this.sharedWorldRotationInitialized = true
      this.sharedWorldTargetQuaternion.copy(this.world.quaternion)
      return
    }
    if (this.world.quaternion.angleTo(this.sharedWorldTargetQuaternion) <= 0.0001) return
    this.world.quaternion.slerp(
      this.sharedWorldTargetQuaternion,
      ThreeRenderer.SHARED_WORLD_ROTATION_LERP,
    )
    this.world.quaternion.normalize()
    this.world.updateMatrixWorld(true)
  }

  syncContainerAspect() {
    if (!this.container || this.isARMode) return
    const w = Math.max(this.container.clientWidth, 1)
    const h = Math.max(this.container.clientHeight, 1)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  // 暴露给外部用于处理窗口缩放
  onResize() {
    if (!this.container) return
    const w = Math.max(this.container.clientWidth, 1)
    const h = Math.max(this.container.clientHeight, 1)

    // 更新渲染器
    this.updateRendererPixelRatio()
    this.renderer.setSize(w, h, false)

    if (!this.isARMode) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    } else if (this.arToolkitSource && this.arToolkitSource.ready) {
      const source = this.arToolkitSource
      const video = source.domElement

      // 尝试调用 AR.js 自带的 resize
      if (typeof source.onResizeElement === 'function') source.onResizeElement()
      else if (typeof source.onResize === 'function') source.onResize()

      // 在 AR.js 计算完后，立即强行把样式改回来
      // AR.js 经常会把视频设为 width: 640px 这种固定值，我们要强行覆盖它
      if (video) {
        this.applyVideoForceStyle(video)
      }

      //同步 Canvas 尺寸
      if (typeof source.copyElementSizeTo === 'function') {
        source.copyElementSizeTo(this.renderer.domElement)
      } else if (typeof source.copySizeTo === 'function') {
        source.copySizeTo(this.renderer.domElement)
      }

      // 如果使用了 contain，我们要确保渲染器 domElement 也是 absolute 居中的
      this.renderer.domElement.style.width = '100%'
      this.renderer.domElement.style.height = '100%'
      this.renderer.domElement.style.objectFit = 'contain'
    }

    this.refreshScreenSpaceScales()
  }

  private syncPoints(scene: GeoScene, dirtyState: SceneRenderSyncState) {
    dirtyState.pointIds.forEach((pointId) => {
      const p = scene.points.get(pointId)
      if (!p) return
      let sprite = this.meshMap.get(p.id) as THREE.Sprite

      if (!sprite) {
        const material = new THREE.SpriteMaterial({
          color: 0xff5555,
          depthTest: false, // 始终可见
          depthWrite: false,
          sizeAttenuation: false,
        })
        material.map = this.getPointTexture()
        material.transparent = true
        material.alphaTest = 0.1

        sprite = new THREE.Sprite(material)
        sprite.renderOrder = 2

        const scale = this.getPointSpriteScale()

        sprite.scale.set(scale, scale, 1)

        sprite.userData = {
          type: 'point',
          geoId: p.id,
        }

        this.world.add(sprite)
        this.meshMap.set(p.id, sprite)
      }

      // 同步位置
      sprite.position.set(p.position.x, p.position.y, p.position.z)

      // 选中高亮
      const isSelected = scene.selection.points.has(p.id)
      const isIntersectionPoint = Boolean(scene.getIntersectionConstraint(p.id))
      const isCubeDependentPoint = p.cubeRole === 'dependent'
      const baseColor = p.locked
        ? 0xffffff
        : isIntersectionPoint
          ? ThreeRenderer.INTERSECTION_POINT_COLOR
          : isCubeDependentPoint
            ? ThreeRenderer.CUBE_DEPENDENT_POINT_COLOR
            : 0xff5555
      ;(sprite.material as THREE.SpriteMaterial).color.set(isSelected ? 0x43f260 : baseColor)

      // 点名称标签
      const isLabelActive =
        this.activeLabelTarget?.type === 'point' && this.activeLabelTarget.geoId === p.id
      const labelColor = isLabelActive ? 0x43f260 : 0xffffff
      const labelKey = '__labelSprite'
      const spriteUserData = this.getRenderUserData(sprite)
      const existingLabel = spriteUserData[labelKey] as THREE.Sprite | undefined
      const existingValueLabel = spriteUserData.__valueLabelSprite
      if (existingValueLabel) existingValueLabel.visible = false
      spriteUserData.__labelOffsetX = p.labelOffsetX
      spriteUserData.__labelOffsetY = p.labelOffsetY
      const pointValueText = `=(${this.formatMetricNumber(p.position.x)},${this.formatMetricNumber(p.position.y)},${this.formatMetricNumber(p.position.z)})`
      const combinedPointText = p.valueVisible ? pointValueText : ''
      if (!p.nameVisible && !p.valueVisible) {
        if (existingLabel) existingLabel.visible = false
      } else if (!existingLabel) {
        const nameSprite = p.nameVisible
          ? this.makePointLabelSprite(p.name ?? '', labelColor, combinedPointText)
          : this.makeValueLabelSprite(pointValueText, labelColor, true)
        nameSprite.position.copy(this.getSmartLabelPosition(sprite.position))
        const nameSpriteData = this.getLabelUserData(nameSprite)
        nameSprite.center.set(
          p.nameVisible
            ? combinedPointText
              ? this.getStableLabelCenterX(nameSpriteData.canvasPixelWidth ?? 256, true)
              : this.getDefaultLabelCenterX(true)
            : 0.5,
          ThreeRenderer.POINT_LABEL_CENTER_Y,
        )
        nameSprite.renderOrder = 10
        const scale = this.getPointLabelScale()
        this.setLabelSpriteScale(nameSprite, scale)
        const labelUserData = nameSpriteData
        labelUserData.text = p.nameVisible ? `${p.name ?? ''}${combinedPointText}` : pointValueText
        labelUserData.isNameLabel = true
        labelUserData.geoId = p.id
        labelUserData.geoType = 'point'
        spriteUserData[labelKey] = nameSprite
        this.world.add(nameSprite)
      } else {
        existingLabel.visible = true
        existingLabel.center.set(
          p.nameVisible
            ? combinedPointText
              ? this.getStableLabelCenterX(
                  this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256,
                  true,
                )
              : this.getDefaultLabelCenterX(true)
            : 0.5,
          ThreeRenderer.POINT_LABEL_CENTER_Y,
        )
        existingLabel.position.copy(this.getSmartLabelPosition(sprite.position))
        const nextText = p.nameVisible ? `${p.name ?? ''}${combinedPointText}` : pointValueText
        const labelText = this.getLabelUserData(existingLabel).text ?? ''
        if (labelText !== nextText) {
          this.getLabelUserData(existingLabel).text = nextText
          const material = existingLabel.material as THREE.SpriteMaterial
          const newSprite = p.nameVisible
            ? this.makePointLabelSprite(p.name ?? '', labelColor, combinedPointText)
            : this.makeValueLabelSprite(pointValueText, labelColor, true)
          Object.assign(this.getLabelUserData(existingLabel), this.getLabelUserData(newSprite))
          material.map = (newSprite.material as THREE.SpriteMaterial).map
          existingLabel.center.set(
            p.nameVisible
              ? combinedPointText
                ? this.getStableLabelCenterX(
                    this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256,
                    true,
                  )
                : this.getDefaultLabelCenterX(true)
              : 0.5,
            ThreeRenderer.POINT_LABEL_CENTER_Y,
          )
          this.setLabelSpriteScale(existingLabel, this.getPointLabelScale())
        } else {
          const material = existingLabel.material as THREE.SpriteMaterial
          const map = material.map as THREE.CanvasTexture | null
          if (map) {
            const ctx = (map.image as HTMLCanvasElement).getContext('2d')
            if (ctx) {
              Object.assign(
                this.getLabelUserData(existingLabel),
                p.nameVisible
                  ? this.drawCombinedLabel(
                      ctx,
                      map.image as HTMLCanvasElement,
                      p.name ?? '',
                      combinedPointText,
                      labelColor,
                      72,
                    )
                  : this.drawPlainLabel(
                      ctx,
                      map.image as HTMLCanvasElement,
                      pointValueText,
                      labelColor,
                      72,
                    ),
              )
              map.needsUpdate = true
              existingLabel.center.set(
                p.nameVisible
                  ? combinedPointText
                    ? this.getStableLabelCenterX(
                        this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256,
                        true,
                      )
                    : this.getDefaultLabelCenterX(true)
                  : 0.5,
                ThreeRenderer.POINT_LABEL_CENTER_Y,
              )
              this.setLabelSpriteScale(existingLabel, this.getPointLabelScale())
            }
          }
        }
      }
    })
    if (this.currentSceneRef) {
      ;[...this.currentSceneRef.cubeConstraints.values()]
        .filter((constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint)
        .forEach((cube) => {
          const label = this.cubeValueLabels.get(cube.cubeId)
          const centroid = cube.getCentroid()
          if (!label || !label.visible || !centroid) return
          label.position.copy(
            this.getScreenOffsetPosition(
              new THREE.Vector3(centroid.x, centroid.y, centroid.z),
              0,
              ThreeRenderer.LINE_LABEL_OFFSET_Y,
            ),
          )
        })
    }
  }

  private syncLines(scene: GeoScene, dirtyState: SceneRenderSyncState) {
    dirtyState.lineIds.forEach((id) => {
      const lineData = scene.lines.get(id)
      if (!lineData) return
      let line = this.meshMap.get(id) as THREE.Line
      const p1 = lineData.p1.position
      const p2 = lineData.p2.position
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]

      if (!line) {
        // 首次创建
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: ThreeRenderer.LINEAR_COLOR,
          linewidth: ThreeRenderer.LINEAR_WIDTH,
        })
        line = new THREE.Line(geo, mat)
        line.userData = { geoId: id, type: 'line' }
        this.world.add(line)
        this.meshMap.set(id, line)
      } else {
        // 1. 更新顶点数据
        line.geometry.setFromPoints(points)

        // 2. 必须告诉 Three.js 顶点缓冲区需要更新
        line.geometry.attributes.position!.needsUpdate = true

        // 3. 必须重新计算包围盒，否则射线检测（Raycaster）还会去旧地方找线
        line.geometry.computeBoundingBox()
        line.geometry.computeBoundingSphere()
      }

      line.visible = lineData.visible !== false

      // 选中高亮逻辑
      const isSelected = scene.selection.lines.has(id)
      ;(line.material as THREE.LineBasicMaterial).color.set(
        isSelected ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
      )

      const mid = new THREE.Vector3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
      const isLabelActive =
        this.activeLabelTarget?.type === 'line' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        line,
        lineData.name ?? '',
        lineData.nameVisible && lineData.visible !== false,
        lineData.valueVisible === true && lineData.visible !== false,
        `=${this.formatMetricNumber(lineData.getLength())}`,
        mid,
        isLabelActive ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
      )
    })
  }

  private syncRays(scene: GeoScene, dirtyState: SceneRenderSyncState) {
    dirtyState.rayIds.forEach((id) => {
      const rayData = scene.rays.get(id)
      if (!rayData) return
      let ray = this.meshMap.get(id) as THREE.Line | undefined
      const p1 = rayData.p1.position
      const end = rayData.getDisplayEndPoint()
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(end.x, end.y, end.z)]

      if (!ray) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: ThreeRenderer.LINEAR_COLOR,
          linewidth: ThreeRenderer.LINEAR_WIDTH,
        })
        ray = new THREE.Line(geo, mat)
        ray.userData = { geoId: id, type: 'ray' }
        this.attachRayArrowHead(ray)
        this.world.add(ray)
        this.meshMap.set(id, ray)
      } else {
        ray.geometry.setFromPoints(points)
        ray.geometry.attributes.position!.needsUpdate = true
        ray.geometry.computeBoundingBox()
        ray.geometry.computeBoundingSphere()
      }

      ray.visible = rayData.visible
      const isSelected = scene.selection.rays.has(id)
      ;(ray.material as THREE.LineBasicMaterial).color.set(
        isSelected ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
      )

      this.updateRayArrowHead(ray, rayData, isSelected)
      const mid = new THREE.Vector3((p1.x + end.x) / 2, (p1.y + end.y) / 2, (p1.z + end.z) / 2)
      const isLabelActive =
        this.activeLabelTarget?.type === 'ray' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        ray,
        rayData.name ?? '',
        rayData.nameVisible && rayData.visible,
        rayData.valueVisible === true && rayData.visible,
        `=(${this.formatMetricNumber(rayData.p1.position.x)},${this.formatMetricNumber(rayData.p1.position.y)},${this.formatMetricNumber(rayData.p1.position.z)})+λ(${this.formatMetricNumber(rayData.getDirectionVector().x)},${this.formatMetricNumber(rayData.getDirectionVector().y)},${this.formatMetricNumber(rayData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
      )
    })
  }

  private syncStraightLines(scene: GeoScene, dirtyState: SceneRenderSyncState) {
    dirtyState.straightLineIds.forEach((id) => {
      const lineData = scene.straightLines.get(id)
      if (!lineData) return
      let line = this.meshMap.get(id) as THREE.Line | undefined
      const display = lineData.getDisplayPoints()
      const start = display.start
      const end = display.end
      const points = [
        new THREE.Vector3(start.x, start.y, start.z),
        new THREE.Vector3(end.x, end.y, end.z),
      ]

      if (!line) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: ThreeRenderer.LINEAR_COLOR,
          linewidth: ThreeRenderer.LINEAR_WIDTH,
        })
        line = new THREE.Line(geo, mat)
        line.userData = { geoId: id, type: 'straightLine' }
        this.world.add(line)
        this.meshMap.set(id, line)
      } else {
        line.geometry.setFromPoints(points)
        line.geometry.attributes.position!.needsUpdate = true
        line.geometry.computeBoundingBox()
        line.geometry.computeBoundingSphere()
      }

      line.visible = lineData.visible
      const isSelected = scene.selection.straightLines.has(id)
      ;(line.material as THREE.LineBasicMaterial).color.set(
        isSelected ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
      )

      const mid = new THREE.Vector3(
        (lineData.p1.position.x + lineData.p2.position.x) / 2,
        (lineData.p1.position.y + lineData.p2.position.y) / 2,
        (lineData.p1.position.z + lineData.p2.position.z) / 2,
      )
      const isLabelActive =
        this.activeLabelTarget?.type === 'straightLine' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        line,
        lineData.name ?? '',
        lineData.nameVisible && lineData.visible,
        lineData.valueVisible === true && lineData.visible,
        `=(${this.formatMetricNumber(lineData.p1.position.x)},${this.formatMetricNumber(lineData.p1.position.y)},${this.formatMetricNumber(lineData.p1.position.z)})+λ(${this.formatMetricNumber(lineData.getDirectionVector().x)},${this.formatMetricNumber(lineData.getDirectionVector().y)},${this.formatMetricNumber(lineData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
      )
    })
  }

  private syncFaces(scene: GeoScene, dirtyState: SceneRenderSyncState) {
    dirtyState.faceIds.forEach((id) => {
      const faceData = scene.faces.get(id)
      if (!faceData) return
      let faceMesh = this.meshMap.get(id) as THREE.Mesh | undefined
      const triangulated = triangulateFace(faceData.boundaryPointIds, scene.points)
      if (!triangulated) return

      if (!faceMesh) {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.MeshBasicMaterial({
          color: faceData.fillColor ?? ThreeRenderer.FACE_FILL_COLOR,
          transparent: true,
          opacity: faceData.fillOpacity ?? ThreeRenderer.FACE_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
        faceMesh = new THREE.Mesh(geometry, material)
        faceMesh.userData = { geoId: id, type: 'face' }
        const outline = new THREE.LineLoop(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: ThreeRenderer.LINEAR_COLOR,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
          }),
        )
        outline.userData = { geoId: id, type: 'face' }
        outline.renderOrder = 12
        faceMesh.add(outline)
        this.world.add(faceMesh)
        this.meshMap.set(id, faceMesh)
      }

      const geometry = faceMesh.geometry as THREE.BufferGeometry
      geometry.setFromPoints(triangulated.positions)
      geometry.setIndex(triangulated.indices)
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()

      const outline = faceMesh.children[0] as THREE.LineLoop | undefined
      if (outline) {
        outline.geometry.setFromPoints([
          ...faceData
            .getBoundaryPoints(scene.points)
            .map(
              (point) => new THREE.Vector3(point.position.x, point.position.y, point.position.z),
            ),
        ])
        outline.geometry.computeBoundingBox()
        outline.geometry.computeBoundingSphere()
      }

      faceMesh.visible = faceData.visible !== false
      if (outline) outline.visible = faceData.visible !== false

      const isSelected = scene.selection.faces.has(id)
      const cubeConstraint = faceData.cubeId
        ? (scene.getCubeConstraint(faceData.cubeId) as CubeConstraint | null)
        : null
      const isCubeFullySelected = Boolean(
        cubeConstraint &&
          cubeConstraint.faceIds.length > 0 &&
          cubeConstraint.faceIds.every((faceId) => scene.selection.faces.has(faceId)),
      )
      const shouldHighlightFaceFill = isSelected && !isCubeFullySelected
      const baseColor = faceData.fillColor ?? ThreeRenderer.FACE_FILL_COLOR
      const baseOpacity = faceData.fillOpacity ?? ThreeRenderer.FACE_FILL_OPACITY
      ;(faceMesh.material as THREE.MeshBasicMaterial).color.set(
        shouldHighlightFaceFill ? ThreeRenderer.FACE_SELECTED_COLOR : baseColor,
      )
      ;(faceMesh.material as THREE.MeshBasicMaterial).opacity = shouldHighlightFaceFill
        ? Math.max(baseOpacity, ThreeRenderer.FACE_SELECTED_OPACITY)
        : baseOpacity
      if (outline) {
        ;(outline.material as THREE.LineBasicMaterial).color.set(
          isSelected ? ThreeRenderer.FACE_SELECTED_COLOR : ThreeRenderer.LINEAR_COLOR,
        )
        ;(outline.material as THREE.LineBasicMaterial).opacity = isSelected ? 1 : 0.95
      }

      const isLabelActive =
        this.activeLabelTarget?.type === 'face' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        faceMesh,
        faceData.name ?? '',
        faceData.nameVisible && faceData.visible !== false,
        faceData.valueVisible === true,
        `=${this.formatMetricNumber(faceData.getArea(scene.points))}`,
        new THREE.Vector3(
          faceData.getCentroid(scene.points).x,
          faceData.getCentroid(scene.points).y,
          faceData.getCentroid(scene.points).z,
        ),
        isLabelActive ? ThreeRenderer.FACE_SELECTED_COLOR : ThreeRenderer.LINEAR_COLOR,
      )
    })
  }

  private syncCubeValueLabels(scene: GeoScene) {
    const cubes = [...scene.cubeConstraints.values()].filter(
      (constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint,
    )
    const activeCubeIds = new Set(cubes.map((cube) => cube.cubeId))
    this.cubeValueLabels.forEach((label, cubeId) => {
      if (activeCubeIds.has(cubeId)) return
      this.world.remove(label)
      this.cubeValueLabels.delete(cubeId)
    })

    cubes.forEach((cube) => {
      const centroid = cube.getCentroid()
      const visible = cube.valueVisible === true && centroid !== null
      const existing = this.cubeValueLabels.get(cube.cubeId)
      if (!visible) {
        if (existing) existing.visible = false
        return
      }
      const text = `=${this.formatMetricNumber(cube.getVolume())}`
      const color = ThreeRenderer.LINEAR_COLOR
      if (!existing) {
        const sprite = this.makeValueLabelSprite(text, color, false)
        sprite.center.set(0.5, ThreeRenderer.LINE_LABEL_CENTER_Y)
        sprite.renderOrder = 10
        this.setAdaptiveSpriteScale(sprite, this.getLineLabelScale())
        const userData = this.getLabelUserData(sprite)
        userData.text = text
        userData.isNameLabel = true
        userData.isValueLabel = true
        userData.geoId = cube.faceIds[0] ?? cube.cubeId
        userData.geoType = 'face'
        sprite.position.copy(
          this.getScreenOffsetPosition(
            new THREE.Vector3(centroid.x, centroid.y, centroid.z),
            0,
            ThreeRenderer.LINE_LABEL_OFFSET_Y,
          ),
        )
        this.cubeValueLabels.set(cube.cubeId, sprite)
        this.world.add(sprite)
        return
      }
      existing.visible = true
      existing.position.copy(
        this.getScreenOffsetPosition(
          new THREE.Vector3(centroid.x, centroid.y, centroid.z),
          0,
          ThreeRenderer.LINE_LABEL_OFFSET_Y,
        ),
      )
      const labelData = this.getLabelUserData(existing)
      if (labelData.text !== text) {
        labelData.text = text
        const material = existing.material as THREE.SpriteMaterial
        const nextSprite = this.makeValueLabelSprite(text, color, false)
        material.map = (nextSprite.material as THREE.SpriteMaterial).map
        Object.assign(labelData, this.getLabelUserData(nextSprite))
        labelData.text = text
        labelData.isNameLabel = true
        labelData.isValueLabel = true
        labelData.geoId = cube.faceIds[0] ?? cube.cubeId
        labelData.geoType = 'face'
        this.setAdaptiveSpriteScale(existing, this.getLineLabelScale())
      }
    })
  }

  private syncLinearLabel(
    object: THREE.Object3D,
    text: string,
    visible: boolean,
    valueVisible: boolean,
    valueText: string,
    anchor: THREE.Vector3,
    color: number,
  ) {
    const labelKey = '__labelSprite'
    const objectUserData = this.getRenderUserData(object)
    const existingLabel = objectUserData[labelKey] as THREE.Sprite | undefined
    const existingValueLabel = objectUserData.__valueLabelSprite
    if (existingValueLabel) existingValueLabel.visible = false
    objectUserData.__labelAnchor = anchor.clone()
    const source = this.getLinearLabelSource(object)
    objectUserData.__labelOffsetX = source?.labelOffsetX ?? 0
    objectUserData.__labelOffsetY = source?.labelOffsetY ?? ThreeRenderer.LINE_LABEL_OFFSET_Y
    const showAny = visible || valueVisible
    const combinedValueText = valueVisible ? valueText : ''
    if (!showAny) {
      if (existingLabel) existingLabel.visible = false
    } else if (!existingLabel) {
      const nameSprite = visible
        ? this.makeLineLabelSprite(text, color, combinedValueText)
        : this.makeValueLabelSprite(valueText, color, false)
      const nameSpriteData = this.getLabelUserData(nameSprite)
      nameSprite.position.copy(
        this.getScreenOffsetPosition(anchor, 0, ThreeRenderer.LINE_LABEL_OFFSET_Y),
      )
      nameSprite.center.set(
        visible
          ? combinedValueText
            ? this.getStableLabelCenterX(nameSpriteData.canvasPixelWidth ?? 256, false)
            : this.getDefaultLabelCenterX(false)
          : 0.5,
        ThreeRenderer.LINE_LABEL_CENTER_Y,
      )
      nameSprite.renderOrder = 10
      const scale = this.getLineLabelScale()
      this.setLabelSpriteScale(nameSprite, scale)
      const labelUserData = nameSpriteData
      labelUserData.text = visible ? `${text}${combinedValueText}` : valueText
      labelUserData.isNameLabel = true
      labelUserData.geoId = object.userData.geoId
      labelUserData.geoType = object.userData.type
      objectUserData[labelKey] = nameSprite
      this.world.add(nameSprite)
    } else {
      existingLabel.visible = true
      existingLabel.center.set(
        visible
          ? combinedValueText
            ? this.getStableLabelCenterX(
                this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256,
                false,
              )
            : this.getDefaultLabelCenterX(false)
          : 0.5,
        ThreeRenderer.LINE_LABEL_CENTER_Y,
      )
      existingLabel.position.copy(
        this.getScreenOffsetPosition(anchor, 0, ThreeRenderer.LINE_LABEL_OFFSET_Y),
      )
      const nextText = visible ? `${text}${combinedValueText}` : valueText
      const labelText = this.getLabelUserData(existingLabel).text ?? ''
      if (labelText !== nextText) {
        this.getLabelUserData(existingLabel).text = nextText
        const material = existingLabel.material as THREE.SpriteMaterial
        const newSprite = visible
          ? this.makeLineLabelSprite(text, color, combinedValueText)
          : this.makeValueLabelSprite(valueText, color, false)
        Object.assign(this.getLabelUserData(existingLabel), this.getLabelUserData(newSprite))
        material.map = (newSprite.material as THREE.SpriteMaterial).map
        existingLabel.center.set(
          visible
            ? combinedValueText
              ? this.getStableLabelCenterX(
                  this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256,
                  false,
                )
              : this.getDefaultLabelCenterX(false)
            : 0.5,
          ThreeRenderer.LINE_LABEL_CENTER_Y,
        )
        this.setLabelSpriteScale(existingLabel, this.getLineLabelScale())
      } else {
        const material = existingLabel.material as THREE.SpriteMaterial
        const map = material.map as THREE.CanvasTexture | null
        if (map) {
          const ctx = (map.image as HTMLCanvasElement).getContext('2d')
          if (ctx) {
            Object.assign(
              this.getLabelUserData(existingLabel),
              visible
                ? this.drawCombinedLabel(
                    ctx,
                    map.image as HTMLCanvasElement,
                    text,
                    combinedValueText,
                    color,
                    56,
                  )
                : this.drawPlainLabel(ctx, map.image as HTMLCanvasElement, valueText, color, 56),
            )
            map.needsUpdate = true
            existingLabel.center.set(
              visible
                ? combinedValueText
                  ? this.getStableLabelCenterX(
                      this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256,
                      false,
                    )
                  : this.getDefaultLabelCenterX(false)
                : 0.5,
              ThreeRenderer.LINE_LABEL_CENTER_Y,
            )
            this.setLabelSpriteScale(existingLabel, this.getLineLabelScale())
          }
        }
      }
    }
  }

  private attachRayArrowHead(ray: THREE.Line) {
    const geometry = new THREE.ConeGeometry(
      ThreeRenderer.RAY_HEAD_RADIUS,
      ThreeRenderer.RAY_HEAD_LENGTH,
      16,
    )
    const material = new THREE.MeshBasicMaterial({ color: ThreeRenderer.LINEAR_COLOR })
    const arrowHead = new THREE.Mesh(geometry, material)
    arrowHead.rotation.x = Math.PI / 2
    this.getRenderUserData(ray).__arrowHead = arrowHead
    ray.add(arrowHead)
  }

  private updateRayArrowHead(ray: THREE.Line, rayData: Ray3, isSelected: boolean) {
    const arrowHead = this.getRenderUserData(ray).__arrowHead
    if (!arrowHead) return

    arrowHead.visible = rayData.visible
    ;(arrowHead.material as THREE.MeshBasicMaterial).color.set(
      isSelected ? 0x43f260 : ThreeRenderer.LINEAR_COLOR,
    )

    const start = new THREE.Vector3(
      rayData.p1.position.x,
      rayData.p1.position.y,
      rayData.p1.position.z,
    )
    const end = new THREE.Vector3(
      rayData.getDisplayEndPoint().x,
      rayData.getDisplayEndPoint().y,
      rayData.getDisplayEndPoint().z,
    )
    const direction = end.clone().sub(start)
    const length = direction.length()
    if (length === 0) {
      arrowHead.position.copy(start)
      return
    }

    direction.normalize()
    arrowHead.position.copy(end)
    arrowHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private addCustomAxes(len: number) {
    // X 轴：红色箭头 + 红色 "X" 标签
    this.addSimpleAxis(new THREE.Vector3(1, 0, 0), 0xff0000, len, 'X轴')

    // Y 轴：绿色箭头 + 绿色 "Y" 标签 + 白色刻度线
    this.addAxisWithSimpleTicks(new THREE.Vector3(0, 1, 0), 0x00ff00, len, 'Y轴')

    // Z 轴：蓝色箭头 + 蓝色 "Z" 标签
    this.addSimpleAxis(new THREE.Vector3(0, 0, 1), 0x0000ff, len, 'Z轴')
  }

  /** 简单轴：箭头 + 反向线 + 与轴同色的文字标签 */
  private addSimpleAxis(dir: THREE.Vector3, color: number, length: number, label: string) {
    const isGroundAxis = dir.y === 0
    const axisYOffset = isGroundAxis ? ThreeRenderer.AXIS_LIFT_Y : 0
    const axisMaterial = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false })

    // 正/负方向共用同一条轴线材质，保证颜色深度一致
    const axisPoints = [
      dir.clone().multiplyScalar(-length).setY(axisYOffset),
      new THREE.Vector3(0, axisYOffset, 0),
      new THREE.Vector3(0, axisYOffset, 0),
      dir.clone().multiplyScalar(length).setY(axisYOffset),
    ]
    const axisGeometry = new THREE.BufferGeometry().setFromPoints(axisPoints)
    const axisLine = new THREE.LineSegments(axisGeometry, axisMaterial)
    axisLine.renderOrder = 20
    this.axisGridGroup.add(axisLine)

    // 正方向箭头样式与 Y 轴保持一致
    const arrow = new THREE.ArrowHelper(
      dir,
      dir.clone().multiplyScalar(length).setY(axisYOffset),
      ThreeRenderer.AXIS_ARROW_BASE_LENGTH,
      color,
      ThreeRenderer.AXIS_ARROW_BASE_HEAD_LENGTH,
      ThreeRenderer.AXIS_ARROW_BASE_HEAD_WIDTH,
    )
    const arrowUserData = this.getAxisArrowUserData(arrow)
    arrowUserData.__baseLength = ThreeRenderer.AXIS_ARROW_BASE_LENGTH
    arrowUserData.__baseHeadLength = ThreeRenderer.AXIS_ARROW_BASE_HEAD_LENGTH
    arrowUserData.__baseHeadWidth = ThreeRenderer.AXIS_ARROW_BASE_HEAD_WIDTH
    arrow.renderOrder = 21
    arrow.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) {
        material.forEach((m) => {
          m.depthTest = false
          m.depthWrite = false
        })
      } else if (material) {
        material.depthTest = false
        material.depthWrite = false
      }
    })
    this.axisGridGroup.add(arrow)
    this.axisArrows.push(arrow)

    // X/Z 轴刻度线：每 1 单位一条短竖线（与 Y 轴一致为白色）
    if (isGroundAxis) {
      const tickVertices: number[] = []
      const tickLength = 0.2
      const isXAxis = Math.abs(dir.x) > 0.5
      const tickOffset = isXAxis
        ? new THREE.Vector3(0, 0, tickLength)
        : new THREE.Vector3(tickLength, 0, 0)
      for (let i = -length; i <= length; i++) {
        if (i === 0) continue

        const base = dir.clone().multiplyScalar(i).setY(axisYOffset)
        const end = base.clone().add(tickOffset)
        tickVertices.push(base.x, base.y, base.z, end.x, end.y, end.z)
      }
      if (tickVertices.length > 0) {
        const tickGeo = new THREE.BufferGeometry()
        tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickVertices, 3))
        const tickLine = new THREE.LineSegments(
          tickGeo,
          new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
        )
        tickLine.renderOrder = 20
        this.axisGridGroup.add(tickLine)
      }
    }

    // 与轴同色的文字标签，位置远离轴端（距离 1.2 单位），于Y轴分开显示
    const labelPos = dir
      .clone()
      .multiplyScalar(length + 1.2)
      .setY(axisYOffset)
    const textSprite = this.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    const labelUserData = this.getAxisLabelUserData(textSprite)
    labelUserData.__axisDir = dir.clone()
    labelUserData.__axisLength = length
    labelUserData.__axisLabelOffset = 1.2
    labelUserData.__axisYOffset = axisYOffset
    this.axisGridGroup.add(textSprite)
    this.axisLabels.push(textSprite)
  }

  /** Y 轴专用：主轴 + 箭头 + 白色刻度线 + 绿色 "Y" 标签 */
  private addAxisWithSimpleTicks(dir: THREE.Vector3, color: number, length: number, label: string) {
    // 主轴线（正负方向完整显示）
    const points = [
      dir.clone().multiplyScalar(-length),
      new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(length),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color })
    const line = new THREE.Line(geometry, material)
    this.axisGridGroup.add(line)

    // 正方向箭头
    const arrow = new THREE.ArrowHelper(
      dir,
      dir.clone().multiplyScalar(length),
      ThreeRenderer.AXIS_ARROW_BASE_LENGTH,
      color,
      ThreeRenderer.AXIS_ARROW_BASE_HEAD_LENGTH,
      ThreeRenderer.AXIS_ARROW_BASE_HEAD_WIDTH,
    )
    const arrowUserData = this.getAxisArrowUserData(arrow)
    arrowUserData.__baseLength = ThreeRenderer.AXIS_ARROW_BASE_LENGTH
    arrowUserData.__baseHeadLength = ThreeRenderer.AXIS_ARROW_BASE_HEAD_LENGTH
    arrowUserData.__baseHeadWidth = ThreeRenderer.AXIS_ARROW_BASE_HEAD_WIDTH
    this.axisGridGroup.add(arrow)
    this.axisArrows.push(arrow)

    // 白色刻度线（每1单位一条短横线）
    // 合并到一个 LineSegments，避免每条刻度都产生单独的 draw call。
    const tickVertices: number[] = []
    for (let i = -length; i <= length; i++) {
      if (i === 0) continue

      const tickStart = dir.clone().multiplyScalar(i)
      const tickEnd = tickStart.clone().add(new THREE.Vector3(0.2, 0, 0)) // 向 X 方向偏移
      tickVertices.push(tickStart.x, tickStart.y, tickStart.z, tickEnd.x, tickEnd.y, tickEnd.z)
    }
    if (tickVertices.length > 0) {
      const tickGeo = new THREE.BufferGeometry()
      tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickVertices, 3))
      const tickLine = new THREE.LineSegments(
        tickGeo,
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      )
      this.axisGridGroup.add(tickLine)
    }

    // 绿色 "Y" 标签，远离轴端
    const labelPos = dir.clone().multiplyScalar(length + 1.2)
    const textSprite = this.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    const labelUserData = this.getAxisLabelUserData(textSprite)
    labelUserData.__axisDir = dir.clone()
    labelUserData.__axisLength = length
    labelUserData.__axisLabelOffset = 1.2
    labelUserData.__axisYOffset = 0
    this.axisGridGroup.add(textSprite)
    this.axisLabels.push(textSprite)
  }

  private getDefaultCameraPositionForAxisSize(size: number): THREE.Vector3 {
    if (size === 20) return new THREE.Vector3(25, 25, 25)
    if (size === 40) return new THREE.Vector3(30, 65, 30)
    return new THREE.Vector3(15, 15, 15)
  }

  resetView() {
    const defaultPos = this.getDefaultCameraPositionForAxisSize(this.axisGridSize)
    this.controls.target.set(0, 0, 0)
    this.camera.position.copy(defaultPos)
    this.camera.zoom = 1
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
    this.controls.update()
  }

  getAxisGridSize() {
    return this.axisGridSize
  }

  isAxisGridVisible() {
    return this.isGridVisible
  }

  setAxisGridVisible(visible: boolean) {
    this.isGridVisible = visible
    if (this.gridHelper) {
      this.gridHelper.visible = visible
    }
  }

  isCoordinateSystemVisible() {
    return this.coordinateSystemVisible
  }

  setCoordinateSystemVisible(visible: boolean) {
    this.coordinateSystemVisible = visible
    this.axisGridGroup.visible = visible
  }

  setAxisGridSize(size: number) {
    this.axisGridSize = size
    this.updateRendererPixelRatio()
    this.axisArrows = []
    this.axisLabels = []

    // 清空旧的坐标轴与网格
    while (this.axisGridGroup.children.length > 0) {
      const child = this.axisGridGroup.children.pop()!
      this.axisGridGroup.remove(child)
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
      const material = (child as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined
      geometry?.dispose()
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose()
    }

    // 坐标轴正负方向长度 = size（总长度 = 2 * size）
    this.addCustomAxes(size)

    // 网格尺寸与坐标轴总长度对齐：总长度 = 2 * size
    // 分割数 = 2 * size（保持每格 1 单位）
    const gridSize = size * 2
    const divisions = gridSize
    this.gridHelper = new THREE.GridHelper(gridSize, divisions)
    this.gridHelper.renderOrder = 0
    const gridMaterial = this.gridHelper.material as THREE.Material | THREE.Material[]
    const applyGridMaterial = (material: THREE.Material) => {
      material.depthWrite = false
      material.polygonOffset = true
      material.polygonOffsetFactor = 1
      material.polygonOffsetUnits = 1
    }
    if (Array.isArray(gridMaterial)) gridMaterial.forEach(applyGridMaterial)
    else applyGridMaterial(gridMaterial)
    this.gridHelper.visible = this.isGridVisible
    this.axisGridGroup.add(this.gridHelper)
    this.camera.position.copy(this.getDefaultCameraPositionForAxisSize(this.axisGridSize))
    if (this.isARMode) {
      this.setWorldScale(this.getARSceneScaleForAxisSize(this.axisGridSize))
      this.updateAxisArrowScales()
      return
    }
    this.refreshScreenSpaceScales()
    this.updateAxisArrowScales()
  }

  private drawNameLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    message: string,
    color: number,
    mainFontSize: number,
  ) {
    const metrics = this.measureNameText(message, mainFontSize)
    const nextWidth = 256
    const nextHeight = 256
    if (canvas.width !== nextWidth) canvas.width = nextWidth
    if (canvas.height !== nextHeight) canvas.height = nextHeight

    const ctx = canvas.getContext('2d')!
    const baselineY = canvas.height / 2 + mainFontSize * 0.18
    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    const startX = (canvas.width - metrics.width) / 2

    ctx.font = `Bold ${mainFontSize}px Arial`
    ctx.fillText(metrics.mainText, startX, baselineY)

    if (metrics.suffixText) {
      ctx.font = `Bold ${metrics.suffixFontSize}px Arial`
      ctx.fillText(
        metrics.suffixText,
        startX + metrics.mainWidth + metrics.gap,
        baselineY + mainFontSize * 0.22,
      )
    }

    return {
      textPixelWidth: metrics.width,
      textPixelHeight: mainFontSize,
      canvasPixelWidth: canvas.width,
      canvasPixelHeight: canvas.height,
    }
  }

  private measureNameText(message: string, mainFontSize: number) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const match = message.match(/^(.+?)(\d+)$/)
    const mainText = match?.[1] ?? message
    const suffixText = match?.[2] ?? ''
    const suffixFontSize = Math.round(mainFontSize * 0.58)
    const gap = suffixText ? Math.max(4, Math.round(mainFontSize * 0.04)) : 0
    context.font = `Bold ${mainFontSize}px Arial`
    const mainWidth = context.measureText(mainText).width
    let suffixWidth = 0
    if (suffixText) {
      context.font = `Bold ${suffixFontSize}px Arial`
      suffixWidth = context.measureText(suffixText).width
    }
    return {
      mainText,
      suffixText,
      mainFontSize,
      suffixFontSize,
      mainWidth,
      suffixWidth,
      width: mainWidth + gap + suffixWidth,
      gap,
    }
  }

  private drawCombinedLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    nameText: string,
    valueText: string,
    color: number,
    mainFontSize: number,
  ) {
    const nameMetrics = this.measureNameText(nameText, mainFontSize)
    context.font = `Bold ${mainFontSize}px Arial`
    const valueWidth = valueText ? context.measureText(valueText).width : 0
    const valueGap = valueText ? Math.max(4, Math.round(mainFontSize * 0.08)) : 0
    const nameSlotWidth = 256
    const totalWidth = Math.max(1, nameSlotWidth + (valueText ? valueGap + valueWidth : 0))
    const paddingX = Math.max(24, Math.round(mainFontSize * 0.44))
    const nextHeight = 256
    const nextWidth = Math.max(160, Math.ceil(totalWidth + paddingX * 2))
    if (canvas.width !== nextWidth) canvas.width = nextWidth
    if (canvas.height !== nextHeight) canvas.height = nextHeight

    const ctx = canvas.getContext('2d')!
    const baselineY = canvas.height / 2 + mainFontSize * 0.18
    const nameStartX = paddingX + (nameSlotWidth - nameMetrics.width) / 2
    const valueStartX = nameStartX + nameMetrics.width + valueGap
    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    ctx.font = `Bold ${mainFontSize}px Arial`
    ctx.fillText(nameMetrics.mainText, nameStartX, baselineY)
    if (nameMetrics.suffixText) {
      ctx.font = `Bold ${nameMetrics.suffixFontSize}px Arial`
      ctx.fillText(
        nameMetrics.suffixText,
        nameStartX + nameMetrics.mainWidth + nameMetrics.gap,
        baselineY + mainFontSize * 0.22,
      )
    }
    if (valueText) {
      ctx.font = `Bold ${mainFontSize}px Arial`
      ctx.fillText(valueText, valueStartX, baselineY)
    }

    return {
      textPixelWidth: totalWidth,
      textPixelHeight: mainFontSize,
      canvasPixelWidth: canvas.width,
      canvasPixelHeight: canvas.height,
    }
  }

  private formatMetricNumber(value: number) {
    const safeValue = Number.isFinite(value) ? value : 0
    const rounded = Math.abs(safeValue) < 1e-8 ? 0 : safeValue
    return rounded.toFixed(2)
  }

  private drawPlainLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    message: string,
    color: number,
    fontSize: number,
  ) {
    const paddingX = Math.max(20, Math.round(fontSize * 0.42))
    const height = 256
    context.font = `Bold ${fontSize}px Arial`
    const textWidth = Math.ceil(context.measureText(message).width)
    const textHeight = fontSize
    const width = Math.max(64, textWidth + paddingX * 2)
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height

    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = `rgb(${r}, ${g}, ${b})`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = `Bold ${fontSize}px Arial`
    context.fillText(message, canvas.width / 2, canvas.height / 2)
    return {
      textPixelWidth: textWidth,
      textPixelHeight: textHeight,
      canvasPixelWidth: canvas.width,
      canvasPixelHeight: canvas.height,
    }
  }

  private createAdaptiveLabelSprite(
    message: string,
    color: number,
    fontSize: number,
  ): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    const metrics = this.drawPlainLabel(context, canvas, message, color, fontSize)
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })
    const sprite = new THREE.Sprite(material)
    Object.assign(this.getLabelUserData(sprite), metrics)
    return sprite
  }

  private setLabelSpriteScale(sprite: THREE.Sprite, scale: number) {
    const data = this.getLabelUserData(sprite)
    if (data.layoutMode === 'name') {
      sprite.scale.set(scale, scale, 1)
      return
    }
    this.setAdaptiveSpriteScale(sprite, scale)
  }

  /** 创建与轴同色的纯文字 Sprite（无背景、无边框） */
  private makeColoredTextSprite(message: string, axisColor: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 128
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    context.font = 'Bold 64px Arial'

    // 将十六进制颜色转为 RGB
    const r = (axisColor >> 16) & 255
    const g = (axisColor >> 8) & 255
    const b = axisColor & 255

    context.fillStyle = `rgb(${r}, ${g}, ${b})`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(message, size / 2, size / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false, // 始终可见
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    const sprite = new THREE.Sprite(material)
    const h = this.renderer.domElement.clientHeight || 1
    const axisLabelScale = ThreeRenderer.AXIS_LABEL_PIXEL / h / this.worldScale
    sprite.scale.set(axisLabelScale, axisLabelScale, 1)
    sprite.userData = { type: 'axisLabel' }

    return sprite
  }

  /** 创建点名称标签（无背景） */
  private makePointLabelSprite(
    message: string,
    color: number,
    valueText: string = '',
  ): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    const metrics = valueText
      ? this.drawCombinedLabel(context, canvas, message, valueText, color, 72)
      : this.drawNameLabel(context, canvas, message, color, 72)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    const sprite = new THREE.Sprite(material)
    Object.assign(this.getLabelUserData(sprite), metrics, {
      layoutMode: valueText ? 'combined' : 'name',
    })
    return sprite
  }

  /** 创建线段名称标签（无背景） */
  private makeLineLabelSprite(
    message: string,
    color: number,
    valueText: string = '',
  ): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    const metrics = valueText
      ? this.drawCombinedLabel(context, canvas, message, valueText, color, 56)
      : this.drawNameLabel(context, canvas, message, color, 56)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    const sprite = new THREE.Sprite(material)
    Object.assign(this.getLabelUserData(sprite), metrics, {
      layoutMode: valueText ? 'combined' : 'name',
    })
    return sprite
  }

  private makeValueLabelSprite(message: string, color: number, isPoint: boolean): THREE.Sprite {
    const sprite = this.createAdaptiveLabelSprite(message, color, isPoint ? 72 : 56)
    this.getLabelUserData(sprite).layoutMode = 'value'
    return sprite
  }

  private getValueLabelGapPx(isPoint: boolean) {
    return isPoint ? 16 : 14
  }

  private getValueLabelOffsetPx(nameLabel: THREE.Sprite | undefined, isPoint: boolean) {
    if (!nameLabel || !nameLabel.visible) return 0
    const data = this.getLabelUserData(nameLabel)
    return Math.round((data.textPixelWidth ?? 0) + this.getValueLabelGapPx(isPoint))
  }

  private setAdaptiveSpriteScale(sprite: THREE.Sprite, scale: number) {
    const data = this.getLabelUserData(sprite)
    const width = data.canvasPixelWidth ?? 1
    const height = data.canvasPixelHeight ?? 1
    const aspect = height > 0 ? width / height : 1
    sprite.scale.set(scale * aspect, scale, 1)
  }

  private getStableLabelCenterX(canvasWidth: number, isPoint: boolean) {
    const baseCanvasWidth = 256
    const baseCenter = isPoint
      ? ThreeRenderer.POINT_LABEL_CENTER_X * baseCanvasWidth
      : ThreeRenderer.LINE_LABEL_CENTER_X * baseCanvasWidth
    return THREE.MathUtils.clamp(baseCenter / Math.max(canvasWidth, 1), 0, 0.5)
  }

  private getDefaultLabelCenterX(isPoint: boolean) {
    return isPoint ? ThreeRenderer.POINT_LABEL_CENTER_X : ThreeRenderer.LINE_LABEL_CENTER_X
  }

  /** 计算标签位置：始终显示在屏幕上方 */
  private getScreenOffsetPosition(pointPos: THREE.Vector3, offsetXpx: number, offsetYpx: number) {
    const camera = this.getActiveCamera()
    const worldPoint = this.toMathWorldPosition(pointPos)
    const ndc = worldPoint.project(camera)
    const w = this.renderer.domElement.clientWidth || 1
    const h = this.renderer.domElement.clientHeight || 1
    const offsetNdcX = (this.getZoomResponsivePixelOffset(offsetXpx) / w) * 2
    const offsetNdcY = (this.getZoomResponsivePixelOffset(offsetYpx) / h) * 2
    ndc.x += offsetNdcX
    ndc.y += offsetNdcY
    return this.toMathLocalPosition(ndc.unproject(camera))
  }

  /** 每帧根据当前相机姿态刷新标签的屏幕空间偏移，保证 AR 下不漂移、不遮挡主体 */
  private updateScreenSpaceLabels() {
    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      const label = userData.__labelSprite
      if (!label || !label.visible) return

      const offsetX = Number(userData.__labelOffsetX ?? 0)
      const offsetY = Number(userData.__labelOffsetY ?? 0)

      if (userData.type === 'point') {
        label.position.copy(this.getScreenOffsetPosition(obj.position, offsetX, offsetY))
      } else if (
        userData.type === 'line' ||
        userData.type === 'straightLine' ||
        userData.type === 'ray' ||
        userData.type === 'face'
      ) {
        const anchor = userData.__labelAnchor?.clone()
        if (!anchor) return
        label.position.copy(this.getScreenOffsetPosition(anchor, offsetX, offsetY))
      }
    })
  }

  private getLinearLabelSource(object: THREE.Object3D) {
    const geoId = object.userData.geoId
    const type = object.userData.type
    if (!geoId || !this.currentSceneRef) return null
    if (type === 'line') return this.currentSceneRef.lines.get(geoId) ?? null
    if (type === 'straightLine') return this.currentSceneRef.straightLines.get(geoId) ?? null
    if (type === 'ray') return this.currentSceneRef.rays.get(geoId) ?? null
    if (type === 'face') return this.currentSceneRef.faces.get(geoId) ?? null
    return null
  }

  /** 生成圆点贴图（白色圆形 + 透明背景），供 SpriteMaterial 使用 */
  private getPointTexture(): THREE.CanvasTexture {
    if (this.pointTexture) return this.pointTexture
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2)
    ctx.fill()
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    this.pointTexture = texture
    return texture
  }

  /** 计算标签位置：始终显示在点的“屏幕右上方” */
  private getSmartLabelPosition(pointPos: THREE.Vector3): THREE.Vector3 {
    return this.getScreenOffsetPosition(
      pointPos,
      ThreeRenderer.POINT_LABEL_OFFSET_X,
      ThreeRenderer.POINT_LABEL_OFFSET_Y,
    )
  }

  /**
   * 更新坐标投影线
   * 包含：从点到 X 轴、Z 轴的地面方形投影，以及 Y 轴垂直线
   */
  updateGuide(pos: THREE.Vector3, visible: boolean = true) {
    if (!this.projectionGroup) {
      this.projectionGroup = new THREE.Group()

      // 创建投影线物体 (使用 LineSegments 以便绘制不连续的线)
      const mat = new THREE.LineDashedMaterial({
        color: 0xffff00,
        dashSize: 0.2,
        gapSize: 0.1,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      })
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), mat)
      line.name = 'guideLines'
      this.projectionGroup.add(line)

      this.guidePoint = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.getPointTexture(),
          color: 0xff5555,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
          alphaTest: 0.1,
        }),
      )
      this.guidePoint.renderOrder = 11
      const scale = this.getPointSpriteScale()
      this.guidePoint.scale.set(scale, scale, 1)
      this.projectionGroup.add(this.guidePoint)

      // 创建坐标浮窗
      this.guideLabel = new THREE.Sprite(
        new THREE.SpriteMaterial({
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
        }),
      )
      this.guideLabel.center.set(0, 0)
      this.guideLabel.scale.set(0.18 / this.worldScale, 0.1 / this.worldScale, 1)
      this.projectionGroup.add(this.guideLabel)

      this.world.add(this.projectionGroup)
    }

    this.projectionGroup.visible = visible
    if (!visible) return

    const line = this.projectionGroup.getObjectByName('guideLines') as THREE.LineSegments

    // 构建方形投影顶点数据
    // 1. 从点 (x,y,z) 到地面 (x,0,z) 的垂直线
    // 2. 从地面点 (x,0,z) 到 X 轴 (x,0,0) 的连线
    // 3. 从地面点 (x,0,z) 到 Z 轴 (0,0,z) 的连线
    const points = [
      // 垂直线
      pos,
      new THREE.Vector3(pos.x, 0, pos.z),
      // X方向投影
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(pos.x, 0, 0),
      // Z方向投影
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(0, 0, pos.z),
    ]

    line.geometry.setFromPoints(points)
    line.computeLineDistances() // 虚线必须

    // 更新浮窗文字和位置
    this.guidePoint!.position.copy(pos)
    this.drawLabel(pos)
    this.guideLabel!.position.copy(
      this.getScreenOffsetPosition(
        pos,
        ThreeRenderer.GUIDE_LABEL_OFFSET_X,
        ThreeRenderer.GUIDE_LABEL_OFFSET_Y,
      ),
    )
  }

  private drawLabel(pos: THREE.Vector3) {
    const canvas = document.createElement('canvas')
    canvas.width = 288
    canvas.height = 192
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.roundRect(0, 0, 288, 192, 15)
    ctx.fill()
    ctx.fillStyle = '#0f0'
    ctx.font = 'bold 32px monospace'
    ctx.fillText(`X: ${pos.x.toFixed(2)}`, 20, 40)
    ctx.fillText(`Y: ${pos.y.toFixed(2)}`, 20, 75)
    ctx.fillText(`Z: ${pos.z.toFixed(2)}`, 20, 110)

    // 添加提示文本
    ctx.fillStyle = '#ffffff' // 使用白色文字以便区分
    ctx.font = 'normal 24px monospace' // 稍小的字体
    ctx.fillText(`Tips: 放大缩小坐标轴`, 20, 145) // 在底部添加提示
    ctx.fillText(`以更好确定落点`, 20, 175) // 分两行显示提示
    this.guideLabel!.material.map = new THREE.CanvasTexture(canvas)
  }

  showAxisGuidesAt(pos: THREE.Vector3) {
    this.updateGuide(pos, true)
  }
  hideAxisGuides() {
    this.updateGuide(new THREE.Vector3(), false)
  }

  private updateFacePreview(preview: FacePreviewData | null | undefined) {
    if (!this.facePreviewGroup) {
      this.facePreviewGroup = new THREE.Group()

      const fill = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: ThreeRenderer.FACE_PREVIEW_COLOR,
          transparent: true,
          opacity: ThreeRenderer.FACE_PREVIEW_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      fill.name = 'facePreviewFill'
      this.facePreviewGroup.add(fill)

      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          color: ThreeRenderer.FACE_PREVIEW_COLOR,
          dashSize: 0.2,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.9,
        }),
      )
      outline.name = 'facePreviewOutline'
      this.facePreviewGroup.add(outline)

      const adjustments = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          color: 0xffd166,
          dashSize: 0.12,
          gapSize: 0.08,
          transparent: true,
          opacity: 0.85,
        }),
      )
      adjustments.name = 'facePreviewAdjustments'
      this.facePreviewGroup.add(adjustments)

      this.world.add(this.facePreviewGroup)
    }

    this.facePreviewGroup.visible = Boolean(preview && preview.boundary.length >= 3)
    if (!preview || preview.boundary.length < 3) return

    const fill = this.facePreviewGroup.getObjectByName('facePreviewFill') as THREE.Mesh
    const outline = this.facePreviewGroup.getObjectByName('facePreviewOutline') as THREE.LineLoop
    const adjustments = this.facePreviewGroup.getObjectByName(
      'facePreviewAdjustments',
    ) as THREE.LineSegments

    const boundary = preview.boundary.map((point) => new THREE.Vector3(point.x, point.y, point.z))
    const plane = computePlaneBasis(preview.boundary)
    if (!plane) {
      this.facePreviewGroup.visible = false
      return
    }
    const triangulated = THREE.ShapeUtils.triangulateShape(
      preview.boundary.map((point) => {
        const projected = projectPoint2D(point, plane)
        return new THREE.Vector2(projected.x, projected.y)
      }),
      [],
    )
    const fillGeometry = fill.geometry as THREE.BufferGeometry
    fillGeometry.setFromPoints(boundary)
    fillGeometry.setIndex(triangulated.flat())
    fillGeometry.computeVertexNormals()
    fillGeometry.computeBoundingBox()
    fillGeometry.computeBoundingSphere()

    outline.geometry.setFromPoints(boundary)
    outline.computeLineDistances()

    const adjustmentPoints = preview.adjustedPoints.flatMap((item) => [
      new THREE.Vector3(item.from.x, item.from.y, item.from.z),
      new THREE.Vector3(item.to.x, item.to.y, item.to.z),
    ])
    adjustments.visible = adjustmentPoints.length > 0
    adjustments.geometry.setFromPoints(adjustmentPoints)
    adjustments.computeLineDistances()
  }

  //处理连接时的橡皮筋虚线
  private updateRubberBand(data?: { from: THREE.Vector3; to: THREE.Vector3 } | null) {
    if (!data) {
      if (this.rubberBand) this.rubberBand.visible = false
      return
    }

    if (!this.rubberBand) {
      const geo = new THREE.BufferGeometry().setFromPoints([data.from, data.to])
      // 使用 LineDashedMaterial 实现虚线效果
      const mat = new THREE.LineDashedMaterial({
        color: 0x43f260,
        dashSize: 0.2,
        gapSize: 0.1,
      })
      this.rubberBand = new THREE.Line(geo, mat)
      this.rubberBand.computeLineDistances() // 必须调用才能显示虚线
      this.world.add(this.rubberBand)
    } else {
      this.rubberBand.visible = true
      this.rubberBand.geometry.setFromPoints([data.from, data.to])
      this.rubberBand.geometry.attributes.position!.needsUpdate = true
      this.rubberBand.computeLineDistances()
    }
  }
}
