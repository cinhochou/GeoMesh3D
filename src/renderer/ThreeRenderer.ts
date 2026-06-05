import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Scene as GeoScene } from '../core/scene/Scene'
import type { FacePreviewData } from '../core/editor/Editor'
import { ARManager } from './ARManager'
import { AxisGridManager } from './AxisGridManager'
import { LabelRenderer } from './LabelRenderer'
import { GeometrySyncer, isLinearType, DEFAULT_POINT_COLOR } from './GeometrySyncer'
import type { AppSettings } from '@/store/uiStore'

type Matrix4WithLegacyGetInverse = THREE.Matrix4 & {
  getInverse?: (m: THREE.Matrix4) => THREE.Matrix4
}

type RenderObjectType =
  | 'point'
  | 'line'
  | 'straightLine'
  | 'ray'
  | 'vector'
  | 'circle'
  | 'face'
  | 'sphere'
  | 'cone'
  | 'axisLabel'

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
  canvasResized?: boolean
}

const matrix4Prototype = THREE.Matrix4.prototype as Matrix4WithLegacyGetInverse
if (typeof matrix4Prototype.getInverse !== 'function') {
  matrix4Prototype.getInverse = function (m: THREE.Matrix4) {
    return this.copy(m).invert()
  }
}

export class ThreeRenderer {
  private static readonly POINT_LABEL_OFFSET_X = 3
  private static readonly POINT_LABEL_OFFSET_Y = 3
  private static readonly POINT_VALUE_ONLY_EXTRA_OFFSET_X = 20
  private static readonly GUIDE_LABEL_OFFSET_X = 12
  private static readonly GUIDE_LABEL_OFFSET_Y = 0
  private static readonly GUIDE_LABEL_MOBILE_OFFSET_X = 30
  private static readonly POINT_LABEL_CENTER_X = 0.32
  private static readonly POINT_LABEL_CENTER_Y = 0.32
  private static readonly LINE_LABEL_CENTER_X = 0.5
  private static readonly LINE_LABEL_CENTER_Y = 0.3
  // 1.5x the previous value of 30. With a default canvas of ~675px height and
  // a typical zoom factor near 1.1, this gives the user a label drag range
  // of roughly ±50 screen pixels in each direction (vs. ~±33 before).
  static readonly LABEL_DRAG_LIMIT = 45
  private static readonly BACKGROUND_COLOR = 0x111111
  private static readonly SHARED_WORLD_ROTATION_LERP = 0.22
  private static readonly POINT_SCALE_REFERENCE_DISTANCE =
    Math.sqrt(15 * 15 * 3) *
    (Math.tan(((60 / 2) * Math.PI) / 180) / Math.tan(((30 / 2) * Math.PI) / 180))
  private static readonly LABEL_OFFSET_EXPONENT = 0.65
  private static readonly LABEL_OFFSET_MIN_FACTOR = 0.7
  private static readonly LABEL_OFFSET_MAX_FACTOR = 1.15

  scene: THREE.Scene
  world: THREE.Group
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  private container: HTMLElement
  private projectionGroup: THREE.Group | null = null
  private guideLabel: THREE.Sprite | null = null
  private guidePoint: THREE.Sprite | null = null
  public geometrySyncer: GeometrySyncer
  public labelRenderer: LabelRenderer
  public arManager: ARManager
  public axisGridManager: AxisGridManager
  private sharedWorldTargetQuaternion = new THREE.Quaternion()
  private sharedWorldRotationInitialized = false
  private readonly isMobileDevice: boolean
  private appSettings: AppSettings
  private pixelRatioScale = 1.0
  private _responsiveScaleFrameCounter = 0
  private static readonly RESPONSIVE_SCALE_DRAG_INTERVAL = 4

