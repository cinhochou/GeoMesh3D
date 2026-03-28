// src/renderer/ThreeRenderer.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Scene as GeoScene } from '../core/scene/Scene'
import { Ray3 } from '../core/geometry/Ray3'
// 为新版 Three.js 补上旧版的 getInverse 方法，防止 AR.js 崩溃
if (typeof (THREE.Matrix4.prototype as any).getInverse !== 'function') {
  ;(THREE.Matrix4.prototype as any).getInverse = function (m: THREE.Matrix4) {
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
  private static readonly RAY_COLOR = 0x7fc8ff
  private static readonly RAY_HEAD_LENGTH = 0.7
  private static readonly RAY_HEAD_RADIUS = 0.22

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

  private arToolkitSource: any = null
  private arToolkitContext: any = null
  private arMarkerControls: any = null
  private isARMode = false
  private arAnchorInitialized = false
  private arLastMarkerSeenAt = 0
  /** 记录当前世界缩放，普通模式 1，AR 模式会缩小 */
  private worldScale = 1
  private axisGridGroup: THREE.Group
  private axisGridSize = 10
  private pointTexture: THREE.CanvasTexture | null = null
  /** AR 模式下的场景整体缩放比（同时作用于坐标轴、网格与几何体） */
  private static readonly AR_SCENE_SCALE = 0.2
  private static readonly AR_MARKER_FOLLOW_LERP = 0.35
  private static readonly AR_MARKER_REACQUIRE_LERP = 0.18
  private static readonly AR_MARKER_PERSIST_MS = 1500

  // 用于备份进入 AR 前的相机和控制器状态
  private backupState = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(), // OrbitControls 的聚焦点
    zoom: 1,
    fov: 60,
  }

  /** geoId -> mesh */
  meshMap = new Map<string, THREE.Object3D>()

  constructor(container: HTMLElement) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x111111)
    this.arAnchorGroup = new THREE.Group()
    this.scene.add(this.arAnchorGroup)
    this.world = new THREE.Group()
    this.arAnchorGroup.add(this.world)
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
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(w, h)

    // 设置 Canvas 样式，确保它覆盖在视频之上
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.zIndex = '10' // Canvas 层级设为 10
    this.renderer.domElement.style.pointerEvents = 'auto' // 允许鼠标交互
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

  /** 当前用于渲染/拾取的相机（AR 模式下为 arCamera） */
  getActiveCamera(): THREE.Camera {
    return this.isARMode ? this.arCamera : this.camera
  }

  /** 是否处于 AR 模式（供交互层判断） */
  isARActive(): boolean {
    return this.isARMode
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
    this.worldScale = scale
    this.world.scale.setScalar(scale)
    this.updateARWorldPlacement()

    this.refreshScreenSpaceScales()
  }

  /** 重新按当前画布尺寸刷新点与标签的屏幕空间大小 */
  private refreshScreenSpaceScales() {
    const h = this.renderer.domElement.clientHeight || 1
    const spriteScale = this.getPointSpriteScale()
    const labelScale = this.getPointLabelScale()
    const lineLabelScale = this.getLineLabelScale()
    this.meshMap.forEach((obj) => {
      if ((obj as THREE.Sprite).isSprite && obj.userData?.type === 'point') {
        ;(obj as THREE.Sprite).scale.set(spriteScale, spriteScale, 1)
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) label.scale.set(labelScale, labelScale, 1)
      } else if (
        (obj as any).userData?.type === 'line' ||
        (obj as any).userData?.type === 'ray'
      ) {
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) label.scale.set(lineLabelScale, lineLabelScale, 1)
      }
    })
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
    if (this.isARMode) return baseScale

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

  /** 屏幕空间元素大小随缩放距离变化，但不随绕中心旋转的视角角度变化 */
  private getZoomResponsivePixelScale(basePixel: number) {
    const h = this.renderer.domElement.clientHeight || 1
    const baseScale = basePixel / h / this.worldScale
    if (this.isARMode) return baseScale

    const distance = this.camera.position.distanceTo(this.controls.target)
    const safeDistance = Math.max(distance, 0.001)
    return baseScale * (ThreeRenderer.POINT_SCALE_REFERENCE_DISTANCE / safeDistance)
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
      if ((obj as THREE.Sprite).isSprite && obj.userData?.type === 'point') {
        ;(obj as THREE.Sprite).scale.set(spriteScale, spriteScale, 1)
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) label.scale.set(pointLabelScale, pointLabelScale, 1)
      } else if (
        (obj as any).userData?.type === 'line' ||
        (obj as any).userData?.type === 'ray'
      ) {
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) label.scale.set(lineLabelScale, lineLabelScale, 1)
      }
    })

    if (this.guidePoint) {
      this.guidePoint.scale.set(spriteScale, spriteScale, 1)
    }
  }
  /* ---------- Scene → Three ---------- */

  sync(geoScene: GeoScene, previewData?: { from: THREE.Vector3; to: THREE.Vector3 } | null) {
    this.cleanupMissingMeshes(geoScene)
    this.syncPoints(geoScene)
    this.syncLines(geoScene)
    this.syncRays(geoScene)
    this.updateRubberBand(previewData) // 处理虚线
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
      const type = (obj as any).userData?.type
      if (type === 'point' && !scene.points.has(id)) {
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) this.world.remove(label)
        this.world.remove(obj)
        this.meshMap.delete(id)
      } else if (type === 'line' && !scene.lines.has(id)) {
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) this.world.remove(label)
        this.world.remove(obj)
        this.meshMap.delete(id)
      } else if (type === 'ray' && !scene.rays.has(id)) {
        const label = (obj as any).userData?.__labelSprite as THREE.Sprite | undefined
        if (label) this.world.remove(label)
        this.world.remove(obj)
        this.meshMap.delete(id)
      }
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
      this.backupState.zoom = this.camera.zoom
      this.backupState.fov = this.camera.fov

      this.renderer.setClearColor(0x000000, 0)
      this.scene.background = null
      this.controls.enabled = false
      this.resetARAnchor()
      // AR 模式整体缩放，避免相机贴得太近导致看不到边缘
      this.setWorldScale(this.getARSceneScaleForAxisSize(this.axisGridSize))

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
    this.resetARAnchor()
    // 恢复世界缩放
    this.setWorldScale(1)
    // ===== 退出 AR =====
    if (this.arToolkitSource) {
      if (this.arToolkitSource.domElement) {
        this.arToolkitSource.domElement.srcObject?.getTracks().forEach((t: any) => t.stop())
        this.arToolkitSource.domElement.remove()
      }
      this.arToolkitSource = null
    }
    this.arToolkitContext = null
    this.arMarkerControls = null

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
    this.controls.enabled = true
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
    this.arToolkitSource.init(() => {
      const video = this.arToolkitSource.domElement as HTMLVideoElement
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

    this.arToolkitContext.init(() => {
      this.arCamera.projectionMatrix.copy(this.arToolkitContext.getProjectionMatrix())
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
    this.arMarkerControls = new THREEx.ArMarkerControls(this.arToolkitContext, this.arMarkerRoot, {
      type: 'pattern',
      patternUrl: '/arcode/marker89.td',
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

      this.arToolkitContext.update(this.arToolkitSource.domElement)
      this.arCamera.updateMatrixWorld(true)
      this.syncARAnchorFromMarker()
      this.scene.visible = this.arMarkerRoot.visible || this.shouldRenderPersistentARWorld()
    } else {
      this.scene.visible = true
      this.controls.update()
    }

    this.updateResponsiveScales()
    this.updateScreenSpaceLabels()
    this.renderer.render(this.scene, this.getActiveCamera())
  }

  // 暴露给外部用于处理窗口缩放
  onResize() {
    if (!this.container) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight

    // 更新渲染器
    this.renderer.setSize(w, h)

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

  private syncPoints(scene: GeoScene) {
    scene.points.forEach((p) => {
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
      const baseColor = p.locked ? 0xffffff : 0xff5555
      ;(sprite.material as THREE.SpriteMaterial).color.set(isSelected ? 0x43f260 : baseColor)

      // 点名称标签
      const labelColor = isSelected ? 0x43f260 : 0xffffff
      const labelKey = '__labelSprite'
      const existingLabel = (sprite.userData as any)[labelKey] as THREE.Sprite | undefined
      ;(sprite.userData as any).__labelOffsetX = ThreeRenderer.POINT_LABEL_OFFSET_X
      ;(sprite.userData as any).__labelOffsetY = ThreeRenderer.POINT_LABEL_OFFSET_Y
      if (!p.nameVisible) {
        if (existingLabel) existingLabel.visible = false
        return
      }
      if (!existingLabel) {
        const nameSprite = this.makePointLabelSprite(p.name ?? '', labelColor)
        nameSprite.position.copy(this.getSmartLabelPosition(sprite.position))
        nameSprite.center.set(
          ThreeRenderer.POINT_LABEL_CENTER_X,
          ThreeRenderer.POINT_LABEL_CENTER_Y,
        )
        nameSprite.renderOrder = 10
        const scale = this.getPointLabelScale()
        nameSprite.scale.set(scale, scale, 1)
        ;(nameSprite as any).userData = { text: p.name ?? '' }
        ;(sprite.userData as any)[labelKey] = nameSprite
        this.world.add(nameSprite)
      } else {
        existingLabel.visible = true
        existingLabel.center.set(
          ThreeRenderer.POINT_LABEL_CENTER_X,
          ThreeRenderer.POINT_LABEL_CENTER_Y,
        )
        existingLabel.position.copy(this.getSmartLabelPosition(sprite.position))
        const labelText = (existingLabel as any).userData?.text ?? ''
        if (labelText !== (p.name ?? '')) {
          ;(existingLabel as any).userData = { text: p.name ?? '' }
          const material = existingLabel.material as THREE.SpriteMaterial
          const newSprite = this.makePointLabelSprite(p.name ?? '', labelColor)
          material.map = (newSprite.material as THREE.SpriteMaterial).map
        } else {
          const material = existingLabel.material as THREE.SpriteMaterial
          const map = material.map as THREE.CanvasTexture | null
          if (map) {
            const ctx = (map.image as HTMLCanvasElement).getContext('2d')
            if (ctx) {
              this.drawNameLabel(ctx, map.image as HTMLCanvasElement, p.name ?? '', labelColor, 72)
              map.needsUpdate = true
            }
          }
        }
      }
    })
  }

  private syncLines(scene: GeoScene) {
    scene.lines.forEach((lineData, id) => {
      let line = this.meshMap.get(id) as THREE.Line
      const p1 = lineData.p1.position
      const p2 = lineData.p2.position
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]

      if (!line) {
        // 首次创建
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff })
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

      // 选中高亮逻辑
      const isSelected = scene.selection.lines.has(id)
      ;(line.material as THREE.LineBasicMaterial).color.set(isSelected ? 0x43f260 : 0xffffff)

      const mid = new THREE.Vector3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
      this.syncLinearLabel(line, lineData.name ?? '', lineData.nameVisible, mid, isSelected ? 0x43f260 : 0xffffff)
    })
  }

  private syncRays(scene: GeoScene) {
    scene.rays.forEach((rayData, id) => {
      let ray = this.meshMap.get(id) as THREE.Line | undefined
      const p1 = rayData.p1.position
      const end = rayData.getDisplayEndPoint()
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(end.x, end.y, end.z)]

      if (!ray) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineDashedMaterial({
          color: ThreeRenderer.RAY_COLOR,
          dashSize: 0.6,
          gapSize: 0.28,
        })
        ray = new THREE.Line(geo, mat)
        ray.computeLineDistances()
        ray.userData = { geoId: id, type: 'ray' }
        this.attachRayArrowHead(ray)
        this.world.add(ray)
        this.meshMap.set(id, ray)
      } else {
        ray.geometry.setFromPoints(points)
        ray.geometry.attributes.position!.needsUpdate = true
        ray.geometry.computeBoundingBox()
        ray.geometry.computeBoundingSphere()
        ray.computeLineDistances()
      }

      ray.visible = rayData.visible
      const isSelected = scene.selection.rays.has(id)
      ;(ray.material as THREE.LineDashedMaterial).color.set(
        isSelected ? 0x43f260 : ThreeRenderer.RAY_COLOR,
      )

      this.updateRayArrowHead(ray, rayData, isSelected)
      const mid = new THREE.Vector3((p1.x + end.x) / 2, (p1.y + end.y) / 2, (p1.z + end.z) / 2)
      this.syncLinearLabel(
        ray,
        rayData.name ?? '',
        rayData.nameVisible && rayData.visible,
        mid,
        isSelected ? 0x43f260 : ThreeRenderer.RAY_COLOR,
      )
    })
  }

  private syncLinearLabel(
    object: THREE.Object3D,
    text: string,
    visible: boolean,
    anchor: THREE.Vector3,
    color: number,
  ) {
    const labelKey = '__labelSprite'
    const existingLabel = (object.userData as any)[labelKey] as THREE.Sprite | undefined
    ;(object.userData as any).__labelAnchor = anchor.clone()
    ;(object.userData as any).__labelOffsetX = 0
    ;(object.userData as any).__labelOffsetY = ThreeRenderer.LINE_LABEL_OFFSET_Y
    if (!visible) {
      if (existingLabel) existingLabel.visible = false
      return
    }
    if (!existingLabel) {
      const nameSprite = this.makeLineLabelSprite(text, color)
      nameSprite.position.copy(
        this.getScreenOffsetPosition(anchor, 0, ThreeRenderer.LINE_LABEL_OFFSET_Y),
      )
      nameSprite.center.set(ThreeRenderer.LINE_LABEL_CENTER_X, ThreeRenderer.LINE_LABEL_CENTER_Y)
      nameSprite.renderOrder = 10
      const scale = this.getLineLabelScale()
      nameSprite.scale.set(scale, scale, 1)
      ;(nameSprite as any).userData = { text }
      ;(object.userData as any)[labelKey] = nameSprite
      this.world.add(nameSprite)
      return
    }

    existingLabel.visible = true
    existingLabel.center.set(ThreeRenderer.LINE_LABEL_CENTER_X, ThreeRenderer.LINE_LABEL_CENTER_Y)
    existingLabel.position.copy(
      this.getScreenOffsetPosition(anchor, 0, ThreeRenderer.LINE_LABEL_OFFSET_Y),
    )
    const labelText = (existingLabel as any).userData?.text ?? ''
    if (labelText !== text) {
      ;(existingLabel as any).userData = { text }
      const material = existingLabel.material as THREE.SpriteMaterial
      const newSprite = this.makeLineLabelSprite(text, color)
      material.map = (newSprite.material as THREE.SpriteMaterial).map
      return
    }

    const material = existingLabel.material as THREE.SpriteMaterial
    const map = material.map as THREE.CanvasTexture | null
    if (!map) return
    const ctx = (map.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) return
    this.drawNameLabel(ctx, map.image as HTMLCanvasElement, text, color, 56)
    map.needsUpdate = true
  }

  private attachRayArrowHead(ray: THREE.Line) {
    const geometry = new THREE.ConeGeometry(
      ThreeRenderer.RAY_HEAD_RADIUS,
      ThreeRenderer.RAY_HEAD_LENGTH,
      16,
    )
    const material = new THREE.MeshBasicMaterial({ color: ThreeRenderer.RAY_COLOR })
    const arrowHead = new THREE.Mesh(geometry, material)
    arrowHead.rotation.x = Math.PI / 2
    ;(ray.userData as any).__arrowHead = arrowHead
    ray.add(arrowHead)
  }

  private updateRayArrowHead(ray: THREE.Line, rayData: Ray3, isSelected: boolean) {
    const arrowHead = (ray.userData as any).__arrowHead as THREE.Mesh | undefined
    if (!arrowHead) return

    arrowHead.visible = rayData.visible
    ;(arrowHead.material as THREE.MeshBasicMaterial).color.set(
      isSelected ? 0x43f260 : ThreeRenderer.RAY_COLOR,
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
    // 正方向箭头
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), length, color, 0.5, 0.3)
    this.axisGridGroup.add(arrow)

    // 反方向轴线
    const negPoints = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(-length)]
    const negGeo = new THREE.BufferGeometry().setFromPoints(negPoints)
    const negLine = new THREE.Line(negGeo, new THREE.LineBasicMaterial({ color }))
    this.axisGridGroup.add(negLine)

    // 与轴同色的文字标签，位置远离轴端（距离 0.5 单位），于Y轴分开显示
    const labelPos = dir.clone().multiplyScalar(length + 0.5)
    const textSprite = this.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    this.axisGridGroup.add(textSprite)
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
      0.8,
      color,
      0.5,
      0.3,
    )
    this.axisGridGroup.add(arrow)

    // 白色刻度线（每1单位一条短横线）
    for (let i = -length; i <= length; i++) {
      if (i === 0) continue

      const tickStart = dir.clone().multiplyScalar(i)
      const tickEnd = tickStart.clone().add(new THREE.Vector3(0.4, 0, 0)) // 向 X 方向偏移

      const tickGeo = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd])
      const tickLine = new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0xffffff }))
      this.axisGridGroup.add(tickLine)
    }

    // 绿色 "Y" 标签，远离轴端
    const labelPos = dir.clone().multiplyScalar(length + 1)
    const textSprite = this.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    this.axisGridGroup.add(textSprite)
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

  setAxisGridSize(size: number) {
    this.axisGridSize = size

    // 清空旧的坐标轴与网格
    while (this.axisGridGroup.children.length > 0) {
      const child = this.axisGridGroup.children.pop()!
      this.axisGridGroup.remove(child)
    }

    // 坐标轴正负方向长度 = size（总长度 = 2 * size）
    this.addCustomAxes(size)

    // 网格尺寸与坐标轴总长度对齐：总长度 = 2 * size
    // 分割数 = 2 * size（保持每格 1 单位）
    const gridSize = size * 2
    const divisions = gridSize
    const gridHelper = new THREE.GridHelper(gridSize, divisions)
    this.axisGridGroup.add(gridHelper)
    this.camera.position.copy(this.getDefaultCameraPositionForAxisSize(this.axisGridSize))
    if (this.isARMode) {
      this.setWorldScale(this.getARSceneScaleForAxisSize(this.axisGridSize))
      return
    }
    this.refreshScreenSpaceScales()
  }

  private drawNameLabel(
    context: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    message: string,
    color: number,
    mainFontSize: number,
  ) {
    const match = message.match(/^(.+?)(\d+)$/)
    const mainText = match?.[1] ?? message
    const suffixText = match?.[2] ?? ''
    const suffixFontSize = Math.round(mainFontSize * 0.58)
    const gap = suffixText ? Math.max(4, Math.round(mainFontSize * 0.04)) : 0
    const baselineY = canvas.height / 2 + mainFontSize * 0.18

    const r = (color >> 16) & 255
    const g = (color >> 8) & 255
    const b = color & 255

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = `rgb(${r}, ${g}, ${b})`
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'

    context.font = `Bold ${mainFontSize}px Arial`
    const mainWidth = context.measureText(mainText).width

    let suffixWidth = 0
    if (suffixText) {
      context.font = `Bold ${suffixFontSize}px Arial`
      suffixWidth = context.measureText(suffixText).width
    }

    const startX = (canvas.width - (mainWidth + gap + suffixWidth)) / 2

    context.font = `Bold ${mainFontSize}px Arial`
    context.fillText(mainText, startX, baselineY)

    if (suffixText) {
      context.font = `Bold ${suffixFontSize}px Arial`
      context.fillText(suffixText, startX + mainWidth + gap, baselineY + mainFontSize * 0.22)
    }
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
  private makePointLabelSprite(message: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    this.drawNameLabel(context, canvas, message, color, 72)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    return new THREE.Sprite(material)
  }

  /** 创建线段名称标签（无背景） */
  private makeLineLabelSprite(message: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 256
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    this.drawNameLabel(context, canvas, message, color, 56)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      transparent: true,
    })

    return new THREE.Sprite(material)
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
      const label = (obj.userData as any)?.__labelSprite as THREE.Sprite | undefined
      if (!label || !label.visible) return

      const offsetX = Number((obj.userData as any)?.__labelOffsetX ?? 0)
      const offsetY = Number((obj.userData as any)?.__labelOffsetY ?? 0)

      if ((obj.userData as any)?.type === 'point') {
        label.position.copy(this.getScreenOffsetPosition(obj.position, offsetX, offsetY))
      } else if (
        (obj.userData as any)?.type === 'line' ||
        (obj.userData as any)?.type === 'ray'
      ) {
        const anchor = ((obj.userData as any)?.__labelAnchor as THREE.Vector3 | undefined)?.clone()
        if (!anchor) return
        label.position.copy(this.getScreenOffsetPosition(anchor, offsetX, offsetY))
      }
    })
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
