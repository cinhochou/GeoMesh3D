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
import { getApiConfig } from '@/config/api'

defineOptions({
  name: 'EditorToolbar',
})

const props = defineProps<{
  isCoordinateSystemVisible: boolean
  isArMode: boolean
  hasActiveProject?: boolean
}>()

const emit = defineEmits<{
  (e: 'mode-change', mode: EditorMode): void
  (e: 'toggle-ar', isOpen: boolean): void
  (e: 'toggle-collab', data: { open: boolean; room: string }): void
  (e: 'clear-all'): void
  (e: 'undo'): void
  (e: 'redo'): void
  (e: 'export-scene'): void
  (e: 'import-scene'): void
  (e: 'save-scene'): void
  (e: 'new-project'): void
  (e: 'exit-project'): void
  (e: 'edit-project'): void
}>()

const uiStore = useUiStore()
const sceneStore = useSceneStore()
const collabStore = useCollabStore()
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const { isARMode, toolbarMenus } = storeToRefs(uiStore)
const { currentMode, canUndo, canRedo } = storeToRefs(sceneStore)
const { roomName, peerCount, isConnected, isConnecting } = storeToRefs(collabStore)
const { isAuthenticated, user, isLoading: isAuthLoading } = storeToRefs(authStore)
const isArLocked = computed(() => props.isArMode)
const isCoordinateSystemOff = computed(() => !props.isCoordinateSystemVisible)
const isEditingLocked = computed(() => isArLocked.value || isCoordinateSystemOff.value)
const isCollabOpen = computed(() => isConnected.value)
const isCollabConnecting = computed(() => isConnecting.value)
const isAROpen = computed(() => isARMode.value)
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
const sideMenuOpen = ref(false)
const sideMenuRef = ref<HTMLElement | null>(null)
const sideMenuOverlayRef = ref<HTMLElement | null>(null)
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
const displayEmail = computed(() => user.value?.username || '请先登录后查看账号信息')
const userRoleText = computed(() => user.value?.role || 'GUEST')
const avatarUrl = computed(() => {
  const url = user.value?.avatarUrl || ''
  if (!url) return ''
  if (url.startsWith('http')) return url
  return getApiConfig().baseUrl + url
})
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

const selectCreatePerpendicularLineMode = () => {
  setMode(EditorMode.CreatePerpendicularLine)
}

