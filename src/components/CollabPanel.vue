<!-- src/components/CollabPanel.vue -->
<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useCollabStore } from '@/store/collabStore'
import { useAuthStore } from '@/store/authStore'
import { roomApi } from '@/api/room'
import { projectApi } from '@/api/project'
import { ApiError } from '@/api/client'
import type { Room, RoomDetail, RoomMember, RoomRole, ApplicationRole, RoomApplication } from '@/types/room'
import { getMemberJoinedTime } from '@/types/room'
import type { Project } from '@/types/project'
import { validateSerializedScene } from '@/core/editor/SceneSerializer'
import ProxiedImage from '@/components/ProxiedImage.vue'
import { patchObject, mergeArrayById } from '@/utils/reactiveMerge'
import { collabRoomEvents, type CollabRoomEvent } from '@/utils/collabRoomEvents'

defineOptions({ name: 'CollabPanel' })

const props = defineProps<{
  dialogOpen: boolean
  panelOpen: boolean
  triggerEl: HTMLElement | null
  currentProjectId?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:dialogOpen', value: boolean): void
  (e: 'update:panelOpen', value: boolean): void
  (e: 'join', data: { roomId: string; room: Room; wsUrl: string; ticket: string }): void
  (e: 'leave'): void
  (e: 'room-closed'): void
  (e: 'project-created', projectId: string): void
}>()

const router = useRouter()
const collabStore = useCollabStore()
const authStore = useAuthStore()
const { currentRoom, isConnected, peerCount } = storeToRefs(collabStore)
const { user } = storeToRefs(authStore)

// ---- 对话框状态 ----
type CollabMode = 'create' | 'join'
type JoinSubTab = 'search' | 'url' | 'hall'

const mode = ref<CollabMode>('create')
const joinSubTab = ref<JoinSubTab>('search')
const isSubmitting = ref(false)
const errorMessage = ref('')

// 创建表单
const createForm = ref({
  name: '',
  description: '',
  isPublic: false,
  maxMembers: 10,
  // 关联项目（可选）：选择已有项目或导入场景文件
  projectId: '' as string,
  projectName: '' as string,
})

// 项目选择
const myProjects = ref<Project[]>([])
const projectsLoading = ref(false)
const projectDropdownOpen = ref(false)

// 场景文件导入（预导入）
const importedSceneFile = ref<File | null>(null)
const importedSceneName = ref('')

// 房间名称合法性错误（实时）
const roomNameError = ref('')
// 人数上限合法性错误（实时）
const maxMembersError = ref('')

// 人数上限气泡浮窗（参考 SideBar 的 length-bubble-fixed 样式）
const maxMembersBubble = ref<{
  show: boolean
  message: string
  x: number
  y: number
  below: boolean
}>({
  show: false,
  message: '',
  x: 0,
  y: 0,
  below: false,
})
let maxMembersBubbleTimer: ReturnType<typeof setTimeout> | null = null
const maxMembersInputRef = ref<HTMLInputElement | null>(null)

const showMaxMembersBubble = (message: string) => {
  const input = maxMembersInputRef.value
  if (!input) return
  const rect = input.getBoundingClientRect()
  // 估算气泡宽度（中文约 14px，英文约 7px，padding 20px），上限 300px
  const cjkCount = Array.from(message).filter((ch) => ch.charCodeAt(0) > 0x2e7f).length
  const asciiCount = message.length - cjkCount
  const estimatedWidth = Math.min(300, cjkCount * 14 + asciiCount * 7 + 20)
  const halfWidth = estimatedWidth / 2
  const viewW = window.innerWidth
  const clampX = (rawX: number) => {
    if (rawX + halfWidth > viewW - 8) return viewW - halfWidth - 8
    if (rawX - halfWidth < 8) return halfWidth + 8
    return rawX
  }
  const x = clampX(rect.left + rect.width / 2)
  let below = false
  let y = rect.top - 6
  if (rect.top < 40) {
    y = rect.bottom + 6
    below = true
  }
  maxMembersBubble.value = { show: true, message, x, y, below }
  if (maxMembersBubbleTimer) clearTimeout(maxMembersBubbleTimer)
  maxMembersBubbleTimer = setTimeout(() => {
    maxMembersBubble.value.show = false
    maxMembersBubbleTimer = null
  }, 3000)
}

const hideMaxMembersBubble = () => {
  if (maxMembersBubbleTimer) {
    clearTimeout(maxMembersBubbleTimer)
    maxMembersBubbleTimer = null
  }
  maxMembersBubble.value.show = false
}

// 搜索表单（合并为单个关键字输入）
const searchKeyword = ref('')
const searchResults = ref<Room[]>([])
const hasSearched = ref(false)

// URL 加入
const urlInput = ref('')

// 协作大厅推荐
const recommendedRooms = ref<Room[]>([])
const recommendedLoading = ref(false)

// 选中的房间（搜索结果 / 大厅推荐中选择）
const selectedRoomId = ref<string | null>(null)

// ---- 申请状态跟踪（实时同步"正在审核..."按钮）----
// 按 roomId 索引当前用户最新一条申请记录
const myApplicationsByRoom = ref<Map<string, RoomApplication>>(new Map())

// ---- 用户已加入的房间 ID 集合 ----
// 房间列表中有记录的房间代表用户已有权限进入，无需再申请加入
const joinedRoomIds = ref<Set<string>>(new Set())

const loadJoinedRoomIds = async () => {
  try {
    const myRooms = await roomApi.getMyRooms()
    joinedRoomIds.value = new Set(myRooms.map((r) => r.id))
  } catch {
    // 静默
  }
}

// 判断用户是否已是该房间成员（有权限直接加入）
const isRoomMember = (roomId: string) => joinedRoomIds.value.has(roomId)

// 清除 localStorage 中的已移除房间标记（加入房间后调用，使房间列表重新显示该房间）
const clearRemovedRoomFromStorage = (roomId: string) => {
  const uid = authStore.user?.id || 'anonymous'
  const key = `collab:removed_rooms:${uid}`
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return
    const arr = JSON.parse(raw) as string[]
    if (!Array.isArray(arr) || !arr.includes(roomId)) return
    localStorage.setItem(key, JSON.stringify(arr.filter((id) => id !== roomId)))
  } catch {
    // ignore
  }
}

const loadMyApplicationsStatus = async () => {
  try {
    const apps = await roomApi.getMyApplications()
    const map = new Map<string, RoomApplication>()
    const sorted = [...apps].sort((a, b) =>
      new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    )
    for (const app of sorted) {
      if (!map.has(app.roomId)) map.set(app.roomId, app)
    }
    myApplicationsByRoom.value = map
  } catch {
    // 静默
  }
}

// 获取选中房间的申请状态
const selectedRoomAppStatus = computed<'none' | 'pending' | 'approved' | 'rejected'>(() => {
  if (!selectedRoom.value) return 'none'
  const app = myApplicationsByRoom.value.get(selectedRoom.value.id)
  if (!app) return 'none'
  return app.status.toLowerCase() as 'pending' | 'approved' | 'rejected'
})

// ---- 管理面板状态 ----
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
// 转让确认弹窗遮罩：使用 fixed 定位 + 动态计算面板可视区域 rect，
// 避免面板滚动时遮罩/弹窗偏离可视区域
const transferMaskStyle = ref<Record<string, string>>({})
const roomDetail = ref<RoomDetail | null>(null)
const detailLoading = ref(false)
const copySuccess = ref(false)

// 成员管理（仅创建者可用，参考 RoomListView）
const removeMemberConfirm = ref<string | null>(null) // 待确认移除的 userId
const transferConfirm = ref<RoomMember | null>(null)
const transferLoading = ref(false)

// 房间描述展开/收起状态
const descExpanded = ref(false)
// 房间描述是否溢出（超过2行），用于控制展开/收起按钮的显示
const descOverflow = ref(false)
const descRef = ref<HTMLElement | null>(null)

const checkDescOverflow = () => {
  const el = descRef.value
  if (!el) {
    descOverflow.value = false
    return
  }
  // 比较 scrollHeight 和 clientHeight，超过则说明内容被截断（超过2行）
  descOverflow.value = el.scrollHeight > el.clientHeight + 1
}

// 成员列表展开/收起状态（默认收起，最多展示 4 个成员卡片）
const membersExpanded = ref(false)
const MEMBERS_COLLAPSED_LIMIT = 4

// ---- 计算属性 ----
const selectedRoomNeedsApproval = computed(() => {
  if (mode.value !== 'join' || !selectedRoom.value) return false
  // 创建者本人无需申请
  if (selectedRoom.value.ownerId === user.value?.id) return false
  // 已是房间成员（房间列表中有记录）→ 有权限直接加入，无需申请
  if (isRoomMember(selectedRoom.value.id)) return false
  return selectedRoom.value.approvalRequired === true
})
// 选中房间是否正在审核中
const selectedRoomUnderReview = computed(() =>
  selectedRoomNeedsApproval.value && selectedRoomAppStatus.value === 'pending',
)
// 选中房间是否已被批准（可直接加入）
const selectedRoomApproved = computed(() =>
  selectedRoomNeedsApproval.value && selectedRoomAppStatus.value === 'approved',
)
const confirmLabel = computed(() => {
  if (isSubmitting.value) return '处理中...'
  if (mode.value === 'create') return '创建并加入'
  if (joinSubTab.value === 'url') return '加入房间'
  if (joinSubTab.value === 'search') {
    if (!hasSearched.value) return '搜索房间'
    if (!selectedRoomId.value) return '请选择房间'
    if (selectedRoomUnderReview.value) return '正在审核...'
    if (selectedRoomApproved.value) return '加入房间'
    return selectedRoomNeedsApproval.value ? '申请加入' : '加入房间'
  }
  // hall
  if (!selectedRoomId.value) return '请选择房间'
  if (selectedRoomUnderReview.value) return '正在审核...'
  if (selectedRoomApproved.value) return '加入房间'
  return selectedRoomNeedsApproval.value ? '申请加入' : '加入房间'
})

const canConfirm = computed(() => {
  if (isSubmitting.value) return false
  if (mode.value === 'create') {
    return createForm.value.name.trim().length > 0 && !roomNameError.value && !maxMembersError.value
  }
  if (joinSubTab.value === 'url') {
    return urlInput.value.trim().length > 0
  }
  if (joinSubTab.value === 'search') {
    // 未搜索时有关键字即可触发搜索，搜索后需选中房间才能加入
    if (!hasSearched.value) {
      return searchKeyword.value.trim().length > 0
    }
    // 正在审核中：按钮不可点击
    if (selectedRoomUnderReview.value) return false
    return !!selectedRoomId.value
  }
  // hall
  if (selectedRoomUnderReview.value) return false
  return !!selectedRoomId.value
})

const selectedRoom = computed(() => {
  if (mode.value !== 'join') return null
  if (joinSubTab.value === 'search') {
    return searchResults.value.find((r) => r.id === selectedRoomId.value) || null
  }
  if (joinSubTab.value === 'hall') {
    return recommendedRooms.value.find((r) => r.id === selectedRoomId.value) || null
  }
  return null
})

// 当前用户是否为房间创建者
const isRoomCreator = computed(() => {
  if (!currentRoom.value) return false
  return currentRoom.value.myRole === 'creator'
})

// 创建者头像（若当前用户是创建者则使用 authStore 中的头像）
const creatorAvatarUrl = computed(() => {
  if (!currentRoom.value) return null
  if (isRoomCreator.value) return user.value?.avatarUrl || null
  // 从 roomDetail 获取
  const creator = roomDetail.value?.members.find((m) => m.role === 'creator')
  return creator?.avatarUrl || null
})

const creatorDisplayName = computed(() => {
  if (!currentRoom.value) return ''
  if (isRoomCreator.value) {
    return user.value?.nickname || user.value?.username || '我'
  }
  return currentRoom.value.ownerName || '未知'
})

const creatorInitial = computed(() => {
  const name = creatorDisplayName.value.trim()
  return name ? name.slice(0, 1).toUpperCase() : 'U'
})