  constructor(container: HTMLElement, settings?: AppSettings) {
    this.container = container
    this.appSettings = settings ?? {
      antialias: false,
      pixelRatioScale: 1.0,
      fpsCap: 0,
      powerPreference: 'default',
      depthOcclusion: true,
      hiddenEdge: true,
      confirmBeforeDelete: true,
      autoSaveProject: true,
      draftProtection: true,
    }
    this.pixelRatioScale = this.appSettings.pixelRatioScale
    this.isMobileDevice =
      window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(ThreeRenderer.BACKGROUND_COLOR)
    this.world = new THREE.Group()
    this.scene.add(this.world)
    this.sharedWorldTargetQuaternion.copy(this.world.quaternion)

    const w = container.clientWidth
    const h = container.clientHeight

    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 1000)
    this.camera.position.set(32, 20, 32)
    this.camera.lookAt(0, 0, 0)

    // 创建 WebGLRenderer，应用用户设置的抗锯齿与 GPU 偏好
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.appSettings.antialias,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: this.appSettings.powerPreference,
    })
    this.renderer.setSize(w, h, false)

    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.zIndex = '10'
    this.renderer.domElement.style.pointerEvents = 'auto'
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 5)
    this.scene.add(light)
    this.scene.add(new THREE.AmbientLight(0x404040))
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 11
    this.controls.maxDistance = 215

    const arAnchorGroup = new THREE.Group()
    this.scene.add(arAnchorGroup)
    this.world.removeFromParent()
    arAnchorGroup.add(this.world)
    const arMarkerRoot = new THREE.Group()
    arMarkerRoot.matrixAutoUpdate = false
    arMarkerRoot.visible = false
    this.scene.add(arMarkerRoot)
    const arCamera = new THREE.PerspectiveCamera()
    arCamera.matrixAutoUpdate = false
    this.scene.add(arCamera)

    this.arManager = new ARManager({
      scene: this.scene,
      camera: this.camera,
      arCamera,
      controls: this.controls,
      renderer: this.renderer,
      world: this.world,
      arAnchorGroup,
      arMarkerRoot,
      container: this.container,
      axisGridSize: 10,
      refreshScreenSpaceScales: () => this.refreshScreenSpaceScales(),
      onResize: () => this.onResize(),
      setWorldScale: (scale: number) => this.setWorldScale(scale),
      setSharedWorldQuaternion: (q: THREE.Quaternion, immediate?: boolean) =>
        this.setSharedWorldQuaternion(q, immediate),
    })

    this.axisGridManager = new AxisGridManager({
      makeColoredTextSprite: (text: string, color: number) =>
        this.labelRenderer.makeColoredTextSprite(text, color),
      updateRendererPixelRatio: () => this.updateRendererPixelRatio(),
      refreshScreenSpaceScales: () => this.refreshScreenSpaceScales(),
      getWorldScale: () => this.arManager.currentWorldScale,
      getFovSpriteScale: () => this.getFovSpriteScale(),
      getARMode: () => this.arManager.isARMode,
      getARSceneScaleForAxisSize: (size: number) => this.getARSceneScaleForAxisSize(size),
      setWorldScale: (scale: number) => this.setWorldScale(scale),
      camera: this.camera,
      controls: this.controls,
      isMobileDevice: this.isMobileDevice,
    })
    this.world.add(this.axisGridManager.axisGridGroup)

    this.labelRenderer = new LabelRenderer({
      container: this.container,
      getActiveCamera: () => this.getActiveCamera(),
      getActiveCameraSpriteScaleFactor: () => this.getActiveCameraSpriteScaleFactor(),
      isARActive: () => this.arManager.isARMode,
      isTouchPreferredDevice: () => this.isTouchPreferredDevice(),
      isARCoarsePointer: () => this.isARCoarsePointer(),
      world: this.world,
      scene: this.scene,
      getCurrentWorldScale: () => this.arManager.currentWorldScale,
      getFovSpriteScale: () => this.getFovSpriteScale(),
    })

    this.geometrySyncer = new GeometrySyncer({
      scene: this.scene,
      world: this.world,
      container: this.container,
      getActiveCamera: () => this.getActiveCamera(),
      getActiveCameraSpriteScaleFactor: () => this.getActiveCameraSpriteScaleFactor(),
      isARActive: () => this.arManager.isARMode,
      labelRenderer: this.labelRenderer,
      axisGridManager: this.axisGridManager,
      arManager: this.arManager,
      isTouchPreferredDevice: () => this.isTouchPreferredDevice(),
      isMobileDevice: this.isMobileDevice,
      renderer: this.renderer,
      camera: this.camera,
      controls: this.controls,
    })

    this.axisGridManager.setAxisGridSize(10)
    this.updateRendererPixelRatio()
  }

  dispose() {
    this.controls.dispose()
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  getActiveCamera(): THREE.Camera {
    return this.arManager.getActiveCamera()
  }

  getActiveCameraSpriteScaleFactor(): number {
    return this.arManager.getActiveCameraSpriteScaleFactor()
  }

  isARActive(): boolean {
    return this.arManager.isARMode
  }

  isTouchPreferredDevice(): boolean {
    return this.isMobileDevice
  }

  isARCoarsePointer(): boolean {
    return this.isMobileDevice && this.arManager.isARMode
  }

  isSharedSceneRotationAvailable(): boolean {
    if (!this.arManager.isARMode) return false
    return this.arManager.shouldRenderPersistentARWorld()
  }

  getARVideoElement(): HTMLVideoElement | null {
    return this.arManager.getARVideoElement()
  }

  getActiveCameraWorldPosition(): THREE.Vector3 {
    const cam = this.getActiveCamera()
    return cam.getWorldPosition(new THREE.Vector3())
  }

  getActiveCameraWorldDirection(): THREE.Vector3 {
    const cam = this.getActiveCamera()
    return cam.getWorldDirection(new THREE.Vector3())
  }

  toMathWorldPosition(point: THREE.Vector3): THREE.Vector3 {
    return this.world.localToWorld(point.clone())
  }

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
    this.geometrySyncer.meshMap.forEach((obj) => {
      const label = this.getRenderUserData(obj).__labelSprite
      if (label) labels.push(label)
      const valueLabel = this.getRenderUserData(obj).__valueLabelSprite
      if (valueLabel) labels.push(valueLabel)
    })
    this.geometrySyncer.groupMap.forEach((obj) => {
      const label = this.getRenderUserData(obj).__labelSprite
      if (label) labels.push(label)
      const valueLabel = this.getRenderUserData(obj).__valueLabelSprite
      if (valueLabel) labels.push(valueLabel)
    })
    this.labelRenderer.cubeValueLabels.forEach((label) => labels.push(label))
    return labels
  }

  previewLabelOffset(geoId: string, offsetX: number, offsetY: number) {
    const object = this.geometrySyncer.meshMap.get(geoId) ?? this.geometrySyncer.groupMap.get(geoId)
    if (!object) return
    const userData = this.getRenderUserData(object)
    const zoomFactor = this.geometrySyncer.getPointZoomFactor()

    if (userData.type === 'point') {
      const base = this.geometrySyncer.getPointLabelBaseOffset()
      userData.__labelOffsetX = base.x + offsetX
      userData.__labelOffsetY = base.y + offsetY
    } else {
      userData.__labelOffsetX = offsetX
      userData.__labelOffsetY = offsetY
    }

    const label = userData.__labelSprite
    const valueLabel = userData.__valueLabelSprite
    if ((!label || !label.visible) && (!valueLabel || !valueLabel.visible)) return

    const valueExtraOffset = this.labelRenderer.getValueLabelOffsetPx(
      label,
      userData.type === 'point',
    )

    if (userData.type === 'point') {
      const base = this.geometrySyncer.getPointLabelBaseOffset()
      const totalOffsetX = (base.x + offsetX) * zoomFactor
      const totalOffsetY = (base.y + offsetY) * zoomFactor
      if (label?.visible) {
        label.position.copy(
          this.geometrySyncer.getScreenOffsetPosition(object.position, totalOffsetX, totalOffsetY),
        )
      }
      if (valueLabel?.visible) {
        valueLabel.position.copy(
          this.geometrySyncer.getScreenOffsetPosition(
            object.position,
            totalOffsetX + valueExtraOffset,
            totalOffsetY,
          ),
        )
      }
      return
    }

    if (isLinearType(userData.type)) {
      const anchor = userData.__labelAnchor?.clone()
      if (!anchor) return
      const totalOffsetX = offsetX * zoomFactor
      const totalOffsetY = offsetY * zoomFactor
      if (label?.visible) {
        label.position.copy(
          this.geometrySyncer.getScreenOffsetPosition(anchor, totalOffsetX, totalOffsetY),
        )
      }
      if (valueLabel?.visible) {
        valueLabel.position.copy(
          this.geometrySyncer.getScreenOffsetPosition(
            anchor,
            totalOffsetX + valueExtraOffset,
            totalOffsetY,
          ),
        )
      }
    }
  }

  private getARSceneScaleForAxisSize(size: number) {
    if (size >= 40) return 0.025
    if (size >= 20) return 0.045
    return 0.08
  }

  private setWorldScale(scale: number) {
    this.arManager.setARWorldScale(scale)
  }

  getWorldScale() {
    return this.arManager.currentWorldScale
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

    const yaw = new THREE.Quaternion().setFromAxisAngle(cameraUp, rotateLeftAngle)
    const pitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, rotateUpAngle)
    const deltaQuaternion = yaw.multiply(pitch).normalize()
    const nextQuaternion = deltaQuaternion.multiply(this.world.quaternion.clone()).normalize()
    this.setSharedWorldQuaternion(nextQuaternion, true)
    return nextQuaternion
  }

  setARWorldScale(scale: number) {
    if (!this.arManager.isARMode) return
    this.setWorldScale(scale)
  }

  scaleARWorldBy(factor: number) {
    if (!this.arManager.isARMode || !Number.isFinite(factor) || factor <= 0) return
    this.setWorldScale(this.arManager.currentWorldScale * factor)
  }

  private refreshScreenSpaceScales() {
    this.geometrySyncer.refreshScreenSpaceScales()
    if (this.guideLabel) {
      const fovS = this.geometrySyncer.getFovSpriteScale()
      if (this.isMobileDevice) {
        this.guideLabel.scale.set(
          (0.1 * fovS) / this.arManager.currentWorldScale,
          (0.05 * fovS) / this.arManager.currentWorldScale,
          1,
        )
      } else {
        this.guideLabel.scale.set(
          (0.18 * fovS) / this.arManager.currentWorldScale,
          (0.1 * fovS) / this.arManager.currentWorldScale,
          1,
        )
      }
    }
    if (this.guidePoint) {
      this.guidePoint.scale.set(
        this.geometrySyncer.getPointSpriteScale(),
        this.geometrySyncer.getPointSpriteScale(),
        1,
      )
    }
  }

  private getFovSpriteScale(): number {
    return this.geometrySyncer.getFovSpriteScale()
  }

  private getPointSpriteScale(): number {
    return this.geometrySyncer.getPointSpriteScale()
  }

  private getPointLabelScale(): number {
    return this.geometrySyncer.getPointLabelScale()
  }

  private getLineLabelScale(): number {
    return this.geometrySyncer.getLineLabelScale()
  }

  private getResponsiveLabelScale(basePixel: number, pointScaleMultiplier: number) {
    return this.geometrySyncer.getResponsiveLabelScale(basePixel, pointScaleMultiplier)
  }

  private getZoomResponsivePixelOffset(basePixel: number) {
    if (this.arManager.isARMode) return basePixel

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

  private updateResponsiveScales() {
    this.geometrySyncer.refreshScreenSpaceScales()
    if (this.guidePoint) {
      this.guidePoint.scale.set(
        this.geometrySyncer.getPointSpriteScale(),
        this.geometrySyncer.getPointSpriteScale(),
        1,
      )
    }
    this.geometrySyncer.updateLinearArrowHeadScales()
    this.axisGridManager.updateAxisArrowScales()
  }

  /**
   * 更新渲染器的像素比例
   * 根据设备原生 devicePixelRatio 与分辨率缩放系数重新设置
   */
  private updateRendererPixelRatio() {
    const deviceRatio = window.devicePixelRatio || 1
    this.renderer.setPixelRatio(deviceRatio * this.pixelRatioScale)
  }

  /**
   * 设置渲染参数
   * pixelRatioScale 与 fpsCap 可立即生效；
   * antialias 与 powerPreference 变更需要重建 WebGLRenderer，返回 needsRecreate 通知调用方
   */
  applySettings(settings: Partial<AppSettings>) {
    const prevAntialias = this.appSettings.antialias
    const prevPowerPreference = this.appSettings.powerPreference

    this.appSettings = {
      ...this.appSettings,
      ...settings,
    }

    // 若分辨率缩放比例发生变化，更新 pixelRatio 并刷新屏幕空间缩放
    if (typeof settings.pixelRatioScale === 'number') {
      this.pixelRatioScale = Math.min(1.0, Math.max(0.5, settings.pixelRatioScale))
      this.updateRendererPixelRatio()
      this.refreshScreenSpaceScales()
    }

    if (typeof settings.depthOcclusion === 'boolean') {
      this.geometrySyncer.setDepthOcclusionEnabled(settings.depthOcclusion)
    }

    if (typeof settings.hiddenEdge === 'boolean') {
      this.geometrySyncer.setHiddenEdgeEnabled(settings.hiddenEdge)
    }

    // 抗锯齿与 GPU 偏好变更需要重建 WebGLRenderer，返回标志通知调用方刷新页面
    return {
      needsRecreate:
        (typeof settings.antialias === 'boolean' && settings.antialias !== prevAntialias) ||
        (settings.powerPreference !== undefined &&
          settings.powerPreference !== prevPowerPreference),
    }
  }

  getSettings(): Readonly<AppSettings> {
    return { ...this.appSettings }
  }

  sync(
    geoScene: GeoScene,
    previewData?: { from: THREE.Vector3; to: THREE.Vector3 } | null,
    facePreviewData?: FacePreviewData | null,
    activeLabelTarget?: { type: string; geoId: string } | null,
    activePointValueTarget?: { type: 'point'; geoId: string } | null,
  ) {
    this.geometrySyncer.sync(
      geoScene,
      previewData,
      facePreviewData,
      activeLabelTarget,
      activePointValueTarget,
    )
  }

  cleanupMissingMeshes(scene: GeoScene) {
    this.geometrySyncer.cleanupMissingMeshes(scene)
  }

  updateFacePreview(preview: FacePreviewData | null | undefined) {
    this.geometrySyncer.updateFacePreview(preview)
  }

  updateRubberBand(data?: { from: THREE.Vector3; to: THREE.Vector3 } | null) {
    this.geometrySyncer.updateRubberBand(data)
  }

  updateScreenSpaceLabels() {
    this.geometrySyncer.updateScreenSpaceLabels()
  }

  updateLinearArrowHeadScales() {
    this.geometrySyncer.updateLinearArrowHeadScales()
  }

  async toggleAR(enabled: boolean) {
    await this.arManager.toggleAR(enabled)
  }

  render() {
    if (this.arManager.isARMode) {
      if (!this.arManager.renderARFrame()) return
    } else {
      this.scene.visible = true
      this.controls.update()
    }

    this.updateSharedWorldRotation()
    const isDragging = this.geometrySyncer.isDragging()
    if (isDragging) {
      this._responsiveScaleFrameCounter++
      if (this._responsiveScaleFrameCounter % ThreeRenderer.RESPONSIVE_SCALE_DRAG_INTERVAL === 0) {
        this.updateResponsiveScales()
      }
    } else {
      this._responsiveScaleFrameCounter = 0
      this.updateResponsiveScales()
    }
    this.geometrySyncer.updateScreenSpaceLabels()
    this.geometrySyncer.updateDepthOcclusion()
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
    if (!this.container || this.arManager.isARMode) return
    const w = Math.max(this.container.clientWidth, 1)
    const h = Math.max(this.container.clientHeight, 1)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  onResize() {
    if (!this.container) return
    const w = Math.max(this.container.clientWidth, 1)
    const h = Math.max(this.container.clientHeight, 1)

    this.updateRendererPixelRatio()
    this.renderer.setSize(w, h, false)

    if (!this.arManager.isARMode) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    } else {
      this.arManager.handleARResize()
    }

    this.refreshScreenSpaceScales()
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private getDefaultCameraPositionForAxisSize(size: number): THREE.Vector3 {
    if (size === 20) return new THREE.Vector3(54, 40, 54)
    if (size === 40) return new THREE.Vector3(100, 85, 100)
    return new THREE.Vector3(32, 20, 32)
  }

  resetView() {
    const defaultPos = this.getDefaultCameraPositionForAxisSize(
      this.axisGridManager.getAxisGridSize(),
    )
    this.controls.target.set(0, 0, 0)
    this.camera.position.copy(defaultPos)
    this.camera.zoom = 1
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld(true)
    this.controls.update()
  }

  getAxisGridSize() {
    return this.axisGridManager.getAxisGridSize()
  }

  isAxisGridVisible() {
    return this.axisGridManager.isAxisGridVisible()
  }

  setAxisGridVisible(visible: boolean) {
    this.axisGridManager.setAxisGridVisible(visible)
  }

  isCoordinateSystemVisible() {
    return this.axisGridManager.isCoordinateSystemVisible()
  }

  setCoordinateSystemVisible(visible: boolean) {
    this.axisGridManager.setCoordinateSystemVisible(visible)
  }

  setAxisGridSize(size: number) {
    this.axisGridManager.setAxisGridSize(size)
    this.camera.position.copy(
      this.getDefaultCameraPositionForAxisSize(this.axisGridManager.getAxisGridSize()),
    )
    if (this.arManager.isARMode) {
      this.setWorldScale(this.getARSceneScaleForAxisSize(this.axisGridManager.getAxisGridSize()))
      this.axisGridManager.updateAxisArrowScales()
      return
    }
    this.refreshScreenSpaceScales()
    this.axisGridManager.updateAxisArrowScales()
  }

  private getStableLabelCenterX(canvasWidth: number, isPoint: boolean) {
    const baseCanvasWidth = 256
    const baseCenter = isPoint
      ? ThreeRenderer.POINT_LABEL_CENTER_X * baseCanvasWidth
      : ThreeRenderer.LINE_LABEL_CENTER_X * baseCanvasWidth
    return THREE.MathUtils.clamp(baseCenter / Math.max(canvasWidth, 1), 0, 0.5)
  }

  private formatMetricNumber(value: number) {
    const safeValue = Number.isFinite(value) ? value : 0
    const rounded = Math.abs(safeValue) < 1e-8 ? 0 : safeValue
    return rounded.toFixed(2)
  }

  updateGuide(pos: THREE.Vector3, visible: boolean = true) {
    if (!this.projectionGroup) {
      this.projectionGroup = new THREE.Group()

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
          map: this.labelRenderer.getPointTexture(0xffffff, 128),
          color: DEFAULT_POINT_COLOR,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
          alphaTest: 0.1,
        }),
      )
      this.guidePoint.renderOrder = 11
      const scale = this.geometrySyncer.getPointSpriteScale()
      this.guidePoint.scale.set(scale, scale, 1)
      this.projectionGroup.add(this.guidePoint)

      this.guideLabel = new THREE.Sprite(
        new THREE.SpriteMaterial({
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
          transparent: true,
        }),
      )
      this.guideLabel.renderOrder = 12
      this.guideLabel.center.set(0, 0)
      const fovS = this.geometrySyncer.getFovSpriteScale()
      if (this.isMobileDevice) {
        this.guideLabel.scale.set(
          (0.1 * fovS) / this.arManager.currentWorldScale,
          (0.05 * fovS) / this.arManager.currentWorldScale,
          1,
        )
      } else {
        this.guideLabel.scale.set(
          (0.18 * fovS) / this.arManager.currentWorldScale,
          (0.1 * fovS) / this.arManager.currentWorldScale,
          1,
        )
      }
      this.projectionGroup.add(this.guideLabel)

      this.world.add(this.projectionGroup)
    }

    this.projectionGroup.visible = visible
    if (!visible) return

    const line = this.projectionGroup.getObjectByName('guideLines') as THREE.LineSegments

    const points = [
      pos,
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(pos.x, 0, 0),
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(0, 0, pos.z),
    ]

    line.geometry.setFromPoints(points)
    line.computeLineDistances()

    this.guidePoint!.position.copy(pos)
    this.drawLabel(pos)
    if (this.isMobileDevice) {
      const labelData = this.getLabelUserData(this.guideLabel!)
      this.guideLabel!.center.set(
        this.getStableLabelCenterX(labelData.canvasPixelWidth ?? 256, true),
        ThreeRenderer.POINT_LABEL_CENTER_Y,
      )
      this.labelRenderer.setAdaptiveSpriteScale(
        this.guideLabel!,
        this.geometrySyncer.getPointLabelScale(),
      )
    }
    this.guideLabel!.position.copy(
      this.isMobileDevice
        ? this.getScreenOffsetPosition(
            pos,
            ThreeRenderer.GUIDE_LABEL_MOBILE_OFFSET_X,
            ThreeRenderer.POINT_LABEL_OFFSET_Y,
          )
        : this.getScreenOffsetPosition(
            pos,
            ThreeRenderer.GUIDE_LABEL_OFFSET_X,
            ThreeRenderer.GUIDE_LABEL_OFFSET_Y,
          ),
    )
  }

  private drawLabel(pos: THREE.Vector3) {
    const canvas = document.createElement('canvas')

    if (this.isMobileDevice) {
      const text = `=(${this.formatMetricNumber(pos.x)},${this.formatMetricNumber(pos.y)},${this.formatMetricNumber(pos.z)})`
      const ctx = canvas.getContext('2d')!
      const metrics = this.labelRenderer.drawPlainLabel(ctx, canvas, text, 0xffffff, 72)
      const texture = new THREE.CanvasTexture(canvas)
      texture.minFilter = THREE.LinearFilter
      const oldMap = this.guideLabel!.material.map
      this.guideLabel!.material.map = texture
      this.guideLabel!.material.needsUpdate = true
      if (oldMap && oldMap !== texture) (oldMap as THREE.CanvasTexture).dispose()
      const labelData = this.getLabelUserData(this.guideLabel!)
      Object.assign(labelData, metrics, { layoutMode: 'value' as const })
    } else {
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

      ctx.fillStyle = '#ffffff'
      ctx.font = 'normal 24px monospace'
      ctx.fillText(`Tips: 放大缩小坐标轴`, 20, 145)
      ctx.fillText(`以更好确定落点`, 20, 175)
      const oldMap = this.guideLabel!.material.map
      this.guideLabel!.material.map = new THREE.CanvasTexture(canvas)
      if (oldMap) (oldMap as THREE.CanvasTexture).dispose()
    }
  }

  showAxisGuidesAt(pos: THREE.Vector3) {
    this.updateGuide(pos, true)
  }
  hideAxisGuides() {
    this.updateGuide(new THREE.Vector3(), false)
  }
  setGuideLabelVisible(visible: boolean) {
    if (this.guideLabel) {
      this.guideLabel.visible = visible
    }
  }

  setGuideLinesVisible(visible: boolean) {
    if (!this.projectionGroup) return
    const line = this.projectionGroup.getObjectByName('guideLines') as
      | THREE.LineSegments
      | undefined
    if (line) line.visible = visible
  }

  setGuidePointColor(color: number) {
    if (this.guidePoint) {
      ;(this.guidePoint.material as THREE.SpriteMaterial).color.setHex(color)
    }
  }
}
