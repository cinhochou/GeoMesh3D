<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { roomApi } from '@/api/room'
import { useAuthStore } from '@/store/authStore'
import { ApiError } from '@/api/client'
import type { Room, RoomMember, RoomRole, RoomCategory, UpdateRoomRequest, RoomApplication, ApprovalBadge, ApplicationFilter, ApplicationRole, RoomImportMode } from '@/types/room'
import { useSessionGuard } from '@/composables/useSessionGuard'
import ProxiedImage from '@/components/ProxiedImage.vue'
import { useCollabStore } from '@/store/collabStore'
import { crossTabLoginEvents, type CrossTabLoginEvent } from '@/utils/sessionEvents'
import { collabRoomEvents, type CollabRoomEvent } from '@/utils/collabRoomEvents'
import { mergeArrayById } from '@/utils/reactiveMerge'
import {
  readActiveRoomIds,
  removeActiveRoom,
  activeRoomStorageKeys,
} from '@/utils/activeRoomRegistry'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const collabStore = useCollabStore()
const rlBodyRef = ref<HTMLElement | null>(null)

useSessionGuard({
  onInvalidated: () => {
    router.replace({
      path: '/login',
      query: { reason: 'expired', redirect: route.fullPath },
    })
  },
})

const allRooms = ref<Room[]>([])
const isLoading = ref(false)
const deleteConfirmId = ref<string | null>(null)
const leaveConfirmId = ref<string | null>(null)

// ---- 当前正在协作的房间（跨 Tab 共享，用于判定 加入/离开 按钮状态）----
// 采用多条目注册表（roomId → 心跳时间戳）：每个编辑器 Tab 只登记/刷新/注销
// 自己的房间，多 Tab 同时加入不同房间时互不覆盖；读取时校验 TTL 新鲜度，
// 避免编辑器 Tab 被直接关闭后标记残留。
// 心跳每 10s 刷新时间戳，20s TTL 允许 1 次心跳丢失；pagehide 会立即注销。
const activeRoomIds = ref<Set<string>>(new Set())

const refreshActiveRoom = () => {
  const ids = readActiveRoomIds()
  activeRoomIds.value = ids
  // 注册表是「是否正在该房间协作」的唯一事实来源：从大厅/编辑器等其他入口加入时，
  // 列表页未参与加入流程，本地 hasLeft 可能仍是旧值，此处按注册表纠正，
  // 保证「加入/离开」按钮与卡片状态始终一致
  if (ids.size > 0) {
    let changed = false
    for (const room of allRooms.value) {
      if (ids.has(room.id) && room.hasLeft) {
        room.hasLeft = false
        changed = true
      }
    }
    if (changed) saveRoomHistory(allRooms.value)
  }
}

const isActiveRoom = (room: Room): boolean => activeRoomIds.value.has(room.id)

// ---- 房间历史记录本地持久化 ----
// 房间列表页用作历史记录，即使用户离开房间后也能从记录列表中再次加入。
// 后端 getMyRooms 仅返回当前成员身份的房间，因此已离开的房间需要本地持久化。
const getRoomHistoryKey = () => {
  const userId = authStore.user?.id || 'anonymous'
  return `collab:room_history:${userId}`
}

const loadRoomHistory = (): Room[] => {
  try {
    const raw = localStorage.getItem(getRoomHistoryKey())
    if (!raw) return []
    const parsed = JSON.parse(raw) as Room[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const saveRoomHistory = (rooms: Room[]) => {
  try {
    localStorage.setItem(getRoomHistoryKey(), JSON.stringify(rooms))
  } catch {
    // ignore storage errors
  }
}

// ---- 已移除房间跟踪 ----
// 用户主动"移除"房间（非"离开"）后，记录到本地，防止从历史记录中恢复。
// 与"离开"的区别：移除会删除成员信息，刷新后不再显示；若房间需要批准，再次加入需重新申请。
const getRemovedRoomsKey = () => {
  const userId = authStore.user?.id || 'anonymous'
  return `collab:removed_rooms:${userId}`
}

const getRemovedRoomIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(getRemovedRoomsKey())
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

const addRemovedRoom = (roomId: string) => {
  const set = getRemovedRoomIds()
  set.add(roomId)
  try {
    localStorage.setItem(getRemovedRoomsKey(), JSON.stringify([...set]))
  } catch {
    // ignore
  }
}

const clearRemovedRoom = (roomId: string) => {
  const set = getRemovedRoomIds()
  if (set.has(roomId)) {
    set.delete(roomId)
    try {
      localStorage.setItem(getRemovedRoomsKey(), JSON.stringify([...set]))
    } catch {
      // ignore
    }
  }
}

// 合并服务器数据与本地历史记录，保留已离开的房间（跳过已移除的房间）
const mergeWithHistory = (serverRooms: Room[]): Room[] => {
  const history = loadRoomHistory()
  if (history.length === 0) return serverRooms

  const removedIds = getRemovedRoomIds()
  const serverIds = new Set(serverRooms.map((r) => r.id))
  const merged = [...serverRooms]

  // 添加本地历史中存在但服务器未返回的房间（已离开的房间），跳过已移除的房间
  for (const histRoom of history) {
    if (!serverIds.has(histRoom.id) && histRoom.hasLeft && !removedIds.has(histRoom.id)) {
      merged.push(histRoom)
    }
  }

  return merged
}
const pageSize = ref(5)
const currentPage = ref(1)
const searchQuery = ref('')
const activeCategory = ref<RoomCategory>('all')
// 回到顶部
const showBackToTop = ref(false)

type SortValue =
  | 'nameAsc'
  | 'nameDesc'
  | 'updatedDesc'
  | 'updatedAsc'
  | 'createdDesc'
  | 'createdAsc'
const sortBy = ref<SortValue>('updatedDesc')
const sortOpen = ref(false)
const sortBarRef = ref<HTMLElement | null>(null)

const sortOptions: { value: SortValue; label: string; arrow: 'up' | 'down' }[] = [
  { value: 'nameAsc', label: '按名称', arrow: 'up' },
  { value: 'nameDesc', label: '按名称', arrow: 'down' },
  { value: 'updatedDesc', label: '按修改时间', arrow: 'down' },
  { value: 'updatedAsc', label: '按修改时间', arrow: 'up' },
  { value: 'createdDesc', label: '按创建时间', arrow: 'down' },
  { value: 'createdAsc', label: '按创建时间', arrow: 'up' },
]

const categoryTabs: { value: RoomCategory; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'created', label: '我创建的' },
  { value: 'participated', label: '我参与的' },
  { value: 'watched', label: '我观看的' },
]

const currentSortLabel = computed(
  () => sortOptions.find((o) => o.value === sortBy.value)?.label || '',
)
const currentSortArrow = computed(
  () => sortOptions.find((o) => o.value === sortBy.value)?.arrow || 'up',
)

const roleLabels: Record<RoomRole, string> = {
  creator: '由我创建',
  editor: '可编辑',
  viewer: '仅观看',
}

const roleBadgeClass: Record<RoomRole, string> = {
  creator: 'rl-role-creator',
  editor: 'rl-role-editor',
  viewer: 'rl-role-viewer',
}

// 编辑房间信息（仅创建者）
const editingField = ref<{ roomId: string; field: 'name' | 'description' } | null>(null)
const editingValue = ref('')
const editingOriginal = ref('')

// 描述展开
const expandedRooms = ref<Set<string>>(new Set())
const descOverflowMap = ref<Record<string, boolean>>({})

// 成员管理 / 权限管理 折叠区域（仅创建者）
const membersExpanded = ref<Set<string>>(new Set())
const permissionsExpanded = ref<Set<string>>(new Set())
const roomMembersMap = ref<Record<string, RoomMember[]>>({})
const membersLoading = ref<Set<string>>(new Set())
const removeMemberConfirm = ref<{ roomId: string; userId: string } | null>(null)
// 成员管理的搜索词（按 roomId 隔离）
const membersQueryMap = ref<Record<string, string>>({})
// 转让房间二次确认弹窗
const transferConfirm = ref<{ roomId: string; roomName: string; member: RoomMember } | null>(null)
const transferLoading = ref(false)

const fetchRooms = async (silent = false) => {
  // 仅首次加载和手动刷新时显示 loading 骨架；轮询时静默更新，避免闪烁
  if (!silent) isLoading.value = true
  try {
    const serverRooms = await roomApi.getMyRooms()
    // 过滤掉已移除的房间（用户主动移除后，后端可能尚未同步删除成员记录）
    const removedIds = getRemovedRoomIds()
    const filteredServerRooms = removedIds.size > 0
      ? serverRooms.filter((r) => !removedIds.has(r.id))
      : serverRooms
    // 合并本地历史记录（保留已离开的房间），并更新已存在房间的最新服务器数据
    const merged = mergeWithHistory(filteredServerRooms)
    // 对于同时存在于本地和服务器中的房间，保留本地的 hasLeft 状态
    const historyMap = new Map(loadRoomHistory().map((r) => [r.id, r]))
    const nextRooms = merged.map((r) => {
      const hist = historyMap.get(r.id)
      let room = r
      if (hist && hist.hasLeft && r.myRole !== 'creator') {
        // 本地标记为已离开，且服务器仍返回该房间（说明后端未移除成员记录）
        // 优先使用服务器的最新数据，但保留 hasLeft 状态
        room = { ...r, hasLeft: hist.hasLeft }
      }
      // 关闭/打开防回跳：本地操作已成功（或刚收到跨 Tab 事件）时，
      // 不允许在途的陈旧服务器快照把 isOpen 覆盖回旧值；服务器收敛后解除保护。
      // 本 Tab 有在途的打开/关闭请求时保护不得提前解除：请求提交前的旧快照
      // 可能与本地未预改的值相同，解除后同一窗口内的新快照会造成状态跳变。
      if (isRoomOpenPending(room.id)) {
        const local = allRooms.value.find((item) => item.id === room.id)
        if (local) {
          if (local.isOpen === room.isOpen && !isTogglingRoom(local)) {
            clearRoomOpenPending(room.id)
          } else {
            room = { ...room, isOpen: local.isOpen }
          }
        }
      }
      return room
    })
    // 局部动态刷新：按 id 合并，保留未变化房间的对象引用，避免列表重渲染/滚动重置
    allRooms.value = mergeArrayById(allRooms.value, nextRooms)
    saveRoomHistory(allRooms.value)
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '获取房间列表失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    if (!silent) isLoading.value = false
  }
}

const handleCrossTabLogin = (event: CrossTabLoginEvent) => {
  if (event.changed) {
    void fetchRooms()
  }
}

let roomPollingTimer: ReturnType<typeof setInterval> | null = null

// ---- 关闭/打开状态防回跳保护 ----
// 关闭/打开采用「乐观更新 + 失败回滚」：API 成功后本地即最新，但 15s 轮询的
// 服务器快照可能取自提交之前，若直接覆盖会让状态跳回旧值，出现两个状态
// 来回抖动。为此在本地操作/跨 Tab 事件生效后开启短保护窗口，窗口内轮询
// 不得覆盖 isOpen；服务器值收敛后提前解除保护。
const ROOM_OPEN_GUARD_MS = 15_000
const roomOpenPendingUntil = ref<Record<string, number>>({})

const markRoomOpenPending = (roomId: string) => {
  roomOpenPendingUntil.value = {
    ...roomOpenPendingUntil.value,
    [roomId]: Date.now() + ROOM_OPEN_GUARD_MS,
  }
}
const clearRoomOpenPending = (roomId: string) => {
  if (!(roomId in roomOpenPendingUntil.value)) return
  const next = { ...roomOpenPendingUntil.value }
  delete next[roomId]
  roomOpenPendingUntil.value = next
}
const isRoomOpenPending = (roomId: string): boolean =>
  (roomOpenPendingUntil.value[roomId] ?? 0) > Date.now()

// 本 Tab 刚发出的事件签名：emit 会同步派发给本 Tab 监听器，若不识别会导致
// join/leave 的 onlineCount 被本地逻辑与事件监听重复增减（状态不正确）。
let selfEventSignature: string | null = null
const emitRoomEvent = (event: CollabRoomEvent) => {
  selfEventSignature = `${event.type}:${event.roomId}:${event.timestamp}`
  collabRoomEvents.emit(event)
}

// 跨 Tab 协作事件处理：其他 Tab 中加入/离开/关闭/打开房间时，同步更新本地列表状态
const handleCollabRoomEvent = (event: CollabRoomEvent) => {
  // join/leave 事件会改变 active-room 注册表，立即刷新
  if (event.type === 'join' || event.type === 'leave') {
    refreshActiveRoom()
  }
  // 本 Tab 自己发出的事件：调用方已就地更新过状态，跳过以免重复应用
  if (selfEventSignature === `${event.type}:${event.roomId}:${event.timestamp}`) {
    return
  }
  const room = allRooms.value.find((r) => r.id === event.roomId)
  if (!room) return
  if (event.type === 'leave') {
    // 幂等：房间列表离开时会发 leave，编辑器 Tab 退出协作时会再发一条，
    // 已处于离开状态时不再重复扣减在线人数
    if (!room.hasLeft) {
      room.hasLeft = true
      room.onlineCount = Math.max(0, room.onlineCount - 1)
    }
  } else if (event.type === 'join') {
    if (room.hasLeft) {
      room.hasLeft = false
      room.onlineCount += 1
    }
  } else if (event.type === 'close') {
    room.isOpen = false
    room.onlineCount = 0
    // 事件代表服务端已提交的新状态，开启防回跳保护抵御在途的陈旧轮询快照
    markRoomOpenPending(room.id)
  } else if (event.type === 'reopen') {
    room.isOpen = true
    markRoomOpenPending(room.id)
  } else if (event.type === 'permission_change' && event.permission && event.value !== undefined) {
    // 实时同步权限变更（如 approvalRequired 开关）
    const field = event.permission as keyof Room
    ;(room as Record<string, unknown>)[field] = event.value
  }
  // 不更新 updatedAt：跨 Tab 事件不应导致列表项重排
  saveRoomHistory(allRooms.value)
}

// 监听 localStorage 跨 Tab 变化（active-room 注册表更新时立即同步按钮状态）
const handleStorageEvent = (e: StorageEvent) => {
  if (e.key && activeRoomStorageKeys.includes(e.key)) {
    refreshActiveRoom()
  }
}

onMounted(() => {
  refreshActiveRoom()
  fetchRooms()
  document.addEventListener('click', onSortClickOutside)
  crossTabLoginEvents.on(handleCrossTabLogin)
  collabRoomEvents.on(handleCollabRoomEvent)
  window.addEventListener('storage', handleStorageEvent)
  if (rlBodyRef.value) {
    rlBodyRef.value.addEventListener('scroll', onBodyScroll, { passive: true })
  }
  // 定时轮询房间列表，静默局部刷新（不触发 loading 骨架），实时更新人数和状态
  roomPollingTimer = setInterval(() => {
    void fetchRooms(true)
    refreshActiveRoom()
  }, 15_000)
  // 启动审批消息角标轮询
  startBadgePolling()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onSortClickOutside)
  crossTabLoginEvents.off(handleCrossTabLogin)
  collabRoomEvents.off(handleCollabRoomEvent)
  window.removeEventListener('storage', handleStorageEvent)
  if (rlBodyRef.value) {
    rlBodyRef.value.removeEventListener('scroll', onBodyScroll)
  }
  if (roomPollingTimer) {
    clearInterval(roomPollingTimer)
    roomPollingTimer = null
  }
  if (joinConfirmTimer) {
    clearTimeout(joinConfirmTimer)
    joinConfirmTimer = null
  }
  stopBadgePolling()
})

// ---- 回到顶部 ----
const onBodyScroll = () => {
  showBackToTop.value = (rlBodyRef.value?.scrollTop ?? 0) > 240
}
const scrollToTop = () => {
  rlBodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    currentPage.value = 1
  }, 300)
})
watch(sortBy, () => {
  currentPage.value = 1
})
watch(activeCategory, () => {
  currentPage.value = 1
})

