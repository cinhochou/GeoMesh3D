// src/core/animation/AnimationPlayer.ts
// 播放引擎：在影子场景上执行跳转/回放。
//
// 能力：
//  - 硬切跳转（无过渡）
//  - 步间过渡：几何位置插值（视觉近似）+ 精确落点
//  - 相机聚焦：保持视线方向，推近/拉远使目标处于视野中心
//  - 自动播放：按节奏推进，支持循环与双向
//
// 关键约束：全程只操作影子场景与相机控制器，绝不触碰编辑器主场景。

import { restoreFromSnapshot } from '../editor/commands/SnapshotCommand'
import { applyDelta } from './SnapshotDelta'
import { buildMergeSnapshotCache } from './SnapshotScopeOps'
import { ShadowScene, type CameraState } from './ShadowScene'
import { ease } from './EasingLibrary'
import { applySelectionIds } from './stepSelection'
import { Vec3 } from '../geometry/Vec3'
import {
  clampFocusZoom,
  RHYTHM_MIN_MS,
  RHYTHM_MAX_MS,
  type AnimationDocument,
  type AnimationStep,
  type RecordingSession,
  type SceneSnapshot,
  type PlaybackState,
  type FocusTarget,
} from './types'

interface PlayerCallbacks {
  /** 状态变化（供 UI 刷新） */
  onChange?: () => void
  /** 期望重绘一帧 */
  requestRender?: () => void
  /**
   * 当前环境是否允许移动相机（缺省视为允许）。
   * AR 模式下相机即设备摄像头，移动虚拟相机没有意义，返回 false 即可关闭聚焦。
   */
  canMoveCamera?: () => boolean
}

/** 三元组位置（紧凑表示，避免每帧构造对象） */
type Xyz = [number, number, number]

/** 过渡状态（含预计算，保证每帧 O(移动点数) 且无额外分配） */
interface TransitionState {
  from: SceneSnapshot
  to: SceneSnapshot
  /** 在 from / to 中都存在且位置不同的点 id */
  movingIds: string[]
  fromPositions: Map<string, Xyz>
  toPositions: Map<string, Xyz>
  /** 相机插值（两者都为 null 表示本步不移动相机） */
  cameraFrom: CameraState | null
  cameraTo: CameraState | null
  /** 本次过渡是否实际接管过相机（用户全程手动操作时为 false） */
  cameraApplied: boolean
  startTime: number
  durationMs: number
}

/** 相机距离下限/上限（世界单位），防止过度贴近或拉飞 */
const CAMERA_MIN_DIST = 0.6
const CAMERA_MAX_DIST = 5000

export class AnimationPlayer {
  /** 当前会话的「快照流水线」：base + 每步累加结果缓存，避免重复重放 */
  private snapshotCache: SceneSnapshot[] = []

  /**
   * 当前已落地到影子场景的快照。
   * 过渡的起点必须是它（而不是由 cursor 推导），否则连续快速跳转会错位。
   */
  private appliedSnapshot: SceneSnapshot | null = null

  /** 过渡状态（null = 无过渡进行中） */
  private transition: TransitionState | null = null

  /**
   * 临时会话（不进本地文档、不参与持久化）。
   * 用于协作广播：成员播放的是房主广播过来的录制段，
   * 若写进本地文档就会随自动保存污染房间项目。
   */
  private transientSessions = new Map<string, RecordingSession>()

  private lastAdvanceTime = 0

  /**
   * 「起点视角」= 进入播放那一刻的相机状态。
   *
   * 起点（cursor = -1）没有本步主体，也就没有聚焦目标；若不记录它，
   * 回到起点时相机不会移动 —— 表现为「倒序播放结束后仍停在最后一步的主体特写上」。
   */
  private initialCamera: CameraState | null = null

  constructor(
    private readonly shadow: ShadowScene,
    private readonly state: PlaybackState,
    private readonly document: AnimationDocument,
    private readonly callbacks: PlayerCallbacks = {},
  ) {}

