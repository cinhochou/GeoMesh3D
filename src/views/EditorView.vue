<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import * as THREE from 'three'

import Toolbar from '../components/Toolbar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/TimeLine.vue'
import InputDialog from '../components/InputDialog.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import NewProjectDialog from '../components/NewProjectDialog.vue'
import EditProjectDialog from '../components/EditProjectDialog.vue'
import CollabHistoryBox from '../components/CollabHistoryBox.vue'
import type { CollabHistoryMessage } from '@/types/collabHistory'
import type { CollabOperationIntent } from '@/types/collabIntent'

import { EditorMode } from '../core/editor/Editor'
import type { Command } from '../core/editor/Command'
import type { HistoryEntry } from '../core/editor/HistoryManager'
import type { Point3 } from '../core/geometry/Point3'
import { Vec3 } from '../core/geometry/Vec3'
import type { ObjectConstrainedPointConstraint } from '../core/constraints/ObjectConstrainedPointConstraint'
import { getEditorSession, resetEditorSession } from '../core/editor/editorSession'
import {
  createEmptySerializedScene,
  downloadSceneAsJson,
  openJsonFileForImport,
  validateSerializedScene,
  exportScene,
  importScene,
  isSceneEmpty,
  isSerializedSceneEmpty,
  type SerializedScene,
} from '../core/editor/SceneSerializer'
import { Scene } from '../core/scene/Scene'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { CollabManager, type DragLockTarget, type RemoteDragState } from '../core/collab/CollabManager'
import SolverSchedulerWorker from '../core/perf/solverScheduler.worker?worker'
import { useUiStore, type AppSettings } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'
import { useCollabStore } from '@/store/collabStore'
import { useAuthStore } from '@/store/authStore'
import { projectApi } from '@/api/project'
import { ApiError } from '@/api/client'
import { DraftStorageService } from '@/core/editor/DraftStorageService'
import { useOrientationLock } from '@/composables/useOrientationLock'
import { useSessionGuard } from '@/composables/useSessionGuard'
import { crossTabLoginEvents, type CrossTabLoginEvent } from '@/utils/sessionEvents'
import { collabRoomEvents, type CollabRoomEvent } from '@/utils/collabRoomEvents'
import type { Room } from '@/types/room'
import { roomApi } from '@/api/room'

const viewportRef = ref<HTMLDivElement | null>(null)
const editorBodyRef = ref<HTMLDivElement | null>(null)
const sidebarShellRef = ref<HTMLDivElement | null>(null)
const route = useRoute()
const router = useRouter()
const uiStore = useUiStore()
const sceneStore = useSceneStore()
const collabStore = useCollabStore()
const authStore = useAuthStore()

// 会话失效善后：useSessionGuard 在 onInvalidated 回调中处理保存、断连、跳转等清理。
// 重登成功后 store.clearSessionInvalidation() 会自动复位。
useSessionGuard({
  onInvalidated: (reason) => {
    void handleSessionInvalidated(reason)
  },
})

// 会话失效后的善后流程：best-effort 保存（S2/S4）→ 断开 Yjs 协作 → 重置场景 → 跳登录
// S1（用户主动退出）的保存由 Toolbar.handleLogout → editor:save-and-close 事件统一处理，
// 这里只负责会话失效后真正需要做的清理；不去重登成功后登录页根据 redirect 回到当前项目
const handleSessionInvalidated = async (reason: string) => {
  // 临时编辑器（无项目 ID）场景：
  //   - 用户是否登录不影响此页面状态（编辑器本身允许未登录访问）
  //   - 临时场景数据已由 DraftStorageService 自动保存到 localStorage
  //   - authStore.logout() 已经在外部清完本地用户态
  // 因此不需要任何额外的"保存/断开协作/重定向"流程：
  //   - 不弹占位遮罩（避免用户被卡在"会话已失效"上）
  //   - 不调用 server 保存接口（没项目可保存）
  //   - 不跳转登录页（留在临时编辑器即可，草稿不会丢）
  if (!currentProjectId.value) {
    return
  }

  // 1) S2（其他 Tab 退出）/ S4（refresh 失败）的最后保存窗口：
  //   - S2/S4 路径上 Toolbar.handleExternalSaveAndClose 没机会被触发，所以这里是唯一一次兜底
  //   - 项目场景走 3s 去抖动的 auto-save（见 triggerAutoSave），最后一次操作和会话失效之间的
  //     < 3s 窗口由这里的 saveScene 兜住
  //   - S1（'manual'）时 Toolbar 已经走完 saveProjectIfChangedAndClose，跳过避免重复保存
  //   - S2（'other_tab'）时 token 已被其他 Tab 清除，saveScene 必然 401，跳过避免控制台报错
  if (reason === 'refresh_failed') {
    try {
      const sceneData = exportScene(scene)
      const sceneJson = JSON.stringify(sceneData)
      await projectApi.saveScene(currentProjectId.value, {
        sceneData: sceneJson,
      })
    } catch {
      // 保存失败不影响后续清理
    }
  }

  // 2) 断开 Yjs 协作连接（不做权限校验）
  try {
    collabStore.leave()
  } catch {
    // ignore
  }

  // 3) 清理自动保存
  // 不清 DraftStorageService 的本地草稿：项目场景只走服务端，草稿字段对项目来说永远是 no-op；
  // 对临时编辑器（有项目 id 才走到这里）也不会写入草稿。保持空操作避免无谓的 localStorage 写入。
  stopAutoSave()

  // 4) 重置场景与 undo/redo
  resetEditorSession()
  // resetEditorSession 已通过 HistoryManager.clear() 清空历史栈
  // 如果在协作模式中被失效，需要恢复 HistoryManager 的暂停状态
  if (editor.historyManager.isPaused) {
    editor.historyManager.resume()
  }
  updateLocalHistoryUI()
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)
  // 5) 最后清 currentProjectId / 跳登录页
  const redirect = route.fullPath
  router.replace({
    path: '/login',
    query: { reason: 'expired', redirect },
  })
  currentProjectId.value = null
  currentProjectName.value = ''
}
const {
  fps,
  axisGridSize,
  isGridVisible,
  isCoordinateSystemVisible,
  isGlobalPointValueMode,
  isSnappingEnabled,
  isARMode,
  lastModeBeforeAR,
  lastModeBeforeCoordinateOff,
  isTouchDevice,
  toastMessage,
  toastVisible,
  toastScope,
  mergePointDialog,
  alignPointsDialog,
  regularPolygonDialog,
  normalCircleRadiusDialog,
  radiusSphereDialog,
  coneRadiusDialog,
  cylinderRadiusDialog,
  appSettings,
} = storeToRefs(uiStore)
const {
  latencyMs: collabLatencyMs,
  status: collabStatus,
  joinDialog: collabJoinDialog,
} = storeToRefs(collabStore)
const { user } = storeToRefs(authStore)

const { needsRotateToTarget: isPortraitOnPhone } = useOrientationLock('landscape')

const {
  scene,
  editor,
  originalExecuteCommand,
  originalExecuteHistoryEntry,
  originalUndo,
  originalRedo,
  originalBeginTransaction,
  originalCommitTransaction,
  originalBeginCollabTransaction,
  originalCommitCollabTransaction,
} = getEditorSession()

let renderer: ThreeRenderer
let interaction: Interaction
let animationFrameId: number | null = null
let solverWorker: Worker | null = null
let scheduleSolverFlush = () => {}
let detachSolverListener = () => {}
let solverFlushRequested = false
let solverFlushReady = false

const collabManager = ref<CollabManager | null>(null)

// 外部触发打开"创建协作"对话框（房间列表"创建房间"跳转时置为 1）
const collabCreateTrigger = ref(0)

/** 协作事务：将多个 executeCommand 调用合并为一条共享历史记录 */
let collabTransactionDepth = 0
let collabTransactionBefore: SerializedScene | null = null
let collabTransactionLabel = ''

let lastFpsTime = performance.now()
let frameCount = 0
const sidebarWidth = ref<number | null>(null)
const sidebarMinWidth = ref(200)
const isDraggingSidebarWidth = ref(false)
const isSidebarResizeEnabled = ref(true)
let sidebarResizeRafId: number | null = null
let sidebarPreviewResizeRafId: number | null = null
let viewportResizeObserver: ResizeObserver | null = null

// 提示框相关的响应式变量
let toastTimer: number | null = null
const sharedRotationOwnerNotice = ref('')

// 协作拖拽感知：房间内所有用户（含自己）正在拖拽的几何元素（用于渲染"xxx正在操作..."气泡）
const dragAwarenessLayerRef = ref<HTMLElement | null>(null)
const activeDrags = ref<RemoteDragState[]>([])
// 气泡位于元素屏幕坐标右侧的间距（px）
const DRAG_BUBBLE_GAP_PX = 18

// 协作历史消息（UI 骨架阶段为空数组；消息机制后续讨论后落实）
const collabHistoryMessages = ref<CollabHistoryMessage[]>([])

const newProjectDialogVisible = ref(false)
const currentProjectId = ref<string | null>(null)
const currentProjectName = ref('')
const isCreatingProject = ref(false)
const lastSavedSceneJson = ref<string | null>(null)

// 协作仅观看模式：当前用户在协作房间中角色为 viewer 时，禁止编辑操作
const isViewOnlyCollab = computed(
  () => !!collabStore.currentRoom && collabStore.currentRoom.myRole === 'viewer',
)

// 协作房间权限（实时响应 currentRoom 变化）：创建者可在房间列表配置这些限制，
// 协作中所有成员的对应操作会被实时禁用。非协作模式下均为 false。
const collabDisableExport = computed(() => !!collabStore.currentRoom?.disableExport)
const collabDisableImport = computed(() => !!collabStore.currentRoom?.disableImport)
const collabDisableClear = computed(() => !!collabStore.currentRoom?.disableClear)
const collabDisableUndoRedo = computed(
  () => !!collabStore.currentRoom?.disableUndoRedo && collabStore.currentRoom?.myRole !== 'creator',
)

// 权限变化时实时同步到 Interaction（viewer 不能拖拽/创建/删除，但可选中浏览）
watch(isViewOnlyCollab, (viewOnly) => {
  interaction?.setViewOnly(viewOnly)
})

// 草稿自动保存与意外关闭恢复
const draftRecoveryVisible = ref(false)
let autoSaveTimer: number | null = null
let periodicSaveTimer: number | null = null
const AUTO_SAVE_DEBOUNCE = 3_000
const PERIODIC_SAVE_INTERVAL = 30_000

const sceneToJsonForCompare = (data: SerializedScene): string => {
  const copy = { ...data }
  if (copy.metadata) {
    copy.metadata = { ...copy.metadata }
    delete (copy.metadata as Record<string, unknown>).exportedAt
  }
  return JSON.stringify(copy)
}
const editProjectDialogVisible = ref(false)
const editProjectName = ref('')
const editProjectDescription = ref('')
const editProjectIsPublic = ref(true)

const captureThumbnailAsync = async (): Promise<Blob | null> => {
  try {
    const canvas = renderer?.renderer?.domElement
    if (!canvas) return null
    const tempCanvas = document.createElement('canvas')
    const size = 1024
    tempCanvas.width = size
    tempCanvas.height = size
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null
    const srcW = canvas.width
    const srcH = canvas.height
    const minDim = Math.min(srcW, srcH)
    const sx = (srcW - minDim) / 2
    const sy = (srcH - minDim) / 2
    ctx.drawImage(canvas, sx, sy, minDim, minDim, 0, 0, size, size)
    return new Promise<Blob | null>((resolve) => {
      tempCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.7)
    })
  } catch {
    return null
  }
}

// 帧率限制相关变量：记录上一次渲染时间点，用于控制最大帧率
let lastRenderTime = 0

const handleResize = () => {
  syncSidebarResizeMode()
  syncSidebarWidthBounds()
  scheduleViewportResize()
}

const scheduleViewportResize = () => {
  if (!renderer || sidebarResizeRafId !== null) return
  sidebarResizeRafId = window.requestAnimationFrame(() => {
    sidebarResizeRafId = null
    renderer.onResize()
  })
}

const scheduleViewportPreviewResize = () => {
  if (!renderer || sidebarPreviewResizeRafId !== null) return
  sidebarPreviewResizeRafId = window.requestAnimationFrame(() => {
    sidebarPreviewResizeRafId = null
    renderer.syncContainerAspect()
  })
}

const getDefaultSidebarWidth = () => {
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
  return Math.min(Math.max(viewportWidth * 0.21, 200), 280)
}

const getSidebarMaxWidth = () => {
  const containerWidth = editorBodyRef.value?.clientWidth ?? window.innerWidth
  return Math.max(sidebarMinWidth.value, Math.floor(containerWidth / 2))
}

const clampSidebarWidth = (nextWidth: number) => {
  return Math.min(Math.max(nextWidth, sidebarMinWidth.value), getSidebarMaxWidth())
}

const syncSidebarResizeMode = () => {
  isSidebarResizeEnabled.value = true
}

const syncSidebarWidthBounds = () => {
  const nextMinWidth = Math.round(getDefaultSidebarWidth())
  const previousMinWidth = sidebarMinWidth.value
  sidebarMinWidth.value = nextMinWidth
  if (!sidebarWidth.value || !isSidebarResizeEnabled.value) return

  const shouldTrackDefaultWidth =
    Math.abs(sidebarWidth.value - previousMinWidth) <= 1 || sidebarWidth.value < nextMinWidth
  const clamped = clampSidebarWidth(sidebarWidth.value)
  const nextWidth = shouldTrackDefaultWidth ? nextMinWidth : clamped
  if (nextWidth !== sidebarWidth.value) {
    sidebarWidth.value = nextWidth
  }
}

const handleSidebarWidthDrag = (event: PointerEvent) => {
  if (!isDraggingSidebarWidth.value || !isSidebarResizeEnabled.value) return
  event.preventDefault()
  const containerBounds = editorBodyRef.value?.getBoundingClientRect()
  if (!containerBounds) return
  sidebarWidth.value = clampSidebarWidth(event.clientX - containerBounds.left)
  scheduleViewportPreviewResize()
}

const stopSidebarWidthDrag = () => {
  if (isDraggingSidebarWidth.value) {
    scheduleViewportResize()
  }
  isDraggingSidebarWidth.value = false
  document.body.classList.remove('sidebar-width-resizing')
}

const startSidebarWidthDrag = (event: PointerEvent) => {
  if (!isSidebarResizeEnabled.value) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  isDraggingSidebarWidth.value = true
  document.body.classList.add('sidebar-width-resizing')
  handleSidebarWidthDrag(event)
}

const sidebarShellStyle = computed(() => {
  if (!sidebarWidth.value || !isSidebarResizeEnabled.value) return undefined
  const width = `${sidebarWidth.value}px`
  return {
    width,
    minWidth: width,
    maxWidth: width,
    flex: `0 0 ${width}`,
  }
})

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    target.tagName === 'SELECT'
  )
}

/**
 * 处理设置实时预览事件
 * 仅将 pixelRatioScale 与 fpsCap 的变更应用到 renderer，
 * antialias 与 powerPreference 的变更需要刷新页面才能生效，不在预览中处理
 */
const handlePreviewSettings = (e: Event) => {
  const detail = (e as CustomEvent).detail as AppSettings
  if (!renderer) return
  const changes: Partial<AppSettings> = {}
  if (detail.pixelRatioScale !== appSettings.value.pixelRatioScale) {
    changes.pixelRatioScale = detail.pixelRatioScale
  }
  if (detail.fpsCap !== appSettings.value.fpsCap) {
    changes.fpsCap = detail.fpsCap
  }
  if (detail.depthOcclusion !== appSettings.value.depthOcclusion) {
    changes.depthOcclusion = detail.depthOcclusion
  }
  if (detail.hiddenEdge !== appSettings.value.hiddenEdge) {
    changes.hiddenEdge = detail.hiddenEdge
  }
  if (Object.keys(changes).length > 0) {
    renderer.applySettings(changes)
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (isEditableTarget(e.target)) return

  const modKey = e.ctrlKey || e.metaKey
  if (!modKey) return

  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) {
    if (collabDisableUndoRedo.value) return
    e.preventDefault()
    editor.undo()
    return
  }

  if (key === 'y' || (key === 'z' && e.shiftKey)) {
    if (collabDisableUndoRedo.value) return
    e.preventDefault()
    editor.redo()
  }
}

// ---- 草稿自动保存与意外关闭恢复 ----

