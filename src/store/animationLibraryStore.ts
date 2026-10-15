// src/store/animationLibraryStore.ts
// 动画库（云端私有录制段）的 UI 状态与动作编排：保存到库 / 导入播放 / 固化到本场景。
//
// 设计要点：
//  - 宿主上下文（当前项目 / 房间 id）与提示回调由 EditorView 注入（bindContextSource / bindNotify），
//    与广播的数据源注入模式一致 —— 本 store 不依赖路由与协作 store。
//  - 导入播放走「临时会话 + merge 播放」：段不写入本地文档、不参与自动保存；
//    固化则把段以 playbackMode='merge' 写入本地文档，随项目 / 草稿持久化（与内嵌段同权）。
//  - payload 按「itemId:updatedAt」缓存本会话内的详情，重复导入 / 重播不重复拉取。
//  - 库段一律按合并模式播放（跨场景语义）：无论从哪个宿主导入，
//    只有录制范围内的几何叠加进当前场景，主场景原有对象全程保留。

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { animationLibraryApi, type AnimationLibraryItem } from '@/api/animationLibrary'
import {
  deserializeRecordingSession,
  serializeRecordingSession,
} from '@/core/animation/AnimationSerializer'
import type { RecordingSession } from '@/core/animation/types'
import { useAnimationStore } from './animationStore'

/** 提示回调（由 EditorView 注入 toast；缺省静默） */
type NotifyFn = (message: string, kind: 'ok' | 'error') => void

/** 宿主上下文来源（EditorView 注入） */
interface ContextSource {
  getProjectId: () => string | null
  getRoomId: () => string | null
}

/** 列表筛选口径 */
export type LibraryFilter = 'all' | 'project' | 'unbound'

