<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import * as THREE from 'three'

import Toolbar from '../components/Toolbar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/Timeline.vue'
import AnimationFloatWindow from '../components/AnimationFloatWindow.vue'
import AnimationLibraryDialog from '../components/AnimationLibraryDialog.vue'
import { FloatSceneRenderer } from '../renderer/FloatSceneRenderer'
import InputDialog from '../components/InputDialog.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import NewProjectDialog from '../components/NewProjectDialog.vue'
import SaveAsMyProjectDialog from '../components/SaveAsMyProjectDialog.vue'
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
  mergeScene,
  isSceneEmpty,
  isSerializedSceneEmpty,
  isSameSerializedScene,
  serializeSceneForCompare as sceneToJsonForCompare,
  type SerializedScene,
} from '../core/editor/SceneSerializer'
import { SnapshotCommand } from '../core/editor/commands/SnapshotCommand'
import { Scene } from '../core/scene/Scene'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { AnimationRecorder } from '../core/animation/AnimationRecorder'
import { AnimationPlayer } from '../core/animation/AnimationPlayer'
import { ShadowScene, type CameraController } from '../core/animation/ShadowScene'
import {
  animationCompareJson,
  attachAnimationToSceneData,
  deserializeAnimationDocument,
  deserializeRecordingSession,
  serializeAnimationDocument,
  serializeRecordingSession,
} from '../core/animation/AnimationSerializer'
import { AnimationBroadcastChannel } from '../core/collab/AnimationBroadcast'
import { useAnimationStore } from '../store/animationStore'
import { useAnimationLibraryStore } from '../store/animationLibraryStore'
import {
  CollabManager,
  type DragLockTarget,
  type RemoteDragState,
} from '../core/collab/CollabManager'
import {
  collectSceneElementIds,
  computeLockScope,
  computeWritePointsForElementIds,
} from '../core/collab/lockScope'
import { collabWriteEvents } from '../utils/collabWriteEvents'
import SolverSchedulerWorker from '../core/perf/solverScheduler.worker?worker'
import { useUiStore, type AppSettings } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'
import { useCollabStore } from '@/store/collabStore'
import { useAuthStore } from '@/store/authStore'
import { projectApi } from '@/api/project'
import { ApiError } from '@/api/client'
import { DraftStorageService, RoomAnimationCache } from '@/core/editor/DraftStorageService'
import { useOrientationLock } from '@/composables/useOrientationLock'
import { useSessionGuard } from '@/composables/useSessionGuard'
import { crossTabLoginEvents, type CrossTabLoginEvent } from '@/utils/sessionEvents'
import { collabRoomEvents, type CollabRoomEvent } from '@/utils/collabRoomEvents'
import {
  setActiveRoom as registerActiveRoom,
  removeActiveRoom as unregisterActiveRoom,
  touchActiveRoom as touchActiveRoomRegistry,
  getFreshestActiveRoomId,
} from '@/utils/activeRoomRegistry'
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
const animationStore = useAnimationStore()
const animationLibraryStore = useAnimationLibraryStore()

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
      const sceneData = exportSceneWithAnimationData()
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
  resetProjectContext()
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

// ─── 动画系统（操作录像机）───
let animationRecorder: AnimationRecorder | null = null
let animationPlayer: AnimationPlayer | null = null
let shadowScene: ShadowScene | null = null

/** 协作动画广播通道（加入房间后建立，离开时销毁） */
let broadcastChannel: AnimationBroadcastChannel | null = null
/** 广播存活轮询（共享表在房主停止心跳时不会有事件，需轮询兜底） */
let broadcastLivenessTimer: number | null = null
/** 当前正在观看的广播段 id（用于判断是否需要退出播放） */
let broadcastWatchingSessionId: string | null = null
/** 上一次已装载的广播载荷（避免每次轮询都重新解析并重建临时会话） */
let lastBroadcastPayload: { sessionId: string | null; text: string | null } = {
  sessionId: null,
  text: null,
}

/** 浮窗播放的第二渲染栈（仅在浮窗模式下存在） */
let floatRenderer: FloatSceneRenderer | null = null
/** 主视图降帧计数（浮窗开启时主视图隔帧渲染） */
let mainViewFrameSkipCounter = 0
/**
 * 浮窗开启时，主视图在**空闲**状态下的渲染间隔。
 *
 * 取 2 即「隔帧渲染」：在 60Hz 屏幕上主视图约 30fps、浮窗仍为满帧。
 * 一旦主视图有指针活动（拖拽/旋转/滚轮）会立即恢复满帧，
 * 保证在浮窗播放的同时继续作图不卡顿。
 */
const FLOAT_MODE_MAIN_VIEW_FRAME_SKIP = 2

/**
 * 主视图「满帧」状态的持续时间（毫秒）。
 * 每次指针活动都会重新计时；超过该时长才回落到降帧策略。
 */
const MAIN_VIEW_FULL_RATE_AFTER_ACTIVITY_MS = 600

/** 主视图最近一次指针活动时刻（performance.now()；0 表示从未活动） */
let mainViewLastActivityAt = 0
/** 记录主视图指针活动（用于「活动时满帧、空闲时降帧」） */
const markMainViewActivity = () => {
  mainViewLastActivityAt = performance.now()
}
/** 主视图画布上的活动监听（挂载时注册、卸载时解除） */
let mainViewActivityCleanup: (() => void) | null = null

const bindMainViewActivityListeners = (canvas: HTMLCanvasElement) => {
  const events = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'] as const
  events.forEach((name) => canvas.addEventListener(name, markMainViewActivity, { passive: true }))
  mainViewActivityCleanup = () => {
    events.forEach((name) => canvas.removeEventListener(name, markMainViewActivity))
    mainViewActivityCleanup = null
  }
}

const collabManager = ref<CollabManager | null>(null)

// 外部触发打开"创建协作"对话框（房间列表"创建房间"跳转时置为 1）
const collabCreateTrigger = ref(0)

/** 协作事务：将多个 executeCommand 调用合并为一条共享历史记录 */
let collabTransactionDepth = 0
let collabTransactionBefore: SerializedScene | null = null
let collabTransactionLabel = ''
/**
 * 本事务是否真的执行过命令。
 * 空事务（例如「清空名称」被判定为无效输入后所有 update* 都早退）不应写入共享历史，
 * 否则协作模式下会凭空多出一条可撤销的空记录。
 */
let collabTransactionDirty = false

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

/**
 * 统一的提示函数（**所有提示都应经此路径**）。
 *
 * ⚠ 不要直接调用 `uiStore.openToast`：它没有自动关闭逻辑，
 * 一旦被直接调用，提示会永久停留在屏幕正中间
 * （用户实测反馈过「一直显示 xxx 正在广播动画」）。
 */
const showToast = (
  msg: string,
  scope: 'global' | 'viewport' = 'global',
  durationMs = 1000,
) => {
  if (toastTimer) clearTimeout(toastTimer)
  uiStore.openToast(msg, scope)
  toastTimer = window.setTimeout(() => {
    uiStore.closeToast()
  }, durationMs)
}

/** 需要稍长阅读时间的提示时长（广播类消息） */
const LONG_TOAST_MS = 2600

const sharedRotationOwnerNotice = ref('')

// 协作拖拽感知：房间内所有用户（含自己）正在拖拽的几何元素（用于渲染"xxx正在操作..."气泡）
const dragAwarenessLayerRef = ref<HTMLElement | null>(null)
const activeDrags = ref<RemoteDragState[]>([])
// 气泡位于元素屏幕坐标右侧的间距（px）
const DRAG_BUBBLE_GAP_PX = 18

/**
 * 汇总房间内「他人」的占用态，分发给渲染层（红光反馈）与交互层（悬停 not-allowed 预判）。
 * 本用户自己的拖拽不计入——自己的占用不该干扰自己的视觉与操作。
 * 锁判定用点级（最小精确），红光呈现用对象级（直观），这里分发的是呈现集。
 */
const refreshOccupiedFeedback = () => {
  const cm = collabManager.value
  const localClientId = cm?.getProviderClientId() ?? null
  const occupied = new Set<string>()
  for (const drag of activeDrags.value) {
    if (localClientId !== null && drag.clientId === localClientId) continue
    if (drag.presentIds && drag.presentIds.length > 0) {
      drag.presentIds.forEach((id) => occupied.add(id))
    } else {
      // 旧版本协作者只广播单元素：至少把它自己标红
      occupied.add(drag.elementId)
    }
  }
  renderer.setOccupied(occupied)
  interaction.setBlockedDragIds(occupied)
}

/**
 * 非拖拽写路径的互斥拦截（侧边栏改数值、删除、对齐、合并、撤销/重做等）。
 * 命令实例 → 场景元素 id → 写入点集 → 与远端拖拽的写入点集求交，
 * 与拖拽共用同一套判据，避免「拖拽被锁住了但侧边栏还能改」的漏洞。
 * 返回提示文案与被拦元素 id；无冲突返回 null。
 */
const resolveWriteConflictMessage = (
  source: unknown,
): { message: string; elementIds: string[] } | null => {
  const cm = collabManager.value
  if (!cm || cm.getStatus().room === null) return null
  if (cm.getIsApplyingSharedHistory()) return null
  const elementIds = collectSceneElementIds(scene, source)
  if (elementIds.length === 0) return null
  const writePoints = computeWritePointsForElementIds(scene, elementIds)
  const conflict = cm.canWritePoints(writePoints)
  if (!conflict) return null
  const blocker = conflict.userName || '其他用户'
  const subject = conflict.rootName || '相关几何对象'
  return { message: `${subject} 正被 ${blocker} 操作，本次修改已取消`, elementIds }
}

// 协作历史消息（UI 骨架阶段为空数组；消息机制后续讨论后落实）
const collabHistoryMessages = ref<CollabHistoryMessage[]>([])

const newProjectDialogVisible = ref(false)
const currentProjectId = ref<string | null>(null)
const currentProjectName = ref('')
// 当前项目所有者 ID：用于判定"他人项目"，决定是否进入只读+另存为模式
const currentProjectOwnerId = ref<string | null>(null)
// 当前项目描述/公开性：作为「另存为我的项目」弹窗的默认值
const currentProjectDescription = ref('')
const currentProjectIsPublic = ref(true)
// 是否从公开资源页进入（URL ?from=public）
const openedFromPublic = ref(false)
// 另存为我的项目：弹窗可见性与提交中状态
const saveAsDialogVisible = ref(false)
const isSavingAs = ref(false)
const isCreatingProject = ref(false)
const lastSavedSceneJson = ref<string | null>(null)
/**
 * 动画数据的独立保存基线。
 *
 * 为什么需要独立基线：`serializeSceneForCompare` 会剔除 `animation` 字段
 * （动画不参与场景等价判定），因此「只改了录制内容」在场景比对里看不出变化；
 * 若不做这份独立比对，纯动画改动就永远不会被保存。
 */
const lastSavedAnimationJson = ref<string>('')

