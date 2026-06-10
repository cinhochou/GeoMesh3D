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

import { EditorMode } from '../core/editor/Editor'
import type { Command } from '../core/editor/Command'
import type { HistoryEntry } from '../core/editor/HistoryManager'
import type { Point3 } from '../core/geometry/Point3'
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
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { CollabManager } from '../core/collab/CollabManager'
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

const { scene, editor, originalExecuteCommand, originalExecuteHistoryEntry, originalUndo, originalRedo, originalBeginTransaction, originalCommitTransaction, originalBeginCollabTransaction, originalCommitCollabTransaction } = getEditorSession()

let renderer: ThreeRenderer
let interaction: Interaction
let animationFrameId: number | null = null
let solverWorker: Worker | null = null
let scheduleSolverFlush = () => {}
let detachSolverListener = () => {}
let solverFlushRequested = false
let solverFlushReady = false

const collabManager = ref<CollabManager | null>(null)

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

const newProjectDialogVisible = ref(false)
const currentProjectId = ref<string | null>(null)
const currentProjectName = ref('')
const isCreatingProject = ref(false)
const lastSavedSceneJson = ref<string | null>(null)

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
    e.preventDefault()
    editor.undo()
    return
  }

  if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    editor.redo()
  }
}

// ---- 草稿自动保存与意外关闭恢复 ----

/** 自动保存：根据设置和项目状态决定保存行为 */
const autoSave = async () => {
  if (currentProjectId.value) {
    // 有项目：根据 autoSaveProject 设置决定是否自动保存到服务端
    if (!appSettings.value.autoSaveProject) return
    try {
      const sceneData = exportScene(scene)
      const compareJson = sceneToJsonForCompare(sceneData)
      if (lastSavedSceneJson.value !== null && compareJson === lastSavedSceneJson.value) return
      const thumbnailBlob = await captureThumbnailAsync()
      let thumbnailUrl: string | undefined
      if (thumbnailBlob) {
        try {
          thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob)
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
  // 两个开关都关闭时不需要调度
  if (!currentProjectId.value && !appSettings.value.draftProtection) return
  if (currentProjectId.value && !appSettings.value.autoSaveProject) return
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
 */
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
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
  if (!currentProjectId.value && appSettings.value.draftProtection && !isSceneEmpty(scene)) {
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
    if (!currentProjectId.value && appSettings.value.draftProtection) {
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

  if (route.query.projectId) {
    currentProjectId.value = route.query.projectId as string
  }

  if (route.query.newProject === 'true') {
    newProjectDialogVisible.value = true
  } else if (route.query.projectId) {
    loadProjectScene(route.query.projectId as string)
  }

  // 草稿恢复：无项目且 draftProtection 开启时检查是否需要弹出恢复提示
  // 从切换用户取消流程返回时跳过（场景已在 editorSession 中保留）
  if (!route.query.projectId && appSettings.value.draftProtection) {
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

  renderer = new ThreeRenderer(viewportRef.value!, appSettings.value)
  uiStore.setAxisGridSize(renderer.getAxisGridSize())
  uiStore.setGridVisible(renderer.isAxisGridVisible())
  uiStore.setCoordinateSystemVisible(renderer.isCoordinateSystemVisible())
  interaction = new Interaction(editor, renderer)
  interaction.setGlobalPointValueMode(isGlobalPointValueMode.value)
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
    collabStore.setStatus(status)
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
        cm!.appendHistoryEntry({
          id: crypto.randomUUID(),
          actorClientId: clientId,
          actorName: cm!.getLocalUserLabel(),
          createdAt: Date.now(),
          label,
          before,
          after,
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
        cm!.appendHistoryEntry({
          id: crypto.randomUUID(),
          actorClientId: clientId,
          actorName: cm!.getLocalUserLabel(),
          createdAt: Date.now(),
          label: entry.label,
          before,
          after,
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
  editor.setMode(mode)
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
  const confirmed = window.confirm('⚠"清空"会删除场景中的所有对象。确定要继续吗？')
  if (!confirmed) return

  editor.clearAll()
  showToast('已清空所有对象', 'global')
}

const handleExportScene = async () => {
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
  editor.undo()
}

const handleRedo = () => {
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

const handleToggleCollab = async ({ open, room }: { open: boolean; room: string }) => {
  if (open) {
    collabStore.openJoinDialog('正在加入房间中...')
    try {
      // 在加入房间前，先获取本地快照历史（用于第一个成员上传）
      const localSnapshotHistory = editor.historyManager.getSnapshotHistory()

      await collabManager.value?.joinRoom(room)
      scene.selection.clear()
      editor.selectedPoints = []
      // 协作模式下暂停本地 HistoryManager，使用共享历史代替
      editor.historyManager.pause()
      editor.historyVersion++
      collabManager.value?.setupHistoryObservers()
      collabManager.value?.syncLocalHistorySeqFromYjs()

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
      showToast(`成功加入房间: ${room}`, 'global')
    } catch (err) {
      // 加入失败时恢复 HistoryManager
      editor.historyManager.resume()
      collabStore.closeJoinDialog()
      showToast('⚠️ 协作连接失败（请检查 websocket 服务）', 'global')
      console.error(err)
    }
    return
  }

  const cm = collabManager.value
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
  cm?.leaveRoom()
  sharedHistoryState.value = null
  updateLocalHistoryUI()
  collabStore.setPeerCount(1)
  showToast('已成功退出协作', 'global')
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
              thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob)
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
          thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob)
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
        thumbnailUrl = await projectApi.uploadThumbnail(thumbnailBlob)
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
      @mode-change="onModeChange"
      @clear-all="handleClearAll"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-ar="handleToggleAR"
      @toggle-collab="handleToggleCollab"
      @export-scene="handleExportScene"
      @import-scene="handleImportScene"
      @save-scene="handleSaveScene"
      @new-project="handleNewProjectFromMenu"
      @exit-project="handleExitProject"
      @edit-project="handleEditProject"
    />

    <div ref="editorBodyRef" class="editor-body">
      <div ref="sidebarShellRef" class="sidebar-shell" :style="sidebarShellStyle">
        <Sidebar :scene="scene" :editor="editor" />
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