  // ─────────────── 生命周期 ───────────────

  /** 进入播放视图（可指定会话；缺省用文档的 activeSessionId） */
  enter(sessionId?: string | null): boolean {
    const session = this.resolveSession(sessionId ?? this.document.activeSessionId)
    if (!session) return false

    this.shadow.enter()
    // 记录起点视角（此刻尚未应用任何聚焦，正是「原点」）
    this.initialCamera = this.shadow.getCameraState()
    this.buildSnapshotCache(session)

    this.transition = null
    this.state.transitioning = false
    this.state.active = true
    this.state.sessionId = session.id
    this.state.playing = false
    this.state.direction = this.document.settings.defaultDirection
    this.state.autoAdvanceMs = this.document.settings.autoAdvanceMs
    this.state.loop = this.document.settings.loopByDefault

    // 落地起点状态（起点无聚焦目标，保持当前视角）
    this.applySnapshot(this.snapshotCache[0]!, -1)
    this.callbacks.onChange?.()
    this.callbacks.requestRender?.()
    return true
  }

  /** 退出播放视图 */
  exit(): void {
    this.transition = null
    this.state.active = false
    this.state.playing = false
    this.state.transitioning = false
    this.state.cursor = -1
    // 必须复位播放段 id：否则退出后它仍指向旧段，
    // store 的 currentSession（步带内容/步数/当前步标签）会一直解析到旧段，
    // 用户在下拉框切换选中的录制段时步带不会跟随。
    this.state.sessionId = null
    this.snapshotCache = []
    this.appliedSnapshot = null
    this.initialCamera = null
    this.shadow.exit()
    this.callbacks.onChange?.()
    this.callbacks.requestRender?.()
  }

  // ─────────────── 跳转 ───────────────

  /**
   * 跳转到第 stepIndex 步（-1 = 起点）。
   * @param animate 是否走步间过渡；缺省按设置（transitionMs > 0 即过渡）
   */
  goto(stepIndex: number, animate = true): void {
    const session = this.currentSession
    if (!session) return

    const clamped = Math.max(-1, Math.min(stepIndex, session.steps.length - 1))

    // 任何跳转前先让未结束的过渡立即落点，保证 from 状态精确
    this.finishTransition()

    if (clamped === this.state.cursor && this.appliedSnapshot) {
      // 重复点击当前步：不改变几何，但重新聚焦一次（便于手动回正视角）
      this.applyFocusImmediately(clamped)
      this.callbacks.onChange?.()
      this.callbacks.requestRender?.()
      return
    }

    const targetSnapshot = this.snapshotOf(clamped + 1)
    const durationMs = this.document.settings.transitionMs
    const canAnimate =
      animate && durationMs > 0 && this.state.active && this.appliedSnapshot !== null

    if (!canAnimate) {
      // 硬切：几何直接落点，相机也直接聚焦（保持视线方向）
      this.applySnapshot(targetSnapshot, clamped)
      this.applyStepSelection(clamped)
      this.applyFocusImmediately(clamped)
      this.callbacks.onChange?.()
      this.callbacks.requestRender?.()
      return
    }

    this.startTransition(clamped, targetSnapshot, durationMs)
  }

  /** 上一步 */
  /**
   * 上一步。
   * 循环开启时从起点/首步环回到末尾，保持与自动播放倒序一致的连续性。
   */
  prev(): void {
    const session = this.currentSession
    const last = session ? session.steps.length - 1 : -1
    if (this.state.loop && last >= 0 && this.state.cursor <= -1) {
      this.goto(last)
      return
    }
    this.goto(this.state.cursor - 1)
  }

