// src/core/animation/AnimationRecorder.ts
// 操作录像机的录制器。
//
// 通过旁听 HistoryManager 的 push 事件，把每一次真实操作记录为一个操作步。
// 与历史系统完全解耦：只读监听，不修改、不拦截、不 push。
//
// 「选中」步骤的录制规则（关键设计，详见 onSelectionChanged / buildSelectionPreSteps）：
//  - 创建/删除类操作常以「已选中的既有对象」为输入（如选中两点建圆锥、点选对象删除）；
//    若只录操作本身，回放时对象会「凭空出现 / 突然消失」。
//  - 因此录制期间把构造性选中**缓冲**为候选，操作入栈时按「确属本操作输入」过滤，
//    在操作步之前依次插入「选中X」步（delta 为空，只呈现高亮）。
//  - 无后续操作的选中（纯选中模式浏览、取消构造、创建后自动选中）不会成步：
//    候选要么被过滤为空、要么在录制结束时丢弃，满足「无意义的选中不录制」。
//
// 存储策略：首帧 baseSnapshot 全量 + 每步增量 diff + 周期性全量锚点。

import type { Scene, SceneConstraint } from '../scene/Scene'
import type { Point3 } from '../geometry/Point3'
import type { SerializedScene } from '../editor/SceneSerializer'
import { toSubscriptName } from '../geometry/displayName'
import { takeFullSnapshot } from '../editor/commands/SnapshotCommand'
import type { HistoryPushEvent, HistoryNavEvent } from '../editor/HistoryManager'
import type { CollabOperationIntent } from '../../types/collabIntent'
import { diffSnapshot, DELTA_ENTITY_KEYS } from './SnapshotDelta'
import {
  extractEntityRefs,
  extractConstraintRefs,
  getConstraintSubjectId,
  type ScopeConstraintSnapshot,
} from './RecordingScope'
import {
  SELECTION_KIND_LABELS,
  collectSelectedIds,
  lookupSceneEntity,
  lookupSnapshotEntity,
  lookupSolidName,
  resolveSelectionHighlightIds,
  type SelectedEntityInfo,
} from './stepSelection'
import {
  type AnimationDocument,
  type DeltaEntityKey,
  type RecordingSession,
  type SceneSnapshot,
  type SnapshotDelta,
  type StepIntent,
  type FocusTarget,
} from './types'

const genId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 录制段配色（循环取用） */
const SESSION_COLORS = ['#4a9eff', '#ff8a4a', '#4aff9e', '#ff4a9e', '#c44aff', '#ffd24a']

/**
 * 元素对「主体完整几何范围」的一项贡献：以「球（中心 + 半径）」表示。
 * 半径 0 表示点这类无体积元素；球/锥/柱等有体积元素必须给出真实半径。
 */
interface FocusBounds {
  cx: number
  cy: number
  cz: number
  radius: number
}

interface RecorderCallbacks {
  /** 录制状态变化（开始/新增一步/暂停/继续/结束） */
  onChange?: () => void
  /** 超过步数上限 */
  onLimitReached?: (limit: number) => void
  /**
   * 当前是否处于「构造类操作模式」（创建/合并等，不含纯选中、删除模式）。
   *
   * 用途：只有构造模式下新发生的选中才作为候选进入缓冲 —— 纯选中模式下的选中
   * 大多只是「看一眼」，不代表构造意图。这类预选（如先选底面再进入棱柱工具、
   * 选中立体面后创建展开图）由 noteConstructionModeEntered() 在进入构造模式时补记，
   * 是否成步仍由「是否为后续操作的输入」决定。
   */
  isConstructionMode?: () => boolean
}

/** 候选选中（缓冲项）：录制期间记录，操作入栈时过滤成步 */
interface PendingSelection {
  /** 该时刻的完整选中 id 列表（含此前的累积选中） */
  ids: string[]
  /** 候选发生的时刻（相对录制起点，毫秒），成步后作为该步的 offsetMs */
  offsetMs: number
}

/** 已过滤确定的「选中」预步（插在操作步之前） */
interface SelectionPreStep {
  ids: string[]
  label: string
  offsetMs: number
  focusTarget?: FocusTarget
}

export class AnimationRecorder {
  /**
   * 录制期间的「上一步快照」（JS 对象，非 JSON 字符串）：
   * 用于计算下一步的增量。首步相对 baseSnapshot。
   */
  private lastSnapshot: SceneSnapshot | null = null

  /** 当前正在录制的会话（未录制时为 null） */
  private current: RecordingSession | null = null

  /** 是否暂停（暂停时保留会话，但不累积新步） */
  private paused = false

  /** 已累计的暂停总时长（毫秒），用于 offsetMs 对齐真实操作时间 */
  private pausedAccumMs = 0

  /** 本次暂停的开始时刻（performance.now()，未暂停为 0） */
  private pauseStartedAt = 0

  private startedAt = 0

  /**
   * 待定的「选中」候选（见文件头「选中步骤的录制规则」）。
   * 录制中累积、操作入栈时过滤成步、构造中断（选中被清空）或录制结束时丢弃。
   */
  private pendingSelections: PendingSelection[] = []

  constructor(
    private readonly scene: Scene,
    private readonly document: AnimationDocument,
    private readonly callbacks: RecorderCallbacks = {},
  ) {
    // 旁听主场景选中变化：录制期间把构造性选中缓冲为候选步。
    // 影子场景（回放）的 Selection 是另一实例，不会串扰。
    this.scene.selection.setChangeListener(() => this.onSelectionChanged())
  }

  /** 解绑场景监听（编辑器销毁时调用，避免监听器悬挂到已废弃的录制器上） */
  dispose(): void {
    this.scene.selection.setChangeListener(null)
    this.pendingSelections = []
  }

  get isRecording(): boolean {
    return this.current !== null
  }

  /** 是否处于暂停（仅在录制中才有意义） */
  get isPaused(): boolean {
    return this.current !== null && this.paused
  }

  /** 是否正在累积新步（录制中且未暂停） */
  get isCapturing(): boolean {
    return this.current !== null && !this.paused
  }

  get currentSessionId(): string | null {
    return this.current?.id ?? null
  }

  get currentStepCount(): number {
    return this.current?.steps.length ?? 0
  }