const selectCreateParallelLineMode = () => {
  setMode(EditorMode.CreateParallelLine)
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

const createCone = () => {
  uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  emit('mode-change', EditorMode.CreateCone)
}

const createCylinder = () => {
  uiStore.setToolbarMenuOpen('solidOpen', false, { exclusive: false })
  emit('mode-change', EditorMode.CreateCylinder)
}

const toggleSideMenu = () => {
  sideMenuOpen.value = !sideMenuOpen.value
}

const closeSideMenu = () => {
  sideMenuOpen.value = false
}

const handleExportScene = () => {
  closeSideMenu()
  emit('export-scene')
}

const handleImportScene = () => {
  closeSideMenu()
  emit('import-scene')
}

const handleSaveScene = () => {
  closeSideMenu()
  emit('save-scene')
}

const handleNewProject = () => {
  closeSideMenu()
  emit('new-project')
}

const handleExitProject = () => {
  closeSideMenu()
  emit('exit-project')
}

const handleEditProject = () => {
  closeSideMenu()
  emit('edit-project')
}

const handleOpenManual = () => {
  closeSideMenu()
  window.open(
    'https://ycng2pgx3oo5.feishu.cn/wiki/YA7Nwlhi3iUNYSk9DMgcnblbnTh?from=from_copylink',
    '_blank',
  )
}

/**
 * 打开设置面板
 * 先关闭侧边菜单，再调用 store 打开设置面板
 */
const handleOpenSettings = () => {
  closeSideMenu()
  uiStore.openSettingsPanel()
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

const goProfilePage = () => {
  profileMenuOpen.value = false
  const resolved = router.resolve({ name: 'profile' })
  window.open(resolved.href, '_blank')
}

const goProjectListPage = () => {
  profileMenuOpen.value = false
  const resolved = router.resolve({ name: 'projects' })
  window.open(resolved.href, '_blank')
}

const handleLogout = async () => {
  profileMenuOpen.value = false
  // 二次确认：避免误触（项目未保存等场景下用户可能不希望立即退出）
  const confirmed = window.confirm('确定要退出登录吗？')
  if (!confirmed) return
  // 退出登录前：若编辑器有打开的项目，有变化则保存并关闭
  // 通过 done 回调等待编辑器完成保存/关闭（监听器始终在 Toolbar 挂载期间存在）
  // O4：done 现在回传 { saved } 表示本次是否实际执行了服务端保存，便于未来做统计/提示
  await new Promise<void>((resolve) => {
    const event = new CustomEvent('editor:save-and-close', {
      detail: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        done: (_result: { saved: boolean }) => resolve(),
      },
    })
    window.dispatchEvent(event)
    // 兜底超时：若监听器异常未调用 done，1s 后强制继续
    window.setTimeout(resolve, 1000)
  })
  await authStore.logout()
  uiStore.openToast('已退出登录', 'global')
  setTimeout(() => uiStore.closeToast(), 1500)
  // 路由跳转由各视图的 useSessionGuard onInvalidated 回调统一处理：
  // - 编辑器（有项目）→ 跳 /login
  // - 编辑器（临时）→ 留在当前页
  // - ProfileView / ProjectListView → 跳 /login
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
  if (
    sideMenuOpen.value &&
    !sideMenuRef.value?.contains(target) &&
    !sideMenuOverlayRef.value?.contains(target)
  ) {
    sideMenuOpen.value = false
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
    <div class="toolbar-fixed-left">
      <button
        class="hamburger-btn"
        :class="{ 'is-open': sideMenuOpen }"
        @click="toggleSideMenu"
        title="菜单"
      >
        <span class="hamburger-icon">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </span>
      </button>

      <img src="@/assets/GeoMesh3D_logo_white_1240x300.png" alt="Logo" class="toolbar-logo" />

      <div class="divider"></div>
    </div>

    <div class="toolbar-scrollable">
      <div class="toolbar-scrollable-inner">
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
          <span class="menu-caret">▸</span>
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
          <span class="menu-caret">▸</span>
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
              currentMode === EditorMode.CreateVector ||
              currentMode === EditorMode.CreatePerpendicularLine ||
              currentMode === EditorMode.CreateParallelLine,
            'is-open': isLineMenuOpen,
          }"
          @click="toggleLineMenu"
          :disabled="isEditingLocked"
        >
          <span>线</span>
          <span class="menu-caret">▸</span>
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
          <span class="menu-caret">▸</span>
        </button>
      </div>

      <div ref="polygonMenuRef" class="menu-wrap">
        <button
          ref="polygonTriggerRef"
          class="menu-trigger"
          :class="{
            'is-active':
              currentMode === EditorMode.CreatePlane ||
              currentMode === EditorMode.CreateRegularPolygon,
            'is-open': isPolygonMenuOpen,
          }"
          @click="togglePolygonMenu"
          :disabled="isEditingLocked"
        >
          <span>面</span>
          <span class="menu-caret">▸</span>
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
              currentMode === EditorMode.CreateSphereRadius ||
              currentMode === EditorMode.CreateCone ||
              currentMode === EditorMode.CreateCylinder,
            'is-open': isSolidMenuOpen,
          }"
          @click="toggleSolidMenu"
          :disabled="isEditingLocked"
        >
          <span>立体</span>
          <span class="menu-caret">▸</span>
        </button>
      </div>

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
      </div>
    </div>

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
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path
            d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
          />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
        <span>删除</span>
      </button>
      <button class="menu-item menu-item-danger" @click="requestClearAll">
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="8" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </svg>
        <span>清空</span>
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div v-if="isPointMenuOpen" ref="pointPanelRef" class="menu-panel" :style="pointMenuStyle">
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreatePoint }"
        @click="selectCreateFreePointMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="9" cy="16" r="3.5" fill="currentColor" />
          <text
            x="12"
            y="9"
            font-size="13"
            fill="currentColor"
            stroke="currentColor"
            stroke-width="0.1"
            font-weight="bold"
          >
            A
          </text>
        </svg>
        <span>自由点</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.MergePoint }"
        @click="selectMergePointMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="5" cy="6" r="2" fill="currentColor" />
          <circle cx="5" cy="18" r="2" fill="currentColor" />
          <path d="M7 6 C12 6 12 12 17 12" />
          <path d="M7 18 C12 18 12 12 17 12" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
        <span>合并点</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.IntersectionPoint }"
        @click="selectIntersectionPointMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="4" y1="4" x2="20" y2="20" />
          <line x1="20" y1="4" x2="4" y2="20" />
          <circle cx="12" cy="12" r="2.5" fill="currentColor" />
        </svg>
        <span>交点</span>
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
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="5" y1="19" x2="19" y2="5" />
          <circle cx="5" cy="19" r="2" fill="currentColor" />
          <circle cx="19" cy="5" r="2" fill="currentColor" />
        </svg>
        <span>线段</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateStraightLine }"
        @click="selectCreateStraightLineMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="21" x2="21" y2="3" />
          <circle cx="7" cy="17" r="2" fill="currentColor" />
          <circle cx="17" cy="7" r="2" fill="currentColor" />
        </svg>
        <span>直线</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateRay }"
        @click="selectCreateRayMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="4" y1="20" x2="20" y2="4" />
          <circle cx="4" cy="20" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <polyline points="16 4 20 4 20 8" />
        </svg>
        <span>射线</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateVector }"
        @click="selectCreateVectorMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="5.5" y1="18.5" x2="18" y2="6" />
          <polyline points="13,6 18,6 18,11" />
          <circle cx="4" cy="20" r="2" fill="currentColor" />
          <circle cx="20" cy="4" r="2" fill="currentColor" />
        </svg>
        <span>向量</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreatePerpendicularLine }"
        @click="selectCreatePerpendicularLineMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="16" x2="21" y2="16" />
          <line x1="12" y1="2" x2="12" y2="22" />
          <circle cx="12" cy="8" r="1.8" fill="currentColor" />
        </svg>
        <span>垂线</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateParallelLine }"
        @click="selectCreateParallelLineMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="19" x2="21" y2="11" />
          <line x1="3" y1="13" x2="21" y2="5" />
          <circle cx="12" cy="15" r="2.5" fill="currentColor" />
        </svg>
        <span>平行线</span>
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
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <circle cx="4.2" cy="16.5" r="2" fill="currentColor" stroke-width="2" />
          <circle cx="19.8" cy="16.5" r="2" fill="currentColor" stroke-width="2" />
          <circle cx="12" cy="3" r="2" fill="currentColor" stroke-width="2" />
        </svg>
        <span>三点圆</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateCircleNormal }"
        @click="selectCreateNormalCircleMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <ellipse cx="12" cy="14" rx="9" ry="5" />
          <line x1="12" y1="14" x2="12" y2="3" />
          <polyline points="10 5 12 3 14 5" />
          <line x1="12" y1="14" x2="21" y2="14" />
          <circle cx="12" cy="14" r="1.5" fill="currentColor" />
        </svg>
        <span>法向圆</span>
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="isPolygonMenuOpen"
      ref="polygonPanelRef"
      class="menu-panel"
      :style="polygonMenuStyle"
    >
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreatePlane }"
        @click="selectCreatePolygonMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        >
          <polygon points="4,19 10,4 20,19" />
          <circle cx="4" cy="19" r="1.5" fill="currentColor" />
          <circle cx="10" cy="4" r="1.5" fill="currentColor" />
          <circle cx="20" cy="19" r="1.5" fill="currentColor" />
        </svg>
        <span>多边形</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateRegularPolygon }"
        @click="selectCreateRegularPolygonMode"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        >
          <polygon points="12,3 22,10.5 18.5,21.5 5.5,21.5 2,10.5" />
          <circle cx="12" cy="3" r="1.5" fill="currentColor" />
          <circle cx="22" cy="10.5" r="1.5" fill="currentColor" />
          <circle cx="18.5" cy="21.5" r="1.5" fill="currentColor" />
          <circle cx="5.5" cy="21.5" r="1.5" fill="currentColor" />
          <circle cx="2" cy="10.5" r="1.5" fill="currentColor" />
        </svg>
        <span>正多边形</span>
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
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="4" y1="15.5" x2="16.5" y2="19.5" />
          <line x1="16.5" y1="19.5" x2="19.8" y2="12.9" />
          <line x1="19.8" y1="12.9" x2="12" y2="4.5" />
          <line x1="12" y1="4.5" x2="4" y2="15.5" />
          <line x1="12" y1="4.5" x2="16.5" y2="19.5" />
          <line x1="4" y1="15.5" x2="19.8" y2="12.9" stroke-dasharray="2 2" />
          <circle cx="4" cy="15.5" r="1.5" fill="currentColor" />
          <circle cx="16.5" cy="19.5" r="1.5" fill="currentColor" />
          <circle cx="12" cy="4.5" r="1.5" fill="currentColor" />
          <circle cx="19.8" cy="12.9" r="1.5" fill="currentColor" />
        </svg>
        <span>正四面体</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateHexahedron }"
        @click="createHexahedron"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3.5" y1="6.8" x2="14" y2="9.9" />
          <line x1="14" y1="9.9" x2="20.5" y2="5.8" />
          <line x1="20.5" y1="5.8" x2="10" y2="2.8" />
          <line x1="10" y1="2.8" x2="3.5" y2="6.8" />
          <line x1="3.5" y1="6.8" x2="3.5" y2="18.2" />
          <line x1="14" y1="9.9" x2="14" y2="21.2" />
          <line x1="20.5" y1="5.8" x2="20.5" y2="17.2" />
          <line x1="3.5" y1="18.2" x2="14" y2="21.2" />
          <line x1="14" y1="21.2" x2="20.5" y2="17.2" />
          <line x1="10" y1="2.8" x2="10" y2="14.1" stroke-dasharray="2 2" />
          <line x1="3.5" y1="18.2" x2="10" y2="14.1" stroke-dasharray="2 2" />
          <line x1="10" y1="14.1" x2="20.5" y2="17.2" stroke-dasharray="2 2" />
          <circle cx="3.5" cy="6.8" r="1.3" fill="currentColor" />
          <circle cx="14" cy="9.9" r="1.3" fill="currentColor" />
          <circle cx="20.5" cy="5.8" r="1.3" fill="currentColor" />
          <circle cx="10" cy="2.8" r="1.3" fill="currentColor" />
          <circle cx="3.5" cy="18.2" r="1.3" fill="currentColor" />
          <circle cx="14" cy="21.2" r="1.3" fill="currentColor" />
          <circle cx="20.5" cy="17.2" r="1.3" fill="currentColor" />
          <circle cx="10" cy="14.1" r="1.3" fill="currentColor" />
        </svg>
        <span>正六面体</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateSphereTwoPoints }"
        @click="createSphereTwoPoints"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <circle cx="12" cy="3" r="1.5" fill="currentColor" />
        </svg>
        <span>两点球</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateSphereRadius }"
        @click="createSphereRadius"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
          <line x1="12" y1="12" x2="21" y2="12" />
        </svg>
        <span>半径球</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateCone }"
        @click="createCone"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        >
          <line x1="12" y1="3" x2="4" y2="20" />
          <line x1="12" y1="3" x2="20" y2="20" />
          <ellipse cx="12" cy="20" rx="8" ry="3" />
          <circle cx="12" cy="20" r="1.5" fill="currentColor" />
          <circle cx="12" cy="3" r="1.5" fill="currentColor" />
        </svg>
        <span>圆锥</span>
      </button>
      <button
        class="menu-item"
        :class="{ 'menu-item-active': currentMode === EditorMode.CreateCylinder }"
        @click="createCylinder"
      >
        <svg
          class="menu-item-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.2"
          stroke-linejoin="round"
        >
          <ellipse cx="12" cy="5" rx="8" ry="3" />
          <line x1="4" y1="5" x2="4" y2="19" />
          <line x1="20" y1="5" x2="20" y2="19" />
          <ellipse cx="12" cy="19" rx="8" ry="3" />
          <circle cx="12" cy="5" r="1.5" fill="currentColor" />
          <circle cx="12" cy="19" r="1.5" fill="currentColor" />
        </svg>
        <span>圆柱</span>
      </button>
    </div>
  </Teleport>

  <Teleport to="body">
    <Transition name="side-menu-overlay">
      <div
        v-if="sideMenuOpen"
        ref="sideMenuOverlayRef"
        class="side-menu-overlay"
        @click="closeSideMenu"
      ></div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="side-menu-slide">
      <div v-if="sideMenuOpen" ref="sideMenuRef" class="side-menu-panel">
        <!-- 设置入口：位于汉堡菜单顶部 -->
        <button class="side-menu-item" @click="handleOpenSettings">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
          <span>设置</span>
        </button>
        <div class="side-menu-divider"></div>
        <button class="side-menu-item" @click="handleSaveScene">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
          <span>保存</span>
        </button>
        <button class="side-menu-item" @click="handleNewProject">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
          <span>新建项目</span>
        </button>
        <button v-if="hasActiveProject" class="side-menu-item" @click="handleEditProject">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>编辑项目</span>
        </button>
        <button
          v-if="hasActiveProject"
          class="side-menu-item side-menu-item-danger"
          @click="handleExitProject"
        >
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>退出项目</span>
        </button>
        <div class="side-menu-divider"></div>
        <button class="side-menu-item" @click="handleExportScene">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>导出</span>
        </button>
        <button class="side-menu-item" @click="handleImportScene">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>导入</span>
        </button>
        <div class="side-menu-divider"></div>
        <button class="side-menu-item" @click="handleOpenManual">
          <svg
            class="side-menu-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>用户手册</span>
        </button>
      </div>
    </Transition>
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
          <button class="profile-link-button" @click="goProfilePage">个人主页</button>
          <button class="profile-link-button" @click="goProjectListPage">项目列表</button>
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
  /* 垂直 padding 用变量驱动，scrollable 的负 margin 引用同一个变量，
     保证溢出量始终等于 padding，避免小窗口下滚动条被 overflow:hidden 切掉 */
  --toolbar-padding-y: 8px;
  display: flex;
  flex-wrap: nowrap;
  gap: 0;
  padding: var(--toolbar-padding-y) 8px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  /* 默认 stretch：让所有子项撑满 toolbar 高度；fixed-left 和 profile 单独 align-self: center 保持居中 */
  overflow: hidden;
}