// 协作仅观看模式：当前用户在协作房间中角色为 viewer 时，禁止编辑操作
const isViewOnlyCollab = computed(
  () => !!collabStore.currentRoom && collabStore.currentRoom.myRole === 'viewer',
)

// ---- 他人公开项目（只读）判定 ----
// 语义：当前打开的项目属于他人（ownerId ≠ 当前用户），且是通过公开资源页进入的。
// 二者同时成立才认定为"他人公开项目"：
//   - 仅 ownerId 不等于自己还不够 —— 用户可能通过 URL 直接访问他人项目，
//     此时应视为无权限访问（由后端拒绝），而不是给出只读+另存为入口；
//   - from=public 只作为 UI 识别信号，真正的权限仍由后端在 scene/save 接口把关。
/**
 * 视口顶部是否已有提示横幅（他人项目预览/只读协作）。
 * 用于给「播放中」提示让位，避免两条横幅叠在一起。
 */
const hasViewportTopBanner = computed(() => isForeignProject.value || isViewOnlyCollab.value)

const isForeignProject = computed(
  () =>
    !!currentProjectId.value &&
    !!currentProjectOwnerId.value &&
    currentProjectOwnerId.value !== user.value?.id,
)

// 他人公开项目是否已进入"编辑态"：
// 用户点击"点击编辑"后为 true —— 场景可自由编辑，但所有改动都只存在于内存/临时副本中，
// 绝不回写源项目（自动保存已被 isForeignProject 拦截）。
const isForeignEditing = ref(false)

// 统一的「只读」状态：协作观看者 或 他人公开项目的「预览态」（尚未点击编辑）
const isReadOnly = computed(
  () => isViewOnlyCollab.value || (isForeignProject.value && !isForeignEditing.value),
)

// 协作房间权限（实时响应 currentRoom 变化）：创建者可在房间列表配置这些限制，
// 协作中所有成员的对应操作会被实时禁用。非协作模式下均为 false。
const collabDisableExport = computed(() => !!collabStore.currentRoom?.disableExport)
const collabDisableImport = computed(() => !!collabStore.currentRoom?.disableImport)
const collabDisableClear = computed(() => !!collabStore.currentRoom?.disableClear)
const collabDisableUndoRedo = computed(
  () => !!collabStore.currentRoom?.disableUndoRedo && collabStore.currentRoom?.myRole !== 'creator',
)

// 生效的导入模式：协作房间内以房主设定的「房间导入模式」为准（全体成员强制遵循，
// 房主本人同样遵循）；房间外才使用设置面板中的本地导入模式。
const effectiveImportMode = computed(
  () => collabStore.currentRoom?.importMode ?? appSettings.value.importMode,
)

// 权限变化时实时同步到 Interaction（viewer / 他人公开项目 不能拖拽/创建/删除，但可选中浏览）
// 动画播放期间同样锁定：播放渲染的是影子场景，若允许拾取会出现「看不到选中却改了主场景」。
const syncInteractionLock = () => {
  // 规则见 store.locksMainViewInteraction（浮窗播放时主视图保持可编辑）
  interaction?.setViewOnly(isReadOnly.value || animationStore.locksMainViewInteraction)
  // 不再处于锁定态时清除残留的「操作被拦截」提示
  if (!animationStore.locksMainViewInteraction) animationStore.clearInteractionBlockedHint()
}

watch(isReadOnly, syncInteractionLock)
watch(() => animationStore.playback.active, syncInteractionLock)
watch(() => animationStore.mode, syncInteractionLock)

// ---- 动画系统「环境能力」（AR + 协作权限，单一来源）----

/** 房主是否禁止成员录制动画（房主本人不受限） */
const collabDisableRecordAnimation = computed(
  () =>
    !!collabStore.currentRoom?.disableRecordAnimation &&
    collabStore.currentRoom.myRole !== 'creator',
)

/**
 * 汇总所有环境限制。这是动画录制/浮窗/相机能力的唯一判定处：
 *  - AR：设备摄像头即相机、虚实叠加 → 禁止录制与浮窗，也不移动虚拟相机；
 *  - 协作：房主可禁止成员录制（房主除外）；
 *  - 协作 viewer：无法改动场景，录制只会得到空会话，一并禁止。
 */
const animationCapabilities = computed(() => {
  const ar = isARMode.value
  const collabBlocked = collabDisableRecordAnimation.value
  const viewerBlocked = isViewOnlyCollab.value
  return {
    canRecord: !ar && !collabBlocked && !viewerBlocked,
    canFloat: !ar,
    canMoveCamera: !ar,
    recordBlockedReason: ar
      ? 'AR 模式下只能播放，不能录制'
      : collabBlocked
        ? '房主已禁止成员录制动画'
        : viewerBlocked
          ? '仅观看权限不能录制动画'
          : '',
  }
})

/** 把能力写入 store；若因此中止了进行中的录制，给出对应提示 */
const applyAnimationCapabilities = () => {
  const caps = animationCapabilities.value
  const stopped = animationStore.setCapabilities(caps)
  if (stopped) {
    showToast(
      caps.recordBlockedReason ? `${caps.recordBlockedReason}，录制已结束` : '录制已结束',
      'viewport',
      LONG_TOAST_MS,
    )
  }
}

// ---- 浮窗播放（第二 renderer）----

/** 是否应显示浮窗（规则见 store.shouldShowFloatWindow） */
const showFloatWindow = computed(() => animationStore.shouldShowFloatWindow)

/** 浮窗容器就绪/销毁 → 创建/释放第二渲染栈 */
const handleFloatContainer = (el: HTMLElement | null) => {
  disposeFloatRenderer()
  if (!el) return
  try {
    floatRenderer = new FloatSceneRenderer(el, {
      antialias: appSettings.value.antialias,
      backgroundColor: 0x111111,
      pixelRatioScale: appSettings.value.pixelRatioScale,
      onContextLost: handleFloatContextLost,
      // 以主视图画布高度为基准等比缩放精灵与标签，避免小窗里点过大、标签重叠
      getReferenceCanvasHeight: () => renderer.renderer.domElement.clientHeight,
      axisGridSize: renderer.getAxisGridSize(),
    })
  } catch (err) {
    // 双 WebGL 上下文在低配设备/上下文数超限时可能创建失败：降级为原地播放
    console.warn('[Animation] 浮窗渲染器创建失败，已回退原地播放', err)
    floatRenderer = null
    showToast('浮窗渲染器创建失败，已切回原地播放', 'viewport', LONG_TOAST_MS)
    animationStore.setMode('inline')
    return
  }
  // 小窗与原地共用同一个播放视角：优先用已记下的播放视角；
  // 若本次播放是从小窗直接开始的（还没有播放视角），
  // 此刻主相机所持的正是播放视角（聚焦已写入），直接沿用它 → 两个载体视角一致。
  const seedView = playbackView ?? cameraControllerRef?.getState() ?? null
  if (seedView) {
    floatRenderer.setCameraState(seedView)
    playbackView = seedView
  }
  floatRenderer.setSize(el.clientWidth || 1, el.clientHeight || 1)
  // 关键：渲染脏状态是「一次性消费」的，创建浮窗渲染器之前可能已被主视图消费，
  // 此时浮窗的 syncer 看不到任何脏标记 → 画面全空。这里强制影子场景全量重建。
  shadowScene?.scene?.markAllRenderDirty()

  // 若本次播放是「直接以小窗开始」的（模式切换 watch 不会触发）：
  // 进入播放时聚焦写到了主相机上，此刻播放视角已经搬到浮窗，
  // 主视图显示的是编辑器场景 → 必须把主相机交还编辑器视角。
  void nextTick(() => {
    if (animationStore.playback.active && animationStore.mode === 'float') {
      handMainViewBackToEditor()
    }
  })
}

const handleFloatResize = (width: number, height: number) => {
  floatRenderer?.setSize(width, height)
}

const handleFloatResetCamera = () => {
  floatRenderer?.resetCamera()
}

const handleFloatToggleAxes = (visible: boolean) => {
  floatRenderer?.setCoordinateSystemVisible(visible)
}

/** WebGL 上下文丢失：无法继续渲染，降级回原地播放并提示 */
const handleFloatContextLost = () => {
  showToast('浮窗渲染上下文已丢失，已切回原地播放', 'viewport', LONG_TOAST_MS)
  disposeFloatRenderer()
  animationStore.setMode('inline')
}

const disposeFloatRenderer = () => {
  floatRenderer?.dispose()
  floatRenderer = null
}

/** 主视图相机控制器（延迟创建） */
let cameraControllerRef: CameraController | null = null

/**
 * 播放视角（**原地播放与小窗播放共用同一个**）。
 *
 * 视角一共两个，各自独立：
 *  1. 编辑器视角：非播放态下主视图的视角（由 ShadowScene 的存档保管，退出播放时还原）
 *  2. 播放视角：动画播放的视角，**原地与小窗是同一条**，切换载体时原样带过去
 *
 * 切换载体只做「把播放视角从一个载体搬到另一个载体」+「主视图交还/收回编辑器视角」，
 * 绝不把编辑器视角复制给播放，也不把播放视角带回编辑器。
 */
let playbackView: ReturnType<CameraController['getState']> | null = null

/** 清空播放视角（退出播放时调用，下次播放重新开始） */
const clearPlaybackView = () => {
  playbackView = null
}

/**
 * 把主视图交还编辑器场景：写入编辑器自己的视角存档（而不是留着播放视角）。
 * 原地播放期间主相机持的是播放视角，一旦主视图改为显示编辑器场景就必须换回来。
 */
const handMainViewBackToEditor = () => {
  const editorView = animationPlayer?.getEditorCameraBaseline()
  if (editorView) cameraControllerRef?.setState(editorView)
}
/** 复位主视图轨道控制的距离钳制（播放聚焦会临时放开，退出播放时复位） */
let restoreControlsDistanceClampRef: (() => void) | null = null

// ---- 协作动画广播（房主演示 / 成员跟随）----

/**
 * 建立广播通道（加入房间后调用）。
 * 成员侧通过 observe 即时响应，另加 1s 轮询兜底处理「房主停止心跳导致的过期」——
 * 心跳停止不会产生任何 Yjs 事件，只能靠轮询发现。
 */
const setupBroadcastChannel = () => {
  teardownBroadcastChannel()
  const cm = collabManager.value
  if (!cm) return
  const maps = cm.getAnimationBroadcastMaps()
  broadcastChannel = new AnimationBroadcastChannel(
    maps,
    cm.getYjsClientId(),
    () => cm.getLocalUserLabel() ?? '房主',
  )
  animationStore.bindBroadcastChannel(broadcastChannel)
  broadcastChannel.observe(() => syncBroadcastFromShared())
  broadcastLivenessTimer = window.setInterval(() => syncBroadcastFromShared(), 1000)
  syncBroadcastFromShared()
}