export const useAnimationLibraryStore = defineStore('animationLibrary', () => {
  // ───────── 状态 ─────────
  const items = ref<AnimationLibraryItem[]>([])
  const loading = ref(false)
  const dialogOpen = ref(false)
  const filter = ref<LibraryFilter>('all')
  /** 正在执行导入 / 固化的条目 id（按钮禁用态） */
  const busyItemId = ref<string | null>(null)
  /** 正在上传的段 id（Timeline 下拉保存按钮禁用态） */
  const savingSessionId = ref<string | null>(null)

  const contextSource = ref<ContextSource | null>(null)
  const notifyRef = ref<NotifyFn | null>(null)
  /** 详情缓存：key = itemId:updatedAt */
  const payloadCache = new Map<string, RecordingSession>()

  // ───────── 派生 ─────────
  const currentProjectId = computed(() => contextSource.value?.getProjectId() ?? null)
  const currentRoomId = computed(() => contextSource.value?.getRoomId() ?? null)

  /** 已在库的录制段 id 集合（来自列表；用于会话下拉里禁用「保存到动画库」按钮） */
  const savedSessionIds = computed(() => {
    const set = new Set<string>()
    for (const item of items.value) {
      if (item.sessionId) set.add(item.sessionId)
    }
    return set
  })

  /** 已过滤列表（前端过滤；每用户段数上限有限，数据量小） */
  const filteredItems = computed(() => {
    const list = items.value
    if (filter.value === 'all') return list
    if (filter.value === 'project') {
      const projectId = currentProjectId.value
      return projectId ? list.filter((item) => item.projectId === projectId) : []
    }
    return list.filter((item) => !item.projectId && !item.roomId)
  })

  // ───────── 绑定 ─────────
  function bindContextSource(source: ContextSource): void {
    contextSource.value = source
  }
  function unbindContextSource(): void {
    contextSource.value = null
  }
  function bindNotify(fn: NotifyFn): void {
    notifyRef.value = fn
  }

  const notify = (message: string, kind: 'ok' | 'error' = 'ok') => {
    notifyRef.value?.(message, kind)
  }

  // ───────── 列表 ─────────
  async function refresh(): Promise<void> {
    loading.value = true
    try {
      items.value = await animationLibraryApi.list()
    } catch (err) {
      notify(readableError(err, '加载动画库失败'), 'error')
    } finally {
      loading.value = false
    }
  }

  /**
   * 静默预载列表：供编辑器挂载时调用 —— 让 Timeline 的「已在动画库」按钮状态
   * 从一开始就准确（其禁用依据是 savedSessionIds，来自本列表）。
   * 失败不打扰：预载失败不影响任何主流程，打开弹窗时仍会正常刷新并提示。
   */
  async function silentRefresh(): Promise<void> {
    try {
      items.value = await animationLibraryApi.list()
    } catch {
      // 静默：预载失败（未登录 / 网络异常）不弹提示
    }
  }

  function openDialog(): void {
    dialogOpen.value = true
    filter.value = 'all'
    void refresh()
  }

  function closeDialog(): void {
    dialogOpen.value = false
  }

  // ───────── 详情（带缓存） ─────────
  async function fetchSession(item: AnimationLibraryItem): Promise<RecordingSession | null> {
    const cacheKey = `${item.id}:${item.updatedAt ?? ''}`
    const cached = payloadCache.get(cacheKey)
    if (cached) return cached

    const detail = await animationLibraryApi.detail(item.id)
    const session = detail.payload ? deserializeRecordingSession(detail.payload) : null
    if (!session) {
      notify('该录制段数据不合法，无法使用', 'error')
      return null
    }
    // 库段从任何宿主播放都是跨场景语义 —— 统一标记合并模式
    session.playbackMode = 'merge'
    payloadCache.set(cacheKey, session)
    return session
  }

  // ───────── 动作：保存到库 ─────────
  async function saveSession(session: RecordingSession): Promise<boolean> {
    if (savingSessionId.value) return false
    savingSessionId.value = session.id
    try {
      await animationLibraryApi.create({
        name: session.name,
        color: session.color,
        projectId: currentProjectId.value,
        roomId: currentRoomId.value,
        payload: serializeRecordingSession(session),
      })
      notify(`「${session.name}」已保存到动画库`)
      // 刷新列表：更新 savedSessionIds，让该段按钮立即变为「已在动画库」
      void refresh()
      return true
    } catch (err) {
      notify(readableError(err, '保存到动画库失败'), 'error')
      return false
    } finally {
      savingSessionId.value = null
    }
  }

  // ───────── 动作：导入播放（只读，不落痕） ─────────
  async function importPlay(item: AnimationLibraryItem): Promise<void> {
    if (busyItemId.value) return
    busyItemId.value = item.id
    try {
      const session = await fetchSession(item)
      if (!session) return
      const animationStore = useAnimationStore()
      // 播放与录制互斥：正在录制则先封存（已录内容保留），与广播路径行为一致
      if (animationStore.isRecording) animationStore.stopRecording()
      // 临时会话：不写入本地文档，避免随自动保存污染当前项目 / 房间
      animationStore.setTransientSession(session)
      const started = animationStore.enterPlayback(session.id)
      if (!started) {
        notify('无法播放该录制段', 'error')
        return
      }
      closeDialog()
      notify(`正在播放「${item.name}」—— 场景原样保留，退出播放即可继续编辑`)
    } catch (err) {
      notify(readableError(err, '导入播放失败'), 'error')
    } finally {
      busyItemId.value = null
    }
  }

  // ───────── 动作：固化（导入并保存到本场景） ─────────
  async function solidify(item: AnimationLibraryItem): Promise<void> {
    if (busyItemId.value) return
    busyItemId.value = item.id
    try {
      const session = await fetchSession(item)
      if (!session) return
      const animationStore = useAnimationStore()
      // 写入本地文档用副本，避免后续对该段重命名等操作影响缓存对象
      const prepared: RecordingSession = { ...session }
      // 重名处理：同名段加「（导入）」后缀，便于在下拉里区分
      const names = new Set(animationStore.document.sessions.map((s) => s.name))
      if (names.has(prepared.name)) prepared.name = `${prepared.name}（导入）`

      const added = animationStore.mergeSessions([prepared])
      if (added === 0) {
        notify('该段已在本场景中，无需重复导入', 'error')
        return
      }
      animationStore.setActiveSession(prepared.id)
      closeDialog()
      notify(`「${prepared.name}」已保存到本场景，可随时播放`)
    } catch (err) {
      notify(readableError(err, '保存到本场景失败'), 'error')
    } finally {
      busyItemId.value = null
    }
  }

  // ───────── 动作：重命名 / 删除 ─────────
  async function rename(item: AnimationLibraryItem, name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || trimmed === item.name) return
    try {
      await animationLibraryApi.rename(item.id, trimmed)
      item.name = trimmed
      notify('已重命名')
    } catch (err) {
      notify(readableError(err, '重命名失败'), 'error')
    }
  }

  async function remove(item: AnimationLibraryItem): Promise<void> {
    try {
      await animationLibraryApi.remove(item.id)
      items.value = items.value.filter((i) => i.id !== item.id)
      notify(`已删除「${item.name}」`)
    } catch (err) {
      notify(readableError(err, '删除失败'), 'error')
    }
  }

  return {
    // 状态
    items,
    loading,
    dialogOpen,
    filter,
    busyItemId,
    savingSessionId,
    // 派生
    currentProjectId,
    currentRoomId,
    filteredItems,
    savedSessionIds,
    // 绑定
    bindContextSource,
    unbindContextSource,
    bindNotify,
    // 列表
    openDialog,
    closeDialog,
    refresh,
    silentRefresh,
    // 动作
    saveSession,
    importPlay,
    solidify,
    rename,
    remove,
  }
})

/** 把 ApiError 转成对用户可读的提示（服务端 message 已中文化，优先透传） */
function readableError(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message
  ) {
    return (err as { message: string }).message
  }
  return fallback
}
