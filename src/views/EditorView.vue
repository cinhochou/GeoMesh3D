<!-- src/views/EditorView.vue -->
<script setup lang="ts">
import { onMounted, ref, computed, reactive } from 'vue'

import Toolbar from '../components/ToolBar.vue'
import Sidebar from '../components/SideBar.vue'
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
    renderer.resize(viewportRef.value!.clientWidth, viewportRef.value!.clientHeight)
  })
})

function onModeChange(mode: EditorMode) {
  editor.setMode(mode)
}

const handleToggleAR = (enabled: boolean) => {
  renderer.toggleAR(enabled)
}

const handleToggleCollab = ({ open, room }: { open: boolean; room: string }) => {
  if (open) collabManager.value?.joinRoom(room)
}
</script>

<template>
  <div class="editor-root">
    <Toolbar
      :current-mode="editor.mode"
      :is-snapping-enabled="editor.isSnappingEnabled"
      :peer-count="peerCount"
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
</style>