const teardownBroadcastChannel = () => {
  if (broadcastLivenessTimer !== null) {
    clearInterval(broadcastLivenessTimer)
    broadcastLivenessTimer = null
  }
  // 房主离开前先撤掉广播，避免成员一直等到心跳过期
  if (broadcastChannel?.isBroadcasting) broadcastChannel.stopBroadcast()
  broadcastChannel?.dispose()
  broadcastChannel = null
  animationStore.unbindBroadcastChannel()
  animationStore.clearBroadcastView()
  animationPlayer?.clearTransientSessions()
  broadcastWatchingSessionId = null
}

/**
 * 同步广播状态（共享表 → 本地）。
 *
 * 分工：
 *  - 房主：只维护自身视图标记（forceWatch）与心跳，不做「被广播」处理；
 *  - 成员：把广播段导入为**临时会话**（不写入本地文档，避免随自动保存污染房间项目），
 *    并在未被收起时强制进入该段播放，随后按控制状态纠偏。
 */
const syncBroadcastFromShared = () => {
  const channel = broadcastChannel
  if (!channel) return

  // 房间要求强制观看 → 成员无法收起
  animationStore.setBroadcastForceWatch(!!collabStore.currentRoom?.forceWatchAnimation)

  if (channel.isBroadcasting) {
    // 房主自身：心跳由通道负责；视图标记已在 startBroadcast 中设置
    return
  }

  const state = channel.getActiveBroadcast()
  if (!state) {
    // 广播已结束（或被判定过期）
    if (broadcastWatchingSessionId !== null) {
      broadcastWatchingSessionId = null
      animationPlayer?.clearTransientSessions()
      if (animationStore.isActive) animationStore.exitPlayback()
    }
    lastBroadcastPayload = { sessionId: null, text: null }
    animationStore.applyRemoteBroadcast(null, null)
    return
  }

  // 轮询与 Yjs 事件都会触发本函数（约 1s 一次，且事件可能更密）。
  // 广播数据在一次开播内是不变的，若每次都 JSON.parse 整段并重建临时会话，
  // 会周期性触发 buildSnapshotCache 全量重放，大录制段（数百步）会掉帧。
  // 因此缓存「上次已装载的 sessionId + payload 文本」，未变则跳过。
  const payloadText = channel.getSessionPayload(state.sessionId)
  if (
    payloadText !== null &&
    (lastBroadcastPayload.sessionId !== state.sessionId ||
      lastBroadcastPayload.text !== payloadText)
  ) {
    const session = deserializeRecordingSession(payloadText)
    if (session) animationPlayer?.setTransientSession(session)
    lastBroadcastPayload = { sessionId: state.sessionId, text: payloadText }
  } else if (payloadText === null) {
    lastBroadcastPayload = { sessionId: null, text: null }
  }
  const session = animationPlayer?.getTransientSession(state.sessionId) ?? null
  animationStore.applyRemoteBroadcast(
    { sessionId: state.sessionId, hostName: state.hostName },
    session,
  )

  // ─── 成员侧「对账」而非「边沿触发」───
  //
  // 期望态：正在跟随广播（isWatchingBroadcast）→ 应当处于**这条广播**的播放中。
  // 实际态：playback.active 且 playback.sessionId === 该广播。
  //
  // 两者不一致就纠正。相比「只在 sessionId 变化时进入一次」的边沿写法，对账能
  // 自动收敛以下全部路径（之前每种都要单独处理，漏一个就出 bug）：
  //   · 首次跟随（广播开始）
  //   · 收起后重新跟随（followBroadcast）
  //   · 跟随中手动退出播放 → 又希望回到广播
  //   · 已收起（dismissed）→ 必须退出广播播放，否则「收起」看起来毫无反应
  const watching = animationStore.isWatchingBroadcast
  const playingThisBroadcast =
    animationStore.isActive && animationStore.playback.sessionId === state.sessionId

  if (!watching || !session) {
    // 不再跟随（或数据未就绪）：若仍在该广播的播放里就退出，交还编辑场景
    if (playingThisBroadcast) animationStore.exitPlayback()
    if (!watching) broadcastWatchingSessionId = null
    return
  }

  if (!playingThisBroadcast) {
    // 进入 / 重新进入广播播放。录制中的成员会被中断（封存已录内容）
    if (animationStore.isRecording) {
      animationStore.stopRecording()
      showToast('房主开始广播动画，已结束你正在进行中的录制', 'global', LONG_TOAST_MS)
    }
    animationStore.enterPlayback(state.sessionId)
    animationStore.toStart()
  }

  if (broadcastWatchingSessionId !== state.sessionId) {
    broadcastWatchingSessionId = state.sessionId
    showToast(`${state.hostName || '房主'} 正在广播动画`, 'global', LONG_TOAST_MS)
  }

  // 控制状态纠偏（只对齐步与播放态/方向/节奏/循环，不对齐到毫秒）
  const p = animationStore.playback
  if (p.direction !== state.direction) animationStore.setDirection(state.direction)
  if (p.autoAdvanceMs !== state.autoAdvanceMs) animationStore.setAutoAdvance(state.autoAdvanceMs)
  if (p.loop !== state.loop) animationStore.setLoop(state.loop)
  if (p.cursor !== state.cursor) animationStore.goto(state.cursor)
  if (p.playing !== state.playing) {
    if (state.playing) animationStore.play()
    else animationStore.pause()
  }
}

// 草稿自动保存与意外关闭恢复
const draftRecoveryVisible = ref(false)
let autoSaveTimer: number | null = null
let periodicSaveTimer: number | null = null
const AUTO_SAVE_DEBOUNCE = 3_000
const PERIODIC_SAVE_INTERVAL = 30_000

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
 * antialias 的变更需要刷新页面才能生效，不在预览中处理
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

  // ── 播放视图快捷键（优先级最高；播放期间同时屏蔽编辑器快捷键）──
  // 播放渲染的是影子场景，此时对主场景做撤销/重做会让用户看不到变化却改了数据。
  const anim = animationStore.playback
  if (anim.active) {
    // 观看他人广播时本地播放控制被锁（由心跳纠偏），快捷键一并不响应，
    // 否则会出现「按了空格却 1 秒后被房主状态纠正」的打架观感。
    if (animationStore.isWatchingBroadcast) {
      if (e.code === 'Space' || e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
      }
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      animationStore.togglePlay()
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      animationStore.next()
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      animationStore.prev()
      return
    }
    return
  }

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

// ---- 动画数据（操作录像机）持久化 ----

/** 当前动画文档的持久化形态（无可保存内容时为 null） */
const currentAnimationPayload = () => serializeAnimationDocument(animationStore.document)

/**
 * 导出「含动画」的场景数据，用于所有落盘路径
 * （项目保存 / 场景文件导出 / 草稿）。
 * 注意：历史快照与协作同步**不要**用这个——它们不需要动画数据。
 */
const exportSceneWithAnimationData = (): SerializedScene => {
  const data = exportScene(scene)
  attachAnimationToSceneData(data, animationStore.document)
  return data
}

/** 从场景数据恢复动画文档；数据缺失或损坏时清空（回到无动画状态） */
const applyAnimationFromSceneData = (data: SerializedScene | null | undefined): void => {
  // 先安全退出播放：避免播放器仍指向即将被替换/删除的旧会话
  animationPlayer?.exit()
  const doc = deserializeAnimationDocument(data?.animation)
  if (doc) animationStore.setDocument(doc)
  else animationStore.reset()
}

/** 记录「当前已落盘」基线（场景 + 动画），统一入口避免遗漏 */
const markSavedBaseline = (): void => {
  lastSavedSceneJson.value = sceneToJsonForCompare(exportScene(scene))
  lastSavedAnimationJson.value = animationCompareJson(currentAnimationPayload())
}

/** 清空基线（切换/退出文档时调用） */
const clearSavedBaseline = (): void => {
  lastSavedSceneJson.value = null
  lastSavedAnimationJson.value = ''
}

/** 是否存在未落盘改动（场景或动画任一变化） */
const hasUnsavedChanges = (): boolean => {
  const sceneJson = sceneToJsonForCompare(exportScene(scene))
  const animJson = animationCompareJson(currentAnimationPayload())
  return (
    lastSavedSceneJson.value === null ||
    sceneJson !== lastSavedSceneJson.value ||
    animJson !== lastSavedAnimationJson.value
  )
}

// ---- 草稿自动保存与意外关闭恢复 ----

/** 统一重置项目上下文（含只读判定所需的 owner/元信息），供退出/删除/会话失效复用 */
const resetProjectContext = () => {
  currentProjectId.value = null
  currentProjectName.value = ''
  currentProjectOwnerId.value = null
  currentProjectDescription.value = ''
  currentProjectIsPublic.value = true
  openedFromPublic.value = false
  isForeignEditing.value = false
  saveAsDialogVisible.value = false
}

/**
 * 自动保存任务（内部实现）：根据设置和项目状态决定保存行为。
 * 外部一律经 runAutoSave 调用（串行化），不要直接调用本函数。
 */
const autoSaveTask = async (options?: { notifyOnError?: boolean }) => {
  // Yjs 负责房间内实时同步，但项目列表读取的是项目表的 scene_data；
  // 因此协作房间仍需由可编辑成员把当前共享场景定期落库。
  // 观看者不能覆盖项目数据。
  if (isViewOnlyCollab.value) return
  // 他人公开项目为只读：绝不回写源项目（服务端也会拒绝），只能通过「另存为我的项目」保存副本
  if (isForeignProject.value) return
  if (currentProjectId.value) {
    // 普通项目遵循用户的自动保存设置；协作房间必须落库，保证项目列表
    // 与房间共享数据一致，不受个人设置开关影响。
    if (!collabStore.currentRoom && !appSettings.value.autoSaveProject) return
    try {
      const animJson = animationCompareJson(currentAnimationPayload())
      // 协作房间内非房主：录制段**不写进共享项目**（多人同时录制会 last-writer-wins
      // 互相覆盖，也会覆盖房主的段），改写本机按房间分键的本地缓存。
      const isRoomMember = !!collabStore.currentRoom && collabStore.currentRoom.myRole !== 'creator'
      const sceneData = isRoomMember ? exportScene(scene) : exportSceneWithAnimationData()
      const compareJson = sceneToJsonForCompare(sceneData)
      // 场景与动画各自比对：任一变化都要保存（动画变化在场景比对里被剔除）
      const sceneChanged =
        lastSavedSceneJson.value === null || compareJson !== lastSavedSceneJson.value
      const animChanged = animJson !== lastSavedAnimationJson.value
      if (!sceneChanged && !animChanged) return
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
      // 若当前处于协作房间且房间关联的就是本项目，把新缩略图/修改时间同步到房间，
      // 使房间(大厅/列表)实时反映项目内容改动（改动即更新）
      if (thumbnailUrl && collabStore.currentRoom?.projectId === currentProjectId.value) {
        collabStore.currentRoom.projectThumbnailUrl = thumbnailUrl
        collabStore.currentRoom.updatedAt = new Date().toISOString()
      }
      lastSavedSceneJson.value = compareJson
      lastSavedAnimationJson.value = animJson
      // 成员录制只存本地：缓存到该房间的本地键，重新加入时按 id 合并回来
      if (isRoomMember && collabStore.currentRoom) {
        RoomAnimationCache.save(collabStore.currentRoom.id, currentAnimationPayload())
      }
    } catch {
      // 常规自动保存失败静默处理；「管理动作立即保存」要求明确提示（见 notifyOnError）
      if (options?.notifyOnError) {
        showToast('保存失败，改动可能未落盘，请检查网络后重试', 'global', LONG_TOAST_MS)
      }
    }
  } else {
    // 无项目：根据 draftProtection 设置决定是否保存草稿到 localStorage
    if (!appSettings.value.draftProtection) return
    DraftStorageService.saveDraft(scene, currentAnimationPayload())
  }
}

