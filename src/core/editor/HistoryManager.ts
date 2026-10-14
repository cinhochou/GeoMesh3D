// src/core/editor/HistoryManager.ts
import type { Scene } from '../scene/Scene'
import { exportScene, importScene, isSameSerializedScene, type SerializedScene } from './SceneSerializer'

const genId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export interface HistoryEntry {
  readonly id: string
  readonly label: string
  readonly timestamp: number
  redo(): void
  undo(): void
  dispose?(): void
}

export interface HistoryManagerOptions {
  maxEntries: number
  autoSolveConstraints: boolean
}

/**
 * 操作被记录到历史后的通知载荷。
 * 供动画系统（操作录像机）旁听使用：每个成功的 push 即一个「操作步」。
 */
export interface HistoryPushEvent {
  entry: HistoryEntry
  /** 操作前的场景快照（即上一步的状态） */
  before: SerializedScene
  /** 操作后的场景快照 */
  after: SerializedScene
  /** 是否由事务提交产生 */
  fromTransaction: boolean
}

/** 撤销/重做的通知载荷（供动画系统按设置决定是否录制） */
export interface HistoryNavEvent {
  /** 'undo' | 'redo' */
  action: 'undo' | 'redo'
  entry: HistoryEntry
  /** 导航后的场景快照 */
  after: SerializedScene
}

/** 快照历史条目，与共享历史格式一致 */
export interface SnapshotHistoryEntry {
  before: SerializedScene
  after: SerializedScene
  label: string
}

const DEFAULT_OPTIONS: HistoryManagerOptions = {
  maxEntries: 200,
  autoSolveConstraints: true,
}

export class HistoryManager {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private maxEntries: number
  private autoSolveConstraints: boolean
  private scene: Scene

  private transactionDepth = 0
  private transactionLabel = ''
  private transactionEntries: HistoryEntry[] = []

  /** 撤销/重做执行中标记，防止嵌套操作污染历史栈 */
  private isExecuting = false

  /** 暂停标记：协作模式下暂停本地历史记录，避免命令同时入栈本地和共享历史 */
  private paused = false

  /**
   * 操作被记录到历史后的回调（动画系统旁听挂点）。
   * 仅在真正入栈（非空操作、非事务缓冲）时触发。
   */
  private onPushed: ((event: HistoryPushEvent) => void) | null = null

  /** 撤销/重做发生后的回调（动画系统按设置决定是否录制） */
  private onHistoryNav: ((event: HistoryNavEvent) => void) | null = null

  /**
   * 快照历史：与 undoStack/redoStack 平行维护，
   * 用于协作模式下将本地历史完整上传到共享历史。
   *
   * undoSnapshotEntries[i] 对应 undoStack[i] 的 before/after 快照。
   * redoSnapshotEntries[i] 对应 redoStack[i] 的 before/after 快照。
   */
  private undoSnapshotEntries: SnapshotHistoryEntry[] = []
  private redoSnapshotEntries: SnapshotHistoryEntry[] = []

  /** 上一次捕获的场景快照，用于在 push 时推断 "before" 状态 */
  private lastSceneSnapshot: SerializedScene

