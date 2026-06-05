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
const SESSION_ALIVE_KEY = 'geomesh3d_session_alive'

/**
 * 临时场景（草稿）本地存储服务
 *
 * 关闭 vs 刷新 vs 意外关闭的区分机制：
 *
 * - sessionStorage 在刷新后保留，关闭标签页后清除
 * - beforeunload 时：保存草稿 + 设置 sessionStorage 标记
 * - unload 时：设置 localStorage graceful_exit 标记（用户确认离开）
 *
 * 页面加载时判断：
 * - sessionStorage 存在 → 刷新 → 弹出恢复提示
 * - sessionStorage 不存在 + graceful_exit 存在 → 用户主动关闭 → 清空草稿，不弹恢复
 * - sessionStorage 不存在 + graceful_exit 不存在 → 意外关闭 → 弹出恢复提示
 */
export const DraftStorageService = {
  /** 保存草稿到 localStorage（空场景不保存） */
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

  /** 将草稿数据导入场景 */
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

  /** beforeunload 时调用：保存草稿 + 标记会话存活 */
  onBeforeUnload(scene: Scene): void {
    this.saveDraft(scene)
    sessionStorage.setItem(SESSION_ALIVE_KEY, 'true')
  },

  /** unload 时调用：标记用户已确认离开（graceful exit） */
  onUnload(): void {
    localStorage.setItem(GRACEFUL_EXIT_KEY, Date.now().toString())
  },

  /**
   * 页面加载时的初始化逻辑
   * 返回是否需要弹出恢复提示
   */
  initOnLoad(): { needsRecovery: boolean } {
    const isRefresh = sessionStorage.getItem(SESSION_ALIVE_KEY) === 'true'
    const hasGracefulExit = localStorage.getItem(GRACEFUL_EXIT_KEY) !== null

    if (isRefresh) {
      // 刷新：弹出恢复提示
      return { needsRecovery: this.hasDraft() }
    }

    if (hasGracefulExit) {
      // 用户主动关闭了页面（经过了 beforeunload 确认）→ 清空草稿和标记
      this.clearDraft()
      localStorage.removeItem(GRACEFUL_EXIT_KEY)
      return { needsRecovery: false }
    }

    // 意外关闭（崩溃/断电/杀进程等）：弹出恢复提示
    return { needsRecovery: this.hasDraft() }
  },
}
