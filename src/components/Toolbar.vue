<!-- src/components/ToolBar.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { EditorMode } from '../core/editor/Editor'
import { useUiStore } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'
import { useCollabStore } from '@/store/collabStore'
import { useAuthStore } from '@/store/authStore'

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
  (e: 'toggle-global-point-value', isOpen: boolean): void
  (e: 'toggle-ar', isOpen: boolean): void
  (e: 'toggle-collab', data: { open: boolean; room: string }): void
  (e: 'clear-all'): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const uiStore = useUiStore()
const sceneStore = useSceneStore()
const collabStore = useCollabStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { isARMode, toolbarMenus } = storeToRefs(uiStore)
const { currentMode, isSnappingEnabled, canUndo, canRedo } = storeToRefs(sceneStore)
const { roomName, peerCount, isConnected, isConnecting } = storeToRefs(collabStore)
const { isAuthenticated, user, isLoading: isAuthLoading } = storeToRefs(authStore)
const isArLocked = computed(() => props.isArMode)
const isCoordinateSystemOff = computed(() => !props.isCoordinateSystemVisible)
const isEditingLocked = computed(() => isArLocked.value || isCoordinateSystemOff.value)
const isCollabOpen = computed(() => isConnected.value)
const isCollabConnecting = computed(() => isConnecting.value)
const isAROpen = computed(() => isARMode.value)
const isGlobalPointValueOpen = computed(() => uiStore.isGlobalPointValueMode)
const isDeleteMenuOpen = computed(() => toolbarMenus.value.deleteOpen)
const isPointMenuOpen = computed(() => toolbarMenus.value.pointOpen)
const isLineMenuOpen = computed(() => toolbarMenus.value.lineOpen)
const isCircleMenuOpen = computed(() => toolbarMenus.value.circleOpen)
const isSolidMenuOpen = computed(() => toolbarMenus.value.solidOpen)
const isPolygonMenuOpen = computed(() => toolbarMenus.value.polygonOpen)
const deleteMenuRef = ref<HTMLElement | null>(null)
const deleteTriggerRef = ref<HTMLElement | null>(null)
const deletePanelRef = ref<HTMLElement | null>(null)
const pointMenuRef = ref<HTMLElement | null>(null)
const pointTriggerRef = ref<HTMLElement | null>(null)
const pointPanelRef = ref<HTMLElement | null>(null)
const lineMenuRef = ref<HTMLElement | null>(null)
const lineTriggerRef = ref<HTMLElement | null>(null)
const linePanelRef = ref<HTMLElement | null>(null)
const circleMenuRef = ref<HTMLElement | null>(null)
const circleTriggerRef = ref<HTMLElement | null>(null)
const circlePanelRef = ref<HTMLElement | null>(null)
const solidMenuRef = ref<HTMLElement | null>(null)
const solidTriggerRef = ref<HTMLElement | null>(null)
const solidPanelRef = ref<HTMLElement | null>(null)
const polygonMenuRef = ref<HTMLElement | null>(null)
const polygonTriggerRef = ref<HTMLElement | null>(null)
const polygonPanelRef = ref<HTMLElement | null>(null)
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
const circleMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '132px',
})
const solidMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '132px',
})
const polygonMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '132px',
})
const profileMenuOpen = ref(false)
const profileTriggerRef = ref<HTMLElement | null>(null)
const profilePanelRef = ref<HTMLElement | null>(null)
const profileMenuStyle = ref({
  top: '0px',
  left: '0px',
  minWidth: '248px',
})
const displayName = computed(() => user.value?.nickname || user.value?.username || '未登录')
const displayEmail = computed(() => user.value?.email || '请先登录后查看账号信息')
const userRoleText = computed(() => user.value?.role || 'GUEST')
const avatarUrl = computed(() => user.value?.avatarUrl || '')
const defaultAvatarText = computed(() => {
  const source = displayName.value.trim()
  return source ? source.slice(0, 1).toUpperCase() : 'U'
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

const toggleCircleMenu = () => {
  if (isEditingLocked.value) return
  uiStore.toggleToolbarMenu('circleOpen')
}

const updateCircleMenuPosition = () => {
  const trigger = circleTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  circleMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 132)}px`,
  }
}

const toggleSolidMenu = () => {
  if (isEditingLocked.value) return
  uiStore.toggleToolbarMenu('solidOpen')
}

const updateSolidMenuPosition = () => {
  const trigger = solidTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  solidMenuStyle.value = {
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 132)}px`,
  }
}

const togglePolygonMenu = () => {
  if (isEditingLocked.value) return
  uiStore.toggleToolbarMenu('polygonOpen')
}

