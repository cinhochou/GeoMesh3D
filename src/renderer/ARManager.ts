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
}

type ARToolkitContextLike = {
  init: (onReady: () => void) => void
  getProjectionMatrix: () => THREE.Matrix4
  update: (sourceElement: HTMLElement) => void
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

    new THREEx.ArMarkerControls(this.arToolkitContext, this.deps.arMarkerRoot, {
      type: 'pattern',
      patternUrl: '/arcode/myTraining.patt',
      changeMatrixMode: 'modelViewMatrix',
      maxDetectionRate: 60,
    })

    this.deps.scene.visible = false
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
      this.arToolkitSource = null
    }
    this.arToolkitContext = null

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
}
