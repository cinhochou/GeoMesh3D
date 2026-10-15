// src/store/animationStore.ts
// 动画系统的 UI 状态。
//
// 设计：以「共享可变状态对象」为单一数据源 ——
//  store 创建 playback / recording 两个响应式对象，并把同一引用交给引擎（player/recorder），
//  引擎原地修改它们，Vue 响应式自动感知，无需手动同步。
//
//  文档（AnimationDocument）用 shallowRef + revision 计数管理（结构大，避免深度响应式开销）。

import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  DEFAULT_ANIMATION_SETTINGS,
  createEmptyAnimationDocument,
  createDefaultCapabilities,
  createInitialPlaybackState,
  createInitialRecordingState,
  createInitialBroadcastView,
  matchRhythmPreset,
  clampRhythmMs,
  clampTransitionMs,
  clampFocusZoom,
  type AnimationBroadcastView,
  type AnimationCapabilities,
  type AnimationDocument,
  type AnimationSettings,
  type PlaybackState,
  type RecordingState,
  type RecordingSession,
  type PlaybackMode,
  type RhythmPreset,
  type EasingType,
  type FloatSizePreset,
} from '@/core/animation/types'
import {
  loadLocalAnimationSettings,
  saveLocalAnimationSettings,
} from '@/core/animation/AnimationSettingsStorage'
import type { AnimationBroadcastChannel, BroadcastHostSource } from '@/core/collab/AnimationBroadcast'
import type { AnimationPlayer } from '@/core/animation/AnimationPlayer'
import type { AnimationRecorder } from '@/core/animation/AnimationRecorder'

/**
 * 「播放期间操作被拦截」提示的持续时长（毫秒）。
 * 用户每次尝试拖拽几何对象时重新计时。
 */
const INTERACTION_BLOCKED_HINT_MS = 1500