.toolbar-fixed-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-right: 8px;
  align-self: center;
}

.toolbar-scrollable {
  display: flex;
  gap: 0;
  flex: 1 1 auto;
  min-width: 0;
  /* overlay 让滚动条覆盖内容而不占据空间，避免滚动条出现时中心点偏移；
     不支持 overlay 的浏览器回退到 auto */
  overflow-x: auto;
  overflow-x: overlay;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  /* stretch + 负 margin 让滚动条贴底 */
  align-self: stretch;
  margin-bottom: calc(var(--toolbar-padding-y) * -1);
}

.toolbar-scrollable-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: min-content;
  /* stretch + 负 margin 使 scrollable 高度比可见区域多 P，
     align-items: center 的中心点因此偏下 P/2，
     用 translateY(-P/2) 精确补偿，使按钮相对 toolbar 整体垂直居中 */
  transform: translateY(calc(var(--toolbar-padding-y) / -2));
}

.toolbar-logo {
  height: 60%;
  max-height: 28px;
  width: auto;
  object-fit: contain;
  margin: 0;
  pointer-events: none;
  user-select: none;
}

.divider {
  width: 1px;
  height: 20px;
  background: #444;
  margin: 0 4px;
  align-self: center;
}

button {
  background: #333;
  color: #eee;
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  transition: all 0.2s;
  /* 防止按钮文字在容器宽度不足时被压缩换行；窄到放不下时由 .toolbar-scrollable 横向滚动 */
  white-space: nowrap;
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
  display: inline-flex;
  align-items: center;
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
  display: inline-block;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.menu-trigger.is-open .menu-caret {
  transform: rotate(90deg);
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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
  align-self: center;
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

.toolbar-scrollable::-webkit-scrollbar {
  height: 4px;
}

.toolbar-scrollable::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 999px;
}

.history-button {
  min-width: 64px;
  padding: 4px 8px;
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
  flex-shrink: 0;
  margin-left: 8px;
  align-self: center;
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

.hamburger-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  background: #333;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}

.hamburger-btn:hover {
  background: #444;
}

.hamburger-btn.is-open {
  background: #43f260;
}

.hamburger-btn.is-open .hamburger-line {
  background: #000;
}

.hamburger-icon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 3px;
  width: 1.2em;
  height: 1.2em;
}

.hamburger-line {
  display: block;
  width: 100%;
  height: 0.15em;
  background: #eee;
  border-radius: 1px;
  transition: all 0.3s ease;
  transform-origin: center;
}

.hamburger-btn.is-open .hamburger-line:nth-child(1) {
  transform: translateY(calc(0.15em + 3px)) rotate(45deg);
}

.hamburger-btn.is-open .hamburger-line:nth-child(2) {
  opacity: 0;
}

.hamburger-btn.is-open .hamburger-line:nth-child(3) {
  transform: translateY(calc(-0.15em - 3px)) rotate(-45deg);
}

.side-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 1099;
  background: rgba(0, 0, 0, 0.4);
}

