<script setup lang="ts">
import { EditorMode } from '../core/editor/Editor'

defineProps<{
  currentMode: EditorMode
  isSnappingEnabled: boolean
}>()

const emit = defineEmits<{
  (e: 'mode-change', mode: EditorMode): void
  (e: 'toggle-snapping'): void // 新增：切换吸附事件
}>()
</script>

<template>
  <div class="toolbar">
    <button
      :class="{ 'is-active': currentMode === EditorMode.Select }"
      @click="emit('mode-change', EditorMode.Select)"
    >
      选择
    </button>
    <button
      :class="{ 'is-active': currentMode === EditorMode.CreatePoint }"
      @click="emit('mode-change', EditorMode.CreatePoint)"
    >
      点
    </button>
    <button
      :class="{ 'is-active': currentMode === EditorMode.CreateLine }"
      @click="emit('mode-change', EditorMode.CreateLine)"
    >
      线
    </button>
    <div class="divider"></div>

    <button :class="{ active: isSnappingEnabled }" @click="emit('toggle-snapping')">
      吸附: {{ isSnappingEnabled ? '开启' : '关闭' }}
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  align-items: center;
}
.divider {
  width: 1px;
  height: 20px;
  background: #444;
  margin: 0 4px;
}
button {
  background: #333;
  color: #eee;
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.2s;
}
button:hover {
  background: #444;
}
/* 开启状态的高亮样式 */
button.active {
  background: #2c5a34;
  color: #43f260;
  /* border: 1px solid #43f260; */
}
button:active {
  background: #43f260;
  color: #000;
}
button.is-active {
  background: #43f260;
  color: #000;
  font-weight: bold;
  border-color: #ffffff;
}
</style>
