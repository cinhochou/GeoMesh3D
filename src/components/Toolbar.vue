<!-- src/components/ToolBar.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { EditorMode } from '../core/editor/Editor'
import { useUiStore } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'
import { useCollabStore } from '@/store/collabStore'

defineOptions({
  name: 'EditorToolbar',
})

const props = defineProps<{
  isCoordinateSystemVisible: boolean
  isArMode: boolean
}>()

const emit = defineEmits<{
  (e: 'mode-change', mode: EditorMode): void
  (e: 'toggle-snapping'): void
  (e: 'toggle-coordinate-system', isOpen: boolean): void
  (e: 'toggle-ar', isOpen: boolean): void
  (e: 'toggle-collab', data: { open: boolean; room: string }): void
  (e: 'clear-all'): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const uiStore = useUiStore()
const sceneStore = useSceneStore()
const collabStore = useCollabStore()
const { isARMode, toolbarMenus } = storeToRefs(uiStore)
const { currentMode, isSnappingEnabled, canUndo, canRedo } = storeToRefs(sceneStore)
const { roomName, peerCount, isConnected, isConnecting } = storeToRefs(collabStore)
const isArLocked = computed(() => props.isArMode)
const isCoordinateSystemOff = computed(() => !props.isCoordinateSystemVisible)
const isEditingLocked = computed(() => isArLocked.value || isCoordinateSystemOff.value)
const isCollabOpen = computed(() => isConnected.value)
const isCollabConnecting = computed(() => isConnecting.value)
const isAROpen = computed(() => isARMode.value)
const isDeleteMenuOpen = computed(() => toolbarMenus.value.deleteOpen)
const isPointMenuOpen = computed(() => toolbarMenus.value.pointOpen)
const isLineMenuOpen = computed(() => toolbarMenus.value.lineOpen)
const deleteMenuRef = ref<HTMLElement | null>(null)
const deleteTriggerRef = ref<HTMLElement | null>(null)
const deletePanelRef = ref<HTMLElement | null>(null)
const pointMenuRef = ref<HTMLElement | null>(null)
const pointTriggerRef = ref<HTMLElement | null>(null)
const pointPanelRef = ref<HTMLElement | null>(null)
const lineMenuRef = ref<HTMLElement | null>(null)
const lineTriggerRef = ref<HTMLElement | null>(null)
const linePanelRef = ref<HTMLElement | null>(null)
const deleteMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '108px',
})
const pointMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '132px',
})
const lineMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '132px',
})

watch(
  () => props.isArMode,
  (val) => {
    uiStore.setARMode(val)
    if (val) uiStore.closeAllToolbarMenus()
  },
  { immediate: true },
)

const setMode = (mode: EditorMode) => {
  if (isEditingLocked.value && mode !== EditorMode.Select) return
  uiStore.closeAllToolbarMenus()
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
  uiStore.closeAllToolbarMenus()
  uiStore.setARMode(!isAROpen.value)
  emit('toggle-ar', isARMode.value)
}

const toggleDeleteMenu = () => {
  if (isEditingLocked.value) return
  uiStore.toggleToolbarMenu('deleteOpen')
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

const togglePointMenu = () => {
  if (isEditingLocked.value) return
  uiStore.toggleToolbarMenu('pointOpen')
}

const updatePointMenuPosition = () => {
  const trigger = pointTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  pointMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 132)}px`,
  }
}

const toggleLineMenu = () => {
  if (isEditingLocked.value) return
  uiStore.toggleToolbarMenu('lineOpen')
}

const updateLineMenuPosition = () => {
  const trigger = lineTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  lineMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 132)}px`,
  }
}

const selectDeleteMode = () => {
  setMode(EditorMode.Delete)
}

const requestClearAll = () => {
  if (isEditingLocked.value) return
  uiStore.setToolbarMenuOpen('deleteOpen', false, { exclusive: false })
  emit('clear-all')
}

const toggleCoordinateSystem = () => {
  emit('toggle-coordinate-system', !props.isCoordinateSystemVisible)
}

const selectCreateFreePointMode = () => {
  setMode(EditorMode.CreatePoint)
}

const selectMergePointMode = () => {
  setMode(EditorMode.MergePoint)
}

const selectCreateLineMode = () => {
  setMode(EditorMode.CreateLine)
}

const selectCreateStraightLineMode = () => {
  setMode(EditorMode.CreateStraightLine)
}