  /** 下一步 */
  /**
   * 下一步。
   * 循环开启时在末尾环回起点（与自动播放 advanceAuto 的语义一致），
   * 否则单步到末尾就停住。
   */
  next(): void {
    const session = this.currentSession
    const last = session ? session.steps.length - 1 : -1
    if (this.state.loop && last >= 0 && this.state.cursor >= last) {
      this.goto(-1)
      return
    }
    this.goto(this.state.cursor + 1)
  }

  /** 回到起点 */
  toStart(): void {
    this.goto(-1)
  }

  /** 跳到末尾 */
  toEnd(): void {
    const session = this.currentSession
    if (!session) return
    this.goto(session.steps.length - 1)
  }

  // ─────────────── 播放控制 ───────────────

  play(): void {
    if (!this.state.active) {
      if (!this.enter()) return
    }
    const session = this.currentSession
    if (!session || session.steps.length === 0) return

    // 已停在本次播放方向的终点（单次播放结束）→ 从头开始。
    // 否则只是把 playing 置回 true，自动推进会在下一帧立刻再次停住，
    // 用户看到的是「点了播放却没反应」。
    const last = session.steps.length - 1
    if (this.state.direction === 1 && this.state.cursor >= last) {
      this.goto(-1)
    } else if (this.state.direction === -1 && this.state.cursor <= -1) {
      this.goto(last)
    }

    this.state.playing = true
    this.lastAdvanceTime = performance.now()
    this.callbacks.onChange?.()
  }

  pause(): void {
    this.state.playing = false
    this.callbacks.onChange?.()
  }

  togglePlay(): void {
    if (this.state.playing) this.pause()
    else this.play()
  }

  /** 切换播放方向 */
  toggleDirection(): void {
    this.setDirection(this.state.direction === 1 ? -1 : 1)
  }

  /** 指定播放方向（1 正序 / -1 倒序） */
  setDirection(direction: 1 | -1): void {
    if (this.state.direction === direction) return
    this.state.direction = direction
    this.document.settings.defaultDirection = direction
    // 方向切换后重置节流起点，避免沿用旧方向的计时造成立刻跳步
    this.lastAdvanceTime = performance.now()
    this.callbacks.onChange?.()
  }

  /** 设置自动播放每步总时长（停留 + 过渡） */
  setAutoAdvance(ms: number): void {
    const clamped = Math.max(RHYTHM_MIN_MS, Math.min(RHYTHM_MAX_MS, Math.round(ms)))
    this.state.autoAdvanceMs = clamped
    this.document.settings.autoAdvanceMs = clamped
    // 重置节流起点，让新节奏立即生效
    this.lastAdvanceTime = performance.now()
    this.callbacks.onChange?.()
  }

  /** 设置循环 */
  setLoop(loop: boolean): void {
    this.state.loop = loop
    this.document.settings.loopByDefault = loop
    this.callbacks.onChange?.()
  }

  /** 设置步间过渡时长（0 = 硬切） */
  setTransitionMs(ms: number): void {
    const clamped = Math.max(0, Math.min(3000, Math.round(ms)))
    this.document.settings.transitionMs = clamped
    this.callbacks.onChange?.()
  }

  /** 设置是否启用相机聚焦 */
  setFocusEnabled(enabled: boolean): void {
    this.document.settings.focusEnabled = enabled
    // 关闭聚焦时不做相机补偿；开启后下一次跳转生效
    this.callbacks.onChange?.()
  }

  /** 设置聚焦推近系数 */
  setFocusZoom(factor: number): void {
    this.document.settings.focusZoomFactor = clampFocusZoom(factor)
    this.callbacks.onChange?.()
  }

  /**
   * 播放至末尾/开头后是否已「到尽头」（用于 UI 显示自动停止提示）。
   * 与 loop 互斥：loop=true 时永远为 false。
   */
  get isAtEnd(): boolean {
    const session = this.currentSession
    if (!session) return false
    if (this.state.loop) return false
    const last = session.steps.length - 1
    return this.state.direction === 1 ? this.state.cursor >= last : this.state.cursor <= -1
  }