  /** 当前录制中的会话（只读快照，供 UI 展示） */
  getCurrentSession(): RecordingSession | null {
    return this.current
  }

  /**
   * 开始录制：抓取起点快照，建立新会话。
   * @param name 会话名（缺省自动命名）
   */
  start(name?: string): RecordingSession {
    if (this.current) {
      // 已在录制：直接返回当前会话（幂等）
      return this.current
    }

    const baseSnapshot = takeFullSnapshot(this.scene)
    const index = this.document.sessions.length + 1
    const session: RecordingSession = {
      id: genId('sess'),
      name: name ?? `录制 ${index}`,
      color: SESSION_COLORS[(index - 1) % SESSION_COLORS.length]!,
      createdAt: Date.now(),
      durationMs: 0,
      baseSnapshot,
      steps: [],
    }

    this.current = session
    this.lastSnapshot = baseSnapshot
    this.pendingSelections = []
    this.paused = false
    this.pausedAccumMs = 0
    this.pauseStartedAt = 0
    this.startedAt = performance.now()
    this.callbacks.onChange?.()
    return session
  }

  /**
   * 暂停录制：保留会话与「上一步快照」，但不再累积新步。
   * 恢复后从暂停时的基准继续做增量，因此暂停期间的操作不会丢失、
   * 而是会被合并进「恢复后的第一步」的增量里。
   */
  pause(): void {
    if (!this.current || this.paused) return
    this.paused = true
    this.pauseStartedAt = performance.now()
    this.callbacks.onChange?.()
  }

  /** 恢复录制 */
  resume(): void {
    if (!this.current || !this.paused) return
    this.paused = false
    if (this.pauseStartedAt > 0) {
      this.pausedAccumMs += performance.now() - this.pauseStartedAt
      this.pauseStartedAt = 0
    }
    this.callbacks.onChange?.()
  }

  /**
   * 结束录制：封存会话加入文档，返回该会话。
   * 返回 null 表示当前没有在录制。
   */
  stop(): RecordingSession | null {
    if (!this.current) return null
    const session = this.current
    session.durationMs = this.elapsedMs()
    this.current = null
    this.lastSnapshot = null
    this.pendingSelections = []
    this.paused = false
    this.pausedAccumMs = 0
    this.pauseStartedAt = 0

    // 只有记录了至少一步才保留（避免空会话）
    if (session.steps.length > 0) {
      this.document.sessions.push(session)
      this.document.meta.updatedAt = Date.now()
      if (!this.document.activeSessionId) {
        this.document.activeSessionId = session.id
      }
    }
    this.callbacks.onChange?.()
    return session
  }

  /** 放弃当前录制（不封存） */
  discard(): void {
    this.current = null
    this.lastSnapshot = null
    this.pendingSelections = []
    this.paused = false
    this.pausedAccumMs = 0
    this.pauseStartedAt = 0
    this.callbacks.onChange?.()
  }

  /** 累计录制时长（扣掉暂停时间） */
  private elapsedMs(): number {
    const now = performance.now()
    const pauseExtra = this.paused && this.pauseStartedAt > 0 ? now - this.pauseStartedAt : 0
    return now - this.startedAt - this.pausedAccumMs - pauseExtra
  }

  /**
   * 旁听挂点：HistoryManager 每次真实入栈时调用。
   * 只有处于「录制中且未暂停」状态才处理。
   */
  onOperationPushed(event: HistoryPushEvent): void {
    if (!this.current) return
    if (this.paused) return

    const focusElementIds = extractFocusElementIds(event)
    // 优先用「操作后」的场景求聚焦目标；
    // 删除类操作的目标已消失，回退到「操作前」快照里求位置（否则相机不会动到被删对象处）。
    const focusTarget =
      this.computeFocusTarget(focusElementIds) ??
      computeFocusTargetFromSerialized(event.before, focusElementIds)

    // 先取「操作后」快照并算增量：既用于本步，也用于推导
    // 「本次操作把哪些既有对象当作输入」（选中候选的过滤依据）。
    const nextSnapshot: SceneSnapshot = takeFullSnapshot(this.scene)
    const prevSnapshot = this.lastSnapshot ?? this.current.baseSnapshot
    const delta = diffSnapshot(prevSnapshot, nextSnapshot)

    // 选中前情：创建/删除/合并类操作前，先把「本操作的输入对象被选中」录成步
    const selectionPreSteps = this.buildSelectionPreSteps(event, delta, prevSnapshot)

    this.captureStep({
      label: event.entry.label,
      intent: extractStepIntent(event),
      focusElementIds,
      focusTarget,
      selectionPreSteps,
      nextSnapshot,
      delta,
    })
  }

  /**
   * 旁听挂点：撤销/重做发生时调用。
   *
   * 默认**不记录**（用户要求「播放是另一套系统，不掺入撤销/重做」）；
   * 仅当设置项 `recordUndoRedo` 开启时才把撤销/重做本身也记为一个操作步，
   * 便于演示「走错再撤销」这类教学过程。
   */
  onHistoryNav(event: HistoryNavEvent): void {
    if (!this.current) return
    if (this.paused) return
    // 撤销/重做让场景整体跳到另一状态，此前缓冲的选中候选已失去意义
    this.pendingSelections = []
    if (!this.document.settings.recordUndoRedo) return

    // 撤销/重做后场景回到历史条目对应状态，几何位置直接取当前场景
    const focusElementIds = extractFocusElementIds({ entry: event.entry })
    const focusTarget = this.computeFocusTarget(focusElementIds)

    this.captureStep({
      label: `${event.action === 'undo' ? '撤销' : '重做'}：${event.entry.label}`,
      intent: {
        category: event.action,
        targetType: null,
        targetName: event.entry.label,
        subject: event.entry.label,
        note: null,
      },
      focusElementIds,
      focusTarget,
    })
  }

  // ─────────────────────────────────────────────
  // 选中步骤：候选缓冲 / 过滤成步
  // ─────────────────────────────────────────────