.side-menu-overlay-enter-active,
.side-menu-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.side-menu-overlay-enter-from,
.side-menu-overlay-leave-to {
  opacity: 0;
}

.side-menu-panel {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 1100;
  width: 180px;
  background: #1a1a1a;
  border-right: 1px solid #333;
  box-shadow: 4px 0 16px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  padding: 8px 0 0 0;
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.side-menu-slide-enter-active,
.side-menu-slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.side-menu-slide-enter-from,
.side-menu-slide-leave-to {
  transform: translateX(-100%);
}

.side-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 20px;
  background: transparent;
  color: #ddd;
  border: none;
  cursor: pointer;
  font-size: 14px;
  text-align: left;
  transition: all 0.15s ease;
}

.side-menu-item:hover {
  background: #2a2a2a;
  color: #43f260;
}

.side-menu-item-danger:hover {
  background: #2a2a2a;
  color: #ff6b6b;
}

.side-menu-item:active {
  background: #333;
}

.side-menu-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.side-menu-divider {
  height: 1px;
  background: #444;
  margin: 4px 16px;
}

.side-menu-panel::-webkit-scrollbar {
  width: 4px;
}

.side-menu-panel::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 999px;
}

.side-menu-panel::-webkit-scrollbar-track {
  background: transparent;
}