const categoryCount = (cat: RoomCategory): number => {
  if (cat === 'all') return allRooms.value.length
  return allRooms.value.filter((r) => {
    if (cat === 'created') return r.myRole === 'creator'
    if (cat === 'participated') return r.myRole === 'editor'
    if (cat === 'watched') return r.myRole === 'viewer'
    return true
  }).length
}

const filteredRooms = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  let base = allRooms.value
  if (activeCategory.value !== 'all') {
    base = base.filter((r) => {
      if (activeCategory.value === 'created') return r.myRole === 'creator'
      if (activeCategory.value === 'participated') return r.myRole === 'editor'
      if (activeCategory.value === 'watched') return r.myRole === 'viewer'
      return true
    })
  }
  if (q) {
    base = base.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.projectName.toLowerCase().includes(q),
    )
  }
  const sorted = [...base]
  const timeOf = (s: string) => new Date(s).getTime()
  // 稳定排序：主排序键相同时用 id 作为次级排序键，避免时间戳相同的项随机抖动
  switch (sortBy.value) {
    case 'nameAsc':
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id))
      break
    case 'nameDesc':
      sorted.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN') || a.id.localeCompare(b.id))
      break
    case 'updatedDesc':
      sorted.sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt) || a.id.localeCompare(b.id))
      break
    case 'updatedAsc':
      sorted.sort((a, b) => timeOf(a.updatedAt) - timeOf(b.updatedAt) || a.id.localeCompare(b.id))
      break
    case 'createdDesc':
      sorted.sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt) || a.id.localeCompare(b.id))
      break
    case 'createdAsc':
      sorted.sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) || a.id.localeCompare(b.id))
      break
  }
  return sorted
})

const totalItems = computed(() => filteredRooms.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))

const paginatedRooms = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredRooms.value.slice(start, start + pageSize.value)
})

// 列表项边框：离开（黄）> 打开（绿）> 默认
const cardBorderClass = (room: Room) => {
  if (room.hasLeft) return 'is-left'
  if (room.isOpen) return 'is-open'
  return ''
}

const isCreator = (room: Room) => room.myRole === 'creator'

const displayOwner = (room: Room) => {
  if (room.myRole === 'creator') {
    return authStore.user?.nickname || authStore.user?.username || '我'
  }
  return room.ownerName || '未知用户'
}

// ---- 编辑房间信息 ----
const startEdit = (room: Room, field: 'name' | 'description') => {
  editingField.value = { roomId: room.id, field }
  editingValue.value = room[field]
  editingOriginal.value = room[field]
  if (field === 'description') {
    nextTick(() => {
      const textarea = document.querySelector('.rl-edit-textarea') as HTMLTextAreaElement | null
      if (textarea) {
        textarea.style.height = 'auto'
        textarea.style.height = textarea.scrollHeight + 'px'
      }
    })
  }
}

const hasEditChanged = computed(() => editingValue.value !== editingOriginal.value)

const saveEdit = async () => {
  if (!editingField.value) return
  if (!hasEditChanged.value) {
    editingField.value = null
    editingValue.value = ''
    editingOriginal.value = ''
    return
  }
  const room = allRooms.value.find((r) => r.id === editingField.value!.roomId)
  if (room) {
    const trimmed = editingValue.value.trim()
    if (editingField.value.field === 'name' && !trimmed) {
      editingField.value = null
      editingValue.value = ''
      editingOriginal.value = ''
      return
    }
    const field = editingField.value.field
    const oldValue = room[field]
    room[field] = trimmed
    try {
      await roomApi.updateRoom(room.id, { [field]: trimmed })
      // 不更新 updatedAt：避免编辑后列表项跳到顶部，破坏用户当前浏览位置
    } catch (err) {
      room[field] = oldValue
      const msg = err instanceof ApiError ? err.message : '更新失败'
      window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
    }
  }
  editingField.value = null
  editingValue.value = ''
  editingOriginal.value = ''
}

const cancelEdit = () => {
  editingField.value = null
  editingValue.value = ''
  editingOriginal.value = ''
}

const isEditing = (roomId: string, field: 'name' | 'description') => {
  return editingField.value?.roomId === roomId && editingField.value?.field === field
}

const autoResize = (e: Event) => {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

// ---- 描述展开 ----
const toggleExpanded = (roomId: string) => {
  if (expandedRooms.value.has(roomId)) {
    expandedRooms.value.delete(roomId)
  } else {
    expandedRooms.value.add(roomId)
  }
}
const isExpanded = (roomId: string) => expandedRooms.value.has(roomId)
const isDescOverflow = (roomId: string) => descOverflowMap.value[roomId] ?? false
const onDescMounted = (el: HTMLElement | null, roomId: string) => {
  if (!el) return
  const check = () => {
    descOverflowMap.value[roomId] = el.scrollHeight > el.clientHeight
  }
  check()
  const ro = new ResizeObserver(check)
  ro.observe(el)
}

// ---- 排序下拉 ----
const toggleSortOpen = () => {
  sortOpen.value = !sortOpen.value
}
const selectSort = (value: SortValue) => {
  sortBy.value = value
  sortOpen.value = false
}
const onSortClickOutside = (e: MouseEvent) => {
  if (sortBarRef.value && !sortBarRef.value.contains(e.target as Node)) {
    sortOpen.value = false
  }
}

// ---- 跳转 ----
const goToEditor = () => {
  const resolved = router.resolve({ name: 'editor' })
  window.open(resolved.href, '_blank')
}

const openProject = (projectId: string) => {
  if (!projectId) return
  // 跳转到项目列表页面，并通过 query 参数定位到该项目
  const resolved = router.resolve({ name: 'projects', query: { projectId } })
  window.open(resolved.href, '_blank')
}

// ---- 离开 / 加入 ----
// 进行中的房间 id：同一时刻每个按钮只允许一个在途请求，防止连击导致
// 重复调用 API、重复打开编辑器 Tab、在线人数重复增减
const joiningRoomId = ref<string | null>(null)
const leavingRoomId = ref<string | null>(null)
// 加入成功后等待编辑器 Tab 登记 active-room 的最长时间（超时则恢复按钮）
const JOIN_CONFIRM_TIMEOUT_MS = 10_000
let joinConfirmTimer: ReturnType<typeof setTimeout> | null = null

const requestLeave = (id: string) => {
  leaveConfirmId.value = id
}
const cancelLeave = () => {
  leaveConfirmId.value = null
}
const confirmLeave = async (room: Room) => {
  if (leavingRoomId.value) return
  leavingRoomId.value = room.id
  try {
    await roomApi.leaveRoom(room.id)
    room.hasLeft = true
    room.onlineCount = Math.max(0, room.onlineCount - 1)
    leaveConfirmId.value = null
    // 立即注销本房间的 active-room 注册项并刷新：按钮从「离开」即时翻转为
    // 「加入」，不再等待编辑器 Tab 响应跨 Tab 事件或 20s TTL 过期
    if (isActiveRoom(room)) {
      removeActiveRoom(room.id)
    }
    refreshActiveRoom()
    // 持久化到本地历史记录
    saveRoomHistory(allRooms.value)
    // 跨 Tab 通知编辑器页同步退出协作
    emitRoomEvent({
      type: 'leave',
      roomId: room.id,
      timestamp: Date.now(),
    })
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '已离开房间', scope: 'global' } }),
    )
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '离开房间失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
    leaveConfirmId.value = null
  } finally {
    leavingRoomId.value = null
  }
}
const joinRoom = async (room: Room) => {
  if (joiningRoomId.value) return
  if (!room.isOpen) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '房间已关闭，无法加入', scope: 'global' },
      }),
    )
    return
  }
  // 已在本机协作中（可能是刚加入、编辑器 Tab 尚未登记完成）：不重复打开编辑器
  if (isActiveRoom(room)) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '你已在该房间中协作，无需重复加入', scope: 'global' },
      }),
    )
    return
  }
  // 人数上限校验（仅警告，不阻塞加入——以后端实际在线人数为准）
  if (room.onlineCount >= room.maxMembers) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '房间人数可能已满，正在尝试加入...', scope: 'global' },
      }),
    )
  }
  joiningRoomId.value = room.id
  try {
    // joinRoom 返回 wsUrl+ticket，用于跳转编辑器后建立 WebSocket 协作连接
    const joinResult = await roomApi.joinRoom(room.id)
    room.hasLeft = false
    room.myRole = 'editor'
    room.onlineCount += 1
    // 用户重新加入房间，清除已移除标记
    clearRemovedRoom(room.id)
    // 持久化到本地历史记录
    saveRoomHistory(allRooms.value)
    // 跨 Tab 通知编辑器页加入协作
    emitRoomEvent({
      type: 'join',
      roomId: room.id,
      timestamp: Date.now(),
    })
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '已加入房间，正在跳转...', scope: 'global' } }),
    )
    // 将加入凭证暂存到 localStorage（跨 Tab 共享），跳转编辑器后自动建立协作连接
    localStorage.setItem(
      `collab:join:${room.id}`,
      JSON.stringify({
        wsUrl: joinResult.wsUrl,
        ticket: joinResult.ticket,
        role: joinResult.role,
        roomName: room.name,
      }),
    )
    // 跳转到编辑器页面并带上 roomId
    const resolved = router.resolve({ name: 'editor', query: { roomId: room.id } })
    window.open(resolved.href, '_blank')
    // 保持「加入中」直到编辑器 Tab 登记 active-room（或超时），
    // 避免窗口期内重复点击打开多个编辑器 Tab
    if (joinConfirmTimer) clearTimeout(joinConfirmTimer)
    joinConfirmTimer = setTimeout(() => {
      joiningRoomId.value = null
      joinConfirmTimer = null
    }, JOIN_CONFIRM_TIMEOUT_MS)
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '加入房间失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
    joiningRoomId.value = null
  }
}

// 编辑器 Tab 完成登记（或标记过期）后解除「加入中」状态
watch(activeRoomIds, (ids) => {
  if (joiningRoomId.value && ids.has(joiningRoomId.value)) {
    if (joinConfirmTimer) {
      clearTimeout(joinConfirmTimer)
      joinConfirmTimer = null
    }
    joiningRoomId.value = null
  }
})

// ---- 打开 / 关闭房间（仅创建者）----
// 进行中的打开/关闭操作：同时记录房间 id 与操作意图。
// 等待期间不预改 room.isOpen（与 joinRoom 的 joiningRoomId 模式一致）：
//  1. 避免「加入」按钮在房间真正打开前就出现；
//  2. 按钮文案由意图决定，杜绝打开中显示成「关闭中...」。
const roomToggleState = ref<{ roomId: string; action: 'open' | 'close' } | null>(null)
const isTogglingRoom = (room: Room): boolean => roomToggleState.value?.roomId === room.id
// 按钮图标/标题应展示的「关闭态」：进行中关闭操作、或房间已处于打开状态
const showsCloseAction = (room: Room): boolean => {
  if (roomToggleState.value?.roomId === room.id) {
    return roomToggleState.value.action === 'close'
  }
  return room.isOpen
}

const toggleRoomOpen = async (room: Room) => {
  // 仅"打开"直接执行；"关闭"走二次确认流程（见 requestClose / confirmClose）
  if (room.isOpen) return
  if (roomToggleState.value) return
  // 先进入「打开中...」禁用态，再发请求：等待期间 isOpen 保持 false
  roomToggleState.value = { roomId: room.id, action: 'open' }
  // 入口即开启防回跳保护：轮询快照可能取自提交前，不得在等待期覆盖本地状态
  markRoomOpenPending(room.id)
  try {
    await roomApi.openRoom(room.id)
    // API 成功后才落地新状态：刷新防回跳窗口，并跨 Tab 通知房间已重新开放
    room.isOpen = true
    markRoomOpenPending(room.id)
    emitRoomEvent({
      type: 'reopen',
      roomId: room.id,
      timestamp: Date.now(),
    })
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '房间已打开', scope: 'global' } }),
    )
  } catch (err) {
    // 失败：本地从未预改 isOpen，无需回滚；解除防回跳保护
    clearRoomOpenPending(room.id)
    const msg = err instanceof ApiError ? err.message : '更新失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    roomToggleState.value = null
  }
}

// ---- 关闭房间（仅创建者，二次确认）----
const closeConfirmId = ref<string | null>(null)
const requestClose = (id: string) => {
  closeConfirmId.value = id
}
const cancelClose = () => {
  closeConfirmId.value = null
}
const confirmClose = async (room: Room) => {
  if (roomToggleState.value) return
  // 确认等待期间房间可能已被其他成员关闭：无需重复请求
  if (!room.isOpen) {
    closeConfirmId.value = null
    return
  }
  // 立即收起确认弹窗：等待期间主按钮显示「关闭中...」禁用态，
  // 避免界面卡在确认/取消上且没有任何进行中反馈
  closeConfirmId.value = null
  roomToggleState.value = { roomId: room.id, action: 'close' }
  // 入口即开启防回跳保护：轮询快照可能取自提交前，不得在等待期覆盖本地状态
  markRoomOpenPending(room.id)
  try {
    await roomApi.closeRoom(room.id)
    // API 成功后才落地新状态：刷新防回跳窗口，并跨 Tab 通知房间已关闭
    room.isOpen = false
    markRoomOpenPending(room.id)
    emitRoomEvent({
      type: 'close',
      roomId: room.id,
      timestamp: Date.now(),
    })
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '房间已关闭', scope: 'global' } }),
    )
  } catch (err) {
    // 失败：本地从未预改 isOpen，无需回滚；解除防回跳保护
    clearRoomOpenPending(room.id)
    const msg = err instanceof ApiError ? err.message : '关闭失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    roomToggleState.value = null
  }
}