  /**
   * 场景选中态变化（由 Selection 的通知触发）。
   *
   * 只做**缓冲**，不成步：候选是否真的录成动画步骤，由后续操作入栈时按
   * 「该操作是否以这些对象为输入」过滤决定（见 buildSelectionPreSteps）。
   * 因此「选中模式下仅查看、未执行任何操作」的选中不会留下任何步骤。
   */
  private onSelectionChanged(): void {
    if (!this.isCapturing) return
    // 纯选中 / 删除模式：选中只代表「看」或「命中」，不构成构造意图 → 不入缓冲。
    // （预选工作流的选中由 noteConstructionModeEntered 在进入构造模式时补记）
    if (this.callbacks.isConstructionMode && !this.callbacks.isConstructionMode()) return
    this.captureSelectionCandidate()
  }

  /**
   * 记录一次「候选选中」：把当前选中态压入缓冲。
   *
   *  - 选中被清空 = 构造中断（取消 / Esc / 点空白 / 重置）→ 丢弃已有候选；
   *  - 只有相对上一条候选**新增了选中**才产生新候选：取消某个选中不单独成步，
   *    此时保留的旧候选会在过滤时按「最终是否为输入」自动对齐。
   */
  private captureSelectionCandidate(): void {
    if (!this.isCapturing) return
    const ids = collectSelectedIds(this.scene.selection)
    if (ids.length === 0) {
      this.pendingSelections = []
      return
    }
    const last = this.pendingSelections[this.pendingSelections.length - 1]
    if (last) {
      const known = new Set(last.ids)
      if (!ids.some((id) => !known.has(id))) return
    }
    this.pendingSelections.push({ ids, offsetMs: this.elapsedMs() })
  }

  /**
   * 「进入构造模式」时调用（EditorView 在模式切换后通知）。
   *
   * 编辑器支持「先选底面再进入棱柱工具」「选中立体面后创建展开图」等预选工作流 ——
   * 这些选中发生在纯选中模式，不会被 onSelectionChanged 缓冲；在此补记为候选，
   * 使后续创建操作得以追溯它们。是否成步仍由「是否为该操作的输入」过滤决定。
   */
  noteConstructionModeEntered(): void {
    this.captureSelectionCandidate()
  }

  /**
   * 推导「本操作的选中前情」，返回应插在操作步之前的选中步列表。
   *
   * 判定（即「哪些选中才有录制意义」的落地点）：
   *  - 仅对创建 / 删除 / 合并类操作处理；拖拽、修改类（intent.category 缺省或 update/move）
   *    不插入选中步 —— 避免把纯浏览选中带进动画；
   *  - 候选按「确属本操作输入」过滤（白名单见 collectOperationInputIds），
   *    过滤为空即不成步；连续候选去重，每步只展示「相对上一步新增」的对象；
   *  - 删除额外合成「选中被删对象」步 —— 删除模式下点击对象不会先进入选中态，
   *    仅靠候选拿不到目标，必须由操作目标反推（复合体逻辑 id 展开为其全部面）。
   */
  private buildSelectionPreSteps(
    event: HistoryPushEvent,
    delta: SnapshotDelta,
    prevSnapshot: SceneSnapshot,
  ): SelectionPreStep[] {
    const entry = event.entry as {
      intent?: CollabOperationIntent | null
      label?: string
      deleteTargetId?: string | null
    }
    // 删除类判定：优先取命令声明的 intent.category；
    // 个别自定义删除命令（如删除展开图的 DeleteNetCommand）不声明 intent，
    // 只留「删除…」标签 —— 按标签补判，否则这类删除既无选中前情、也无聚焦目标。
    let category = entry.intent?.category ?? null
    if (!category && typeof entry.label === 'string' && entry.label.startsWith('删除')) {
      category = 'delete'
    }
    const needsSelectionPreSteps =
      category === 'create' || category === 'delete' || category === 'merge'
    if (!needsSelectionPreSteps) {
      // 非构造性操作：候选与本次操作无关，直接丢弃（避免滞留到更晚的操作上）
      this.pendingSelections = []
      return []
    }

    const steps: SelectionPreStep[] = []
    const allowedIds = this.collectOperationInputIds(event, delta, prevSnapshot)

    // ① 候选过滤成步：只保留「确属本操作输入」的选中，连续候选去重
    let prevIds: string[] = []
    for (const candidate of this.pendingSelections) {
      const ids = candidate.ids.filter((id) => allowedIds.has(id))
      if (ids.length === 0) continue
      if (sameIdSet(ids, prevIds)) continue
      const added = ids.filter((id) => !prevIds.includes(id))
      if (added.length === 0) continue
      // 名称优先取当前场景；对象已被本操作删除时（选中步总在操作步之前观察）
      // 回退到操作前快照，避免「选中」步丢名字而整步被跳过。
      const label = buildSelectionStepLabel(
        added,
        (id) => lookupSceneEntity(this.scene, id) ?? lookupSnapshotEntity(event.before, id),
      )
      if (!label) continue
      // 聚焦目标取「本步新选中的对象」，而不是累积选区：
      // 本步的语义是「选中 B」——相机应落到 B 上让用户看清刚选了什么；
      // 若按累积选区 {A,B} 求包围盒中心，两点相距较远时相机停在中点（例如对称点时为原点），
      // 看起来就像「没聚焦刚选中的对象」（用户反馈）。
      // 高亮（selectionIds）与作用域（focusElementIds）仍用累积集合，语义不变。
      steps.push({
        ids,
        label,
        offsetMs: candidate.offsetMs,
        focusTarget:
          this.computeFocusTarget(added) ?? computeFocusTargetFromSerialized(event.before, added),
      })
      prevIds = ids
    }

    // ② 删除：候选通常拿不到删除目标（删除模式下点击对象不会先进入选中态）——
    // 由操作目标反推补一步，保证「被删对象先高亮、再消失」，而非突然消失。
    if (category === 'delete') {
      const targetId =
        entry.deleteTargetId ??
        entry.intent?.targetId ??
        inferDeleteTargetFromDelta(delta)
      const covered = !!targetId && steps.some((step) => step.ids.includes(targetId))
      if (targetId && !covered) {
        const highlightIds = resolveSelectionHighlightIds(event.before, [targetId])
        if (highlightIds.length > 0) {
          steps.push({
            ids: highlightIds,
            label: buildDeleteSelectionLabel(event, targetId),
            offsetMs: this.elapsedMs(),
            focusTarget: computeFocusTargetFromSerialized(event.before, highlightIds),
          })
        }
      }
    }

    this.pendingSelections = []
    return steps
  }

