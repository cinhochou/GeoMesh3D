<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, reactive } from 'vue'

import Toolbar from '../components/ToolBar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/TimeLine.vue'

import { Scene } from '../core/scene/Scene'
import { Editor, EditorMode } from '../core/editor/Editor'
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
const fps = ref(0)
let lastFpsTime = performance.now()
let frameCount = 0

// 提示框相关的响应式变量
const toastMessage = ref('')
const isToastVisible = ref(false)
const toastScope = ref<'global' | 'viewport'>('global')
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

const modeName = computed(() => {
  switch (editor.mode) {
    case EditorMode.Select:
      return '选择'
    case EditorMode.Delete:
      return '删除'
    case EditorMode.CreatePoint:
      return '创建点'
    case EditorMode.CreateLine:
      return '连线'
    default:
      return ''
  }
})

onMounted(() => {
  renderer = new ThreeRenderer(viewportRef.value!)
  interaction = new Interaction(editor, renderer)
  interaction.bind(renderer.renderer.domElement)

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
    collabManager.value?.syncAction() // 每次操作后同步
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
    renderer.sync(scene, interaction.rubberBandData)
    renderer.render()
    requestAnimationFrame(loop)
  }
  loop()

  window.addEventListener('resize', handleResize)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('toast', handleToast as EventListener)
})

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
    try {
      await collabManager.value?.joinRoom(room)
      showToast(`😉 成功加入房间: ${room}`, 'global')
    } catch (err) {
      console.error(err)
      showToast('⚠️ 协作连接失败（请检查 signaling 服务）', 'global')
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
      @toggle-ar="handleToggleAR"
      @toggle-collab="handleToggleCollab"
    />

    <div class="editor-body">
      <Sidebar :scene="scene" :editor="editor" :modeName="modeName" />

      <div ref="viewportRef" class="viewport">
        <Transition name="toast-fade">
          <div v-if="isToastVisible && toastScope === 'viewport'" class="toast-container-viewport">
            <div class="toast-content">
              {{ toastMessage }}
            </div>
          </div>
        </Transition>
        <div class="fps-indicator">FPS: {{ fps }}</div>
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

@media (max-width: 1024px) and (orientation: landscape) {
  .fps-indicator {
    top: 8px;
    right: 8px;
    padding: 4px 8px;
    font-size: 11px;
  }

  .toast-content {
    padding: 12px 20px;
    font-size: 14px;
  }
}
</style>
