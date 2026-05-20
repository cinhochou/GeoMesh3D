<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import * as THREE from 'three'

import Toolbar from '../components/Toolbar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/TimeLine.vue'
import InputDialog from '../components/InputDialog.vue'

import { EditorMode } from '../core/editor/Editor'
import type { Command } from '../core/editor/Command'
import type { Point3 } from '../core/geometry/Point3'
import { getEditorSession } from '../core/editor/editorSession'
import {
  downloadSceneAsJson,
  openJsonFileForImport,
  validateSerializedScene,
  importScene,
  isSceneEmpty,
  isSerializedSceneEmpty,
  type SerializedScene,
} from '../core/editor/SceneSerializer'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { CollabManager } from '../core/collab/CollabManager'
import SolverSchedulerWorker from '../core/perf/solverScheduler.worker?worker'
import { useUiStore } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'
import { useCollabStore } from '@/store/collabStore'
import { useAuthStore } from '@/store/authStore'

const viewportRef = ref<HTMLDivElement | null>(null)
const editorBodyRef = ref<HTMLDivElement | null>(null)
const sidebarShellRef = ref<HTMLDivElement | null>(null)
const uiStore = useUiStore()
const sceneStore = useSceneStore()
const collabStore = useCollabStore()
const authStore = useAuthStore()
const {
  fps,
  axisGridSize,
  isGridVisible,
  isCoordinateSystemVisible,
  isGlobalPointValueMode,
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
} = storeToRefs(uiStore)
const {
  latencyMs: collabLatencyMs,
  status: collabStatus,
  joinDialog: collabJoinDialog,
} = storeToRefs(collabStore)
const { user } = storeToRefs(authStore)

const { scene, editor, originalExecuteCommand, originalUndo, originalRedo } = getEditorSession()

let renderer: ThreeRenderer
let interaction: Interaction
let animationFrameId: number | null = null
let solverWorker: Worker | null = null
let scheduleSolverFlush = () => {}
let detachSolverListener = () => {}
let solverFlushRequested = false
let solverFlushReady = false

const collabManager = ref<CollabManager | null>(null)
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

onMounted(() => {
  uiStore.setTouchDevice(
    navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(hover: none)').matches,
  )

  renderer = new ThreeRenderer(viewportRef.value!)
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
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)
  // Ensure renderer rebuilds meshes when editor view is mounted again
  scene.markAllRenderDirty()

  collabManager.value = new CollabManager(scene)
  collabManager.value.setLocalUserLabel(user.value?.nickname || user.value?.username || null)
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
    originalExecuteCommand(cmd)
    collabManager.value?.syncAction()
  }

  editor.undo = () => {
    originalUndo()
    collabManager.value?.syncAction()
  }

  editor.redo = () => {
    originalRedo()
    collabManager.value?.syncAction()
  }

  const loop = () => {
    frameCount++
    const now = performance.now()
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
})

watch(
  isGlobalPointValueMode,
  (enabled) => {
    interaction?.setGlobalPointValueMode(enabled)
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
    () => scene.selection.rays.size,
    () => scene.selection.vectors.size,
    () => scene.selection.circles.size,
    () => scene.selection.faces.size,
    () => scene.selection.spheres.size,
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
    () => editor.historyIndex,
    () => editor.history.length,
    () => editor.isSnappingEnabled,
    () => scene.points.size,
    () => scene.lines.size,
    () => scene.straightLines.size,
    () => scene.rays.size,
    () => scene.circles.size,
    () => scene.faces.size,
    () => scene.spheres.size,
  ],
  () => {
    scene.markAllRenderDirty()
    sceneStore.syncEditorState(editor)
    sceneStore.syncSceneState(scene)
  },
  { flush: 'post' },
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

// 生命周期钩子，防止页面刷新或销毁后连接残留
onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
  collabManager.value?.leaveRoom()
  collabStore.resetCollabState()
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }
  editor.executeCommand = originalExecuteCommand
  editor.undo = originalUndo
  editor.redo = originalRedo
  detachSolverListener()
  solverWorker?.terminate()
  solverWorker = null
  interaction?.unbind(renderer.renderer.domElement)
  window.removeEventListener('open-regular-polygon-dialog', handleOpenRegularPolygonDialog)
  window.removeEventListener('show-normal-circle-radius-dialog', handleShowNormalCircleRadiusDialog)
  window.removeEventListener('show-radius-sphere-dialog', handleShowRadiusSphereDialog)
  window.removeEventListener('show-cone-radius-dialog', handleShowConeRadiusDialog)
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
  document.body.classList.remove('sidebar-width-resizing')
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