  /**
   * 本操作实际用到的「既有对象」id 集合 —— 选中候选的过滤白名单。
   *
   * 来源三处：
   *  ① **本次新建**实体（id 在操作前不存在）的引用字段（如圆锥的 baseCenterPointId /
   *     apexPointId、线段的两端点、面的边界点）。只看新建对象的原因：既有对象被顺带
   *     更新时其归属字段（如球心点上的 coneId）描述的是「成员关系」而非用户输入，
   *     一并采样会把无关对象（例如上一步创建的圆锥）误放进白名单；
   *  ② 本次**新建**约束（正六面体/棱柱/棱锥/正多边形等复合体）的全部引用
   *     （如棱柱的底面 bottomFaceId 与两个控制点）——复合体没有实体数组条目，
   *     只出现在约束里；既有约束不参与，避免白名单过宽；
   *  ③ 命令自报的目标（intent.targetId / keepPointId / deleteTargetId / removedPointIds）。
   *
   * 再与「操作前已存在的对象」求交：本次操作新造出来的对象（如创建后自动选中的新圆锥）
   * 天然被排除 —— 这正是「创建后的自动选中」不会被误录成步骤的原因。
   */
  private collectOperationInputIds(
    event: HistoryPushEvent,
    delta: SnapshotDelta,
    prevSnapshot: SceneSnapshot,
  ): Set<string> {
    const beforeIds = collectSnapshotIds(prevSnapshot)
    const refs: string[] = []

    for (const key of Object.keys(delta.changes) as DeltaEntityKey[]) {
      const change = delta.changes[key]
      if (!change) continue
      for (const item of change.upsert) {
        if (beforeIds.has(item.id)) continue
        refs.push(...extractEntityRefs(key, item as unknown as Record<string, unknown>))
      }
    }
    for (const rawConstraint of delta.constraints ?? []) {
      const constraint = rawConstraint as ScopeConstraintSnapshot
      const subject = getConstraintSubjectId(constraint)
      if (beforeIds.has(subject)) continue
      refs.push(...extractConstraintRefs(constraint))
    }

    const entry = event.entry as {
      intent?: CollabOperationIntent | null
      keepPointId?: string | null
      deleteTargetId?: string | null
    }
    if (entry.intent?.targetId) refs.push(entry.intent.targetId)
    if (entry.keepPointId) refs.push(entry.keepPointId)
    if (entry.deleteTargetId) refs.push(entry.deleteTargetId)
    if (entry.intent?.removedPointIds) refs.push(...entry.intent.removedPointIds)

    const allowed = new Set<string>()
    for (const id of refs) {
      if (beforeIds.has(id)) allowed.add(id)
    }
    return allowed
  }

  /**
   * 统一记一步：抓当前快照 → 算增量 → 组装 AnimationStep 入列。
   * 被「操作入栈」与「撤销/重做」两条旁听路径共用。
   *
   * 操作步之前可先落若干「选中」预步：它们 delta 为空、不推进 lastSnapshot
   * （选中不改变几何），因此随后操作步的增量仍相对同一基准计算，语义不变。
   */
  private captureStep(input: {
    label: string
    intent?: StepIntent
    focusElementIds: string[]
    focusTarget?: FocusTarget
    /** 插在本步之前的「选中」预步（已过滤/排序） */
    selectionPreSteps?: SelectionPreStep[]
    /** 预取的「操作后」快照（onOperationPushed 已算好，避免重复全量快照） */
    nextSnapshot?: SceneSnapshot
    /** 预取的增量（同上） */
    delta?: SnapshotDelta
  }): void {
    if (!this.current) return

    const settings = this.document.settings
    const steps = this.current.steps
    const nextSnapshot: SceneSnapshot = input.nextSnapshot ?? takeFullSnapshot(this.scene)
    const prevSnapshot = this.lastSnapshot ?? this.current.baseSnapshot
    const delta = input.delta ?? diffSnapshot(prevSnapshot, nextSnapshot)

    // ① 选中预步：正文为「先选中、再操作」，故置于操作步之前
    for (const pre of input.selectionPreSteps ?? []) {
      if (steps.length >= settings.maxStepsPerSession) {
        this.callbacks.onLimitReached?.(settings.maxStepsPerSession)
        break
      }
      steps.push({
        id: genId('step'),
        index: steps.length,
        label: pre.label,
        intent: {
          category: 'select',
          targetType: null,
          targetName: null,
          subject: pre.label,
          note: null,
        },
        // 选中不改变几何：空增量（回放时本步只呈现高亮）
        delta: { changes: {}, constraints: null },
        offsetMs: pre.offsetMs,
        focusElementIds: [...pre.ids],
        focusTarget: pre.focusTarget,
        selectionIds: [...pre.ids],
        isAnchor: false,
      })
    }

    // ② 操作步
    if (steps.length >= settings.maxStepsPerSession) {
      this.callbacks.onLimitReached?.(settings.maxStepsPerSession)
      this.current.durationMs = this.elapsedMs()
      this.callbacks.onChange?.()
      return
    }

    const index = steps.length
    const isAnchor = index > 0 && index % settings.anchorInterval === 0

    steps.push({
      id: genId('step'),
      index,
      label: input.label,
      intent: input.intent,
      delta,
      offsetMs: this.elapsedMs(),
      focusElementIds: input.focusElementIds,
      focusTarget: input.focusTarget,
      isAnchor,
      anchorSnapshot: isAnchor ? nextSnapshot : undefined,
    })
    this.lastSnapshot = nextSnapshot
    this.current.durationMs = this.elapsedMs()
    this.callbacks.onChange?.()
  }

