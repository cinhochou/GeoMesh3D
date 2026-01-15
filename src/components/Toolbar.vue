<!-- src/components/ToolBar.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { EditorMode } from '../core/editor/Editor'

defineProps<{
  currentMode: EditorMode
  isSnappingEnabled: boolean
  peerCount: number
}>()

const emit = defineEmits<{
  (e: 'mode-change', mode: EditorMode): void
  (e: 'toggle-snapping'): void // 新增：切换吸附事件
  (e: 'toggle-ar', isOpen: boolean): void
  (e: 'toggle-collab', data: { open: boolean; room: string }): void
}>()

const roomName = ref('default-room')
const isCollabOpen = ref(false)
const isAROpen = ref(false)

const toggleCollab = () => {
  isCollabOpen.value = !isCollabOpen.value
  // 发送事件给父组件执行 join 或 leave
  emit('toggle-collab', { open: isCollabOpen.value, room: roomName.value })
}

const toggleAR = () => {
  isAROpen.value = !isAROpen.value
  emit('toggle-ar', isAROpen.value)
}
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

    <div class="divider"></div>

    <div class="collab-box">
      <input
        v-model="roomName"
        :disabled="isCollabOpen"
        placeholder="输入房间名"
        class="room-input"
      />
      <button @click="toggleCollab" :class="{ active: isCollabOpen }">
        {{ isCollabOpen ? '退出协作' : '开启协作' }}
      </button>
      <span v-if="isCollabOpen" class="peer-count">👥 {{ peerCount }}</span>
    </div>

    <div class="divider"></div>

    <button @click="toggleAR" :class="{ active: isAROpen }">
      {{ isAROpen ? '退出 AR' : '开启 AR' }}
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
.room-input {
  background: #222;
  border: 1px solid #444;
  color: #fff;
  padding: 4px 8px;
  margin-right: 4px;
  width: 100px;
}
.room-input:disabled {
  color: #666;
  background: #111;
  border-color: #333;
}
.peer-count {
  margin-left: 8px;
  color: #43f260;
  font-family: monospace;
}
</style>