  // ─────────────── 每帧驱动 ───────────────

  /**
   * 每帧调用（由 EditorView.loop 驱动）。
   * 过渡期间只推进过渡；过渡结束后才恢复自动播放计时。
   */
  tick(now: number): void {
    if (!this.state.active) return

    if (this.transition) {
      this.stepTransition(now)
      return
    }

    if (!this.state.playing) return

    if (now - this.lastAdvanceTime < this.dwellMs) return
    this.lastAdvanceTime = now
    this.advanceAuto()
  }

  /**
   * 静止停留时长 = 节奏总时长 − 过渡时长（下限 0）。
   *
   * 语义：节奏选择器控制的是「每一步的总时长（停留 + 过渡）」，
   * 因此过渡越长、停留越短；过渡时长 ≥ 节奏时长时连续过渡（不停留）。
   * 这样用户改过渡时长不会意外改变整体播放快慢。
   */
  private get dwellMs(): number {
    const total = this.state.autoAdvanceMs
    const transition = this.document.settings.transitionMs
    return Math.max(0, total - transition)
  }

  private advanceAuto(): void {
    const session = this.currentSession
    if (!session) return
    const last = session.steps.length - 1

    if (this.state.direction === 1) {
      if (this.state.cursor >= last) {
        if (this.state.loop) this.goto(-1)
        else {
          this.state.playing = false
          this.callbacks.onChange?.()
        }
        return
      }
      this.goto(this.state.cursor + 1)
    } else {
      if (this.state.cursor <= -1) {
        if (this.state.loop) this.goto(last)
        else {
          this.state.playing = false
          this.callbacks.onChange?.()
        }
        return
      }
      this.goto(this.state.cursor - 1)
    }
  }

  // ─────────────── 过渡 ───────────────

  /**
   * 开始过渡。
   * 过渡期间：场景结构保持为 from（新对象延后出现、被删对象延后消失），
   * 两端都存在的点做位置插值；结束时一次性落地 to（精确落点）。
   */
  private startTransition(toIndex: number, to: SceneSnapshot, durationMs: number): void {
    const from = this.appliedSnapshot ?? this.snapshotOf(this.state.cursor + 1)
    const { movingIds, fromPositions, toPositions } = diffPositions(from, to)

    const cameraFrom = this.shadow.getCameraState()
    const cameraTo = this.computeFocusForStep(toIndex, cameraFrom)

    this.transition = {
      from,
      to,
      movingIds,
      fromPositions,
      toPositions,
      cameraFrom: cameraTo ? cameraFrom : null,
      cameraTo,
      cameraApplied: false,
      startTime: performance.now(),
      durationMs,
    }

    this.state.transitioning = true
    this.state.cursor = toIndex
    // 选中态属于「本步状态」：进入过渡即刻按目标步落位 ——
    // 「选中圆锥顶点」这类步的高亮在过渡开始就出现；
    // 创建/删除步则同步清掉上一处高亮，避免残留。
    this.applyStepSelection(toIndex)
    this.callbacks.onChange?.()
    this.callbacks.requestRender?.()
  }

  /**
   * 读取「进入播放前的编辑器视角」（载体切换时用它把主视图交还编辑器场景）。
   */
  getEditorCameraBaseline(): CameraState | null {
    return this.shadow.getSavedCamera()
  }

  /**
   * 覆盖编辑器视角基线。
   * 小窗播放期间用户调整了编辑器视角时调用，避免退出播放时把该调整覆盖掉。
   */
  overrideEditorCameraBaseline(state: CameraState | null): void {
    this.shadow.overrideSavedCamera(state)
  }