  /**
   * 计算聚焦目标：遍历场景中被操作对象的点，求 AABB → 中心 + 包围球半径。
   * 仅在录制时算一次，回放零成本。
   */
  /**
   * 计算「本步主体对象的完整几何范围」。
   *
   * ⚠ 关键：不能只取「构成点」的包围盒。有体积的几何体（球/锥/柱）其构成点只有
   * 球心 + 半径点、底心 + 顶点这类**骨架点**，骨架点集的包围球半径只有真实值的一半，
   * 相机聚焦后实体必然被视锥裁掉一部分——这正是「只能看到正六面体/球体的一部分」的成因。
   * 因此本函数按类型给出真正覆盖几何表面的范围：
   *  - 球：球心 + **真实半径**（由 Sphere3.getRadius 得到）
   *  - 锥：底面圆（底心 + 底半径）+ 顶点
   *  - 柱：上下底圆（各自圆心 + 半径）
   *  - 圆：圆心 + 半径
   *  - 正六面体/棱柱/棱锥/正多边形/面等约束型几何：取其**全部依赖点**（含派生顶点）
   *  - 线/射线/向量：两端点；点：其自身
   *  - 兜底：按归属字段（sphereId/coneId/cubeId/…）扫描出的点
   */
  private computeFocusTarget(elementIds: string[]): FocusTarget | undefined {
    if (elementIds.length === 0) return undefined

    const bounds: FocusBounds[] = []
    for (const id of elementIds) this.collectFocusBounds(id, bounds)
    if (bounds.length === 0) return undefined

    // 聚焦中心 = 各贡献范围并集的轴对齐包围盒中心
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const b of bounds) {
      if (b.cx - b.radius < minX) minX = b.cx - b.radius
      if (b.cy - b.radius < minY) minY = b.cy - b.radius
      if (b.cz - b.radius < minZ) minZ = b.cz - b.radius
      if (b.cx + b.radius > maxX) maxX = b.cx + b.radius
      if (b.cy + b.radius > maxY) maxY = b.cy + b.radius
      if (b.cz + b.radius > maxZ) maxZ = b.cz + b.radius
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2

    // 半径 = 中心到各贡献球面的最大距离。
    // 对纯点集，该值与「半对角线」等价（不改变原有行为）；对球/锥/柱则给出真实外接半径。
    let radius = 0
    for (const b of bounds) {
      const d = Math.hypot(b.cx - cx, b.cy - cy, b.cz - cz) + b.radius
      if (d > radius) radius = d
    }

    return { position: [cx, cy, cz], radius: Math.max(radius, 0.5) }
  }

  /** 把某元素覆盖的几何范围追加到 out（见 computeFocusTarget 的类型说明） */
  private collectFocusBounds(elementId: string, out: FocusBounds[]): void {
    const pushPoint = (p: Point3 | null | undefined) => {
      if (!p) return
      out.push({ cx: p.position.x, cy: p.position.y, cz: p.position.z, radius: 0 })
    }
    const pushBall = (
      center: { x: number; y: number; z: number },
      radius: number,
    ) => {
      out.push({ cx: center.x, cy: center.y, cz: center.z, radius: Math.max(radius, 0) })
    }

    // 点本身
    const point = this.scene.points.get(elementId)
    if (point) {
      pushPoint(point)
      return
    }

    // 球：必须带真实半径，否则范围只有「球心→半径点」的一半
    const sphere = this.scene.spheres.get(elementId)
    if (sphere) {
      pushBall(sphere.centerPoint.position, sphere.getRadius())
      return
    }

    // 锥：底面圆盘 + 顶点。
    // 注意用「圆盘」而不是「球」——球会在轴向额外扩张半径，
    // 使包围范围虚大（实测半径从 2.5 虚增到 3.5），主体在画面里显得偏小。
    const cone = this.scene.cones.get(elementId)
    if (cone) {
      const base = cone.baseCenterPoint.position
      const apex = cone.apexPoint.position
      this.pushDiscExtremes(out, base, cone.getRadius(), {
        x: apex.x - base.x,
        y: apex.y - base.y,
        z: apex.z - base.z,
      })
      pushPoint(cone.apexPoint)
      return
    }

    // 柱：上下底圆盘（两者都要计入，否则柱体会有一端被裁掉）
    const cylinder = this.scene.cylinders.get(elementId)
    if (cylinder) {
      const bottom = cylinder.bottomCenterPoint.position
      const top = cylinder.topCenterPoint.position
      const axis = { x: top.x - bottom.x, y: top.y - bottom.y, z: top.z - bottom.z }
      this.pushDiscExtremes(out, bottom, cylinder.getRadius(), axis)
      this.pushDiscExtremes(out, top, cylinder.getRadius(), axis)
      return
    }

    // 圆：圆心 + 半径（覆盖整个圆面，而不是只覆盖三个定义点）
    const circle = this.scene.circles.get(elementId)
    if (circle) {
      // ⚠ 法向圆必须传入**解析出的法向量**：
      // Circle3.getFrame() 在法向圆缺少法向量时直接返回 null（方向来自线/射线/向量
      // 而非「点」的情况），旧代码于是退回 pushPoint(circle.p1) —— 而法向圆的 p1
      // 就是**圆心**，结果整步聚焦只有圆心一个点、圆完全不在画面里（用户反馈）。
      const axis = this.scene.resolveNormalCircleDirection(circle)
      const frame = circle.getFrame(axis)
      if (frame) {
        // 用「圆盘」而不是「球」：圆是平面图形，球会在法向额外扩张半径，
        // 使包围范围虚大、主体在画面里偏小（与圆锥/圆柱同一处理）。
        this.pushDiscExtremes(out, frame.center, frame.radius, frame.normal)
      } else {
        pushPoint(circle.p1)
        pushPoint(circle.p2)
        pushPoint(circle.p3)
      }
      return
    }

    // 线 / 直线 / 射线 / 向量：两端点
    const line = this.scene.lines.get(elementId)
    if (line) {
      pushPoint(line.p1)
      pushPoint(line.p2)
      return
    }
    const straightLine = this.scene.straightLines.get(elementId)
    if (straightLine) {
      pushPoint(straightLine.p1)
      pushPoint(straightLine.p2)
      return
    }
    const ray = this.scene.rays.get(elementId)
    if (ray) {
      pushPoint(ray.p1)
      pushPoint(ray.p2)
      return
    }
    const vector = this.scene.vectors.get(elementId)
    if (vector) {
      pushPoint(vector.p1)
      pushPoint(vector.p2)
      return
    }

    // 垂线 / 平行线：基点 + 显示端点。
    // ⚠ 必须显式处理：这两类既有独立选中集合、又能作为构造目标被选中
    // （垂线/平行线作图、删除），漏掉会让「选中垂线/平行线」步无聚焦目标 → 相机不动。
    const perpendicularLine = this.scene.perpendicularLines.get(elementId)
    if (perpendicularLine) {
      pushPoint(perpendicularLine.p1)
      pushPoint(perpendicularLine.p2)
      return
    }
    const parallelLine = this.scene.parallelLines.get(elementId)
    if (parallelLine) {
      pushPoint(parallelLine.p1)
      pushPoint(parallelLine.p2)
      return
    }

    // 约束型几何体（正六面体/棱柱/棱锥/正多边形/面/交点/受约束点）：
    // 统一取「全部依赖点」——它包含用户选定的 owner 点与求解派生的顶点，
    // 是覆盖整个实体的可靠来源（不依赖点的归属字段是否已回填）。
    for (const container of this.constraintContainers()) {
      const constraint = container.get(elementId)
      const dependencyIds = constraint?.getDependencyPointIds?.()
      if (!dependencyIds) continue
      let added = false
      for (const pid of dependencyIds) {
        const p = this.scene.points.get(pid)
        if (p) {
          pushPoint(p)
          added = true
        }
      }
      if (added) return
    }

    // 面的边界点与成员点
    const face = this.scene.faces.get(elementId)
    if (face) {
      let added = false
      for (const pid of [...face.boundaryPointIds, ...face.memberPointIds]) {
        const p = this.scene.points.get(pid)
        if (p) {
          pushPoint(p)
          added = true
        }
      }
      if (added) return
    }

    // 展开图：本体的面顶点由 NetMath 按展开进度变换派生，录制期不重算该变换；
    // 以「它所引用的面的原始构成点」近似范围 —— 展开图锚定在原多面体处，
    // 该点集足以让相机框住主体（缺失会导致「选中展开图」步无聚焦目标）。
    const net = this.scene.nets.get(elementId)
    if (net) {
      let added = false
      for (const fid of net.faceIds) {
        const netFace = this.scene.faces.get(fid)
        if (!netFace) continue
        for (const pid of [...netFace.boundaryPointIds, ...netFace.memberPointIds]) {
          const p = this.scene.points.get(pid)
          if (p) {
            pushPoint(p)
            added = true
          }
        }
      }
      if (!added) out.push({ cx: net.position.x, cy: net.position.y, cz: net.position.z, radius: 0 })
      return
    }

    // 兜底：按归属字段扫描（sphereId / coneId / cylinderId / cubeId / prismId / …）
    let added = false
    for (const p of this.scene.points.values()) {
      if (!pointBelongsToElement(p, elementId)) continue
      pushPoint(p)
      added = true
    }
    void added
  }