/** 自动保存：根据设置和项目状态决定保存行为 */
const autoSave = async () => {
  // Yjs 负责房间内实时同步，但项目列表读取的是项目表的 scene_data；
  // 因此协作房间仍需由可编辑成员把当前共享场景定期落库。
  // 观看者不能覆盖项目数据。
  if (isViewOnlyCollab.value) return
  if (currentProjectId.value) {
    // 普通项目遵循用户的自动保存设置；协作房间必须落库，保证项目列表
    // 与房间共享数据一致，不受个人设置开关影响。
    if (!collabStore.currentRoom && !appSettings.value.autoSaveProject) return
    try {
      const sceneData = exportScene(scene)
      const compareJson = sceneToJsonForCompare(sceneData)
      if (lastSavedSceneJson.value !== null && compareJson === lastSavedSceneJson.value) return
      // 生成缩略图并上传（canvas+toBlob 开销大，仅在非协作模式执行）
      let thumbnailUrl: string | undefined
      const thumbnailBlob = await captureThumbnailAsync()
      if (thumbnailBlob) {
        try {
          thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob, currentProjectId.value)
        } catch {
          thumbnailUrl = undefined
        }
      }
      await projectApi.saveScene(currentProjectId.value, {
        sceneData: JSON.stringify(sceneData),
        thumbnailUrl,
      })
      lastSavedSceneJson.value = compareJson
    } catch {
      // 自动保存失败时静默处理，不打扰用户
    }
  } else {
    // 无项目：根据 draftProtection 设置决定是否保存草稿到 localStorage
    if (!appSettings.value.draftProtection) return
    DraftStorageService.saveDraft(scene)
  }
}

/** 场景有改动时调用，debounce 后执行自动保存 */
const scheduleAutoSave = () => {
  // 协作房间也需要把 Yjs 合并后的场景落到关联项目，使用同一去抖策略。
  if (isViewOnlyCollab.value) return
  // 两个开关都关闭时不需要调度
  if (!currentProjectId.value && !appSettings.value.draftProtection) return
  if (currentProjectId.value && !collabStore.currentRoom && !appSettings.value.autoSaveProject)
    return
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
  }
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    autoSave()
  }, AUTO_SAVE_DEBOUNCE)
}

/** 停止自动保存定时器 */
const stopAutoSave = () => {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
  }
}

/** 启动定期强制保存（安全网，防止 watcher 遗漏） */
const startPeriodicSave = () => {
  stopPeriodicSave()
  periodicSaveTimer = window.setInterval(() => {
    autoSave()
  }, PERIODIC_SAVE_INTERVAL)
}

/** 停止定期强制保存 */
const stopPeriodicSave = () => {
  if (periodicSaveTimer !== null) {
    clearInterval(periodicSaveTimer)
    periodicSaveTimer = null
  }
}

/**
 * beforeunload 处理：
 * - draftProtection 开启时：同步保存草稿 + 弹确认框
 * - draftProtection 关闭时：不保存、不弹框
 * - 协作状态清理在 handlePageHide 中执行（不阻塞页面关闭）
 */
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  const inCollab = !!collabStore.currentRoom
  // 协作模式下提醒用户刷新/关闭会导致协作中断
  if (inCollab) {
    e.preventDefault()
    return
  }
  if (!currentProjectId.value && appSettings.value.draftProtection) {
    DraftStorageService.onBeforeUnload(scene)
    if (!isSceneEmpty(scene)) {
      e.preventDefault()
    }
  }
}

/**
 * pagehide 处理（替代 unload，更可靠）：
 * 标记 graceful exit，下次加载时据此清空草稿不弹恢复。
 * 同时保存草稿作为最后保障。
 */
const handlePageHide = () => {
  // 页面异常关闭/浏览器崩溃不能伪装成用户主动离开：保留服务端成员关系，
  // 连接恢复后由 onStatusUpdate 直接执行退出协作流程，清理本地残留。
  const roomId = collabStore.currentRoom?.id || collabManager.value?.getStatus().room || ''
  if (roomId) {
    setActiveRoom(null)
  }
  // 协作模式下不保存草稿：场景内容已在服务端，避免同步序列化阻塞页面关闭
  const inCollab = !!collabStore.currentRoom
  if (
    !inCollab &&
    !currentProjectId.value &&
    appSettings.value.draftProtection &&
    !isSceneEmpty(scene)
  ) {
    DraftStorageService.saveDraft(scene)
    DraftStorageService.onPageHide()
  }
}

/**
 * visibilitychange 处理：
 * 页面变为 hidden 时保存草稿（安全网，覆盖移动端场景）。
 * 不标记 graceful exit（用户可能回来）。
 */
const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    // 协作模式下不做草稿保存：场景数据已通过 Yjs 实时同步到服务端
    if (!collabStore.currentRoom && !currentProjectId.value && appSettings.value.draftProtection) {
      DraftStorageService.onVisibilityHidden(scene)
    }
  }
}

/** 用户点击恢复草稿 */
const handleDraftRecoveryConfirm = () => {
  const data = DraftStorageService.loadDraftData()
  if (data) {
    DraftStorageService.restoreDraft(scene, data)
    sceneStore.syncEditorState(editor)
    sceneStore.syncSceneState(scene)
    // 恢复后重置内容区为默认收起状态，并同步折叠/展开按钮状态
    uiStore.setContentGroupsCollapsed(true)
    // 恢复后清空历史栈（恢复的场景是"新起点"，不应能撤销到空场景）
    editor.clearHistory()
  }
  draftRecoveryVisible.value = false
  showToast('已恢复上一次的场景', 'global')
}

/** 外部请求：有变化时保存当前项目并关闭（如退出登录场景） */
const handleExternalSaveAndClose = async (event: Event) => {
  // O4：把"是否有项目被保存"作为结果回传给 Toolbar，让 Toolbar / handleSessionInvalidated 知道
  // 这次主动退出是否已经走过服务端保存。false 时可能意味着：
  //   - 没有打开的项目（currentProjectId 为空）
  //   - 项目没变化（hasChanges=false，saveProjectIfChangedAndClose 早 return）
  //   - 保存过程抛错被 catch 吞掉
  let saved = false
  try {
    saved = await saveProjectIfChangedAndClose()
  } finally {
    const detail = (
      event as CustomEvent<{
        done?: (result: { saved: boolean }) => void
      }>
    ).detail
    detail?.done?.({ saved })
  }
}

/** 用户点击取消恢复，清空草稿 */
const handleDraftRecoveryCancel = () => {
  DraftStorageService.clearDraft()
  draftRecoveryVisible.value = false
}

