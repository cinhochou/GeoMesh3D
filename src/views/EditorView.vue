<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, reactive } from 'vue'

import Toolbar from '../components/ToolBar.vue'
import Sidebar from '../components/Sidebar.vue'
import Timeline from '../components/TimeLine.vue'

import { Scene } from '../core/scene/Scene'
import { Editor, EditorMode } from '../core/editor/Editor'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'
import { CollabManager } from '../core/collab/CollabManager'

const viewportRef = ref<HTMLDivElement | null>(null)

const scene = reactive(new Scene())
const editor = reactive(new Editor(scene))

let renderer: ThreeRenderer
let interaction: Interaction

const peerCount = ref(1)
const collabManager = ref<CollabManager | null>(null)
const isARMode = ref(false)
const lastModeBeforeAR = ref<EditorMode | null>(null)

// 提示框相关的响应式变量
const toastMessage = ref('')
const isToastVisible = ref(false)
let toastTimer: number | null = null

const modeName = computed(() => {
  switch (editor.mode) {
    case EditorMode.Select:
      return '选择'
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

  // 劫持 Editor 的命令执行，实现自动同步
  const originalExecute = editor.executeCommand.bind(editor)
  editor.executeCommand = (cmd) => {
    originalExecute(cmd)
    collabManager.value?.syncAction() // 每次操作后同步
  }

  const loop = () => {
    scene.constraints.forEach((c) => c.solve())
    renderer.render()
    renderer.sync(scene, interaction.rubberBandData)
    requestAnimationFrame(loop)
  }
  loop()

  window.addEventListener('resize', () => {
    renderer.onResize()
  })
})

// 生命周期钩子，防止页面刷新或销毁后连接残留
onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
  collabManager.value?.leaveRoom()
})

function onModeChange(mode: EditorMode) {
  // AR 模式下仅允许“选择”功能
  if (isARMode.value && mode !== EditorMode.Select) return
  editor.setMode(mode)
}

const handleToggleAR = async (enabled: boolean) => {
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

const handleToggleCollab = ({ open, room }: { open: boolean; room: string }) => {
  if (open) {
    collabManager.value?.joinRoom(room)
    showToast(`😉 成功加入房间: ${room}`)
  } else {
    collabManager.value?.leaveRoom()
    showToast('😶‍🌫️ 已成功退出协作')
  }
}

// 统一的提示函数
const showToast = (msg: string) => {
  if (toastTimer) clearTimeout(toastTimer)
  toastMessage.value = msg
  isToastVisible.value = true
  toastTimer = window.setTimeout(() => {
    isToastVisible.value = false
  }, 1000)
}
</script>

<template>
  <div class="editor-root">
    <Transition name="toast-fade">
      <div v-if="isToastVisible" class="toast-container">
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
      @mode-change="onModeChange"
      @toggle-snapping="editor.toggleSnapping()"
      @toggle-ar="handleToggleAR"
      @toggle-collab="handleToggleCollab"
    />

    <div class="editor-body">
      <Sidebar :scene="scene" :modeName="modeName" />

      <div ref="viewportRef" class="viewport"></div>
    </div>

    <Timeline />
  </div>
</template>

<style scoped>
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.viewport {
  flex: 1;
  background: #000;
  position: relative; /* 必须加上这个！作为 Video 和 Canvas 的定位基准 */
  overflow: hidden; /* 防止视频溢出 */
  min-height: 0;
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
</style>