const updatePolygonMenuPosition = () => {
  const trigger = polygonTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  polygonMenuStyle.value = {
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

const toggleGlobalPointValue = () => {
  emit('toggle-global-point-value', !isGlobalPointValueOpen.value)
}

const selectCreateFreePointMode = () => {
  setMode(EditorMode.CreatePoint)
}

const selectMergePointMode = () => {
  setMode(EditorMode.MergePoint)
}

const selectIntersectionPointMode = () => {
  setMode(EditorMode.IntersectionPoint)
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

const selectCreateVectorMode = () => {
  setMode(EditorMode.CreateVector)
}

const selectCreateThreePointCircleMode = () => {
  setMode(EditorMode.CreateCircleThreePoints)
}

const selectCreateNormalCircleMode = () => {
  setMode(EditorMode.CreateCircleNormal)
}

const selectCreatePolygonMode = () => {
  uiStore.setToolbarMenuOpen('polygonOpen', false, { exclusive: false })
  setMode(EditorMode.CreatePlane)
}

const selectCreateRegularPolygonMode = () => {
  uiStore.setToolbarMenuOpen('polygonOpen', false, { exclusive: false })
  setMode(EditorMode.CreateRegularPolygon)
}

const createHexahedron = () => {
  uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  emit('mode-change', EditorMode.CreateHexahedron)
}

const createTetrahedron = () => {
  uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  emit('mode-change', EditorMode.CreateTetrahedron)
}

const createSphereTwoPoints = () => {
  uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  emit('mode-change', EditorMode.CreateSphereTwoPoints)
}

const createSphereRadius = () => {
  uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  emit('mode-change', EditorMode.CreateSphereRadius)
}

const toggleProfileMenu = () => {
  profileMenuOpen.value = !profileMenuOpen.value
}

const updateProfileMenuPosition = () => {
  const trigger = profileTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  profileMenuStyle.value = {
    top: `${rect.bottom + 8}px`,
    left: `${Math.max(8, rect.right - 248)}px`,
    minWidth: '248px',
  }
}

const goLogin = async () => {
  profileMenuOpen.value = false
  await router.push({
    name: 'login',
    query: { redirect: route.fullPath || '/' },
  })
}

const goPlaceholderPage = (path: string) => {
  profileMenuOpen.value = false
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { msg: `${path} 页面建设中`, scope: 'global' },
    }),
  )
}

const handleLogout = async () => {
  profileMenuOpen.value = false
  await authStore.logout()
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { msg: '已退出登录', scope: 'global' },
    }),
  )
  await router.push({ name: 'editor' })
}

const handleSwitchUser = async () => {
  profileMenuOpen.value = false
  authStore.beginSwitchUser()
  await router.push({
    name: 'login',
    query: { switchUser: '1', redirect: route.fullPath || '/' },
  })
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
  if (
    isCircleMenuOpen.value &&
    !circleMenuRef.value?.contains(target) &&
    !circlePanelRef.value?.contains(target)
  ) {
    uiStore.setToolbarMenuOpen('circleOpen', false, { exclusive: false })
  }
  if (
    isSolidMenuOpen.value &&
    !solidMenuRef.value?.contains(target) &&
    !solidPanelRef.value?.contains(target)
  ) {
    uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  }
  if (
    isPolygonMenuOpen.value &&
    !polygonMenuRef.value?.contains(target) &&
    !polygonPanelRef.value?.contains(target)
  ) {
    uiStore.setToolbarMenuOpen('polygonOpen', false, { exclusive: false })
  }
  if (
    profileMenuOpen.value &&
    !profileTriggerRef.value?.contains(target) &&
    !profilePanelRef.value?.contains(target)
  ) {
    profileMenuOpen.value = false
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

watch(isCircleMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateCircleMenuPosition()
})

watch(isSolidMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateSolidMenuPosition()
})

watch(isPolygonMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updatePolygonMenuPosition()
})