  /**
   * 把「垂直于 axis、半径为 radius 的圆盘」的四个极值点加入范围。
   *
   * 用圆盘的四个边缘极值点（而不是一个球）表示底面/顶面：
   * 球会在轴向上额外扩张 radius，使包围范围虚大；
   * 圆盘极值点在轴向上扩张为 0，得到的范围既紧致又完整覆盖。
   * 轴向退化（顶点与底面中心重合等）时退化为一个点。
   */
  private pushDiscExtremes(
    out: FocusBounds[],
    center: { x: number; y: number; z: number },
    radius: number,
    axis: { x: number; y: number; z: number },
  ): void {
    for (const pos of discExtremePositions(center, radius, axis)) {
      out.push({ cx: pos.x, cy: pos.y, cz: pos.z, radius: 0 })
    }
  }

  /** 所有「约束型几何体」的容器（用于按 id 取依赖点） */
  private constraintContainers(): Array<Map<string, SceneConstraint>> {
    return [
      this.scene.cubeConstraints,
      this.scene.prismConstraints,
      this.scene.pyramidConstraints,
      this.scene.regularPolygonConstraints,
      this.scene.cylinderConstraints as unknown as Map<string, SceneConstraint>,
      this.scene.faceConstraints,
      this.scene.intersectionConstraints,
      this.scene.objectConstrainedPointConstraints as unknown as Map<string, SceneConstraint>,
    ]
  }
}

// ─────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────

/** 从 HistoryEntry 的 intent 提取步意图 */
function extractStepIntent(event: HistoryPushEvent): StepIntent | undefined {
  const intent = (event.entry as { intent?: CollabOperationIntent | null }).intent
  if (!intent || !intent.category) return undefined
  return {
    category: intent.category,
    targetType: intent.targetType ?? null,
    targetName: intent.targetName ?? null,
    subject: intent.subject ?? null,
    note: intent.note ?? null,
  }
}

/** 提取该步操作的焦点对象 id（接受 Push/Nav 两种事件载荷） */
function extractFocusElementIds(event: { entry: unknown }): string[] {
  const entry = event.entry as {
    intent?: CollabOperationIntent | null
    keepPointId?: string | null
    deleteTargetId?: string | null
  }
  const ids: string[] = []
  const targetId = entry?.intent?.targetId
  if (targetId) ids.push(targetId)
  if (entry?.keepPointId) ids.push(entry.keepPointId)
  if (entry?.deleteTargetId && !ids.includes(entry.deleteTargetId)) ids.push(entry.deleteTargetId)
  return [...new Set(ids)]
}

/** 快照中的全部对象 id（13 类实体 + 约束主体，保证复合体逻辑 id 也在内） */
function collectSnapshotIds(snapshot: SceneSnapshot): Set<string> {
  const ids = new Set<string>()
  for (const key of DELTA_ENTITY_KEYS) {
    const arr = (snapshot[key] ?? []) as Array<{ id: string }>
    for (const item of arr) ids.add(item.id)
  }
  for (const constraint of snapshot.constraints ?? []) {
    ids.add(getConstraintSubjectId(constraint))
  }
  return ids
}

/** 两个 id 列表是否表示同一集合（忽略顺序） */
function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(b)
  return a.every((id) => set.has(id))
}

/**
 * 无目标声明的自定义删除命令（如 DeleteNetCommand）：从增量里反推被删目标 id。
 *
 * 只认「恰好删除一个实体」的情形 —— 一次删除多个（级联）时无法判断用户点的是哪个，
 * 宁可不补选中步，也不猜错对象；有目标声明的命令（Feature 系删除）不走这里。
 */
function inferDeleteTargetFromDelta(delta: SnapshotDelta): string | null {
  const removed: string[] = []
  for (const key of Object.keys(delta.changes) as DeltaEntityKey[]) {
    removed.push(...(delta.changes[key]?.removed ?? []))
  }
  return removed.length === 1 ? removed[0]! : null
}