  /**
   * 重新应用「当前步」的相机聚焦（几何不变，只动相机）。
   *
   * 用途：推近程度等聚焦参数变更后**立即**看到效果，
   * 否则要等到下一步才生效，用户会以为设置没起作用。
   *
   * 实现：复用过渡机制，但 from/to 取同一份快照（几何不插值），
   * 仅让相机从当前机位平滑移到新档位算出的机位。
   */
  refocusCurrentStep(animate = true): void {
    if (!this.state.active) return
    // 先把未结束的过渡落点，避免与新过渡叠加
    this.finishTransition()
    if (!this.appliedSnapshot) return

    const cameraFrom = this.shadow.getCameraState()
    const cameraTo = this.computeFocusForStep(this.state.cursor, cameraFrom)
    if (!cameraTo) {
      // 未开启聚焦 / 本步无聚焦目标 / 环境不允许移动相机：无需动作
      this.callbacks.onChange?.()
      return
    }

    const durationMs = this.document.settings.transitionMs
    if (animate && durationMs > 0) {
      const snapshot = this.appliedSnapshot
      this.transition = {
        from: snapshot,
        to: snapshot,
        movingIds: [],
        fromPositions: new Map(),
        toPositions: new Map(),
        cameraFrom,
        cameraTo,
        cameraApplied: false,
        startTime: performance.now(),
        durationMs,
      }
      this.state.transitioning = true
      this.callbacks.onChange?.()
      this.callbacks.requestRender?.()
      return
    }

    this.shadow.setCameraState(cameraTo)
    this.callbacks.onChange?.()
    this.callbacks.requestRender?.()
  }

  /** 过渡推进一帧 */
  private stepTransition(now: number): void {
    const tr = this.transition
    if (!tr) return

    const raw = tr.durationMs <= 0 ? 1 : (now - tr.startTime) / tr.durationMs
    const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw
    const k = ease(this.document.settings.transitionEasing, t)

    // 几何插值始终执行（与相机无关）
    this.applyInterpolatedPositions(tr, k)

    // 相机插值避让：用户正在手动转动视角时让位，不去抢镜头。
    // （视线方向本就保持，用户转完后后续步骤的聚焦会以新方向为准）
    if (tr.cameraFrom && tr.cameraTo && !this.shadow.isUserInteracting()) {
      this.shadow.setCameraState(interpolateCamera(tr.cameraFrom, tr.cameraTo, k))
      tr.cameraApplied = true
    }

    this.callbacks.requestRender?.()

    if (t >= 1) {
      this.finishTransition()
    }
  }

  /** 收尾：精确落点 + 相机归位 + 重置自动播放计时 */
  private finishTransition(): void {
    const tr = this.transition
    if (!tr) return

    this.transition = null
    this.state.transitioning = false

    this.applySnapshot(tr.to, this.state.cursor)
    // 快照落地会清空选中态（restoreFromSnapshot 的既有行为），此处按本步重新落位
    this.applyStepSelection(this.state.cursor)
    // 相机：仅在本次过渡确实接管过相机、且用户未在操作时，才落到目标机位。
    // 若用户全程手动控制过视角，则尊重用户，不做最后的强制对齐。
    if (tr.cameraTo && tr.cameraApplied && !this.shadow.isUserInteracting()) {
      this.shadow.setCameraState(tr.cameraTo)
    }

    this.lastAdvanceTime = performance.now()
    this.callbacks.onChange?.()
  }

  /** 过渡期间逐点插值（只改位置，不动结构） */
  private applyInterpolatedPositions(tr: TransitionState, k: number): void {
    const scene = this.shadow.scene
    if (!scene) return
    for (const id of tr.movingIds) {
      const point = scene.points.get(id)
      if (!point) continue
      const a = tr.fromPositions.get(id)!
      const b = tr.toPositions.get(id)!
      // forceSetPosition：绕过 locked 守卫（插值只做视觉逼近），
      // 位置变化会触发 onPositionChanged → markPointDirty，渲染器自动刷新。
      point.forceSetPosition(
        new Vec3(
          a[0] + (b[0] - a[0]) * k,
          a[1] + (b[1] - a[1]) * k,
          a[2] + (b[2] - a[2]) * k,
        ),
      )
    }
  }