// ---- 公开开关（仅创建者）----
const togglePublic = async (room: Room) => {
  const oldPublic = room.isPublic
  room.isPublic = !room.isPublic
  try {
    await roomApi.updateRoom(room.id, { isPublic: room.isPublic })
    // 不更新 updatedAt：避免切换公开后列表项跳到顶部
    // 通知编辑器 Tab 即时刷新房间可见性标签
    emitRoomEvent({
      type: 'visibility_change',
      roomId: room.id,
      timestamp: Date.now(),
      isPublic: room.isPublic,
    })
  } catch (err) {
    room.isPublic = oldPublic
    const msg = err instanceof ApiError ? err.message : '更新失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  }
}

// ---- 最大人数（仅创建者）----
const updateMaxMembers = async (room: Room, e: Event) => {
  const input = e.target as HTMLInputElement
  const val = Math.floor(Number(input.value))
  if (!Number.isFinite(val) || val < 1) {
    input.value = String(room.maxMembers)
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '人数上限至少为 1', scope: 'global' } }),
    )
    return
  }
  if (val < room.memberCount) {
    input.value = String(room.maxMembers)
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: `人数上限不能小于当前成员数（${room.memberCount}）`, scope: 'global' },
      }),
    )
    return
  }
  const oldMax = room.maxMembers
  room.maxMembers = val
  try {
    await roomApi.updateRoom(room.id, { maxMembers: val })
    // 不更新 updatedAt：避免修改人数上限后列表项跳到顶部
  } catch (err) {
    room.maxMembers = oldMax
    input.value = String(oldMax)
    const msg = err instanceof ApiError ? err.message : '更新失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  }
}

// ---- 删除房间 / 移出列表 ----
// 创建者：调用后端删除接口，彻底删除房间及所有成员记录（需先关闭房间）
// 非创建者：调用 leaveRoom 移除自己的成员记录，并从本地列表移除
const requestDelete = (room: Room) => {
  // 创建者：未关闭的房间不允许删除，弹出提醒
  if (isCreator(room) && room.isOpen) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '请先关闭房间再删除', scope: 'global' },
      }),
    )
    return
  }
  deleteConfirmId.value = room.id
}
const cancelDelete = () => {
  deleteConfirmId.value = null
}
const confirmDelete = async (id: string) => {
  try {
    const room = allRooms.value.find((r) => r.id === id)
    if (!room) return

    if (isCreator(room)) {
      // 创建者：调用后端删除接口
      await roomApi.deleteRoom(id)
    } else {
      // 非创建者：硬删除自己的成员记录，房间列表不再返回该房间
      // 若房间需要批准加入，再次加入需重新申请
      await roomApi.removeSelfFromRoom(id)
      // 记录到已移除列表，防止刷新后从本地历史恢复
      addRemovedRoom(id)
    }

    allRooms.value = allRooms.value.filter((r) => r.id !== id)
    deleteConfirmId.value = null
    // 从本地历史记录中移除
    saveRoomHistory(allRooms.value)
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }

    const msg = isCreator(room) ? '房间已删除' : '已移出房间列表'
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg, scope: 'global' } }),
    )
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '操作失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
    deleteConfirmId.value = null
  }
}

// ---- 成员管理 / 权限管理 ----
const ensureMembers = async (roomId: string) => {
  if (roomMembersMap.value[roomId]) return
  membersLoading.value.add(roomId)
  try {
    roomMembersMap.value[roomId] = await roomApi.getRoomMembers(roomId)
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '获取成员失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    membersLoading.value.delete(roomId)
  }
}

const toggleMembers = async (roomId: string) => {
  if (membersExpanded.value.has(roomId)) {
    membersExpanded.value.delete(roomId)
  } else {
    membersExpanded.value.add(roomId)
    await ensureMembers(roomId)
  }
}

const togglePermissions = async (roomId: string) => {
  if (permissionsExpanded.value.has(roomId)) {
    permissionsExpanded.value.delete(roomId)
  } else {
    permissionsExpanded.value.add(roomId)
    await ensureMembers(roomId)
  }
}

const updateRoomPerm = async (
  room: Room,
  field: 'allowShare' | 'disableExport' | 'disableImport' | 'importMode' | 'defaultRole' | 'disableClear' | 'disableUndoRedo' | 'approvalRequired',
  value: boolean | 'editor' | 'viewer' | RoomImportMode,
) => {
  const oldVal = room[field]
  room[field] = value as never
  try {
    await roomApi.updateRoom(room.id, { [field]: value } as UpdateRoomRequest)
    emitRoomEvent({
      type: 'permission_change',
      roomId: room.id,
      timestamp: Date.now(),
      permission: field,
      value,
    })
    // 不更新 updatedAt：避免修改权限后列表项跳到顶部
  } catch (err) {
    room[field] = oldVal as never
    const msg = err instanceof ApiError ? err.message : '权限更新失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  }
}

const isMembersExpanded = (roomId: string) => membersExpanded.value.has(roomId)
const isPermissionsExpanded = (roomId: string) => permissionsExpanded.value.has(roomId)
const isMembersLoading = (roomId: string) => membersLoading.value.has(roomId)

// 成员搜索：按 username / nickname 模糊匹配
const matchesQuery = (member: RoomMember, q: string) => {
  const query = q.trim().toLowerCase()
  if (!query) return true
  return (
    member.username.toLowerCase().includes(query) ||
    (member.nickname || '').toLowerCase().includes(query)
  )
}

// 成员管理区域：过滤后的成员列表
const filteredMembers = (roomId: string): RoomMember[] => {
  const list = roomMembersMap.value[roomId]
  if (!list) return []
  const q = membersQueryMap.value[roomId] || ''
  return list.filter((m) => matchesQuery(m, q))
}

const setMembersQuery = (roomId: string, value: string) => {
  membersQueryMap.value = { ...membersQueryMap.value, [roomId]: value }
}
const clearMembersQuery = (roomId: string) => {
  setMembersQuery(roomId, '')
}

const changeMemberRole = async (roomId: string, member: RoomMember, newRole: RoomRole) => {
  if (newRole === member.role) return
  const oldRole = member.role
  member.role = newRole
  try {
    await roomApi.updateMemberRole(roomId, member.userId, newRole)
    // 通知编辑器 Tab 即时刷新目标用户的操作权限
    emitRoomEvent({
      type: 'role_change',
      roomId,
      timestamp: Date.now(),
      targetUserId: member.userId,
      role: newRole,
    })
    // 经 Yjs awareness 广播给房间内所有协作者（含不同设备/浏览器的目标成员），
    // 使其本地 myRole 立即更新、权限即时生效，无需等待下一次轮询。
    collabStore.activeManager?.broadcastRoleChange({
      roomId,
      targetUserId: member.userId,
      role: newRole,
    })
  } catch (err) {
    member.role = oldRole
    const msg = err instanceof ApiError ? err.message : '权限更新失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  }
}

const requestRemoveMember = (roomId: string, userId: string) => {
  removeMemberConfirm.value = { roomId, userId }
}
const cancelRemoveMember = () => {
  removeMemberConfirm.value = null
}
const confirmRemoveMember = async (roomId: string, userId: string) => {
  try {
    await roomApi.removeMember(roomId, userId)
    const list = roomMembersMap.value[roomId]
    if (list) {
      roomMembersMap.value[roomId] = list.filter((m) => m.userId !== userId)
    }
    const room = allRooms.value.find((r) => r.id === roomId)
    if (room) {
      room.memberCount = Math.max(0, room.memberCount - 1)
    }
    // 通知编辑器 Tab 被踢用户应退出协作
    emitRoomEvent({
      type: 'kick',
      roomId,
      timestamp: Date.now(),
      targetUserId: userId,
    })
    removeMemberConfirm.value = null
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '移除成员失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
    removeMemberConfirm.value = null
  }
}

// ---- 转让房间（仅创建者）：弹出二次确认窗口 ----
const requestTransfer = (room: Room, member: RoomMember) => {
  transferConfirm.value = {
    roomId: room.id,
    roomName: room.name,
    member,
  }
}
const cancelTransfer = () => {
  transferConfirm.value = null
}
const confirmTransfer = async () => {
  if (!transferConfirm.value) return
  const { roomId, member } = transferConfirm.value
  transferLoading.value = true
  try {
    await roomApi.transferRoom(roomId, member.userId)
    // 当前用户角色降级为可编辑者，房间信息更新
    const room = allRooms.value.find((r) => r.id === roomId)
    if (room) {
      room.myRole = 'editor'
      room.ownerId = member.userId
      room.ownerName = member.nickname || member.username
    }
    // 成员列表中角色同步
    const list = roomMembersMap.value[roomId]
    if (list) {
      const updated = list.map((m) => {
        if (m.userId === member.userId) return { ...m, role: 'creator' as RoomRole }
        if (m.userId === 'me' || m.userId === authStore.user?.id)
          return { ...m, role: 'editor' as RoomRole }
        return m
      })
      roomMembersMap.value[roomId] = updated
    }
    transferConfirm.value = null
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '转让房间失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    transferLoading.value = false
  }
}

// ---- 分页 ----
const changePageSize = (size: number) => {
  let centerIndex = 0
  const body = rlBodyRef.value
  if (body) {
    const cards = body.querySelectorAll('.rl-card')
    if (cards.length > 0) {
      const bodyRect = body.getBoundingClientRect()
      const viewCenter = bodyRect.top + bodyRect.height / 2
      let minDist = Infinity
      let closestIdx = 0
      cards.forEach((card, i) => {
        const rect = card.getBoundingClientRect()
        const cardCenter = rect.top + rect.height / 2
        const dist = Math.abs(cardCenter - viewCenter)
        if (dist < minDist) {
          minDist = dist
          closestIdx = i
        }
      })
      const start = (currentPage.value - 1) * pageSize.value
      centerIndex = start + closestIdx
    }
  } else {
    centerIndex = (currentPage.value - 1) * pageSize.value + Math.floor(pageSize.value / 2)
  }
  pageSize.value = size
  currentPage.value = Math.max(1, Math.min(Math.floor(centerIndex / size) + 1, totalPages.value))
}

const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return dateStr.replace('T', ' ').replace(/\.\d+.*$/, '')
}

/**
 * 房间列表页成员卡片的悬浮说明：同时展示首次加入时间与上一次加入时间。
 * - 首次加入时间（joinedAt）：成员关系建立的时间，整个存续期不变
 * - 上一次加入时间（lastJoinedAt）：最近一次加入协作的时刻，每次重新加入都会刷新
 * 后者缺失时（后端未提供该字段）只展示首次加入时间，避免出现空行。
 */
const memberJoinTitle = (member: RoomMember): string => {
  const first = formatDate(member.joinedAt)
  const last = formatDate(member.lastJoinedAt ?? '')
  const base = `@${member.username}`
  if (!last || last === first) return `${base} · 加入于 ${first}`
  return `${base} · 首次加入 ${first} · 最后加入 ${last}`
}

// ---- 顶部三个入口 ----
const handleCollabHall = () => {
  router.push({ name: 'collab-hall' })
}
const handleRecycleBin = () => {
  router.push({ name: 'recycle-bin', query: { section: 'rooms' } })
}

const handleCreateRoom = () => {
  // 跳转编辑器并直接打开"创建协作"对话框（同项目列表"新建项目"的跳转方式）
  const resolved = router.resolve({ name: 'editor', query: { collabCreate: 'true' } })
  window.open(resolved.href, '_blank')
}

// ==================== 房间加入申请 / 审批消息 ====================

// ---- 审批角标 ----
const approvalBadge = ref<ApprovalBadge>({ sentUnread: 0, reviewUnread: 0, totalUnread: 0 })
let badgeTimer: ReturnType<typeof setInterval> | null = null
/** 上次请求审批角标的时间戳，用于 5 秒节流 */
let lastBadgeLoadAt = 0

const loadApprovalBadge = async () => {
  // 节流：角标除30 秒轮询外，还会在审批、房间切换等事件中被单独调用。
  // 这些事件可能密集触发，短时间内的重复请求没有意义。
  const now = Date.now()
  if (now - lastBadgeLoadAt < 5_000) return
  lastBadgeLoadAt = now
  try {
    approvalBadge.value = await roomApi.getApprovalBadge()
  } catch {
    // 未登录或后端不可用时静默
  }
}

const startBadgePolling = () => {
  loadApprovalBadge()
  if (badgeTimer) clearInterval(badgeTimer)
  badgeTimer = setInterval(loadApprovalBadge, 30_000) // 30秒轮询
}
const stopBadgePolling = () => {
  if (badgeTimer) {
    clearInterval(badgeTimer)
    badgeTimer = null
  }
}

// ---- 审批列表浮窗 ----
const approvalPopupOpen = ref(false)
const approvalTab = ref<'sent' | 'review'>('sent')
const sentApplications = ref<RoomApplication[]>([])
const reviewApplications = ref<RoomApplication[]>([])
const sentFilter = ref<ApplicationFilter>('all')
const reviewFilter = ref<ApplicationFilter>('all')
const approvalLoading = ref(false)

const openApprovalPopup = async () => {
  approvalPopupOpen.value = true
  approvalLoading.value = true
  try {
    const [sent, review] = await Promise.all([
      roomApi.getMyApplications(),
      roomApi.getReviewApplications(),
    ])
    sentApplications.value = sent
    reviewApplications.value = review
  } catch {
    // ignore
  } finally {
    approvalLoading.value = false
  }
}

const closeApprovalPopup = () => {
  approvalPopupOpen.value = false
  detailApplication.value = null
}

const switchApprovalTab = (tab: 'sent' | 'review') => {
  approvalTab.value = tab
}

// "我发送的"中的已读/未读分类和角标 → applicantRead（用户自己是否点开该消息）
// "我发送的"列表项的"已读/未读"标签 → reviewerRead（创建者/审核者是否已读）
// "我审核的"中所有已读/未读逻辑 → reviewerRead（自己作为审核者是否已读）
const filterApplications = (
  list: RoomApplication[],
  filter: ApplicationFilter,
  mode: 'sent' | 'review',
): RoomApplication[] => {
  const isRead = (a: RoomApplication) => mode === 'sent' ? a.applicantRead : a.reviewerRead
  switch (filter) {
    case 'read':
      return list.filter((a) => isRead(a))
    case 'unread':
      return list.filter((a) => !isRead(a))
    case 'pending':
      return list.filter((a) => a.status === 'PENDING')
    case 'reviewed':
      return list.filter((a) => a.status !== 'PENDING')
    default:
      return list
  }
}

const filteredSentApplications = computed(() =>
  filterApplications(sentApplications.value, sentFilter.value, 'sent'),
)
const filteredReviewApplications = computed(() =>
  filterApplications(reviewApplications.value, reviewFilter.value, 'review'),
)

// "我发送的"未读数 = 申请人尚未读到审核结果的申请数
const sentUnreadCount = computed(() => sentApplications.value.filter((a) => !a.applicantRead).length)
// "我审核的"未读数 = 审核者尚未读该申请的数量
const reviewUnreadCount = computed(() => reviewApplications.value.filter((a) => !a.reviewerRead).length)

const filterTabs: { value: ApplicationFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
  { value: 'pending', label: '待审核' },
  { value: 'reviewed', label: '已审核' },
]

// ---- 申请详情/审核浮窗 ----
const detailApplication = ref<RoomApplication | null>(null)
const detailMode = ref<'sent' | 'review'>('sent')
const reviewForm = ref<{ decision: 'APPROVED' | 'REJECTED'; grantedRole: ApplicationRole; reviewComment: string }>({
  decision: 'APPROVED',
  grantedRole: 'viewer',
  reviewComment: '',
})
const reviewSubmitting = ref(false)

const openApplicationDetail = async (app: RoomApplication, mode: 'sent' | 'review') => {
  detailApplication.value = app
  detailMode.value = mode
  // 只有点击消息进入详情才算已读
  // "我发送的"：申请人点击后标记 applicantRead = true（已读到审核结果）
  if (mode === 'sent' && !app.applicantRead) {
    try {
      await roomApi.markApplicationRead(app.id, 'applicant')
      app.applicantRead = true
      const target = sentApplications.value.find((a) => a.id === app.id)
      if (target) target.applicantRead = true
      loadApprovalBadge()
    } catch {
      // ignore
    }
  }
  // "我审核的"：审核者点击后标记 reviewerRead = true
  if (mode === 'review' && !app.reviewerRead) {
    try {
      await roomApi.markApplicationRead(app.id, 'reviewer')
      app.reviewerRead = true
      const target = reviewApplications.value.find((a) => a.id === app.id)
      if (target) target.reviewerRead = true
      loadApprovalBadge()
    } catch {
      // ignore
    }
  }
  // 如果是审核模式且待审核，初始化审核表单
  if (mode === 'review' && app.status === 'PENDING') {
    reviewForm.value = {
      decision: 'APPROVED',
      grantedRole: (app.requestedRole.toLowerCase() === 'editor' ? 'editor' : 'viewer'),
      reviewComment: '',
    }
  }
}

const closeApplicationDetail = () => {
  detailApplication.value = null
}

const submitReview = async () => {
  if (!detailApplication.value) return
  if (reviewForm.value.decision === 'APPROVED' && !reviewForm.value.grantedRole) return
  reviewSubmitting.value = true
  try {
    const updated = await roomApi.reviewApplication(detailApplication.value.id, {
      decision: reviewForm.value.decision,
      grantedRole: reviewForm.value.decision === 'APPROVED' ? reviewForm.value.grantedRole : undefined,
      reviewComment: reviewForm.value.reviewComment,
    })
    // 更新本地列表
    const idx = reviewApplications.value.findIndex((a) => a.id === updated.id)
    if (idx >= 0) reviewApplications.value[idx] = updated
    detailApplication.value = updated
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '审核已提交', scope: 'global' } }),
    )
    loadApprovalBadge()
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '审核提交失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    reviewSubmitting.value = false
  }
}

