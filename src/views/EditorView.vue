<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'

import Toolbar from '../components/Toolbar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/TimeLine.vue'

import { EditorMode } from '../core/editor/Editor'
import type { Command } from '../core/editor/Command'
import type { Point3 } from '../core/geometry/Point3'
import { getEditorSession } from '../core/editor/editorSession'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { CollabManager } from '../core/collab/CollabManager'
import { useUiStore } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'
import { useCollabStore } from '@/store/collabStore'

const viewportRef = ref<HTMLDivElement | null>(null)
const uiStore = useUiStore()
const sceneStore = useSceneStore()
const collabStore = useCollabStore()
const {
  fps,
  axisGridSize,
  isGridVisible,
  isCoordinateSystemVisible,
  isARMode,
  lastModeBeforeAR,
  lastModeBeforeCoordinateOff,
  isTouchDevice,
  toastMessage,
  toastVisible,
  toastScope,
  mergePointDialog,
} = storeToRefs(uiStore)
const { peerCount, status: collabStatus, joinDialog: collabJoinDialog } = storeToRefs(collabStore)

const { scene, editor, originalExecuteCommand, originalUndo, originalRedo } = getEditorSession()

let renderer: ThreeRenderer
let interaction: Interaction
let animationFrameId: number | null = null

const collabManager = ref<CollabManager | null>(null)
let lastFpsTime = performance.now()
let frameCount = 0

// 提示框相关的响应式变量
let toastTimer: number | null = null

const handleResize = () => {
  renderer.onResize()
}

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
  interaction.bind(renderer.renderer.domElement)
  interaction.syncControlLockState()
  sceneStore.syncEditorState(editor)
  sceneStore.syncSceneState(scene)

  collabManager.value = new CollabManager(scene)

  collabManager.value.onPeersUpdate = (count) => {
    collabStore.setPeerCount(count)
  }
  collabManager.value.onStatusUpdate = (status) => {
    collabStore.setStatus(status)
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
    scene.constraints.forEach((c) => c.solve())
    if (interaction.shouldSyncLiveScene()) {
      collabManager.value?.syncLivePreview(interaction.getLiveSyncPointIds())
    }
    renderer.sync(scene, interaction.rubberBandData, interaction.getFacePreviewData())
    renderer.render()
    animationFrameId = requestAnimationFrame(loop)
  }
  loop()

  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('toast', handleToast as EventListener)
})

watch(
  [
    () => scene.selection.points.size,
    () => scene.selection.lines.size,
    () => scene.selection.straightLines.size,
    () => scene.selection.rays.size,
    () => scene.selection.faces.size,
    () => editor.mode,
    isARMode,
  ],
  () => {
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
    () => scene.faces.size,
  ],
  () => {
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
  interaction?.unbind(renderer.renderer.domElement)
  renderer?.dispose()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('toast', handleToast as EventListener)
})

function onModeChange(mode: EditorMode) {
  // AR 模式下仅允许“选择”功能
  if (isARMode.value && mode !== EditorMode.Select) return
  interaction.clearPreview()
  editor.setMode(mode)
  sceneStore.setCurrentMode(mode)
  uiStore.closeMergePointDialog()
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

const handleClearAll = () => {
  const confirmed = window.confirm('⚠"清空"会删除场景中的所有对象。确定要继续吗？')
  if (!confirmed) return

  editor.clearAll()
  showToast('已清空所有对象', 'global')
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
      showToast(`😉 成功加入房间: ${room}`, 'global')
    } catch (err) {
      console.error(err)
      collabStore.closeJoinDialog()
      showToast('⚠️ 协作连接失败（请检查 websocket 服务）', 'global')
    }
    return
  }

  collabManager.value?.leaveRoom()
  collabStore.setPeerCount(1)
  showToast('😶‍🌫️ 已成功退出协作', 'global')
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

    <Transition name="fade-overlay">
      <div v-if="mergePointDialog.visible" class="collab-wait-overlay">
        <div class="merge-point-dialog">
          <div class="merge-point-title">合并点</div>
          <div class="merge-point-text">请选择要保留为合并结果的点</div>
          <label v-for="point in mergePointSelection" :key="point.id" class="merge-point-option">
            <input v-model="mergePointDialog.targetId" type="radio" :value="point.id" />
            <span
              >{{ point.name }}（{{ point.position.x.toFixed(2) }},
              {{ point.position.y.toFixed(2) }}, {{ point.position.z.toFixed(2) }}）</span
            >
          </label>
          <div class="merge-point-warning">{{ mergePointWarning }}</div>
          <div class="merge-point-actions">
            <button type="button" class="merge-point-button" @click="handleCancelMergePoints">
              取消
            </button>
            <button
              type="button"
              class="merge-point-button merge-point-button-confirm"
              @click="handleConfirmMergePoints"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Transition>

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
      @toggle-ar="handleToggleAR"
      @toggle-collab="handleToggleCollab"
    />

    <div class="editor-body">
      <Sidebar :scene="scene" :editor="editor" />

      <div ref="viewportRef" class="viewport">
        <Transition name="toast-fade">
          <div v-if="toastVisible && toastScope === 'viewport'" class="toast-container-viewport">
            <div class="toast-content">
              {{ toastMessage }}
            </div>
          </div>
        </Transition>
        <div class="fps-indicator">FPS: {{ fps }}</div>
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
.fps-indicator {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 30;
  background: transparent;
  color: #ffffff;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  pointer-events: none;
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
.merge-point-dialog {
  min-width: 320px;
  max-width: 420px;
  padding: 20px 24px;
  border: 1px solid #ffffff;
  border-radius: 8px;
  background: rgba(20, 20, 20, 0.96);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.merge-point-title {
  font-size: 18px;
  font-weight: 700;
}

.merge-point-text {
  font-size: 13px;
  color: #d4d4d4;
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
}

.merge-point-warning {
  color: #ffd75a;
  font-size: 12px;
  line-height: 1.5;
}

.merge-point-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.merge-point-button {
  border: 1px solid #555;
  border-radius: 6px;
  background: #2a2a2a;
  color: #f2f2f2;
  padding: 6px 14px;
}

.merge-point-button-confirm {
  background: #2c5a34;
  color: #43f260;
  border-color: #43f260;
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
  .fps-indicator {
    top: 8px;
    right: 8px;
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
</style>