/**
 * 「选中」步标签：`选中 + 各项名称`。
 *
 * 命名沿用 buildFeatureActionLabel 的口径（名称含种类词则省略种类前缀、
 * 名称做下标化），保证时间轴上「选中点 A」「选中正六面体₁」与
 * 「创建点 A」「创建正六面体₁」风格一致。
 * 多项一次选中（如点击复合体的面会一次选中多个面）时最多列 3 项，其余折叠计数。
 */
function buildSelectionStepLabel(
  addedIds: readonly string[],
  resolve: (id: string) => SelectedEntityInfo | null,
): string | null {
  const names: string[] = []
  for (const id of addedIds) {
    const info = resolve(id)
    if (!info) continue
    const kindLabel = SELECTION_KIND_LABELS[info.kind]
    const text = toSubscriptName(info.name)
    if (!text) names.push(kindLabel)
    else names.push(text.includes(kindLabel) ? text : `${kindLabel} ${text}`)
  }
  if (names.length === 0) return null
  if (names.length <= 3) return `选中${names.join('、')}`
  return `选中${names.slice(0, 2).join('、')}等 ${names.length} 个对象`
}

/**
 * 删除步的「选中」前情标签：`选中 + 被删对象名称`。
 *
 * 名称优先按「删除」标签复用（如「删除点 A」→「选中点 A」），
 * 其次从操作前快照解析（普通实体取 name，复合体逻辑 id 取约束上的 name）。
 */
function buildDeleteSelectionLabel(event: HistoryPushEvent, targetId: string): string {
  const deleteLabel = event.entry.label ?? ''
  if (deleteLabel.startsWith('删除')) {
    const text = deleteLabel.slice('删除'.length).trim()
    if (text) return `选中${text}`
  }
  const info = lookupSnapshotEntity(event.before, targetId)
  if (info) {
    const kindLabel = SELECTION_KIND_LABELS[info.kind]
    const text = toSubscriptName(info.name)
    if (text) return `选中${text.includes(kindLabel) ? text : `${kindLabel} ${text}`}`
    return `选中${kindLabel}`
  }
  const solidName = lookupSolidName(event.before, targetId)
  if (solidName) {
    const text = toSubscriptName(solidName)
    return `选中${text}`
  }
  return '选中对象'
}

/** 判断某个点是否属于给定元素 id */
function pointBelongsToElement(p: { cubeId?: string | null; circleId?: string | null; sphereId?: string | null; coneId?: string | null; cylinderId?: string | null; prismId?: string | null; pyramidId?: string | null; regularPolygonId?: string | null }, elementId: string): boolean {
  return (
    p.cubeId === elementId ||
    p.circleId === elementId ||
    p.sphereId === elementId ||
    p.coneId === elementId ||
    p.cylinderId === elementId ||
    p.prismId === elementId ||
    p.pyramidId === elementId ||
    p.regularPolygonId === elementId
  )
}

/**
 * 从「操作前」的序列化场景求聚焦目标。
 * 用于删除类操作：目标在操作后已不存在，只能回到操作前状态定位其几何位置。
 *
 * 覆盖：点本身 / 点的角色归属字段 / 线类端点 / 圆三点 / 面 / 展开图 /
 *      垂线·平行线（基点 + 显示端点坐标）/ 球（含真实半径）/ 锥（底面圆盘 + 顶点）/ 柱（上下底圆盘）。
 *
 * ⚠ 覆盖范围必须与「可被选中高亮的对象种类」（Selection 的 13 类集合）一致：
 *   少一类就会出现「该步有选中高亮、但相机不动」——聚焦目标缺失时播放器选择不动相机。
 *   同理，有体积元素要给出真实半径的极值点，否则聚焦后实体被视锥裁掉一部分。
 */
