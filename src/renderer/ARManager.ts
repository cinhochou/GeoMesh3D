import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type ARToolkitSourceLike = {
  domElement?: HTMLVideoElement
  ready?: boolean
  init: (onReady: () => void) => void
  onResizeElement?: () => void
  onResize?: () => void
  copyElementSizeTo?: (el: HTMLElement) => void
  copySizeTo?: (el: HTMLElement) => void
  dispose?: () => void
}

type ARToolkitContextLike = {
  init: (onReady: () => void) => void
  getProjectionMatrix: () => THREE.Matrix4
  update: (sourceElement: HTMLElement) => void
  /** ar.js 内部持有的 ARToolKit 控制器：持有 WASM 内存与 50Hz 轮询定时器，必须显式释放 */
  arController?: { dispose?: () => void } | null
  dispose?: () => void
}

type ARMarkerControlsLike = {
  dispose?: () => void
}

interface ARManagerDeps {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  arCamera: THREE.PerspectiveCamera
  controls: OrbitControls
  renderer: THREE.WebGLRenderer
  world: THREE.Group
  arAnchorGroup: THREE.Group
  arMarkerRoot: THREE.Group
  container: HTMLElement
  axisGridSize: number
  refreshScreenSpaceScales: () => void
  onResize: () => void
  setWorldScale: (scale: number) => void
  setSharedWorldQuaternion: (q: THREE.Quaternion, immediate?: boolean) => void
}

export class ARManager {
  private arToolkitSource: ARToolkitSourceLike | null = null
  private arToolkitContext: ARToolkitContextLike | null = null
  private arMarkerControls: ARMarkerControlsLike | null = null
  /**
   * camera_para.dat / myTraining.patt 的加载去重。
   *
   * ar.js 内部用 XHR 直接拉这两个文件，既不走THREE.Cache，也不受浏览器缓存可靠控制，
   * 且每次 new ArToolkitContext / ArMarkerControls 都会重新拉一遍。
   * 这里记录「是否已发起过初始化」：同一页面会话内只初始化一次，
   * 反复开关 AR 时复用已有的 context / controls，不再重复下载。
   */
  private arKitInitialized = false
  private _isARMode = false
  private arAnchorInitialized = false
  private arLastMarkerSeenAt = 0
  private worldScale = 1
  private arInitialWorldScale = 1

