// src/core/animation/ShadowScene.ts
// 影子场景管理：播放动画时使用独立 Scene，绝不触碰编辑器主场景。
//
// 生命周期：
//   enter()  → 存档相机/controls → new Scene → importScene(复制主场景) → 标记接管
//   exit()   → 销毁影子场景 → 恢复相机/controls → 标记交还
//
// 渲染切换：渲染器根据 activeScene 决定渲染主场景还是影子场景（见 EditorView.loop）。

import type { Scene } from '../scene/Scene'
import { exportScene, importScene } from '../editor/SceneSerializer'

/** 相机状态存档 */
export interface CameraState {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
  zoom: number
  controlsEnabled: boolean
}

/** 该类型由渲染器实现，避免这里直接依赖 Three.js */
export interface CameraController {
  getState(): CameraState
  setState(state: CameraState): void
  /**
   * 用户是否正在手动操作相机（旋转/平移/缩放）。
   * 播放期间的聚焦插值会避让：用户正在控制视角时不与用户抢镜头。
   * 未实现时视为「未在操作」。
   */
  isUserInteracting?: () => boolean
}

export class ShadowScene {
  private shadow: Scene | null = null
  private savedCamera: CameraState | null = null

  constructor(
    private readonly mainScene: Scene,
    /**
     * **存档/恢复**用的相机控制器：始终指向主视图相机。
     * 进入播放时存档、退出时恢复，保证「关闭播放后编辑器视角原样回来」。
     * 这与播放中实际操作的相机可能是两个对象（浮窗播放时操作的是浮窗相机）。
     */
    private readonly camera: CameraController,
    /**
     * 播放期间的**实时相机读写**（聚焦 / 过渡插值）。
     * 缺省与 `camera` 相同；浮窗播放时由上层指向浮窗相机。
     */
    private readonly liveCamera: CameraController = camera,
  ) {}

  /** 是否处于播放接管状态 */
  get isActive(): boolean {
    return this.shadow !== null
  }

  /**
   * 当前应被渲染的场景：接管中返回影子场景，否则返回主场景。
   * 渲染器每帧读取此值决定渲染目标。
   */
  get activeScene(): Scene {
    return this.shadow ?? this.mainScene
  }

  /** 影子场景实例（仅在接管中有效） */
  get scene(): Scene | null {
    return this.shadow
  }

  /**
   * 进入播放：复制主场景到影子场景。
   * 幂等：重复调用不会重建。
   *
   * 说明：**不禁用轨道交互** —— 播放期间允许用户手动转动/缩放视角。
   * 聚焦逻辑本就保持视线方向，只在「用户未在操作相机」时写入相机，
   * 因此两者不会互相抢镜头（见 AnimationPlayer.stepTransition）。
   */
  enter(): Scene {
    if (this.shadow) return this.shadow

    this.savedCamera = this.camera.getState()

    const shadow = new (this.mainScene.constructor as new () => Scene)()
    importScene(shadow, JSON.parse(JSON.stringify(exportScene(this.mainScene))))
    shadow.solveDirtyConstraints()

    this.shadow = shadow
    return shadow
  }

  /**
   * 退出播放：销毁影子场景并恢复相机。
   * 主场景全程未被触碰，天然完好。
   */
  exit(): void {
    if (!this.shadow) return
    this.shadow = null
    if (this.savedCamera) {
      this.camera.setState(this.savedCamera)
      this.savedCamera = null
    }
  }

  // ─────────────── 编辑器视角存档（与播放视角相互独立） ───────────────

  /**
   * 读取「进入播放前的编辑器视角」存档。
   *
   * 用途：载体切换时把主相机交还编辑器场景 —— 必须用编辑器**自己的**视角，
   * 而不是把播放视角（或另一个载体的视角）复制过去。
   */
  getSavedCamera(): CameraState | null {
    return this.savedCamera
  }

  /**
   * 覆盖「进入播放前的编辑器视角」存档。
   *
   * 用途：小窗播放期间主视图显示的是编辑器场景，用户在这期间的视角调整属于
   * **编辑器视角**的变化；需要在退出播放时保留这次调整，
   * 而不是回退到「进入播放前」的旧视角。
   */
  overrideSavedCamera(state: CameraState | null): void {
    this.savedCamera = state
  }

  // ─────────────── 相机（供播放器做聚焦插值） ───────────────

  /**
   * 读取播放中的相机状态（浮窗模式下即浮窗相机）。
   * 仅在接管中返回；未接管返回 null，避免播放器误改主视图相机。
   */
  getCameraState(): CameraState | null {
    if (!this.shadow) return null
    return this.liveCamera.getState()
  }

  /** 写入播放中的相机状态（仅在接管中生效） */
  setCameraState(state: CameraState): void {
    if (!this.shadow) return
    this.liveCamera.setState(state)
  }

  /**
   * 用户是否正在手动操作相机。
   * 播放期间的相机插值据此避让，避免与用户拖拽互相覆盖。
   */
  isUserInteracting(): boolean {
    if (!this.shadow) return false
    return this.liveCamera.isUserInteracting?.() ?? false
  }
}