/**
 * 串行执行自动保存：连续的管理动作（如快速删除两段）会排队执行，
 * 避免并发请求"后发先至"用旧内容覆盖新内容。
 */
let autoSaveQueue: Promise<void> = Promise.resolve()
const runAutoSave = (options?: { notifyOnError?: boolean }): Promise<void> => {
  autoSaveQueue = autoSaveQueue.then(() => autoSaveTask(options)).catch(() => {})
  return autoSaveQueue
}

/** 场景有改动时调用，debounce 后执行自动保存 */
const scheduleAutoSave = () => {
  // 协作房间也需要把 Yjs 合并后的场景落到关联项目，使用同一去抖策略。
  if (isViewOnlyCollab.value) return
  // 他人公开项目只读，无需调度自动保存
  if (isForeignProject.value) return
  // 两个开关都关闭时不需要调度
  if (!currentProjectId.value && !appSettings.value.draftProtection) return
  if (currentProjectId.value && !collabStore.currentRoom && !appSettings.value.autoSaveProject)
    return
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer)
  }
  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null
    void runAutoSave()
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
    void runAutoSave()
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
    DraftStorageService.onBeforeUnload(scene, currentAnimationPayload())
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
  // 但仍需立即注销本 Tab 的 active-room 注册项，避免房间列表页按钮状态残留。
  const roomId = collabStore.currentRoom?.id || collabManager.value?.getStatus().room || ''
  if (roomId) {
    clearActiveRoom(roomId)
  }
  // 协作模式下不保存草稿：场景内容已在服务端，避免同步序列化阻塞页面关闭
  const inCollab = !!collabStore.currentRoom
  if (
    !inCollab &&
    !currentProjectId.value &&
    appSettings.value.draftProtection &&
    !isSceneEmpty(scene)
  ) {
    DraftStorageService.saveDraft(scene, currentAnimationPayload())
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
      DraftStorageService.onVisibilityHidden(scene, currentAnimationPayload())
    }
  }
}