// 当前角色徽章文本
const myRoleLabel = computed(() => {
  if (!currentRoom.value) return ''
  if (currentRoom.value.myRole === 'creator') return '由我创建'
  if (currentRoom.value.myRole === 'editor') return '可编辑'
  return '仅观看'
})

/**
 * 成员列表排序：在线优先 → 权限高的优先 → 加入时间早的优先。
 *
 * 1) 在线（isOnline）优先：在线成员始终排在离线成员之前
 * 2) 权限：creator > editor > viewer
 * 3) 加入时间：早的在前（取「上一次加入时间」，缺失时回退首次加入时间）
 *
 * 创建者不再被强制置顶——它在「权限高的优先」这一档中自然领先，
 * 但当其离线而他人在线时，会按规则排到在线成员之后（符合「在线优先」的语义）。
 * 各档位均以显式比较实现，不依赖 sort 稳定性对原始顺序的偶然依赖。
 */
const ROLE_WEIGHT: Record<RoomRole, number> = {
  creator: 0,
  editor: 1,
  viewer: 2,
}

const allMembers = computed<RoomMember[]>(() => {
  const members = roomDetail.value?.members ?? []
  return [...members].sort((a, b) => {
    // 1. 在线优先
    const aOnline = a.isOnline ? 0 : 1
    const bOnline = b.isOnline ? 0 : 1
    if (aOnline !== bOnline) return aOnline - bOnline

    // 2. 权限高的优先
    const roleDiff = ROLE_WEIGHT[a.role] - ROLE_WEIGHT[b.role]
    if (roleDiff !== 0) return roleDiff

    // 3. 加入时间早的优先；时间相同或都无效时用 userId 兜底，保证结果稳定可预期
    const aTime = new Date(getMemberJoinedTime(a)).getTime()
    const bTime = new Date(getMemberJoinedTime(b)).getTime()
    const aValid = Number.isFinite(aTime)
    const bValid = Number.isFinite(bTime)
    if (aValid && bValid && aTime !== bTime) return aTime - bTime
    if (aValid !== bValid) return aValid ? -1 : 1
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0
  })
})
const hasMoreMembers = computed(() => allMembers.value.length > MEMBERS_COLLAPSED_LIMIT)
const visibleMembers = computed(() => {
  if (membersExpanded.value || !hasMoreMembers.value) return allMembers.value
  return allMembers.value.slice(0, MEMBERS_COLLAPSED_LIMIT)
})

// 判断成员是否为当前用户：优先用真实用户 ID 匹配，兼容后端返回 'me' 标识的情况
const isMeMember = (member: RoomMember) =>
  member.userId === 'me' || (!!user.value?.id && member.userId === user.value.id)

// 获取成员展示头像：'me' 成员使用 authStore 中当前用户的头像
const getMemberAvatar = (member: RoomMember): string | null => {
  if (isMeMember(member)) return user.value?.avatarUrl || null
  return member.avatarUrl
}

// 获取成员展示名称：'me' 成员使用 authStore 中当前用户的昵称/用户名
const getMemberName = (member: RoomMember): string => {
  if (isMeMember(member)) {
    return user.value?.nickname || user.value?.username || '我'
  }
  return member.nickname || member.username
}

const getMemberTooltip = (member: RoomMember): string => {
  const suffix = member.userId.slice(-8)
  const members = roomDetail.value?.members ?? []
  const suffixCount = members.filter((m) => m.userId.slice(-8) === suffix).length
  return suffixCount > 1
    ? `${member.username} · ID 后8位存在重复`
    : `${member.username} · ID ${suffix}`
}

/**
 * 格式化成员的加入时间：1小时内显示"刚刚/X分钟前"，1天内显示小时，30天内显示天数，否则显示日期。
 * 入参为「上一次加入时间」（lastJoinedAt），缺失时回退首次加入时间（joinedAt）。
 */
