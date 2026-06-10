// src/core/editor/HistoryManager.ts
import type { Scene } from '../scene/Scene'
import { exportScene, importScene, type SerializedScene } from './SceneSerializer'

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
   * 记录一个操作到历史栈。
   * 如果当前在事务中，命令会被收集到事务缓冲区，不直接入栈。
   * 如果当前已暂停（协作模式），push 为空操作。
   */
  push(entry: HistoryEntry): void {
    if (this.isExecuting || this.paused) return

    if (this.transactionDepth > 0) {
      this.transactionEntries.push(entry)
      return
    }

    this.undoStack.push(entry)
    this.captureSnapshotForEntry(entry)
    this.clearRedoStack()

    while (this.undoStack.length > this.maxEntries) {
      const removed = this.undoStack.shift()!
      removed.dispose?.()
      this.undoSnapshotEntries.shift()
    }
  }

  /**
   * 为刚入栈的命令捕获快照对。
   * before = lastSceneSnapshot（命令执行前的场景状态）
   * after = exportScene(scene)（命令执行后的场景状态）
   */
  private captureSnapshotForEntry(entry: HistoryEntry): void {
    const after = exportScene(this.scene)
    const before = this.lastSceneSnapshot
    this.undoSnapshotEntries.push({ before, after, label: entry.label })
    this.lastSceneSnapshot = after
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
        this.push(entries[0]!)
        return
      }
      const composite = new CompositeEntry(this.transactionLabel, entries)
      this.push(composite)
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
   */
  loadFromSharedHistory(entries: SnapshotHistoryEntry[], historyIndex: number): void {
    // 清空现有命令栈
    this.undoStack.forEach((e) => e.dispose?.())
    this.redoStack.forEach((e) => e.dispose?.())
    this.undoStack = []
    this.redoStack = []
    this.undoSnapshotEntries = []
    this.redoSnapshotEntries = []

    // 将共享历史条目拆分为 undo 和 redo 部分
    // entries[0..historyIndex] → 已应用（undo 栈）
    // entries[historyIndex+1..] → 已撤销（redo 栈）
    for (let i = 0; i <= historyIndex && i < entries.length; i++) {
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
    if (historyIndex >= 0 && historyIndex < entries.length) {
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