  constructor(scene: Scene, options?: Partial<HistoryManagerOptions>) {
    this.scene = scene
    this.lastSceneSnapshot = exportScene(scene)
    const opts = { ...DEFAULT_OPTIONS, ...options }
    this.maxEntries = opts.maxEntries
    this.autoSolveConstraints = opts.autoSolveConstraints
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoStackSize(): number {
    return this.undoStack.length
  }

  get redoStackSize(): number {
    return this.redoStack.length
  }

  get isInTransaction(): boolean {
    return this.transactionDepth > 0
  }

  /**
   * 注册「操作已入历史」回调（动画系统旁听挂点）。
   * 传入 null 可取消注册。
   */
  setPushListener(listener: ((event: HistoryPushEvent) => void) | null): void {
    this.onPushed = listener
  }

  /** 注册「撤销/重做发生」回调。传入 null 可取消注册。 */
  setNavListener(listener: ((event: HistoryNavEvent) => void) | null): void {
    this.onHistoryNav = listener
  }

  /**
   * 由**协作历史路径**显式触发的撤销/重做旁听通知。
   *
   * 协作房间内撤销/重做走共享历史（直接套用共享条目的 before 快照），
   * 不经过本类的 undo()/redo()，因此 notifyNav 不会触发——
   * 若要走「记录撤销/重做」的录制设置，必须由此显式通知。
   */
  notifyExternalNav(action: 'undo' | 'redo', entry: HistoryEntry): void {
    this.notifyNav(action, entry)
  }

  /** 通知撤销/重做旁听者 */
  private notifyNav(action: 'undo' | 'redo', entry: HistoryEntry): void {
    if (!this.onHistoryNav) return
    try {
      this.onHistoryNav({ action, entry, after: exportScene(this.scene) })
    } catch (e) {
      console.warn('[HistoryManager] onHistoryNav listener failed:', e)
    }
  }

  /**
   * 记录一个操作到历史栈。
   * 如果当前在事务中，命令会被收集到事务缓冲区，不直接入栈。
   * 如果当前已暂停（协作模式），push 为空操作。
   *
   * 空操作（命令执行前后场景完全一致，例如只把状态重写为同值的命令）**不入栈**：
   * 否则用户会看到「点击一次就多一步撤销」这类撤销后什么都没变的历史。
   */
  push(entry: HistoryEntry): void {
    this.pushInternal(entry, false)
  }

  /**
   * push 的内部实现，额外携带 fromTransaction 标记（供旁听者区分普通操作与事务提交）。
   */
  private pushInternal(entry: HistoryEntry, fromTransaction: boolean): void {
    if (this.isExecuting || this.paused) return

    if (this.transactionDepth > 0 && !fromTransaction) {
      this.transactionEntries.push(entry)
      return
    }

    // before = lastSceneSnapshot（命令执行前的场景状态）
    // after  = exportScene(scene)（命令执行后的场景状态）
    const after = exportScene(this.scene)
    if (isSameSerializedScene(this.lastSceneSnapshot, after)) return

    const before = this.lastSceneSnapshot

    this.undoStack.push(entry)
    this.undoSnapshotEntries.push({ before, after, label: entry.label })
    this.lastSceneSnapshot = after
    this.clearRedoStack()

    while (this.undoStack.length > this.maxEntries) {
      const removed = this.undoStack.shift()!
      removed.dispose?.()
      this.undoSnapshotEntries.shift()
    }

    // 通知旁听者（动画系统）：一个真实操作已入历史，即一个「操作步」。
    // 放在空操作过滤与非事务判断之后，保证「只有真实变化才算一步」。
    this.emitPushed({ entry, before, after, fromTransaction })
  }

  /**
   * 通知记录旁听者（动画系统等）。
   * 调用方需保证 `before` / `after` 是一次**真实变化**，否则会凭空多出一个操作步。
   */
  private emitPushed(event: HistoryPushEvent): void {
    if (!this.onPushed) return
    try {
      this.onPushed(event)
    } catch (e) {
      console.warn('[HistoryManager] onPushed listener failed:', e)
    }
  }

  /**
   * 由**协作历史路径**显式触发的旁听通知（不写入本地历史栈）。
   *
   * 为什么需要它：协作房间内 `pause()` 会让本地 `push()` 直接返回，操作改为走
   * `CollabManager.appendHistoryEntry()`，而 `push` 恰好是动画录制器唯一的旁听挂点——
   * 若不在此显式通知，房间内任何人都录不到任何一步。
   *
   * @param event 与 push 旁听事件等价；调用方需在过滤空操作后传入
   */
  notifyExternalPush(event: HistoryPushEvent): void {
    this.emitPushed(event)
  }

  /**
   * 开始一个事务。事务期间所有 push 的命令会被合并为一个可撤销单元。
   */
  beginTransaction(label: string): void {
    if (this.isExecuting) return
    this.transactionDepth++
    if (this.transactionDepth === 1) {
      this.transactionLabel = label
      this.transactionEntries = []
    }
  }

  /**
   * 提交事务，将所有收集的命令合并为一个 CompositeEntry 入栈。
   */
  commitTransaction(): void {
    if (this.transactionDepth <= 0) return
    this.transactionDepth--
    if (this.transactionDepth === 0) {
      const entries = this.transactionEntries
      this.transactionEntries = []
      if (entries.length === 0) return
      if (entries.length === 1) {
        this.pushInternal(entries[0]!, true)
        return
      }
      const composite = new CompositeEntry(this.transactionLabel, entries)
      this.pushInternal(composite, true)
    }
  }

  /**
   * 回滚事务，撤销事务期间已执行的所有命令。
   */
  rollbackTransaction(): void {
    if (this.transactionDepth <= 0) return
    this.transactionDepth = 0
    const entries = this.transactionEntries
    this.transactionEntries = []
    for (let i = entries.length - 1; i >= 0; i--) {
      entries[i]!.undo()
    }
    if (this.autoSolveConstraints) {
      this.scene.solveDirtyConstraints()
      this.scene.markAllRenderDirty()
    }
    this.lastSceneSnapshot = exportScene(this.scene)
  }

  /**
   * 撤销最近一次操作。
   */
  undo(): void {
    if (this.undoStack.length === 0 || this.isExecuting) return
    this.isExecuting = true
    try {
      const entry = this.undoStack.pop()!
      const snapshotEntry = this.undoSnapshotEntries.pop()!
      entry.undo()
      this.redoStack.push(entry)
      this.redoSnapshotEntries.push(snapshotEntry)
      if (this.autoSolveConstraints) {
        this.scene.solveDirtyConstraints()
        this.scene.markAllRenderDirty()
      }
      this.lastSceneSnapshot = exportScene(this.scene)
      this.notifyNav('undo', entry)
    } finally {
      this.isExecuting = false
    }
  }

  /**
   * 重做最近一次撤销的操作。
   */
  redo(): void {
    if (this.redoStack.length === 0 || this.isExecuting) return
    this.isExecuting = true
    try {
      const entry = this.redoStack.pop()!
      const snapshotEntry = this.redoSnapshotEntries.pop()!
      entry.redo()
      this.undoStack.push(entry)
      this.undoSnapshotEntries.push(snapshotEntry)
      if (this.autoSolveConstraints) {
        this.scene.solveDirtyConstraints()
        this.scene.markAllRenderDirty()
      }
      this.lastSceneSnapshot = exportScene(this.scene)
      this.notifyNav('redo', entry)
    } finally {
      this.isExecuting = false
    }
  }

  /**
   * 清空所有历史记录。
   */
  clear(): void {
    this.undoStack.forEach((e) => e.dispose?.())
    this.redoStack.forEach((e) => e.dispose?.())
    this.undoStack = []
    this.redoStack = []
    this.undoSnapshotEntries = []
    this.redoSnapshotEntries = []
    this.transactionDepth = 0
    this.transactionEntries = []
    this.lastSceneSnapshot = exportScene(this.scene)
  }

  /**
   * 暂停历史记录。暂停期间 push 为空操作。
   * 用于协作模式下避免命令同时入栈本地 HistoryManager 和共享历史。
   */
  pause(): void {
    this.paused = true
  }

  /**
   * 恢复历史记录。push 恢复正常行为。
   */
  resume(): void {
    this.paused = false
  }

  /** 当前是否处于暂停状态 */
  get isPaused(): boolean {
    return this.paused
  }

  /**
   * 获取所有快照历史条目（undo + redo 部分），用于上传到共享历史。
   * 返回的数组按时间顺序排列，与共享历史格式兼容。
   * 同时返回当前 historyIndex（指向 undo 部分的最后一个条目）。
   */
  getSnapshotHistory(): { entries: SnapshotHistoryEntry[]; historyIndex: number } {
    const entries = [...this.undoSnapshotEntries, ...this.redoSnapshotEntries]
    const historyIndex = this.undoSnapshotEntries.length - 1
    return { entries, historyIndex }
  }

  /**
   * 从共享历史加载快照条目，替换当前本地历史。
   * 用于退出协作房间时，将共享历史保留到本地。
   *
   * @param entries 共享历史条目列表
   * @param historyIndex 当前历史指针位置（-1 表示无已应用条目）
   * @param baseIndex 初始基线（项目导入）索引；该条目只作为第一条可撤销条目的 before，
   *   不单独入栈，避免「导出房间后本地又能撤销掉项目导入」
   */
  loadFromSharedHistory(
    entries: SnapshotHistoryEntry[],
    historyIndex: number,
    baseIndex: number = -1,
  ): void {
    // 清空现有命令栈
    this.undoStack.forEach((e) => e.dispose?.())
    this.redoStack.forEach((e) => e.dispose?.())
    this.undoStack = []
    this.redoStack = []
    this.undoSnapshotEntries = []
    this.redoSnapshotEntries = []

    // 将共享历史条目拆分为 undo 和 redo 部分
    // entries[0..historyIndex] → 已应用（undo 栈），其中索引 <= baseIndex 的是不可撤销基线
    // entries[historyIndex+1..] → 已撤销（redo 栈）
    const firstUndoableIndex = Math.max(0, baseIndex + 1)
    for (let i = firstUndoableIndex; i <= historyIndex && i < entries.length; i++) {
      const e = entries[i]!
      const cmd = new SharedSnapshotEntry(e.label, e.before, e.after, this.scene)
      this.undoStack.push(cmd)
      this.undoSnapshotEntries.push(e)
    }
    // redo 栈：逆序存放（最近撤销的在栈顶）
    for (let i = entries.length - 1; i > historyIndex; i--) {
      const e = entries[i]!
      const cmd = new SharedSnapshotEntry(e.label, e.before, e.after, this.scene)
      this.redoStack.push(cmd)
      this.redoSnapshotEntries.push(e)
    }

    // 更新 lastSceneSnapshot
    if (historyIndex > baseIndex && historyIndex < entries.length) {
      this.lastSceneSnapshot = entries[historyIndex]!.after
    } else {
      this.lastSceneSnapshot = exportScene(this.scene)
    }

    this.transactionDepth = 0
    this.transactionEntries = []
  }

  /**
   * 不执行 undo/redo，仅获取当前栈顶条目的 label（用于 UI 显示）。
   */
  peekUndoLabel(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1]!.label : null
  }