watch(profileMenuOpen, async (isOpen) => {
  if (!isOpen) return
  await nextTick()
  updateProfileMenuPosition()
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
  window.addEventListener('resize', updateCircleMenuPosition)
  window.addEventListener('resize', updatePolygonMenuPosition)
  window.addEventListener('resize', updateSolidMenuPosition)
  window.addEventListener('resize', updateProfileMenuPosition)
  document.addEventListener('scroll', updateDeleteMenuPosition, true)
  document.addEventListener('scroll', updatePointMenuPosition, true)
  document.addEventListener('scroll', updateLineMenuPosition, true)
  document.addEventListener('scroll', updateCircleMenuPosition, true)
  document.addEventListener('scroll', updatePolygonMenuPosition, true)
  document.addEventListener('scroll', updateSolidMenuPosition, true)
  document.addEventListener('scroll', updateProfileMenuPosition, true)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  window.removeEventListener('resize', updateDeleteMenuPosition)
  window.removeEventListener('resize', updatePointMenuPosition)
  window.removeEventListener('resize', updateLineMenuPosition)
  window.removeEventListener('resize', updateCircleMenuPosition)
  window.removeEventListener('resize', updatePolygonMenuPosition)
  window.removeEventListener('resize', updateSolidMenuPosition)
  window.removeEventListener('resize', updateProfileMenuPosition)
  document.removeEventListener('scroll', updateDeleteMenuPosition, true)
  document.removeEventListener('scroll', updatePointMenuPosition, true)
  document.removeEventListener('scroll', updateLineMenuPosition, true)
  document.removeEventListener('scroll', updateCircleMenuPosition, true)
  document.removeEventListener('scroll', updatePolygonMenuPosition, true)
  document.removeEventListener('scroll', updateSolidMenuPosition, true)
  document.removeEventListener('scroll', updateProfileMenuPosition, true)
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
            currentMode === EditorMode.CreatePoint ||
            currentMode === EditorMode.MergePoint ||
            currentMode === EditorMode.IntersectionPoint,
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
            currentMode === EditorMode.CreateRay ||
            currentMode === EditorMode.CreateVector,
          'is-open': isLineMenuOpen,
        }"
        @click="toggleLineMenu"
        :disabled="isEditingLocked"
      >
        <span>线</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <div ref="circleMenuRef" class="menu-wrap">
      <button
        ref="circleTriggerRef"
        class="menu-trigger"
        :class="{
          'is-active':
            currentMode === EditorMode.CreateCircleThreePoints ||
            currentMode === EditorMode.CreateCircleNormal,
          'is-open': isCircleMenuOpen,
        }"
        @click="toggleCircleMenu"
        :disabled="isEditingLocked"
      >
        <span>圆</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <div ref="polygonMenuRef" class="menu-wrap">
      <button
        ref="polygonTriggerRef"
        class="menu-trigger"
        :class="{
          'is-active': currentMode === EditorMode.CreatePlane || currentMode === EditorMode.CreateRegularPolygon,
          'is-open': isPolygonMenuOpen,
        }"
        @click="togglePolygonMenu"
        :disabled="isEditingLocked"
      >
        <span>面</span>
        <span class="menu-caret">▾</span>
      </button>
    </div>

    <div ref="solidMenuRef" class="menu-wrap">
      <button
        ref="solidTriggerRef"
        class="menu-trigger"
        :class="{
          'is-active':
            currentMode === EditorMode.CreateHexahedron ||
            currentMode === EditorMode.CreateTetrahedron ||
            currentMode === EditorMode.CreateSphereTwoPoints ||
            currentMode === EditorMode.CreateSphereRadius,
          'is-open': isSolidMenuOpen,
        }"
        @click="toggleSolidMenu"
        :disabled="isEditingLocked"
      >
        <span>立体图▾</span>
      </button>
    </div>

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

    <button
      :class="{ active: isGlobalPointValueOpen }"
      @click="toggleGlobalPointValue"
      :disabled="isEditingLocked"
    >
      {{ isGlobalPointValueOpen ? '全局数值开' : '全局数值关' }}
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

    <div class="divider history-divider"></div>
    <button class="history-button" @click="emit('undo')" :disabled="isEditingLocked || !canUndo">
      撤销
    </button>
    <button class="history-button" @click="emit('redo')" :disabled="isEditingLocked || !canRedo">
      重做
    </button>

    <div class="toolbar-spacer"></div>

    <div
      ref="profileTriggerRef"
      class="profile-trigger"
      :class="{ 'is-open': profileMenuOpen }"
      @click="toggleProfileMenu"
    >
      <div class="avatar-ring">
        <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" class="avatar-image" />
        <div v-else class="avatar-fallback">{{ defaultAvatarText }}</div>
      </div>
      <span class="profile-name">{{ displayName }}</span>
    </div>
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
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.IntersectionPoint }"
        @click="selectIntersectionPointMode"
      >
        交点
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
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateVector }"
        @click="selectCreateVectorMode"
      >
        向量
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="isCircleMenuOpen" ref="circlePanelRef" class="menu-panel" :style="circleMenuStyle">
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateCircleThreePoints }"
        @click="selectCreateThreePointCircleMode"
      >
        三点圆
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateCircleNormal }"
        @click="selectCreateNormalCircleMode"
      >
        法向圆
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="isPolygonMenuOpen" ref="polygonPanelRef" class="menu-panel" :style="polygonMenuStyle">
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreatePlane }"
        @click="selectCreatePolygonMode"
      >
        多边形
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateRegularPolygon }"
        @click="selectCreateRegularPolygonMode"
      >
        正多边形
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="isSolidMenuOpen" ref="solidPanelRef" class="menu-panel" :style="solidMenuStyle">
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateTetrahedron }"
        @click="createTetrahedron"
      >
        正四面体
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateHexahedron }"
        @click="createHexahedron"
      >
        正六面体
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateSphereTwoPoints }"
        @click="createSphereTwoPoints"
      >
        两点球
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateSphereRadius }"
        @click="createSphereRadius"
      >
        半径球
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="profileMenuOpen"
      ref="profilePanelRef"
      class="profile-panel"
      :style="profileMenuStyle"
    >
      <template v-if="!isAuthenticated">
        <div class="profile-panel-title">未登录</div>
        <div class="profile-panel-subtitle">登录以体验完整功能</div>
        <button class="profile-link-button profile-link-strong" @click="goLogin">去登录</button>
      </template>
      <template v-else>
        <div class="profile-summary">
          <div class="avatar-ring profile-panel-avatar">
            <img v-if="avatarUrl" :src="avatarUrl" alt="avatar" class="avatar-image" />
            <div v-else class="avatar-fallback">{{ defaultAvatarText }}</div>
          </div>
          <div class="profile-summary-text">
            <div class="profile-summary-name">{{ displayName }}</div>
            <div class="profile-summary-email">{{ displayEmail }}</div>
            <div class="profile-summary-role">{{ userRoleText }}</div>
          </div>
        </div>

        <div class="profile-links">
          <button class="profile-link-button" @click="goPlaceholderPage('Profile')">
            个人中心
          </button>
          <button class="profile-link-button" @click="goPlaceholderPage('项目列表')">
            项目列表
          </button>
        </div>

        <div class="profile-actions">
          <button class="profile-action-button" @click="handleSwitchUser" :disabled="isAuthLoading">
            切换用户
          </button>
          <button
            class="profile-action-button profile-action-danger"
            @click="handleLogout"
            :disabled="isAuthLoading"
          >
            退出登录
          </button>
        </div>
      </template>
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