  // ─────────────── 相机聚焦 ───────────────

  /** 取该步的聚焦相机状态；未启用/无目标/无相机/环境禁止移动相机时返回 null */
  private computeFocusForStep(stepIndex: number, from: CameraState | null): CameraState | null {
    const settings = this.document.settings
    if (!settings.focusEnabled || !from) return null
    // AR 等环境不允许移动相机（视角由设备姿态决定）
    if (this.callbacks.canMoveCamera && !this.callbacks.canMoveCamera()) return null

    // 起点：没有本步主体 → 回到「进入播放时的视角」（原点）。
    // 倒序播放的终点就是这里，若不还原，相机会停在最后一步的主体特写上。
    if (stepIndex < 0) return this.initialCamera

    const session = this.currentSession
    const step = session && stepIndex >= 0 ? session.steps[stepIndex] : undefined
    const isLastStep = !!session && stepIndex === session.steps.length - 1
    const target = step?.focusTarget

    if (!target) {
      // 本步没有可聚焦的主体。
      // · **末步**：播放会停在这里，保持上一处机位可能落在空白处 → 回到起点视角。
      // · **中间步**：不动相机，避免相机在中途来回跳。
      return isLastStep ? this.initialCamera : null
    }

    // ⚠ 末步的「主体已不存在」必须单独判定。
    //
    // 录制时对「目标已消失」的步骤会用**操作前**快照兜底生成聚焦目标
    // （见 AnimationRecorder.onOperationPushed：删除类操作的目标已消失，
    //  回退到 before 里求位置，否则相机不会动到被删对象处）。
    // 于是末步若是删除类操作，focusTarget 依然存在，但指向的位置**已经空了** ——
    // 相机照常移过去，画面一片空白，用户会以为场景出错。
    // 因此这里回查「本步之后」的场景快照：主体确实不存在时回到起点视角。
    if (isLastStep && step && !this.subjectExistsAtStep(stepIndex, step)) {
      return this.initialCamera
    }

    return computeFocusCamera(from, target, settings.focusZoomFactor)
  }

  /**
   * 该步关联的主体，在「这一步之后」的场景快照里是否仍然存在。
   *
   * 用于识别「聚焦目标来自操作前快照、但对象已被删除」的步骤（删除类操作）。
   * 判定不了时（旧数据没有 focusElementIds、或快照缺失）一律返回 true，
   * 保持原有行为，不误改相机。
   */
  private subjectExistsAtStep(stepIndex: number, step: AnimationStep): boolean {
    const ids = step.focusElementIds ?? []
    if (ids.length === 0) return true
    const snapshot = this.snapshotCache[stepIndex + 1]
    if (!snapshot) return true
    return ids.some((id) => snapshotHasElementId(snapshot, id))
  }

  /** 硬切时立即聚焦（不插值；用户正在操作相机时让位） */
  private applyFocusImmediately(stepIndex: number): void {
    if (this.shadow.isUserInteracting()) return
    const from = this.shadow.getCameraState()
    const to = this.computeFocusForStep(stepIndex, from)
    if (to) this.shadow.setCameraState(to)
  }

  // ─────────────── 内部 ───────────────

  private get currentSession(): RecordingSession | null {
    return this.resolveSession(this.state.sessionId)
  }

  private resolveSession(sessionId: string | null | undefined): RecordingSession | null {
    if (!sessionId) return null
    // 临时会话优先：协作广播期间成员播放的是房主发来的版本
    const transient = this.transientSessions.get(sessionId)
    if (transient) return transient
    return this.document.sessions.find((s) => s.id === sessionId) ?? null
  }

  // ─────────────── 临时会话（协作广播） ───────────────