// ---- 申请详情浮窗：已批准时快捷加入 ----
const detailJoining = ref(false)
const joinRoomFromDetail = async () => {
  if (!detailApplication.value) return
  const roomId = detailApplication.value.roomId
  const roomName = detailApplication.value.roomName || roomId
  detailJoining.value = true
  try {
    const joinResult = await roomApi.joinRoom(roomId)
    // 更新本地房间列表中该房间的状态
    const room = allRooms.value.find((r) => r.id === roomId)
    if (room) {
      room.hasLeft = false
      room.myRole = joinResult.role
      room.onlineCount += 1
    }
    // 用户重新加入房间，清除已移除标记
    clearRemovedRoom(roomId)
    saveRoomHistory(allRooms.value)
    // 暂存加入凭证，跳转编辑器
    localStorage.setItem(
      `collab:join:${roomId}`,
      JSON.stringify({
        wsUrl: joinResult.wsUrl,
        ticket: joinResult.ticket,
        role: joinResult.role,
        roomName,
      }),
    )
    closeApplicationDetail()
    const resolved = router.resolve({ name: 'editor', query: { roomId } })
    window.open(resolved.href, '_blank')
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '已加入房间，正在跳转...', scope: 'global' } }),
    )
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '加入房间失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    detailJoining.value = false
  }
}

// ---- 审批状态文案/样式 ----
const statusLabels: Record<string, string> = {
  PENDING: '待审核',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  REVOKED: '已批准',
}
const statusClasses: Record<string, string> = {
  PENDING: 'is-pending',
  APPROVED: 'is-approved',
  REJECTED: 'is-rejected',
  REVOKED: 'is-approved',
}
const roleLabelsMap: Record<string, string> = {
  VIEWER: '仅观看',
  EDITOR: '可编辑',
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return ''
  return dateStr.replace('T', ' ').replace(/\.\d+.*$/, '')
}
</script>

