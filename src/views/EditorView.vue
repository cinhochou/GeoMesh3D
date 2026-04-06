<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, reactive, watch } from 'vue'

import Toolbar from '../components/Toolbar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/TimeLine.vue'

import { Scene } from '../core/scene/Scene'
import { Editor, EditorMode } from '../core/editor/Editor'
import type { Point3 } from '../core/geometry/Point3'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { CollabManager, type CollabStatus } from '../core/collab/CollabManager'

const viewportRef = ref<HTMLDivElement | null>(null)

const scene = reactive(new Scene())
const editor = reactive(new Editor(scene))

let renderer: ThreeRenderer
let interaction: Interaction

const peerCount = ref(1)
const collabManager = ref<CollabManager | null>(null)
const collabStatus = ref<CollabStatus>({ room: null, connecting: false, connected: false })
const isARMode = ref(false)
const lastModeBeforeAR = ref<EditorMode | null>(null)
const lastModeBeforeCoordinateOff = ref<EditorMode | null>(null)
const axisGridSize = ref(10)
const isGridVisible = ref(true)
const isCoordinateSystemVisible = ref(true)
const fps = ref(0)
let lastFpsTime = performance.now()
let frameCount = 0
const isTouchDevice = ref(false)

// 提示框相关的响应式变量
const toastMessage = ref('')
const isToastVisible = ref(false)
const toastScope = ref<'global' | 'viewport'>('global')
let toastTimer: number | null = null
const isCollabJoinDialogVisible = ref(false)
const collabJoinDialogMessage = ref('正在加入房间中...')
const isMergePointDialogVisible = ref(false)
const mergePointTargetId = ref('')

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

const modeName = computed(() => {
  switch (editor.mode) {
    case EditorMode.Select:
      return '选择'
    case EditorMode.Delete:
      return '删除'
    case EditorMode.CreatePoint:
      return '创建自由点'
    case EditorMode.MergePoint:
      return '合并点'
    case EditorMode.CreateLine:
      return '创建线段'
    case EditorMode.CreateStraightLine:
      return '创建直线'
    case EditorMode.CreateRay:
      return '创建射线'
    case EditorMode.CreatePlane:
      return '创建面'
    default:
      return ''
  }
})

const modeHint = computed(() => {
  switch (editor.mode) {
    case EditorMode.Delete:
      return '单击场景中的几何元素对象以删除~'
    case EditorMode.CreateLine:
      return '点击场景中的两个不同的点以创建线段~'
    case EditorMode.CreateStraightLine:
      return '点击场景中的两个不同的点以创建直线~'
    case EditorMode.CreateRay:
      return '点击场景中的两个不同的点以创建射线~'
    case EditorMode.CreatePlane:
      return '先选择多个点或闭合线段，再点击空白处确认创建面~'
    case EditorMode.MergePoint:
      return '先选中两个点，再选择保留哪个点完成合并~'
    default:
      return ''
  }
})

onMounted(() => {
  isTouchDevice.value =
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches

  renderer = new ThreeRenderer(viewportRef.value!)
  axisGridSize.value = renderer.getAxisGridSize()
  isGridVisible.value = renderer.isAxisGridVisible()
  isCoordinateSystemVisible.value = renderer.isCoordinateSystemVisible()
  interaction = new Interaction(editor, renderer)
  interaction.bind(renderer.renderer.domElement)
  interaction.syncControlLockState()

  collabManager.value = new CollabManager(scene)

  collabManager.value.onPeersUpdate = (count) => {
    peerCount.value = count
  }
  collabManager.value.onStatusUpdate = (status) => {
    collabStatus.value = status
  }

  // 劫持 Editor 的命令执行，实现自动同步
  const originalExecute = editor.executeCommand.bind(editor)
  editor.executeCommand = (cmd) => {
    originalExecute(cmd)
    collabManager.value?.syncAction()
  }

  const originalUndo = editor.undo.bind(editor)
  editor.undo = () => {
    originalUndo()
    collabManager.value?.syncAction()
  }

  const originalRedo = editor.redo.bind(editor)
  editor.redo = () => {
    originalRedo()
    collabManager.value?.syncAction()
  }

  const loop = () => {
    frameCount++
    const now = performance.now()
    const elapsed = now - lastFpsTime
    if (elapsed >= 1000) {
      fps.value = Math.round((frameCount * 1000) / elapsed)
      frameCount = 0
      lastFpsTime = now
    }
    scene.constraints.forEach((c) => c.solve())
    if (interaction.shouldSyncLiveScene()) {
      collabManager.value?.syncLivePreview(interaction.getLiveSyncPointIds())
    }
    renderer.sync(scene, interaction.rubberBandData, interaction.getFacePreviewData())
    renderer.render()
    requestAnimationFrame(loop)
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
    if (!isTouchDevice.value || !interaction) return
    interaction.syncControlLockState()
  },
  { flush: 'post' },
)

watch(
  [() => editor.mode, () => [...scene.selection.points]],
  () => {
    if (editor.mode !== EditorMode.MergePoint) {
      isMergePointDialogVisible.value = false
      mergePointTargetId.value = ''
      return
    }

    const selectedIds = [...scene.selection.points]
    if (selectedIds.length !== 2) {
      isMergePointDialogVisible.value = false
      mergePointTargetId.value = ''
      return
    }

    mergePointTargetId.value = selectedIds.includes(mergePointTargetId.value)
      ? mergePointTargetId.value
      : selectedIds[0]!
    isMergePointDialogVisible.value = true
  },
  { flush: 'post' },
)

// 生命周期钩子，防止页面刷新或销毁后连接残留
onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
  collabManager.value?.leaveRoom()
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('toast', handleToast as EventListener)
})