  /**
   * 注册/替换一个临时会话。
   * 若正在播放同一 id 的会话，会重建快照流水线以使用新内容。
   */
  setTransientSession(session: RecordingSession): void {
    this.transientSessions.set(session.id, session)
    if (this.state.sessionId === session.id && this.state.active) {
      this.buildSnapshotCache(session)
    }
  }

  /** 移除临时会话；若正在播放它，先退出播放 */
  removeTransientSession(sessionId: string): void {
    if (!this.transientSessions.delete(sessionId)) return
    if (this.state.sessionId === sessionId && this.state.active) {
      this.exit()
    }
  }

  /** 读取已注册的临时会话（供广播同步判断是否已装载，避免重复解析） */
  getTransientSession(sessionId: string): RecordingSession | null {
    return this.transientSessions.get(sessionId) ?? null
  }

  /** 清空全部临时会话（离开房间时调用） */
  clearTransientSessions(): void {
    const playingTransient =
      !!this.state.sessionId && this.transientSessions.has(this.state.sessionId)
    this.transientSessions.clear()
    if (playingTransient && this.state.active) this.exit()
  }

  /**
   * 构建快照流水线：cache[0] = 起点，cache[i+1] = 第 i 步之后的状态。
   *
   *  - native（缺省）：起点 = 段.baseSnapshot，优先从锚点起步重放（现有行为，零改动）。
   *  - merge（跨场景段：动画库导入 / 导入后固化）：
   *      起点 = 目标场景快照 ∪ 裁剪后的段快照（段优先），全程 delta 递推。
   *      **忽略锚点**：anchorSnapshot 是录制方全场景快照，直接替换会把
   *      目标场景几何整体抹掉（典型症状：播放进行到第 50 步场景突然变空）。
   */
  private buildSnapshotCache(session: RecordingSession): void {
    if (session.playbackMode === 'merge') {
      this.snapshotCache = buildMergeSnapshotCache(session, this.shadow.takeMainSceneSnapshot())
      return
    }
    const cache: SceneSnapshot[] = [session.baseSnapshot]
    let current = session.baseSnapshot
    for (const step of session.steps) {
      if (step.isAnchor && step.anchorSnapshot) {
        current = step.anchorSnapshot
      } else {
        current = applyDelta(current, step.delta)
      }
      cache.push(current)
    }
    this.snapshotCache = cache
  }

  /** 取「第 n 个状态」的快照（n=0 起点，n=i+1 表示第 i 步之后） */
  private snapshotOf(n: number): SceneSnapshot {
    const idx = Math.max(0, Math.min(n, this.snapshotCache.length - 1))
    return this.snapshotCache[idx] ?? this.snapshotCache[0]!
  }

  /**
   * 把快照落地到影子场景（深拷贝传入，避免 restoreFromSnapshot 改动缓存对象）。
   * @param cursor 同时更新游标（省略则保持不变）
   */
  private applySnapshot(snapshot: SceneSnapshot, cursor?: number): void {
    const scene = this.shadow.scene
    if (!scene) return
    restoreFromSnapshot(scene, JSON.parse(JSON.stringify(snapshot)))
    scene.solveDirtyConstraints()
    this.appliedSnapshot = snapshot
    if (cursor !== undefined) this.state.cursor = cursor
  }

  /**
   * 把「该步的选中态」落到影子场景（录制时已把 id 算好，回放零成本）。
   *
   * 语义为**步内状态**：每步先清空再按本步 selectionIds 落位 ——
   * 「选中点A → 选中点B → 创建圆锥」依次呈现 A 高亮、A+B 高亮、高亮清空+圆锥出现；
   * 删除类前情「选中X → 删除X」则先高亮 X、随后 X 消失。
   * 起点（-1）与无 selectionIds 的旧数据都落到「无高亮」，与改动前观感一致。
   */
  private applyStepSelection(stepIndex: number): void {
    const scene = this.shadow.scene
    if (!scene) return
    const session = this.currentSession
    const step = session && stepIndex >= 0 ? session.steps[stepIndex] : undefined
    applySelectionIds(scene, step?.selectionIds ?? [])
  }