@media (max-width: 1024px) and (orientation: landscape) {
  .toolbar {
    --toolbar-padding-y: 6px;
  }

  .toolbar-fixed-left,
  .toolbar-scrollable-inner {
    gap: 6px;
  }

  .toolbar-fixed-left {
    padding-right: 6px;
  }

  button {
    padding: 5px 9px;
    font-size: 12px;
  }

  .hamburger-btn {
    padding: 5px 8px;
  }

  .room-input {
    width: 84px;
  }

  .divider {
    width: 1px;
    min-width: 1px;
    background: #6a6a6a;
    flex-shrink: 0;
  }
}

@media (max-width: 768px) {
  .toolbar {
    --toolbar-padding-y: 5px;
  }

  .toolbar-fixed-left,
  .toolbar-scrollable-inner {
    gap: 4px;
  }

  .toolbar-fixed-left {
    padding-right: 4px;
  }

  button {
    padding: 4px 7px;
    font-size: 11px;
  }

  .hamburger-btn {
    padding: 4px 6px;
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
    width: 1px;
    min-width: 1px;
    height: 20px;
    background: #6a6a6a;
    flex-shrink: 0;
  }

  .side-menu-divider {
    background: #6a6a6a;
    height: 1px;
    min-height: 1px;
    margin: 4px 16px;
  }

  .side-menu-item {
    padding: 8px 16px;
    font-size: 13px;
  }

  .side-menu-icon {
    width: 16px;
    height: 16px;
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
