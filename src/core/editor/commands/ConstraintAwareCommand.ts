// src/core/editor/commands/ConstraintAwareCommand.ts
import type { Scene } from '../../scene/Scene'
import type { HistoryEntry } from '../HistoryManager'

const genId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 约束感知的命令基类。
 *
 * 与旧 Command 接口不同，此类要求子类在 doExecute/doUndo 中
 * 只负责状态变更，约束求解和渲染同步由 HistoryManager 统一处理。
 *
 * 子类需要通过 markAffectedPoints 标记受影响的点 ID，
 * 以便 undo/redo 后精确触发约束传播。
 */
export abstract class ConstraintAwareCommand implements HistoryEntry {
  readonly id = genId('cmd')
  abstract readonly label: string
  readonly timestamp = Date.now()

  /** 受影响的点 ID 集合，undo/redo 后会自动标记为脏 */
  private affectedPointIds: Set<string> = new Set()

  constructor(protected scene: Scene) {}

  /** 子类实现：执行操作的核心逻辑 */
  protected abstract doExecute(): void
  /** 子类实现：撤销操作的核心逻辑 */
  protected abstract doUndo(): void

  /**
   * 标记受影响的点 ID。
   * 子类在构造函数或 doExecute/doUndo 中调用，确保约束传播正确。
   */
  protected markAffected(...pointIds: string[]): void {
    for (const id of pointIds) {
      this.affectedPointIds.add(id)
    }
  }

  /** 批量标记受影响的点 ID */
  protected markAffectedPoints(pointIds: Iterable<string>): void {
    for (const id of pointIds) {
      this.affectedPointIds.add(id)
    }
  }

  redo(): void {
    this.doExecute()
    this.scene.invalidateRenderSyncCache()
    this.flushAffectedPoints()
  }

  undo(): void {
    this.doUndo()
    this.scene.invalidateRenderSyncCache()
    this.flushAffectedPoints()
  }

  /**
   * 将受影响的点标记为脏，触发约束传播。
   * HistoryManager 会在 undo/redo 后统一调用 solveDirtyConstraints()，
   * 所以这里只需要标记脏，不需要求解。
   */
  private flushAffectedPoints(): void {
    for (const pointId of this.affectedPointIds) {
      this.scene.markPointDirty(pointId)
    }
  }
}