const selectCreateRayMode = () => {
  setMode(EditorMode.CreateRay)
}

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Node)) return
  if (
    isPointMenuOpen.value &&
    !pointMenuRef.value?.contains(target) &&
    !pointPanelRef.value?.contains(target)
  ) {
    uiStore.setToolbarMenuOpen('pointOpen', false, { exclusive: false })
  }
  if (
    isDeleteMenuOpen.value &&
    !deleteMenuRef.value?.contains(target) &&
    !deletePanelRef.value?.contains(target)
  ) {
    uiStore.setToolbarMenuOpen('deleteOpen', false, { exclusive: false })
  }
  if (
    isLineMenuOpen.value &&
    !lineMenuRef.value?.contains(target) &&
    !linePanelRef.value?.contains(target)
  ) {
    uiStore.setToolbarMenuOpen('lineOpen', false, { exclusive: false })
  }
}

watch(isPointMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updatePointMenuPosition()
})

watch(isDeleteMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateDeleteMenuPosition()
})

watch(isLineMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateLineMenuPosition()
})

watch(
  () => props.isCoordinateSystemVisible,
  (visible) => {
    if (visible) return
    uiStore.closeAllToolbarMenus()
  },
)

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
  window.addEventListener('resize', updateDeleteMenuPosition)
  window.addEventListener('resize', updatePointMenuPosition)
  window.addEventListener('resize', updateLineMenuPosition)
  document.addEventListener('scroll', updateDeleteMenuPosition, true)
  document.addEventListener('scroll', updatePointMenuPosition, true)
  document.addEventListener('scroll', updateLineMenuPosition, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('resize', updateDeleteMenuPosition)
  window.removeEventListener('resize', updatePointMenuPosition)
  window.removeEventListener('resize', updateLineMenuPosition)
  document.removeEventListener('scroll', updateDeleteMenuPosition, true)
  document.removeEventListener('scroll', updatePointMenuPosition, true)
  document.removeEventListener('scroll', updateLineMenuPosition, true)
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
        :disabled="isEditingLocked"
      >
        <span>删除</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <div ref="pointMenuRef" class="menu-wrap">
      <button
        ref="pointTriggerRef"
        class="menu-trigger"
        :class="{
          'is-active':
            currentMode === EditorMode.CreatePoint || currentMode === EditorMode.MergePoint,
          'is-open': isPointMenuOpen,
        }"
        @click="togglePointMenu"
        :disabled="isEditingLocked"
      >
        <span>点</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <div ref="lineMenuRef" class="menu-wrap">
      <button
        ref="lineTriggerRef"
        class="menu-trigger"
        :class="{
          'is-active':
            currentMode === EditorMode.CreateLine ||
            currentMode === EditorMode.CreateStraightLine ||
            currentMode === EditorMode.CreateRay,
          'is-open': isLineMenuOpen,
        }"
        @click="toggleLineMenu"
        :disabled="isEditingLocked"
      >
        <span>线</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <button
      :class="{ 'is-active': currentMode === EditorMode.CreatePlane }"
      @click="setMode(EditorMode.CreatePlane)"
      :disabled="isEditingLocked"
    >
      面
    </button>

    <div class="divider"></div>

    <button
      :class="{ active: isSnappingEnabled }"
      @click="emit('toggle-snapping')"
      :disabled="isEditingLocked"
    >
      吸附: {{ isSnappingEnabled ? '开启' : '关闭' }}
    </button>

    <button :class="{ active: isCoordinateSystemVisible }" @click="toggleCoordinateSystem">
      {{ isCoordinateSystemVisible ? '坐标系开' : '坐标系关' }}
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

    <button class="history-button" @click="emit('undo')" :disabled="isEditingLocked || !canUndo">
      撤销
    </button>
    <button class="history-button" @click="emit('redo')" :disabled="isEditingLocked || !canRedo">
      重做
    </button>
  </div>

  <Teleport to="body">
    <div v-if="isDeleteMenuOpen" ref="deletePanelRef" class="menu-panel" :style="deleteMenuStyle">
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

  <Teleport to="body">
    <div v-if="isPointMenuOpen" ref="pointPanelRef" class="menu-panel" :style="pointMenuStyle">
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreatePoint }"
        @click="selectCreateFreePointMode"
      >
        自由点
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.MergePoint }"
        @click="selectMergePointMode"
      >
        合并点
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="isLineMenuOpen" ref="linePanelRef" class="menu-panel" :style="lineMenuStyle">
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateLine }"
        @click="selectCreateLineMode"
      >
        线段
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateStraightLine }"
        @click="selectCreateStraightLineMode"
      >
        直线
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateRay }"
        @click="selectCreateRayMode"
      >
        射线
      </button>
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