onMounted(() => {
  uiStore.setTouchDevice(
    navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(hover: none)').matches,
  )

  // 检测上次协作异常退出（浏览器崩溃 / HMR 重载 / 刷新 / 未主动离开房间即导航离开等）。
  // 协作会话内标记（sessionStorage）在用户主动离开时被清除；若仍然存在，
  // 说明上次协作会话未正常结束，URL 中的 projectId 是协作房间残留的关联项目。
  // 策略：优先尝试自动重连房间，重连成功则提示"已重连"并恢复协作；
  //       重连失败或无法重连时才执行异常退出处理（重置为空白编辑器）。
  let abnormalCollabExit = false
  let pendingReconnectRoomId: string | null = null
  if (
    route.query.projectId &&
    !route.query.roomId &&
    route.query.newProject !== 'true' &&
    hasCollabInSession()
  ) {
    abnormalCollabExit = true // 无论是否重连，都跳过正常的项目加载流程
    const lastRoomId = getActiveRoomId()
    if (lastRoomId) {
      // 有上次协作的 roomId → 延迟到 collabManager 初始化后尝试重连
      pendingReconnectRoomId = lastRoomId
    } else {
      // 无 roomId → 无法重连，直接执行异常退出处理
      executeAbnormalExitHandling()
    }
  }

  if (!abnormalCollabExit && route.query.projectId) {
    currentProjectId.value = route.query.projectId as string
  }

  if (!abnormalCollabExit && route.query.newProject === 'true') {
    newProjectDialogVisible.value = true
  } else if (!abnormalCollabExit && route.query.projectId) {
    loadProjectScene(route.query.projectId as string)
  }

  // 草稿恢复：无项目且 draftProtection 开启时检查是否需要弹出恢复提示
  // 从切换用户取消流程返回时跳过（场景已在 editorSession 中保留）
  // 异常退出时不弹草稿恢复（用户在协作中，本地草稿与协作场景无关）
  if (!abnormalCollabExit && !route.query.projectId && appSettings.value.draftProtection) {
    if (authStore.skipNextDraftRecovery) {
      authStore.skipNextDraftRecovery = false
    } else {
      const { needsRecovery } = DraftStorageService.initOnLoad()
      if (needsRecovery) {
        draftRecoveryVisible.value = true
      }
    }
  }

  // 启动定期强制保存（安全网，防止 watcher 遗漏导致草稿过期）
  startPeriodicSave()

  // 从房间列表页跳转过来时，自动加入协作房间
  const pendingRoomId = route.query.roomId as string | undefined
  if (pendingRoomId) {
    // 立即弹出"正在加入房间..."提示，让用户第一时间看到反馈，
    // 避免页面空白无反应（编辑器重初始化需要时间）。
    collabStore.openJoinDialog('正在加入房间中...')
    // 延迟到 renderer/collabManager 初始化完成后再加入
    nextTick(() => {
      void autoJoinRoomFromQuery(pendingRoomId)
    })
  } else if (pendingReconnectRoomId) {
    // 异常退出后尝试自动重连房间（collabManager 已在下方初始化）
    nextTick(async () => {
      const reconnected = await tryReconnectRoom(pendingReconnectRoomId)
      if (reconnected) {
        // 重连成功：handleCollabJoin 已调用 setCollabInSession 刷新标记，
        // 此处仅需提示用户协作已恢复。
        showToast('协作房间已重连', 'global')
      } else {
        // 重连失败：执行异常退出处理（内含 clearCollabInSession）
        executeAbnormalExitHandling()
      }
    })
  }

  // 房间列表"创建房间"跳转：初始化完成后直接打开"创建协作"对话框
  if (route.query.collabCreate === 'true') {
    nextTick(() => {
      collabCreateTrigger.value = collabCreateTrigger.value + 1
    })
  }

  renderer = new ThreeRenderer(viewportRef.value!, appSettings.value)
  uiStore.setAxisGridSize(renderer.getAxisGridSize())
  uiStore.setGridVisible(renderer.isAxisGridVisible())
  uiStore.setCoordinateSystemVisible(renderer.isCoordinateSystemVisible())
  interaction = new Interaction(editor, renderer)
  interaction.setGlobalPointValueMode(isGlobalPointValueMode.value)
  interaction.setViewOnly(isViewOnlyCollab.value)
  interaction.bind(renderer.renderer.domElement)
  interaction.syncControlLockState()
  window.addEventListener('open-regular-polygon-dialog', handleOpenRegularPolygonDialog)
  window.addEventListener('show-normal-circle-radius-dialog', handleShowNormalCircleRadiusDialog)
  window.addEventListener('show-radius-sphere-dialog', handleShowRadiusSphereDialog)
  window.addEventListener('show-cone-radius-dialog', handleShowConeRadiusDialog)
  window.addEventListener('show-cylinder-radius-dialog', handleShowCylinderRadiusDialog)
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)
  updateLocalHistoryUI()
  scene.markAllRenderDirty()

  collabManager.value = new CollabManager(scene)
  collabManager.value.setLocalUserLabel(user.value?.nickname || user.value?.username || null)
  // 注册到 collabStore，使会话失效时可由 collabStore.leave() 触发断网
  collabStore.setManager(collabManager.value)
  solverWorker = new SolverSchedulerWorker()
  scheduleSolverFlush = () => {
    if (solverFlushRequested || !solverWorker) return
    solverFlushRequested = true
    solverWorker.postMessage({ type: 'schedule' })
  }
  solverWorker.onmessage = (event: MessageEvent<{ type: 'flush' }>) => {
    if (event.data.type !== 'flush') return
    solverFlushRequested = false
    solverFlushReady = true
  }
  detachSolverListener = scene.onSolverWork(() => {
    scheduleSolverFlush()
  })
  scheduleSolverFlush()

  collabManager.value.onPeersUpdate = (count) => {
    collabStore.setPeerCount(count)
  }
  collabManager.value.onStatusUpdate = (status) => {
    const wasConnected = collabStore.isConnected
    collabStore.setStatus(status)
    // 非用户主动断开（服务器掉线 / 浏览器崩溃恢复等）：
    // 不等待 y-websocket 自动重连、不询问用户是否重连，直接执行退出协作流程，
    // 清理本地残留项目（clearLocalSceneOnly），避免协作项目资产残留在编辑器页面导致泄露。
    // 不调用 leaveRoom API、不发跨 Tab leave 事件（用户非主动离开，服务端成员关系保留）。
    // 不清空服务端协作项目数据（leaveRoom 已断开 Yjs 同步，本地清空不影响远端）。
    if (wasConnected && !status.connected && collabStore.currentRoom) {
      const roomId = collabStore.currentRoom.id
      // 用 setTimeout(0) 延迟到下一宏任务，避免在状态回调中同步重入 leaveRoom
      window.setTimeout(() => {
        if (!collabStore.currentRoom || collabStore.currentRoom.id !== roomId) return
        handleCollabLeave('disconnect')
      }, 0)
    }
  }
  collabManager.value.onLatencyUpdate = (latencyMs) => {
    collabStore.setLatencyMs(latencyMs)
  }
  collabManager.value.onSharedWorldRotationUpdate = (state) => {
    if (!isARMode.value) {
      sharedRotationOwnerNotice.value = ''
      return
    }
    renderer.setSharedWorldQuaternion(
      new THREE.Quaternion(
        state.quaternion.x,
        state.quaternion.y,
        state.quaternion.z,
        state.quaternion.w,
      ),
      state.ownerClientId === null,
    )
    sharedRotationOwnerNotice.value =
      state.ownerClientId !== null && !state.isOwnedByLocal
        ? `${state.ownerName || '其他用户'}正在旋转场景`
        : ''
  }

  collabManager.value.onSharedHistoryUpdate = (state) => {
    sharedHistoryState.value = state
  }

  // 协作拖拽感知：监听房间内所有用户（含自己）的拖拽状态，渲染"xxx正在操作..."气泡
  collabManager.value.onActiveDragsUpdate = (drags) => {
    activeDrags.value = drags
  }
  // 协作历史消息：从 Yjs 共享文档同步，渲染到左上角消息框
  collabManager.value.onCollabMessagesUpdate = (messages) => {
    collabHistoryMessages.value = messages
  }
  interaction.onDragLockRequest = (target: DragLockTarget) =>
    collabManager.value?.tryAcquireDragLock(target) ?? true
  interaction.onDragLockRelease = () => {
    collabManager.value?.releaseDragLock()
  }

  interaction.onARSceneRotateStartRequest = () =>
    isARMode.value &&
    (collabManager.value?.getStatus().room
      ? (collabManager.value?.tryAcquireSharedWorldRotationOwnership() ?? false)
      : true)
  interaction.onARSceneRotate = (quaternion) => {
    collabManager.value?.syncSharedWorldQuaternion({
      x: quaternion.x,
      y: quaternion.y,
      z: quaternion.z,
      w: quaternion.w,
    })
  }
  interaction.onARSceneRotateEnd = () => {
    collabManager.value?.releaseSharedWorldRotationOwnership()
  }

  editor.executeCommand = (cmd: Command) => {
    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    if (inRoom && !cm!.getIsApplyingSharedHistory()) {
      if (collabTransactionDepth > 0) {
        // 协作事务中：只执行命令，不创建共享历史记录（由 commitTransaction 统一创建）
        originalExecuteCommand(cmd)
        cm!.syncAction()
      } else {
        // 统一方案：先执行命令，再通过 undo→export→redo 获取 before 快照
        // 这对所有命令类型都正确：
        // - SnapshotCommand：executeAndCapture() 时已执行，originalExecuteCommand 不会再次 redo
        // - ConstraintAwareCommand：originalExecuteCommand 会调用 redo() 执行操作
        // - 拖拽场景：点位置在拖拽中已被修改，undo 可以恢复到操作前
        originalExecuteCommand(cmd)
        const after = exportScene(scene)
        // 通过 undo→export→redo 获取操作前的场景快照
        const entry = cmd as unknown as HistoryEntry
        entry.undo()
        const before = exportScene(scene)
        entry.redo()
        // 约束求解和渲染同步
        scene.solveDirtyConstraints()
        scene.markAllRenderDirty()

        cm!.syncAction()
        const clientId = cm!.getProviderClientId()
        const label = cmd.constructor.name
        // 操作级意图：命令声明「用户做了什么」；旧命令按散装字段兜底推导
        const declaredIntent = (cmd as { intent?: CollabOperationIntent | null }).intent ?? null
        const draggedPointId = (cmd as { draggedPointId?: string | null }).draggedPointId ?? null
        const keepPointId = (cmd as { keepPointId?: string | null }).keepPointId ?? null
        const deleteTargetId = (cmd as { deleteTargetId?: string | null }).deleteTargetId ?? null
        const intent: CollabOperationIntent | null =
          declaredIntent ??
          (deleteTargetId
            ? { category: 'delete', targetId: deleteTargetId }
            : keepPointId
              ? { category: 'merge', targetId: keepPointId, keepPointId }
              : draggedPointId
                ? { category: 'move', targetId: null, draggedPointId }
                : null)
        cm!.appendHistoryEntry({
          id: crypto.randomUUID(),
          actorClientId: clientId,
          actorName: cm!.getLocalUserLabel(),
          createdAt: Date.now(),
          label,
          before,
          after,
          intent,
          draggedPointId,
          keepPointId,
          deleteTargetId,
        })
      }
    } else if (!inRoom) {
      originalExecuteCommand(cmd)
      updateLocalHistoryUI()
    } else {
      originalExecuteCommand(cmd)
      cm!.syncAction()
    }
  }

  editor.executeHistoryEntry = (entry: HistoryEntry) => {
    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    if (inRoom && !cm!.getIsApplyingSharedHistory()) {
      if (collabTransactionDepth > 0) {
        // 协作事务中：只执行命令，不创建共享历史记录
        originalExecuteHistoryEntry(entry)
        cm!.syncAction()
      } else {
        // 统一方案：先执行命令，再通过 undo→export→redo 获取 before 快照
        // 对所有命令类型（SnapshotCommand / ConstraintAwareCommand）都正确
        originalExecuteHistoryEntry(entry)
        const after = exportScene(scene)
        entry.undo()
        const before = exportScene(scene)
        entry.redo()
        scene.solveDirtyConstraints()
        scene.markAllRenderDirty()

        cm!.syncAction()
        const clientId = cm!.getProviderClientId()
        // 操作级意图：命令声明「用户做了什么」（主语/属性/标注零反推，消息生成优先采用）
        const declaredIntent = (entry as { intent?: CollabOperationIntent | null }).intent ?? null
        // 兼容旧命令：未声明 intent 时由既有散装字段兜底推导
        const draggedPointId = (entry as { draggedPointId?: string | null }).draggedPointId ?? null
        const keepPointId = (entry as { keepPointId?: string | null }).keepPointId ?? null
        const deleteTargetId = (entry as { deleteTargetId?: string | null }).deleteTargetId ?? null
        const intent: CollabOperationIntent | null =
          declaredIntent ??
          (deleteTargetId
            ? { category: 'delete', targetId: deleteTargetId }
            : keepPointId
              ? { category: 'merge', targetId: keepPointId, keepPointId }
              : draggedPointId
                ? { category: 'move', targetId: null, draggedPointId }
                : null)
        cm!.appendHistoryEntry({
          id: crypto.randomUUID(),
          actorClientId: clientId,
          actorName: cm!.getLocalUserLabel(),
          createdAt: Date.now(),
          label: entry.label,
          before,
          after,
          intent,
          draggedPointId,
          keepPointId,
          deleteTargetId,
        })
      }
    } else if (!inRoom) {
      originalExecuteHistoryEntry(entry)
      updateLocalHistoryUI()
    } else {
      originalExecuteHistoryEntry(entry)
      cm!.syncAction()
    }
  }

  editor.undo = () => {
    const cm = collabManager.value
    if (cm && cm.getStatus().room !== null) {
      cm.sharedUndo()
    } else {
      editor.historyManager.undo()
      updateLocalHistoryUI()
    }
  }

  editor.redo = () => {
    const cm = collabManager.value
    if (cm && cm.getStatus().room !== null) {
      cm.sharedRedo()
    } else {
      editor.historyManager.redo()
      updateLocalHistoryUI()
    }
  }

  // 覆盖 beginTransaction：协作模式下使用协作事务机制，非协作模式下走原始逻辑
  // 这样 Interaction handler 等使用 beginTransaction 的代码也能正确处理协作模式
  editor.beginTransaction = (label: string) => {
    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    if (inRoom) {
      collabTransactionDepth++
      if (collabTransactionDepth === 1) {
        collabTransactionBefore = exportScene(scene)
        collabTransactionLabel = label
      }
    } else {
      originalBeginTransaction(label)
    }
  }

  editor.commitTransaction = () => {
    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    if (inRoom) {
      if (collabTransactionDepth <= 0) return
      collabTransactionDepth--
      if (collabTransactionDepth === 0 && collabTransactionBefore) {
        const after = exportScene(scene)
        cm!.syncAction()
        cm!.appendHistoryEntry({
          id: crypto.randomUUID(),
          actorClientId: cm!.getProviderClientId(),
          actorName: cm!.getLocalUserLabel(),
          createdAt: Date.now(),
          label: collabTransactionLabel,
          before: collabTransactionBefore,
          after,
        })
        collabTransactionBefore = null
      }
    } else {
      originalCommitTransaction()
      editor.historyVersion++
      updateLocalHistoryUI()
    }
  }

  // beginCollabTransaction/commitCollabTransaction 直接委托给 beginTransaction/commitTransaction
  // 这样无论是 SideBar 还是 Interaction handler，都走同一套事务机制
  editor.beginCollabTransaction = (label: string) => {
    editor.beginTransaction(label)
  }

  editor.commitCollabTransaction = () => {
    editor.commitTransaction()
  }

  // sidebar 滑块拖拽过程中的实时同步：不记录历史，仅把 net 状态推送到 Yjs
  editor.syncLiveNet = (netId: string) => {
    collabManager.value?.syncLivePreview([], null, [netId])
  }

  // 解析远程拖拽元素的 3D 锚点（数学空间坐标），气泡将通过该点投影到屏幕上并指向元素
  const resolveDragAnchor = (drag: RemoteDragState): THREE.Vector3 | null => {
    const s = scene
    const toVec = (p?: { position: { x: number; y: number; z: number } } | null) =>
      p ? new THREE.Vector3(p.position.x, p.position.y, p.position.z) : null
    const mid = (a: THREE.Vector3 | null, b: THREE.Vector3 | null) =>
      a && b ? a.clone().add(b).multiplyScalar(0.5) : (a ?? b)
    switch (drag.elementType) {
      case 'point': {
        const p = s.points.get(drag.elementId)
        return p ? toVec(p) : null
      }
      case 'line': {
        const l = s.lines.get(drag.elementId)
        return l ? mid(toVec(l.p1), toVec(l.p2)) : null
      }
      case 'straightLine': {
        const l = s.straightLines.get(drag.elementId)
        return l ? mid(toVec(l.p1), toVec(l.p2)) : null
      }
      case 'perpendicularLine': {
        const l = s.perpendicularLines.get(drag.elementId)
        return l ? mid(toVec(l.p1), toVec(l.p2)) : null
      }
      case 'parallelLine': {
        const l = s.parallelLines.get(drag.elementId)
        return l ? mid(toVec(l.p1), toVec(l.p2)) : null
      }
      case 'ray': {
        const l = s.rays.get(drag.elementId)
        return l ? mid(toVec(l.p1), toVec(l.p2)) : null
      }
      case 'vector': {
        const l = s.vectors.get(drag.elementId)
        return l ? mid(toVec(l.p1), toVec(l.p2)) : null
      }
      case 'circle': {
        const c = s.circles.get(drag.elementId)
        if (!c) return null
        const a = toVec(c.p1)
        const b = toVec(c.p2)
        const d = toVec(c.p3)
        if (a && b && d) return a.clone().add(b).add(d).multiplyScalar(1 / 3)
        return (a ?? b ?? d)
      }
      case 'sphere': {
        const sp = s.spheres.get(drag.elementId)
        return sp ? toVec(sp.centerPoint) : null
      }
      case 'cone': {
        const cn = s.cones.get(drag.elementId)
        return cn ? mid(toVec(cn.baseCenterPoint), toVec(cn.apexPoint)) : null
      }
      case 'cylinder': {
        const cy = s.cylinders.get(drag.elementId)
        return cy ? mid(toVec(cy.bottomCenterPoint), toVec(cy.topCenterPoint)) : null
      }
      case 'face': {
        const f = s.faces.get(drag.elementId)
        if (!f || f.boundaryPointIds.length === 0) return null
        const pts: THREE.Vector3[] = []
        for (const id of f.boundaryPointIds) {
          const p = s.points.get(id)
          if (p) pts.push(new THREE.Vector3(p.position.x, p.position.y, p.position.z))
        }
        if (pts.length === 0) return null
        const sum = pts.reduce((acc, p) => acc.add(p), new THREE.Vector3())
        return sum.multiplyScalar(1 / pts.length)
      }
      case 'net': {
        const n = s.nets.get(drag.elementId)
        return n ? new THREE.Vector3(n.position.x, n.position.y, n.position.z) : null
      }
      default:
        return null
    }
  }

  // 每帧将气泡投影到元素屏幕坐标的右侧（跟随拖动中的元素移动）
  const updateDragAwarenessBubbles = () => {
    const layer = dragAwarenessLayerRef.value
    if (!layer) return
    const drags = activeDrags.value
    if (drags.length === 0) return
    const w = Math.max(layer.clientWidth, 1)
    const h = Math.max(layer.clientHeight, 1)
    for (const drag of drags) {
      const node = layer.querySelector<HTMLElement>(
        `.drag-awareness-bubble[data-client-id="${drag.clientId}"]`,
      )
      if (!node) continue
      const anchor = resolveDragAnchor(drag)
      if (!anchor) {
        node.style.visibility = 'hidden'
        continue
      }
      const worldPos = renderer.toMathWorldPosition(anchor)
      const projected = worldPos.clone().project(renderer.getActiveCamera())
      // 位于相机后方时隐藏气泡
      if (projected.z < -1 || projected.z > 1) {
        node.style.visibility = 'hidden'
        continue
      }
      const x = (projected.x + 1) * 0.5 * w
      const y = (1 - projected.y) * 0.5 * h
      node.style.visibility = 'visible'
      node.style.left = `${Math.round(x + DRAG_BUBBLE_GAP_PX)}px`
      node.style.top = `${Math.round(y)}px`
    }
  }

  const loop = () => {
    const now = performance.now()
    const fpsCap = appSettings.value.fpsCap

    if (fpsCap > 0) {
      const minFrameInterval = 1000 / fpsCap
      const elapsed = now - lastRenderTime
      if (elapsed < minFrameInterval) {
        animationFrameId = requestAnimationFrame(loop)
        return
      }
      // 使用目标时间累加，避免帧率漂移（比直接赋值 now 更稳定）
      lastRenderTime += minFrameInterval
      // 如果落后太多（比如切回标签页后时间跳跃），重置到当前时间
      if (now - lastRenderTime > minFrameInterval * 2) {
        lastRenderTime = now
      }
    } else {
      lastRenderTime = now
    }

    frameCount++
    const elapsed = now - lastFpsTime
    if (elapsed >= 1000) {
      uiStore.setFps(Math.round((frameCount * 1000) / elapsed))
      frameCount = 0
      lastFpsTime = now
    }
    if (solverFlushReady) {
      solverFlushReady = false
      scene.solveDirtyConstraints()
      if (scene.hasPendingConstraintWork()) {
        scheduleSolverFlush()
      }
    }
    if (interaction.shouldSyncLiveScene()) {
      collabManager.value?.syncLivePreview(
        interaction.getLiveSyncPointIds(),
        interaction.getLiveSyncLabelTarget(),
        interaction.getLiveSyncNetIds(),
      )
    }
    renderer.sync(
      scene,
      interaction.rubberBandData,
      interaction.getFacePreviewData(),
      interaction.getActiveLabelTarget(),
      interaction.getActivePointValueTarget(),
    )
    renderer.render()
    // 协作拖拽气泡跟随元素：渲染完成后按最新相机投影更新位置
    updateDragAwarenessBubbles()
    animationFrameId = requestAnimationFrame(loop)
  }
  loop()

  nextTick(() => {
    syncSidebarResizeMode()
    const defaultWidth = Math.round(getDefaultSidebarWidth())
    sidebarMinWidth.value = defaultWidth
    sidebarWidth.value = defaultWidth
    syncSidebarWidthBounds()

    if (viewportRef.value) {
      viewportResizeObserver = new ResizeObserver(() => {
        if (isDraggingSidebarWidth.value) {
          scheduleViewportPreviewResize()
          return
        }
        scheduleViewportResize()
      })
      viewportResizeObserver.observe(viewportRef.value)
    }

    scheduleViewportResize()
  })

  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('toast', handleToast as EventListener)
  window.addEventListener('pointermove', handleSidebarWidthDrag)
  window.addEventListener('pointerup', stopSidebarWidthDrag)
  window.addEventListener('pointercancel', stopSidebarWidthDrag)
  window.addEventListener('preview-settings', handlePreviewSettings as EventListener)
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('pagehide', handlePageHide)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('editor:save-and-close', handleExternalSaveAndClose)

  // 跨 Tab 重新登录：当其他 Tab 登录/重新登录并切换到当前 Tab 的 user 后：
  //   - 有项目：重新走一遍 loadProjectScene（拉最新数据，避免显示的是旧 user 的旧项目）
  //   - 临时编辑器：本地草稿属于当前 localStorage token 的 user，无需重拉；
  //     但若切换账号会导致"草稿归属新 user"的语义问题，因此弹出 toast 提示。
  crossTabLoginEvents.on(handleCrossTabLogin)
  // 跨 Tab 协作房间事件监听（房间列表页离开/关闭房间时同步编辑器状态）
  collabRoomEvents.on(handleCollabRoomEvent)
})

watch(
  currentProjectName,
  (name) => {
    document.title = name ? `项目：${name} - GeoMesh3D` : '编辑器 - GeoMesh3D'
  },
  { immediate: true },
)

watch(
  isGlobalPointValueMode,
  (enabled) => {
    interaction?.setGlobalPointValueMode(enabled)
  },
  { immediate: true },
)

watch(
  isSnappingEnabled,
  (enabled) => {
    editor.isSnappingEnabled = enabled
  },
  { immediate: true },
)

watch(
  () => user.value,
  (nextUser) => {
    collabManager.value?.setLocalUserLabel(nextUser?.nickname || nextUser?.username || null)
  },
  { immediate: true },
)

watch(
  [
    () => scene.selection.points.size,
    () => scene.selection.lines.size,
    () => scene.selection.straightLines.size,
    () => scene.selection.perpendicularLines.size,
    () => scene.selection.parallelLines.size,
    () => scene.selection.rays.size,
    () => scene.selection.vectors.size,
    () => scene.selection.circles.size,
    () => scene.selection.faces.size,
    () => scene.selection.spheres.size,
    () => scene.selection.cones.size,
    () => scene.selection.cylinders.size,
    () => editor.mode,
    isARMode,
  ],
  () => {
    scene.markAllRenderDirty()
    sceneStore.syncEditorState(editor)
    sceneStore.syncSceneState(scene)
    if (!isTouchDevice.value || !interaction) return
    interaction.syncControlLockState()
  },
  { flush: 'post' },
)

watch(
  [
    () => editor.historyVersion,
    () => editor.isSnappingEnabled,
    () => scene.points.size,
    () => scene.lines.size,
    () => scene.straightLines.size,
    () => scene.perpendicularLines.size,
    () => scene.parallelLines.size,
    () => scene.rays.size,
    () => scene.vectors.size,
    () => scene.circles.size,
    () => scene.faces.size,
    () => scene.spheres.size,
    () => scene.cones.size,
    () => scene.cylinders.size,
  ],
  () => {
    scene.markAllRenderDirty()
    sceneStore.syncEditorState(editor)
    sceneStore.syncSceneState(scene)
    // 场景有改动时 debounce 自动保存
    scheduleAutoSave()
  },
  { flush: 'post' },
)

const sharedHistoryState = ref<import('../core/collab/CollabManager').SharedHistoryState | null>(
  null,
)

const updateLocalHistoryUI = () => {
  sceneStore.setHistoryState({
    canUndo: editor.historyManager.canUndo,
    canRedo: editor.historyManager.canRedo,
  })
}