<template>
  <div class="room-list-page">
    <div class="rl-sticky-top">
      <header class="rl-header">
        <div class="rl-header-inner">
          <img
            src="@/assets/GeoMesh3D_logo_white_1240x300.png"
            alt="GeoMesh3D"
            class="rl-logo"
            @click="goToEditor"
          />
          <h1 class="rl-title">房间列表</h1>
          <div class="rl-header-actions">
            <div class="rl-action-wrap">
              <button class="rl-header-action-btn" @click="openApprovalPopup" title="审批消息">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <span
                  v-if="approvalBadge.totalUnread > 0"
                  class="rl-badge-dot"
                >{{ approvalBadge.totalUnread > 99 ? '99+' : approvalBadge.totalUnread }}</span>
              </button>
              <div class="rl-tooltip">审批消息</div>
            </div>
            <div class="rl-action-wrap">
              <button class="rl-header-action-btn" @click="handleCollabHall" title="协作大厅">
                <svg
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <!-- 房间图标：等距立方体 + 顶部协作光点 + 左侧门 -->
                  <path d="M16 3 L28 9 L28 23 L16 29 L4 23 L4 9 Z" />
                  <path d="M16 3 L16 16 L4 9" />
                  <path d="M16 16 L28 9" />
                  <path d="M16 16 L16 29" />
                  <circle cx="16" cy="9.5" r="1.6" fill="currentColor" stroke="none" />
                  <path d="M9 22 L9 17 L13 19 L13 24" />
                </svg>
              </button>
              <div class="rl-tooltip">协作大厅</div>
            </div>
            <div class="rl-action-wrap">
              <button class="rl-header-action-btn" @click="handleCreateRoom" title="创建房间">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              <div class="rl-tooltip">创建房间</div>
            </div>
            <div class="rl-action-wrap">
              <button class="rl-header-action-btn" @click="handleRecycleBin" title="回收站">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
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
              </button>
              <div class="rl-tooltip">回收站</div>
            </div>
          </div>
        </div>
      </header>

      <div class="rl-divider"></div>
    </div>

    <div ref="rlBodyRef" class="rl-body">
      <div class="rl-body-inner">
        <!-- 分类标签 -->
        <div class="rl-category-tabs">
          <button
            v-for="tab in categoryTabs"
            :key="tab.value"
            class="rl-category-tab"
            :class="{ active: activeCategory === tab.value }"
            @click="activeCategory = tab.value"
          >
            {{ tab.label }}
            <span class="rl-category-count">{{ categoryCount(tab.value) }}</span>
          </button>
        </div>

        <div class="rl-toolbar-row">
          <div class="rl-search-bar">
            <svg
              class="rl-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              class="rl-search-input"
              placeholder="房间名称、ID、描述或关联项目..."
            />
            <button v-if="searchQuery" class="rl-search-clear" @click="searchQuery = ''">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div ref="sortBarRef" class="rl-sort-bar">
            <button class="rl-sort-trigger" @click="toggleSortOpen">
              <svg
                class="rl-sort-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="9" y2="18" />
              </svg>
              <span class="rl-sort-label">{{ currentSortLabel }}</span>
              <span class="rl-sort-arrow">{{ currentSortArrow === 'up' ? '↑' : '↓' }}</span>
              <svg
                class="rl-sort-caret"
                :class="{ open: sortOpen }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Transition name="sort-fade">
              <ul v-if="sortOpen" class="rl-sort-dropdown">
                <li
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  class="rl-sort-option"
                  :class="{ active: sortBy === opt.value }"
                  @click="selectSort(opt.value)"
                >
                  <span class="rl-sort-option-label">{{ opt.label }}</span>
                  <span class="rl-sort-option-arrow">{{ opt.arrow === 'up' ? '↑' : '↓' }}</span>
                </li>
              </ul>
            </Transition>
          </div>
        </div>

        <div v-if="isLoading" class="rl-loading">
          <div class="rl-mini-spinner"></div>
          <span class="rl-loading-text">加载中...</span>
        </div>

        <div v-else-if="filteredRooms.length === 0" class="rl-empty">
          <svg
            class="rl-empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 12h.01M9 16h.01" />
          </svg>
          <p class="rl-empty-text">{{ searchQuery ? '未找到匹配的房间' : '暂无房间' }}</p>
        </div>

        <div v-else class="rl-list">
          <div
            v-for="room in paginatedRooms"
            :key="room.id"
            class="rl-card"
            :class="cardBorderClass(room)"
          >
            <div class="rl-card-thumb">
              <ProxiedImage
                v-if="room.projectThumbnailUrl"
                :src="room.projectThumbnailUrl"
                :alt="room.projectName"
                class="rl-thumb-img"
              />
              <div v-else class="rl-thumb-placeholder">
                <!-- 新设计的房间占位图标：立方体 + 内部门窗，象征 3D 协作房间 -->
                <svg
                  viewBox="0 0 32 32"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <!-- 立方体外框（等距投影） -->
                  <path d="M16 3 L28 9 L28 23 L16 29 L4 23 L4 9 Z" />
                  <path d="M16 3 L16 16 L4 9" />
                  <path d="M16 16 L28 9" />
                  <path d="M16 16 L16 29" />
                  <!-- 顶部窗（协作光晕，居中于竖线） -->
                  <circle cx="16" cy="9.5" r="1.4" fill="currentColor" stroke="none" />
                  <!-- 左侧门 -->
                  <path d="M9 22 L9 17 L13 19 L13 24" />
                </svg>
              </div>
            </div>

            <div class="rl-card-content">
              <div class="rl-card-top">
                <div class="rl-card-info">
                  <div class="rl-card-name-row">
                    <template v-if="isEditing(room.id, 'name')">
                      <input
                        v-model="editingValue"
                        class="rl-edit-input rl-edit-name"
                        @blur="saveEdit"
                        @keydown.enter="saveEdit"
                        @keydown.escape="cancelEdit"
                        autofocus
                      />
                      <button
                        class="icon-btn icon-btn-confirm"
                        @mousedown.prevent
                        @click="saveEdit"
                        :disabled="!hasEditChanged"
                        title="确认"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </button>
                      <button
                        class="icon-btn icon-btn-cancel"
                        @mousedown.prevent
                        @click="cancelEdit"
                        title="取消"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </template>
                    <template v-else>
                      <span class="rl-card-name">{{ room.name }}</span>
                      <button
                        v-if="isCreator(room)"
                        class="icon-btn icon-btn-edit"
                        @click.stop="startEdit(room, 'name')"
                        title="修改名称"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                        </svg>
                      </button>
                    </template>
                    <span class="rl-card-id">#{{ room.id }}</span>
                  </div>

                  <!-- 关联项目 -->
                  <div class="rl-project-link-row">
                    <svg
                      class="rl-project-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                      />
                    </svg>
                    <span class="rl-project-label">关联项目：</span>
                    <span class="rl-project-name" @click="openProject(room.projectId)">
                      {{ room.projectName }}
                    </span>
                  </div>

                  <div v-if="isEditing(room.id, 'description')" class="rl-edit-wrap">
                    <textarea
                      v-model="editingValue"
                      class="rl-edit-textarea"
                      rows="1"
                      @input="autoResize"
                      @blur="saveEdit"
                      @keydown.escape="cancelEdit"
                      autofocus
                    ></textarea>
                    <button
                      class="rl-edit-check"
                      :class="{ changed: hasEditChanged }"
                      @mousedown.prevent
                      @click="saveEdit"
                      :disabled="!hasEditChanged"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </div>
                  <div v-else class="rl-desc-wrap">
                    <div
                      class="rl-desc-content"
                      :class="{ expanded: isExpanded(room.id) }"
                      @dblclick="isCreator(room) && startEdit(room, 'description')"
                    >
                      <div
                        class="rl-desc-text"
                        :class="{ 'rl-desc-placeholder': !room.description }"
                        :ref="(el) => onDescMounted(el as HTMLElement, room.id)"
                      >
                        {{
                          room.description ||
                          (isCreator(room)
                            ? '该房间还未编辑描述文字，双击可编辑~'
                            : '该房间未编辑描述文字')
                        }}
                      </div>
                    </div>
                    <button
                      v-if="isDescOverflow(room.id) || isExpanded(room.id)"
                      class="rl-toggle-btn"
                      @click.stop="toggleExpanded(room.id)"
                    >
                      <svg
                        v-if="!isExpanded(room.id)"
                        class="rl-toggle-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      <svg
                        v-else
                        class="rl-toggle-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                      <span class="rl-toggle-text">{{
                        isExpanded(room.id) ? '收起' : '展开'
                      }}</span>
                    </button>
                  </div>

                  <!-- 状态标签 -->
                  <div class="rl-badge-row">
                    <span class="rl-role-badge" :class="roleBadgeClass[room.myRole]">
                      {{ roleLabels[room.myRole] }}
                    </span>
                    <span class="rl-status-badge" :class="room.isOpen ? 'is-open' : 'is-closed'">
                      {{ room.isOpen ? '已打开' : '已关闭' }}
                    </span>
                    <span
                      class="rl-status-badge"
                      :class="room.isPublic ? 'is-public' : 'is-private'"
                    >
                      {{ room.isPublic ? '公开' : '私密' }}
                    </span>
                    <span
                      class="rl-status-badge"
                      :class="room.approvalRequired ? 'is-approval' : 'is-no-approval'"
                    >
                      {{ room.approvalRequired ? '需要批准' : '无需批准' }}
                    </span>
                    <span v-if="isActiveRoom(room)" class="rl-status-badge is-joined">已加入</span>
                    <span v-else class="rl-status-badge is-left">已离开</span>
                  </div>
                </div>
              </div>

              <div class="rl-card-meta">
                <span class="rl-meta-item">
                  <svg
                    class="rl-meta-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  {{ displayOwner(room) }}
                </span>
                <span class="rl-meta-sep">·</span>
                <span class="rl-meta-item">
                  <svg
                    class="rl-meta-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  {{ room.onlineCount }} 在线 / {{ room.memberCount }} 位成员
                </span>
                <span class="rl-meta-sep">·</span>
                <span class="rl-meta-item">
                  <svg
                    class="rl-meta-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  创建：{{ formatDate(room.createdAt) }}
                </span>
                <span class="rl-meta-sep">·</span>
                <span class="rl-meta-item">
                  <svg
                    class="rl-meta-icon"
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
                  修改：{{ formatDate(room.updatedAt) }}
                </span>
              </div>

              <!-- 创建者专属设置：公开开关 + 人数上限 -->
              <div v-if="isCreator(room)" class="rl-card-settings">
                <label class="rl-setting-item" title="公开后房间可被搜索加入">
                  <span class="rl-setting-label">是否公开？</span>
                  <button
                    type="button"
                    class="rl-switch"
                    :class="{ 'is-on': room.isPublic }"
                    :aria-pressed="room.isPublic"
                    @click.stop="togglePublic(room)"
                  >
                    <span class="rl-switch-knob"></span>
                  </button>
                  <span class="rl-setting-value" :class="{ 'is-on': room.isPublic }">
                    {{ room.isPublic ? '公开' : '私密' }}
                  </span>
                </label>
                <span class="rl-setting-sep"></span>
                <label class="rl-setting-item" title="房间最大人数上限">
                  <span class="rl-setting-label">人数上限</span>
                  <input
                    type="number"
                    class="rl-max-input"
                    :value="room.maxMembers"
                    min="1"
                    max="100"
                    @click.stop
                    @change="updateMaxMembers(room, $event)"
                  />
                  <span class="rl-setting-value">{{ room.onlineCount }}/{{ room.maxMembers }}</span>
                </label>
              </div>

              <div class="rl-card-actions">
                <!-- 离开 / 加入：根据当前用户真实协作状态显示，仅在房间打开时可用；
                     打开/关闭进行中时一律禁用，防止在等待房间真正开关期间误操作 -->
                <template v-if="leaveConfirmId !== room.id">
                  <button
                    v-if="isActiveRoom(room) && room.isOpen"
                    class="rl-action-btn rl-leave-btn"
                    :disabled="leavingRoomId === room.id || isTogglingRoom(room)"
                    @click="requestLeave(room.id)"
                    title="离开房间"
                  >
                    <svg
                      class="rl-action-icon"
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
                    <span>{{ leavingRoomId === room.id ? '离开中...' : '离开' }}</span>
                  </button>
                  <button
                    v-else-if="!isActiveRoom(room) && room.isOpen"
                    class="rl-action-btn rl-join-btn"
                    :disabled="joiningRoomId === room.id || isTogglingRoom(room)"
                    @click="joinRoom(room)"
                    title="加入房间"
                  >
                    <svg
                      class="rl-action-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    <span>{{ joiningRoomId === room.id ? '加入中...' : '加入' }}</span>
                  </button>
                </template>
                <div v-else class="rl-confirm-inline">
                  <span class="rl-confirm-text">确认离开？</span>
                  <button
                    class="rl-confirm-yes"
                    :disabled="leavingRoomId === room.id"
                    @click="confirmLeave(room)"
                  >
                    确认
                  </button>
                  <button class="rl-confirm-no" @click="cancelLeave">取消</button>
                </div>

                <!-- 打开 / 关闭房间（仅创建者）；关闭需二次确认 -->
                <template v-if="isCreator(room) && closeConfirmId !== room.id">
                  <button
                    class="rl-action-btn rl-open-btn"
                    :class="{ 'is-open': room.isOpen, 'is-closed': !room.isOpen }"
                    :disabled="isTogglingRoom(room)"
                    @click="room.isOpen ? requestClose(room.id) : toggleRoomOpen(room)"
                    :title="room.isOpen ? '关闭房间' : '打开房间'"
                  >
                    <svg
                      v-if="showsCloseAction(room)"
                      class="rl-action-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                    </svg>
                    <svg
                      v-else
                      class="rl-action-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                    <span>{{
                      roomToggleState?.roomId === room.id
                        ? (roomToggleState.action === 'open' ? '打开中...' : '关闭中...')
                        : (room.isOpen ? '关闭' : '打开')
                    }}</span>
                  </button>
                </template>
                <div
                  v-else-if="isCreator(room) && closeConfirmId === room.id"
                  class="rl-confirm-inline"
                >
                  <span class="rl-confirm-text">确认关闭？</span>
                  <button
                    class="rl-confirm-yes"
                    :disabled="isTogglingRoom(room)"
                    @click="confirmClose(room)"
                  >
                    确认
                  </button>
                  <button class="rl-confirm-no" @click="cancelClose">取消</button>
                </div>

                <!-- 删除（创建者）/ 移出列表（非创建者） -->
                <template v-if="deleteConfirmId !== room.id">
                  <button
                    class="rl-action-btn"
                    :class="isCreator(room) ? 'rl-delete-btn' : 'rl-leave-btn'"
                    @click="requestDelete(room)"
                    :title="isCreator(room) ? '删除房间' : '移出列表'"
                  >
                    <svg
                      v-if="isCreator(room)"
                      class="rl-action-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path
                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                      />
                    </svg>
                    <svg
                      v-else
                      class="rl-action-icon"
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
                    <span>{{ isCreator(room) ? '删除' : '移除' }}</span>
                  </button>
                </template>
                <div v-else class="rl-confirm-inline rl-confirm-danger">
                  <span class="rl-confirm-text">{{
                    isCreator(room) ? '确认删除？' : '确认移除？'
                  }}</span>
                  <button class="rl-confirm-yes" @click="confirmDelete(room.id)">确认</button>
                  <button class="rl-confirm-no" @click="cancelDelete">取消</button>
                </div>
              </div>

              <!-- 成员管理 / 权限管理（仅创建者） -->
              <div v-if="isCreator(room)" class="rl-member-section">
                <div class="rl-section-header" @click="toggleMembers(room.id)">
                  <svg
                    class="rl-section-caret"
                    :class="{ expanded: isMembersExpanded(room.id) }"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span class="rl-section-title">成员管理</span>
                  <span class="rl-section-count">{{ room.memberCount }}</span>
                </div>
                <Transition name="section-fade">
                  <div v-if="isMembersExpanded(room.id)" class="rl-section-body">
                    <div v-if="isMembersLoading(room.id)" class="rl-section-loading">
                      <div class="rl-mini-spinner rl-mini-spinner-sm"></div>
                      <span>加载中...</span>
                    </div>
                    <template v-else>
                      <!-- 展开时唤起的搜索框 -->
                      <div class="rl-member-search">
                        <svg
                          class="rl-member-search-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                          type="text"
                          class="rl-member-search-input"
                          placeholder="搜索成员名称..."
                          :value="membersQueryMap[room.id] || ''"
                          @input="
                            setMembersQuery(room.id, ($event.target as HTMLInputElement).value)
                          "
                        />
                        <button
                          v-if="membersQueryMap[room.id]"
                          class="rl-member-search-clear"
                          @click="clearMembersQuery(room.id)"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      <div v-if="filteredMembers(room.id).length" class="rl-member-grid">
                        <div
                          v-for="member in filteredMembers(room.id)"
                          :key="member.userId"
                          class="rl-member-card"
                          :title="memberJoinTitle(member)"
                        >
                          <div class="rl-member-avatar">
                            <ProxiedImage
                              v-if="member.avatarUrl"
                              :src="member.avatarUrl"
                              alt="avatar"
                              class="rl-avatar-img"
                            />
                            <div v-else class="rl-avatar-fallback">
                              {{ (member.nickname || member.username).slice(0, 1).toUpperCase() }}
                            </div>
                          </div>
                          <span class="rl-member-name">{{
                            member.nickname || member.username
                          }}</span>
                          <select
                            v-if="member.role !== 'creator'"
                            class="rl-perm-select"
                            :value="member.role"
                            @change="
                              changeMemberRole(
                                room.id,
                                member,
                                ($event.target as HTMLSelectElement).value as RoomRole,
                              )
                            "
                          >
                            <option value="editor">可编辑</option>
                            <option value="viewer">仅观看</option>
                          </select>
                          <span
                            v-else
                            class="rl-member-role"
                            :class="roleBadgeClass[member.role]"
                            >{{ roleLabels[member.role] }}</span
                          >
                          <template
                            v-if="
                              removeMemberConfirm?.roomId === room.id &&
                              removeMemberConfirm?.userId === member.userId
                            "
                          >
                            <span class="rl-confirm-text rl-confirm-text-inline">移除？</span>
                            <button
                              class="rl-confirm-yes rl-confirm-mini"
                              @click="confirmRemoveMember(room.id, member.userId)"
                            >
                              是
                            </button>
                            <button
                              class="rl-confirm-no rl-confirm-mini"
                              @click="cancelRemoveMember"
                            >
                              否
                            </button>
                          </template>
                          <button
                            v-else-if="member.role !== 'creator'"
                            class="icon-btn icon-btn-remove"
                            @click="requestRemoveMember(room.id, member.userId)"
                            title="移除成员"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                          <!-- 转让房间（仅创建者可操作，将房间所有权转给该成员） -->
                          <button
                            v-if="member.role !== 'creator'"
                            class="icon-btn icon-btn-transfer"
                            @click="requestTransfer(room, member)"
                            title="转让房间给该成员"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <polyline points="17 1 21 5 17 9" />
                              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                              <polyline points="7 23 3 19 7 15" />
                              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div v-else class="rl-section-empty">
                        {{
                          (membersQueryMap[room.id] || '').trim() ? '未找到匹配的成员' : '暂无成员'
                        }}
                      </div>
                    </template>
                  </div>
                </Transition>

                <div
                  class="rl-section-header rl-section-header-gap"
                  @click="togglePermissions(room.id)"
                >
                  <svg
                    class="rl-section-caret"
                    :class="{ expanded: isPermissionsExpanded(room.id) }"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span class="rl-section-title">权限管理</span>
                </div>
                <Transition name="section-fade">
                  <div v-if="isPermissionsExpanded(room.id)" class="rl-section-body">
                    <div class="rl-perm-toggles">
                      <label class="rl-perm-toggle-item">
                        <span class="rl-perm-toggle-label">是否需要批准加入</span>
                        <input
                          type="checkbox"
                          :checked="room.approvalRequired"
                          @change="
                            updateRoomPerm(
                              room,
                              'approvalRequired',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                      <label class="rl-perm-toggle-item">
                        <span class="rl-perm-toggle-label">允许分享房间</span>
                        <input
                          type="checkbox"
                          :checked="room.allowShare"
                          @change="
                            updateRoomPerm(
                              room,
                              'allowShare',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                      <label class="rl-perm-toggle-item">
                        <span class="rl-perm-toggle-label">禁用导出</span>
                        <input
                          type="checkbox"
                          :checked="room.disableExport"
                          @change="
                            updateRoomPerm(
                              room,
                              'disableExport',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                      <label class="rl-perm-toggle-item">
                        <span class="rl-perm-toggle-label">禁用导入</span>
                        <input
                          type="checkbox"
                          :checked="room.disableImport"
                          @change="
                            updateRoomPerm(
                              room,
                              'disableImport',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                      <!-- 「禁用导入」的子设置：仅在允许导入时可选，统一约束房间内所有成员的导入行为 -->
                      <div
                        v-if="!room.disableImport"
                        class="rl-perm-toggle-item rl-perm-toggle-select rl-perm-sub"
                      >
                        <span class="rl-perm-toggle-label">导入模式</span>
                        <select
                          :value="room.importMode"
                          @change="
                            updateRoomPerm(
                              room,
                              'importMode',
                              ($event.target as HTMLSelectElement).value as RoomImportMode,
                            )
                          "
                        >
                          <option value="overwrite">覆盖</option>
                          <option value="merge">合并</option>
                        </select>
                      </div>
                      <label class="rl-perm-toggle-item">
                        <span class="rl-perm-toggle-label">禁用清空场景</span>
                        <input
                          type="checkbox"
                          :checked="room.disableClear"
                          @change="
                            updateRoomPerm(
                              room,
                              'disableClear',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                      <label class="rl-perm-toggle-item">
                        <span class="rl-perm-toggle-label">禁止成员撤销/重做</span>
                        <input
                          type="checkbox"
                          :checked="room.disableUndoRedo"
                          @change="
                            updateRoomPerm(
                              room,
                              'disableUndoRedo',
                              ($event.target as HTMLInputElement).checked,
                            )
                          "
                        />
                      </label>
                      <div class="rl-perm-toggle-item rl-perm-toggle-select">
                        <span class="rl-perm-toggle-label">新成员默认身份</span>
                        <select
                          :value="room.defaultRole"
                          @change="
                            updateRoomPerm(
                              room,
                              'defaultRole',
                              ($event.target as HTMLSelectElement).value as 'editor' | 'viewer',
                            )
                          "
                        >
                          <option value="editor">可编辑</option>
                          <option value="viewer">仅观看</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="rl-sticky-bottom">
      <div class="rl-pagination">
        <div class="rl-page-size">
          <span class="rl-page-size-label">每页显示</span>
          <div class="rl-page-size-options">
            <button
              v-for="size in [5, 10, 15, 30]"
              :key="size"
              class="rl-page-size-btn"
              :class="{ active: pageSize === size }"
              @click="changePageSize(size)"
            >
              {{ size }}
            </button>
          </div>
        </div>
        <div class="rl-page-center">
          <span class="rl-total-count"
            >共 <span class="rl-total-num">{{ totalItems }}</span> 个房间</span
          >
        </div>
        <div class="rl-page-info">
          <button
            class="rl-page-nav"
            :disabled="currentPage <= 1"
            @click="goToPage(currentPage - 1)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span class="rl-page-text">{{ currentPage }} / {{ totalPages }}</span>
          <button
            class="rl-page-nav"
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 转让房间二次确认弹窗 -->
    <Transition name="modal-fade">
      <div v-if="transferConfirm" class="rl-modal-mask">
        <div class="rl-modal" role="dialog" aria-modal="true">
          <div class="rl-modal-header">
            <div class="rl-modal-title-wrap">
              <svg
                class="rl-modal-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="17 1 21 5 17 9" />
                <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                <polyline points="7 23 3 19 7 15" />
                <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              </svg>
              <h3 class="rl-modal-title">转让房间</h3>
            </div>
            <button class="rl-modal-close" @click="cancelTransfer" aria-label="关闭">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="rl-modal-body">
            <p class="rl-modal-text">
              确定要将房间
              <span class="rl-modal-highlight">「{{ transferConfirm.roomName }}」</span>
              的所有权转让给
              <span class="rl-modal-highlight"
                >「{{ transferConfirm.member.nickname || transferConfirm.member.username }}」</span
              >
              吗？
            </p>
            <p class="rl-modal-warn">
              转让后，你将降级为「可编辑」角色，无法再管理房间基本信息与成员权限，但仍在房间成员列表中。
            </p>
          </div>
          <div class="rl-modal-footer">
            <button
              class="rl-modal-btn rl-modal-cancel"
              @click="cancelTransfer"
              :disabled="transferLoading"
            >
              取消
            </button>
            <button
              class="rl-modal-btn rl-modal-confirm"
              @click="confirmTransfer"
              :disabled="transferLoading"
            >
              <span v-if="transferLoading" class="rl-mini-spinner rl-mini-spinner-sm"></span>
              <span>{{ transferLoading ? '处理中...' : '确认转让' }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 回到顶部悬浮按钮 -->
    <Transition name="backtop-fade">
      <button
        v-if="showBackToTop"
        class="rl-back-to-top"
        @click="scrollToTop"
        title="回到顶部"
        aria-label="回到顶部"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>
    </Transition>

    <!-- ==================== 审批列表浮窗 ==================== -->
    <Transition name="popup-fade">
      <div v-if="approvalPopupOpen" class="rl-popup-overlay">
        <div class="rl-popup-box rl-approval-popup">
          <div class="rl-popup-header">
            <h3 class="rl-popup-title">审批消息</h3>
            <button class="rl-popup-close" @click="closeApprovalPopup">×</button>
          </div>
          <div class="rl-popup-body">
            <!-- 两个板块 Tab -->
            <div class="rl-approval-tabs">
              <button
                class="rl-approval-tab"
                :class="{ active: approvalTab === 'sent' }"
                @click="switchApprovalTab('sent')"
              >
                我发送的
                <span v-if="sentUnreadCount > 0" class="rl-tab-badge">{{ sentUnreadCount > 99 ? '99+' : sentUnreadCount }}</span>
              </button>
              <button
                class="rl-approval-tab"
                :class="{ active: approvalTab === 'review' }"
                @click="switchApprovalTab('review')"
              >
                我审核的
                <span v-if="reviewUnreadCount > 0" class="rl-tab-badge">{{ reviewUnreadCount > 99 ? '99+' : reviewUnreadCount }}</span>
              </button>
            </div>
            <!-- 分类筛选按钮 -->
            <div class="rl-filter-row">
              <button
                v-for="tab in filterTabs"
                :key="tab.value"
                class="rl-filter-btn"
                :class="{
                  active: approvalTab === 'sent'
                    ? sentFilter === tab.value
                    : reviewFilter === tab.value,
                }"
                @click="approvalTab === 'sent' ? (sentFilter = tab.value) : (reviewFilter = tab.value)"
              >{{ tab.label }}</button>
            </div>
            <!-- 列表内容 -->
            <div v-if="approvalLoading" class="rl-approval-empty">加载中...</div>
            <div v-else class="rl-approval-list">
              <template v-if="approvalTab === 'sent'">
                <div v-if="filteredSentApplications.length === 0" class="rl-approval-empty">暂无记录</div>
                <div
                  v-for="app in filteredSentApplications"
                  :key="app.id"
                  class="rl-approval-item"
                  :class="{ 'is-unread': !app.applicantRead }"
                  @click="openApplicationDetail(app, 'sent')"
                >
                  <div class="rl-approval-item-top">
                    <span class="rl-approval-room">{{ app.roomName || app.roomId }}</span>
                    <div class="rl-approval-tags">
                      <span
                        class="rl-read-tag"
                        :class="app.reviewerRead ? 'is-read' : 'is-unread'"
                      >{{ app.reviewerRead ? '已读' : '未读' }}</span>
                      <span class="rl-approval-status" :class="statusClasses[app.status]">{{ statusLabels[app.status] }}</span>
                    </div>
                  </div>
                  <div class="rl-approval-item-meta">
                    <span>申请权限：{{ roleLabelsMap[app.requestedRole] || app.requestedRole }}</span>
                    <span>·</span>
                    <span>{{ formatDateTime(app.appliedAt) }}</span>
                  </div>
                  <div v-if="!app.applicantRead" class="rl-unread-dot"></div>
                </div>
              </template>
              <template v-else>
                <div v-if="filteredReviewApplications.length === 0" class="rl-approval-empty">暂无记录</div>
                <div
                  v-for="app in filteredReviewApplications"
                  :key="app.id"
                  class="rl-approval-item"
                  :class="{ 'is-unread': !app.reviewerRead }"
                  @click="openApplicationDetail(app, 'review')"
                >
                  <div class="rl-approval-item-top">
                    <span class="rl-approval-room">{{ app.applicantNickname || app.applicantUsername }} → {{ app.roomName || app.roomId }}</span>
                    <div class="rl-approval-tags">
                      <span
                        class="rl-read-tag"
                        :class="app.reviewerRead ? 'is-read' : 'is-unread'"
                      >{{ app.reviewerRead ? '已读' : '未读' }}</span>
                      <span class="rl-approval-status" :class="statusClasses[app.status]">{{ statusLabels[app.status] }}</span>
                    </div>
                  </div>
                  <div class="rl-approval-item-meta">
                    <span>申请权限：{{ roleLabelsMap[app.requestedRole] || app.requestedRole }}</span>
                    <span>·</span>
                    <span>{{ formatDateTime(app.appliedAt) }}</span>
                  </div>
                  <div v-if="!app.reviewerRead" class="rl-unread-dot"></div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ==================== 申请详情/审核浮窗 ==================== -->
    <Transition name="popup-fade">
      <div v-if="detailApplication" class="rl-popup-overlay">
        <div class="rl-popup-box rl-detail-popup">
          <div class="rl-popup-header">
            <h3 class="rl-popup-title">{{ detailMode === 'sent' ? '申请详情' : '审核申请' }}</h3>
            <button class="rl-popup-close" @click="closeApplicationDetail">×</button>
          </div>
          <div class="rl-popup-body">
            <template v-if="detailApplication">
              <!-- 申请表单信息（只读） -->
              <div class="rl-detail-section">
                <div class="rl-detail-row">
                  <span class="rl-detail-label">房间</span>
                  <span class="rl-detail-value">{{ detailApplication.roomName || detailApplication.roomId }}</span>
                </div>
                <div class="rl-detail-row">
                  <span class="rl-detail-label">用户名</span>
                  <span class="rl-detail-value">{{ detailApplication.applicantUsername }}</span>
                </div>
                <div class="rl-detail-row">
                  <span class="rl-detail-label">昵称</span>
                  <span class="rl-detail-value">{{ detailApplication.applicantNickname || '—' }}</span>
                </div>
                <div class="rl-detail-row">
                  <span class="rl-detail-label">申请权限</span>
                  <span class="rl-detail-value">{{ roleLabelsMap[detailApplication.requestedRole] || detailApplication.requestedRole }}</span>
                </div>
                <div class="rl-detail-row">
                  <span class="rl-detail-label">申请理由</span>
                  <span class="rl-detail-value">{{ detailApplication.reason || '—' }}</span>
                </div>
                <div class="rl-detail-row">
                  <span class="rl-detail-label">申请时间</span>
                  <span class="rl-detail-value">{{ formatDateTime(detailApplication.appliedAt) }}</span>
                </div>
              </div>
              <!-- 审核结果 -->
              <div class="rl-detail-section">
                <div class="rl-detail-row">
                  <span class="rl-detail-label">审核状态</span>
                  <span class="rl-detail-value">
                    <span class="rl-approval-status" :class="statusClasses[detailApplication.status]">{{ statusLabels[detailApplication.status] }}</span>
                    <!-- 已过期标签：REVOKED 状态表示批准后被移除，授权已失效 -->
                    <span v-if="detailApplication.status === 'REVOKED'" class="rl-expired-tag">已过期</span>
                    <!-- 已读/未读标签：均表示创建者（审核者）是否已读该消息 -->
                    <span
                      class="rl-read-tag"
                      :class="detailApplication.reviewerRead ? 'is-read' : 'is-unread'"
                    >{{ detailApplication.reviewerRead ? '已读' : '未读' }}</span>
                    <!-- 申请详情：仅 APPROVED 状态（非 REVOKED）显示快捷"加入房间>"按钮 -->
                    <button
                      v-if="detailMode === 'sent' && detailApplication.status === 'APPROVED'"
                      class="rl-detail-join-btn"
                      :disabled="detailJoining"
                      @click="joinRoomFromDetail"
                    >{{ detailJoining ? '加入中...' : '加入房间 >' }}</button>
                  </span>
                </div>
                <template v-if="detailApplication.status !== 'PENDING'">
                  <div v-if="detailApplication.grantedRole" class="rl-detail-row">
                    <span class="rl-detail-label">批准权限</span>
                    <span class="rl-detail-value">{{ roleLabelsMap[detailApplication.grantedRole] || detailApplication.grantedRole }}</span>
                  </div>
                  <div v-if="detailApplication.reviewComment" class="rl-detail-row">
                    <span class="rl-detail-label">审核意见</span>
                    <span class="rl-detail-value">{{ detailApplication.reviewComment }}</span>
                  </div>
                  <div class="rl-detail-row">
                    <span class="rl-detail-label">审核时间</span>
                    <span class="rl-detail-value">{{ formatDateTime(detailApplication.reviewedAt) }}</span>
                  </div>
                </template>
              </div>
              <!-- 审核表单（仅"我审核的"且待审核时显示） -->
              <div v-if="detailMode === 'review' && detailApplication.status === 'PENDING'" class="rl-detail-section rl-review-form">
                <div class="rl-form-group">
                  <label class="rl-form-label">给予权限</label>
                  <select v-model="reviewForm.grantedRole" class="rl-form-input">
                    <option value="viewer">仅观看</option>
                    <option value="editor">可编辑</option>
                  </select>
                </div>
                <div class="rl-form-group">
                  <label class="rl-form-label">审核意见</label>
                  <textarea
                    v-model="reviewForm.reviewComment"
                    class="rl-form-textarea"
                    rows="2"
                    placeholder="请输入审核意见..."
                  ></textarea>
                </div>
                <div class="rl-review-decision">
                  <label class="rl-radio-item">
                    <input type="radio" v-model="reviewForm.decision" value="APPROVED" />
                    <span>批准加入</span>
                  </label>
                  <label class="rl-radio-item">
                    <input type="radio" v-model="reviewForm.decision" value="REJECTED" />
                    <span>拒绝加入</span>
                  </label>
                </div>
              </div>
            </template>
          </div>
          <div v-if="detailMode === 'review' && detailApplication?.status === 'PENDING'" class="rl-popup-footer">
            <button class="rl-popup-btn rl-popup-cancel" @click="closeApplicationDetail">取消</button>
            <button
              class="rl-popup-btn rl-popup-submit"
              :disabled="reviewSubmitting"
              @click="submitReview"
            >{{ reviewSubmitting ? '提交中...' : '提交' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.room-list-page {
  position: relative;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    radial-gradient(circle at bottom right, rgba(255, 255, 255, 0.04), transparent 18%),
    linear-gradient(180deg, #141414 0%, #101010 100%);
  color: #ddd;
  display: flex;
  flex-direction: column;
}

.rl-sticky-top {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    linear-gradient(180deg, #141414 0%, #121212 100%);
}

.rl-header {
  padding: 20px 28px;
}

.rl-header-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.rl-logo {
  height: 28px;
  width: auto;
  object-fit: contain;
  user-select: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
  position: absolute;
  left: 28px;
}

.rl-logo:hover {
  opacity: 0.7;
}

.rl-title {
  color: #f5f5f5;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 0;
}

.rl-header-actions {
  position: absolute;
  right: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.rl-action-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.rl-header-action-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;
}

.rl-header-action-btn svg {
  width: 18px;
  height: 18px;
}

.rl-header-action-btn:hover {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.rl-tooltip {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 10px;
  border-radius: 6px;
  background: #2a2a2a;
  color: #e0e0e0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 0.15s ease,
    visibility 0.15s ease;
}

.rl-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: #2a2a2a;
}

.rl-action-wrap:hover .rl-tooltip {
  opacity: 1;
  visibility: visible;
}

.rl-divider {
  height: 1px;
  background: #2a2a2a;
  margin: 0;
}

.rl-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  display: flex;
  justify-content: center;
  padding: 24px 20px;
}

.rl-body::-webkit-scrollbar {
  width: 6px;
}

.rl-body::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 999px;
}

.rl-body::-webkit-scrollbar-track {
  background: transparent;
}

.rl-body-inner {
  width: min(800px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 分类标签 */
.rl-category-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.rl-category-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid #3d3d3d;
  background: #1d1d1d;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.rl-category-tab:hover {
  border-color: #555;
  color: #eee;
}

.rl-category-tab.active {
  border-color: rgba(67, 242, 96, 0.5);
  background: rgba(67, 242, 96, 0.12);
  color: #43f260;
  font-weight: 600;
}

.rl-category-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.rl-category-tab.active .rl-category-count {
  background: rgba(67, 242, 96, 0.2);
}

.rl-toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.rl-search-bar {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.rl-search-icon {
  position: absolute;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #666;
  pointer-events: none;
}

.rl-search-input {
  width: 100%;
  padding: 10px 40px 10px 42px;
  border-radius: 10px;
  border: 1px solid #3d3d3d;
  background: #1d1d1d;
  color: #eee;
  font-size: 14px;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.rl-search-input::placeholder {
  color: #666;
}

.rl-search-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.rl-search-clear {
  position: absolute;
  right: 10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.rl-search-clear svg {
  width: 14px;
  height: 14px;
}

.rl-search-clear:hover {
  color: #fff;
  background: #333;
}

.rl-sort-bar {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.rl-sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 30px 10px 34px;
  border-radius: 10px;
  border: 1px solid #3d3d3d;
  background: #1d1d1d;
  color: #eee;
  font-size: 14px;
  outline: none;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  white-space: nowrap;
  position: relative;
}

.rl-sort-trigger:hover {
  border-color: #555;
}

.rl-sort-trigger:focus,
.rl-sort-bar:focus-within .rl-sort-trigger {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.rl-sort-icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: #666;
  pointer-events: none;
}

.rl-sort-label {
  color: #eee;
}

.rl-sort-arrow {
  color: #888;
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
}

.rl-sort-caret {
  position: absolute;
  right: 10px;
  width: 14px;
  height: 14px;
  color: #888;
  transition: transform 0.2s ease;
}

.rl-sort-caret.open {
  transform: rotate(180deg);
}

.rl-sort-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 100%;
  margin: 0;
  padding: 6px;
  list-style: none;
  border-radius: 10px;
  border: 1px solid #3d3d3d;
  background: #1d1d1d;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rl-sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
  white-space: nowrap;
}

.rl-sort-option:hover {
  background: #2a2a2a;
  color: #eee;
}

.rl-sort-option.active {
  background: rgba(67, 242, 96, 0.12);
  color: #43f260;
  font-weight: 600;
}

.rl-sort-option-label {
  line-height: 1;
}

.rl-sort-option-arrow {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  color: inherit;
}

.sort-fade-enter-active,
.sort-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.sort-fade-enter-from,
.sort-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.rl-loading,
.rl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 0;
  color: #666;
}

.rl-empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.4;
}

.rl-empty-text {
  font-size: 15px;
  color: #888;
}

.rl-loading {
  flex-direction: row;
}

.rl-loading-text {
  font-size: 14px;
  color: #888;
}

.rl-mini-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #43f260;
  border-radius: 50%;
  animation: rl-spin 0.8s linear infinite;
}

.rl-mini-spinner-sm {
  width: 16px;
  height: 16px;
  border-width: 2px;
}

.rl-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rl-card {
  display: flex;
  gap: 20px;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid #2e2e2e;
  background: linear-gradient(180deg, #1d1d1d 0%, #171717 100%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.rl-card:hover {
  border-color: #3d3d3d;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

/* 边框状态：离开（黄）优先于 打开（绿） */
.rl-card.is-left {
  border-color: rgba(255, 200, 60, 0.55);
  box-shadow:
    0 0 0 1px rgba(255, 200, 60, 0.15),
    0 8px 24px rgba(0, 0, 0, 0.25);
}

.rl-card.is-left:hover {
  border-color: rgba(255, 200, 60, 0.75);
  box-shadow:
    0 0 0 1px rgba(255, 200, 60, 0.2),
    0 12px 32px rgba(0, 0, 0, 0.35);
}

.rl-card.is-open {
  border-color: rgba(67, 242, 96, 0.55);
  box-shadow:
    0 0 0 1px rgba(67, 242, 96, 0.15),
    0 8px 24px rgba(0, 0, 0, 0.25);
}

.rl-card.is-open:hover {
  border-color: rgba(67, 242, 96, 0.75);
  box-shadow:
    0 0 0 1px rgba(67, 242, 96, 0.2),
    0 12px 32px rgba(0, 0, 0, 0.35);
}

.rl-card-thumb {
  width: 120px;
  height: 90px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #333;
  background: #1a1a1a;
  transition: border-color 0.2s;
}

.rl-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  background: linear-gradient(135deg, #1d1d1d 0%, #252525 100%);
}

.rl-thumb-placeholder svg {
  width: 40px;
  height: 40px;
}

/* 项目封面图 */
.rl-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.rl-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.rl-card-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.rl-card-info {
  flex: 1;
  min-width: 0;
}

.rl-card-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.rl-card-name {
  color: #f5f5f5;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rl-card-id {
  color: #666;
  font-size: 12px;
  font-family: monospace;
  flex-shrink: 0;
}

.rl-project-link-row {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  font-size: 13px;
  flex-wrap: wrap;
}

.rl-project-icon {
  width: 14px;
  height: 14px;
  color: #666;
  flex-shrink: 0;
}

.rl-project-label {
  color: #777;
  flex-shrink: 0;
}

.rl-project-name {
  color: #43f260;
  cursor: pointer;
  transition: color 0.15s ease;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: rgba(67, 242, 96, 0.3);
}

.rl-project-name:hover {
  color: #7bf58f;
  text-decoration-color: rgba(67, 242, 96, 0.6);
}

/* 状态标签 */
.rl-badge-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.rl-role-badge,
.rl-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
}

.rl-role-creator {
  background: rgba(67, 242, 96, 0.14);
  color: #6df586;
  border-color: rgba(67, 242, 96, 0.3);
}

.rl-role-editor {
  background: rgba(96, 165, 250, 0.14);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.3);
}

.rl-role-viewer {
  background: rgba(180, 180, 180, 0.12);
  color: #b0b0b0;
  border-color: rgba(180, 180, 180, 0.25);
}

.rl-status-badge.is-open {
  background: rgba(67, 242, 96, 0.1);
  color: #6df586;
  border-color: rgba(67, 242, 96, 0.25);
}

.rl-status-badge.is-closed {
  background: rgba(120, 120, 120, 0.1);
  color: #999;
  border-color: rgba(120, 120, 120, 0.2);
}

.rl-status-badge.is-left {
  background: rgba(140, 140, 140, 0.1);
  color: #999;
  border-color: rgba(140, 140, 140, 0.2);
}

.rl-status-badge.is-joined {
  background: rgba(67, 242, 96, 0.14);
  color: #6df586;
  border-color: rgba(67, 242, 96, 0.35);
}

.rl-status-badge.is-public {
  background: rgba(96, 165, 250, 0.12);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.3);
}

.rl-status-badge.is-private {
  background: rgba(150, 100, 200, 0.12);
  color: #c9a8e8;
  border-color: rgba(150, 100, 200, 0.3);
}

.rl-desc-text {
  color: #a0a0a0;
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  white-space: pre-line;
  overflow-wrap: break-word;
  word-break: break-all;
  cursor: default;
  width: 100%;
}

.rl-desc-placeholder {
  color: #666;
  font-style: italic;
}

.rl-desc-content {
  position: relative;
  width: 100%;
  font-size: 13px;
}

.rl-desc-content:not(.expanded) {
  max-height: calc(1.5em * 2);
  overflow: hidden;
}

.rl-desc-content:not(.expanded) .rl-desc-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
  min-width: 100%;
  -webkit-box-flex: 1;
}

.rl-desc-wrap {
  position: relative;
}

.rl-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.2s ease;
  margin-top: 4px;
}

.rl-toggle-btn:hover {
  color: #43f260;
}

.rl-toggle-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.rl-edit-input,
.rl-edit-textarea {
  background: #1a1a1a;
  border: 1px solid #43f260;
  border-radius: 6px;
  color: #f5f5f5;
  outline: none;
  padding: 2px 8px;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
  font-family: inherit;
  resize: none;
  box-sizing: border-box;
}

.rl-edit-textarea {
  word-break: break-all;
}

.rl-edit-wrap {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  flex: 1;
  min-width: 0;
}

.rl-edit-wrap .rl-edit-input,
.rl-edit-wrap .rl-edit-textarea {
  flex: 1;
  min-width: 0;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.icon-btn svg {
  width: 15px;
  height: 15px;
}

.icon-btn-edit {
  background: transparent;
  color: #999;
}

.icon-btn-edit:hover {
  background: #2d2d2d;
  color: #43f260;
}

.icon-btn-confirm {
  background: rgba(67, 242, 96, 0.12);
  color: #43f260;
}

.icon-btn-confirm:hover:not(:disabled) {
  background: rgba(67, 242, 96, 0.22);
}

.icon-btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn-cancel {
  background: rgba(255, 95, 95, 0.12);
  color: #ff6b6b;
}

.icon-btn-cancel:hover {
  background: rgba(255, 95, 95, 0.22);
}

.icon-btn-remove {
  background: transparent;
  color: #888;
  width: 24px;
  height: 24px;
}

.icon-btn-remove svg {
  width: 14px;
  height: 14px;
}

.icon-btn-remove:hover {
  background: rgba(255, 95, 95, 0.15);
  color: #ff6b6b;
}

/* 转让房间按钮 */
.icon-btn-transfer {
  background: transparent;
  color: #888;
  width: 24px;
  height: 24px;
}

.icon-btn-transfer svg {
  width: 14px;
  height: 14px;
}

.icon-btn-transfer:hover {
  background: rgba(96, 165, 250, 0.15);
  color: #8db8f5;
}

.rl-edit-check {
  width: 22px;
  height: 1.5em;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #555;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  padding: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;
  margin-left: 4px;
}

.rl-edit-check svg {
  width: 14px;
  height: 14px;
}

.rl-edit-check.changed {
  color: #43f260;
  cursor: pointer;
}

.rl-edit-check.changed:hover {
  color: #8df2a0;
}

.rl-edit-name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.rl-edit-textarea {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
}

.rl-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.rl-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.rl-action-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* 进行中的按钮（加入中/离开中/打开中/关闭中）：禁用交互并降低透明度，
   避免连击重复触发请求导致状态错乱 */
.rl-action-btn:disabled,
.rl-confirm-inline button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.rl-action-btn:disabled:hover,
.rl-confirm-inline button:disabled:hover {
  background: #252525;
  border-color: #3d3d3d;
}

.rl-leave-btn {
  border-color: rgba(255, 200, 60, 0.25);
  color: #ffcc66;
}

.rl-leave-btn:hover {
  background: rgba(255, 200, 60, 0.1);
  border-color: rgba(255, 200, 60, 0.5);
}

.rl-join-btn {
  border-color: rgba(67, 242, 96, 0.3);
  color: #8df2a0;
}

.rl-join-btn:hover {
  background: rgba(67, 242, 96, 0.1);
  border-color: rgba(67, 242, 96, 0.5);
}

.rl-open-btn.is-open {
  border-color: rgba(67, 242, 96, 0.3);
  color: #8df2a0;
}

.rl-open-btn.is-open:hover {
  background: rgba(67, 242, 96, 0.1);
  border-color: rgba(67, 242, 96, 0.5);
}

.rl-open-btn.is-closed {
  border-color: rgba(120, 120, 120, 0.25);
  color: #aaa;
}

.rl-open-btn.is-closed:hover {
  background: rgba(120, 120, 120, 0.1);
  border-color: rgba(120, 120, 120, 0.5);
}

.rl-delete-btn {
  border-color: rgba(255, 95, 95, 0.25);
  color: #ff9999;
}

.rl-delete-btn:hover {
  background: rgba(255, 95, 95, 0.1);
  border-color: rgba(255, 95, 95, 0.5);
}

.rl-confirm-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 200, 60, 0.4);
  background: rgba(255, 200, 60, 0.08);
}

.rl-confirm-inline.rl-confirm-danger {
  border-color: rgba(255, 95, 95, 0.4);
  background: rgba(255, 95, 95, 0.08);
}

.rl-confirm-text {
  color: #ffb0b0;
  font-size: 12px;
  white-space: nowrap;
}

.rl-confirm-inline:not(.rl-confirm-danger) .rl-confirm-text {
  color: #ffcc66;
}

.rl-confirm-text-inline {
  margin-left: 4px;
}

.rl-confirm-yes,
.rl-confirm-no {
  padding: 3px 10px;
  border-radius: 4px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.rl-confirm-yes {
  background: #e04040;
  color: #fff;
}

.rl-confirm-inline:not(.rl-confirm-danger) .rl-confirm-yes {
  background: #d9a23a;
}

.rl-confirm-yes:hover {
  opacity: 0.85;
}

.rl-confirm-no {
  background: #333;
  color: #ccc;
  border: 1px solid #444;
}

.rl-confirm-no:hover {
  background: #3d3d3d;
}

.rl-confirm-mini {
  padding: 2px 8px;
  font-size: 11px;
}

.rl-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: #888;
  font-size: 12px;
}

/* 创建者专属设置行：公开开关 + 人数上限 */
.rl-card-settings {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(67, 242, 96, 0.05);
  border: 1px solid rgba(67, 242, 96, 0.12);
}

.rl-setting-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.rl-setting-label {
  color: #aaa;
  font-size: 12px;
  font-weight: 600;
}

.rl-setting-value {
  color: #777;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.rl-setting-value.is-on {
  color: #43f260;
}

.rl-setting-sep {
  width: 1px;
  height: 14px;
  background: #333;
}

/* 开关 */
.rl-switch {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 10px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  cursor: pointer;
  padding: 0;
  transition:
    background 0.18s ease,
    border-color 0.18s ease;
  flex-shrink: 0;
}

.rl-switch.is-on {
  background: rgba(67, 242, 96, 0.25);
  border-color: rgba(67, 242, 96, 0.55);
}

.rl-switch-knob {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #888;
  transition:
    transform 0.18s ease,
    background 0.18s ease;
}

.rl-switch.is-on .rl-switch-knob {
  transform: translateX(16px);
  background: #43f260;
}

/* 人数上限输入框 */
.rl-max-input {
  width: 56px;
  height: 24px;
  padding: 0 6px;
  border-radius: 6px;
  border: 1px solid #3a3a3a;
  background: #1d1d1d;
  color: #ddd;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  outline: none;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.rl-max-input::-webkit-inner-spin-button,
.rl-max-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.rl-max-input:focus {
  border-color: rgba(67, 242, 96, 0.55);
  background: #222;
}

.rl-max-input:hover {
  border-color: #4a4a4a;
}

.rl-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rl-meta-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.6;
}

.rl-meta-sep {
  color: #444;
}

/* 成员管理 / 权限管理 折叠区域 */
.rl-member-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  border-top: 1px dashed #2a2a2a;
  padding-top: 10px;
}

.rl-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
  user-select: none;
}

.rl-section-header:hover {
  background: #232323;
}

.rl-section-header-gap {
  margin-top: 4px;
}

.rl-section-caret {
  width: 14px;
  height: 14px;
  color: #888;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.rl-section-caret.expanded {
  transform: rotate(90deg);
}

.rl-section-title {
  color: #ddd;
  font-size: 13px;
  font-weight: 600;
}

.rl-section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.rl-section-body {
  padding: 6px 4px 4px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rl-section-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  color: #888;
  font-size: 13px;
}

.rl-section-empty {
  padding: 12px 0;
  color: #666;
  font-size: 13px;
  text-align: center;
}

/* 成员搜索框：展开时唤起 */
.rl-member-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.rl-member-search-icon {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: #666;
  pointer-events: none;
}

.rl-member-search-input {
  width: 100%;
  padding: 6px 30px 6px 30px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #1a1a1a;
  color: #eee;
  font-size: 12px;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.rl-member-search-input::placeholder {
  color: #666;
}

.rl-member-search-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.rl-member-search-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.rl-member-search-clear svg {
  width: 12px;
  height: 12px;
}

.rl-member-search-clear:hover {
  color: #fff;
  background: #333;
}

/* 成员 / 权限网格：流式布局，一行尽量多放 */
.rl-member-grid,
.rl-perm-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 6px;
}

/* 成员卡片：紧凑 chip 风格（pill 形） */
.rl-member-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 3px;
  border-radius: 999px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  transition: border-color 0.15s ease;
  max-width: 100%;
}