/** 用户点击恢复草稿 */
const handleDraftRecoveryConfirm = () => {
  const data = DraftStorageService.loadDraftData()
  if (data) {
    DraftStorageService.restoreDraft(scene, data)
    // 草稿里若带有动画数据，一并恢复（否则清空，避免与残留状态不一致）
    applyAnimationFromSceneData(data)
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
  // 是否从公开资源页进入（决定他人项目是否给出只读+另存为入口）
  openedFromPublic.value = route.query.from === 'public'

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
  // 记录主视图画布上的指针活动：浮窗播放时据此在「活动 → 满帧 / 空闲 → 降帧」之间切换
  bindMainViewActivityListeners(renderer.renderer.domElement)
  uiStore.setAxisGridSize(renderer.getAxisGridSize())
  uiStore.setGridVisible(renderer.isAxisGridVisible())
  uiStore.setCoordinateSystemVisible(renderer.isCoordinateSystemVisible())
  interaction = new Interaction(editor, renderer)
  // 原地播放期间用户尝试拖拽几何对象 → 给退出播放按钮一次 1.5s 泛红光提示。
  // 只在「命中几何对象的拖拽尝试」时触发（startDrag 的调用条件），
  // 旋转视图、点击空白都不会误触发。
  interaction.setBlockedAttemptListener(() => {
    if (animationStore.locksMainViewInteraction) animationStore.notifyInteractionBlockedHint()
  })
  interaction.setGlobalPointValueMode(isGlobalPointValueMode.value)
  // 初始只读态由 syncInteractionLock 统一落定（含协作只读与动画播放两种来源）
  interaction.setViewOnly(isReadOnly.value)
  interaction.bind(renderer.renderer.domElement)
  interaction.syncControlLockState()

  // ─── 动画系统初始化（操作录像机）───
  // 影子场景：播放期间用独立 Scene 渲染，绝不触碰编辑器主场景。
  {
    // 用户是否正在手动操作相机（由 OrbitControls 的 start/end 事件驱动）。
    // 播放期间的聚焦插值据此避让，避免与用户拖拽互相覆盖。
    let orbitInteracting = false
    renderer.controls.addEventListener('start', () => {
      orbitInteracting = true
    })
    renderer.controls.addEventListener('end', () => {
      orbitInteracting = false
    })

    // 编辑器默认的距离钳制（构造时已设定）。播放聚焦需要更近的机位，
    // 因此临时放开，播放结束后复位——否则各档「推近程度」会被钳到同一距离。
    const defaultControlsMinDistance = renderer.controls.minDistance
    const defaultControlsMaxDistance = renderer.controls.maxDistance
    /** 聚焦允许的最小相机距离 */
    const FOCUS_ALLOWED_MIN_DISTANCE = 0.05

    /** 复位主视图轨道控制的距离钳制（退出播放时调用） */
    const restoreControlsDistanceClamp = () => {
      renderer.controls.minDistance = defaultControlsMinDistance
      renderer.controls.maxDistance = defaultControlsMaxDistance
    }

    /** 主视图相机：读写主 renderer 的相机与轨道控制 */
    const mainCameraController: CameraController = {
      getState: () => ({
        position: {
          x: renderer.camera.position.x,
          y: renderer.camera.position.y,
          z: renderer.camera.position.z,
        },
        target: {
          x: renderer.controls.target.x,
          y: renderer.controls.target.y,
          z: renderer.controls.target.z,
        },
        zoom: renderer.camera.zoom,
        controlsEnabled: renderer.controls.enabled,
      }),
      setState: (state) => {
        renderer.camera.position.set(state.position.x, state.position.y, state.position.z)
        renderer.controls.target.set(state.target.x, state.target.y, state.target.z)
        renderer.camera.zoom = state.zoom
        renderer.camera.updateProjectionMatrix()
        renderer.controls.enabled = state.controlsEnabled
        renderer.controls.update()
      },
      isUserInteracting: () => orbitInteracting,
    }

    /**
     * 写入相机前放开轨道控制的距离钳制。
     *
     * OrbitControls.update() 会把相机距离钳到 [minDistance, maxDistance]（默认 11~215）。
     * 聚焦距离 = 包围球半径 × 推近系数，小尺寸主体会远小于 11 → 各档都被顶到 11，
     * 表现为「切换推近程度毫无观感差异」。这里按目标距离放开下限，
     * 退出播放时由 restoreControlsDistanceClamp 复位。
     */
    const relaxControlsDistanceClamp = () => {
      const dist = renderer.camera.position.distanceTo(renderer.controls.target)
      if (!(dist > 0)) return
      renderer.controls.minDistance = Math.min(FOCUS_ALLOWED_MIN_DISTANCE, dist)
      renderer.controls.maxDistance = Math.max(renderer.controls.maxDistance, dist)
    }
    restoreControlsDistanceClampRef = restoreControlsDistanceClamp

    // 先取出原始实现再用新的包一层：若直接在里面调用 mainCameraController.setState
    // 会命中被覆盖后的自身，形成无限递归。
    const baseMainSetState = mainCameraController.setState
    const applyPlaybackCameraState = (state: Parameters<CameraController['setState']>[0]) => {
      relaxControlsDistanceClamp()
      baseMainSetState(state)
    }
    mainCameraController.setState = applyPlaybackCameraState

    /**
     * 播放期间的实时相机：浮窗模式下指向浮窗相机，否则为主视图相机。
     *
     * 判定只看「模式 + 浮窗渲染器是否就绪」，不掺入 `playback.active`：
     * 进入/退出的瞬间 active 已经翻转，若掺入会导致存档与恢复落到不同相机上。
     * （存档/恢复本身走 mainCameraController，与此无关）
     */
    const liveCameraController: CameraController = {
      getState: () =>
        floatRenderer && animationStore.mode === 'float'
          ? floatRenderer.getCameraState()
          : mainCameraController.getState(),
      setState: (state) => {
        if (floatRenderer && animationStore.mode === 'float') {
          floatRenderer.setCameraState(state)
          return
        }
        mainCameraController.setState(state)
      },
      isUserInteracting: () =>
        floatRenderer && animationStore.mode === 'float'
          ? floatRenderer.isUserInteracting()
          : (mainCameraController.isUserInteracting?.() ?? false),
    }
    cameraControllerRef = mainCameraController

    // 存档用主相机控制器；播放中的实时相机按模式选择（浮窗模式下为浮窗相机）
    shadowScene = new ShadowScene(scene, mainCameraController, liveCameraController)

    // 直接使用 store 的文档对象（引用终身恒定，见 store 的不变量说明）：
    // 引擎与 store 必须操作同一个对象，否则 setDocument/reset 后引擎会与 UI 脱钩。
    const animationDocument = animationStore.document

    animationRecorder = new AnimationRecorder(scene, animationDocument, {
      onChange: () => {
        animationStore.recording.active = animationRecorder?.isRecording ?? false
        animationStore.recording.paused = animationRecorder?.isPaused ?? false
        animationStore.recording.sessionId = animationRecorder?.currentSessionId ?? null
        animationStore.recording.stepCount = animationRecorder?.currentStepCount ?? 0
        animationStore.notifyDocumentChanged()
      },
      onLimitReached: (limit) => {
        showToast(`单段录制已达上限 ${limit} 步`, 'viewport', LONG_TOAST_MS)
      },
      // 构造类模式判定：只有构造模式（创建/合并等）下新发生的选中才缓冲为「选中」候选步；
      // 纯选中 / 删除模式下的选中只代表浏览或命中，由「是否为后续操作的输入」过滤决定
      // （预选工作流见 onModeChange 的 noteConstructionModeEntered）。
      isConstructionMode: () =>
        editor.mode !== EditorMode.Select && editor.mode !== EditorMode.Delete,
    })

    animationPlayer = new AnimationPlayer(shadowScene, animationStore.playback, animationDocument, {
      onChange: () => {
        // playback 为共享可变对象，Vue 自动感知；此处仅提示文档可能变更
        // 房主广播中：控制状态一变就立即推送，不必等 500ms 心跳（心跳仍作为纠偏兜底）
        animationStore.notifyBroadcastControl()
      },
      requestRender: () => {
        // 下一帧由渲染循环自动消费脏标记，无需显式触发
      },
      // AR 模式下相机即设备摄像头：不移动虚拟相机，聚焦自动关闭
      canMoveCamera: () => !isARMode.value,
    })

    animationStore.bindEngines(animationPlayer, animationRecorder)

    // 广播房主侧数据来源：读取本地播放状态与录制段数据（广播时由通道一次性写入共享表）
    animationStore.bindBroadcastHostSource({
      getControl: (sessionId) => {
        const p = animationStore.playback
        if (p.active && p.sessionId === sessionId) {
          return {
            sessionId,
            cursor: p.cursor,
            playing: p.playing,
            direction: p.direction,
            autoAdvanceMs: p.autoAdvanceMs,
            loop: p.loop,
          }
        }
        // 房主尚未进入该段播放：以「停在起点、未播放」维持心跳，避免广播被判定过期
        return {
          sessionId,
          cursor: -1,
          playing: false,
          direction: animationDocument.settings.defaultDirection,
          autoAdvanceMs: animationDocument.settings.autoAdvanceMs,
          loop: animationDocument.settings.loopByDefault,
        }
      },
      getSessionPayload: (sessionId) => {
        const session = animationDocument.sessions.find((s) => s.id === sessionId)
        return session ? serializeRecordingSession(session) : null
      },
    })

    // 动画库：注入宿主上下文（当前项目 / 房间）与提示通道。
    // 上下文用「取值函数」注入而非快照值 —— 切项目 / 进出房间后自动取最新值。
    animationLibraryStore.bindContextSource({
      getProjectId: () => currentProjectId.value,
      getRoomId: () => collabStore.currentRoom?.id ?? null,
    })
    animationLibraryStore.bindNotify((msg) => {
      showToast(msg, 'global', LONG_TOAST_MS)
    })
    // 静默预载动画库列表：Timeline 的「已在动画库」按钮状态从一开始就准确
    void animationLibraryStore.silentRefresh()

    // 录制旁听挂点：HistoryManager 每次真实入栈 → 一个操作步
    editor.historyManager.setPushListener((event) => {
      animationRecorder?.onOperationPushed(event)
    })

    // 撤销/重做旁听挂点：仅当设置开启「记录撤销/重做」时才累积为步
    editor.historyManager.setNavListener((event) => {
      animationRecorder?.onHistoryNav(event)
    })

    // 播放期间暂停历史记录（播放产生的场景变化不进历史；主场景本身不被触碰）
    // 注：P0 阶段播放只作用于影子场景，主场景无变化，故无需暂停/恢复。
  }

  // ─── 主视图渲染源切换：强制重建几何 ───
  // 渲染脏状态是一次性消费的：原地播放期间主视图同步的是影子场景，
  // 退出播放（或切到浮窗）后再切回编辑器场景时，主场景往往已无脏标记 →
  // 主视图会停留在最后一步的几何状态，拾取/悬停也会基于陈旧网格。
  watch(
    () => animationStore.mainViewRendersShadowScene,
    (now, prev) => {
      if (now === prev) return
      if (now) shadowScene?.scene?.markAllRenderDirty()
      else scene.markAllRenderDirty()
    },
  )

  // ─── 播放载体切换（原地 ⇄ 浮窗）───
  //
  // ⚠ 视角只有两个、各自独立：编辑器场景视角 与 动画播放视角。
  // **原地播放与小窗播放共用同一个播放视角**，切换载体只是把这个播放视角
  // 从一个载体搬到另一个载体（机位原样带过去），同时把主视图在
  // 「渲染播放场景」与「渲染编辑器场景」之间交接 —— 交接时必须换用对应场景自己的视角。
  //
  // 切换时**不退出/重进播放**（影子场景与播放状态无需重建；
  // 渲染源切换由 mainViewRendersShadowScene 的 watch 标脏重建几何）。
  watch(
    () => animationStore.mode,
    (mode, prevMode) => {
      if (!animationStore.playback.active) return
      if (mode === prevMode) return

      if (mode === 'float') {
        // 原地 → 小窗：把播放视角从主相机取出来带着走，主视图交还编辑器视角
        playbackView = cameraControllerRef?.getState() ?? null
        handMainViewBackToEditor()
        return
      }

      // 小窗 → 原地：把播放视角从小窗取出来搬回主相机；
      // 浮窗期间用户在编辑器场景里调整的视角已由 controls change 钩子持续镜像到基线，
      // 这里无需再搬（也不会把播放视角留在编辑器上）。
      playbackView = floatRenderer?.getCameraState() ?? playbackView
      if (playbackView) cameraControllerRef?.setState(playbackView)
    },
  )

  // ─── 播放期间：小窗模式下持续镜像「编辑器视角」基线 ───
  //
  // 小窗播放时主视图显示的是编辑器场景，用户在其中的视角调整属于**编辑器视角**变化。
  // 只有把它持续写回基线，无论从哪条路径退出播放才能保留这次调整
  // （否则会被「进入播放前」的旧存档覆盖）。
  renderer.controls.addEventListener('change', () => {
    if (!animationStore.playback.active) return
    if (animationStore.mode !== 'float') return
    const current = cameraControllerRef?.getState() ?? null
    if (current) animationPlayer?.overrideEditorCameraBaseline(current)
  })

  // ─── 退出播放：清空播放视角 + 复位相机距离钳制 ───
  // （主相机由播放器还原为编辑器视角存档，见 ShadowScene.exit）
  watch(
    () => animationStore.playback.active,
    (active) => {
      if (!active) {
        clearPlaybackView()
        restoreControlsDistanceClampRef?.()
      }
    },
  )

  // 跟随状态变化（收起 / 重新跟随 / 强制观看开关）→ 立即做一次同步，
  // 否则要等下一次轮询（约 1s）才生效，按钮点击会显得迟钝。
  watch(
    () => animationStore.isWatchingBroadcast,
    () => {
      void nextTick(() => syncBroadcastFromShared())
    },
  )

  // ─── 播放期间锁住编辑器交互 ───
  // 播放渲染的是影子场景，若此时仍允许拾取/拖拽，用户会「看不到选中却改了主场景」。
  // watch 在 setup 层已挂（见 syncInteractionLock），此处只需按当前状态落一次初值。
  syncInteractionLock()

  // ─── 环境能力：AR 只播不录 + 协作权限（房主可禁止成员录制）───
  // 单一来源：所有录制/浮窗/相机限制都在 animationCapabilities 里汇总，
  // 任何来源变化都会经下面的 watch 落到 store。
  watch(animationCapabilities, applyAnimationCapabilities, { immediate: true, deep: true })

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
    // 正在 joinRoom 的过程中（正在尝试候选地址），
    // 其中的连接失败不是「掉线」，不能触发退出协作流程，
    // 否则会与 joinRoom 的清理逻辑交错（leaveRoom 会把 provider 置空）。
    if (
      wasConnected &&
      !status.connected &&
      collabStore.currentRoom &&
      !collabManager.value?.isJoiningRoom
    ) {
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

  // 协作拖拽感知：监听房间内所有用户（含自己）的拖拽状态，渲染"xxx正在操作..."气泡，
  // 并把「被他人占用」的元素集合分发给渲染层（红光）与交互层（not-allowed 悬停预判）
  collabManager.value.onActiveDragsUpdate = (drags) => {
    activeDrags.value = drags
    refreshOccupiedFeedback()
  }
  // 协作历史消息：从 Yjs 共享文档同步，渲染到左上角消息框
  collabManager.value.onCollabMessagesUpdate = (messages) => {
    collabHistoryMessages.value = messages
  }
  // 创建者广播的成员角色变更：命中当前用户时即时更新本地 myRole，不等下一轮轮询，
  // 使 viewer⇄editor 权限变化立即反映到 isViewOnlyCollab → Interaction.setViewOnly（如禁拖拽）。
  collabManager.value.onRoleChange = ({ roomId, targetUserId, role }) => {
    const current = collabStore.currentRoom
    if (!current || current.id !== roomId) return
    if (!user.value?.id || targetUserId !== user.value.id) return
    if (current.myRole === role) return
    // 仅接受合法的 RoomRole 值（避免被误构造的 awareness 数据破坏角色）
    if (role !== 'creator' && role !== 'editor' && role !== 'viewer') return
    current.myRole = role as Room['myRole']
  }
  // 拖拽锁的申请时机：仅协作房间内启用「按下时登记 + 位移确认后申请」，
  // 使单纯的单击选中不占用互斥锁、不广播占用气泡；单机编辑保持原有零死区手感。
  interaction.isCollabRoomActive = () => collabManager.value?.getStatus().room !== null

  interaction.onDragLockRequest = (target: DragLockTarget) => {
    const cm = collabManager.value
    if (!cm) return null
    // 以「写入点集作用域」申请互斥锁：只有与自己会写入的点相交的远端拖拽才算冲突
    const scope = computeLockScope(scene, target)
    if (cm.tryAcquireDragLock(scope)) return null
    const conflict = cm.getLastDragConflict()
    const blocker = conflict?.userName || '其他用户'
    const subject = conflict?.rootName || scope.rootName || '该元素'
    return { message: `${subject} 正被 ${blocker} 操作，暂不可拖动` }
  }
  interaction.onDragLockRelease = () => {
    collabManager.value?.releaseDragLock()
    // 本用户退出拖拽后立即回收自己贡献的占用红光
    refreshOccupiedFeedback()
  }
  // 权威锁仲裁：本地拖拽被并发申请者按确定性优先级抢占时中止拖拽并提示
  collabManager.value.onDragLockPreempted = ({ userName, rootName }) => {
    interaction.abortActiveDrag(
      `${rootName || '该对象'} 已被 ${userName || '其他用户'} 接管，本次拖动已中止`,
    )
    refreshOccupiedFeedback()
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
    // 非拖拽写路径互斥：命令写入的点若与他人拖拽的写入点集相交，直接取消并提示。
    // 必须在执行前拦截——否则一边求解器回写、一边拖拽预览，几何会被互相拉回。
    if (inRoom) {
      const blocked = resolveWriteConflictMessage(cmd)
      if (blocked) {
        showToast(blocked.message, 'viewport')
        // 命令被拦 = 场景未变化，SideBar 依赖场景变化的草稿同步不会触发，
        // 输入框会保留未生效的值；主动通知它回灌一次，消除界面漂移。
        collabWriteEvents.emit(blocked)
        return
      }
    }
    if (inRoom && !cm!.getIsApplyingSharedHistory()) {
      if (collabTransactionDepth > 0) {
        // 协作事务中：只执行命令，不创建共享历史记录（由 commitTransaction 统一创建）
        originalExecuteCommand(cmd)
        collabTransactionDirty = true
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
        // 空操作命令（前后场景完全等价）不写入共享历史，
        // 避免协作端多出一条「撤销后什么都没变」的历史步
        if (!isSameSerializedScene(before, after)) {
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
      }
    } else if (!inRoom) {
      originalExecuteCommand(cmd)
      updateLocalHistoryUI()
    } else {
      originalExecuteCommand(cmd)
      cm!.syncAction()
    }
  }

  /**
   * 协作撤销/重做的旁听通知（构造等价的占位条目）。
   * 共享条目只提供 label，故此处只带 label；场景快照由旁听者自行读取。
   */
  const notifyCollabUndoRedo = (action: 'undo' | 'redo', label: string) => {
    editor.historyManager.notifyExternalNav(action, {
      id: `collab_${action}_${Date.now()}`,
      label,
      timestamp: Date.now(),
      redo: () => {},
      undo: () => {},
    })
  }

  editor.executeHistoryEntry = (entry: HistoryEntry) => {
    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    // 撤销/重做同样是非拖拽写路径：历史条目携带的 before/after 快照被扫描时已跳过，
    // 只按 intent / 目标 id 判定是否与远端拖拽冲突
    if (inRoom) {
      const blocked = resolveWriteConflictMessage(entry)
      if (blocked) {
        showToast(blocked.message, 'viewport')
        collabWriteEvents.emit(blocked)
        return
      }
    }
    if (inRoom && !cm!.getIsApplyingSharedHistory()) {
      if (collabTransactionDepth > 0) {
        // 协作事务中：只执行命令，不创建共享历史记录
        originalExecuteHistoryEntry(entry)
        collabTransactionDirty = true
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
        // 空操作命令（前后场景完全等价）不写入共享历史
        if (!isSameSerializedScene(before, after)) {
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
          // 协作模式下本地 push() 被 pause 拦住，而 push 是动画录制器唯一的旁听挂点，
          // 因此这里显式把「发生了一个真实操作步」通知给旁听者（与 push 事件等价）。
          editor.historyManager.notifyExternalPush({ entry, before, after, fromTransaction: false })
        }
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
      // 协作撤销走共享历史（不经过本地 HistoryManager.undo），需显式通知旁听者，
      // 否则「记录撤销/重做」的录制设置在房间内失效。
      const label = cm.sharedUndo()
      if (label !== null) notifyCollabUndoRedo('undo', label)
    } else {
      editor.historyManager.undo()
      updateLocalHistoryUI()
    }
  }

  editor.redo = () => {
    const cm = collabManager.value
    if (cm && cm.getStatus().room !== null) {
      const label = cm.sharedRedo()
      if (label !== null) notifyCollabUndoRedo('redo', label)
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
        collabTransactionDirty = false
      }
    } else {
      // 非协作模式：复位可能因「事务未提交就退出房间」而遗留的协作事务状态，
      // 否则重新入房后事务会一直停在嵌套态，共享历史不再新增记录
      collabTransactionDepth = 0
      collabTransactionBefore = null
      collabTransactionDirty = false
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
        const changed = collabTransactionDirty
        collabTransactionDirty = false
        const after = exportScene(scene)
        cm!.syncAction()
        // 空事务（如无效的名称编辑）以及「命令执行了但场景完全没变」都不写入共享历史，
        // 避免协作端多出一条「撤销一步却什么都没发生」的历史步
        if (changed && !isSameSerializedScene(collabTransactionBefore, after)) {
          cm!.appendHistoryEntry({
            id: crypto.randomUUID(),
            actorClientId: cm!.getProviderClientId(),
            actorName: cm!.getLocalUserLabel(),
            createdAt: Date.now(),
            label: collabTransactionLabel,
            before: collabTransactionBefore,
            after,
          })
          // 事务提交为「一步」：同样需要通知旁听者（房间内本地 push 被 pause 拦住）。
          // 事务内的多个命令已合并，故构造一个只带 label 的占位条目——
          // 具体操作意图由录制器按快照 diff 推导（与无 intent 的旧命令同路径）。
          const transactionEntry: HistoryEntry = {
            id: `collab_tx_${Date.now()}`,
            label: collabTransactionLabel,
            timestamp: Date.now(),
            redo: () => {},
            undo: () => {},
          }
          editor.historyManager.notifyExternalPush({
            entry: transactionEntry,
            before: collabTransactionBefore,
            after,
            fromTransaction: true,
          })
        }
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
        if (a && b && d)
          return a
            .clone()
            .add(b)
            .add(d)
            .multiplyScalar(1 / 3)
        return a ?? b ?? d
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

    // ─── 动画播放驱动 ───
    // 三种渲染组合：
    //  - 原地播放：主视图渲染影子场景（编辑器主场景完全不动）
    //  - 浮窗播放：主视图继续渲染编辑器场景（可协作作图），影子场景由浮窗的第二 renderer 渲染
    //  - 非播放：主视图渲染编辑器场景
    if (animationPlayer) {
      animationPlayer.tick(now)
    }
    const playbackActive = animationStore.playback.active
    // 浮窗模式（用户选择）与实际可渲染（渲染栈就绪）分开判断：
    // 切换载体的瞬间浮窗渲染器要晚一帧才就绪，若用「已就绪」决定主视图渲染什么，
    // 会先闪一帧「动画出现在主视图」再跳到浮窗。
    const floatMode = playbackActive && animationStore.mode === 'float'
    const floatReady = floatMode && floatRenderer !== null
    // 主视图渲染源（原地播放=影子场景 / 其余=编辑器场景），规则见 store
    const mainViewShadow = animationStore.mainViewRendersShadowScene

    // 浮窗开启时主视图降帧（把 GPU 让给浮窗），但**仅在空闲时**：
    // 主视图有指针活动（继续作图/转视角）时恢复满帧，避免协作作图卡顿。
    mainViewFrameSkipCounter = (mainViewFrameSkipCounter + 1) % FLOAT_MODE_MAIN_VIEW_FRAME_SKIP
    const mainViewBusy =
      mainViewLastActivityAt > 0 &&
      now - mainViewLastActivityAt < MAIN_VIEW_FULL_RATE_AFTER_ACTIVITY_MS
    const renderMainView = !floatReady || mainViewBusy || mainViewFrameSkipCounter === 0

    if (renderMainView) {
      const mainScene = mainViewShadow ? shadowScene!.activeScene : scene
      if (mainViewShadow) {
        // 原地播放：不传交互预览数据（操作的是主场景，与影子场景无关）
        renderer.sync(mainScene, null, null, null, null)
      } else {
        renderer.sync(
          mainScene,
          interaction.rubberBandData,
          interaction.getFacePreviewData(),
          interaction.getActiveLabelTarget(),
          interaction.getActivePointValueTarget(),
        )
      }
      renderer.render()
    }

    // 浮窗：始终整帧率渲染影子场景（第二 canvas，与主视图状态隔离）
    if (floatReady && floatRenderer && shadowScene) {
      const floatScene = shadowScene.scene
      if (floatScene) {
        floatRenderer.sync(floatScene)
        floatRenderer.updateResponsiveScales()
      }
      floatRenderer.render()
    }
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

// 动画数据（录制段/设置）改动同样要触发自动保存：
// 它不属于场景集合，因此不会经过上面的场景 watcher。
// 播放态切换也会触发本 watcher，但此时动画文档未变，autoSave 的差异比对会直接跳过。
watch(
  () => animationStore.documentRevision,
  () => {
    scheduleAutoSave()
  },
  { flush: 'post' },
)

// 段集合的管理动作（删除 / 重命名 / 复制 / 清空 / 固化 / 录制封存）→ 跳过去抖立即保存：
// 删除类操作若只等 3s 去抖，用户"删除后马上刷新"会让删除丢失（实测踩坑：删了又回来）。
// 失败时明确提示，避免同类问题再以无声方式出现。
watch(
  () => animationStore.urgentSaveRevision,
  () => {
    stopAutoSave()
    void runAutoSave({ notifyOnError: true })
  },
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
  // canUndo/canRedo 由 CollabManager 计算（已扣除不可撤销的初始基线「项目导入」）
  sceneStore.setHistoryState({
    canUndo: state.canUndo,
    canRedo: state.canRedo,
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
 * antialias 变更需要重建 WebGLRenderer，故提示用户刷新页面
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
    if (newSettings.depthOcclusion !== oldSettings?.depthOcclusion) {
      changes.depthOcclusion = newSettings.depthOcclusion
    }
    if (newSettings.hiddenEdge !== oldSettings?.hiddenEdge) {
      changes.hiddenEdge = newSettings.hiddenEdge
    }
    if (Object.keys(changes).length === 0) return

    const result = renderer.applySettings(changes)
    if (result.needsRecreate) {
      // 抗锯齿变更需重建渲染器，刷新页面后生效
      if (changes.antialias !== undefined) {
        showToast('抗锯齿已更改，刷新页面后生效', 'global')
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
  animationLibraryStore.unbindContextSource()
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
  // 协作占用反馈清理：移除红光叠加层并复位悬停光标状态
  interaction?.setBlockedDragIds([])
  renderer?.clearOccupied()
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
  // 动画系统：解绑引擎 + 复位录制/播放状态（文档数据由 store 持有，随本页销毁）
  editor.historyManager.setPushListener(null)
  editor.historyManager.setNavListener(null)
  animationPlayer?.exit()
  animationRecorder?.discard()
  animationRecorder?.dispose()
  teardownBroadcastChannel()
  mainViewActivityCleanup?.()
  disposeFloatRenderer()
  animationStore.unbindEngines()
  animationStore.unbindBroadcastHostSource()
  animationStore.reset()
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
  // 进入构造模式：把「进入前已选好的对象」补记为动画录制候选 ——
  // 编辑器支持预选工作流（先选底面再进棱柱工具、选中立体面后创建展开图等），
  // 这些选中发生在纯选中模式、不会被缓冲，只有在此补记才能被后续创建追溯到。
  if (mode !== EditorMode.Select && mode !== EditorMode.Delete) {
    animationRecorder?.noteConstructionModeEntered()
  }
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
    const savedFileName = await downloadSceneAsJson(scene, prefix, currentAnimationPayload())
    if (savedFileName) {
      // 房间内导出：追加一条通知消息（导出不改变场景，因此不产生历史条目、不占撤销步骤）
      collabManager.value?.appendSceneFileExportNotice(savedFileName)
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

    // 生效模式：房间内由房主的房间设置决定，房间外取本地设置
    const isMerge = effectiveImportMode.value === 'merge'

    // 合并模式不销毁任何内容，无需覆盖确认；覆盖模式保留二次确认（可撤销恢复）
    if (!isMerge && !isSceneEmpty(scene)) {
      const confirmed = window.confirm('场景中已有创作内容，若继续导入将覆盖原内容')
      if (!confirmed) return
    }

    editor.selectedPoints = []
    scene.selection.clear()

    const cm = collabManager.value
    const inRoom = cm && cm.getStatus().room !== null
    const before = exportScene(scene)

    // 两种模式统一用 SnapshotCommand 包裹：全量快照自动支持撤销/重做，
    // 因此不再清空历史（导入成为可撤销的一步）。
    const importCommand = new SnapshotCommand(
      isMerge ? 'MergeImportScene' : 'ImportScene',
      scene,
      () => {
        if (isMerge) {
          mergeScene(scene, result.data as SerializedScene)
        } else {
          importScene(scene, result.data as SerializedScene)
        }
      },
    )
    importCommand.executeAndCapture()
    // 必须走「未包装」的原方法入本地历史，不能走 editor.executeHistoryEntry：
    // 后者在协作房间内会自动 appendHistoryEntry 一条**不带 sceneFileName** 的共享条目，
    // 会让导入重新按 before/after 展开成几十条「创建了/删除了…」。
    // 房间内的共享条目由下方显式上报（携带 sceneFileName，只产生一条带文件名的消息）。
    originalExecuteHistoryEntry(importCommand)

    // 覆盖导入：连带恢复文件里的动画数据（id 未变，录制步仍然有效）。
    // 合并导入：**不恢复**动画——mergeScene 会对导入数据做 id 重映射，
    // 文件中的录制步引用的是旧 id，恢复后会指向不存在的对象，因此只保留当前动画。
    if (!isMerge) {
      applyAnimationFromSceneData(result.data as SerializedScene)
    }

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
        // label 同时决定协作历史消息的动作短语（覆盖导入 / 合并导入）
        label: isMerge ? 'MergeImportScene' : 'ImportScene',
        // 携带文件名（含后缀）：该条目只产生一条带文件名的消息，
        // 不再按 before/after 展开成几十条「创建了/删除了…」
        sceneFileName: result.fileName,
        before,
        after,
      })
    } else {
      collabManager.value?.syncAction()
      updateLocalHistoryUI()
    }

    showToast(isMerge ? `已合并导入 ${result.fileName}` : '导入成功', 'global')
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
              // 本地无历史但场景非空（首位成员导入关联项目）：写入一条**初始基线条目**——
              // 保留 before=空场景 / after=项目场景 作为基线，但它不是一步用户操作，
              // 撤销不能越过它（撤销按钮初始不可用），消息固定为「项目导入加载完成」。
              const after = exportScene(scene)
              const before = createEmptySerializedScene()
              collabManager.value.appendHistoryEntry({
                id: crypto.randomUUID(),
                actorClientId: collabManager.value.getProviderClientId(),
                actorName: collabManager.value.getLocalUserLabel(),
                createdAt: Date.now(),
                label: 'ProjectImport',
                isBase: true,
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
      resetProjectContext()
      // 场景已清空：动画数据同步复位
      animationStore.reset()
      clearSavedBaseline()
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
// 采用多条目注册表（roomId → 心跳时间戳）：本 Tab 只登记/刷新/注销自己的房间，
// 多 Tab 同时加入不同房间时互不覆盖，离开一个房间也不会误清除其他 Tab 的状态。
// 编辑器每轮轮询会刷新自己的时间戳；房间列表页据此判定标记是否新鲜，
// 避免编辑器 Tab 被直接关闭后标记长期残留。
const setActiveRoom = (roomId: string | null) => {
  if (roomId) {
    registerActiveRoom(roomId)
  }
}
// 注销本 Tab 正在协作的房间标记（离开房间 / 页面隐藏时调用）
const clearActiveRoom = (roomId: string) => {
  if (roomId) {
    unregisterActiveRoom(roomId)
  }
}
// 刷新 active-room 时间戳（保持标记新鲜，证明编辑器 Tab 仍存活）；
// 仅刷新本 Tab 已登记的房间，未登记（已离开）时不创建，避免迟到回调复活陈旧状态
const touchActiveRoom = (roomId: string) => {
  touchActiveRoomRegistry(roomId)
}
// 读取上次协作的 roomId（异常退出时 handleCollabLeave 未被调用，标记仍然存在）
const getActiveRoomId = (): string | null => {
  return getFreshestActiveRoomId()
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
      // 请求在途期间可能已通过跨 Tab 事件 / 页面隐藏离开房间：
      // 迟到的回调不能再心跳或刷新注册项，否则会复活已注销的 active-room 状态
      // （表现为房间列表「加入/离开」按钮状态错误复位）
      if (collabStore.currentRoom?.id !== roomId) return
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
      // 刷新 active-room 时间戳，保持标记新鲜（仅刷新本 Tab 已登记的房间）
      touchActiveRoom(roomId)
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
  if (current.importMode !== room.importMode) current.importMode = room.importMode
  if (current.disableClear !== room.disableClear) current.disableClear = room.disableClear
  if (current.disableUndoRedo !== room.disableUndoRedo)
    current.disableUndoRedo = room.disableUndoRedo
  if (current.disableRecordAnimation !== room.disableRecordAnimation)
    current.disableRecordAnimation = room.disableRecordAnimation
  if (current.forceWatchAnimation !== room.forceWatchAnimation)
    current.forceWatchAnimation = room.forceWatchAnimation
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
          // 协作房间的项目：显式不做"他人项目只读"判定（房间成员本就有编辑权限）
          currentProjectOwnerId.value = null
          currentProjectDescription.value = detail.description ?? ''
          currentProjectIsPublic.value = detail.isPublic ?? false
          router.replace({ query: { ...route.query, projectId: detail.id } })
          if (detail.sceneData) {
            try {
              const parsed = JSON.parse(detail.sceneData)
              const validation = validateSerializedScene(parsed)
              if (validation.valid && !isSerializedSceneEmpty(parsed as SerializedScene)) {
                importScene(scene, parsed as SerializedScene)
                // 房间关联项目里带着房主的录制段，进房时必须一并载入，
                // 否则成员的动画面板永远是空的（只能靠广播被动观看）。
                applyAnimationFromSceneData(parsed as SerializedScene)
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
          markSavedBaseline()
          // 将加载的项目场景推送到 Yjs 共享文档
          collabManager.value.syncNow()
        } catch {
          // 项目加载失败不阻塞已建立的协作连接
        }
      } else {
        // 后续加入者：场景已从 Yjs 同步，仅设置项目上下文（使自动保存同步到真实项目）
        currentProjectId.value = room.projectId
        // 协作房间的项目：显式不做"他人项目只读"判定（房间成员本就有编辑权限）
        currentProjectOwnerId.value = null
        try {
          const detail = await projectApi.getProject(room.projectId)
          currentProjectName.value = detail.name
          currentProjectDescription.value = detail.description ?? ''
          currentProjectIsPublic.value = detail.isPublic ?? false
        } catch {
          currentProjectName.value = room.projectName || ''
        }
        router.replace({ query: { ...route.query, projectId: room.projectId } })
        markSavedBaseline()
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
          // 本地无历史但场景非空（首位成员导入关联项目）：写入一条**初始基线条目**——
          // 保留 before=空场景 / after=项目场景 作为基线，但它不是一步用户操作，
          // 撤销不能越过它（撤销按钮初始不可用），消息固定为「项目导入加载完成」。
          const after = exportScene(scene)
          const before = createEmptySerializedScene()
          collabManager.value.appendHistoryEntry({
            id: crypto.randomUUID(),
            actorClientId: collabManager.value.getProviderClientId(),
            actorName: collabManager.value.getLocalUserLabel(),
            createdAt: Date.now(),
            label: 'ProjectImport',
            isBase: true,
            before,
            after,
          })
        }
      }
      // 后加入的成员：共享历史已有内容，自动同步即可（场景已被 joinRoom 同步）
    }

    // 恢复「本机在该房间内的本地录制」：按 id 追加合并，
    // 不覆盖项目里房主的录制段（成员录制只存本地，不进共享项目）。
    {
      const cachedDoc = deserializeAnimationDocument(RoomAnimationCache.load(roomId))
      if (cachedDoc) {
        const added = animationStore.mergeSessions(cachedDoc.sessions)
        if (added > 0) showToast(`已恢复本机在该房间的 ${added} 段录制`, 'global')
      }
    }

    // 建立动画广播通道（房主可发起广播，成员自动跟随）
    setupBroadcastChannel()

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
  // 撤销广播并销毁通道（房主离开时成员会在心跳窗口内自动退出广播视图）
  teardownBroadcastChannel()
  // 注销当前正在协作的房间标记（只注销本 Tab 的房间，不影响其他 Tab）
  const leftRoomId = collabStore.currentRoom?.id || collabManager.value?.getStatus().room || ''
  if (leftRoomId) {
    clearActiveRoom(leftRoomId)
  }
  // 清除协作会话内标记（用户主动离开 / 服务器断开等已知退出，不再视为异常退出）
  clearCollabInSession()
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
    editor.historyManager.loadFromSharedHistory(
      snapshotEntries,
      sharedState.historyIndex,
      sharedState.baseIndex,
    )
    editor.historyVersion++
  } else {
    editor.historyManager.resume()
  }
  // 先断开协作连接，再清空本地场景。
  // 必须在 leaveRoom() 之后清空，否则清空操作会被 Yjs 同步回协作房间。
  // 连接已断开时（reason === 'disconnect'）不再广播「离开了协作」：此时写入的消息
  // 只存在于本地文档，provider 随即销毁，永远同步不到服务器与其他协作者。
  // 该场景的离开记录由信令服务器在观察到连接断开时权威补写。
  cm?.leaveRoom({ announceLeave: reason !== 'disconnect' })
  // 离开房间后立即清空占用反馈（红光泽灭 + 悬停光标复位）
  activeDrags.value = []
  refreshOccupiedFeedback()
  // 清空本地编辑器场景（不影响协作房间项目内容，因为已断开同步）
  clearLocalSceneOnly()
  // 房间关闭后清空协作历史消息，等待下次加入重置
  collabHistoryMessages.value = []
  // 退出关联项目：清理项目状态、URL query、浏览器标签标题
  resetProjectContext()
  // 场景已清空：动画数据同步复位
  animationStore.reset()
  clearSavedBaseline()
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
    // 新建项目属于当前用户：清空所有者判定，确保可编辑
    currentProjectOwnerId.value = null
    currentProjectDescription.value = data.description || ''
    currentProjectIsPublic.value = data.isPublic
    openedFromPublic.value = false
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
          // 场景文件可能带有动画数据，一并载入
          applyAnimationFromSceneData(parsed as SerializedScene)
          scene.solveDirtyConstraints()
          scene.markAllRenderDirty()
          sceneStore.syncEditorState(editor)
          sceneStore.syncSceneState(scene)
          const exportedScene = exportSceneWithAnimationData()
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
    markSavedBaseline()
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
  const sceneData = exportSceneWithAnimationData()
  const hasChanges = hasUnsavedChanges()
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
      // 若存在关联的协作房间，把新缩略图/修改时间同步到房间（改动即更新）
      if (thumbnailUrl && collabStore.currentRoom?.projectId === projectId) {
        collabStore.currentRoom.projectThumbnailUrl = thumbnailUrl
        collabStore.currentRoom.updatedAt = new Date().toISOString()
      }
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
  // 退出项目：动画数据随项目落盘，本地状态清空
  animationStore.reset()
  resetProjectContext()
  clearSavedBaseline()
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
  // 他人公开项目只读：不允许修改项目元信息（防御性拦截，菜单项本身已隐藏）
  if (isForeignProject.value) {
    showToast('当前为他人公开项目，无法编辑项目信息', 'global')
    return
  }
  try {
    const detail = await projectApi.getProject(currentProjectId.value)
    editProjectName.value = detail.name
    // 描述可能缺失（如由协作房间自动创建的关联项目）：归一为空串，避免弹窗渲染期抛错
    editProjectDescription.value = detail.description ?? ''
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

// ---- 另存为我的项目（他人公开项目专用出口）----

/**
 * 进入他人公开项目的编辑态：解除视图只读限制（工具栏/侧边栏/交互全部恢复可用），
 * 但仍不回写源项目 —— 所有编辑只存在于内存中，用户需通过「另存为我的项目」落库。
 */
const handleEnterForeignEdit = () => {
  if (!isForeignProject.value) return
  isForeignEditing.value = true
}

const handleOpenSaveAsDialog = () => {
  if (!currentProjectId.value || !isForeignProject.value) return
  saveAsDialogVisible.value = true
}

const handleSaveAsCancel = () => {
  saveAsDialogVisible.value = false
}

const handleSaveAsConfirm = async (data: {
  name: string
  description: string
  isPublic: boolean
}) => {
  if (!currentProjectId.value) return
  isSavingAs.value = true
  try {
    // 用户若对临时副本做过编辑，先把当前内存场景序列化，另存时一并写入新项目，
    // 保证"编辑后另存"能保留用户的改动（未编辑时与源项目内容一致）。
    let editedSceneJson: string | undefined
    if (hasUnsavedChanges()) {
      editedSceneJson = JSON.stringify(exportSceneWithAnimationData())
    }

    // 服务端复制源项目的场景与缩略图文件，并让源项目 另存量 +1
    const newProject = await projectApi.cloneProject(currentProjectId.value, {
      name: data.name,
      description: data.description || undefined,
      isPublic: data.isPublic,
      sceneData: editedSceneJson,
    })
    // 切换到新副本：此时已是自己的项目，解除只读/预览态
    currentProjectId.value = newProject.id
    currentProjectName.value = newProject.name
    currentProjectOwnerId.value = newProject.ownerId
    currentProjectDescription.value = newProject.description ?? ''
    currentProjectIsPublic.value = newProject.isPublic ?? false
    openedFromPublic.value = false
    isForeignEditing.value = false
    // 去掉 from=public，避免刷新后又回到预览判定
    router.replace({ query: { projectId: newProject.id } })
    markSavedBaseline()
    saveAsDialogVisible.value = false
    showToast(`已另存为「${newProject.name}」`, 'global')
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '另存失败'
    showToast(msg, 'global')
  } finally {
    isSavingAs.value = false
  }
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
  // 项目已删除：动画数据一并清空
  animationStore.reset()
  resetProjectContext()
  clearSavedBaseline()
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
  // 协作房间新建的关联项目：属于当前用户，显式清空所有者判定避免误入只读
  currentProjectOwnerId.value = null
  openedFromPublic.value = false
  // 同步 URL，使刷新后仍能恢复项目
  router.replace({ query: { ...route.query, projectId } })
  // 拉取项目名称
  void projectApi
    .getProject(projectId)
    .then((detail) => {
      currentProjectName.value = detail.name
      currentProjectDescription.value = detail.description ?? ''
      currentProjectIsPublic.value = detail.isPublic ?? false
    })
    .catch(() => {
      // 获取项目信息失败不阻塞
    })
  // 记录当前场景快照用于后续变更检测
  markSavedBaseline()
}

const loadProjectScene = async (projectId: string) => {
  try {
    const detail = await projectApi.loadScene(projectId)
    currentProjectId.value = detail.id
    currentProjectName.value = detail.name
    // 记录所有者与元信息：用于判定"他人公开项目"（只读）与另存为弹窗的默认值
    currentProjectOwnerId.value = detail.ownerId
    currentProjectDescription.value = detail.description ?? ''
    currentProjectIsPublic.value = detail.isPublic ?? false
    router.replace({ query: { ...route.query, projectId: detail.id } })
    if (detail.sceneData) {
      try {
        const parsed = JSON.parse(detail.sceneData)
        const validation = validateSerializedScene(parsed)
        if (validation.valid && !isSerializedSceneEmpty(parsed as SerializedScene)) {
          importScene(scene, parsed as SerializedScene)
          // 动画数据（操作录像机）随项目一起加载；文件没有则清空
          applyAnimationFromSceneData(parsed as SerializedScene)
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
    markSavedBaseline()
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
  // 他人公开项目：不能保存到源项目，引导使用「另存为我的项目」保存副本
  if (isForeignProject.value) {
    showToast('当前为其他用户公开项目，请使用「另存为我的项目」保存副本', 'global')
    return
  }
  try {
    // 「已是最新」判定需同时看场景与动画（动画变化在场景比对里被剔除）
    if (!hasUnsavedChanges()) {
      showToast('已是最新场景', 'global')
      return
    }
    const sceneData = exportSceneWithAnimationData()
    const sceneJson = JSON.stringify(sceneData)
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
    // 若当前处于协作房间且房间关联的就是本项目，把新缩略图/修改时间同步到房间（改动即更新）
    if (thumbnailUrl && collabStore.currentRoom?.projectId === currentProjectId.value) {
      collabStore.currentRoom.projectThumbnailUrl = thumbnailUrl
      collabStore.currentRoom.updatedAt = new Date().toISOString()
    }
    markSavedBaseline()
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
      :view-only="isReadOnly"
      :is-foreign-project="isForeignProject"
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
      @save-as-my-project="handleOpenSaveAsDialog"
      @open-align-points="handleOpenAlignPoints"
      @project-created="handleProjectCreated"
    />

    <div ref="editorBodyRef" class="editor-body">
      <div ref="sidebarShellRef" class="sidebar-shell" :style="sidebarShellStyle">
        <!-- 原地播放期间主视图显示的是影子场景，此时侧栏可选中播放场景的对象，
             但其编辑作用于主场景（对当前画面无效）——必须一并锁住，避免「改了没反应」的困惑 -->
        <Sidebar
          :scene="scene"
          :editor="editor"
          :view-only="isReadOnly || animationStore.locksMainViewInteraction"
        />
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
        <!-- 他人公开项目：预览态提示，可直接点击"点击编辑"进入编辑（临时副本，不影响源项目） -->
        <div v-if="isForeignProject && !isForeignEditing" class="view-only-banner preview-banner">
          <span>正在预览「{{ currentProjectName || '该项目' }}」，</span>
          <button class="preview-edit-btn" @click="handleEnterForeignEdit">点击编辑</button>
        </div>
        <!-- 他人公开项目：已进入编辑态提示（可切回预览，保留已有编辑） -->
        <div
          v-else-if="isForeignProject && isForeignEditing"
          class="view-only-banner preview-banner"
        >
          <span
            >正在编辑「{{
              currentProjectName || '该项目'
            }}」的临时副本，可通过菜单「另存为我的项目」保存，</span
          >
          <button class="preview-edit-btn" @click="isForeignEditing = false">切回预览</button>
        </div>
        <!-- 协作观看者：只读提示 -->
        <div v-else-if="isViewOnlyCollab" class="view-only-banner">
          正在观看协作，当前编辑权限不可用
        </div>
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
        <div v-if="activeDrags.length > 0" ref="dragAwarenessLayerRef" class="drag-awareness-layer">
          <div
            v-for="drag in activeDrags"
            :key="drag.clientId"
            class="drag-awareness-bubble"
            :data-client-id="drag.clientId"
          >
            <span class="drag-awareness-bubble-text"
              >{{ drag.userName || '其他用户' }}正在操作...</span
            >
            <span class="drag-awareness-bubble-tail" aria-hidden="true"></span>
          </div>
        </div>
        <!-- 原地播放：持续提示「当前看到的是播放场景，不是编辑器场景」。
             整圈描边 + 顶部徽标，避免用户误以为还在原场景里操作。 -->
        <template v-if="animationStore.locksMainViewInteraction">
          <div class="playback-scene-frame" aria-hidden="true"></div>
          <div class="playback-scene-badge" :class="{ offset: hasViewportTopBanner }">
            <span class="dot" aria-hidden="true"></span>
            动画播放中
          </div>
        </template>
        <div class="performance-indicators">
          <div class="fps-indicator">FPS: {{ fps }}</div>
          <div v-if="collabStatus.connected && collabLatencyMs !== null" class="latency-indicator">
            {{ collabLatencyMs }} ms
          </div>
        </div>
        <!-- 浮窗播放：第二 renderer + 第二 canvas，主视图可继续协作作图 -->
        <AnimationFloatWindow
          v-if="showFloatWindow"
          :host-el="viewportRef"
          @container="handleFloatContainer"
          @resize="handleFloatResize"
          @reset-camera="handleFloatResetCamera"
          @toggle-axes="handleFloatToggleAxes"
        />

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

    <AnimationLibraryDialog />

    <NewProjectDialog
      :visible="newProjectDialogVisible"
      @confirm="handleNewProjectConfirm"
      @cancel="handleNewProjectCancel"
    />

    <SaveAsMyProjectDialog
      :visible="saveAsDialogVisible"
      :source-project-name="currentProjectName"
      :source-description="currentProjectDescription"
      :source-is-public="currentProjectIsPublic"
      @confirm="handleSaveAsConfirm"
      @cancel="handleSaveAsCancel"
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

/*
 * 原地播放期间的持续提示：
 * - playback-scene-frame：整圈呼吸式描边（不占内容、不拦交互）
 * - playback-scene-badge：顶部居中徽标，说明「当前是播放场景」
 * 二者仅覆盖视口本身，且 pointer-events: none，不影响任何操作。
 */
.playback-scene-frame {
  position: absolute;
  inset: 0;
  z-index: 29;
  border: 2px solid rgba(255, 160, 70, 0.5);
  pointer-events: none;
  animation: playback-frame-pulse 2.4s ease-in-out infinite;
}

@keyframes playback-frame-pulse {
  0%,
  100% {
    border-color: rgba(255, 160, 70, 0.32);
    box-shadow: inset 0 0 0 rgba(255, 160, 70, 0);
  }
  50% {
    border-color: rgba(255, 175, 90, 0.85);
    box-shadow: inset 0 0 26px rgba(255, 160, 70, 0.16);
  }
}

.playback-scene-badge {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid rgba(255, 175, 90, 0.55);
  border-radius: 999px;
  background: rgba(74, 45, 12, 0.86);
  color: #ffcf9a;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(6px);
}

/* 顶部已有其它横幅时下移，避免两条横幅重叠 */
.playback-scene-badge.offset {
  top: 48px;
}

.playback-scene-badge .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ffab4a;
  animation: playback-badge-blink 1.6s ease-in-out infinite;
}

@keyframes playback-badge-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
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

/* 预览/编辑他人公开项目提示：需要可点击，因此放开 pointer-events 并改为 flex 布局 */
.view-only-banner.preview-banner {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* "点击编辑"：无边框、无背景的纯文字按钮，用高亮色与提示文字区分 */
.preview-edit-btn {
  border: none;
  background: none;
  padding: 0 2px;
  margin: 0;
  font: inherit;
  font-weight: 600;
  color: #4ea1ff;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s ease;
}

.preview-edit-btn:hover {
  color: #7cbcff;
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