function computeFocusTargetFromSerialized(
  data: SerializedScene,
  elementIds: string[],
): FocusTarget | undefined {
  if (elementIds.length === 0 || !data?.points?.length) return undefined

  const wanted = new Set(elementIds)
  const byId = new Map<string, { x: number; y: number; z: number }>()
  for (const p of data.points) byId.set(p.id, p.position)

  const collected = new Set<string>()
  /** 非「场景点位」的坐标贡献（垂线显示端点、圆盘极值点等） */
  const extraPositions: Array<{ x: number; y: number; z: number }> = []

  // ① 点本身 + 角色归属
  for (const p of data.points) {
    if (wanted.has(p.id)) {
      collected.add(p.id)
      continue
    }
    if (
      (p.cubeId && wanted.has(p.cubeId)) ||
      (p.circleId && wanted.has(p.circleId)) ||
      (p.regularPolygonId && wanted.has(p.regularPolygonId)) ||
      (p.sphereId && wanted.has(p.sphereId)) ||
      (p.coneId && wanted.has(p.coneId)) ||
      (p.cylinderId && wanted.has(p.cylinderId)) ||
      (p.prismId && wanted.has(p.prismId)) ||
      (p.pyramidId && wanted.has(p.pyramidId))
    ) {
      collected.add(p.id)
    }
  }

  // ② 线类（含直线/射线/向量）端点
  const addEndpoints = (
    items: Array<{ id: string; p1Id?: string; p2Id?: string; p3Id?: string }>,
  ) => {
    for (const item of items) {
      if (!wanted.has(item.id)) continue
      if (item.p1Id) collected.add(item.p1Id)
      if (item.p2Id) collected.add(item.p2Id)
      if (item.p3Id) collected.add(item.p3Id)
    }
  }
  addEndpoints(data.lines)
  addEndpoints(data.straightLines)
  addEndpoints(data.rays)
  addEndpoints(data.vectors)
  addEndpoints(data.circles)

  // ③ 面
  for (const f of data.faces) {
    if (!wanted.has(f.id)) continue
    for (const pid of f.boundaryPointIds) collected.add(pid)
    for (const pid of f.memberPointIds) collected.add(pid)
  }

  // ④ 展开图：取其所引用面的构成点（展开顶点为派生几何，快照中只存变换矩阵）
  for (const net of data.nets) {
    if (!wanted.has(net.id)) continue
    let added = false
    for (const f of data.faces) {
      if (!net.faceIds.includes(f.id)) continue
      for (const pid of [...f.boundaryPointIds, ...f.memberPointIds]) {
        collected.add(pid)
        added = true
      }
    }
    if (!added && net.position) extraPositions.push(net.position)
  }

  // ⑤ 垂线 / 平行线：基点（点 id）+ 显示端点（快照存的是坐标，不是点 id）
  for (const pl of [...data.perpendicularLines, ...data.parallelLines]) {
    if (!wanted.has(pl.id)) continue
    collected.add(pl.p1Id)
    if (pl.p2Position) extraPositions.push(pl.p2Position)
  }

  // ⑥ 球 / 锥 / 柱：骨架点 + 真实半径的极值点
  for (const s of data.spheres) {
    if (!wanted.has(s.id)) continue
    collected.add(s.centerPointId)
    if (s.radiusPointId) collected.add(s.radiusPointId)
    const center = byId.get(s.centerPointId)
    const radius = resolveSerializedRadius(s.radiusValue, center, s.radiusPointId, byId)
    if (center && radius > 0) {
      // 球：沿三轴取极值（球在各方向上都扩张 radius）
      for (const axis of AXIS_DIRECTIONS) {
        extraPositions.push({
          x: center.x + axis.x * radius,
          y: center.y + axis.y * radius,
          z: center.z + axis.z * radius,
        })
        extraPositions.push({
          x: center.x - axis.x * radius,
          y: center.y - axis.y * radius,
          z: center.z - axis.z * radius,
        })
      }
    }
  }
  for (const c of data.cones) {
    if (!wanted.has(c.id)) continue
    collected.add(c.baseCenterPointId)
    collected.add(c.apexPointId)
    const base = byId.get(c.baseCenterPointId)
    const apex = byId.get(c.apexPointId)
    if (base && c.radiusValue > 0) {
      const axis = apex ? { x: apex.x - base.x, y: apex.y - base.y, z: apex.z - base.z } : { x: 0, y: 0, z: 0 }
      extraPositions.push(...discExtremePositions(base, c.radiusValue, axis))
    }
  }
  for (const c of data.cylinders) {
    if (!wanted.has(c.id)) continue
    const bottom = c.bottomCenterPointId ? byId.get(c.bottomCenterPointId) : undefined
    const top = c.topCenterPointId ? byId.get(c.topCenterPointId) : undefined
    if (c.bottomCenterPointId) collected.add(c.bottomCenterPointId)
    if (c.topCenterPointId) collected.add(c.topCenterPointId)
    if (bottom && c.radiusValue > 0) {
      const axis =
        top && bottom
          ? { x: top.x - bottom.x, y: top.y - bottom.y, z: top.z - bottom.z }
          : { x: 0, y: 0, z: 0 }
      extraPositions.push(...discExtremePositions(bottom, c.radiusValue, axis))
      if (top) extraPositions.push(...discExtremePositions(top, c.radiusValue, axis))
    }
  }

  // 求 AABB（点 id 解析出的坐标 + 额外坐标贡献）
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let found = false
  const expand = (pos: { x: number; y: number; z: number } | undefined) => {
    if (!pos) return
    found = true
    if (pos.x < minX) minX = pos.x
    if (pos.y < minY) minY = pos.y
    if (pos.z < minZ) minZ = pos.z
    if (pos.x > maxX) maxX = pos.x
    if (pos.y > maxY) maxY = pos.y
    if (pos.z > maxZ) maxZ = pos.z
  }
  for (const id of collected) expand(byId.get(id))
  for (const pos of extraPositions) expand(pos)
  if (!found) return undefined

  const dx = maxX - minX
  const dy = maxY - minY
  const dz = maxZ - minZ
  return {
    position: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    radius: Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 0.5),
  }
}

/** 三轴单位方向（求球体极值点用） */
const AXIS_DIRECTIONS = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
] as const

/**
 * 球的实际半径：半径点存在时以「球心→半径点」距离为准（与 Sphere3.getRadius 口径一致），
 * 否则回退到快照记录的 radiusValue。
 */
function resolveSerializedRadius(
  radiusValue: number,
  center: { x: number; y: number; z: number } | undefined,
  radiusPointId: string | null | undefined,
  byId: Map<string, { x: number; y: number; z: number }>,
): number {
  const radiusPoint = radiusPointId ? byId.get(radiusPointId) : undefined
  if (center && radiusPoint) {
    const d = Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y, radiusPoint.z - center.z)
    if (d > 0) return d
  }
  return Number.isFinite(radiusValue) ? radiusValue : 0
}

/**
 * 「垂直于 axis、半径为 radius 的圆盘」的边缘极值点（四个方向）。
 * 轴向退化（点与圆心重合等）或半径无效时退回圆心单点 —— 与录制期
 * 底面/顶面/底面圆的聚焦口径完全一致，两处不可用不同近似。
 */
function discExtremePositions(
  center: { x: number; y: number; z: number },
  radius: number,
  axis: { x: number; y: number; z: number },
): Array<{ x: number; y: number; z: number }> {
  if (!(radius > 0)) return [{ x: center.x, y: center.y, z: center.z }]
  const axisLength = Math.hypot(axis.x, axis.y, axis.z)
  if (!(axisLength > 1e-9)) return [{ x: center.x, y: center.y, z: center.z }]
  const nx = axis.x / axisLength
  const ny = axis.y / axisLength
  const nz = axis.z / axisLength

  // 与轴不平行的参考向量 → 构造垂直于轴的基 (u, v)
  const fx = Math.abs(ny) < 1 - 1e-6 ? 0 : 1
  const fy = Math.abs(ny) < 1 - 1e-6 ? 1 : 0
  let ux = ny * 0 - nz * fy
  let uy = nz * fx - nx * 0
  let uz = nx * fy - ny * fx
  const uLength = Math.hypot(ux, uy, uz)
  if (!(uLength > 1e-9)) return [{ x: center.x, y: center.y, z: center.z }]
  ux /= uLength
  uy /= uLength
  uz /= uLength
  const vx = ny * uz - nz * uy
  const vy = nz * ux - nx * uz
  const vz = nx * uy - ny * ux

  const out: Array<{ x: number; y: number; z: number }> = []
  for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    out.push({
      x: center.x + (ux * su + vx * sv) * radius,
      y: center.y + (uy * su + vy * sv) * radius,
      z: center.z + (uz * su + vz * sv) * radius,
    })
  }
  return out
}

/** 导出序列化场景（供外部构造 baseSnapshot 时对齐；当前未使用但保留接口） */
