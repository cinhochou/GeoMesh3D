<script setup lang="ts">
import { EditorMode } from '../core/editor/Editor'

const emit = defineEmits<{
  (e: 'mode-change', mode: EditorMode): void
}>()
</script>

<template>
  <div class="toolbar">
    <button @click="emit('mode-change', EditorMode.Select)">选择</button>
    <button @click="emit('mode-change', EditorMode.CreatePoint)">点</button>
    <button @click="emit('mode-change', EditorMode.CreateLine)">线</button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
}
button {
  background: #333;
  color: #eee;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
}
button:hover {
  background: #555;
}
</style>