const updateSharedHistoryUI = () => {
  const state = sharedHistoryState.value
  if (!state) return
  sceneStore.setHistoryState({
    canUndo: state.historyIndex >= 0,
    canRedo: state.historyIndex < state.entries.length - 1,
  })
}

const updateHistoryUI = () => {
  const cm = collabManager.value
  if (cm && cm.getStatus().room !== null) {
    updateSharedHistoryUI()
  } else {
    updateLocalHistoryUI()
  }
}

watch(sharedHistoryState, () => {
  updateSharedHistoryUI()
  sceneStore.syncSceneState(scene)
})

watch(
  [() => scene.points.size, () => scene.lines.size, () => scene.circles.size],
  () => {
    updateHistoryUI()
  },
  { flush: 'post' },
)

/**
 * 监听设置变化
 * 当 store 中的 appSettings 被确认保存后，将变更同步到 ThreeRenderer
 * pixelRatioScale 与 fpsCap 可立即生效；
 * antialias 与 powerPreference 变更需要重建 WebGLRenderer，故提示用户刷新页面
 */
watch(
  appSettings,
  (newSettings, oldSettings) => {
    if (!renderer) return
    const changes: Partial<typeof newSettings> = {}
    if (newSettings.pixelRatioScale !== oldSettings?.pixelRatioScale) {
      changes.pixelRatioScale = newSettings.pixelRatioScale
    }
    if (newSettings.fpsCap !== oldSettings?.fpsCap) {
      changes.fpsCap = newSettings.fpsCap
    }
    if (newSettings.antialias !== oldSettings?.antialias) {
      changes.antialias = newSettings.antialias
    }
    if (newSettings.powerPreference !== oldSettings?.powerPreference) {
      changes.powerPreference = newSettings.powerPreference
    }
    if (newSettings.depthOcclusion !== oldSettings?.depthOcclusion) {
      changes.depthOcclusion = newSettings.depthOcclusion
    }
    if (newSettings.hiddenEdge !== oldSettings?.hiddenEdge) {
      changes.hiddenEdge = newSettings.hiddenEdge
    }
    if (Object.keys(changes).length === 0) return

    const result = renderer.applySettings(changes)
    if (result.needsRecreate) {
      // 拆分提示：分别提示抗锯齿和 GPU 偏好的变更
      const msgs: string[] = []
      if (changes.antialias !== undefined) msgs.push('抗锯齿')
      if (changes.powerPreference !== undefined) msgs.push('GPU 偏好')
      if (msgs.length > 0) {
        showToast(`${msgs.join('、')}已更改，刷新页面后生效`, 'global')
      }
    }
  },
  { deep: true },
)

watch(
  [() => editor.mode, () => [...scene.selection.points]],
  () => {
    if (editor.mode !== EditorMode.MergePoint) {
      uiStore.closeMergePointDialog()
      return
    }

    const selectedIds = [...scene.selection.points]
    if (selectedIds.length !== 2) {
      uiStore.closeMergePointDialog()
      return
    }

    uiStore.openMergePointDialog(
      selectedIds.includes(mergePointDialog.value.targetId)
        ? mergePointDialog.value.targetId
        : selectedIds[0]!,
    )
  },
  { flush: 'post' },
)

// 监听设置变化：关闭 draftProtection 时清空草稿，关闭 autoSaveProject 时取消待保存定时器
watch(
  () => [appSettings.value.draftProtection, appSettings.value.autoSaveProject],
  ([draftProtection, autoSaveProject]) => {
    if (!draftProtection) {
      DraftStorageService.clearDraft()
      draftRecoveryVisible.value = false
    }
    if (!autoSaveProject && currentProjectId.value) {
      stopAutoSave()
    }
    if (!draftProtection && !currentProjectId.value) {
      stopAutoSave()
    }
  },
)

// 生命周期钩子，防止页面刷新或销毁后连接残留
onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
  stopAutoSave()
  stopPeriodicSave()
  stopRoomStatusPolling()
  // 离开协作房间：优先通过 collabStore 走统一通道（它内部已持有 manager 引用）
  collabStore.leave()
  collabStore.resetCollabState()
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  editor.executeCommand = originalExecuteCommand
  editor.executeHistoryEntry = originalExecuteHistoryEntry
  editor.undo = originalUndo
  editor.redo = originalRedo
  editor.beginTransaction = originalBeginTransaction
  editor.commitTransaction = originalCommitTransaction
  editor.beginCollabTransaction = originalBeginCollabTransaction
  editor.commitCollabTransaction = originalCommitCollabTransaction
  editor.historyManager.clear()
  detachSolverListener()
  solverWorker?.terminate()
  solverWorker = null
  interaction?.unbind(renderer.renderer.domElement)
  window.removeEventListener('open-regular-polygon-dialog', handleOpenRegularPolygonDialog)
  window.removeEventListener('show-normal-circle-radius-dialog', handleShowNormalCircleRadiusDialog)
  window.removeEventListener('show-radius-sphere-dialog', handleShowRadiusSphereDialog)
  window.removeEventListener('show-cone-radius-dialog', handleShowConeRadiusDialog)
  window.removeEventListener('show-cylinder-radius-dialog', handleShowCylinderRadiusDialog)
  renderer?.dispose()
  viewportResizeObserver?.disconnect()
  viewportResizeObserver = null
  if (sidebarResizeRafId !== null) {
    cancelAnimationFrame(sidebarResizeRafId)
    sidebarResizeRafId = null
  }
  if (sidebarPreviewResizeRafId !== null) {
    cancelAnimationFrame(sidebarPreviewResizeRafId)
    sidebarPreviewResizeRafId = null
  }
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('toast', handleToast as EventListener)
  window.removeEventListener('pointermove', handleSidebarWidthDrag)
  window.removeEventListener('pointerup', stopSidebarWidthDrag)
  window.removeEventListener('pointercancel', stopSidebarWidthDrag)
  window.removeEventListener('preview-settings', handlePreviewSettings as EventListener)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('pagehide', handlePageHide)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('editor:save-and-close', handleExternalSaveAndClose)
  crossTabLoginEvents.off(handleCrossTabLogin)
  collabRoomEvents.off(handleCollabRoomEvent)
  document.body.classList.remove('sidebar-width-resizing')
})

// P3：onBeforeUnmount 时清空非协作模式下的本地 undo/redo 栈，
// 释放其中每个 snapshot 持有的 scene 引用，缩短大场景下的内存驻留时间。
onBeforeUnmount(() => {
  editor.historyManager.clear()
})

function onModeChange(mode: EditorMode) {
  // AR 模式下仅允许"选择"功能
  if (isARMode.value && mode !== EditorMode.Select) return
  interaction.clearPreview()
  interaction.radiusSphereCenterPointId = null
  if (mode === EditorMode.CreateNet) {
    editor.createNet()
  } else {
    editor.setMode(mode)
  }
  sceneStore.setCurrentMode(mode)
  uiStore.closeMergePointDialog()
  uiStore.closeRegularPolygonDialog()
  uiStore.closeNormalCircleRadiusDialog()
  uiStore.closeRadiusSphereDialog()
}

const mergePointSelection = computed(() =>
  [...scene.selection.points]
    .map((id) => scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined),
)

const mergePointWarning = computed(() => {
  if (!mergePointDialog.value.visible) return ''
  const points = mergePointSelection.value
  if (points.length !== 2) return ''
  const inheritedPoint = points.find((point) => point.id !== mergePointDialog.value.targetId)
  return inheritedPoint ? `注意：该点将继承 ${inheritedPoint.name} 点的约束关系` : ''
})

const handleConfirmMergePoints = () => {
  const points = mergePointSelection.value
  if (points.length !== 2) return
  const keepPoint = points.find((point) => point.id === mergePointDialog.value.targetId)
  const removePoint = points.find((point) => point.id !== mergePointDialog.value.targetId)
  if (!keepPoint || !removePoint) return
  editor.mergePoints(keepPoint.id, removePoint.id)
  uiStore.closeMergePointDialog()
}

const handleCancelMergePoints = () => {
  uiStore.closeMergePointDialog()
}

// ============ 点轴对齐 ============
const alignPointsSelection = computed(() =>
  [...scene.selection.points]
    .map((id) => scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined),
)

/** 当前选中的点是否可以作为基准点（弹窗可见时） */
const alignPointsReferenceCandidates = computed(() => alignPointsSelection.value)

/** 计算某点在指定轴对齐后的目标坐标 */
const computeAlignedPosition = (point: Point3, ref: Point3, axis: 'x' | 'y' | 'z'): Vec3 => {
  const after = point.position.clone()
  if (axis === 'x') after.x = ref.position.x
  else if (axis === 'y') after.y = ref.position.y
  else after.z = ref.position.z
  return after
}

/** 判断某点是否无法被矫正到目标坐标 */
const isPointUnalignable = (point: Point3, after: Vec3): boolean => {
  // 1. 锁定点（系统锁 / 用户锁）
  if (point.locked || point.userLocked) return true
  // 2. 交点约束：位置完全由两源对象决定
  if (scene.intersectionConstraints.has(point.id)) return true
  // 3. 立体 dependent 点：由约束求解决定
  if (
    point.cubeRole === 'dependent' ||
    point.regularPolygonRole === 'dependent' ||
    point.prismRole === 'dependent' ||
    point.pyramidRole === 'dependent'
  ) {
    return true
  }
  // 4. ObjectConstrainedPointConstraint：投影后能否落到目标
  const constraint = scene.objectConstrainedPointConstraints.get(point.id) as
    | ObjectConstrainedPointConstraint
    | undefined
  if (constraint) {
    const projected = constraint.projectPosition(after)
    if (!projected) return true
    const dx = projected.x - after.x
    const dy = projected.y - after.y
    const dz = projected.z - after.z
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 1e-4) return true
  }
  return false
}

/** 警告点列表（无法被矫正到目标坐标的非基准点） */
const alignPointsWarningPoints = computed(() => {
  if (!alignPointsDialog.value.visible) return [] as Array<{ point: Point3; after: Vec3 }>
  const refId = alignPointsDialog.value.referenceId
  const axis = alignPointsDialog.value.axis
  const ref = scene.points.get(refId)
  if (!ref) return [] as Array<{ point: Point3; after: Vec3 }>
  return alignPointsSelection.value
    .filter((p) => p.id !== refId)
    .map((p) => ({ point: p, after: computeAlignedPosition(p, ref, axis) }))
    .filter((entry) => isPointUnalignable(entry.point, entry.after))
})

/** 警告点 ID 集合 */
const alignPointsWarningIds = computed(
  () => new Set(alignPointsWarningPoints.value.map((entry) => entry.point.id)),
)

/** 可矫正点的预览坐标映射（非基准、非警告点） */
const alignPointsPreviewMap = computed(() => {
  const map = new Map<string, Vec3>()
  if (!alignPointsDialog.value.visible) return map
  const refId = alignPointsDialog.value.referenceId
  const axis = alignPointsDialog.value.axis
  const ref = scene.points.get(refId)
  if (!ref) return map
  const warningIds = alignPointsWarningIds.value
  for (const p of alignPointsSelection.value) {
    if (p.id === refId || warningIds.has(p.id)) continue
    map.set(p.id, computeAlignedPosition(p, ref, axis))
  }
  return map
})

const handleOpenAlignPoints = () => {
  const selected = [...scene.selection.points]
  if (selected.length < 2) {
    showToast('请先选中两个及以上的点')
    return
  }
  const first = scene.points.get(selected[0]!)
  uiStore.openAlignPointsDialog(first ? first.id : selected[0]!, 'y')
}

const alignShakeActive = ref(false)
let alignShakeTimer: number | null = null

const triggerAlignShake = () => {
  if (alignShakeTimer) {
    clearTimeout(alignShakeTimer)
    alignShakeTimer = null
  }
  alignShakeActive.value = false
  // 强制重排以重新触发动画
  requestAnimationFrame(() => {
    alignShakeActive.value = true
    alignShakeTimer = window.setTimeout(() => {
      alignShakeActive.value = false
      alignShakeTimer = null
    }, 1400)
  })
}

const handleConfirmAlignPoints = () => {
  if (alignPointsWarningPoints.value.length > 0) {
    triggerAlignShake()
    return
  }
  const refId = alignPointsDialog.value.referenceId
  const axis = alignPointsDialog.value.axis
  const ref = scene.points.get(refId)
  if (!ref) {
    uiStore.closeAlignPointsDialog()
    return
  }
  const transforms = alignPointsSelection.value
    .filter((p) => p.id !== refId)
    .map((p) => ({
      pointId: p.id,
      before: p.position.clone(),
      after: computeAlignedPosition(p, ref, axis),
    }))
  editor.alignPoints(transforms)
  uiStore.closeAlignPointsDialog()
  showToast(`已对齐 ${transforms.length} 个点`)
}

const handleCancelAlignPoints = () => {
  uiStore.closeAlignPointsDialog()
}

const handleRemoveAlignWarningPoint = (pointId: string) => {
  scene.selection.deselectPoint(pointId)
}

watch(
  () => [...scene.selection.points],
  (ids) => {
    if (alignPointsDialog.value.visible && ids.length < 2) {
      uiStore.closeAlignPointsDialog()
    }
  },
)

const handleOpenRegularPolygonDialog = (e: Event) => {
  const detail = (e as CustomEvent).detail
  uiStore.openRegularPolygonDialog(detail.firstPointId, detail.secondPointId)
}

const handleConfirmRegularPolygon = () => {
  if (!canConfirmRegularPolygon.value) return
  const n = Math.round(regularPolygonDialog.value.vertexCount)
  const p1 = scene.points.get(regularPolygonDialog.value.firstPointId)
  const p2 = scene.points.get(regularPolygonDialog.value.secondPointId)
  if (!p1 || !p2) return
  editor.tryCreateRegularPolygon(p1, p2, n)
  interaction.resetRegularPolygonCreation()
  uiStore.closeRegularPolygonDialog()
}

const handleCancelRegularPolygon = () => {
  interaction.resetRegularPolygonCreation()
  uiStore.closeRegularPolygonDialog()
}

const handleShowNormalCircleRadiusDialog = () => {
  uiStore.openNormalCircleRadiusDialog()
}

const handleConfirmNormalCircleRadius = () => {
  if (!canConfirmNormalCircleRadius.value) return
  const r = Math.round(normalCircleRadiusDialog.value.radius * 10) / 10
  interaction.confirmNormalCircleRadius(r)
  uiStore.closeNormalCircleRadiusDialog()
}

const handleCancelNormalCircleRadius = () => {
  interaction.cancelNormalCircleCreation()
  uiStore.closeNormalCircleRadiusDialog()
}

const handleShowRadiusSphereDialog = (e: Event) => {
  const detail = (e as CustomEvent).detail
  uiStore.openRadiusSphereDialog(detail.centerPointId)
}

const handleConfirmRadiusSphereRadius = () => {
  if (!canConfirmRadiusSphereRadius.value) return
  const r = Math.round(radiusSphereDialog.value.radius * 10) / 10
  interaction.confirmRadiusSphereRadius(r)
  uiStore.closeRadiusSphereDialog()
}

const handleCancelRadiusSphereRadius = () => {
  interaction.cancelRadiusSphereCreation()
  uiStore.closeRadiusSphereDialog()
}

const validatePositiveRadius = (visible: boolean, radius: number): string => {
  if (!visible) return ''
  if (typeof radius !== 'number' || isNaN(radius)) return '请输入有效的数字'
  if (radius <= 0) return '半径必须大于 0'
  return ''
}

const radiusSphereRadiusError = computed(() =>
  validatePositiveRadius(radiusSphereDialog.value.visible, radiusSphereDialog.value.radius),
)

const canConfirmRadiusSphereRadius = computed(() => radiusSphereRadiusError.value === '')

const coneRadiusRadiusError = computed(() =>
  validatePositiveRadius(coneRadiusDialog.value.visible, coneRadiusDialog.value.radius),
)

const canConfirmConeRadius = computed(() => coneRadiusRadiusError.value === '')

const cylinderRadiusError = computed(() =>
  validatePositiveRadius(cylinderRadiusDialog.value.visible, cylinderRadiusDialog.value.radius),
)

const canConfirmCylinderRadius = computed(() => cylinderRadiusError.value === '')

const normalCircleRadiusError = computed(() =>
  validatePositiveRadius(
    normalCircleRadiusDialog.value.visible,
    normalCircleRadiusDialog.value.radius,
  ),
)

