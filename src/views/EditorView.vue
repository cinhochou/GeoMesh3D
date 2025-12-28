<script setup lang="ts">
import { onMounted, ref, computed, reactive } from 'vue'

import Toolbar from '../components/ToolBar.vue'
import Sidebar from '../components/SideBar.vue'
import Timeline from '../components/TimeLine.vue'

import { Scene } from '../core/scene/Scene'
import { Editor, EditorMode } from '../core/editor/Editor'
import { ThreeRenderer } from '../renderer/ThreeRenderer'
import { Interaction } from '../renderer/Interaction'

const viewportRef = ref<HTMLDivElement | null>(null)

const scene = reactive(new Scene())
const editor = reactive(new Editor(scene))

let renderer: ThreeRenderer
let interaction: Interaction

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
</script>

<template>
  <div class="editor-root">
    <Toolbar
      :current-mode="editor.mode"
      :is-snapping-enabled="editor.isSnappingEnabled"
      @mode-change="onModeChange"
      @toggle-snapping="editor.toggleSnapping()"
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
}
</style>