  /** 供扩展使用：过渡进度（缓动后的系数） */
  protected easeProgress(t: number): number {
    return ease(this.document.settings.transitionEasing, t)
  }
}

// ─────────────────────────────────────────────
// 纯函数工具
// ─────────────────────────────────────────────

/**
 * 求两次快照之间「位置发生变化」的点集合（仅两端都存在的点）。
 * 只关心位置差异，不做结构比对。
 */
function diffPositions(
  from: SceneSnapshot,
  to: SceneSnapshot,
): { movingIds: string[]; fromPositions: Map<string, Xyz>; toPositions: Map<string, Xyz> } {
  const fromPositions = new Map<string, Xyz>()
  const toPositions = new Map<string, Xyz>()
  const movingIds: string[] = []

  const fromMap = new Map<string, { x: number; y: number; z: number }>()
  for (const p of from.points) fromMap.set(p.id, p.position)

  for (const p of to.points) {
    const a = fromMap.get(p.id)
    if (!a) continue
    const b = p.position
    if (a.x === b.x && a.y === b.y && a.z === b.z) continue
    movingIds.push(p.id)
    fromPositions.set(p.id, [a.x, a.y, a.z])
    toPositions.set(p.id, [b.x, b.y, b.z])
  }

  return { movingIds, fromPositions, toPositions }
}

/**
 * 由「当前相机 + 聚焦目标」求目标相机状态：
 * 保持原有视线方向，把视线中心平移到目标中心，距离设为「包围球半径 × 系数」。
 */
/**
 * 快照里是否存在该 id 对应的元素。
 *
 * 覆盖全部实体集合（按 id 匹配）与各归属字段（cubeId / prismId / pyramidId /
 * constraintId / sphereId / coneId / circleId … —— 实体是**以自身 id** 挂到这些字段上的），
 * 以及 constraints 列表。判定宽松一点是安全的：误判为「存在」只是保持原相机行为。
 */
function snapshotHasElementId(snapshot: SceneSnapshot, id: string): boolean {
  const record = snapshot as unknown as Record<string, unknown>
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== 'object') continue
        if (Object.values(item as Record<string, unknown>).includes(id)) return true
      }
    } else if (value && typeof value === 'object') {
      if (Object.values(value as Record<string, unknown>).includes(id)) return true
    }
  }
  return false
}

function computeFocusCamera(from: CameraState, target: FocusTarget, zoomFactor: number): CameraState {
  const dx = from.position.x - from.target.x
  const dy = from.position.y - from.target.y
  const dz = from.position.z - from.target.z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
  const ux = dx / len
  const uy = dy / len
  const uz = dz / len

  const factor = clampFocusZoom(zoomFactor)
  const dist = Math.max(CAMERA_MIN_DIST, Math.min(CAMERA_MAX_DIST, target.radius * factor))

  const [tx, ty, tz] = target.position
  return {
    position: { x: tx + ux * dist, y: ty + uy * dist, z: tz + uz * dist },
    target: { x: tx, y: ty, z: tz },
    zoom: from.zoom,
    controlsEnabled: from.controlsEnabled,
  }
}

/** 相机状态线性插值 */
function interpolateCamera(a: CameraState, b: CameraState, k: number): CameraState {
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * k,
      y: a.position.y + (b.position.y - a.position.y) * k,
      z: a.position.z + (b.position.z - a.position.z) * k,
    },
    target: {
      x: a.target.x + (b.target.x - a.target.x) * k,
      y: a.target.y + (b.target.y - a.target.y) * k,
      z: a.target.z + (b.target.z - a.target.z) * k,
    },
    zoom: a.zoom + (b.zoom - a.zoom) * k,
    controlsEnabled: k < 1 ? a.controlsEnabled : b.controlsEnabled,
  }
}
