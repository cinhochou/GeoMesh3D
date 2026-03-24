<!-- src/components/ToolBar.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { EditorMode } from '../core/editor/Editor'
import type { CollabStatus } from '../core/collab/CollabManager'

defineOptions({
  name: 'EditorToolbar',
})

const props = defineProps<{
  currentMode: EditorMode
  isSnappingEnabled: boolean
  peerCount: number
  isArMode: boolean
  collabStatus: CollabStatus
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  (e: 'mode-change', mode: EditorMode): void
  (e: 'toggle-snapping'): void
  (e: 'toggle-ar', isOpen: boolean): void
  (e: 'toggle-collab', data: { open: boolean; room: string }): void
  (e: 'clear-all'): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const roomName = ref('default-room')
const isAROpen = ref(false)
const isDeleteMenuOpen = ref(false)
const isArLocked = computed(() => props.isArMode)
const isCollabOpen = computed(() => props.collabStatus.connected)
const isCollabConnecting = computed(() => props.collabStatus.connecting)
const deleteMenuRef = ref<HTMLElement | null>(null)
const deleteTriggerRef = ref<HTMLElement | null>(null)
const deletePanelRef = ref<HTMLElement | null>(null)
const deleteMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '108px',
})

watch(
  () => props.isArMode,
  (val) => {
    isAROpen.value = val
    if (val) isDeleteMenuOpen.value = false
  },
  { immediate: true },
)

const setMode = (mode: EditorMode) => {
  isDeleteMenuOpen.value = false
  emit('mode-change', mode)
}

const toggleCollab = () => {
  if (isCollabConnecting.value) return
  if (isCollabOpen.value) {
    emit('toggle-collab', { open: false, room: roomName.value })
  } else {
    emit('toggle-collab', { open: true, room: roomName.value })
  }
}

const toggleAR = () => {
  isDeleteMenuOpen.value = false
  isAROpen.value = !isAROpen.value
  emit('toggle-ar', isAROpen.value)
}

const toggleDeleteMenu = () => {
  if (isArLocked.value) return
  isDeleteMenuOpen.value = !isDeleteMenuOpen.value
}

const updateDeleteMenuPosition = () => {
  const trigger = deleteTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  deleteMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 108)}px`,
  }
}

const selectDeleteMode = () => {
  setMode(EditorMode.Delete)
}

const requestClearAll = () => {
  isDeleteMenuOpen.value = false
  emit('clear-all')
}

const handleClickOutside = (event: MouseEvent) => {
  if (!isDeleteMenuOpen.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (
    !deleteMenuRef.value?.contains(target) &&
    !deletePanelRef.value?.contains(target)
  ) {
    isDeleteMenuOpen.value = false
  }
}

watch(isDeleteMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateDeleteMenuPosition()
})

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('resize', updateDeleteMenuPosition)
  document.addEventListener('scroll', updateDeleteMenuPosition, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('resize', updateDeleteMenuPosition)
  document.removeEventListener('scroll', updateDeleteMenuPosition, true)
})
</script>

<template>
  <div class="toolbar">
    <button
      :class="{ 'is-active': currentMode === EditorMode.Select }"
      @click="setMode(EditorMode.Select)"
    >
      选择
    </button>

    <div ref="deleteMenuRef" class="menu-wrap">
      <button
        ref="deleteTriggerRef"
        class="menu-trigger"
        :class="{ 'is-active': currentMode === EditorMode.Delete, 'is-open': isDeleteMenuOpen }"
        @click="toggleDeleteMenu"
        :disabled="isArLocked"
      >
        <span>删除</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <button
      :class="{ 'is-active': currentMode === EditorMode.CreatePoint }"
      @click="setMode(EditorMode.CreatePoint)"
      :disabled="isArLocked"
    >
      点
    </button>

    <button
      :class="{ 'is-active': currentMode === EditorMode.CreateLine }"
      @click="setMode(EditorMode.CreateLine)"
      :disabled="isArLocked"
    >
      线
    </button>

    <div class="divider"></div>

    <button
      :class="{ active: isSnappingEnabled }"
      @click="emit('toggle-snapping')"
      :disabled="isArLocked"
    >
      吸附: {{ isSnappingEnabled ? '开启' : '关闭' }}
    </button>

    <div class="divider"></div>

    <div class="collab-box">
      <input
        v-model="roomName"
        :disabled="isCollabOpen || isCollabConnecting"
        placeholder="输入房间名"
        class="room-input"
      />
      <button
        @click="toggleCollab"
        :class="{ active: isCollabOpen }"
        :disabled="isCollabConnecting"
      >
        {{ isCollabOpen ? '退出协作' : isCollabConnecting ? '连接中...' : '开启协作' }}
      </button>
      <span v-if="isCollabOpen" class="peer-count">👥 {{ peerCount }}</span>
    </div>

    <div class="divider"></div>

    <button @click="toggleAR" :class="{ active: isAROpen }">
      {{ isAROpen ? '退出 AR' : '开启 AR' }}
    </button>

    <div class="toolbar-spacer"></div>

    <button class="history-button" @click="emit('undo')" :disabled="!canUndo">撤销</button>
    <button class="history-button" @click="emit('redo')" :disabled="!canRedo">重做</button>
  </div>

  <Teleport to="body">
    <div
      v-if="isDeleteMenuOpen"
      ref="deletePanelRef"
      class="menu-panel"
      :style="deleteMenuStyle"
    >
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.Delete }"
        @click="selectDeleteMode"
      >
        删除
      </button>
      <button class="menu-item menu-item-danger" @click="requestClearAll">清空</button>
    </div>
  </Teleport>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 8px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
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

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

button.active {
  background: #2c5a34;
  color: #43f260;
}

button:active:not(:disabled) {
  background: #43f260;
  color: #000;
}

button.is-active {
  background: #43f260;
  color: #000;
  font-weight: bold;
  border-color: #ffffff;
}

.menu-wrap {
  position: relative;
}

.menu-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.menu-trigger.is-open:not(.is-active) {
  background: #444;
}

.menu-caret {
  font-size: 12px;
  line-height: 1;
}

.menu-panel {
  position: fixed;
  z-index: 1000;
  min-width: 108px;
  padding: 6px;
  background: #1f1f1f;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.menu-item {
  width: 100%;
  text-align: left;
  border-radius: 4px;
}

.menu-item-active {
  background: #2c5a34;
  color: #43f260;
}

.menu-item-danger:hover {
  background: #5a2c2c;
  color: #ffb3b3;
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

.toolbar-spacer {
  flex: 1;
}

.history-button {
  min-width: 64px;
}

.toolbar::-webkit-scrollbar {
  height: 4px;
}

.toolbar::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 999px;
}

@media (max-width: 1024px) and (orientation: landscape) {
  .toolbar {
    gap: 6px;
    padding: 6px;
  }

  button {
    padding: 5px 9px;
    font-size: 12px;
    white-space: nowrap;
  }

  .room-input {
    width: 84px;
  }
}
</style>