  peekRedoLabel(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1]!.label : null
  }

  private clearRedoStack(): void {
    this.redoStack.forEach((e) => e.dispose?.())
    this.redoStack = []
    this.redoSnapshotEntries = []
  }
}

/**
 * 合并多个 HistoryEntry 为一个可撤销单元。
 */
class CompositeEntry implements HistoryEntry {
  readonly id: string
  readonly label: string
  readonly timestamp: number

  constructor(label: string, private commands: HistoryEntry[]) {
    this.id = genId('composite')
    this.label = label
    this.timestamp = Date.now()
  }

  redo(): void {
    this.commands.forEach((cmd) => cmd.redo())
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i]!.undo()
    }
  }

  dispose(): void {
    this.commands.forEach((cmd) => cmd.dispose?.())
  }
}

/**
 * 基于共享历史快照的 HistoryEntry。
 * 用于退出协作房间后，将共享历史条目转换为本地可撤销/重做的命令。
 */
class SharedSnapshotEntry implements HistoryEntry {
  readonly id: string
  readonly label: string
  readonly timestamp: number

  constructor(
    label: string,
    private before: SerializedScene,
    private after: SerializedScene,
    private scene: Scene,
  ) {
    this.id = genId('shared-snap')
    this.label = label
    this.timestamp = Date.now()
  }

  redo(): void {
    importScene(this.scene, this.after)
  }

  undo(): void {
    importScene(this.scene, this.before)
  }

  dispose(): void {
    // 释放快照引用
    this.before = null as unknown as SerializedScene
    this.after = null as unknown as SerializedScene
  }
}