.rl-member-card:hover {
  border-color: #3a3a3a;
}

/* 权限卡片：含 select，用圆角矩形 */
.rl-perm-card {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 5px 3px 3px;
  border-radius: 8px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  transition: border-color 0.15s ease;
}

.rl-perm-card:hover {
  border-color: #3a3a3a;
}

.rl-member-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
}

.rl-member-avatar-sm {
  width: 22px;
  height: 22px;
}

.rl-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rl-avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9cf0ad;
  font-size: 12px;
  font-weight: 700;
}

.rl-member-name {
  color: #e0e0e0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.rl-member-role {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}

.rl-perm-name {
  color: #e0e0e0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}

.rl-perm-select {
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid #3d3d3d;
  background: #1d1d1d;
  color: #eee;
  font-size: 11px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s ease;
  flex-shrink: 0;
}

.rl-perm-select:hover {
  border-color: #555;
}

.rl-perm-select:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.rl-perm-select option {
  background: #1d1d1d;
  color: #eee;
}

.rl-perm-toggles {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}
.rl-perm-toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: #c0c0c0;
  cursor: pointer;
}
.rl-perm-toggle-label {
  flex: 1;
}
.rl-perm-toggle-item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #43f260;
}
.rl-perm-toggle-select select {
  background: #252525;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  color: #ececec;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
/* 「禁用导入」的子设置：左缩进 + 引导线，体现从属层级 */
.rl-perm-sub {
  margin-left: 12px;
  padding-left: 10px;
  border-left: 2px solid #3a3a3a;
  font-size: 12px;
  color: #a8a8a8;
}
.rl-perm-sub select {
  padding: 3px 6px;
}

.section-fade-enter-active,
.section-fade-leave-active {
  transition:
    opacity 0.15s ease,
    max-height 0.2s ease;
  overflow: hidden;
}

.section-fade-enter-from,
.section-fade-leave-to {
  opacity: 0;
  max-height: 0;
}

.section-fade-enter-to,
.section-fade-leave-from {
  max-height: 600px;
}

.rl-sticky-bottom {
  flex-shrink: 0;
  background: linear-gradient(180deg, #121212 0%, #141414 100%);
  border-top: 1px solid #2a2a2a;
  padding: 12px 28px;
}

.rl-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 800px;
  margin: 0 auto;
}

.rl-page-size {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rl-page-size-label {
  color: #888;
  font-size: 13px;
}

.rl-page-size-options {
  display: flex;
  gap: 4px;
}

.rl-page-size-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rl-page-size-btn:hover {
  border-color: #555;
  background: #2d2d2d;
}

.rl-page-size-btn.active {
  border-color: rgba(67, 242, 96, 0.5);
  background: rgba(67, 242, 96, 0.12);
  color: #43f260;
  font-weight: 600;
}

.rl-page-center {
  display: flex;
  align-items: center;
}

.rl-total-count {
  color: #888;
  font-size: 13px;
}

.rl-total-num {
  color: #43f260;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.rl-page-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rl-page-nav {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
}

.rl-page-nav svg {
  width: 16px;
  height: 16px;
}

.rl-page-nav:hover:not(:disabled) {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
}

.rl-page-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.rl-page-text {
  color: #ccc;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
}

@keyframes rl-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 转让房间二次确认弹窗 */
.rl-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.rl-modal {
  width: 100%;
  max-width: 420px;
  border-radius: 16px;
  border: 1px solid #3d3d3d;
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.rl-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a2a;
}

.rl-modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rl-modal-icon {
  width: 20px;
  height: 20px;
  color: #8db8f5;
  flex-shrink: 0;
}

.rl-modal-title {
  margin: 0;
  color: #f5f5f5;
  font-size: 16px;
  font-weight: 700;
}

.rl-modal-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.rl-modal-close svg {
  width: 16px;
  height: 16px;
}

.rl-modal-close:hover {
  color: #fff;
  background: #2d2d2d;
}

.rl-modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rl-modal-text {
  margin: 0;
  color: #ddd;
  font-size: 14px;
  line-height: 1.6;
}

.rl-modal-highlight {
  color: #8db8f5;
  font-weight: 700;
}

.rl-modal-warn {
  margin: 0;
  color: #ffcc66;
  font-size: 12px;
  line-height: 1.6;
  background: rgba(255, 200, 60, 0.08);
  border: 1px solid rgba(255, 200, 60, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
}

.rl-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #2a2a2a;
}

.rl-modal-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ddd;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.rl-modal-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.rl-modal-cancel:hover:not(:disabled) {
  border-color: #555;
  background: #2d2d2d;
}

.rl-modal-confirm {
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(96, 165, 250, 0.12);
  color: #8db8f5;
}

.rl-modal-confirm:hover:not(:disabled) {
  border-color: rgba(96, 165, 250, 0.7);
  background: rgba(96, 165, 250, 0.22);
  color: #a8c8f7;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-active .rl-modal,
.modal-fade-leave-active .rl-modal {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-fade-enter-from .rl-modal,
.modal-fade-leave-to .rl-modal {
  transform: scale(0.95) translateY(-8px);
  opacity: 0;
}

/* 回到顶部悬浮按钮 */
.rl-back-to-top {
  position: fixed;
  right: 28px;
  bottom: 80px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(67, 242, 96, 0.4);
  background: linear-gradient(180deg, #2a2a2a 0%, #1d1d1d 100%);
  color: #43f260;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(67, 242, 96, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
  z-index: 50;
}

.rl-back-to-top svg {
  width: 20px;
  height: 20px;
}

.rl-back-to-top:hover {
  transform: translateY(-2px);
  border-color: rgba(67, 242, 96, 0.7);
  color: #8df2a0;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(67, 242, 96, 0.18);
}

.rl-back-to-top:active {
  transform: translateY(0);
}

.backtop-fade-enter-active,
.backtop-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.backtop-fade-enter-from,
.backtop-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 640px) {
  .rl-header {
    padding: 16px;
  }

  .rl-logo {
    height: 22px;
    left: 16px;
  }

  .rl-title {
    font-size: 17px;
  }

  .rl-header-actions {
    right: 16px;
    gap: 6px;
  }

  .rl-header-action-btn {
    width: 32px;
    height: 32px;
  }

  .rl-header-action-btn svg {
    width: 16px;
    height: 16px;
  }

  .rl-tooltip {
    display: none;
  }

  .rl-body {
    padding: 16px 12px;
  }

  .rl-category-tabs {
    gap: 6px;
  }

  .rl-category-tab {
    padding: 6px 10px;
    font-size: 12px;
  }

  .rl-search-input {
    font-size: 16px;
    padding: 9px 36px 9px 38px;
  }

  .rl-card {
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }

  .rl-card-thumb {
    width: 100%;
    height: 140px;
  }

  .rl-card-meta {
    gap: 4px;
  }

  .rl-meta-sep {
    display: inline;
  }

  .rl-member-name {
    max-width: 80px;
  }

  .rl-perm-name {
    max-width: 64px;
  }

  .rl-sticky-bottom {
    padding: 10px 16px;
  }

  .rl-pagination {
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  .rl-back-to-top {
    right: 16px;
    bottom: 150px;
    width: 40px;
    height: 40px;
  }

  .rl-back-to-top svg {
    width: 18px;
    height: 18px;
  }
}

/* ==================== 审批相关样式 ==================== */

/* 角标红点 */
.rl-badge-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  border-radius: 9px;
  pointer-events: none;
}

/* 审批状态标签 */
.rl-status-badge.is-approval {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.3);
}
.rl-status-badge.is-no-approval {
  background: rgba(96, 165, 250, 0.12);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.3);
}

/* ---- 浮窗通用（深色主题，与 .rl-modal 一致） ---- */
.rl-popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}
.rl-popup-box {
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  border: 1px solid #3d3d3d;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rl-approval-popup {
  width: 520px;
  max-width: 100%;
}
.rl-detail-popup {
  width: 480px;
  max-width: 100%;
}

.rl-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a2a;
}
.rl-popup-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  color: #f5f5f5;
}
.rl-popup-close {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s ease;
}
.rl-popup-close:hover {
  color: #f5f5f5;
}
.rl-popup-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  /* 自定义滚动条样式（灰色） */
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 140, 140, 0.4) transparent;
}
.rl-popup-body::-webkit-scrollbar {
  width: 6px;
}
.rl-popup-body::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}
.rl-popup-body::-webkit-scrollbar-thumb {
  background: rgba(140, 140, 140, 0.35);
  border-radius: 3px;
  transition: background 0.2s;
}
.rl-popup-body::-webkit-scrollbar-thumb:hover {
  background: rgba(140, 140, 140, 0.55);
}
.rl-popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #2a2a2a;
}
.rl-popup-btn {
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.rl-popup-cancel {
  background: #2a2a2a;
  color: #aaa;
}
.rl-popup-cancel:hover {
  background: #333;
}
.rl-popup-submit {
  background: #43f260;
  color: #0a1a0f;
}
.rl-popup-submit:hover:not(:disabled) {
  background: #5cf87a;
}
.rl-popup-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ---- 表单 ---- */
.rl-popup-room-name {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
}
.rl-form-group {
  margin-bottom: 14px;
}
.rl-form-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #b0b0b0;
  margin-bottom: 6px;
}
.rl-form-required {
  color: #ef4444;
}
.rl-form-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  font-size: 14px;
  color: #e0e0e0;
  background: #1a1a1a;
  box-sizing: border-box;
}
.rl-form-input:focus {
  outline: none;
  border-color: #43f260;
  box-shadow: 0 0 0 3px rgba(67, 242, 96, 0.1);
}
.rl-form-readonly {
  background: rgba(255, 255, 255, 0.03);
  color: #777;
  cursor: not-allowed;
}
.rl-form-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  font-size: 14px;
  color: #e0e0e0;
  background: #1a1a1a;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}