  private backupState = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(),
    worldQuaternion: new THREE.Quaternion(),
    zoom: 1,
    fov: 30,
    controlsEnabled: true,
  }

  private static readonly BACKGROUND_COLOR = 0x111111
  private static readonly AR_MARKER_FOLLOW_LERP = 0.35
  private static readonly AR_MARKER_REACQUIRE_LERP = 0.18
  private static readonly AR_MARKER_PERSIST_MS = 1500
  private static readonly AR_WORLD_SCALE_MIN = 0.02
  private static readonly AR_WORLD_SCALE_MAX = 1.6

  constructor(private deps: ARManagerDeps) {}

  get isARMode(): boolean {
    return this._isARMode
  }

  get currentWorldScale(): number {
    return this.worldScale
  }

  get initialWorldScale(): number {
    return this.arInitialWorldScale
  }

  getActiveCamera(): THREE.Camera {
    return this._isARMode ? this.deps.arCamera : this.deps.camera
  }

  getActiveCameraSpriteScaleFactor(): number {
    const cam = this.getActiveCamera()
    if (this._isARMode) {
      const m = cam.projectionMatrix.elements
      if (m[5] !== 0) return Math.abs(m[5]) / 2
    }
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const fov = (cam as THREE.PerspectiveCamera).fov
      if (fov > 0 && isFinite(fov)) {
        return 1 / (2 * Math.tan((fov / 2) * Math.PI / 180))
      }
    }
    const m = cam.projectionMatrix.elements
    if (m[5] !== 0) return Math.abs(m[5]) / 2
    return 1
  }

  private resetARAnchor() {
    this.arAnchorInitialized = false
    this.arLastMarkerSeenAt = 0
    this.deps.arAnchorGroup.position.set(0, 0, 0)
    this.deps.arAnchorGroup.quaternion.identity()
    this.deps.arAnchorGroup.scale.set(1, 1, 1)
    this.deps.arAnchorGroup.updateMatrixWorld(true)
    this.deps.arMarkerRoot.visible = false
    this.deps.arMarkerRoot.matrix.identity()
    this.deps.arMarkerRoot.matrixWorld.identity()
    this.deps.arMarkerRoot.position.set(0, 0, 0)
    this.deps.arMarkerRoot.quaternion.identity()
    this.deps.arMarkerRoot.scale.set(1, 1, 1)
  }

  private syncARAnchorFromMarker() {
    if (!this.deps.arMarkerRoot.visible) return

    this.deps.arMarkerRoot.updateMatrixWorld(true)

    const nextPosition = new THREE.Vector3()
    const nextQuaternion = new THREE.Quaternion()
    const nextScale = new THREE.Vector3()
    this.deps.arMarkerRoot.matrixWorld.decompose(nextPosition, nextQuaternion, nextScale)

    const now = performance.now()
    const lerpAlpha = !this.arAnchorInitialized
      ? 1
      : now - this.arLastMarkerSeenAt <= 120
        ? ARManager.AR_MARKER_FOLLOW_LERP
        : ARManager.AR_MARKER_REACQUIRE_LERP

    this.deps.arAnchorGroup.position.lerp(nextPosition, lerpAlpha)
    this.deps.arAnchorGroup.quaternion.slerp(nextQuaternion, lerpAlpha)
    this.deps.arAnchorGroup.scale.lerp(nextScale, lerpAlpha)
    this.deps.arAnchorGroup.updateMatrixWorld(true)

    this.arAnchorInitialized = true
    this.arLastMarkerSeenAt = now
  }

  public shouldRenderPersistentARWorld() {
    return (
      this.arAnchorInitialized &&
      performance.now() - this.arLastMarkerSeenAt <= ARManager.AR_MARKER_PERSIST_MS
    )
  }

  private updateARWorldPlacement() {
    this.deps.world.position.set(0, 0, 0)
  }

  public getARSceneScaleForAxisSize(size: number) {
    if (size >= 40) return 0.025
    if (size >= 20) return 0.045
    return 0.08
  }

  private applyWorldScale(scale: number) {
    const clampedScale = THREE.MathUtils.clamp(
      scale,
      ARManager.AR_WORLD_SCALE_MIN,
      ARManager.AR_WORLD_SCALE_MAX,
    )
    this.worldScale = clampedScale
    this.deps.world.scale.setScalar(clampedScale)
    this.updateARWorldPlacement()
    this.deps.refreshScreenSpaceScales()
  }

  setARWorldScale(scale: number) {
    if (!this._isARMode) return
    this.applyWorldScale(scale)
  }

  scaleARWorldBy(factor: number) {
    if (!this._isARMode || !Number.isFinite(factor) || factor <= 0) return
    this.applyWorldScale(this.worldScale * factor)
  }

  private adjustARProjectionAspect() {
    const w = Math.max(this.deps.container.clientWidth, 1)
    const h = Math.max(this.deps.container.clientHeight, 1)
    const canvasAspect = w / h
    const m = this.deps.arCamera.projectionMatrix.elements
    const cotHalfFovY = Math.abs(m[5])
    if (cotHalfFovY > 0 && isFinite(canvasAspect) && canvasAspect > 0) {
      m[0] = cotHalfFovY / canvasAspect
    }
  }

  private applyVideoForceStyle(video: HTMLVideoElement) {
    video.style.position = 'absolute'
    video.style.top = '0'
    video.style.left = '0'
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'cover'
    video.style.zIndex = '0'
    video.style.pointerEvents = 'none'
    video.style.marginLeft = '0px'
    video.style.marginTop = '0px'
  }

  private initAR() {
    // 摄像头源每次进入 AR 都要重建（MediaStream 是一次性的，必须重新申请权限与轨道），
    // 但 ARToolKit 的标定参数与 marker 图样不随进入次数变化，重建会造成重复 XHR 下载。
    this.arToolkitSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' })
    const source = this.arToolkitSource
    if (!source) return
    source.init(() => {
      const video = source.domElement as HTMLVideoElement
      if (!video) return

      if (video.parentElement !== this.deps.container) {
        video.parentElement?.removeChild(video)
        this.deps.container.appendChild(video)
      }

      this.applyVideoForceStyle(video)

      setTimeout(() => {
        if (this._isARMode) this.deps.onResize()
      }, 200)
    })

    // 标定参数 + marker 图样：整个会话内只初始化一次，复用已有实例避免重复下载
    if (this.arKitInitialized && this.arToolkitContext) {
      this.deps.scene.visible = false
      return
    }

    this.arToolkitContext = new THREEx.ArToolkitContext({
      cameraParametersUrl: '/data/camera_para.dat',
      detectionMode: 'mono',
    })

    const context = this.arToolkitContext
    if (!context) return
    context.init(() => {
      this.deps.arCamera.projectionMatrix.copy(context.getProjectionMatrix())
      this.adjustARProjectionAspect()
      this.deps.arCamera.projectionMatrixInverse.copy(this.deps.arCamera.projectionMatrix).invert()
      this.deps.arCamera.matrix.identity()
      this.deps.arCamera.matrixWorld.identity()
      this.deps.arCamera.position.set(0, 0, 0)
      this.deps.arCamera.quaternion.identity()
      this.deps.arCamera.updateMatrixWorld(true)
    })

    this.arMarkerControls = new THREEx.ArMarkerControls(this.arToolkitContext, this.deps.arMarkerRoot, {
      type: 'pattern',
      patternUrl: '/arcode/myTraining.patt',
      changeMatrixMode: 'modelViewMatrix',
      maxDetectionRate: 60,
    })

    this.arKitInitialized = true
    this.deps.scene.visible = false
  }

  /**
   * 彻底释放 ARToolKit 相关资源。
   *
   * 必须在丢弃引用之前调用：ar.js 的 ArMarkerControls._initArtoolkit 会启动一个
   * 50Hz（setInterval(..., 1000/50)）轮询等待 arController 就绪，
   * 该定时器只在 arController !== null 时 clearInterval。若在初始化完成前退出 AR，
   * 仅把 context 置为 null 会让这个 50Hz 定时器永久泄漏。
   */
  private disposeARKit() {
    if (this.arMarkerControls) {
      try {
        this.arMarkerControls.dispose?.()
      } catch {
        // dispose 失败不影响继续释放其余资源
      }
      this.arMarkerControls = null
    }

    if (this.arToolkitContext) {
      try {
        this.arToolkitContext.arController?.dispose?.()
      } catch {
        // 同上
      }
      try {
        this.arToolkitContext.dispose?.()
      } catch {
        // 同上
      }
      this.arToolkitContext = null
    }

    this.arKitInitialized = false
  }

  async toggleAR(enabled: boolean) {
    this._isARMode = enabled

    if (enabled) {
      this.backupState.position.copy(this.deps.camera.position)
      this.backupState.quaternion.copy(this.deps.camera.quaternion)
      this.backupState.target.copy(this.deps.controls.target)
      this.backupState.worldQuaternion.copy(this.deps.world.quaternion)
      this.backupState.zoom = this.deps.camera.zoom
      this.backupState.fov = this.deps.camera.fov
      this.backupState.controlsEnabled = this.deps.controls.enabled

      this.deps.renderer.setClearColor(0x000000, 0)
      this.deps.scene.background = null
      this.deps.controls.enabled = false
      this.resetARAnchor()
      this.applyWorldScale(this.getARSceneScaleForAxisSize(this.deps.axisGridSize))
      this.arInitialWorldScale = this.worldScale

      try {
        this.initAR()
      } catch (err) {
        this._isARMode = false
        this.restoreFromBackupState()
        throw err
      }
    } else {
      this.restoreFromBackupState()
    }
  }

  private restoreFromBackupState() {
    this._isARMode = false
    this.arInitialWorldScale = 1
    this.resetARAnchor()
    this.applyWorldScale(1)
    this.deps.setSharedWorldQuaternion(this.backupState.worldQuaternion, true)

    if (this.arToolkitSource) {
      if (this.arToolkitSource.domElement) {
        const srcObject = this.arToolkitSource.domElement.srcObject
        if (srcObject instanceof MediaStream) {
          srcObject.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        }
        this.arToolkitSource.domElement.remove()
      }
      try {
        this.arToolkitSource.dispose?.()
      } catch {
        // dispose 失败不影响继续恢复场景状态
      }
      this.arToolkitSource = null
    }
    // ARToolKit 的标定参数与 marker 图样较贵（需 XHR 下载 + WASM 实例），
    // 保留实例供下次进入 AR 复用，避免反复开关 AR 都重新下载。
    // camera_para.dat 与 myTraining.patt 是内容恒定的静态资源，无过期风险。
    this.deps.arMarkerRoot.visible = false

    this.deps.scene.visible = true
    this.deps.camera.visible = true

    this.deps.camera.matrixAutoUpdate = true

    this.deps.camera.matrix.identity()
    this.deps.camera.matrixWorld.identity()

    this.deps.camera.fov = this.backupState.fov
    this.deps.camera.near = 0.1
    this.deps.camera.far = 1000
    this.deps.camera.zoom = this.backupState.zoom
    this.deps.camera.aspect = this.deps.container.clientWidth / this.deps.container.clientHeight

    this.deps.camera.projectionMatrix.identity()
    this.deps.camera.updateProjectionMatrix()

    this.deps.camera.position.copy(this.backupState.position)
    this.deps.camera.quaternion.copy(this.backupState.quaternion)
    this.deps.camera.updateMatrixWorld(true)

    this.deps.controls.target.copy(this.backupState.target)
    this.deps.controls.enabled = this.backupState.controlsEnabled
    this.deps.controls.update()

    this.deps.renderer.setClearColor(ARManager.BACKGROUND_COLOR, 1)
    this.deps.scene.background = new THREE.Color(ARManager.BACKGROUND_COLOR)

    const canvas = this.deps.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.marginTop = '0px'
    canvas.style.marginLeft = '0px'

    this.deps.onResize()
  }

  handleARResize() {
    if (!this._isARMode) return
    if (this.arToolkitSource && this.arToolkitSource.ready) {
      const source = this.arToolkitSource
      const video = source.domElement

      if (typeof source.onResizeElement === 'function') source.onResizeElement()
      else if (typeof source.onResize === 'function') source.onResize()

      if (video) {
        this.applyVideoForceStyle(video)
      }

      if (typeof source.copyElementSizeTo === 'function') {
        source.copyElementSizeTo(this.deps.renderer.domElement)
      } else if (typeof source.copySizeTo === 'function') {
        source.copySizeTo(this.deps.renderer.domElement)
      }

      this.deps.renderer.domElement.style.width = '100%'
      this.deps.renderer.domElement.style.height = '100%'
      this.deps.renderer.domElement.style.marginLeft = '0px'
      this.deps.renderer.domElement.style.marginTop = '0px'
      this.deps.renderer.domElement.style.objectFit = 'contain'

      this.adjustARProjectionAspect()
      this.deps.arCamera.projectionMatrixInverse.copy(this.deps.arCamera.projectionMatrix).invert()
    }
  }

  renderARFrame() {
    if (!this._isARMode) return
    if (!this.arToolkitContext || this.arToolkitSource?.ready === false) return false

    const sourceElement = this.arToolkitSource?.domElement
    if (!sourceElement) return false
    this.arToolkitContext.update(sourceElement)
    this.deps.arCamera.projectionMatrixInverse.copy(this.deps.arCamera.projectionMatrix).invert()
    this.deps.arCamera.updateMatrixWorld(true)
    this.syncARAnchorFromMarker()
    this.deps.scene.visible = this.deps.arMarkerRoot.visible || this.shouldRenderPersistentARWorld()
    return true
  }

  getARVideoElement(): HTMLVideoElement | null {
    return this._isARMode && this.arToolkitSource?.domElement
      ? (this.arToolkitSource.domElement as HTMLVideoElement)
      : null
  }

  /**
   * 释放全部 AR 资源。应在编辑器销毁时调用（ARManager 生命周期与编辑器一致）。
   *
   * 与 restoreFromBackupState 的区别：退出 AR 时为了避免重复下载会保留
   * ARToolKit 实例复用，而这里是彻底销毁（页面卸载 / 编辑器销毁场景），
   * 必须释放 arController 以停掉 ar.js 内部的 50Hz 轮询定时器。
   */
  dispose() {
    if (this.arToolkitSource) {
      const video = this.arToolkitSource.domElement
      if (video) {
        const srcObject = video.srcObject
        if (srcObject instanceof MediaStream) {
          srcObject.getTracks().forEach((t: MediaStreamTrack) => t.stop())
        }
        video.remove()
      }
      try {
        this.arToolkitSource.dispose?.()
      } catch {
        // 忽略释放失败
      }
      this.arToolkitSource = null
    }
    this.disposeARKit()
  }
}