const canConfirmNormalCircleRadius = computed(() => normalCircleRadiusError.value === '')

const handleShowConeRadiusDialog = (e: Event) => {
  const detail = (e as CustomEvent).detail
  uiStore.openConeRadiusDialog(detail.baseCenterPointId, detail.apexPointId)
}

const handleConfirmConeRadius = () => {
  if (!canConfirmConeRadius.value) return
  const r = Math.round(coneRadiusDialog.value.radius * 10) / 10
  interaction.confirmConeRadius(
    coneRadiusDialog.value.baseCenterPointId,
    coneRadiusDialog.value.apexPointId,
    r,
  )
  uiStore.closeConeRadiusDialog()
}

const handleCancelConeRadius = () => {
  interaction.cancelConeCreation()
  uiStore.closeConeRadiusDialog()
}

const handleShowCylinderRadiusDialog = (e: Event) => {
  const detail = (e as CustomEvent).detail
  uiStore.openCylinderRadiusDialog(detail.bottomCenterPointId, detail.topCenterPointId)
}

const handleConfirmCylinderRadius = () => {
  if (!canConfirmCylinderRadius.value) return
  const r = Math.round(cylinderRadiusDialog.value.radius * 10) / 10
  interaction.confirmCylinderRadius(
    cylinderRadiusDialog.value.bottomCenterPointId,
    cylinderRadiusDialog.value.topCenterPointId,
    r,
  )
  uiStore.closeCylinderRadiusDialog()
}

const handleCancelCylinderRadius = () => {
  interaction.cancelCylinderCreation()
  uiStore.closeCylinderRadiusDialog()
}

const regularPolygonVertexError = computed(() => {
  if (!regularPolygonDialog.value.visible) return ''
  const n = regularPolygonDialog.value.vertexCount
  if (typeof n !== 'number' || isNaN(n)) return '请输入有效的数字'
  if (!Number.isInteger(n)) return '顶点数必须为整数'
  if (n < 3) return '顶点数必须大于 2'
  return ''
})

const canConfirmRegularPolygon = computed(() => {
  return regularPolygonVertexError.value === ''
})

const MIN_STEP_HINT_TEXT = '已减到增减按钮可达的最小值，如需更小值请在输入框输入'

const handleClearAll = () => {
  if (collabDisableClear.value) {
    showToast('协作中创建者已禁用清空操作', 'global')
    return
  }
  const confirmed = window.confirm('⚠"清空"会删除场景中的所有对象。确定要继续吗？')
  if (!confirmed) return

  editor.clearAll()
  showToast('已清空所有对象', 'global')
}

const handleExportScene = async () => {
  if (collabDisableExport.value) {
    showToast('协作中创建者已禁用导出操作', 'global')
    return
  }
  if (isSceneEmpty(scene)) {
    showToast('仅存在原点，无需导出', 'global')
    return
  }
  try {
    const prefix = currentProjectId.value ? currentProjectName.value : undefined
    const saved = await downloadSceneAsJson(scene, prefix)
    if (saved) {
      showToast('导出成功', 'global')
    }
  } catch {
    showToast('导出失败', 'global')
  }
}

const handleImportScene = async () => {
  if (collabDisableImport.value) {
    showToast('协作中创建者已禁用导入操作', 'global')
    return
  }
  try {
    const result = await openJsonFileForImport()
    if (!result) return

    const validation = validateSerializedScene(result.data)
    if (!validation.valid) {
      showToast(`导入失败：${validation.error}`, 'global')
      return
    }

    if (isSerializedSceneEmpty(result.data as SerializedScene)) {
      showToast('仅存在原点，已跳过导入', 'global')
      return
    }

    if (!isSceneEmpty(scene)) {
      const confirmed = window.confirm('场景中已有创作内容，若继续导入将覆盖原内容，且无法恢复')
      if (!confirmed) return
    }

    editor.clearHistory()
    editor.selectedPoints = []
    scene.selection.clear()

    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    const before = exportScene(scene)
    importScene(scene, result.data as SerializedScene)

    sceneStore.syncEditorState(editor)
    sceneStore.syncSceneState(scene)
    scene.markAllRenderDirty()
    if (inRoom && before) {
      const after = exportScene(scene)
      cm!.syncAction()
      cm!.appendHistoryEntry({
        id: crypto.randomUUID(),
        actorClientId: cm!.getProviderClientId(),
        actorName: cm!.getLocalUserLabel(),
        createdAt: Date.now(),
        label: 'ImportScene',
        before,
        after,
      })
    } else {
      collabManager.value?.syncAction()
      updateLocalHistoryUI()
    }

    showToast('导入成功', 'global')
  } catch {
    showToast('导入失败：文件读取错误', 'global')
  }
}

const handleUndo = () => {
  if (collabDisableUndoRedo.value) {
    showToast('协作中创建者已禁用撤销/重做', 'global')
    return
  }
  editor.undo()
}

const handleRedo = () => {
  if (collabDisableUndoRedo.value) {
    showToast('协作中创建者已禁用撤销/重做', 'global')
    return
  }
  editor.redo()
}

const handleAxisGridSizeChange = () => {
  if (!isCoordinateSystemVisible.value) return
  renderer.setAxisGridSize(axisGridSize.value)
}

const handleResetView = () => {
  renderer.resetView()
}

const handleToggleGridVisible = () => {
  if (!isCoordinateSystemVisible.value) return
  uiStore.toggleGridVisible()
  renderer.setAxisGridVisible(isGridVisible.value)
}

const handleToggleCoordinateSystem = (enabled: boolean) => {
  interaction.clearPreview()

  if (!enabled) {
    uiStore.setLastModeBeforeCoordinateOff(editor.mode)
    editor.setMode(EditorMode.Select)
    sceneStore.setCurrentMode(EditorMode.Select)
  } else if (!isARMode.value && lastModeBeforeCoordinateOff.value !== null) {
    editor.setMode(lastModeBeforeCoordinateOff.value)
    sceneStore.setCurrentMode(lastModeBeforeCoordinateOff.value)
  }

  if (enabled) {
    uiStore.setLastModeBeforeCoordinateOff(null)
  }

  uiStore.setCoordinateSystemVisible(enabled)
  renderer.setCoordinateSystemVisible(enabled)

  if (enabled) {
    // 恢复“正常显示”：坐标轴与网格都显示
    uiStore.setGridVisible(true)
    renderer.setAxisGridVisible(true)
  }
}

const handleToggleAR = async (enabled: boolean) => {
  interaction.clearPreview()
  if (enabled) {
    uiStore.setLastModeBeforeAR(editor.mode)
    editor.setMode(EditorMode.Select)
    sceneStore.setCurrentMode(EditorMode.Select)
    uiStore.setARMode(true)
  } else {
    uiStore.setARMode(false)
    if (lastModeBeforeAR.value !== null) {
      editor.setMode(lastModeBeforeAR.value)
      sceneStore.setCurrentMode(lastModeBeforeAR.value)
    }
    uiStore.setLastModeBeforeAR(null)
  }

  try {
    await renderer.toggleAR(enabled)
    if (enabled) {
      const rotationState = collabManager.value?.getSharedWorldRotationState()
      if (rotationState) {
        renderer.setSharedWorldQuaternion(
          new THREE.Quaternion(
            rotationState.quaternion.x,
            rotationState.quaternion.y,
            rotationState.quaternion.z,
            rotationState.quaternion.w,
          ),
          rotationState.ownerClientId === null,
        )
        sharedRotationOwnerNotice.value =
          rotationState.ownerClientId !== null && !rotationState.isOwnedByLocal
            ? `${rotationState.ownerName || '其他用户'}正在旋转场景`
            : ''
      }
    } else {
      sharedRotationOwnerNotice.value = ''
    }
  } catch (err) {
    // rollback if AR 初始化失败
    if (enabled && lastModeBeforeAR.value !== null) {
      editor.setMode(lastModeBeforeAR.value)
      sceneStore.setCurrentMode(lastModeBeforeAR.value)
    }
    uiStore.setARMode(false)
    console.error(err)
  }
}

// ---- 从房间列表页跳转过来时自动加入协作房间 ----
const autoJoinRoomFromQuery = async (roomId: string) => {
  // 已在协作中则跳过
  if (collabManager.value?.getStatus().connected) return
  // 从 localStorage 读取加入凭证（跨 Tab 共享，比 sessionStorage 更可靠）
  const cacheKey = `collab:join:${roomId}`
  const cached = localStorage.getItem(cacheKey)
  if (!cached) return
  try {
    const { wsUrl, ticket, role } = JSON.parse(cached) as {
      wsUrl: string
      ticket: string
      role: 'creator' | 'editor' | 'viewer'
      roomName: string
    }
    // 拉取房间信息
    const room = await roomApi.getRoomDetail(roomId)
    // 权限检查：非成员不能通过缓存凭证自动加入（防止被移除后凭旧 ticket 重连）
    if (!room.isMember && room.ownerId !== user.value?.id) {
      console.warn('[autoJoinRoomFromQuery] 非成员，拒绝自动加入:', roomId)
      localStorage.removeItem(cacheKey)
      clearCollabInSession()
      return
    }
    room.myRole = role
    // 设置当前房间到 store（CollabPanel 正常流程会先调用此方法，这里补上）
    collabStore.setCurrentRoom(room)
    collabStore.setRoomName(room.id)

    // 先连接 WebSocket，连接成功后才加载协作内容
    // 连接失败则不加载任何协作项目数据
    const joinSuccess = await handleCollabJoin({ roomId, room, wsUrl, ticket })
    if (!joinSuccess) {
      // 连接失败：清理协作状态，不加载项目
      collabStore.setCurrentRoom(null)
      localStorage.removeItem(cacheKey)
      clearCollabInSession()
      return
    }

    // 连接成功后，若房间有关联项目且 Yjs 无共享数据（首位加入者），
    // 加载项目场景并推送到 Yjs。
    // 后续加入者：Yjs 已有数据，scene 已被 joinRoom 自动同步，无需加载项目。
    if (room.projectId && !collabManager.value?.hasSharedGeometry() && isSceneEmpty(scene)) {
      try {
        await loadProjectScene(room.projectId)
        // 将加载的项目场景推送到 Yjs 共享文档
        collabManager.value?.syncNow()
        // 首位加入者：上传项目历史到共享历史
        if (collabManager.value) {
          const sharedState = collabManager.value.getSharedHistoryState()
          if (sharedState.entries.length === 0) {
            const localSnapshotHistory = editor.historyManager.getSnapshotHistory()
            if (localSnapshotHistory.entries.length > 0) {
              collabManager.value.uploadLocalSnapshotHistory(
                localSnapshotHistory.entries,
                localSnapshotHistory.historyIndex,
                collabManager.value.getProviderClientId(),
                collabManager.value.getLocalUserLabel(),
              )
            } else if (!isSceneEmpty(scene)) {
              const after = exportScene(scene)
              const before = createEmptySerializedScene()
              collabManager.value.appendHistoryEntry({
                id: crypto.randomUUID(),
                actorClientId: collabManager.value.getProviderClientId(),
                actorName: collabManager.value.getLocalUserLabel(),
                createdAt: Date.now(),
                label: 'InitialScene',
                before,
                after,
              })
            }
          }
        }
      } catch {
        // 项目加载失败不阻塞已建立的协作连接
      }
    }

    // 清理缓存
    localStorage.removeItem(cacheKey)
    // 清除已移除标记，使房间列表重新显示该房间
    try {
      const _uid = authStore.user?.id || 'anonymous'
      const _key = `collab:removed_rooms:${_uid}`
      const _raw = localStorage.getItem(_key)
      if (_raw) {
        const _arr = JSON.parse(_raw) as string[]
        if (Array.isArray(_arr) && _arr.includes(roomId)) {
          localStorage.setItem(_key, JSON.stringify(_arr.filter((id) => id !== roomId)))
        }
      }
    } catch {
      // ignore
    }
    // 清理 URL 中的 roomId 参数，避免刷新时重复加入
    const restQuery = { ...route.query }
    delete restQuery.roomId
    router.replace({ query: restQuery })
  } catch (err) {
    console.error('[autoJoinRoomFromQuery] failed:', err)
    localStorage.removeItem(cacheKey)
    // 只清理当前浏览器的本地编辑器残留，不删除或写回服务端协作项目。
    if (collabStore.currentRoom) {
      handleCollabLeave('leave')
    } else {
      clearLocalSceneOnly()
      clearCollabInSession()
      currentProjectId.value = null
      currentProjectName.value = ''
      lastSavedSceneJson.value = null
      const restQuery = { ...route.query }
      delete restQuery.roomId
      router.replace({ query: restQuery })
    }
    showToast('⚠️ 协作恢复失败，已清理本地残留编辑器内容', 'global')
  }
}

// ---- 跨 Tab 协作房间事件监听 ----
const handleCollabRoomEvent = (event: CollabRoomEvent) => {
  const currentRoomId = collabStore.currentRoom?.id
  if (!currentRoomId || currentRoomId !== event.roomId) return
  if (event.type === 'leave') {
    // 用户在房间列表页离开了房间，同步退出协作
    handleCollabLeave('leave')
  } else if (event.type === 'close') {
    // 房间被创建者关闭，中断协作（不调 leaveRoom API，不发 leave 事件）
    handleCollabLeave('close')
  } else if (event.type === 'kick') {
    // 被创建者踢出：仅当 targetUserId 匹配当前用户时退出
    if (event.targetUserId && event.targetUserId === user.value?.id) {
      handleCollabLeave('kick')
    }
  } else if (
    event.type === 'visibility_change' ||
    event.type === 'role_change' ||
    event.type === 'permission_change'
  ) {
    // 房间可见性或成员角色变更：立即拉取最新房间信息同步到 store，
    // 不等下一轮轮询，使标签和操作权限即时刷新。
    void refreshRoomMetaFromServer()
  }
}

// 立即从服务端拉取房间元数据并同步到 store（用于跨 Tab 事件触发的即时刷新）
const refreshRoomMetaFromServer = async () => {
  const roomId = collabStore.currentRoom?.id
  if (!roomId) return
  try {
    // 协作中：跳过信令服务器 peerCount 查询（已通过 Yjs awareness 获得实时 peerCount）
    const room = await roomApi.getRoom(roomId, false)
    syncRoomMetaToStore(room)
  } catch {
    // 拉取失败忽略，下一轮轮询会重试
  }
}

// ---- 房间状态轮询：检测房间被关闭并中断协作，同时上报心跳维护在线人数 ----
let roomStatusTimer: ReturnType<typeof setInterval> | null = null
const ROOM_STATUS_POLL_INTERVAL = 10_000 // 10秒轮询一次

// 当前正在协作的房间 ID（跨 Tab 共享，供房间列表页判断按钮状态）
// 带 时间戳：编辑器每轮轮询会刷新时间戳；房间列表页据此判定标记是否新鲜，
// 避免编辑器 Tab 被直接关闭后标记长期残留。
const ACTIVE_ROOM_KEY = 'collab:active-room'
const setActiveRoom = (roomId: string | null) => {
  try {
    if (roomId) {
      localStorage.setItem(ACTIVE_ROOM_KEY, JSON.stringify({ roomId, ts: Date.now() }))
    } else {
      localStorage.removeItem(ACTIVE_ROOM_KEY)
    }
  } catch {
    // ignore storage errors
  }
}
// 刷新 active-room 时间戳（保持标记新鲜，证明编辑器 Tab 仍存活）
const touchActiveRoom = () => {
  try {
    const raw = localStorage.getItem(ACTIVE_ROOM_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { roomId?: string; ts?: number }
    if (parsed.roomId) {
      localStorage.setItem(
        ACTIVE_ROOM_KEY,
        JSON.stringify({ roomId: parsed.roomId, ts: Date.now() }),
      )
    }
  } catch {
    // ignore
  }
}
// 读取上次协作的 roomId（异常退出时 handleCollabLeave 未被调用，标记仍然存在）
const getActiveRoomId = (): string | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_ROOM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { roomId?: string; ts?: number }
    return parsed.roomId ?? null
  } catch {
    return null
  }
}