.rl-form-textarea:focus {
  outline: none;
  border-color: #43f260;
  box-shadow: 0 0 0 3px rgba(67, 242, 96, 0.1);
}

/* ---- 审批列表 ---- */
.rl-approval-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid #2a2a2a;
}
.rl-approval-tab {
  display: inline-flex;
  align-items: center;
  position: relative;
  padding: 8px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  font-weight: 600;
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}
.rl-approval-tab.active {
  color: #43f260;
  border-bottom-color: #43f260;
}
.rl-tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  margin-left: 6px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  border-radius: 9px;
}

.rl-filter-row {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.rl-filter-btn {
  padding: 4px 12px;
  background: #2a2a2a;
  border: 1px solid #3d3d3d;
  border-radius: 16px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
  transition: all 0.2s;
}
.rl-filter-btn.active {
  background: #43f260;
  color: #0a1a0f;
  border-color: #43f260;
}

.rl-approval-list {
  max-height: 400px;
  overflow-y: auto;
  /* 自定义滚动条样式（灰色） */
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 140, 140, 0.4) transparent;
}
.rl-approval-list::-webkit-scrollbar {
  width: 6px;
}
.rl-approval-list::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}
.rl-approval-list::-webkit-scrollbar-thumb {
  background: rgba(140, 140, 140, 0.35);
  border-radius: 3px;
  transition: background 0.2s;
}
.rl-approval-list::-webkit-scrollbar-thumb:hover {
  background: rgba(140, 140, 140, 0.55);
}
.rl-approval-empty {
  text-align: center;
  color: #666;
  font-size: 14px;
  padding: 40px 0;
}
.rl-approval-item {
  position: relative;
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  border: 1px solid #2a2a2a;
  margin-bottom: 6px;
}
.rl-approval-item:hover {
  background: rgba(255, 255, 255, 0.04);
}
.rl-approval-item.is-unread {
  background: rgba(67, 242, 96, 0.08);
  border-color: rgba(67, 242, 96, 0.25);
}
.rl-approval-item-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.rl-approval-room {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.rl-approval-status {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;
}
.rl-approval-status.is-pending {
  background: rgba(251, 191, 36, 0.14);
  color: #fbbf24;
}
.rl-approval-status.is-approved {
  background: rgba(67, 242, 96, 0.14);
  color: #6df586;
}
.rl-approval-status.is-rejected {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
}
.rl-approval-status.is-revoked {
  background: rgba(168, 85, 247, 0.14);
  color: #c084fc;
}
/* 已过期标签：批准后被移除时显示 */
.rl-expired-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(168, 85, 247, 0.14);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.3);
}
/* 已读/未读标签 */
.rl-approval-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.rl-read-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  border: 1px solid transparent;
}
.rl-read-tag.is-read {
  background: rgba(67, 242, 96, 0.12);
  color: #6df586;
  border-color: rgba(67, 242, 96, 0.25);
}
.rl-read-tag.is-unread {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.25);
}
.rl-approval-item-meta {
  font-size: 12px;
  color: #888;
  display: flex;
  gap: 6px;
  align-items: center;
}
.rl-unread-dot {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
}

