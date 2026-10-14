// src/renderer/FloatSceneRenderer.ts
// 浮窗播放专用的「第二 renderer」。
//
// 为什么需要第二套渲染栈：
//   浮窗模式下要**同时**呈现两份内容——主视图继续显示编辑器场景（可继续协作作图），
//   浮窗显示影子场景（动画播放）。而 GeometrySyncer 的几何是写进单一 world 组的，
//   一个 world 只能承载一份场景，因此浮窗必须有自己独立的 renderer / scene / syncer。
//   选择「第二 renderer + 第二 canvas」而非同 canvas 分区渲染，是为了状态完全隔离：
//   浮窗的相机、标签层、几何增删都不会影响主视图的 GL 状态。
//
// 这里刻意**不**构造完整 ThreeRenderer（AR、坐标轴网格、共享世界旋转等浮窗都不需要），
// 只搭最小可用栈：
//   WebGLRenderer + Scene + world + PerspectiveCamera + OrbitControls
//   + LabelRenderer + GeometrySyncer（后两者用桩对象补齐浮窗用不到的依赖）

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GeometrySyncer } from './GeometrySyncer'
import { LabelRenderer } from './LabelRenderer'
import { AxisGridManager } from './AxisGridManager'
import type { ARManager } from './ARManager'
import type { Scene as GeoScene } from '../core/scene/Scene'

/** 相机状态（与 ShadowScene.CameraState 结构一致，此处不反向依赖动画模块） */
export interface FloatCameraState {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  zoom: number
  controlsEnabled: boolean
}

export interface FloatSceneRendererOptions {
  antialias: boolean
  /** 主视图的背景色（保持与主视图一致） */
  backgroundColor: number
  /** devicePixelRatio × 分辨率缩放系数 */
  pixelRatioScale: number
  /** WebGL 上下文丢失回调（双上下文场景下更易发生，交由上层降级处理） */
  onContextLost?: () => void
  /**
   * 取主视图画布高度（px）。
   *
   * 用途：浮窗画布远小于主视图时，若沿用「固定像素尺寸」的精灵/标签常量，
   * 点和名称标签相对小窗就显得过大、甚至相互重叠。以主视图高度为基准按比例缩放，
   * 浮窗就会呈现为「主视图的等比缩小版」。
   */
  getReferenceCanvasHeight?: () => number
  /** 坐标轴网格尺寸（与主视图保持一致） */
  axisGridSize?: number
}

/** 主视图默认视角（与 ThreeRenderer 的初始机位一致，便于浮窗首帧观感一致） */
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(32, 20, 32)

/** 聚焦允许的最小相机距离（远小于默认下限，保证各档推近都能生效） */
const FOCUS_ALLOWED_MIN_DISTANCE = 0.05

export class FloatSceneRenderer {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly domElement: HTMLCanvasElement

  private readonly renderer: THREE.WebGLRenderer
  private readonly world: THREE.Group
  private readonly controls: OrbitControls
  private readonly labelRenderer: LabelRenderer
  private readonly geometrySyncer: GeometrySyncer
  private readonly axisGridManager: AxisGridManager
  private readonly pixelRatioScale: number
  private readonly getReferenceCanvasHeight: (() => number) | null
  /** 用户是否正在浮窗内手动操作相机 */
  private interacting = false
  private disposed = false
  private onContextLost: (() => void) | null = null
  private handleContextLost: ((event: Event) => void) | null = null