// 协作会话内标记（sessionStorage：按 Tab 隔离，刷新 / HMR 重载时保留，关闭 Tab 时清除）。
// 用于检测非用户主动离开协作房间的异常退出（浏览器崩溃、HMR、刷新等）：
// - 加入房间时写入；用户主动离开（handleCollabLeave 的所有 reason）时清除。
// - onMounted 检测到标记仍然存在 + URL 携带 projectId（非 roomId / newProject）时，
//   判定为异常退出，直接进入空白编辑器，避免协作项目残留数据被破坏。
const COLLAB_IN_SESSION_KEY = 'collab:in-session'
const setCollabInSession = () => {
  try {
    sessionStorage.setItem(COLLAB_IN_SESSION_KEY, String(Date.now()))
  } catch {
    // ignore storage errors
  }
}
const clearCollabInSession = () => {
  try {
    sessionStorage.removeItem(COLLAB_IN_SESSION_KEY)
  } catch {
    // ignore
  }
}
const hasCollabInSession = () => {
  try {
    return sessionStorage.getItem(COLLAB_IN_SESSION_KEY) !== null
  } catch {
    return false
  }
}

const stopRoomStatusPolling = () => {
  if (roomStatusTimer !== null) {
    clearInterval(roomStatusTimer)
    roomStatusTimer = null
  }
}

const startRoomStatusPolling = (roomId: string) => {
  stopRoomStatusPolling()
  let pollCount = 0
  roomStatusTimer = setInterval(async () => {
    // 仅在协作连接中才检查
    if (!collabManager.value?.getStatus().connected) return
    pollCount++
    try {
      // 协作轮询：跳过信令服务器 peerCount 查询，避免 N 人时请求放大
      const room = await roomApi.getRoom(roomId, false)
      if (!room.isOpen) {
        // 房间已被关闭，中断协作并提示用户
        stopRoomStatusPolling()
        handleCollabLeave()
        showToast('⚠️ 房间已被创建者关闭，协作已中断', 'global')
        return
      }
      // 实时同步房间元数据（公开/私密、角色、名称等）到 store，
      // 使协作面板标签和编辑器操作权限随服务端变化实时更新。
      syncRoomMetaToStore(room)

      // 每隔一轮检查一次成员身份（防止被踢出后仍留在房间）
      // 信令服务器会立即断开被踢用户的 WebSocket，此检查作为兜底
      if (pollCount % 2 === 0) {
        try {
          const detail = await roomApi.getRoomDetail(roomId, false)
          const myId = user.value?.id
          if (myId && !detail.members.some((m) => m.userId === myId)) {
            // 当前用户不在成员列表中，已被踢出
            stopRoomStatusPolling()
            handleCollabLeave()
            showToast('⚠️ 你已被移出协作房间', 'global')
            return
          }
        } catch {
          // 私密房间被踢后 getRoomDetail 返回 403，视为已被踢出
          stopRoomStatusPolling()
          handleCollabLeave()
          showToast('⚠️ 你已被移出协作房间', 'global')
          return
        }
      }

      // 上报心跳：标记当前用户在线，后端据此维护实时在线人数
      try {
        await roomApi.heartbeat(roomId)
      } catch {
        // 心跳失败不中断协作，下一轮继续尝试
      }
      // 刷新 active-room 时间戳，保持标记新鲜
      touchActiveRoom()
    } catch {
      // 房间可能已删除或无权限访问，中断协作
      stopRoomStatusPolling()
      handleCollabLeave()
      showToast('⚠️ 房间已不可用，协作已中断', 'global')
    }
  }, ROOM_STATUS_POLL_INTERVAL)
}

// 将房间元数据（isPublic、myRole、name、ownerName 等）同步到 collabStore，
// 当服务端值与本地不一致时就地更新对应字段。
// 关键：不替换 currentRoom 对象引用，仅修改变化字段，使 Vue 仅重渲染依赖该字段的组件，
// 避免每次轮询都触发工具栏按钮 + 协作面板全量重渲染（多人协作时掉帧根因之一）。
const syncRoomMetaToStore = (room: Room) => {
  const current = collabStore.currentRoom
  if (!current || current.id !== room.id) return
  if (current.isPublic !== room.isPublic) current.isPublic = room.isPublic
  if (current.myRole !== room.myRole) current.myRole = room.myRole
  if (current.name !== room.name) current.name = room.name
  if (current.ownerName !== room.ownerName) current.ownerName = room.ownerName
  if (current.ownerId !== room.ownerId) current.ownerId = room.ownerId
  if (current.maxMembers !== room.maxMembers) current.maxMembers = room.maxMembers
  if (current.allowShare !== room.allowShare) current.allowShare = room.allowShare
  if (current.disableExport !== room.disableExport) current.disableExport = room.disableExport
  if (current.disableImport !== room.disableImport) current.disableImport = room.disableImport
  if (current.disableClear !== room.disableClear) current.disableClear = room.disableClear
  if (current.disableUndoRedo !== room.disableUndoRedo)
    current.disableUndoRedo = room.disableUndoRedo
  if (current.defaultRole !== room.defaultRole) current.defaultRole = room.defaultRole
  if (current.onlineCount !== room.onlineCount) current.onlineCount = room.onlineCount
}

const handleCollabJoin = async ({
  roomId,
  room,
  wsUrl,
  ticket,
}: {
  roomId: string
  room: Room
  wsUrl: string
  ticket: string
}): Promise<boolean> => {
  collabStore.openJoinDialog('正在加入房间中...')
  try {
    // 在加入房间前，先获取本地快照历史（用于第一个成员上传）
    const localSnapshotHistory = editor.historyManager.getSnapshotHistory()

    await collabManager.value?.joinRoom(roomId, { wsUrl, ticket })
    scene.selection.clear()
    editor.selectedPoints = []
    // 协作模式下暂停本地 HistoryManager，使用共享历史代替
    editor.historyManager.pause()
    editor.historyVersion++
    collabManager.value?.setupHistoryObservers()
    collabManager.value?.setupCollabMessageObserver()
    collabManager.value?.syncLocalHistorySeqFromYjs()

    // ---- 加载关联项目 ----
    // 协作房间的项目是关联了真实项目的，加载协作项目=加载该项目，修改变动会同步到项目。
    // - Yjs 已有共享数据（后续加入者）：场景已被 joinRoom 自动同步，仅设置项目上下文
    // - Yjs 为空（首位加入者）：从后端加载项目场景，推送到 Yjs
    if (room.projectId && collabManager.value) {
      const hasShared = collabManager.value.hasSharedGeometry()
      if (!hasShared && isSceneEmpty(scene)) {
        // 首位加入者：从后端加载项目场景
        try {
          const detail = await projectApi.loadScene(room.projectId)
          currentProjectId.value = detail.id
          currentProjectName.value = detail.name
          router.replace({ query: { ...route.query, projectId: detail.id } })
          if (detail.sceneData) {
            try {
              const parsed = JSON.parse(detail.sceneData)
              const validation = validateSerializedScene(parsed)
              if (validation.valid && !isSerializedSceneEmpty(parsed as SerializedScene)) {
                importScene(scene, parsed as SerializedScene)
                scene.solveDirtyConstraints()
                scene.markAllRenderDirty()
                sceneStore.syncEditorState(editor)
                sceneStore.syncSceneState(scene)
                editor.clearHistory()
              }
            } catch (e) {
              console.error('加载协作项目场景失败:', e)
            }
          }
          lastSavedSceneJson.value = sceneToJsonForCompare(exportScene(scene))
          // 将加载的项目场景推送到 Yjs 共享文档
          collabManager.value.syncNow()
        } catch {
          // 项目加载失败不阻塞已建立的协作连接
        }
      } else {
        // 后续加入者：场景已从 Yjs 同步，仅设置项目上下文（使自动保存同步到真实项目）
        currentProjectId.value = room.projectId
        try {
          const detail = await projectApi.getProject(room.projectId)
          currentProjectName.value = detail.name
        } catch {
          currentProjectName.value = room.projectName || ''
        }
        router.replace({ query: { ...route.query, projectId: room.projectId } })
        lastSavedSceneJson.value = sceneToJsonForCompare(exportScene(scene))
      }
    }

    if (collabManager.value) {
      const sharedState = collabManager.value.getSharedHistoryState()
      if (sharedState.entries.length === 0) {
        // 第一个加入房间的成员：将本地完整历史上传为共享历史主线
        if (localSnapshotHistory.entries.length > 0) {
          collabManager.value.uploadLocalSnapshotHistory(
            localSnapshotHistory.entries,
            localSnapshotHistory.historyIndex,
            collabManager.value.getProviderClientId(),
            collabManager.value.getLocalUserLabel(),
          )
        } else if (!isSceneEmpty(scene)) {
          // 本地无历史但场景非空（如导入的场景），创建一条初始快照记录
          const after = exportScene(scene)
          const before = createEmptySerializedScene()
          collabManager.value.appendHistoryEntry({
            id: crypto.randomUUID(),
            actorClientId: collabManager.value.getProviderClientId(),
            actorName: collabManager.value.getLocalUserLabel(),
            createdAt: Date.now(),
            label: 'InitialScene',
            before,
            after,
          })
        }
      }
      // 后加入的成员：共享历史已有内容，自动同步即可（场景已被 joinRoom 同步）
    }

    collabStore.closeJoinDialog()
    showToast(`成功加入房间: ${room.name}`, 'global')
    // 标记当前正在协作的房间（跨 Tab 共享，供房间列表页判断按钮状态）
    setActiveRoom(roomId)
    // 标记当前 Tab 处于协作会话中（sessionStorage：刷新 / HMR 保留，用于异常退出检测）
    setCollabInSession()
    // 立即上报一次心跳，避免等待首个轮询周期才显示在线
    try {
      await roomApi.heartbeat(roomId)
    } catch {
      // 心跳失败不阻塞加入流程
    }
    // 启动房间状态轮询，检测房间被关闭并周期性上报心跳
    startRoomStatusPolling(roomId)
    return true
  } catch (err) {
    // 加入失败时恢复 HistoryManager
    editor.historyManager.resume()
    collabStore.closeJoinDialog()
    showToast('⚠️ 协作连接失败（请检查 websocket 服务）', 'global')
    console.error(err)
    return false
  }
}

// 尝试重新连接协作房间（异常退出后自动恢复）。
// 调用 roomApi.joinRoom 获取新的 wsUrl + ticket（旧 ticket 可能已过期），
// 然后 handleCollabJoin 建立连接并同步场景。
// 返回 true 表示重连成功，false 表示失败（房间已删除 / 无权限 / WebSocket 不可达等）。
const tryReconnectRoom = async (roomId: string): Promise<boolean> => {
  if (!collabManager.value) return false
  if (collabManager.value.getStatus().connected) return true
  try {
    // 获取新的加入凭证（ticket 是一次性的，缓存的旧 ticket 可能已失效）
    const joinResult = await roomApi.joinRoom(roomId)
    const room = await roomApi.getRoomDetail(roomId)
    room.myRole = joinResult.role
    collabStore.setCurrentRoom(room)
    collabStore.setRoomName(room.id)
    const joined = await handleCollabJoin({
      roomId,
      room,
      wsUrl: joinResult.wsUrl,
      ticket: joinResult.ticket,
    })
    return joined
  } catch (err) {
    console.error('[tryReconnectRoom] failed:', err)
    return false
  }
}

// 执行协作异常退出处理：清除标记 → 清空 URL → 重置场景 → 告知用户。
// 供 onMounted 检测到异常退出且无法重连时、以及 tryReconnectRoom 失败后调用。
const executeAbnormalExitHandling = () => {
  clearCollabInSession()
  // 清除 URL 中残留的 projectId，防止刷新后再次触发加载
  router.replace({ query: {} })
  // HMR 重载时 editorSession 是单例，场景中仍残留协作数据，需要主动清除。
  // 页面刷新场景下 session 是新建的、场景本身为空，此处清理是 no-op。
  resetEditorSession()
  if (editor.historyManager.isPaused) {
    editor.historyManager.resume()
  }
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)
  // 通过浏览器原生确认窗口告知用户协作异常退出。
  // 该窗口仅起告知作用，无论用户点击"确定"还是"取消"都不改变回到空白编辑器的保护策略。
  // 延迟弹窗，确保空白编辑器先完成渲染再阻塞主线程。
  setTimeout(() => {
    window.confirm('检测到上次协作异常退出。如需继续协作，请重新加入协作房间。')
  }, 0)
}

const handleCollabLeave = (reason: 'leave' | 'close' | 'kick' | 'disconnect' = 'leave') => {
  // 停止房间状态轮询
  stopRoomStatusPolling()
  // 清除当前正在协作的房间标记
  setActiveRoom(null)
  // 清除协作会话内标记（用户主动离开 / 服务器断开等已知退出，不再视为异常退出）
  clearCollabInSession()
  const cm = collabManager.value
  // 在断开前记录 roomId（leaveRoom 后 roomName 会被清空）
  const leftRoomId = collabStore.currentRoom?.id || cm?.getStatus().room || ''
  // 退出协作模式：将共享历史保留到本地 HistoryManager
  if (cm) {
    const sharedState = cm.getSharedHistoryState()

    const snapshotEntries = sharedState.entries.map((e) => ({
      before: e.before,
      after: e.after,
      label: e.label,
    }))
    editor.historyManager.resume()
    editor.historyManager.loadFromSharedHistory(snapshotEntries, sharedState.historyIndex)
    editor.historyVersion++
  } else {
    editor.historyManager.resume()
  }
  // 先断开协作连接，再清空本地场景。
  // 必须在 leaveRoom() 之后清空，否则清空操作会被 Yjs 同步回协作房间。
  cm?.leaveRoom()
  // 清空本地编辑器场景（不影响协作房间项目内容，因为已断开同步）
  clearLocalSceneOnly()
  // 房间关闭后清空协作历史消息，等待下次加入重置
  collabHistoryMessages.value = []
  // 退出关联项目：清理项目状态、URL query、浏览器标签标题
  currentProjectId.value = null
  currentProjectName.value = ''
  lastSavedSceneJson.value = null
  router.replace({ query: {} })
  sharedHistoryState.value = null
  updateLocalHistoryUI()
  collabStore.setPeerCount(1)
  // 清除协作房间状态
  collabStore.setCurrentRoom(null)

  // 跨 Tab 通知房间列表页：用户已离开房间，更新按钮状态
  // - 'leave'：正常离开，需调 leaveRoom API + 发 leave 事件
  // - 'close'：创建者关闭房间，已调 closeRoom API + 已发 close 事件，无需重复
  // - 'kick'：被踢出，后端 removeMember 已处理，无需再调 leaveRoom
  if (leftRoomId && reason === 'leave') {
    try {
      void roomApi.leaveRoom(leftRoomId)
    } catch {
      // 即使 API 失败也继续通知
    }
    collabRoomEvents.emit({
      type: 'leave',
      roomId: leftRoomId,
      timestamp: Date.now(),
    })
  }

  const msg =
    reason === 'close'
      ? '房间已关闭，协作已中断'
      : reason === 'kick'
        ? '你已被移出协作房间'
        : reason === 'disconnect'
          ? '协作连接已断开，已退出协作'
          : '已成功退出协作'
  showToast(msg, 'global')
}

// 清空本地编辑器场景但不触发协作同步（用于离开房间后重置为空白编辑器）
const clearLocalSceneOnly = () => {
  const scene = editor.scene
  scene.lines.clear()
  scene.straightLines.clear()
  scene.rays.clear()
  scene.vectors.clear()
  scene.circles.clear()
  scene.spheres.clear()
  scene.faces.clear()
  scene.cones.clear()
  scene.cylinders.clear()
  scene.perpendicularLines.clear()
  scene.parallelLines.clear()
  scene.nets.clear()
  // 保留原点，删除其他点
  const pointIds = [...scene.points.keys()].filter((id) => id !== Scene.ORIGIN_ID)
  pointIds.forEach((id) => scene.points.delete(id))
  scene.clearAllConstraints()
  scene.selection.clear()
  // 清空本地历史，避免 undo 恢复已清空的协作内容
  editor.historyManager.clear()
  editor.historyVersion++
}

const handleToast = (e: Event) => {
  const detail = (e as CustomEvent).detail
  if (typeof detail === 'string') showToast(detail, 'viewport')
  else if (detail && typeof detail.msg === 'string') {
    showToast(detail.msg, detail.scope === 'global' ? 'global' : 'viewport')
  }
}

// 统一的提示函数
const showToast = (msg: string, scope: 'global' | 'viewport' = 'global') => {
  if (toastTimer) clearTimeout(toastTimer)
  uiStore.openToast(msg, scope)
  toastTimer = window.setTimeout(() => {
    uiStore.closeToast()
  }, 1000)
}