.collab-box {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
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

.history-divider {
  margin-left: 4px;
  margin-right: 2px;
}

.profile-trigger {
  height: 36px;
  border: 1px solid #3f3f3f;
  border-radius: 999px;
  background: linear-gradient(180deg, #2a2a2a 0%, #242424 100%);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px 4px 4px;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.profile-trigger:hover,
.profile-trigger.is-open {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
}

.profile-name {
  max-width: 120px;
  color: #ececec;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.avatar-ring {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #4d4d4d;
  background: #1c1c1c;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  color: #9cf0ad;
  font-size: 12px;
  font-weight: 700;
}

.profile-panel {
  position: fixed;
  z-index: 1200;
  padding: 14px;
  border: 1px solid #3d3d3d;
  border-radius: 12px;
  background: linear-gradient(180deg, #1f1f1f 0%, #191919 100%);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.profile-panel-title {
  color: #f3f3f3;
  font-size: 16px;
  font-weight: 700;
}

.profile-panel-subtitle {
  color: #a0a0a0;
  font-size: 13px;
  line-height: 1.5;
}

.profile-summary {
  display: flex;
  align-items: center;
  gap: 10px;
}

.profile-panel-avatar {
  width: 40px;
  height: 40px;
}

.profile-summary-name {
  color: #f5f5f5;
  font-size: 14px;
  font-weight: 700;
}

.profile-summary-email {
  color: #a6a6a6;
  font-size: 12px;
}

.profile-summary-role {
  margin-top: 2px;
  color: #78f090;
  font-size: 11px;
  font-weight: 700;
}

.profile-links,
.profile-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-link-button,
.profile-action-button {
  width: 100%;
  text-align: left;
  border: 1px solid #3d3d3d;
  border-radius: 8px;
  background: #252525;
  color: #ececec;
  padding: 8px 10px;
  font-size: 13px;
}

.profile-link-button:hover,
.profile-action-button:hover {
  background: #2d2d2d;
}

.profile-link-strong {
  border-color: rgba(67, 242, 96, 0.45);
  color: #8df2a0;
}

.profile-action-danger {
  border-color: rgba(255, 95, 95, 0.4);
  color: #ffb0b0;
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

@media (max-width: 768px) {
  .toolbar {
    gap: 4px;
    padding: 5px;
  }

  button {
    padding: 4px 7px;
    font-size: 11px;
    white-space: nowrap;
  }

  .room-input {
    width: 70px;
    padding: 3px 5px;
    font-size: 11px;
  }

  .collab-box {
    gap: 2px;
  }

  .divider {
    margin: 0 2px;
  }

  .profile-trigger {
    height: 32px;
    padding: 3px 8px 3px 3px;
    gap: 6px;
  }

  .avatar-ring {
    width: 24px;
    height: 24px;
  }

  .profile-name {
    max-width: 70px;
    font-size: 11px;
  }
}
</style>