  constructor(container: HTMLElement, options: FloatSceneRendererOptions) {
    this.pixelRatioScale = options.pixelRatioScale
    this.getReferenceCanvasHeight = options.getReferenceCanvasHeight ?? null

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(options.backgroundColor)

    this.world = new THREE.Group()
    this.scene.add(this.world)

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000)
    this.camera.position.copy(DEFAULT_CAMERA_POSITION)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({
      antialias: options.antialias,
      alpha: true,
    })
    this.domElement = this.renderer.domElement
    this.renderer.setPixelRatio((window.devicePixelRatio || 1) * this.pixelRatioScale)
    this.renderer.setSize(container.clientWidth || 1, container.clientHeight || 1, false)
    Object.assign(this.domElement.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      touchAction: 'none',
    })
    container.appendChild(this.domElement)

    // 双 WebGL 上下文下更易触发上下文丢失：捕获后通知上层降级（切回原地播放），
    // 不做自动重建（重建涉及几何全量重同步，交给用户重新开启浮窗即可）。
    this.onContextLost = options.onContextLost ?? null
    this.handleContextLost = (event: Event) => {
      event.preventDefault()
      this.onContextLost?.()
    }
    this.domElement.addEventListener('webglcontextlost', this.handleContextLost, false)

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 5)
    this.scene.add(light)
    this.scene.add(new THREE.AmbientLight(0x404040))

    this.controls = new OrbitControls(this.camera, this.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 11
    this.controls.maxDistance = 215
    // 播放期间允许手动转动视角（与主视图一致：聚焦插值会让位）
    this.controls.addEventListener('start', () => {
      this.interacting = true
    })
    this.controls.addEventListener('end', () => {
      this.interacting = false
    })

    // 浮窗用不到的依赖：给最小桩对象，避免为了一个浮窗去构造 AR / 坐标轴网格。
    // 说明：GeometrySyncer 只读取 arManager 的 currentWorldScale/initialWorldScale/isARMode
    // 与 axisGridManager.axisLabels；浮窗在 AR 模式下被禁用，因此这里的桩是安全的。
    const arStub = {
      currentWorldScale: 1,
      initialWorldScale: 1,
      isARMode: false,
    } as unknown as ARManager

    this.labelRenderer = new LabelRenderer({
      container,
      getActiveCamera: () => this.camera,
      getActiveCameraSpriteScaleFactor: () => 1,
      isARActive: () => false,
      isTouchPreferredDevice: () => false,
      isARCoarsePointer: () => false,
      world: this.world,
      scene: this.scene,
      getCurrentWorldScale: () => 1,
      // LabelRenderer 构造时不会调用；延迟到 syncer 就绪后取真实值
      getFovSpriteScale: () => this.geometrySyncer?.getFovSpriteScale() ?? 1,
    })

    // 真实的坐标轴管理器（浮窗需要「坐标系开/关」按钮）。
    // 必须建在 LabelRenderer 之后：setAxisGridSize 会立即生成轴标签精灵，
    // 走 makeColoredTextSprite，此时 labelRenderer 必须已就绪。
    // AR 相关回调给常量即可：浮窗在 AR 模式下被禁用，不会走到这些分支。
    this.axisGridManager = new AxisGridManager({
      makeColoredTextSprite: (text: string, color: number) =>
        this.labelRenderer.makeColoredTextSprite(text, color),
      updateRendererPixelRatio: () => {},
      refreshScreenSpaceScales: () => this.refreshScreenSpaceScales(),
      getWorldScale: () => 1,
      getFovSpriteScale: () => this.geometrySyncer?.getFovSpriteScale() ?? 1,
      getARMode: () => false,
      getARSceneScaleForAxisSize: () => 1,
      setWorldScale: () => {},
      camera: this.camera,
      controls: this.controls,
      isMobileDevice: false,
    })
    this.world.add(this.axisGridManager.axisGridGroup)

    this.geometrySyncer = new GeometrySyncer({
      scene: this.scene,
      world: this.world,
      container,
      getActiveCamera: () => this.camera,
      getActiveCameraSpriteScaleFactor: () => 1,
      isARActive: () => false,
      labelRenderer: this.labelRenderer,
      axisGridManager: this.axisGridManager,
      arManager: arStub,
      // 精灵/标签按主视图高度等比缩放（小窗不再出现「点太大、标签重叠」）
      getSpritePixelScaleFactor: () => this.getPixelScaleFactor(),
      isTouchPreferredDevice: () => false,
      isMobileDevice: false,
      renderer: this.renderer,
      camera: this.camera,
      controls: this.controls,
    })

    // ⚠ 必须在 GeometrySyncer 之后再初始化坐标轴尺寸：
    // AxisGridManager.setAxisGridSize() 内部会回调 deps.refreshScreenSpaceScales()，
    // 而该回调要访问 geometrySyncer —— 若提前调用，syncer 尚未赋值，
    // 会抛 "Cannot read properties of undefined (reading 'refreshScreenSpaceScales')"，
    // 表现为「一打开浮窗播放就报错」。
    this.axisGridManager.setAxisGridSize(options.axisGridSize ?? 10)
  }

  /** 同步几何（脏标记驱动，未变化时几乎零开销） */
  sync(geoScene: GeoScene): void {
    if (this.disposed) return
    this.geometrySyncer.sync(geoScene, null, null, null, null)
  }

  /**
   * 刷新屏幕空间的缩放与**标签位置**。
   *
   * ⚠ 标签位置必须逐帧重算：GeometrySyncer 只在几何同步时按「当时的相机」算过一次，
   * 浮窗里相机做聚焦过渡后会移动，标签就会漂到点位上去（表现为「点与名称标签重合」）。
   * 主视图由 ThreeRenderer 每帧调用 updateScreenSpaceLabels()，浮窗此前漏了这一环。
   */
  updateResponsiveScales(): void {
    if (this.disposed) return
    this.refreshScreenSpaceScales()
    this.geometrySyncer.updateScreenSpaceLabels()
  }

  private refreshScreenSpaceScales(): void {
    // 防御：坐标轴管理器的 setAxisGridSize 会回调本方法，而它可能在
    // GeometrySyncer 创建之前被调用（构造顺序一旦调整即会命中）。
    // 此时静默跳过即可，syncer 就绪后每帧仍会正常刷新。
    const syncer = this.geometrySyncer as GeometrySyncer | undefined
    const axisGrid = this.axisGridManager as AxisGridManager | undefined
    syncer?.refreshScreenSpaceScales()
    syncer?.updateLinearArrowHeadScales()
    axisGrid?.updateAxisArrowScales()
  }

  /**
   * 精灵/标签的像素缩放系数。
   *
   * GeometrySyncer 的精灵与标签常量是「固定像素尺寸」，直接用在小画布上会让点与
   * 名称标签相对小窗显得过大甚至重叠。以主视图画布高度为基准等比缩放，
   * 浮窗即呈现为「主视图的等比缩小版」，几何元素之间的大小与距离观感一致。
   */
  private getPixelScaleFactor(): number {
    const reference = this.getReferenceCanvasHeight?.() ?? 0
    const own = this.domElement.clientHeight || 0
    if (reference <= 0 || own <= 0) return 1
    // 上限 1（不放大），下限 0.25（极小窗口时不至于缩到看不见）
    return Math.min(1, Math.max(0.25, own / reference))
  }

  // ─────────────── 坐标系 ───────────────

  setCoordinateSystemVisible(visible: boolean): void {
    this.axisGridManager.setCoordinateSystemVisible(visible)
  }

  isCoordinateSystemVisible(): boolean {
    return this.axisGridManager.isCoordinateSystemVisible()
  }

  render(): void {
    if (this.disposed) return
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  setSize(width: number, height: number): void {
    if (this.disposed) return
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }
  // ─────────────── CameraController 接口（供播放器聚焦插值） ───────────────

  getCameraState(): FloatCameraState {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z,
      },
      target: {
        x: this.controls.target.x,
        y: this.controls.target.y,
        z: this.controls.target.z,
      },
      zoom: this.camera.zoom,
      controlsEnabled: this.controls.enabled,
    }
  }

  setCameraState(state: FloatCameraState): void {
    if (this.disposed) return
    this.camera.position.set(state.position.x, state.position.y, state.position.z)
    this.controls.target.set(state.target.x, state.target.y, state.target.z)
    this.camera.zoom = state.zoom
    this.camera.updateProjectionMatrix()
    this.controls.enabled = state.controlsEnabled
    // 聚焦需要比编辑器默认更近的机位：放开轨道控制的距离钳制。
    // OrbitControls.update() 会把相机距离钳到 [minDistance, maxDistance]，
    // 不放开的话各档「推近程度」都会被顶到同一个下限，切换毫无观感差异。
    const dist = this.camera.position.distanceTo(this.controls.target)
    if (dist > 0) {
      this.controls.minDistance = Math.min(FOCUS_ALLOWED_MIN_DISTANCE, dist)
      this.controls.maxDistance = Math.max(this.controls.maxDistance, dist)
    }
    this.controls.update()
  }

  isUserInteracting(): boolean {
    return this.interacting
  }

  /** 复位到默认机位（每次进入浮窗播放时调用，避免沿用上一次的残留视角） */
  resetCamera(): void {
    this.camera.position.copy(DEFAULT_CAMERA_POSITION)
    this.controls.target.set(0, 0, 0)
    this.camera.zoom = 1
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.controls.dispose()
    // 释放浮窗自有 world 内的几何与材质：
    // 浮窗的 GL 资源全部由本实例创建，不与主渲染器共享，因此可安全 dispose。
    this.world.traverse((obj) => {
      const mesh = obj as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }
      mesh.geometry?.dispose()
      const material = mesh.material
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose()
    })
    this.world.clear()
    if (this.handleContextLost) {
      this.domElement.removeEventListener('webglcontextlost', this.handleContextLost, false)
      this.handleContextLost = null
    }
    this.renderer.dispose()
    this.domElement.remove()
  }
}