const handleNewProjectCancel = () => {
  newProjectDialogVisible.value = false
  router.replace({ query: {} })
}

const handleNewProjectConfirm = async (data: {
  name: string
  description: string
  isPublic: boolean
  sceneFile: File | null
}) => {
  isCreatingProject.value = true
  try {
    const project = await projectApi.createProject({
      name: data.name,
      description: data.description || undefined,
      isPublic: data.isPublic,
    })

    currentProjectId.value = project.id
    currentProjectName.value = data.name
    newProjectDialogVisible.value = false
    router.replace({ query: { projectId: project.id } })

    if (data.sceneFile) {
      try {
        const sceneFileText = await data.sceneFile.text()
        const parsed = JSON.parse(sceneFileText)
        const validation = validateSerializedScene(parsed)
        if (!validation.valid) {
          showToast(`场景文件格式无效：${validation.error}`, 'global')
        } else if (isSerializedSceneEmpty(parsed as SerializedScene)) {
          showToast('场景文件内容为空，已创建空项目', 'global')
        } else {
          importScene(scene, parsed as SerializedScene)
          scene.solveDirtyConstraints()
          scene.markAllRenderDirty()
          sceneStore.syncEditorState(editor)
          sceneStore.syncSceneState(scene)
          const exportedScene = exportScene(scene)
          const thumbnailBlob = await captureThumbnailAsync()
          let thumbnailUrl: string | undefined
          if (thumbnailBlob) {
            try {
              thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob, project.id)
            } catch {
              thumbnailUrl = undefined
            }
          }
          await projectApi.saveScene(project.id, {
            sceneData: JSON.stringify(exportedScene),
            thumbnailUrl,
          })
          showToast('场景文件已加载并保存', 'global')
        }
      } catch (e) {
        console.error('场景文件处理失败:', e)
        showToast('场景文件解析失败', 'global')
      }
    }

    showToast('项目创建成功', 'global')
    lastSavedSceneJson.value = sceneToJsonForCompare(exportScene(scene))
    // 项目创建成功后清除草稿
    DraftStorageService.clearDraft()
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '创建项目失败'
    showToast(msg, 'global')
  } finally {
    isCreatingProject.value = false
  }
}

const handleNewProjectFromMenu = () => {
  if (currentProjectId.value) {
    showToast('当前场景已有正在编辑项目，请退出后创建', 'global')
    return
  }
  newProjectDialogVisible.value = true
}

const handleExitProject = async () => {
  // 协作中禁止退出项目：退出会破坏协作上下文，应先离开房间
  if (collabStore.currentRoom) {
    showToast('协作中无法退出项目，请先离开协作房间', 'global')
    return
  }
  await saveProjectIfChangedAndClose()
}

/**
 * 有变化时保存当前项目并退出（用于退出登录等场景）
 * @returns saved=true 表示本次实际执行了服务端保存且成功；saved=false 表示无项目/无变化/保存失败
 */
const saveProjectIfChangedAndClose = async (): Promise<boolean> => {
  if (!currentProjectId.value) return false
  const projectId = currentProjectId.value
  const sceneData = exportScene(scene)
  const compareJson = sceneToJsonForCompare(sceneData)
  const hasChanges = lastSavedSceneJson.value === null || compareJson !== lastSavedSceneJson.value
  let saved = false
  if (hasChanges) {
    try {
      const thumbnailBlob = await captureThumbnailAsync()
      let thumbnailUrl: string | undefined
      if (thumbnailBlob) {
        try {
          thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob, projectId)
        } catch {
          thumbnailUrl = undefined
        }
      }
      await projectApi.saveScene(projectId, {
        sceneData: JSON.stringify(sceneData),
        thumbnailUrl,
      })
      saved = true
    } catch (err) {
      console.error('退出前保存失败:', err)
    }
  }
  // 不管保存是否成功，都继续清理场景（这与"主动退出"语义一致；草稿仅在保存成功时清除）
  const emptyScene = createEmptySerializedScene()
  importScene(scene, emptyScene)
  scene.solveDirtyConstraints()
  scene.markAllRenderDirty()
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)
  currentProjectId.value = null
  currentProjectName.value = ''
  lastSavedSceneJson.value = null
  // O4：保存成功时清草稿（虽然项目场景不走草稿路径，这里仍然清理以防未来扩展引入），
  // 保存失败时保留草稿作为最后一道防线——下次用户打开编辑器还能从草稿恢复
  if (saved) {
    DraftStorageService.clearDraft()
  }
  router.replace({ query: {} })
  if (hasChanges) {
    showToast('已保存并退出项目', 'global')
  }
  return saved
}

const handleEditProject = async () => {
  if (!currentProjectId.value) return
  try {
    const detail = await projectApi.getProject(currentProjectId.value)
    editProjectName.value = detail.name
    editProjectDescription.value = detail.description
    editProjectIsPublic.value = detail.isPublic
    editProjectDialogVisible.value = true
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '获取项目信息失败'
    showToast(msg, 'global')
  }
}

const handleEditProjectConfirm = async (data: {
  name: string
  description: string
  isPublic: boolean
}) => {
  if (!currentProjectId.value) return
  try {
    await projectApi.updateProject(currentProjectId.value, {
      name: data.name,
      description: data.description,
      isPublic: data.isPublic,
    })
    currentProjectName.value = data.name
    editProjectDialogVisible.value = false
    showToast('项目信息已更新', 'global')
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '更新项目信息失败'
    showToast(msg, 'global')
  }
}

const handleEditProjectCancel = () => {
  editProjectDialogVisible.value = false
}

const handleEditProjectDelete = async () => {
  if (!currentProjectId.value) return
  const projectId = currentProjectId.value
  try {
    await projectApi.deleteProject(projectId)
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '删除项目失败'
    showToast(msg, 'global')
    return
  }
  const emptyScene = createEmptySerializedScene()
  importScene(scene, emptyScene)
  scene.solveDirtyConstraints()
  scene.markAllRenderDirty()
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)
  currentProjectId.value = null
  currentProjectName.value = ''
  lastSavedSceneJson.value = null
  editProjectDialogVisible.value = false
  router.replace({ query: {} })
  showToast('项目已删除', 'global')
}

/**
 * 创建协作房间时自动创建的项目加载到编辑器：
 * 使编辑器绑定新项目，后续编辑可实时保存到项目数据库记录。
 */
const handleProjectCreated = (projectId: string) => {
  if (!projectId) return
  currentProjectId.value = projectId
  // 同步 URL，使刷新后仍能恢复项目
  router.replace({ query: { ...route.query, projectId } })
  // 拉取项目名称
  void projectApi
    .getProject(projectId)
    .then((detail) => {
      currentProjectName.value = detail.name
    })
    .catch(() => {
      // 获取项目信息失败不阻塞
    })
  // 记录当前场景快照用于后续变更检测
  lastSavedSceneJson.value = sceneToJsonForCompare(exportScene(scene))
}

const loadProjectScene = async (projectId: string) => {
  try {
    const detail = await projectApi.loadScene(projectId)
    currentProjectId.value = detail.id
    currentProjectName.value = detail.name
    router.replace({ query: { projectId: detail.id } })
    if (detail.sceneData) {
      try {
        const parsed = JSON.parse(detail.sceneData)
        const validation = validateSerializedScene(parsed)
        if (validation.valid && !isSerializedSceneEmpty(parsed as SerializedScene)) {
          importScene(scene, parsed as SerializedScene)
          scene.solveDirtyConstraints()
          scene.markAllRenderDirty()
          sceneStore.syncEditorState(editor)
          sceneStore.syncSceneState(scene)
          uiStore.setContentGroupsCollapsed(true)
          editor.clearHistory()
        }
      } catch (e) {
        console.error('加载场景数据失败:', e)
      }
    }
    lastSavedSceneJson.value = sceneToJsonForCompare(exportScene(scene))
    showToast(`已加载项目：${detail.name}`, 'global')
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '加载项目失败'
    showToast(msg, 'global')
  }
}

/**
 * 跨 Tab 重新登录处理：
 * - 有项目：重新拉取项目场景（用户/项目可能已经变化）
 * - 临时编辑器：本地草稿继续保留，提示用户已切换
 */
const handleCrossTabLogin = (event: CrossTabLoginEvent) => {
  // store.user 已被 reinitializeFromStorageToken 同步更新
  // 这里只需让视图重新走一遍自己的初始化逻辑
  if (currentProjectId.value) {
    // B10：同账号重登（changed=false）时项目数据未变（服务端 token 刷新了，但项目 owner 没变），
    //       跳过重新加载；切换账号（changed=true）才必须重新走 loadProjectScene
    //       （新 owner 可能没有这个项目的访问权限）。
    if (event.changed) {
      void loadProjectScene(currentProjectId.value)
    }
  } else if (appSettings.value.draftProtection && !isSceneEmpty(scene)) {
    // 临时编辑器 + 草稿开启：提示用户已经切换账号，草稿仍保留
    showToast('其他标签页已重新登录，当前草稿继续保留', 'global')
  }
}

const handleSaveScene = async () => {
  if (!currentProjectId.value) {
    showToast('当前未关联项目，无需保存', 'global')
    return
  }
  try {
    const sceneData = exportScene(scene)
    const sceneJson = JSON.stringify(sceneData)
    const compareJson = sceneToJsonForCompare(sceneData)
    if (lastSavedSceneJson.value !== null && compareJson === lastSavedSceneJson.value) {
      showToast('已是最新场景', 'global')
      return
    }
    const thumbnailBlob = await captureThumbnailAsync()
    let thumbnailUrl: string | undefined
    if (thumbnailBlob) {
      try {
        thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob, currentProjectId.value)
      } catch {
        thumbnailUrl = undefined
      }
    }
    await projectApi.saveScene(currentProjectId.value, {
      sceneData: sceneJson,
      thumbnailUrl,
    })
    lastSavedSceneJson.value = compareJson
    showToast('保存成功', 'global')
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '保存失败'
    showToast(msg, 'global')
  }
}
</script>