export const useAnimationStore = defineStore('animation', () => {
  // ───────── 文档（录制段数据） ─────────
  /**
   * 动画文档。
   *
   * ⚠ **不变量：该对象的引用终身恒定，任何「替换文档」都必须就地改写字段。**
   *
   * 原因：AnimationRecorder / AnimationPlayer / 广播数据源都在构造时注入了这个对象，
   * 且 UI 依赖 `documentRevision`（而非深响应）感知变化。若替换 `document.value` 为新对象，
   * 引擎会继续读写旧对象，表现为——
   *   - 打开带录制数据的项目后点「播放」无反应（player 在旧文档里找不到该段）；
   *   - 退出项目/离开房间后录制静默丢失（步写进旧文档，UI 不显示、保存也取不到）；
   *   - 改设置看似不生效（引擎写旧文档、UI 读新文档）；
   *   - 广播失败（数据源在旧文档里找不到刚加载的段）。
   */
  const document = shallowRef<AnimationDocument>(createEmptyDocumentWithPreference())
  /** 文档版本号：任何改动 +1，用于触发依赖它的 computed 重算 */
  const documentRevision = ref(0)
  /**
   * 广播临时会话版本号：`applyRemoteBroadcast` 换入新会话对象时 +1。
   *
   * 临时会话存在引擎里（普通 Map，非响应式），必须靠它驱动
   * `currentSession` 等派生值重算 —— 否则成员跟随广播时步带不会刷新。
   */
  const broadcastSessionRevision = ref(0)

  /**
   * 把本地设置偏好填补进目标文档。
   *
   * 规则：**只填补文档里仍是默认值的项**。
   *  - 文档里明确调过的非默认值优先（不静默覆盖项目里刻意设定的参数）
   *  - 其余项用本地偏好（解决「一刷新设置就回默认」）
   *
   * 不整体覆盖的原因：设置既是用户偏好，也可能被项目刻意设定
   * （例如某教学项目固定用较慢的过渡），两者需要共存。
   */
  function applyLocalSettingsPreference(target: AnimationDocument): void {
    const local = loadLocalAnimationSettings()
    if (!local) return
    const keys = Object.keys(DEFAULT_ANIMATION_SETTINGS) as Array<keyof AnimationSettings>
    for (const key of keys) {
      if (target.settings[key] !== DEFAULT_ANIMATION_SETTINGS[key]) continue
      ;(target.settings[key] as AnimationSettings[typeof key]) = local[key]
    }
  }

  /** 新文档：直接带上本地偏好（新建 / 重置 / 首次进入都适用） */
  function createEmptyDocumentWithPreference(): AnimationDocument {
    const doc = createEmptyAnimationDocument()
    applyLocalSettingsPreference(doc)
    return doc
  }

  /** 就地覆盖文档字段（不替换引用），见 document 的不变量说明 */
  function overwriteDocument(source: AnimationDocument): void {
    const target = document.value
    target.version = source.version
    target.meta = source.meta
    target.sessions = source.sessions
    target.activeSessionId = source.activeSessionId
    target.settings = source.settings
  }

  // ───────── 共享可变状态（引擎原地修改，Vue 自动感知） ─────────
  const playback = ref<PlaybackState>(createInitialPlaybackState())
  const recording = ref<RecordingState>(createInitialRecordingState())

  /**
   * 环境能力（由承载环境设置：进入 AR 时禁止录制/浮窗/移动相机）。
   * 与「用户设置」区分：这是环境限制，不是偏好。
   */
  const capabilities = ref<AnimationCapabilities>(createDefaultCapabilities())

  /**
   * 协作广播的本地视图（响应式）。
   * 共享表的读写由 AnimationBroadcastChannel 负责，这里只保存 UI 需要的最少信息。
   */
  const broadcast = ref<AnimationBroadcastView>(createInitialBroadcastView())

  // ───────── 引擎引用（非响应式） ─────────
  const playerRef = shallowRef<AnimationPlayer | null>(null)
  const recorderRef = shallowRef<AnimationRecorder | null>(null)
  const broadcastChannelRef = shallowRef<AnimationBroadcastChannel | null>(null)
  /** 房主侧数据来源（由 EditorView 注入：读取本地播放状态与录制段数据） */
  const broadcastHostSourceRef = shallowRef<BroadcastHostSource | null>(null)

  // ───────── 派生 ─────────
  const sessions = computed<RecordingSession[]>(() => {
    void documentRevision.value
    return document.value.sessions
  })

  const activeSession = computed<RecordingSession | null>(() => {
    void documentRevision.value
    return document.value.sessions.find((s) => s.id === document.value.activeSessionId) ?? null
  })

  /**
   * 当前「用户正在查看的」录制段。
   *
   * 播放中 → 正在播放的那一段；**未播放 → 下拉框选中的那一段**（activeSession）。
   *
   * ⚠ 这个回退是必需的：`playback.sessionId` 只在 `AnimationPlayer.enter()` 时才写入，
   * 而步带内容、步数、当前步标签都依赖本值。
   * 若没有回退，进入播放前 `stepCount` 恒为 0，而播放按钮的启用条件正是
   * `stepCount > 0` —— 按钮永远点不动，形成自锁（录制完也无法播放、步带空白）。
   */
  const currentSession = computed<RecordingSession | null>(() => {
    void documentRevision.value
    void broadcastSessionRevision.value
    const playbackId = playback.value.sessionId
    if (playbackId) {
      const playing = document.value.sessions.find((s) => s.id === playbackId)
      if (playing) return playing
      // 广播：成员播放的是引擎里的「临时会话」，不在本地文档中。
      // 必须一并解析，否则成员观看广播时步带为空、当前步标签显示「（无录制段）」。
      const transient = playerRef.value?.getTransientSession(playbackId) ?? null
      if (transient) return transient
    }
    return activeSession.value
  })

  const stepCount = computed(() => currentSession.value?.steps.length ?? 0)
  const isPlaying = computed(() => playback.value.playing)
  const isActive = computed(() => playback.value.active)
  const isRecording = computed(() => recording.value.active)
  const isRecordingPaused = computed(() => recording.value.active && recording.value.paused)
  const hasSessions = computed(() => sessions.value.length > 0)
  const activeSessionName = computed(() => activeSession.value?.name ?? '')
  /** 当前环境是否允许录制（AR 模式禁止） */
  const canRecord = computed(() => capabilities.value.canRecord)
  /** 当前环境是否允许浮窗播放（AR 模式禁止） */
  const canFloat = computed(() => capabilities.value.canFloat)
  /** 录制不可用的原因（供 UI 提示；由环境写入） */
  const recordBlockedReason = computed(() => capabilities.value.recordBlockedReason)
  const canRecordStart = computed(() => !recording.value.active && capabilities.value.canRecord)
  const canRecordPause = computed(() => recording.value.active && !recording.value.paused)
  const canRecordResume = computed(() => recording.value.active && recording.value.paused)
  const direction = computed(() => playback.value.direction)
  const mode = computed<PlaybackMode>(() => playback.value.mode)
  const cursor = computed(() => playback.value.cursor)

  // ───────── 载体与交互锁（派生，规则单一来源） ─────────
  /**
   * 是否应显示浮窗：播放中 + 浮窗模式 + 环境允许（AR 禁止浮窗）。
   * EditorView 据此挂载浮窗组件（含第二渲染栈）。
   */
  const shouldShowFloatWindow = computed(
    () => playback.value.active && playback.value.mode === 'float' && capabilities.value.canFloat,
  )

  /**
   * 主视图当前是否渲染「影子场景」。
   *
   * 原地播放时为 true（主视图显示动画），浮窗播放/未播放时为 false（主视图显示编辑器场景）。
   *
   * ⚠ 该值由 true 变 false 的瞬间，**必须强制重建主场景几何**（EditorView 已挂 watch）：
   * GeometrySyncer 是纯脏标记驱动且脏状态一次性消费，切回来时主场景往往已无脏标记，
   * 主视图会停留在上一次的几何状态（拾取/悬停随之基于陈旧网格）。
   */
  const mainViewRendersShadowScene = computed(
    () => playback.value.active && playback.value.mode !== 'float',
  )

  /**
   * 播放是否应当锁住主视图的编辑交互。
   *
   * 原地播放时主视图渲染的是影子场景，必须锁定（否则「看不到选中却改了主场景」）；
   * **浮窗播放时主视图渲染的是编辑器场景，必须保持可编辑**——这正是浮窗的意义。
   */
  const locksMainViewInteraction = computed(
    () => playback.value.active && playback.value.mode !== 'float',
  )

  // ───────── 播放期间的「操作被拦截」提示 ─────────
  /**
   * 原地播放期间用户尝试拖拽几何对象时置位，1.5s 后自动清除。
   * 由 Timeline 的「退出播放」按钮泛红光呈现（不使用文字提示）。
   */
  const interactionBlockedHint = ref(false)
  let interactionBlockedHintTimer: ReturnType<typeof setTimeout> | null = null

  /** 通知一次「操作被拦截」（重复触发会重新计时） */
  function notifyInteractionBlockedHint(): void {
    interactionBlockedHint.value = true
    if (interactionBlockedHintTimer !== null) clearTimeout(interactionBlockedHintTimer)
    interactionBlockedHintTimer = setTimeout(() => {
      interactionBlockedHint.value = false
      interactionBlockedHintTimer = null
    }, INTERACTION_BLOCKED_HINT_MS)
  }

  /** 立即清除提示（退出播放时调用，避免残留红光） */
  function clearInteractionBlockedHint(): void {
    if (interactionBlockedHintTimer !== null) {
      clearTimeout(interactionBlockedHintTimer)
      interactionBlockedHintTimer = null
    }
    interactionBlockedHint.value = false
  }

  // ───────── 协作广播（派生） ─────────
  /** 是否有生效中的广播 */
  const isBroadcastActive = computed(() => broadcast.value.active)
  /** 成员侧是否正被广播内容占据播放视图（本机发起的广播不算） */
  const isWatchingBroadcast = computed(
    () => broadcast.value.active && !broadcast.value.selfHosted && !broadcast.value.dismissed,
  )
  /** 成员是否可以收起广播视图（房间未要求强制观看时才可） */
  const canDismissBroadcast = computed(
    () => broadcast.value.active && !broadcast.value.selfHosted && !broadcast.value.forceWatch,
  )
  /** 成员是否被强制观看（无法收起） */
  const isBroadcastForced = computed(
    () => broadcast.value.active && !broadcast.value.selfHosted && broadcast.value.forceWatch,
  )
  /**
   * 房间里有可跟随的广播，但本机当前没有跟随（已收起 / 已退出播放）。
   *
   * 用途：给成员一个「重新跟随」入口 —— 否则非强制观看下收起之后就再也回不来了。
   */
  const hasUnfollowedBroadcast = computed(
    () =>
      broadcast.value.active &&
      !broadcast.value.selfHosted &&
      broadcast.value.ready &&
      !isWatchingBroadcast.value,
  )

  // 循环开启时两个方向都可环回，故始终可用；
  // 否则到了末尾「下一步」按钮会被禁用，用户根本点不动（只能在自动播放时才循环）。
  const canPrev = computed(() => {
    if (!playback.value.active) return false
    if (playback.value.loop && stepCount.value > 0) return true
    return playback.value.cursor > -1
  })
  const canNext = computed(() => {
    if (!playback.value.active) return false
    if (playback.value.loop && stepCount.value > 0) return true
    return playback.value.cursor < stepCount.value - 1
  })

  // ───────── 节奏 / 循环 / 方向 ─────────
  const autoAdvanceMs = computed(() => playback.value.autoAdvanceMs)
  const loop = computed(() => playback.value.loop)
  /** 当前节奏匹配到的档位（未匹配为 null，即自定义） */
  const rhythmPreset = computed<RhythmPreset | null>(() => matchRhythmPreset(playback.value.autoAdvanceMs))
  const isCustomRhythm = computed(() => rhythmPreset.value === null)
  const rhythmLabel = computed(() => rhythmPreset.value?.label ?? `${playback.value.autoAdvanceMs} ms`)
  const isReverse = computed(() => playback.value.direction === -1)

  function setRhythmMs(ms: number): void {
    setAutoAdvance(clampRhythmMs(ms))
  }

  // ───────── 过渡 / 聚焦 ─────────
  const transitionMs = computed(() => {
    void documentRevision.value
    return document.value.settings.transitionMs
  })
  const transitionEasing = computed<EasingType>(() => {
    void documentRevision.value
    return document.value.settings.transitionEasing
  })
  const focusEnabled = computed(() => {
    void documentRevision.value
    return document.value.settings.focusEnabled
  })
  const focusZoomFactor = computed(() => {
    void documentRevision.value
    return document.value.settings.focusZoomFactor
  })
  /** 是否有过渡（0 = 硬切） */
  const hasTransition = computed(() => transitionMs.value > 0)
  /** 是否正在执行步间过渡 */
  const isTransitioning = computed(() => playback.value.transitioning)

  /** 当前步的展示文字 */
  const currentStepLabel = computed<string>(() => {
    const s = currentSession.value
    const c = playback.value.cursor
    if (!s) return ''
    if (c < 0) return '起点'
    const step = s.steps[c]
    if (!step) return ''
    return `第 ${c + 1} 步：${step.label}`
  })

  // ───────── 引擎绑定 ─────────
  /**
   * 绑定引擎。引擎使用 store 提供的同一 playback / recording 对象引用，
   * 因此引擎的状态修改会自动反映到 UI。
   */
  function bindEngines(player: AnimationPlayer, recorder: AnimationRecorder): void {
    playerRef.value = player
    recorderRef.value = recorder
    notifyDocumentChanged()
  }

  function unbindEngines(): void {
    playerRef.value = null
    recorderRef.value = null
  }

  /** 文档结构发生变更（录制新增步、增删会话、改设置）后调用 */
  function notifyDocumentChanged(): void {
    documentRevision.value++
  }

  /**
   * 「立即保存」信号：段集合的**管理动作**（删除 / 重命名 / 复制 / 清空 / 固化 / 录制封存）
   * 完成后自增，承载环境（EditorView）据此跳过去抖立刻落盘。
   *
   * 为什么需要它：常规变更走 3s 去抖自动保存；但删除类操作若只靠去抖，
   * 用户"删除后马上刷新会在去抖窗口内丢失删除"（实测踩坑：删了又回来）。
   * 注意**不**覆盖加载 / 重置文档（setDocument / reset）——那是文档替换而非管理动作。
   */
  const urgentSaveRevision = ref(0)
  function requestUrgentSave(): void {
    urgentSaveRevision.value++
  }

  // 设置变更即写本地偏好。挂在 documentRevision 上而非 deep watch：
  // document 是 shallowRef，内部字段不可被深度侦听；而所有设置写入路径
  // 都会调用 notifyDocumentChanged()（见各 setXxx），因此这里是可靠的单一钩子。
  watch(documentRevision, () => {
    saveLocalAnimationSettings(document.value.settings)
  })

  // ───────── 文档操作 ─────────
  /**
   * 载入一份动画文档。
   * 注意是**就地改写**当前文档对象，而非替换引用（见 document 的不变量说明）。
   */
  function setDocument(doc: AnimationDocument): void {
    // 载入项目/草稿的文档：用本地偏好填补其中仍是默认值的设置项
    applyLocalSettingsPreference(doc)
    overwriteDocument(doc)
    notifyDocumentChanged()
  }

  /**
   * 合并录制段（按 id 去重，只追加，不覆盖已有段）。
   *
   * 用途：把「成员在协作房间内的本地录制」恢复进当前文档时，
   * 文档里通常已有房主的录制段，不能整体替换。
   *
   * @returns 实际新增的段数
   */
  function mergeSessions(sessions: RecordingSession[]): number {
    const doc = document.value
    const existing = new Set(doc.sessions.map((s) => s.id))
    const incoming = sessions.filter((s) => !existing.has(s.id))
    if (incoming.length === 0) return 0
    doc.sessions.push(...incoming)
    if (!doc.activeSessionId) doc.activeSessionId = incoming[0]!.id
    notifyDocumentChanged()
    // 段集合变化 = 管理动作（固化 / 房间本机段恢复）：立即保存
    requestUrgentSave()
    return incoming.length
  }

  function setActiveSession(sessionId: string | null): void {
    document.value.activeSessionId = sessionId
    notifyDocumentChanged()
  }

  // ───────── 环境能力 ─────────
  /**
   * 设置环境能力（由承载环境调用，如进入/退出 AR）。
   * 若录制被禁用时正有录制进行中，会安全封存该段（保留已录内容）。
   * @returns 是否因能力变化而中止了录制
   */
  function setCapabilities(patch: Partial<AnimationCapabilities>): boolean {
    const next = { ...capabilities.value, ...patch }
    const becameDisabled = capabilities.value.canRecord && !next.canRecord
    capabilities.value = next

    if (next.canFloat === false && playback.value.mode === 'float') {
      playback.value.mode = 'inline'
    }

    if (becameDisabled && recording.value.active) {
      stopRecording()
      return true
    }
    return false
  }

  // ───────── 播放操作（转调引擎） ─────────
  /**
   * 注册临时会话（动画库导入播放 / 协作广播共用）。
   * 临时会话只存在于引擎内、不写入本地文档 —— 避免随自动保存污染当前项目 / 房间；
   * 播放时 currentSession 会优先解析临时会话（步带、步数随之正确）。
   */
  function setTransientSession(session: RecordingSession): void {
    playerRef.value?.setTransientSession(session)
    notifyDocumentChanged()
  }

  function enterPlayback(sessionId?: string | null): boolean {
    const ok = playerRef.value?.enter(sessionId ?? null) ?? false
    notifyDocumentChanged()
    return ok
  }
  function exitPlayback(): void {
    // 房主退出「自己正在广播的那一段」= 不再演示 → 必须同步停止广播。
    // 否则协作面板仍显示「广播中」，而房主已经不在播放，两处状态冲突
    // （用户反馈：面板停不下来）。注意要在 player.exit() 之前取快照，
    // 因为 exit() 会把 playback.sessionId 清空。
    const exitingBroadcastSession =
      broadcast.value.selfHosted && broadcast.value.sessionId === playback.value.sessionId
    playerRef.value?.exit()
    if (exitingBroadcastSession) stopBroadcast()
    notifyDocumentChanged()
  }
  /**
   * 跳到指定步。
   * @param animate false 时硬切落点（无过渡插值）——载体切换后恢复位置用它，
   *   否则会先落回 base 再走一段大范围过渡，与「不被打回起点」的预期不符。
   */
  function goto(stepIndex: number, animate = true): void {
    playerRef.value?.goto(stepIndex, animate)
  }
  function prev(): void {
    playerRef.value?.prev()
  }
  function next(): void {
    playerRef.value?.next()
  }
  function toStart(): void {
    playerRef.value?.toStart()
  }
  function toEnd(): void {
    playerRef.value?.toEnd()
  }
  function togglePlay(): void {
    playerRef.value?.togglePlay()
  }
  /** 明确播放（供协作广播同步使用，避免 toggle 的语义歧义） */
  function play(): void {
    playerRef.value?.play()
  }
  /** 明确暂停 */
  function pause(): void {
    playerRef.value?.pause()
  }
  function toggleDirection(): void {
    playerRef.value?.toggleDirection()
    notifyDocumentChanged()
  }
  function setDirection(direction: 1 | -1): void {
    if (playerRef.value) playerRef.value.setDirection(direction)
    else {
      playback.value.direction = direction
      document.value.settings.defaultDirection = direction
    }
    notifyDocumentChanged()
  }
  function setAutoAdvance(ms: number): void {
    if (playerRef.value) playerRef.value.setAutoAdvance(ms)
    else {
      const clamped = clampRhythmMs(ms)
      playback.value.autoAdvanceMs = clamped
      document.value.settings.autoAdvanceMs = clamped
    }
    notifyDocumentChanged()
  }
  function setLoop(loop: boolean): void {
    if (playerRef.value) playerRef.value.setLoop(loop)
    else {
      playback.value.loop = loop
      document.value.settings.loopByDefault = loop
    }
    notifyDocumentChanged()
  }
  function toggleLoop(): void {
    setLoop(!playback.value.loop)
  }

  // ───────── 过渡 / 聚焦 操作 ─────────
  //
  // ⚠ 契约：每个 setXxx 都必须**保证文档被更新**（无引擎绑定时直接写文档）。
  // 原因：本地设置偏好持久化与自动保存都挂在「文档变更」上；
  // 若某个 setter 只经引擎写入，一旦引擎未就绪就会「UI 改了但不生效、也不落盘」。
  // 引擎路径通常还会同步播放态（如 state.autoAdvanceMs），因此保留引擎调用、只补兜底。
  /** 设置步间过渡时长（0 = 硬切） */
  function setTransitionMs(ms: number): void {
    const clamped = clampTransitionMs(ms)
    if (playerRef.value) playerRef.value.setTransitionMs(clamped)
    else document.value.settings.transitionMs = clamped
    notifyDocumentChanged()
  }
  /** 设置过渡缓动曲线 */
  function setTransitionEasing(easing: EasingType): void {
    document.value.settings.transitionEasing = easing
    notifyDocumentChanged()
  }
  /** 开关相机聚焦 */
  function setFocusEnabled(enabled: boolean): void {
    if (playerRef.value) playerRef.value.setFocusEnabled(enabled)
    else document.value.settings.focusEnabled = enabled
    // 播放中开启聚焦 → 立即把当前步的主体框进视野
    if (enabled) playerRef.value?.refocusCurrentStep()
    notifyDocumentChanged()
  }
  /** 设置聚焦推近系数 */
  function setFocusZoom(factor: number): void {
    const clamped = clampFocusZoom(factor)
    if (playerRef.value) {
      playerRef.value.setFocusZoom(clamped)
      // 立即对当前步重新聚焦：否则要等到下一步才生效，用户会以为各档没区别
      playerRef.value.refocusCurrentStep()
    }
    else document.value.settings.focusZoomFactor = clamped
    notifyDocumentChanged()
  }

  // ───────── 录制设置 ─────────
  /** 是否把撤销/重做也录进去（默认 false） */
  const recordUndoRedo = computed(() => {
    void documentRevision.value
    return document.value.settings.recordUndoRedo
  })
  /** 单段最大步数（防内存爆炸） */
  const maxStepsPerSession = computed(() => {
    void documentRevision.value
    return document.value.settings.maxStepsPerSession
  })

  function setRecordUndoRedo(value: boolean): void {
    document.value.settings.recordUndoRedo = value
    notifyDocumentChanged()
  }
  function setMaxStepsPerSession(value: number): void {
    const n = Number.isFinite(value) ? Math.round(value) : 1000
    document.value.settings.maxStepsPerSession = Math.max(10, Math.min(100000, n))
    notifyDocumentChanged()
  }
  /** 浮窗尺寸档位 */
  const floatSize = computed(() => playback.value.floatSize)
  function setFloatSize(preset: FloatSizePreset): void {
    playback.value.floatSize = preset
  }

  function setMode(mode: PlaybackMode): void {
    // AR 等环境禁止浮窗：静默回退到原地播放
    if (mode === 'float' && !capabilities.value.canFloat) {
      playback.value.mode = 'inline'
      return
    }
    playback.value.mode = mode
  }

  // ───────── 录制操作 ─────────
  function startRecording(name?: string): boolean {
    // 环境不允许（如 AR 模式）时拒绝开始
    if (!capabilities.value.canRecord) return false
    recorderRef.value?.start(name)
    recording.value.startedAt = Date.now()
    recording.value.paused = false
    notifyDocumentChanged()
    return true
  }
  function stopRecording(): void {
    const sealed = recorderRef.value?.stop() ?? null
    recording.value.paused = false
    // 刚刚录完的段应成为当前选中段：否则下拉框虽已列出新段，
    // 但步带/步数/当前步标签仍停留在上一段，用户会以为新录制没保存。
    // （空会话不会被封存，故排除）
    if (sealed && sealed.steps.length > 0) {
      document.value.activeSessionId = sealed.id
      // 封存即落盘：录制完成不等去抖，立即保存
      requestUrgentSave()
    }
    notifyDocumentChanged()
  }
  function discardRecording(): void {
    recorderRef.value?.discard()
    recording.value.paused = false
    notifyDocumentChanged()
  }
  /** 暂停录制（会话保留，不累积新步） */
  function pauseRecording(): void {
    recorderRef.value?.pause()
    notifyDocumentChanged()
  }
  /** 恢复录制 */
  function resumeRecording(): void {
    recorderRef.value?.resume()
    notifyDocumentChanged()
  }
  /** 录制中/暂停中 一键切换 */
  function toggleRecordingPause(): void {
    if (recording.value.paused) resumeRecording()
    else pauseRecording()
  }

  // ───────── 多段会话管理 ─────────
  /** 删除指定录制段；若正在播放/录制该段，先安全退出 */
  function removeSession(sessionId: string): void {
    const doc = document.value
    const idx = doc.sessions.findIndex((s) => s.id === sessionId)
    if (idx < 0) return

    // 删除的正是本机正在广播的段 → 先停止广播
    if (broadcast.value.selfHosted && broadcast.value.sessionId === sessionId) stopBroadcast()

    if (playback.value.active && playback.value.sessionId === sessionId) {
      playerRef.value?.exit()
    }
    if (recorderRef.value?.isRecording && recorderRef.value.currentSessionId === sessionId) {
      recorderRef.value.discard()
      recording.value.paused = false
    }

    doc.sessions.splice(idx, 1)
    if (doc.activeSessionId === sessionId) {
      doc.activeSessionId = doc.sessions[Math.min(idx, doc.sessions.length - 1)]?.id ?? null
    }
    doc.meta.updatedAt = Date.now()
    notifyDocumentChanged()
    // 删除是管理动作：立即保存（否则"删除后马上刷新"会在去抖窗口内丢失）
    requestUrgentSave()
  }

  /** 重命名录制段 */
  function renameSession(sessionId: string, name: string): void {
    const session = document.value.sessions.find((s) => s.id === sessionId)
    if (!session) return
    const trimmed = name.trim()
    if (!trimmed) return
    session.name = trimmed
    document.value.meta.updatedAt = Date.now()
    notifyDocumentChanged()
    // 重命名是管理动作：立即保存
    requestUrgentSave()
  }

  /** 复制录制段（名称加「副本」后缀） */
  function duplicateSession(sessionId: string): string | null {
    const src = document.value.sessions.find((s) => s.id === sessionId)
    if (!src) return null
    const copy: RecordingSession = {
      ...src,
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      name: `${src.name} 副本`,
      createdAt: Date.now(),
    }
    const idx = document.value.sessions.findIndex((s) => s.id === sessionId)
    document.value.sessions.splice(idx + 1, 0, copy)
    document.value.activeSessionId = copy.id
    document.value.meta.updatedAt = Date.now()
    notifyDocumentChanged()
    // 复制是管理动作：立即保存
    requestUrgentSave()
    return copy.id
  }

  /** 清空全部录制段（不可撤销，调用方需二次确认） */
  function clearAllSessions(): void {
    const doc = document.value
    // 正在广播的段即将消失：先停止广播，避免成员继续跟随一个已不存在的段
    if (broadcast.value.selfHosted) stopBroadcast()
    if (playerRef.value) playerRef.value.exit()
    if (recorderRef.value?.isRecording) {
      recorderRef.value.discard()
      recording.value.paused = false
    }
    doc.sessions.length = 0
    doc.activeSessionId = null
    doc.meta.updatedAt = Date.now()
    notifyDocumentChanged()
    // 清空是管理动作：立即保存
    requestUrgentSave()
  }

  // ───────── 协作广播 ─────────

  /** 绑定广播通道（加入房间后由 EditorView 调用） */
  function bindBroadcastChannel(channel: AnimationBroadcastChannel): void {
    broadcastChannelRef.value = channel
  }

  function unbindBroadcastChannel(): void {
    broadcastChannelRef.value = null
  }

  const broadcastChannel = computed(() => broadcastChannelRef.value)

  /** 房间权限变化时同步「是否强制观看」 */
  function setBroadcastForceWatch(forceWatch: boolean): void {
    if (broadcast.value.forceWatch === forceWatch) return
    broadcast.value.forceWatch = forceWatch
    // 由「非强制」变为「强制」时，清除成员此前的收起状态（否则强制观看形同虚设）；
    // 反向放开时不处理，成员若已收起则保持收起。
    if (forceWatch) broadcast.value.dismissed = false
  }

  /** 注入房主侧数据来源（EditorView 在引擎就绪后调用一次） */
  function bindBroadcastHostSource(source: BroadcastHostSource): void {
    broadcastHostSourceRef.value = source
  }

  function unbindBroadcastHostSource(): void {
    broadcastHostSourceRef.value = null
  }

  /**
   * 房主开始广播某录制段。
   * 成功后房主自身也进入该段的播放视图（停在起点），便于「边讲边演示」——
   * 房主按播放后，控制状态经心跳同步给全体成员。
   */
  function startBroadcast(sessionId: string): boolean {
    const channel = broadcastChannelRef.value
    const source = broadcastHostSourceRef.value
    if (!channel || !source) return false
    if (!channel.startBroadcast(sessionId, source)) return false

    broadcast.value = {
      active: true,
      sessionId,
      hostName: '',
      selfHosted: true,
      forceWatch: broadcast.value.forceWatch,
      dismissed: false,
      ready: true,
    }
    enterPlayback(sessionId)
    toStart()
    notifyDocumentChanged()
    return true
  }

  /** 房主停止广播（成员侧会在下一个心跳窗口内自动退出广播视图） */
  function stopBroadcast(): void {
    broadcastChannelRef.value?.stopBroadcast()
    broadcast.value = createInitialBroadcastView()
    notifyDocumentChanged()
  }

  /** 房主控制状态变化时立即推送一次（不必等心跳） */
  function notifyBroadcastControl(): void {
    const channel = broadcastChannelRef.value
    const source = broadcastHostSourceRef.value
    if (!channel?.isBroadcasting || !source) return
    channel.pushControl(source)
  }

  /**
   * 成员侧：应用共享表读到的广播状态。
   * @param state 生效中的广播；null 表示广播已结束
   * @param session 广播附带的录制段（缺失时无法播放，但仍标记 active 让 UI 提示）
   */
  function applyRemoteBroadcast(
    state: { sessionId: string; hostName: string } | null,
    session: RecordingSession | null,
  ): void {
    if (!state) {
      if (broadcast.value.active && !broadcast.value.selfHosted) {
        broadcast.value = createInitialBroadcastView()
      }
      return
    }
    const sameSession = broadcast.value.sessionId === state.sessionId
    const hasSession = session !== null
    // 同一广播的重复同步（1s 轮询 + 每次 Yjs 事件）不应产生新对象，
    // 否则每秒都会触发一轮无意义的 UI 更新。
    if (
      broadcast.value.active &&
      !broadcast.value.selfHosted &&
      sameSession &&
      broadcast.value.hostName === state.hostName &&
      broadcast.value.ready === hasSession
    ) {
      return
    }
    broadcast.value = {
      active: true,
      sessionId: state.sessionId,
      hostName: state.hostName,
      selfHosted: false,
      forceWatch: broadcast.value.forceWatch,
      // 换段时复位「已收起」；同段保持用户的选择
      dismissed: sameSession ? broadcast.value.dismissed : false,
      ready: session !== null,
    }
    // 换入新会话对象 → 驱动 currentSession 重算（临时会话非响应式）
    if (session) broadcastSessionRevision.value++
  }

  /**
   * 成员收起广播（仅非强制观看时可用）。
   *
   * 语义：**不再跟随**房主的播放 —— 立即退出广播播放、回到自己的工作场景，
   * 但广播本身仍在进行，随时可以通过 `followBroadcast()` 重新跟随。
   *
   * ⚠ 必须同时退出播放：只置 `dismissed` 标记的话画面仍是广播场景，
   * 用户点「收起」看不到任何变化，会以为按钮坏了（实测反馈过）。
   */
  function dismissBroadcast(): boolean {
    if (!canDismissBroadcast.value) return false
    broadcast.value.dismissed = true
    // 正在播放这条广播 → 立即退出，交还编辑场景
    if (playback.value.active && playback.value.sessionId === broadcast.value.sessionId) {
      exitPlayback()
    }
    return true
  }

  /**
   * 重新跟随广播（收起后回心转意）。
   *
   * 只清除「已收起」标记；实际进入广播播放由 EditorView 的成员侧对账逻辑完成
   * （它监听 isWatchingBroadcast 变化，立刻同步，不必等下一次轮询）。
   */
  function followBroadcast(): boolean {
    if (!hasUnfollowedBroadcast.value) return false
    broadcast.value.dismissed = false
    return true
  }

  /** 清空广播视图（离开房间/断开连接时调用） */
  function clearBroadcastView(): void {
    broadcast.value = createInitialBroadcastView()
  }

  // ───────── 设置 ─────────
  function updateSettings(patch: Partial<AnimationSettings>): void {
    document.value.settings = { ...document.value.settings, ...patch }
    notifyDocumentChanged()
  }

  function reset(): void {
    // 就地清空（不换引用），否则引擎会继续往旧文档里写
    overwriteDocument(createEmptyDocumentWithPreference())
    Object.assign(playback.value, createInitialPlaybackState())
    Object.assign(recording.value, createInitialRecordingState())
    // 注意：capabilities 属于「环境状态」而非文档状态，不随文档重置
    // （否则在 AR 中加载项目会把「禁止录制」错误地恢复为允许）
    notifyDocumentChanged()
  }

  return {
    // 状态
    document,
    documentRevision,
    playback,
    recording,
    capabilities,
    broadcast,
    // 派生
    sessions,
    activeSession,
    currentSession,
    stepCount,
    cursor,
    isPlaying,
    isActive,
    isRecording,
    isRecordingPaused,
    hasSessions,
    activeSessionName,
    canRecord,
    canFloat,
    recordBlockedReason,
    canRecordStart,
    interactionBlockedHint,
    shouldShowFloatWindow,
    mainViewRendersShadowScene,
    locksMainViewInteraction,
    isBroadcastActive,
    isWatchingBroadcast,
    canDismissBroadcast,
    isBroadcastForced,
    hasUnfollowedBroadcast,
    canRecordPause,
    canRecordResume,
    direction,
    mode,
    canPrev,
    canNext,
    autoAdvanceMs,
    loop,
    rhythmPreset,
    isCustomRhythm,
    rhythmLabel,
    isReverse,
    transitionMs,
    transitionEasing,
    focusEnabled,
    focusZoomFactor,
    hasTransition,
    isTransitioning,
    recordUndoRedo,
    maxStepsPerSession,
    currentStepLabel,
    // 绑定
    bindEngines,
    unbindEngines,
    notifyDocumentChanged,
    urgentSaveRevision,
    setCapabilities,
    notifyInteractionBlockedHint,
    clearInteractionBlockedHint,
    // 协作广播
    broadcastChannel,
    bindBroadcastChannel,
    unbindBroadcastChannel,
    setBroadcastForceWatch,
    bindBroadcastHostSource,
    unbindBroadcastHostSource,
    startBroadcast,
    stopBroadcast,
    notifyBroadcastControl,
    applyRemoteBroadcast,
    dismissBroadcast,
    followBroadcast,
    clearBroadcastView,
    // 操作
    setDocument,
    mergeSessions,
    setActiveSession,
    setTransientSession,
    enterPlayback,
    exitPlayback,
    goto,
    prev,
    next,
    toStart,
    toEnd,
    togglePlay,
    play,
    pause,
    toggleDirection,
    setDirection,
    setAutoAdvance,
    setRhythmMs,
    setLoop,
    toggleLoop,
    setTransitionMs,
    setTransitionEasing,
    setFocusEnabled,
    setFocusZoom,
    setMode,
    floatSize,
    setFloatSize,
    startRecording,
    stopRecording,
    discardRecording,
    pauseRecording,
    resumeRecording,
    toggleRecordingPause,
    removeSession,
    renameSession,
    duplicateSession,
    clearAllSessions,
    setRecordUndoRedo,
    setMaxStepsPerSession,
    updateSettings,
    reset,
  }
})
