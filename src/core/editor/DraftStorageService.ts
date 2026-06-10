import {
  exportScene,
  importScene,
  isSceneEmpty,
  isSerializedSceneEmpty,
  validateSerializedScene,
  type SerializedScene,
} from './SceneSerializer'
import type { Scene } from '../scene/Scene'

const DRAFT_KEY = 'geomesh3d_draft'
const GRACEFUL_EXIT_KEY = 'geomesh3d_graceful_exit'

/**
 * 临时场景（草稿）本地存储服务
 *
 * 设计目标：浏览器异常关闭（崩溃/杀进程/断电等）后，能可靠恢复用户未保存的场景数据。
 *
 * 保存时机（多层防御）：
 *   1. 自动保存：场景变化时 debounce 保存（EditorView watcher 触发）
 *   2. 定期保存：每 30 秒强制保存一次（安全网，防止 watcher 遗漏）
 *   3. 页面隐藏保存：visibilitychange → hidden 时保存（覆盖移动端场景）
 *   4. 离开前保存：beforeunload 时同步保存（确保数据持久化）
 *
 * 正常关闭 vs 异常关闭的区分：
 *
 *   - beforeunload 时：保存草稿（同步写入 localStorage）
 *   - pagehide 时：设置 graceful_exit 标记（用户确认离开/刷新）
 *
 *   pagehide 比 unload 更可靠：
 *   - Chrome 118+ 正在淘汰 unload 事件
 *   - pagehide 支持 BFCache，不会阻止页面进入缓存
 *   - pagehide 在页面实际卸载时触发，而 unload 在 BFCache 场景下可能不触发
 *
 * 页面加载时判断：
 *   - graceful_exit 存在 → 用户主动离开/刷新 → 清空草稿，不弹恢复
 *   - graceful_exit 不存在 → 异常关闭（崩溃/杀进程/断电等）→ 弹出恢复提示
 */
export const DraftStorageService = {
  /** 保存草稿到 localStorage（空场景不保存，并清除旧草稿） */
  saveDraft(scene: Scene): void {
    if (isSceneEmpty(scene)) {
      localStorage.removeItem(DRAFT_KEY)
      return
    }
    const data = exportScene(scene)
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
  },

  /** 从 localStorage 加载草稿数据（不导入场景，仅返回数据） */
  loadDraftData(): SerializedScene | null {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    try {
      const data = JSON.parse(raw)
      const { valid } = validateSerializedScene(data)
      if (!valid) return null
      if (isSerializedSceneEmpty(data as SerializedScene)) return null
      return data as SerializedScene
    } catch {
      return null
    }
  },

  /** 将草稿数据导入场景（含约束求解和渲染标记） */
  restoreDraft(scene: Scene, data: SerializedScene): void {
    importScene(scene, data)
    scene.solveDirtyConstraints()
    scene.markAllRenderDirty()
  },

  /** 清空 localStorage 中的草稿数据 */
  clearDraft(): void {
    localStorage.removeItem(DRAFT_KEY)
  },

  /** 检查是否存在可恢复的草稿 */
  hasDraft(): boolean {
    return this.loadDraftData() !== null
  },

  /**
   * beforeunload 时调用：
   * 1. 同步保存当前场景为草稿（确保数据持久化）
   * 2. 不设置 graceful_exit（由 pagehide 负责）
   *
   * 注意：beforeunload 在崩溃/杀进程时不触发，这正是我们期望的——
   * 没有 graceful_exit 标记意味着异常关闭，下次加载时弹出恢复提示。
   */
  onBeforeUnload(scene: Scene): void {
    this.saveDraft(scene)
  },

  /**
   * pagehide 时调用（替代 unload，更可靠）：
   * 标记 graceful exit，下次加载时据此判断为主动离开，清空草稿不弹恢复。
   */
  onPageHide(): void {
    localStorage.setItem(GRACEFUL_EXIT_KEY, Date.now().toString())
  },

  /**
   * visibilitychange → hidden 时调用：
   * 保存草稿作为安全网，但不标记 graceful exit（用户可能回来）。
   *
   * 适用场景：
   * - 移动端切换 App（beforeunload 可能不触发）
   * - 桌面端最小化浏览器
   * - 标签页切换到后台
   */
  onVisibilityHidden(scene: Scene): void {
    this.saveDraft(scene)
  },

  /**
   * 页面加载时的初始化逻辑
   * 返回是否需要弹出恢复提示
   *
   * 判断逻辑：
   * - graceful_exit 存在 → 用户主动离开/刷新 → 清空草稿，不弹恢复
   * - graceful_exit 不存在 + 草稿存在 → 异常关闭 → 弹出恢复提示
   * - graceful_exit 不存在 + 草稿不存在 → 无数据可恢复 → 不弹恢复
   */
  initOnLoad(): { needsRecovery: boolean } {
    const hasGracefulExit = localStorage.getItem(GRACEFUL_EXIT_KEY) !== null

    // 清理标记（graceful_exit 只需读取一次）
    localStorage.removeItem(GRACEFUL_EXIT_KEY)

    if (hasGracefulExit) {
      // 主动离开/刷新 → 清空草稿，不弹恢复
      this.clearDraft()
      return { needsRecovery: false }
    }

    // 异常关闭（无 graceful_exit 标记）→ 有草稿则弹出恢复提示
    return { needsRecovery: this.hasDraft() }
  },
}