<template>
  <div class="editor-root">
    <Transition name="fade-overlay">
      <div v-if="collabJoinDialog.visible" class="collab-wait-overlay">
        <div class="collab-wait-dialog">
          <div class="collab-spinner"></div>
          <div class="collab-wait-text">{{ collabJoinDialog.message }}</div>
        </div>
      </div>
    </Transition>

    <InputDialog
      :visible="mergePointDialog.visible"
      title="合并点"
      @confirm="handleConfirmMergePoints"
      @cancel="handleCancelMergePoints"
    >
      <div class="dialog-desc">请选择要保留为合并结果的点</div>
      <label v-for="point in mergePointSelection" :key="point.id" class="merge-point-option">
        <input v-model="mergePointDialog.targetId" type="radio" :value="point.id" />
        <span
          >{{ point.name }}（{{ point.position.x.toFixed(2) }}, {{ point.position.y.toFixed(2) }},
          {{ point.position.z.toFixed(2) }}）</span
        >
      </label>
      <div class="merge-point-warning">{{ mergePointWarning }}</div>
    </InputDialog>

    <InputDialog
      :visible="alignPointsDialog.visible"
      title="点轴对齐"
      :can-confirm="alignPointsReferenceCandidates.length >= 2"
      :body-class="alignShakeActive ? 'shake-warning' : ''"
      @confirm="handleConfirmAlignPoints"
      @cancel="handleCancelAlignPoints"
    >
      <div class="align-dialog-desc">选择基准点与基准轴，其他选中点将沿基准轴对齐到基准点</div>
      <div class="dialog-label">基准点</div>
      <label
        v-for="point in alignPointsReferenceCandidates"
        :key="point.id"
        class="merge-point-option align-point-option"
      >
        <input
          :value="point.id"
          :checked="alignPointsDialog.referenceId === point.id"
          type="radio"
          name="align-points-reference"
          @change="uiStore.setAlignPointsReference(point.id)"
        />
        <span class="align-point-name">{{ point.name }}</span>
        <span class="align-point-coord"
          >（{{ point.position.x.toFixed(2) }}, {{ point.position.y.toFixed(2) }},
          {{ point.position.z.toFixed(2) }}）</span
        >
        <span v-if="alignPointsPreviewMap.has(point.id)" class="align-point-preview">
          <svg
            class="align-point-arrow"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="4" y1="12" x2="20" y2="12" />
            <polyline points="14 6 20 12 14 18" />
          </svg>
          <span class="align-point-preview-coord">
            （{{ alignPointsPreviewMap.get(point.id)!.x.toFixed(2) }},
            {{ alignPointsPreviewMap.get(point.id)!.y.toFixed(2) }},
            {{ alignPointsPreviewMap.get(point.id)!.z.toFixed(2) }}）
          </span>
        </span>
      </label>
      <div class="dialog-label">基准轴</div>
      <div class="align-axis-group">
        <button
          type="button"
          class="align-axis-btn"
          :class="{ active: alignPointsDialog.axis === 'x' }"
          @click="uiStore.setAlignPointsAxis('x')"
        >
          X 轴
        </button>
        <button
          type="button"
          class="align-axis-btn"
          :class="{ active: alignPointsDialog.axis === 'y' }"
          @click="uiStore.setAlignPointsAxis('y')"
        >
          Y 轴
        </button>
        <button
          type="button"
          class="align-axis-btn"
          :class="{ active: alignPointsDialog.axis === 'z' }"
          @click="uiStore.setAlignPointsAxis('z')"
        >
          Z 轴
        </button>
      </div>
      <div v-if="alignPointsWarningPoints.length > 0" class="align-points-warning">
        <div class="align-points-warning-title">以下点无法矫正，可删除后重试：</div>
        <div class="align-points-warning-tags">
          <span
            v-for="entry in alignPointsWarningPoints"
            :key="entry.point.id"
            class="align-warning-tag"
          >
            <span class="align-warning-tag-label">{{ entry.point.name }}</span>
            <button
              v-if="alignPointsReferenceCandidates.length >= 3"
              type="button"
              class="align-warning-tag-remove"
              title="取消选中该点"
              @click="handleRemoveAlignWarningPoint(entry.point.id)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </span>
        </div>
      </div>
    </InputDialog>

    <InputDialog
      :visible="regularPolygonDialog.visible"
      title="正多边形"
      :error-message="regularPolygonVertexError"
      :can-confirm="canConfirmRegularPolygon"
      :min-step-hint="MIN_STEP_HINT_TEXT"
      :min-step-value="3"
      @confirm="handleConfirmRegularPolygon"
      @cancel="handleCancelRegularPolygon"
    >
      <div class="dialog-desc">请输入顶点数</div>
      <input
        v-model.number="regularPolygonDialog.vertexCount"
        type="number"
        min="3"
        step="1"
        class="dialog-input"
        :class="{ 'dialog-input-error': regularPolygonVertexError }"
        @keydown.enter="handleConfirmRegularPolygon"
      />
    </InputDialog>

    <InputDialog
      :visible="normalCircleRadiusDialog.visible"
      title="输入半径"
      :error-message="normalCircleRadiusError"
      :can-confirm="canConfirmNormalCircleRadius"
      :min-step-hint="MIN_STEP_HINT_TEXT"
      :min-step-value="0.5"
      @confirm="handleConfirmNormalCircleRadius"
      @cancel="handleCancelNormalCircleRadius"
    >
      <label class="dialog-label">半径</label>
      <input
        v-model.number="normalCircleRadiusDialog.radius"
        type="number"
        min="0.5"
        step="0.5"
        class="dialog-input"
        :class="{ 'dialog-input-error': normalCircleRadiusError }"
        @keydown.enter="handleConfirmNormalCircleRadius"
      />
    </InputDialog>

    <InputDialog
      :visible="radiusSphereDialog.visible"
      title="输入半径"
      :error-message="radiusSphereRadiusError"
      :can-confirm="canConfirmRadiusSphereRadius"
      :min-step-hint="MIN_STEP_HINT_TEXT"
      :min-step-value="0.5"
      @confirm="handleConfirmRadiusSphereRadius"
      @cancel="handleCancelRadiusSphereRadius"
    >
      <label class="dialog-label">半径</label>
      <input
        v-model.number="radiusSphereDialog.radius"
        type="number"
        min="0.5"
        step="0.5"
        class="dialog-input"
        :class="{ 'dialog-input-error': radiusSphereRadiusError }"
        @keydown.enter="handleConfirmRadiusSphereRadius"
      />
    </InputDialog>

    <InputDialog
      :visible="coneRadiusDialog.visible"
      title="输入半径"
      :error-message="coneRadiusRadiusError"
      :can-confirm="canConfirmConeRadius"
      :min-step-hint="MIN_STEP_HINT_TEXT"
      :min-step-value="0.5"
      @confirm="handleConfirmConeRadius"
      @cancel="handleCancelConeRadius"
    >
      <label class="dialog-label">半径</label>
      <input
        v-model.number="coneRadiusDialog.radius"
        type="number"
        min="0.5"
        step="0.5"
        class="dialog-input"
        :class="{ 'dialog-input-error': coneRadiusRadiusError }"
        @keydown.enter="handleConfirmConeRadius"
      />
    </InputDialog>

    <InputDialog
      :visible="cylinderRadiusDialog.visible"
      title="输入底面半径"
      :error-message="cylinderRadiusError"
      :can-confirm="canConfirmCylinderRadius"
      :min-step-hint="MIN_STEP_HINT_TEXT"
      :min-step-value="0.5"
      @confirm="handleConfirmCylinderRadius"
      @cancel="handleCancelCylinderRadius"
    >
      <label class="dialog-label">半径</label>
      <input
        v-model.number="cylinderRadiusDialog.radius"
        type="number"
        min="0.5"
        step="0.5"
        class="dialog-input"
        :class="{ 'dialog-input-error': cylinderRadiusError }"
        @keydown.enter="handleConfirmCylinderRadius"
      />
    </InputDialog>

    <Transition name="toast-fade">
      <div v-if="toastVisible && toastScope === 'global'" class="toast-container">
        <div class="toast-content">
          {{ toastMessage }}
        </div>
      </div>
    </Transition>

    <Toolbar
      :is-coordinate-system-visible="isCoordinateSystemVisible"
      :is-ar-mode="isARMode"
      :has-active-project="!!currentProjectId"
      :current-project-id="currentProjectId"
      :view-only="isViewOnlyCollab"
      :collab-create-trigger="collabCreateTrigger"
      @mode-change="onModeChange"
      @clear-all="handleClearAll"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-ar="handleToggleAR"
      @collab-join="handleCollabJoin"
      @collab-leave="handleCollabLeave"
      @collab-room-closed="() => handleCollabLeave('close')"
      @export-scene="handleExportScene"
      @import-scene="handleImportScene"
      @save-scene="handleSaveScene"
      @new-project="handleNewProjectFromMenu"
      @exit-project="handleExitProject"
      @edit-project="handleEditProject"
      @open-align-points="handleOpenAlignPoints"
      @project-created="handleProjectCreated"
    />

    <div ref="editorBodyRef" class="editor-body">
      <div ref="sidebarShellRef" class="sidebar-shell" :style="sidebarShellStyle">
        <Sidebar :scene="scene" :editor="editor" :view-only="isViewOnlyCollab" />
      </div>
      <div
        class="sidebar-width-resizer"
        :class="{ 'is-dragging': isDraggingSidebarWidth, 'is-disabled': !isSidebarResizeEnabled }"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        @pointerdown="startSidebarWidthDrag"
      >
        <span class="sidebar-width-resizer-handle"></span>
      </div>

      <div ref="viewportRef" class="viewport">
        <div v-if="isViewOnlyCollab" class="view-only-banner">正在观看协作，当前编辑权限不可用</div>
        <Transition name="toast-fade">
          <div v-if="toastVisible && toastScope === 'viewport'" class="toast-container-viewport">
            <div class="toast-content">
              {{ toastMessage }}
            </div>
          </div>
        </Transition>
        <Transition name="toast-fade">
          <div v-if="sharedRotationOwnerNotice" class="rotation-owner-notice">
            {{ sharedRotationOwnerNotice }}
          </div>
        </Transition>
        <!-- 协作历史消息框：房间关闭前始终维持，关闭后清空重置 -->
        <CollabHistoryBox v-if="collabStore.isConnected" :messages="collabHistoryMessages" />
        <!-- 协作拖拽感知气泡层：跟随被拖拽的几何元素（含自己），显示"xxx正在操作..." -->
        <div
          v-if="activeDrags.length > 0"
          ref="dragAwarenessLayerRef"
          class="drag-awareness-layer"
        >
          <div
            v-for="drag in activeDrags"
            :key="drag.clientId"
            class="drag-awareness-bubble"
            :data-client-id="drag.clientId"
          >
            <span class="drag-awareness-bubble-text">{{ drag.userName || '其他用户' }}正在操作...</span>
            <span class="drag-awareness-bubble-tail" aria-hidden="true"></span>
          </div>
        </div>
        <div class="performance-indicators">
          <div class="fps-indicator">FPS: {{ fps }}</div>
          <div v-if="collabStatus.connected && collabLatencyMs !== null" class="latency-indicator">
            {{ collabLatencyMs }} ms
          </div>
        </div>
        <div v-if="!isARMode" class="viewport-controls">
          <button
            type="button"
            class="axis-control grid-toggle-control"
            @click="handleToggleCoordinateSystem(!isCoordinateSystemVisible)"
          >
            {{ isCoordinateSystemVisible ? '坐标系关' : '坐标系开' }}
          </button>
          <button
            type="button"
            class="axis-control grid-toggle-control"
            @click="handleToggleGridVisible"
            :disabled="!isCoordinateSystemVisible"
          >
            {{ isGridVisible ? '网格隐藏' : '网格开启' }}
          </button>
          <button type="button" class="axis-control" @click="handleResetView">复位</button>
          <select
            v-model.number="axisGridSize"
            class="axis-control"
            @change="handleAxisGridSizeChange"
            :disabled="!isCoordinateSystemVisible"
          >
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="40">40</option>
          </select>
        </div>
      </div>
    </div>

    <Timeline />

    <SettingsPanel />

    <NewProjectDialog
      :visible="newProjectDialogVisible"
      @confirm="handleNewProjectConfirm"
      @cancel="handleNewProjectCancel"
    />

    <EditProjectDialog
      :visible="editProjectDialogVisible"
      :project-name="editProjectName"
      :project-description="editProjectDescription"
      :project-is-public="editProjectIsPublic"
      @confirm="handleEditProjectConfirm"
      @cancel="handleEditProjectCancel"
      @delete="handleEditProjectDelete"
    />

    <Transition name="fade-overlay">
      <div v-if="draftRecoveryVisible" class="recovery-overlay">
        <div class="recovery-dialog">
          <div class="recovery-title">恢复场景</div>
          <div class="recovery-desc">
            编辑器可能被意外关闭，是否恢复上一次的场景？<br />若取消，则再也无法恢复。
          </div>
          <div class="recovery-actions">
            <button
              type="button"
              class="recovery-btn recovery-btn-cancel"
              @click="handleDraftRecoveryCancel"
            >
              取消
            </button>
            <button
              type="button"
              class="recovery-btn recovery-btn-confirm"
              @click="handleDraftRecoveryConfirm"
            >
              恢复
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <div v-if="isPortraitOnPhone" class="portrait-guard" role="alert">
      <div class="portrait-guard-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="48" height="48">
          <path
            fill="currentColor"
            d="M21.5 7.5h-9A2 2 0 0 0 10.5 9.5v15a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-15a2 2 0 0 0-2-2zm-4.5 18a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3.5-4h-7V10h7v11.5z"
          />
        </svg>
        <span class="rotate-hint">⟳</span>
      </div>
      <p class="portrait-guard-text">请将手机旋转至横屏方向以获取更好的编辑体验</p>
    </div>
  </div>
</template>

<style scoped>
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
  min-width: 0;
}
.sidebar-shell {
  display: flex;
  min-height: 0;
  min-width: 0;
  flex: 0 0 auto;
  overflow: hidden;
}

.sidebar-shell :deep(.sidebar) {
  width: 100%;
  min-width: 100%;
  max-width: none;
  flex: 1 1 auto;
}

.sidebar-width-resizer {
  position: relative;
  z-index: 20;
  width: 12px;
  margin-left: -6px;
  margin-right: -6px;
  flex: 0 0 12px;
  cursor: col-resize;
  touch-action: none;
  background: transparent;
}

.sidebar-width-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 1px;
  background: #333;
  transform: translateX(-50%);
}

.sidebar-width-resizer-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 48px;
  border-radius: 999px;
  background: #6f6f6f;
  box-shadow: 0 0 0 2px #111111;
  transform: translate(-50%, -50%);
}

.sidebar-width-resizer:hover .sidebar-width-resizer-handle,
.sidebar-width-resizer.is-dragging .sidebar-width-resizer-handle {
  background: #9fd8ff;
}

.sidebar-width-resizer.is-dragging::before {
  background: #9fd8ff;
}

.sidebar-width-resizer.is-disabled {
  cursor: default;
}

.sidebar-width-resizer.is-disabled .sidebar-width-resizer-handle {
  background: #5a5a5a;
}

.performance-indicators {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  pointer-events: none;
}

.fps-indicator,
.latency-indicator {
  background: transparent;
  color: #ffffff;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  white-space: nowrap;
}

.rotation-owner-notice {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 30;
  max-width: min(280px, calc(100% - 24px));
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  background: rgba(18, 18, 18, 0.78);
  color: #ffffff;
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

/* 协作拖拽感知气泡层：覆盖在 canvas 之上、控件之下，不拦截任何指针事件 */
.drag-awareness-layer {
  position: absolute;
  inset: 0;
  z-index: 20;
  overflow: hidden;
  pointer-events: none;
}

/* "xxx正在操作..."消息气泡：白色背景、黑色字体，位于元素右侧并指向元素 */
.drag-awareness-bubble {
  position: absolute;
  display: inline-flex;
  align-items: center;
  transform: translateY(-50%);
  padding: 6px 12px 6px 16px;
  border-radius: 999px;
  background: #ffffff;
  color: #000000;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  will-change: left, top;
}

.drag-awareness-bubble-text {
  pointer-events: none;
}

/* 指向左侧元素的三角尾巴：右缘略微探入气泡内部，与气泡白色背景无缝衔接（无边框痕迹） */
.drag-awareness-bubble-tail {
  position: absolute;
  left: -5px;
  top: 50%;
  width: 0;
  height: 0;
  margin-top: -5px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-right: 8px solid #ffffff;
}

/* 仅观看模式顶部居中提示 */
.view-only-banner {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  padding: 6px 16px;
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 999px;
  background: rgba(30, 58, 95, 0.85);
  color: #8db8f5;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  pointer-events: none;
  backdrop-filter: blur(6px);
  white-space: nowrap;
}

.viewport-controls {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.axis-control {
  width: 72px;
  height: 34px;
  box-sizing: border-box;
  border: 1px solid #444;
  background: transparent;
  color: #ffffff;
  padding: 6px 10px;
  border-radius: 4px;
  outline: none;
  font-size: 14px;
  line-height: 20px;
  text-align: center;
}

button.axis-control {
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  cursor: pointer;
}

button.grid-toggle-control {
  width: 72px;
  font-size: 12px;
  line-height: 20px;
}

button.grid-toggle-control:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

select.axis-control option {
  background: #111111;
  color: #ffffff;
}

.viewport {
  flex: 1;
  background: #000;
  position: relative; /* 必须加上这个！作为 Video 和 Canvas 的定位基准 */
  overflow: hidden; /* 防止视频溢出 */
  min-height: 0;
  min-width: 0;
}

/* 提示框样式：位于屏幕正中间 */
.toast-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  pointer-events: none; /* 确保不影响对页面的操作 */
}

.collab-wait-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.collab-wait-dialog {
  min-width: 240px;
  padding: 20px 24px;
  border: 1px solid #ffffff;
  border-radius: 8px;
  background: rgba(20, 20, 20, 0.94);
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.collab-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #43f260;
  border-radius: 50%;
  animation: collab-spin 0.8s linear infinite;
}

.collab-wait-text {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.merge-point-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #444;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  font-size: 13px;
  color: #ffffff;
}

.merge-point-warning {
  color: #ffd75a;
  font-size: 12px;
  line-height: 1.5;
}

.align-axis-group {
  display: flex;
  gap: 8px;
}

.align-axis-btn {
  flex: 1;
  padding: 8px 0;
  border: 1px solid #444;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: #cfcfcf;
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.align-axis-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.align-axis-btn.active {
  background: rgba(80, 150, 255, 0.22);
  border-color: #5096ff;
  color: #ffffff;
}

.align-points-warning {
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.32);
}

.align-points-warning-title {
  color: #ff8a80;
  font-size: 12px;
  margin-bottom: 6px;
}

.align-points-warning-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.align-warning-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 8px;
  border-radius: 10px;
  background: rgba(255, 80, 80, 0.18);
  border: 1px solid rgba(255, 80, 80, 0.4);
}

.align-warning-tag-label {
  color: #ffb4a8;
  font-size: 12px;
}

.align-warning-tag-remove {
  width: 16px;
  height: 16px;
  min-width: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: #ff8a80;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.align-warning-tag-remove:hover {
  background: rgba(255, 80, 80, 0.4);
  color: #ffffff;
}

.align-warning-tag-remove svg {
  width: 10px;
  height: 10px;
}

.align-point-option {
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  white-space: nowrap;
}

.align-point-name {
  color: #ffffff;
}

.align-point-coord {
  color: #a0a0a0;
}

.align-point-preview {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: 2px;
}

.align-point-arrow {
  width: 14px;
  height: 14px;
  color: #5096ff;
  flex-shrink: 0;
}

.align-point-preview-coord {
  color: #5096ff;
  font-size: 12px;
}

.align-dialog-desc {
  color: #7a8a9a;
  font-size: 12px;
  line-height: 1.5;
  padding-left: 8px;
  border-left: 2px solid #3a4a5a;
  font-style: italic;
}

.dialog-desc {
  color: #a0a0a0;
  font-size: 13px;
}

.dialog-label {
  color: #a0a0a0;
  font-size: 13px;
}

.dialog-input {
  width: 100%;
  padding: 8px 10px;
  background: #222;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
}

.dialog-input-error {
  border-color: #f25c5c !important;
}

.dialog-input-error:focus {
  border-color: #f25c5c !important;
  box-shadow: 0 0 0 2px rgba(242, 92, 92, 0.12) !important;
}
.toast-container-viewport {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 40;
  pointer-events: none;
}

.toast-content {
  background: rgba(30, 30, 30, 0.9);
  color: #43f260;
  padding: 16px 32px;
  border-radius: 4px;
  border: 1px solid #ffffff;
  font-size: 16px;
  font-weight: bold;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

/* 动画效果 */
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -60%); /* 消失时稍微向上位移一点 */
}

@keyframes collab-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

/* 草稿恢复对话框 */
.recovery-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.recovery-dialog {
  min-width: 320px;
  max-width: min(420px, calc(100vw - 48px));
  padding: 24px 28px;
  border: 1px solid #ffffff;
  border-radius: 8px;
  background: rgba(20, 20, 20, 0.96);
  color: #ffffff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.recovery-title {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 12px;
}

.recovery-desc {
  font-size: 14px;
  color: #b0b0b0;
  line-height: 1.6;
  margin-bottom: 20px;
}

.recovery-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.recovery-btn {
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #444;
  transition: all 0.15s ease;
}

.recovery-btn-cancel {
  background: transparent;
  color: #b0b0b0;
}

.recovery-btn-cancel:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ffffff;
}

.recovery-btn-confirm {
  background: #43f260;
  color: #111111;
  border-color: #43f260;
}

.recovery-btn-confirm:hover {
  background: #5ff87a;
  border-color: #5ff87a;
}

@media (max-width: 1024px) and (orientation: landscape) {
  .performance-indicators {
    top: 8px;
    right: 8px;
  }

  .fps-indicator,
  .latency-indicator {
    padding: 4px 8px;
    font-size: 11px;
  }

  .viewport-controls {
    right: 8px;
    bottom: 8px;
  }

  .toast-content {
    padding: 12px 20px;
    font-size: 14px;
  }
}

@media (max-width: 768px), (pointer: coarse) {
  .performance-indicators {
    flex-direction: column;
    align-items: flex-end;
    gap: 0;
  }
}

.portrait-guard {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 24px;
  background: #0f172a;
  color: #f8fafc;
  text-align: center;
}

.portrait-guard-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #f8fafc;
}

.portrait-guard-icon .rotate-hint {
  position: absolute;
  bottom: -10px;
  right: -14px;
  font-size: 28px;
  color: #38bdf8;
  animation: portrait-guard-spin 2s linear infinite;
}

.portrait-guard-text {
  font-size: 16px;
  letter-spacing: 0.5px;
  opacity: 0.92;
}

@keyframes portrait-guard-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