const formatJoinedTime = (member: RoomMember): string => {
  const iso = getMemberJoinedTime(member)
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  if (diff < 0) return ''
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚加入'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前加入`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前加入`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前加入`
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 加入`
}

// 成员角色标签显示条件：当前用户非创建者时所有成员都显示标签，创建者时仅创建者显示
const shouldShowMemberLabel = (member: RoomMember) =>
  !isRoomCreator.value || member.role === 'creator'

// ---- 房间名称合法性检查（首字不能是空格） ----
const validateRoomName = (value: string) => {
  const trimmed = value.trim()
  if (value && value[0] === ' ') {
    roomNameError.value = '房间名称首字不能为空格'
    return false
  }
  if (!trimmed) {
    roomNameError.value = '房间名称不能为空'
    return false
  }
  if (trimmed.length > 50) {
    roomNameError.value = '房间名称不能超过 50 个字符'
    return false
  }
  roomNameError.value = ''
  return true
}

// 实时纠正房间名称输入（禁止首字为空格）
const onRoomNameInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  let value = input.value
  // 首字不能是空格：若首字为空格则去掉
  if (value.startsWith(' ')) {
    value = value.replace(/^ +/, '')
    input.value = value
    createForm.value.name = value
  } else {
    createForm.value.name = value
  }
  validateRoomName(value)
}

// ---- 人数上限合法性检查（实时检测并纠正） ----
const MAX_MEMBERS_MIN = 2
const MAX_MEMBERS_MAX = 100

const validateMaxMembers = (value: number) => {
  if (!Number.isFinite(value)) {
    maxMembersError.value = '请输入有效数字'
    return false
  }
  if (value < MAX_MEMBERS_MIN) {
    maxMembersError.value = `人数不能少于 ${MAX_MEMBERS_MIN}`
    return false
  }
  if (value > MAX_MEMBERS_MAX) {
    maxMembersError.value = `人数不能超过 ${MAX_MEMBERS_MAX}`
    return false
  }
  if (!Number.isInteger(value)) {
    maxMembersError.value = '人数必须为整数'
    return false
  }
  maxMembersError.value = ''
  return true
}

// 实时纠正人数输入：越界自动纠正，并通过气泡浮窗提醒
const onMaxMembersInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  const raw = input.value.trim()
  if (raw === '') {
    createForm.value.maxMembers = 0
    maxMembersError.value = '请输入人数'
    showMaxMembersBubble('请输入人数')
    return
  }
  let num = Number(raw)
  // 自动纠正越界值
  if (Number.isFinite(num)) {
    if (num < MAX_MEMBERS_MIN) {
      // 不立即强制改写输入框，仅提示；用户离开焦点时再纠正
      maxMembersError.value = `人数不能少于 ${MAX_MEMBERS_MIN}，将自动纠正`
      showMaxMembersBubble(`人数不能少于 ${MAX_MEMBERS_MIN}，将自动纠正`)
    } else if (num > MAX_MEMBERS_MAX) {
      maxMembersError.value = `人数不能超过 ${MAX_MEMBERS_MAX}，已自动纠正`
      showMaxMembersBubble(`人数不能超过 ${MAX_MEMBERS_MAX}，已自动纠正`)
      num = MAX_MEMBERS_MAX
      input.value = String(num)
      createForm.value.maxMembers = num
      return
    } else if (!Number.isInteger(num)) {
      num = Math.floor(num)
      input.value = String(num)
      createForm.value.maxMembers = num
      maxMembersError.value = ''
      hideMaxMembersBubble()
    } else {
      maxMembersError.value = ''
      hideMaxMembersBubble()
    }
  } else {
    maxMembersError.value = '请输入有效数字'
    showMaxMembersBubble('请输入有效数字')
  }
  createForm.value.maxMembers = num
}

// 离开焦点时纠正人数
const onMaxMembersBlur = () => {
  let num = Number(createForm.value.maxMembers)
  if (!Number.isFinite(num) || num < MAX_MEMBERS_MIN) {
    num = MAX_MEMBERS_MIN
  } else if (num > MAX_MEMBERS_MAX) {
    num = MAX_MEMBERS_MAX
  } else if (!Number.isInteger(num)) {
    num = Math.floor(num)
  }
  createForm.value.maxMembers = num
  // 同步输入框显示
  const input = maxMembersInputRef.value
  if (input) input.value = String(num)
  validateMaxMembers(num)
  hideMaxMembersBubble()
}

// ---- 项目选择 / 场景导入 ----
const loadMyProjects = async () => {
  projectsLoading.value = true
  try {
    myProjects.value = await projectApi.getMyProjects()
  } catch {
    myProjects.value = []
  } finally {
    projectsLoading.value = false
  }
}

const toggleProjectDropdown = () => {
  projectDropdownOpen.value = !projectDropdownOpen.value
}

const selectProject = (project: Project) => {
  createForm.value.projectId = project.id
  createForm.value.projectName = project.name
  // 选择项目后清空导入的场景文件
  importedSceneFile.value = null
  importedSceneName.value = ''
  projectDropdownOpen.value = false
  // 清除项目关联冲突提示
  errorMessage.value = ''
}

const clearSelectedProject = () => {
  createForm.value.projectId = ''
  createForm.value.projectName = ''
  projectDropdownOpen.value = false
  // 清除项目关联冲突提示
  errorMessage.value = ''
}

const onSceneFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  // 仅接受 .json 文件
  if (!file.name.toLowerCase().endsWith('.json')) {
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '仅支持 .json 场景文件', scope: 'global' } }),
    )
    input.value = ''
    return
  }
  // 读取并校验文件内容合法性，校验失败则终止导入
  try {
    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: { msg: '场景文件不是有效的 JSON，已终止导入', scope: 'global' },
        }),
      )
      input.value = ''
      return
    }
    const result = validateSerializedScene(parsed)
    if (!result.valid) {
      window.dispatchEvent(
        new CustomEvent('toast', {
          detail: {
            msg: `场景文件校验失败：${result.error || '格式不合法'}，已终止导入`,
            scope: 'global',
          },
        }),
      )
      input.value = ''
      return
    }
    importedSceneFile.value = file
    // 以文件名（去后缀）作为场景名称
    importedSceneName.value = file.name.replace(/\.json$/i, '')
    // 导入场景后清空关联项目
    createForm.value.projectId = ''
    createForm.value.projectName = ''
  } catch {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '读取场景文件失败，已终止导入', scope: 'global' },
      }),
    )
  } finally {
    input.value = ''
  }
}

const clearImportedScene = () => {
  importedSceneFile.value = null
  importedSceneName.value = ''
}

// ---- 方法 ----
const closeDialog = () => {
  emit('update:dialogOpen', false)
}

const closePanel = () => {
  emit('update:panelOpen', false)
}

const switchMode = (m: CollabMode) => {
  if (mode.value === m) return
  mode.value = m
  errorMessage.value = ''
  selectedRoomId.value = null
  hasSearched.value = false
  searchResults.value = []
}

const switchJoinTab = (tab: JoinSubTab) => {
  if (joinSubTab.value === tab) return
  joinSubTab.value = tab
  errorMessage.value = ''
  selectedRoomId.value = null
}

const resetDialogState = () => {
  mode.value = 'create'
  joinSubTab.value = 'search'
  createForm.value = {
    name: '',
    description: '',
    isPublic: false,
    maxMembers: 10,
    projectId: '',
    projectName: '',
  }
  // 若当前已有项目，则默认预选该项目
  if (props.currentProjectId) {
    createForm.value.projectId = props.currentProjectId
  }
  importedSceneFile.value = null
  importedSceneName.value = ''
  searchKeyword.value = ''
  searchResults.value = []
  hasSearched.value = false
  urlInput.value = ''
  selectedRoomId.value = null
  errorMessage.value = ''
  roomNameError.value = ''
  maxMembersError.value = ''
  isSubmitting.value = false
  projectDropdownOpen.value = false
}

const handleSearch = async () => {
  errorMessage.value = ''
  const keyword = searchKeyword.value.trim()
  if (!keyword) {
    errorMessage.value = '请输入搜索关键字'
    return
  }
  isSubmitting.value = true
  try {
    // 合并搜索：同一关键字同时匹配房间名称、房间 ID、创建者名称或 ID
    const results = await roomApi.searchRooms({
      name: keyword,
      roomId: keyword,
      creator: keyword,
    })
    // 私密房间不允许被搜索到
    searchResults.value = results.filter((r) => r.isPublic)
    hasSearched.value = true
    selectedRoomId.value = null
    if (searchResults.value.length === 0) {
      errorMessage.value = '未找到匹配的房间'
    }
  } catch (err) {
    errorMessage.value = err instanceof ApiError ? err.message : '搜索失败，请重试'
  } finally {
    isSubmitting.value = false
  }
}

const loadRecommendedRooms = async (silent = false) => {
  // 首次加载显示 loading 动画；定时轮询静默更新，避免闪烁
  if (!silent) recommendedLoading.value = true
  try {
    const rooms = await roomApi.getRecommendedRooms()
    // 推荐大厅仅展示公开房间
    recommendedRooms.value = rooms.filter((r) => r.isPublic)
  } catch {
    recommendedRooms.value = []
  } finally {
    if (!silent) recommendedLoading.value = false
  }
}

const selectRoom = (room: Room) => {
  selectedRoomId.value = room.id === selectedRoomId.value ? null : room.id
  errorMessage.value = ''
}

const handleConfirm = async () => {
  errorMessage.value = ''

  if (mode.value === 'create') {
    await handleCreateRoom()
    return
  }

  // Join mode
  if (joinSubTab.value === 'search') {
    if (!hasSearched.value) {
      await handleSearch()
      return
    }
    if (!selectedRoomId.value) {
      errorMessage.value = '请选择一个房间'
      return
    }
    await handleJoinRoom(selectedRoom.value!)
    return
  }

  if (joinSubTab.value === 'url') {
    const url = urlInput.value.trim()
    if (!url) {
      errorMessage.value = '请输入房间链接'
      return
    }
    await handleJoinByUrl(url)
    return
  }

  // hall
  if (!selectedRoomId.value) {
    errorMessage.value = '请选择一个房间'
    return
  }
  await handleJoinRoom(selectedRoom.value!)
}

const handleCreateRoom = async () => {
  const name = createForm.value.name.trim()
  if (!validateRoomName(name)) {
    return
  }
  if (!validateMaxMembers(createForm.value.maxMembers)) {
    return
  }
  isSubmitting.value = true
  try {
    let projectId = createForm.value.projectId || undefined

    // 若选择了关联项目，检查该项目是否已关联其他"已打开"的房间
    if (projectId) {
      try {
        const myRooms = await roomApi.getMyRooms()
        const conflicting = myRooms.find(
          (r) => r.projectId === projectId && r.isOpen && r.id !== undefined,
        )
        if (conflicting) {
          errorMessage.value = '一个项目无法创建两个关联协作房间，请关闭后再尝试'
          isSubmitting.value = false
          return
        }
      } catch {
        // 检查失败不阻塞创建流程，后端会做最终校验
      }
    }

    // 若未选择关联项目，则自动创建一个与房间同名的项目
    if (!projectId) {
      try {
        const project = await projectApi.createProject({
          name,
          // 与房间描述同源：此前未传 description，关联项目的描述会缺失（null），
          // 单独打开该项目时「编辑项目」弹窗会因读不到描述而无法渲染
          description: createForm.value.description.trim(),
          isPublic: createForm.value.isPublic,
        })
        projectId = project.id
        createForm.value.projectId = project.id
        createForm.value.projectName = project.name
        // 通知父组件加载新创建的项目到编辑器，使其可实时更新项目数据库记录
        emit('project-created', project.id)
      } catch (err) {
        // 项目创建失败不阻塞房间创建
        const msg = err instanceof ApiError ? err.message : '自动创建关联项目失败'
        window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
      }
    }

    // 验证并创建房间
    const room = await roomApi.createRoom({
      name,
      description: createForm.value.description.trim() || undefined,
      projectId: projectId || undefined,
      isPublic: createForm.value.isPublic,
      maxMembers: createForm.value.maxMembers,
    })

    // 若导入了场景文件，则通过 projectApi 上传场景数据（若有 projectId）
    // 注意：场景文件预导入仅作为初始化数据，实际场景同步由 Yjs 协作层处理
    // 这里仅做提示，真正的场景加载由父组件在 join 事件后处理
    if (importedSceneFile.value && projectId) {
      try {
        const text = await importedSceneFile.value.text()
        await projectApi.saveScene(projectId, { sceneData: text })
      } catch {
        // 场景文件上传失败不阻塞房间创建
        window.dispatchEvent(
          new CustomEvent('toast', {
            detail: { msg: '场景文件导入失败，房间已创建', scope: 'global' },
          }),
        )
      }
    }

    // 创建后调用 joinRoom 获取 WebSocket 连接凭证（wsUrl + ticket）
    const joinResult = await roomApi.joinRoom(room.id)
    // 清除已移除标记（如果该房间之前被移除过）
    clearRemovedRoomFromStorage(room.id)
    room.myRole = joinResult.role
    room.isOpen = true

    collabStore.setCurrentRoom(room)
    collabStore.setRoomName(room.id)
    emit('join', { roomId: room.id, room, wsUrl: joinResult.wsUrl, ticket: joinResult.ticket })
    resetDialogState()
    emit('update:dialogOpen', false)
  } catch (err) {
    errorMessage.value = err instanceof ApiError ? err.message : '创建房间失败，请重试'
  } finally {
    isSubmitting.value = false
  }
}

const handleJoinRoom = async (room: Room) => {
  if (!room.isOpen) {
    errorMessage.value = '房间已关闭，无法加入'
    return
  }
  // 权限判断唯一标准：房间列表有该房间记录 = 已有权限进入
  // 非成员加入需根据房间类型走不同流程
  if (!isRoomMember(room.id) && room.ownerId !== user.value?.id) {
    if (room.approvalRequired) {
      // 需要批准的房间：非成员必须先申请
      // 批准时后端会自动创建 member 记录，所以 APPROVED 状态下应该已是成员
      const appStatus = myApplicationsByRoom.value.get(room.id)?.status
      if (appStatus === 'PENDING') {
        window.dispatchEvent(
          new CustomEvent('toast', { detail: { msg: '申请正在审核中，请等待创建者审核', scope: 'global' } }),
        )
        return
      }
      // APPROVED 但非成员 = 数据异常（可能被移除后授权已撤销）
      // REVOKED / REJECTED / 无记录 → 可以（重新）申请
      applyFormRoom.value = room
      applyForm.value = { requestedRole: 'viewer', reason: '' }
      return
    } else if (!room.isPublic) {
      // 非公开且无需批准的房间：无权加入
      errorMessage.value = '无权限加入此房间'
      return
    }
    // 公开且无需批准的房间：允许自助加入（后端会添加成员记录）
  }
  // 人数上限校验（仅警告，不阻塞加入——以实时在线人数为准）
  if (room.onlineCount >= room.maxMembers) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '房间人数可能已满，正在尝试加入...', scope: 'global' },
      }),
    )
  }
  isSubmitting.value = true
  try {
    // 加入房间，后端返回 wsUrl + ticket 用于 WebSocket 鉴权连接
    const joinResult = await roomApi.joinRoom(room.id)
    // 清除已移除标记，使房间列表重新显示该房间
    clearRemovedRoomFromStorage(room.id)
    room.myRole = joinResult.role
    collabStore.setCurrentRoom(room)
    collabStore.setRoomName(room.id)
    emit('join', { roomId: room.id, room, wsUrl: joinResult.wsUrl, ticket: joinResult.ticket })
    resetDialogState()
    emit('update:dialogOpen', false)
  } catch (err) {
    errorMessage.value = err instanceof ApiError ? err.message : '加入房间失败，请重试'
  } finally {
    isSubmitting.value = false
  }
}

const handleJoinByUrl = async (url: string) => {
  isSubmitting.value = true
  try {
    // 先解析房间 ID，拉取房间信息校验是否为私密房间
    const trimmed = url.trim()
    let roomId = ''
    try {
      const parsed = new URL(trimmed)
      roomId = parsed.searchParams.get('roomId') || ''
      if (!roomId) {
        const pathMatch = parsed.pathname.match(/\/join\/(.+)/)
        if (pathMatch) roomId = pathMatch[1] || ''
      }
    } catch {
      roomId = trimmed
    }
    if (roomId) {
      try {
        const roomInfo = await roomApi.getRoom(roomId)
        // 权限判断唯一标准：房间列表有该房间记录 = 已有权限进入
        if (!isRoomMember(roomInfo.id) && roomInfo.ownerId !== user.value?.id) {
          if (roomInfo.approvalRequired) {
            // 需要批准的房间：非成员必须先申请
            await loadMyApplicationsStatus()
            const appStatus = myApplicationsByRoom.value.get(roomInfo.id)?.status
            if (appStatus === 'PENDING') {
              window.dispatchEvent(
                new CustomEvent('toast', { detail: { msg: '申请正在审核中，请等待创建者审核', scope: 'global' } }),
              )
              isSubmitting.value = false
              return
            }
            // APPROVED 但非成员 = 数据异常；REVOKED/REJECTED/无记录 → 可申请
            applyFormRoom.value = roomInfo
            applyForm.value = { requestedRole: 'viewer', reason: '' }
            isSubmitting.value = false
            return
          } else if (!roomInfo.isPublic) {
            // 非公开且无需批准的房间：无权加入
            errorMessage.value = '无权限加入此房间'
            isSubmitting.value = false
            return
          }
          // 公开且无需批准的房间：允许自助加入
        }
        if (roomInfo.onlineCount >= roomInfo.maxMembers) {
          // 仅警告，不阻塞加入——以实时在线人数为准
          window.dispatchEvent(
            new CustomEvent('toast', {
              detail: { msg: '房间人数可能已满，正在尝试加入...', scope: 'global' },
            }),
          )
        }
      } catch {
        // 房间信息获取失败时不能继续加入，否则会绕过权限检查
        errorMessage.value = '无法获取房间信息，请检查链接是否正确'
        isSubmitting.value = false
        return
      }
    }
    const joinResult = await roomApi.joinRoomByUrl(url)
    // 清除已移除标记，使房间列表重新显示该房间
    clearRemovedRoomFromStorage(joinResult.roomId)
    // 通过链接加入时没有现成的 Room 对象，拉取房间详情补全
    const room = await roomApi.getRoomDetail(joinResult.roomId)
    room.myRole = joinResult.role
    collabStore.setCurrentRoom(room)
    collabStore.setRoomName(room.id)
    emit('join', { roomId: room.id, room, wsUrl: joinResult.wsUrl, ticket: joinResult.ticket })
    resetDialogState()
    emit('update:dialogOpen', false)
  } catch (err) {
    errorMessage.value =
      err instanceof ApiError ? err.message : '通过链接加入失败，请检查链接是否正确'
  } finally {
    isSubmitting.value = false
  }
}

// ---- 申请加入表单浮窗（需要批准的房间） ----
const applyFormRoom = ref<Room | null>(null)
const applyForm = ref<{ requestedRole: ApplicationRole; reason: string }>({
  requestedRole: 'viewer',
  reason: '',
})
const applySubmitting = ref(false)

const cancelApplyForm = () => {
  applyFormRoom.value = null
}

const submitApplication = async () => {
  if (!applyFormRoom.value) return
  applySubmitting.value = true
  try {
    await roomApi.submitApplication(applyFormRoom.value.id, {
      requestedRole: applyForm.value.requestedRole,
      reason: applyForm.value.reason || undefined,
    })
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '申请已提交，等待房主审核', scope: 'global' } }),
    )
    applyFormRoom.value = null
    emit('update:dialogOpen', false)
    // 立即刷新申请状态
    loadMyApplicationsStatus()
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '申请提交失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    applySubmitting.value = false
  }
}

// ---- 管理面板方法 ----
/**
 * 自适应面板位置：保证面板完整显示在视口内
 * - 默认显示在触发按钮下方右对齐
 * - 下方空间不足时显示在上方
 * - 右侧越界时左对齐，左侧越界时右对齐
 */
const updatePanelPosition = () => {
  const trigger = props.triggerEl
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const gap = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // 手机横屏等矮视口：面板宽度自适应（不超过视口宽度），高度占满可用空间
  const isShortViewport = viewportHeight <= 500
  const panelWidth = Math.min(340, viewportWidth - 16)
  const panelEstHeight = isShortViewport ? viewportHeight : 420

  // 计算可用空间，保证面板完整显示在视口内
  const spaceBelow = viewportHeight - rect.bottom - gap
  const spaceAbove = rect.top - gap

  let top: number
  let maxHeight: number

  if (isShortViewport) {
    // 矮视口：面板尽量占满下方空间，不够则向上展开，仍不够则贴顶并滚动
    if (spaceBelow >= 200) {
      top = rect.bottom + gap
      maxHeight = spaceBelow
    } else if (spaceAbove >= 200) {
      top = Math.max(8, rect.top - gap - Math.min(spaceAbove, panelEstHeight))
      maxHeight = spaceAbove
    } else {
      // 上下都不够：贴顶显示，高度占满视口（留出顶部 8px 和底部 8px 边距）
      top = 8
      maxHeight = viewportHeight - 16
    }
  } else {
    // 正常视口：原有逻辑
    const placeAbove = spaceBelow < panelEstHeight && spaceAbove > spaceBelow
    if (placeAbove) {
      top = Math.max(8, rect.top - gap - panelEstHeight)
      maxHeight = Math.min(panelEstHeight, spaceAbove)
    } else {
      top = rect.bottom + gap
      maxHeight = Math.min(panelEstHeight, spaceBelow)
    }
  }

  // 判断左右：默认右对齐（panel 右边对齐 trigger 右边），越界则调整
  let left = rect.right - panelWidth
  if (left < 8) {
    left = rect.left
  }
  if (left + panelWidth > viewportWidth - 8) {
    left = viewportWidth - panelWidth - 8
  }
  left = Math.max(8, left)

  panelStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    width: `${panelWidth}px`,
    maxHeight: `${maxHeight}px`,
    zIndex: '1200',
  }
}

// 动态计算转让确认弹窗遮罩位置：读取面板实际渲染 rect（可视区域），
// 使遮罩用 fixed 定位精确覆盖面板可视区域，滚动面板内容时遮罩和弹窗不偏移
const updateTransferMaskRect = () => {
  if (!transferConfirm.value) return
  const panel = panelRef.value
  if (!panel) {
    transferMaskStyle.value = {}
    return
  }
  const rect = panel.getBoundingClientRect()
  transferMaskStyle.value = {
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  }
}

const loadRoomDetail = async (silent = false) => {
  if (!currentRoom.value) return
  // 仅手动点击刷新或首次打开时显示 loading；定时轮询静默更新，避免闪烁
  if (!silent) detailLoading.value = true
  try {
    // 协作中：跳过信令服务器 peerCount 查询（已通过 Yjs awareness 获得实时 peerCount），
    // 避免每次面板刷新都额外打一次跨域 HTTP 请求
    const detail = await roomApi.getRoomDetail(currentRoom.value.id, false)
    // 局部动态刷新：保留未变化字段和成员的对象引用，避免浮窗重渲染/状态重置
    if (roomDetail.value) {
      const mergedMembers = mergeArrayById(
        roomDetail.value.members,
        detail.members,
        'userId' as keyof RoomMember,
      )
      roomDetail.value = patchObject(roomDetail.value, { ...detail, members: mergedMembers })
    } else {
      roomDetail.value = detail
    }
    // 就地更新房间元数据：不替换 currentRoom 对象引用，仅修改变化字段，
    // 使工具栏按钮和面板仅重渲染依赖变化字段的部分（EditorView 轮询也做同样同步，
    // 此处兜底补充 ownerAvatarUrl 等 getRoomDetail 独有字段）。
    const cur = currentRoom.value
    if (detail.ownerAvatarUrl && cur.ownerAvatarUrl !== detail.ownerAvatarUrl) {
      cur.ownerAvatarUrl = detail.ownerAvatarUrl
    }
    if (detail.isPublic !== cur.isPublic) cur.isPublic = detail.isPublic
    if (detail.myRole !== cur.myRole) cur.myRole = detail.myRole
    if (detail.name !== cur.name) cur.name = detail.name
    if (detail.ownerName !== cur.ownerName) cur.ownerName = detail.ownerName
    if (detail.ownerId !== cur.ownerId) cur.ownerId = detail.ownerId
    if (detail.maxMembers !== cur.maxMembers) cur.maxMembers = detail.maxMembers
    if (detail.onlineCount !== cur.onlineCount) cur.onlineCount = detail.onlineCount
  } catch {
    roomDetail.value = null
  } finally {
    if (!silent) detailLoading.value = false
  }
}

const handleLeaveRoom = async () => {
  if (!currentRoom.value) return
  const confirmed = window.confirm('确定要离开当前协作房间吗？')
  if (!confirmed) return
  try {
    await roomApi.leaveRoom(currentRoom.value.id)
  } catch {
    // 即使 API 失败也继续断开 Yjs
  }
  collabStore.setCurrentRoom(null)
  roomDetail.value = null
  emit('leave')
  closePanel()
}

const handleToggleRoomOpen = async () => {
  if (!currentRoom.value || !roomDetail.value) return
  const wasOpen = roomDetail.value.isOpen
  if (wasOpen) {
    // 关闭需二次确认
    if (!window.confirm('确定要关闭房间吗？关闭后所有成员的协作将被中断。')) return
  }
  try {
    if (wasOpen) {
      await roomApi.closeRoom(currentRoom.value.id)
      roomDetail.value.isOpen = false
      currentRoom.value.isOpen = false
      // 跨 Tab 通知所有协作用户房间已关闭（其他 Tab 的 EditorView 会收到 close 事件并退出协作）
      collabRoomEvents.emit({
        type: 'close',
        roomId: currentRoom.value.id,
        timestamp: Date.now(),
      })
      // 触发本地退出协作流程（断开 WebSocket、清空场景、清理 store、更新工具栏等）
      // 使用 'close' reason：不调 leaveRoom API（已调 closeRoom），不发 leave 事件（已发 close 事件）
      emit('room-closed')
      closePanel()
    } else {
      await roomApi.openRoom(currentRoom.value.id)
      roomDetail.value.isOpen = true
      currentRoom.value.isOpen = true
    }
  } catch (err) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: err instanceof ApiError ? err.message : '操作失败', scope: 'global' },
      }),
    )
  }
}

const handleCopyInviteLink = async () => {
  if (!currentRoom.value) return
  // 私密房间不允许复制邀请链接
  if (!currentRoom.value.isPublic) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '私密房间不允许复制邀请链接', scope: 'global' },
      }),
    )
    return
  }
  // 创建者关闭了分享权限时不允许复制邀请链接
  if (currentRoom.value.allowShare === false) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '创建者已禁用邀请链接分享', scope: 'global' },
      }),
    )
    return
  }
  const url = `${window.location.origin}/?roomId=${currentRoom.value.id}`
  try {
    await navigator.clipboard.writeText(url)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '复制失败，请手动复制：' + url, scope: 'global' },
      }),
    )
  }
}

// 跳转到协作大厅页面（独立大厅页）
const goToCollabHall = () => {
  const resolved = router.resolve({ name: 'collab-hall' })
  window.open(resolved.href, '_blank')
}

// ---- 成员管理（仅创建者，参考 RoomListView） ----
const roleLabels: Record<RoomRole, string> = {
  creator: '创建者',
  editor: '可编辑',
  viewer: '仅观看',
}

const roleBadgeClass: Record<RoomRole, string> = {
  creator: 'is-role-creator',
  editor: 'is-role-editor',
  viewer: 'is-role-viewer',
}

const changeMemberRole = async (member: RoomMember, newRole: RoomRole) => {
  if (!currentRoom.value || newRole === member.role || newRole === 'creator') return
  const oldRole = member.role
  member.role = newRole
  try {
    await roomApi.updateMemberRole(currentRoom.value.id, member.userId, newRole)
    // 通知编辑器 Tab 即时刷新目标用户的操作权限（本浏览器内跨 Tab 可用）
    collabRoomEvents.emit({
      type: 'role_change',
      roomId: currentRoom.value.id,
      timestamp: Date.now(),
      targetUserId: member.userId,
      role: newRole,
    })
    // 经 Yjs awareness 广播给房间内所有协作者（含不同设备/浏览器的目标成员），
    // 使其本地 myRole 立即更新、权限即时生效，无需等待下一次轮询。
    collabStore.activeManager?.broadcastRoleChange({
      roomId: currentRoom.value.id,
      targetUserId: member.userId,
      role: newRole,
    })
  } catch (err) {
    member.role = oldRole
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: err instanceof ApiError ? err.message : '权限更新失败', scope: 'global' },
      }),
    )
  }
}

const requestRemoveMember = (member: RoomMember) => {
  removeMemberConfirm.value = member.userId
}

const cancelRemoveMember = () => {
  removeMemberConfirm.value = null
}

const confirmRemoveMember = async (member: RoomMember) => {
  if (!currentRoom.value) return
  try {
    await roomApi.removeMember(currentRoom.value.id, member.userId)
    if (roomDetail.value) {
      roomDetail.value.members = roomDetail.value.members.filter((m) => m.userId !== member.userId)
      roomDetail.value.memberCount = Math.max(0, roomDetail.value.memberCount - 1)
    }
    if (currentRoom.value) {
      currentRoom.value.memberCount = Math.max(0, currentRoom.value.memberCount - 1)
    }
    // 通知编辑器 Tab 被踢用户应退出协作（跨 Tab，同一浏览器的被踢用户）
    collabRoomEvents.emit({
      type: 'kick',
      roomId: currentRoom.value.id,
      timestamp: Date.now(),
      targetUserId: member.userId,
    })
    removeMemberConfirm.value = null
  } catch (err) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: err instanceof ApiError ? err.message : '移除成员失败', scope: 'global' },
      }),
    )
    removeMemberConfirm.value = null
  }
}

const requestTransfer = (member: RoomMember) => {
  transferConfirm.value = member
  // 立即计算遮罩位置，确保弹窗渲染时遮罩已正确定位
  updateTransferMaskRect()
}

const cancelTransfer = () => {
  transferConfirm.value = null
}

const confirmTransfer = async () => {
  if (!transferConfirm.value || !currentRoom.value) return
  const member = transferConfirm.value
  transferLoading.value = true
  try {
    await roomApi.transferRoom(currentRoom.value.id, member.userId)
    // 当前用户角色降级为可编辑者，房间所有权更新
    currentRoom.value.myRole = 'editor'
    currentRoom.value.ownerId = member.userId
    currentRoom.value.ownerName = member.nickname || member.username
    if (roomDetail.value) {
      roomDetail.value.myRole = 'editor'
      roomDetail.value.ownerId = member.userId
      roomDetail.value.ownerName = member.nickname || member.username
      roomDetail.value.members = roomDetail.value.members.map((m) => {
        if (m.userId === member.userId) return { ...m, role: 'creator' as RoomRole }
        if (isMeMember(m)) return { ...m, role: 'editor' as RoomRole }
        return m
      })
    }
    transferConfirm.value = null
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '房间已转让', scope: 'global' },
      }),
    )
  } catch (err) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: err instanceof ApiError ? err.message : '转让房间失败', scope: 'global' },
      }),
    )
  } finally {
    transferLoading.value = false
  }
}

// 面板点击外部关闭
const handlePanelClickOutside = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Node)) return
  if (
    props.panelOpen &&
    panelRef.value &&
    !panelRef.value.contains(target) &&
    props.triggerEl &&
    !props.triggerEl.contains(target)
  ) {
    closePanel()
  }
}

// 点击项目下拉外部关闭
// 注意：对话框根节点使用了 @mousedown.stop / @click.stop 阻止冒泡到 document，
// 因此 document 级监听器无法捕获对话框内部的点击。这里通过 onDialogClick 在对话框内部
// 捕获 click 事件并判断是否在 .cp-project-selector 之外，从而关闭下拉。
const onDialogClick = (event: MouseEvent) => {
  if (!projectDropdownOpen.value) return
  const el = event.target as HTMLElement | null
  if (el && !el.closest('.cp-project-selector')) {
    projectDropdownOpen.value = false
  }
}

// ---- 生命周期 / 监听 ----
let appStatusTimer: ReturnType<typeof setInterval> | null = null

/**
 * 对话框数据是否已预热过。
 *
 * onMounted 会预热「申请状态」与「已加入房间」，
 * 随后用户首次打开对话框时 dialogOpen 的 watch 又会把这四项全部重发一遍，
 * 导致同一次开合内产生 6 个请求（其中 /project/my 会被请求 2 次：
 * loadMyProjects 与 loadJoinedRoomIds 内部的 getMyRooms → enrichRoomThumbnails 各拉一次）。
 *
 * 这里标记首次已预热，watch 首次打开时只补拉 watch 独有的两项。
 */
let dialogPrimedOnMount = false

watch(
  () => props.dialogOpen,
  async (open) => {
    if (open) {
      const skipPrimedLoads = dialogPrimedOnMount
      dialogPrimedOnMount = false
      resetDialogState()
      await loadMyProjects()
      // 加载完项目列表后，若 currentProjectId 存在，同步项目名称
      if (createForm.value.projectId) {
        const matched = myProjects.value.find((p) => p.id === createForm.value.projectId)
        if (matched) {
          createForm.value.projectName = matched.name
        }
      }
      loadRecommendedRooms()
      // 加载用户已加入的房间列表（用于判断是否需要申请加入）
      // onMounted 已预热过则跳过，避免与预热请求重复
      if (!skipPrimedLoads) loadJoinedRoomIds()
      // 加载申请状态并启动轮询（实时同步"正在审核..."按钮）
      if (!skipPrimedLoads) loadMyApplicationsStatus()
      appStatusTimer = setInterval(loadMyApplicationsStatus, 10_000)
    } else {
      if (appStatusTimer) {
        clearInterval(appStatusTimer)
        appStatusTimer = null
      }
    }
  },
)

// 协作信息浮窗打开时，定期刷新房间详情，实时同步在线人数
let panelRefreshTimer: ReturnType<typeof setInterval> | null = null
const PANEL_REFRESH_INTERVAL = 15_000 // 15秒刷新一次（避免高频替换 currentRoom 导致重渲染）

watch(
  () => props.panelOpen,
  async (open) => {
    if (open) {
      await nextTick()
      updatePanelPosition()
      await loadRoomDetail()
      await nextTick()
      checkDescOverflow()
      // 启动定期刷新：静默局部更新，不触发 loading 闪烁
      panelRefreshTimer = setInterval(() => {
        if (props.panelOpen && currentRoom.value) {
          void loadRoomDetail(true)
        }
      }, PANEL_REFRESH_INTERVAL)
    } else {
      // 停止定期刷新
      if (panelRefreshTimer) {
        clearInterval(panelRefreshTimer)
        panelRefreshTimer = null
      }
      roomDetail.value = null
      removeMemberConfirm.value = null
      transferConfirm.value = null
      descExpanded.value = false
      descOverflow.value = false
      membersExpanded.value = false
    }
  },
)

watch(mode, () => {
  errorMessage.value = ''
})

// 搜索关键字变化时重置搜索状态，使底部按钮重新变为"搜索房间"以支持再次搜索
watch(searchKeyword, () => {
  if (hasSearched.value) {
    hasSearched.value = false
    searchResults.value = []
    selectedRoomId.value = null
    errorMessage.value = ''
  }
})

// 面板打开后内容高度变化时重新计算位置
watch([roomDetail, detailLoading], async () => {
  if (props.panelOpen) {
    await nextTick()
    updatePanelPosition()
    checkDescOverflow()
    if (transferConfirm.value) {
      await nextTick()
      updateTransferMaskRect()
    }
  }
})

// ---- 跨 Tab 权限变更实时同步 ----
// 当创建者在房间列表页切换 approvalRequired 开关时，同步更新搜索结果、大厅推荐和当前房间的标签/入口
const handlePermissionChange = (event: CollabRoomEvent) => {
  if (event.type !== 'permission_change' || !event.permission) return
  const { roomId, permission, value } = event
  if (value === undefined) return
  // 更新搜索结果中的房间
  const srRoom = searchResults.value.find((r) => r.id === roomId)
  if (srRoom) (srRoom as Record<string, unknown>)[permission] = value
  // 更新大厅推荐中的房间
  const hallRoom = recommendedRooms.value.find((r) => r.id === roomId)
  if (hallRoom) (hallRoom as Record<string, unknown>)[permission] = value
  // 更新当前房间（通过 store）
  if (currentRoom.value?.id === roomId) {
    ;(currentRoom.value as Record<string, unknown>)[permission] = value
  }
}

// 面板位置随视口/滚动变化的处理函数。
// 必须用具名函数而非内联匿名函数，否则 onUnmounted 无法 removeEventListener，
// 会随每次挂载累积一份监听器。
const handleViewportChange = () => {
  if (props.panelOpen) {
    updatePanelPosition()
    if (transferConfirm.value) {
      nextTick(() => updateTransferMaskRect())
    }
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handlePanelClickOutside)
  window.addEventListener('resize', handleViewportChange)
  document.addEventListener('scroll', handleViewportChange, true)
  // 监听跨 Tab 权限变更事件（如 approvalRequired 开关），实时同步所有入口和标签
  collabRoomEvents.on(handlePermissionChange)
  // 初始加载申请状态
  loadMyApplicationsStatus()
  // 初始加载用户已加入的房间列表
  loadJoinedRoomIds()
  // 标记已预热：dialogOpen 首次打开时不再重复拉这两项
  dialogPrimedOnMount = true
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handlePanelClickOutside)
  window.removeEventListener('resize', handleViewportChange)
  document.removeEventListener('scroll', handleViewportChange, true)
  collabRoomEvents.off(handlePermissionChange)
  if (maxMembersBubbleTimer) {
    clearTimeout(maxMembersBubbleTimer)
    maxMembersBubbleTimer = null
  }
  if (panelRefreshTimer) {
    clearInterval(panelRefreshTimer)
    panelRefreshTimer = null
  }
  if (appStatusTimer) {
    clearInterval(appStatusTimer)
    appStatusTimer = null
  }
})

// 暴露给父组件的方法
defineExpose({
  creatorAvatarUrl,
  creatorDisplayName,
  creatorInitial,
  isRoomCreator,
})
</script>

<template>
  <!-- 创建/加入协作 对话框 -->
  <Teleport to="body">
    <Transition name="cp-dialog-fade">
      <div v-if="dialogOpen" class="cp-dialog-mask">
        <div class="cp-dialog" @click.stop="onDialogClick" @mousedown.stop>
          <!-- 模式切换（顶部居中大按钮） -->
          <div class="cp-mode-toggle">
            <div class="cp-mode-indicator" :class="{ 'is-join': mode === 'join' }"></div>
            <button
              class="cp-mode-btn"
              :class="{ active: mode === 'create' }"
              @click="switchMode('create')"
            >
              <svg
                class="cp-mode-icon"
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
              <span>创建协作</span>
            </button>
            <button
              class="cp-mode-btn"
              :class="{ active: mode === 'join' }"
              @click="switchMode('join')"
            >
              <svg
                class="cp-mode-icon"
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
              <span>加入协作</span>
            </button>
          </div>

          <div class="cp-dialog-body">
            <!-- 创建协作模式 -->
            <template v-if="mode === 'create'">
              <div class="cp-form-group">
                <label class="cp-label">房间名称 <span class="cp-required">*</span></label>
                <input
                  :value="createForm.name"
                  @input="onRoomNameInput"
                  type="text"
                  class="cp-input"
                  :class="{ 'is-error': roomNameError }"
                  placeholder="请输入房间名称"
                  maxlength="50"
                />
                <span v-if="roomNameError" class="cp-field-error">{{ roomNameError }}</span>
              </div>
              <div class="cp-form-group">
                <label class="cp-label">房间描述</label>
                <textarea
                  v-model="createForm.description"
                  class="cp-textarea"
                  placeholder="可选，描述你的房间"
                  rows="2"
                ></textarea>
              </div>

              <!-- 关联项目 / 导入场景文件 -->
              <div class="cp-form-group">
                <label class="cp-label">关联项目 / 导入场景</label>
                <div class="cp-project-selector">
                  <!-- 已选项目展示 -->
                  <div v-if="createForm.projectId" class="cp-project-selected">
                    <span class="cp-project-selected-name">{{ createForm.projectName }}</span>
                    <button class="cp-project-clear" @click="clearSelectedProject" title="清除">
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
                  <!-- 已导入场景文件展示 -->
                  <div v-else-if="importedSceneFile" class="cp-project-selected">
                    <span class="cp-project-selected-name">{{ importedSceneName }}</span>
                    <button class="cp-project-clear" @click="clearImportedScene" title="清除">
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
                  <!-- 选择/导入入口 -->
                  <div v-else class="cp-project-actions">
                    <button
                      type="button"
                      class="cp-project-btn"
                      @click="toggleProjectDropdown"
                      :disabled="projectsLoading"
                    >
                      {{ projectsLoading ? '加载中...' : '选择项目' }}
                    </button>
                    <label class="cp-project-btn cp-project-btn-import">
                      导入场景文件
                      <input type="file" accept=".json" @change="onSceneFileChange" hidden />
                    </label>
                  </div>
                  <!-- 项目下拉列表 -->
                  <div v-if="projectDropdownOpen" class="cp-project-dropdown">
                    <div v-if="myProjects.length === 0" class="cp-project-empty">暂无可用项目</div>
                    <div
                      v-for="proj in myProjects"
                      :key="proj.id"
                      class="cp-project-option"
                      @click="selectProject(proj)"
                    >
                      <span class="cp-project-option-name">{{ proj.name }}</span>
                      <span class="cp-project-option-meta">{{ proj.ownerName }}</span>
                    </div>
                  </div>
                </div>
                <span class="cp-hint"
                  >可选：选择已有项目或导入合法的 .json 场景文件作为协作初始内容</span
                >
              </div>

              <div class="cp-form-row">
                <div class="cp-form-group cp-form-group-inline">
                  <label class="cp-label">是否公开</label>
                  <button
                    type="button"
                    class="cp-switch"
                    :class="{ 'is-on': createForm.isPublic }"
                    @click="createForm.isPublic = !createForm.isPublic"
                  >
                    <span class="cp-switch-knob"></span>
                  </button>
                  <span class="cp-switch-label">{{ createForm.isPublic ? '公开' : '私密' }}</span>
                </div>
                <div class="cp-form-group cp-form-group-inline">
                  <label class="cp-label">人数上限</label>
                  <input
                    ref="maxMembersInputRef"
                    :value="createForm.maxMembers"
                    @input="onMaxMembersInput"
                    @blur="onMaxMembersBlur"
                    type="number"
                    class="cp-input cp-input-sm cp-input-max-members"
                    :class="{ 'is-error': maxMembersError }"
                    min="2"
                    max="100"
                  />
                </div>
              </div>
            </template>

            <!-- 加入协作模式 -->
            <template v-else>
              <!-- 子标签切换 -->
              <div class="cp-join-tabs">
                <button
                  class="cp-join-tab"
                  :class="{ active: joinSubTab === 'search' }"
                  @click="switchJoinTab('search')"
                >
                  搜索加入
                </button>
                <button
                  class="cp-join-tab"
                  :class="{ active: joinSubTab === 'url' }"
                  @click="switchJoinTab('url')"
                >
                  链接加入
                </button>
                <button
                  class="cp-join-tab"
                  :class="{ active: joinSubTab === 'hall' }"
                  @click="switchJoinTab('hall')"
                >
                  协作大厅
                </button>
              </div>

              <!-- 搜索加入（合并为单个搜索框，回车搜索） -->
              <div v-if="joinSubTab === 'search'" class="cp-join-content">
                <div class="cp-form-group">
                  <label class="cp-label">输入关键字</label>
                  <input
                    v-model="searchKeyword"
                    type="text"
                    class="cp-input"
                    placeholder="房间名称 / 房间 ID / 创建者名称或 ID"
                    @keyup.enter="handleSearch"
                  />
                </div>

                <!-- 搜索结果 -->
                <div v-if="hasSearched" class="cp-search-results">
                  <div v-if="searchResults.length === 0" class="cp-empty">未找到匹配的房间</div>
                  <div
                    v-for="room in searchResults"
                    :key="room.id"
                    class="cp-room-card"
                    :class="{ selected: room.id === selectedRoomId }"
                    @click="selectRoom(room)"
                  >
                    <div class="cp-room-card-main">
                      <div class="cp-room-card-name">{{ room.name }}</div>
                      <div class="cp-room-card-badges">
                        <span class="cp-badge" :class="room.isOpen ? 'is-open' : 'is-closed'">
                          {{ room.isOpen ? '已打开' : '已关闭' }}
                        </span>
                        <span class="cp-badge" :class="room.isPublic ? 'is-public' : 'is-private'">
                          {{ room.isPublic ? '公开' : '私密' }}
                        </span>
                        <span
                          class="cp-badge"
                          :class="room.approvalRequired ? 'is-approval' : 'is-no-approval'"
                        >
                          {{ room.approvalRequired ? '需要批准' : '无需批准' }}
                        </span>
                      </div>
                    </div>
                    <div class="cp-room-card-meta">
                      <span class="cp-meta-owner">{{ room.ownerName }}</span>
                      <span class="cp-meta-dot">·</span>
                      <span class="cp-meta-online">{{ room.onlineCount }}/{{ room.maxMembers }}人在线</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 链接加入（仅支持链接） -->
              <div v-if="joinSubTab === 'url'" class="cp-join-content">
                <div class="cp-form-group">
                  <label class="cp-label">房间链接</label>
                  <input
                    v-model="urlInput"
                    type="text"
                    class="cp-input"
                    placeholder="粘贴房间邀请链接"
                    @keyup.enter="handleConfirm"
                  />
                </div>
                <div class="cp-hint">你将通过房间邀请链接加入房间</div>
              </div>

              <!-- 协作大厅（显示 3 条推荐 + 更多按钮跳转） -->
              <div v-if="joinSubTab === 'hall'" class="cp-join-content">
                <div class="cp-hall-header">
                  <span class="cp-hall-title">推荐房间</span>
                  <button class="cp-more-btn" @click="goToCollabHall">
                    更多
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
                <!-- 加载动画 -->
                <div v-if="recommendedLoading" class="cp-panel-loading">
                  <div class="cp-loading-spinner"></div>
                  <span>加载中...</span>
                </div>
                <div v-else-if="recommendedRooms.length === 0" class="cp-empty">暂无推荐的公开房间</div>
                <div
                  v-else
                  v-for="room in recommendedRooms"
                  :key="room.id"
                  class="cp-room-card"
                  :class="{ selected: room.id === selectedRoomId }"
                  @click="selectRoom(room)"
                >
                  <div class="cp-room-card-main">
                    <div class="cp-room-card-name">{{ room.name }}</div>
                    <div class="cp-room-card-badges">
                      <span class="cp-badge is-open">已打开</span>
                      <span
                        class="cp-badge"
                        :class="room.approvalRequired ? 'is-approval' : 'is-no-approval'"
                      >
                        {{ room.approvalRequired ? '需要批准' : '无需批准' }}
                      </span>
                    </div>
                  </div>
                  <div class="cp-room-card-meta">
                    <span class="cp-meta-owner">{{ room.ownerName }}</span>
                    <span class="cp-meta-dot">·</span>
                    <span class="cp-meta-online">{{ room.onlineCount }}/{{ room.maxMembers }}人在线</span>
                  </div>
                </div>
              </div>
            </template>

            <!-- 错误提示 -->
            <div v-if="errorMessage" class="cp-error">
              <svg
                class="cp-error-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{{ errorMessage }}</span>
            </div>
          </div>

          <!-- 底部按钮：只能点击取消关闭 -->
          <div class="cp-dialog-footer">
            <button class="cp-btn cp-btn-cancel" @click="closeDialog" :disabled="isSubmitting">
              取消
            </button>
            <button class="cp-btn cp-btn-confirm" @click="handleConfirm" :disabled="!canConfirm">
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 申请加入表单浮窗（需要批准的房间） -->
  <Teleport to="body">
    <Transition name="cp-dialog-fade">
      <div v-if="applyFormRoom" class="cp-apply-mask">
        <div class="cp-apply-box" @click.stop @mousedown.stop>
          <div class="cp-apply-header">
            <h3 class="cp-apply-title">申请加入房间</h3>
            <button class="cp-apply-close" @click="cancelApplyForm" :disabled="applySubmitting">×</button>
          </div>
          <div class="cp-apply-body">
            <div class="cp-apply-room-name">{{ applyFormRoom.name }}</div>
            <div class="cp-form-group">
              <label class="cp-label">用户名</label>
              <input
                type="text"
                class="cp-input cp-input-readonly"
                :value="user?.username || ''"
                readonly
              />
            </div>
            <div class="cp-form-group">
              <label class="cp-label">昵称</label>
              <input
                type="text"
                class="cp-input cp-input-readonly"
                :value="user?.nickname || user?.username || ''"
                readonly
              />
            </div>
            <div class="cp-form-group">
              <label class="cp-label">申请协作权限类型 <span class="cp-required">*</span></label>
              <select v-model="applyForm.requestedRole" class="cp-input" :disabled="applySubmitting">
                <option value="viewer">仅观看</option>
                <option value="editor">可编辑</option>
              </select>
            </div>
            <div class="cp-form-group">
              <label class="cp-label">申请理由（选填）</label>
              <textarea
                v-model="applyForm.reason"
                class="cp-textarea"
                rows="3"
                placeholder="请输入申请理由..."
                :disabled="applySubmitting"
              ></textarea>
            </div>
          </div>
          <div class="cp-apply-footer">
            <button
              class="cp-btn cp-btn-cancel"
              @click="cancelApplyForm"
              :disabled="applySubmitting"
            >取消</button>
            <button
              class="cp-btn cp-btn-confirm"
              :disabled="applySubmitting"
              @click="submitApplication"
            >{{ applySubmitting ? '提交中...' : '提交' }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 人数上限气泡浮窗（参考 SideBar 的 length-bubble-fixed 样式） -->
  <Teleport to="body">
    <Transition name="cp-bubble-fade">
      <div
        v-if="maxMembersBubble.show"
        class="cp-bubble-fixed"
        :class="{ 'below-anchor': maxMembersBubble.below }"
        :style="{
          left: maxMembersBubble.x + 'px',
          top: maxMembersBubble.y + 'px',
          transform: maxMembersBubble.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
        }"
      >
        {{ maxMembersBubble.message }}
      </div>
    </Transition>
  </Teleport>

  <!-- 房间管理面板（已连接时点击协作按钮弹出） -->
  <Teleport to="body">
    <Transition name="cp-panel-fade">
      <div
        v-if="panelOpen && isConnected"
        ref="panelRef"
        class="cp-panel"
        :style="panelStyle"
        @mousedown.stop
      >
        <!-- 右上角刷新按钮 -->
        <button
          class="cp-panel-refresh"
          title="刷新房间信息"
          :disabled="detailLoading"
          @click="() => loadRoomDetail()"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            :class="{ 'is-spinning': detailLoading }"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <!-- 房间信息：名称、ID、标签同一行 -->
        <div v-if="currentRoom" class="cp-panel-header">
          <div class="cp-panel-title-row">
            <span class="cp-panel-room-name">{{ currentRoom.name }}</span>
            <span class="cp-panel-room-id">#{{ currentRoom.id }}</span>
            <div class="cp-panel-badges">
              <span
                class="cp-badge cp-badge-sm"
                :class="currentRoom.isOpen ? 'is-open' : 'is-closed'"
              >
                {{ currentRoom.isOpen ? '已打开' : '已关闭' }}
              </span>
              <span
                class="cp-badge cp-badge-sm"
                :class="currentRoom.isPublic ? 'is-public' : 'is-private'"
              >
                {{ currentRoom.isPublic ? '公开' : '私密' }}
              </span>
              <span
                class="cp-badge cp-badge-sm"
                :class="currentRoom.approvalRequired ? 'is-approval' : 'is-no-approval'"
              >
                {{ currentRoom.approvalRequired ? '需要批准' : '无需批准' }}
              </span>
              <span class="cp-badge cp-badge-sm" :class="roleBadgeClass[currentRoom.myRole]">
                {{ myRoleLabel }}
              </span>
            </div>
          </div>
        </div>

        <!-- 创建者信息（在房间描述上方） -->
        <div class="cp-panel-creator">
          <div class="cp-panel-avatar">
            <ProxiedImage
              v-if="creatorAvatarUrl"
              :src="creatorAvatarUrl"
              alt="avatar"
              class="cp-avatar-img"
            />
            <div v-else class="cp-avatar-fallback">{{ creatorInitial }}</div>
          </div>
          <div class="cp-panel-creator-info">
            <div class="cp-panel-creator-name">{{ creatorDisplayName }}</div>
            <div class="cp-panel-creator-role">创建者</div>
          </div>
        </div>

        <!-- 房间描述：最多两行，溢出显示省略号 + 展开/收起按钮（仅在超过2行时显示） -->
        <div v-if="currentRoom?.description" class="cp-panel-desc-wrap">
          <p ref="descRef" class="cp-panel-desc" :class="{ 'is-expanded': descExpanded }">
            {{ currentRoom.description }}
          </p>
          <button v-if="descOverflow" class="cp-desc-toggle" @click="descExpanded = !descExpanded">
            {{ descExpanded ? '收起' : '展开' }}
          </button>
        </div>

        <!-- 成员列表（自适应宽度，超过两行收起，展开/收起按钮在标题旁） -->
        <div class="cp-panel-section">
          <div class="cp-panel-section-title">
            成员
            <span class="cp-panel-member-count">
              {{
                detailLoading
                  ? '...'
                  : isConnected
                    ? peerCount
                    : (currentRoom?.onlineCount ?? roomDetail?.onlineCount ?? 0)
              }}
              在线 / {{ currentRoom?.maxMembers ?? '?' }} 上限
            </span>
            <button
              v-if="hasMoreMembers"
              class="cp-section-toggle"
              @click="membersExpanded = !membersExpanded"
              :title="membersExpanded ? '收起' : '展开'"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline v-if="!membersExpanded" points="6 9 12 15 18 9" />
                <polyline v-else points="18 15 12 9 6 15" />
              </svg>
            </button>
          </div>
          <div v-if="detailLoading" class="cp-panel-loading">加载中...</div>
          <div v-else-if="roomDetail && roomDetail.members.length" class="cp-member-grid">
            <div
              v-for="member in visibleMembers"
              :key="member.userId"
              class="cp-member-card"
              :class="{
                'is-confirming': removeMemberConfirm === member.userId,
                'is-online': member.isOnline,
                'is-me': isMeMember(member),
                'is-creator': member.role === 'creator',
              }"
              :data-member-id="member.userId"
              :title="getMemberTooltip(member)"
            >
              <!-- 头部：头像 + 在线状态点 -->
              <div class="cp-member-card-head">
                <div class="cp-member-card-avatar">
                  <ProxiedImage
                    v-if="getMemberAvatar(member)"
                    :src="getMemberAvatar(member)!"
                    alt="avatar"
                    class="cp-avatar-img"
                  />
                  <div v-else class="cp-avatar-fallback">
                    {{ getMemberName(member).slice(0, 1).toUpperCase() }}
                  </div>
                  <span
                    class="cp-online-dot"
                    :class="{ 'is-online': member.isOnline }"
                    :title="member.isOnline ? '在线' : '离线'"
                  ></span>
                </div>
              </div>
              <!-- 名称与用户名 -->
              <div class="cp-member-card-info">
                <div class="cp-member-card-name">{{ getMemberName(member) }}</div>
                <div class="cp-member-card-username">@{{ member.username }}</div>
              </div>
              <!-- 角色标签 -->
              <div class="cp-member-card-badges">
                <span v-if="isMeMember(member)" class="cp-badge cp-badge-sm cp-badge-me">我</span>
                <span
                  v-if="shouldShowMemberLabel(member)"
                  class="cp-badge cp-badge-sm"
                  :class="roleBadgeClass[member.role]"
                >
                  {{ roleLabels[member.role] }}
                </span>
              </div>
              <!-- 加入时间（取上一次加入时间，缺失时回退首次加入时间） -->
              <div v-if="getMemberJoinedTime(member)" class="cp-member-card-meta">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{{ formatJoinedTime(member) }}</span>
              </div>
              <!-- 成员操作区：仅创建者可对非创建者成员操作 -->
              <div
                v-if="isRoomCreator && member.role !== 'creator'"
                class="cp-member-card-actions"
                @click.stop
              >
                <select
                  class="cp-member-role-select"
                  :value="member.role"
                  @change="
                    changeMemberRole(member, ($event.target as HTMLSelectElement).value as RoomRole)
                  "
                  title="切换成员权限"
                >
                  <option value="editor">可编辑</option>
                  <option value="viewer">仅观看</option>
                </select>
                <template v-if="removeMemberConfirm === member.userId">
                  <span class="cp-confirm-text">移除？</span>
                  <button
                    class="cp-confirm-btn cp-confirm-yes"
                    @click="confirmRemoveMember(member)"
                  >
                    是
                  </button>
                  <button class="cp-confirm-btn cp-confirm-no" @click="cancelRemoveMember">
                    否
                  </button>
                </template>
                <template v-else>
                  <button
                    class="cp-icon-btn cp-icon-btn-remove"
                    @click="requestRemoveMember(member)"
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
                  <button
                    class="cp-icon-btn cp-icon-btn-transfer"
                    @click="requestTransfer(member)"
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
                </template>
              </div>
            </div>
          </div>
          <div v-else class="cp-panel-loading">暂无成员信息</div>
        </div>

        <!-- 操作按钮：复制邀请链接 / 关闭房间 / 离开房间 同一行 -->
        <div class="cp-panel-actions">
          <button
            class="cp-panel-action"
            @click="handleCopyInviteLink"
            :title="copySuccess ? '已复制!' : '复制邀请链接'"
          >
            <svg
              class="cp-action-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>{{ copySuccess ? '已复制!' : '复制链接' }}</span>
          </button>

          <!-- 创建者：打开/关闭房间 -->
          <button v-if="isRoomCreator" class="cp-panel-action" @click="handleToggleRoomOpen">
            <svg
              class="cp-action-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle v-if="!currentRoom?.isOpen" cx="12" cy="12" r="4" />
              <line v-else x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            <span>{{ currentRoom?.isOpen ? '关闭房间' : '打开房间' }}</span>
          </button>

          <button class="cp-panel-action cp-panel-action-danger" @click="handleLeaveRoom">
            <svg
              class="cp-action-icon"
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
            <span>离开房间</span>
          </button>
        </div>

        <!-- 转让房间确认弹窗（内嵌，fixed 定位动态覆盖面板可视区域） -->
        <div v-if="transferConfirm" class="cp-transfer-mask" :style="transferMaskStyle" @click.stop>
          <div class="cp-transfer-box">
            <div class="cp-transfer-title">转让房间</div>
            <div class="cp-transfer-content">
              确定要将房间转让给
              <span class="cp-transfer-name">{{
                transferConfirm.nickname || transferConfirm.username
              }}</span>
              吗？转让后你将变为可编辑者。
            </div>
            <div class="cp-transfer-actions">
              <button
                class="cp-btn cp-btn-cancel"
                @click="cancelTransfer"
                :disabled="transferLoading"
              >
                取消
              </button>
              <button
                class="cp-btn cp-btn-confirm"
                @click="confirmTransfer"
                :disabled="transferLoading"
              >
                {{ transferLoading ? '处理中...' : '确认转让' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ---- 对话框 ---- */
.cp-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cp-dialog {
  width: 100%;
  max-width: 440px;
  max-height: calc(100vh - 32px);
  border-radius: 16px;
  border: 1px solid #3d3d3d;
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 模式切换 */
.cp-mode-toggle {
  position: relative;
  display: flex;
  padding: 14px 14px 0;
  gap: 6px;
  background: rgba(0, 0, 0, 0.2);
}

.cp-mode-indicator {
  position: absolute;
  top: 14px;
  left: 14px;
  width: calc(50% - 17px);
  height: 40px;
  border-radius: 10px;
  background: rgba(67, 242, 96, 0.12);
  border: 1px solid rgba(67, 242, 96, 0.35);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}

.cp-mode-indicator.is-join {
  transform: translateX(calc(100% + 6px));
}

.cp-mode-btn {
  position: relative;
  z-index: 1;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: #999;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease;
  white-space: nowrap;
}

.cp-mode-btn.active {
  color: #43f260;
}

.cp-mode-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* 对话框主体 */
.cp-dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cp-form-group-inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.cp-form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.cp-form-row .cp-form-group {
  flex: 1;
  min-width: 120px;
}

.cp-label {
  color: #bbb;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.cp-required {
  color: #ff6b6b;
}

.cp-input,
.cp-textarea {
  background: #1a1a1a;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  color: #eee;
  padding: 8px 12px;
  font-size: 13px;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.cp-input:focus,
.cp-textarea:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.cp-textarea {
  resize: vertical;
  min-height: 40px;
}

.cp-input-sm {
  width: 70px;
}

/* 输入框错误状态 */
.cp-input.is-error,
.cp-textarea.is-error {
  border-color: rgba(255, 95, 95, 0.5);
  box-shadow: 0 0 0 2px rgba(255, 95, 95, 0.08);
}

/* 字段级错误提示 */
.cp-field-error {
  color: #ff9999;
  font-size: 11px;
  line-height: 1.4;
}

.cp-field-error-inline {
  color: #ff9999;
  font-size: 10px;
  white-space: nowrap;
}

/* 人数上限气泡浮窗（参考 SideBar 的 length-bubble-fixed） */
.cp-bubble-fixed {
  position: fixed;
  background: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  color: #333333;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 99999;
  pointer-events: none;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
  width: max-content;
  max-width: 300px;
}

.cp-bubble-fixed::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -4px;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: #ffffff;
}

.cp-bubble-fixed.below-anchor::after {
  top: -4px;
  bottom: auto;
}

.cp-bubble-fade-enter-active,
.cp-bubble-fade-leave-active {
  transition: opacity 0.25s ease;
}

.cp-bubble-fade-enter-from,
.cp-bubble-fade-leave-to {
  opacity: 0;
}

/* 项目选择 / 场景导入 */
.cp-project-selector {
  position: relative;
}

.cp-project-selected {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(67, 242, 96, 0.35);
  background: rgba(67, 242, 96, 0.08);
  color: #6df586;
  font-size: 12px;
}

.cp-project-selected-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.cp-project-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #6df586;
  cursor: pointer;
  padding: 0;
}

.cp-project-clear svg {
  width: 10px;
  height: 10px;
}

.cp-project-clear:hover {
  background: rgba(255, 255, 255, 0.1);
}

.cp-project-actions {
  display: flex;
  gap: 8px;
}

.cp-project-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #1f1f1f;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cp-project-btn:hover:not(:disabled) {
  border-color: #43f260;
  color: #43f260;
}

.cp-project-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cp-project-btn-import {
  cursor: pointer;
}

.cp-project-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 180px;
  overflow-y: auto;
  background: #1f1f1f;
  border: 1px solid #3d3d3d;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 10;
  padding: 4px;
}

.cp-project-empty {
  padding: 10px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

.cp-project-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.cp-project-option:hover {
  background: rgba(67, 242, 96, 0.08);
}

.cp-project-option-name {
  color: #eee;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-project-option-meta {
  color: #777;
  font-size: 10px;
  flex-shrink: 0;
}

/* 开关 */
.cp-switch {
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

.cp-switch.is-on {
  background: rgba(67, 242, 96, 0.25);
  border-color: rgba(67, 242, 96, 0.55);
}

.cp-switch-knob {
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

.cp-switch.is-on .cp-switch-knob {
  transform: translateX(16px);
  background: #43f260;
}

.cp-switch-label {
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
}

/* 加入子标签 */
.cp-join-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #333;
  padding-bottom: 0;
}

.cp-join-tab {
  padding: 6px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #888;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.cp-join-tab:hover {
  color: #ddd;
}

.cp-join-tab.active {
  color: #43f260;
  border-bottom-color: #43f260;
}

.cp-join-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 搜索按钮 */

/* 搜索结果 */
.cp-search-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  padding-top: 4px;
}

.cp-room-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #333;
  background: #1a1a1a;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cp-room-card:hover {
  border-color: #555;
  background: #222;
}

.cp-room-card.selected {
  border-color: rgba(67, 242, 96, 0.55);
  background: rgba(67, 242, 96, 0.08);
  box-shadow: 0 0 0 1px rgba(67, 242, 96, 0.2);
}

.cp-room-card-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.cp-room-card-info {
  flex: 1;
  min-width: 0;
}

.cp-room-card-name {
  color: #eee;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.cp-room-card-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #777;
  font-size: 11px;
}

.cp-meta-owner {
  color: #999;
}

.cp-meta-dot {
  color: #555;
}

.cp-meta-online {
  color: #6df586;
}

.cp-room-card-badges {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 徽章 */
.cp-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid transparent;
  white-space: nowrap;
  flex-shrink: 0;
}

.cp-badge-sm {
  padding: 1px 6px;
  font-size: 9px;
}

/* "我" 标签：标识当前登录用户 */
.cp-badge.cp-badge-me {
  background: rgba(96, 165, 250, 0.18);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.4);
}

.cp-badge.is-open {
  background: rgba(67, 242, 96, 0.1);
  color: #6df586;
  border-color: rgba(67, 242, 96, 0.25);
}

.cp-badge.is-closed {
  background: rgba(120, 120, 120, 0.1);
  color: #999;
  border-color: rgba(120, 120, 120, 0.2);
}

.cp-badge.is-public {
  background: rgba(96, 165, 250, 0.12);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.3);
}

.cp-badge.is-private {
  background: rgba(150, 100, 200, 0.12);
  color: #c9a8e8;
  border-color: rgba(150, 100, 200, 0.3);
}

.cp-badge.is-role,
.cp-badge.is-role-creator {
  background: rgba(67, 242, 96, 0.14);
  color: #6df586;
  border-color: rgba(67, 242, 96, 0.3);
}

.cp-badge.is-role-editor {
  background: rgba(96, 165, 250, 0.14);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.3);
}

.cp-badge.is-role-viewer {
  background: rgba(180, 180, 180, 0.12);
  color: #b0b0b0;
  border-color: rgba(180, 180, 180, 0.25);
}

/* 大厅 */
.cp-hall-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.cp-hall-title {
  color: #ccc;
  font-size: 13px;
  font-weight: 600;
}

.cp-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cp-more-btn:hover {
  border-color: #43f260;
  color: #43f260;
}

.cp-more-btn svg {
  width: 12px;
  height: 12px;
}

/* 提示 / 空状态 */
.cp-hint {
  color: #777;
  font-size: 12px;
  line-height: 1.5;
}

.cp-empty {
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
}

/* 错误提示 */
.cp-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(255, 95, 95, 0.08);
  border: 1px solid rgba(255, 95, 95, 0.2);
  color: #ff9999;
  font-size: 12px;
  line-height: 1.5;
}

.cp-error-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* 底部按钮 */
.cp-dialog-footer {
  display: flex;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid #2a2a2a;
}

.cp-btn {
  flex: 1;
  padding: 9px 16px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.cp-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cp-btn-cancel {
  background: #252525;
  color: #ccc;
}

.cp-btn-cancel:hover:not(:disabled) {
  background: #2d2d2d;
  border-color: #555;
}

.cp-btn-confirm {
  background: rgba(67, 242, 96, 0.15);
  border-color: rgba(67, 242, 96, 0.4);
  color: #43f260;
}

.cp-btn-confirm:hover:not(:disabled) {
  background: rgba(67, 242, 96, 0.25);
  border-color: rgba(67, 242, 96, 0.7);
  color: #8df2a0;
}

/* ---- 管理面板 ---- */
.cp-panel {
  position: relative;
  border-radius: 12px;
  border: 1px solid #3d3d3d;
  background: linear-gradient(180deg, #1f1f1f 0%, #191919 100%);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}

/* 右上角刷新按钮 */
.cp-panel-refresh {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  z-index: 1;
  transition:
    color 0.15s,
    background 0.15s;
}

.cp-panel-refresh:hover:not(:disabled) {
  color: #43f260;
  background: rgba(67, 242, 96, 0.1);
}

.cp-panel-refresh:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.cp-panel-refresh svg {
  width: 15px;
  height: 15px;
}

.cp-panel-refresh svg.is-spinning {
  animation: cp-refresh-spin 0.8s linear infinite;
}

@keyframes cp-refresh-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.cp-panel-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 22px;
}

/* 房间名称、ID、标签同一行 */
.cp-panel-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cp-panel-room-name {
  color: #f5f5f5;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}

.cp-panel-room-id {
  color: #666;
  font-size: 11px;
  font-family: monospace;
  white-space: nowrap;
}

.cp-panel-badges {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

/* 房间描述：默认最多两行，溢出省略；展开时显示全部 */
.cp-panel-desc-wrap {
  position: relative;
  margin-top: 2px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
  border: 1px solid #262626;
}

.cp-panel-desc {
  color: #aaa;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
  /* 默认两行截断 */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

/* 展开状态：显示全部内容 */
.cp-panel-desc.is-expanded {
  -webkit-line-clamp: unset;
  overflow: visible;
}

/* 展开/收起按钮：绝对定位在尾行末尾，渐变背景让文字自然渐隐到按钮，避免上方留白 */
.cp-desc-toggle {
  position: absolute;
  right: 4px;
  bottom: 4px;
  background: linear-gradient(to right, rgba(31, 31, 31, 0) 0%, #1f1f1f 35%, #1f1f1f 100%);
  border: none;
  color: #43f260;
  font-size: 11px;
  cursor: pointer;
  padding: 0 2px 0 14px;
  line-height: 1.5;
  border-radius: 3px;
}

.cp-desc-toggle:hover {
  text-decoration: underline;
}

.cp-panel-creator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #2a2a2a;
}

.cp-panel-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid #3a3a3a;
  background: #1c1c1c;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.cp-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

/* 在线状态指示点：定位在头像圆形边缘右下 45° 处 */
.cp-online-dot {
  position: absolute;
  right: 1px;
  bottom: 1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #555;
  border: 1px solid #1c1c1c;
  transition: background 0.2s;
}
.cp-online-dot.is-online {
  background: #4ade80;
  box-shadow: 0 0 4px rgba(74, 222, 128, 0.6);
}

.cp-avatar-fallback {
  color: #9cf0ad;
  font-size: 12px;
  font-weight: 700;
}

.cp-panel-creator-info {
  flex: 1;
  min-width: 0;
}

.cp-panel-creator-name {
  color: #eee;
  font-size: 13px;
  font-weight: 600;
}

.cp-panel-creator-role {
  color: #666;
  font-size: 11px;
}

.cp-panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cp-panel-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
}

.cp-panel-member-count {
  color: #777;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.cp-panel-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #666;
  font-size: 12px;
  padding: 18px 0;
}

.cp-loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(67, 242, 96, 0.25);
  border-top-color: #43f260;
  border-radius: 50%;
  animation: cp-refresh-spin 0.8s linear infinite;
}

/* 成员列表：卡片网格，至少两列自适应 */
.cp-member-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(138px, 1fr));
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  padding: 2px;
}

/* 成员分区展开/收起按钮（标题旁） */
.cp-section-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
  padding: 0;
  margin-left: auto;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.cp-section-toggle:hover {
  color: #43f260;
  background: rgba(67, 242, 96, 0.1);
}

.cp-section-toggle svg {
  width: 14px;
  height: 14px;
}

/* 成员卡片：纵向布局，头像 + 名称 + 用户名 + 标签 + 加入时间 */
.cp-member-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px 6px;
  border-radius: 8px;
  border: 1px solid #2c2c2c;
  background: #1a1a1a;
  text-align: center;
  min-width: 0;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.cp-member-card:hover {
  border-color: #444;
  background: #222;
  transform: translateY(-1px);
}

.cp-member-card.is-online {
  border-color: rgba(74, 222, 128, 0.22);
}

.cp-member-card.is-creator {
  border-color: rgba(67, 242, 96, 0.4);
  background: rgba(67, 242, 96, 0.05);
}

.cp-member-card.is-me {
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(96, 165, 250, 0.05);
}

.cp-member-card.is-confirming {
  border-color: rgba(255, 95, 95, 0.5);
  background: rgba(255, 95, 95, 0.06);
  transform: none;
}

/* 头部：头像 + 在线状态点 */
.cp-member-card-head {
  display: flex;
  align-items: center;
  justify-content: center;
}

.cp-member-card-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid #3a3a3a;
  background: #1c1c1c;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  /* 注意：不要加 overflow: hidden，否则右下角的在线状态点会被裁切 */
}

.cp-member-card-avatar .cp-avatar-img,
.cp-member-card-avatar .cp-avatar-fallback {
  border-radius: 50%;
  clip-path: circle(50%);
}

.cp-member-card.is-online .cp-member-card-avatar {
  border-color: rgba(74, 222, 128, 0.5);
}

/* 名称与用户名 */
.cp-member-card-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  width: 100%;
  min-width: 0;
}

.cp-member-card-name {
  color: #eee;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-member-card-username {
  color: #777;
  font-size: 10px;
  line-height: 1.3;
  font-family: monospace;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 标签行 */
.cp-member-card-badges {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
  min-height: 16px;
}

/* 加入时间 */
.cp-member-card-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #666;
  font-size: 10px;
  line-height: 1.3;
}

.cp-member-card-meta svg {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
}

/* 成员操作区（仅创建者可见） */
.cp-member-card-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding-top: 6px;
  border-top: 1px solid #2a2a2a;
}

.cp-member-role-select {
  background: #1a1a1a;
  border: 1px solid #3a3a3a;
  color: #ddd;
  font-size: 10px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
}

.cp-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
}

.cp-icon-btn svg {
  width: 12px;
  height: 12px;
}

.cp-icon-btn-remove:hover {
  color: #ff8888;
  background: rgba(255, 95, 95, 0.1);
}

.cp-icon-btn-transfer:hover {
  color: #8db8f5;
  background: rgba(96, 165, 250, 0.1);
}

.cp-confirm-text {
  color: #ff9999;
  font-size: 11px;
}

.cp-confirm-btn {
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #ccc;
  font-size: 10px;
  cursor: pointer;
}

.cp-confirm-yes {
  border-color: rgba(255, 95, 95, 0.4);
  color: #ff9999;
}

.cp-confirm-yes:hover {
  background: rgba(255, 95, 95, 0.15);
}

.cp-confirm-no:hover {
  background: #333;
}

/* 操作按钮：同一行 */
.cp-panel-actions {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  border-top: 1px solid #2a2a2a;
  padding-top: 8px;
}

.cp-panel-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 7px 10px;
  border-radius: 8px;
  border: 1px solid #333;
  background: #252525;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.cp-panel-action:hover {
  border-color: #555;
  background: #2d2d2d;
}

.cp-panel-action-danger {
  border-color: rgba(255, 95, 95, 0.25);
  color: #ff9999;
}

.cp-panel-action-danger:hover {
  background: rgba(255, 95, 95, 0.1);
  border-color: rgba(255, 95, 95, 0.5);
}

.cp-action-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

/* 转让房间确认弹窗（覆盖层：fixed 定位由内联 style 动态设置，精确覆盖面板可视区域） */
.cp-transfer-mask {
  background: rgba(0, 0, 0, 0.7);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 10;
}

.cp-transfer-box {
  width: 100%;
  background: #1f1f1f;
  border: 1px solid #3d3d3d;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-transfer-title {
  color: #f5f5f5;
  font-size: 14px;
  font-weight: 700;
}

.cp-transfer-content {
  color: #ccc;
  font-size: 12px;
  line-height: 1.6;
}

.cp-transfer-name {
  color: #43f260;
  font-weight: 600;
}

.cp-transfer-actions {
  display: flex;
  gap: 8px;
}

.cp-transfer-actions .cp-btn {
  flex: 1;
  padding: 7px 12px;
  font-size: 12px;
}

/* ---- 过渡动画 ---- */
.cp-dialog-fade-enter-active,
.cp-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.cp-dialog-fade-enter-active .cp-dialog,
.cp-dialog-fade-leave-active .cp-dialog {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.cp-dialog-fade-enter-from,
.cp-dialog-fade-leave-to {
  opacity: 0;
}

.cp-dialog-fade-enter-from .cp-dialog,
.cp-dialog-fade-leave-to .cp-dialog {
  transform: scale(0.95) translateY(-8px);
  opacity: 0;
}

.cp-panel-fade-enter-active,
.cp-panel-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.cp-panel-fade-enter-from,
.cp-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 滚动条 */
.cp-dialog-body::-webkit-scrollbar,
.cp-search-results::-webkit-scrollbar,
.cp-member-grid::-webkit-scrollbar,
.cp-panel::-webkit-scrollbar,
.cp-project-dropdown::-webkit-scrollbar {
  width: 5px;
}

.cp-dialog-body::-webkit-scrollbar-thumb,
.cp-search-results::-webkit-scrollbar-thumb,
.cp-member-grid::-webkit-scrollbar-thumb,
.cp-panel::-webkit-scrollbar-thumb,
.cp-project-dropdown::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 999px;
}

@media (max-width: 480px) {
  .cp-dialog {
    max-width: 100%;
  }

  .cp-form-row {
    flex-direction: column;
    gap: 10px;
  }
}

/* 手机横屏等矮视口：保证面板完整显示并可滚动 */
@media (max-height: 500px) and (orientation: landscape) {
  .cp-panel {
    padding: 8px 10px;
    gap: 6px;
    border-radius: 8px;
  }

  .cp-panel-room-name {
    font-size: 13px;
  }

  .cp-panel-creator {
    padding: 4px 8px;
  }

  .cp-panel-avatar {
    width: 24px;
    height: 24px;
  }

  .cp-member-grid {
    max-height: 140px;
  }

  .cp-member-card-avatar {
    width: 30px;
    height: 30px;
  }

  .cp-online-dot {
    right: 0;
    bottom: 0;
  }

  .cp-panel-actions {
    padding-top: 6px;
  }

  .cp-panel-action {
    padding: 5px 8px;
    font-size: 11px;
  }

  .cp-panel-desc-wrap {
    padding: 4px 6px;
  }

  .cp-panel-desc {
    font-size: 11px;
  }
}

/* ==================== 是否需要批准 标签 ==================== */
.cp-badge.is-approval {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.3);
}

.cp-badge.is-no-approval {
  background: rgba(96, 165, 250, 0.12);
  color: #8db8f5;
  border-color: rgba(96, 165, 250, 0.3);
}

/* 只读输入框 */
.cp-input-readonly {
  opacity: 0.7;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.03);
}

/* ==================== 申请加入表单浮窗 ==================== */
.cp-apply-mask {
  position: fixed;
  inset: 0;
  z-index: 1400;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.cp-apply-box {
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - 32px);
  border-radius: 16px;
  border: 1px solid #3d3d3d;
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cp-apply-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #2a2a2a;
}

.cp-apply-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
}

.cp-apply-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #999;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.cp-apply-close:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #e0e0e0;
}

.cp-apply-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cp-apply-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cp-apply-room-name {
  font-size: 14px;
  font-weight: 600;
  color: #43f260;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(67, 242, 96, 0.08);
  border: 1px solid rgba(67, 242, 96, 0.2);
}

.cp-apply-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid #2a2a2a;
}
</style>