function onModeChange(mode: EditorMode) {
  // AR 模式下仅允许“选择”功能
  if (isARMode.value && mode !== EditorMode.Select) return
  interaction.clearPreview()
  editor.setMode(mode)
  isMergePointDialogVisible.value = false
  mergePointTargetId.value = ''
}

const mergePointSelection = computed(() =>
  [...scene.selection.points]
    .map((id) => scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined),
)

const mergePointWarning = computed(() => {
  if (!isMergePointDialogVisible.value) return ''
  const points = mergePointSelection.value
  if (points.length !== 2) return ''
  const inheritedPoint = points.find((point) => point.id !== mergePointTargetId.value)
  return inheritedPoint ? `注意：该点将继承 ${inheritedPoint.name} 点的约束关系` : ''
})

const handleConfirmMergePoints = () => {
  const points = mergePointSelection.value
  if (points.length !== 2) return
  const keepPoint = points.find((point) => point.id === mergePointTargetId.value)
  const removePoint = points.find((point) => point.id !== mergePointTargetId.value)
  if (!keepPoint || !removePoint) return
  editor.mergePoints(keepPoint.id, removePoint.id)
  isMergePointDialogVisible.value = false
  mergePointTargetId.value = ''
}

const handleCancelMergePoints = () => {
  isMergePointDialogVisible.value = false
  mergePointTargetId.value = ''
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
  isGridVisible.value = !isGridVisible.value
  renderer.setAxisGridVisible(isGridVisible.value)
}

const handleToggleCoordinateSystem = (enabled: boolean) => {
  interaction.clearPreview()

  if (!enabled) {
    lastModeBeforeCoordinateOff.value = editor.mode
    editor.setMode(EditorMode.Select)
  } else if (!isARMode.value && lastModeBeforeCoordinateOff.value !== null) {
    editor.setMode(lastModeBeforeCoordinateOff.value)
  }

  if (enabled) {
    lastModeBeforeCoordinateOff.value = null
  }

  isCoordinateSystemVisible.value = enabled
  renderer.setCoordinateSystemVisible(enabled)

  if (enabled) {
    // 恢复“正常显示”：坐标轴与网格都显示
    isGridVisible.value = true
    renderer.setAxisGridVisible(true)
  }
}

const handleToggleAR = async (enabled: boolean) => {
  interaction.clearPreview()
  if (enabled) {
    lastModeBeforeAR.value = editor.mode
    editor.setMode(EditorMode.Select)
    isARMode.value = true
  } else {
    isARMode.value = false
    if (lastModeBeforeAR.value !== null) {
      editor.setMode(lastModeBeforeAR.value)
    }
    lastModeBeforeAR.value = null
  }

  try {
    await renderer.toggleAR(enabled)
  } catch (err) {
    // rollback if AR 初始化失败
    if (enabled && lastModeBeforeAR.value !== null) {
      editor.setMode(lastModeBeforeAR.value)
    }
    isARMode.value = false
    console.error(err)
  }
}

const handleToggleCollab = async ({ open, room }: { open: boolean; room: string }) => {
  if (open) {
    isCollabJoinDialogVisible.value = true
    collabJoinDialogMessage.value = '正在加入房间中...'
    try {
      await collabManager.value?.joinRoom(room)
      scene.selection.clear()
      editor.selectedPoints = []
      editor.history = []
      editor.historyIndex = -1
      isCollabJoinDialogVisible.value = false
      showToast(`😉 成功加入房间: ${room}`, 'global')
    } catch (err) {
      console.error(err)
      isCollabJoinDialogVisible.value = false
      showToast('⚠️ 协作连接失败（请检查 websocket 服务）', 'global')
    }
    return
  }

  collabManager.value?.leaveRoom()
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
  toastMessage.value = msg
  toastScope.value = scope
  isToastVisible.value = true
  toastTimer = window.setTimeout(() => {
    isToastVisible.value = false
  }, 1000)
}
</script>

<template>
  <div class="editor-root">
    <Transition name="fade-overlay">
      <div v-if="isCollabJoinDialogVisible" class="collab-wait-overlay">
        <div class="collab-wait-dialog">
          <div class="collab-spinner"></div>
          <div class="collab-wait-text">{{ collabJoinDialogMessage }}</div>
        </div>
      </div>
    </Transition>

    <Transition name="fade-overlay">
      <div v-if="isMergePointDialogVisible" class="collab-wait-overlay">
        <div class="merge-point-dialog">
          <div class="merge-point-title">合并点</div>
          <div class="merge-point-text">请选择要保留为合并结果的点</div>
          <label v-for="point in mergePointSelection" :key="point.id" class="merge-point-option">
            <input v-model="mergePointTargetId" type="radio" :value="point.id" />
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
      <div v-if="isToastVisible && toastScope === 'global'" class="toast-container">
        <div class="toast-content">
          {{ toastMessage }}
        </div>
      </div>
    </Transition>

    <Toolbar
      :current-mode="editor.mode"
      :is-snapping-enabled="editor.isSnappingEnabled"
      :is-coordinate-system-visible="isCoordinateSystemVisible"
      :peer-count="peerCount"
      :is-ar-mode="isARMode"
      :collab-status="collabStatus"
      :can-undo="editor.canUndo"
      :can-redo="editor.canRedo"
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
      <Sidebar :scene="scene" :editor="editor" :modeName="modeName" :modeHint="modeHint" />

      <div ref="viewportRef" class="viewport">
        <Transition name="toast-fade">
          <div v-if="isToastVisible && toastScope === 'viewport'" class="toast-container-viewport">
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