/* ---- 详情/审核 ---- */
.rl-detail-section {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
}
.rl-detail-row {
  display: flex;
  padding: 4px 0;
  font-size: 13px;
}
.rl-detail-label {
  width: 80px;
  flex-shrink: 0;
  color: #888;
  font-weight: 600;
}
.rl-detail-value {
  color: #e0e0e0;
  flex: 1;
  word-break: break-all;
}
/* 详情行中多个标签的间距 */
.rl-detail-value .rl-read-tag {
  margin-left: 6px;
}
/* 详情行中快捷加入链接（文字链接样式，与旁边标签颜色区分） */
.rl-detail-join-btn {
  margin-left: 8px;
  padding: 0;
  border: none;
  background: transparent;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.2s;
}
.rl-detail-join-btn:hover:not(:disabled) {
  color: #60a5fa;
  text-decoration: underline;
}
.rl-detail-join-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.rl-review-form {
  background: rgba(251, 191, 36, 0.06);
  border: 1px solid rgba(251, 191, 36, 0.2);
}
.rl-review-decision {
  display: flex;
  gap: 20px;
  margin-top: 8px;
}
.rl-radio-item {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #e0e0e0;
}

/* ---- 浮窗过渡动画 ---- */
.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: opacity 0.2s ease;
}
.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
}
.popup-fade-enter-active .rl-popup-box,
.popup-fade-leave-active .rl-popup-box {
  transition: transform 0.2s ease;
}
.popup-fade-enter-from .rl-popup-box,
.popup-fade-leave-to .rl-popup-box {
  transform: scale(0.96);
}
</style>