const radiusSphereRadiusError = computed(() => {
  if (!radiusSphereDialog.value.visible) return ''
  const r = radiusSphereDialog.value.radius
  if (typeof r !== 'number' || isNaN(r)) return '请输入有效的数字'
  if (r <= 0) return '半径必须大于 0'
  return ''
})

const canConfirmRadiusSphereRadius = computed(() => {
  return radiusSphereRadiusError.value === ''
})

const handleShowConeRadiusDialog = (e: Event) => {
  const detail = (e as CustomEvent).detail
  uiStore.openConeRadiusDialog(detail.baseCenterPointId, detail.apexPointId)
}

const handleConfirmConeRadius = () => {
  if (!canConfirmConeRadius.value) return
  const r = Math.round(coneRadiusDialog.value.radius * 10) / 10
  interaction.confirmConeRadius(coneRadiusDialog.value.baseCenterPointId, coneRadiusDialog.value.apexPointId, r)
  uiStore.closeConeRadiusDialog()
}

const handleCancelConeRadius = () => {
  interaction.cancelConeCreation()
  uiStore.closeConeRadiusDialog()
}

const coneRadiusRadiusError = computed(() => {
  if (!coneRadiusDialog.value.visible) return ''
  const r = coneRadiusDialog.value.radius
  if (typeof r !== 'number' || isNaN(r)) return '请输入有效的数字'
  if (r <= 0) return '半径必须大于 0'
  return ''
})

const canConfirmConeRadius = computed(() => {
  return coneRadiusRadiusError.value === ''
})

const normalCircleRadiusError = computed(() => {
  if (!normalCircleRadiusDialog.value.visible) return ''
  const r = normalCircleRadiusDialog.value.radius
  if (typeof r !== 'number' || isNaN(r)) return '请输入有效的数字'
  if (r <= 0) return '半径必须大于 0'
  return ''
})

const canConfirmNormalCircleRadius = computed(() => {
  return normalCircleRadiusError.value === ''
})

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
    const saved = await downloadSceneAsJson(scene)
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

    editor.history = []
    editor.historyIndex = -1
    editor.selectedPoints = []
    scene.selection.clear()

    importScene(scene, result.data as SerializedScene)

    sceneStore.syncEditorState(editor)
    sceneStore.syncSceneState(scene)
    scene.markAllRenderDirty()

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

const handleToggleGlobalPointValue = (enabled: boolean) => {
  uiStore.setGlobalPointValueMode(enabled)
  interaction?.setGlobalPointValueMode(enabled)
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
      await collabManager.value?.joinRoom(room)
      scene.selection.clear()
      editor.selectedPoints = []
      editor.history = []
      editor.historyIndex = -1
      collabStore.closeJoinDialog()
      showToast(`成功加入房间: ${room}`, 'global')
    } catch (err) {
      console.error(err)
      collabStore.closeJoinDialog()
      showToast('⚠️ 协作连接失败（请检查 websocket 服务）', 'global')
    }
    return
  }

  collabManager.value?.leaveRoom()
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
          >{{ point.name }}（{{ point.position.x.toFixed(2) }},
          {{ point.position.y.toFixed(2) }}, {{ point.position.z.toFixed(2) }}）</span
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
      @mode-change="onModeChange"
      @clear-all="handleClearAll"
      @undo="handleUndo"
      @redo="handleRedo"
      @toggle-snapping="editor.toggleSnapping()"
      @toggle-coordinate-system="handleToggleCoordinateSystem"
      @toggle-global-point-value="handleToggleGlobalPointValue"
      @toggle-ar="handleToggleAR"
      @toggle-collab="handleToggleCollab"
      @export-scene="handleExportScene"
      @import-scene="handleImportScene"
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
</style>
