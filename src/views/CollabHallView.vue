<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { roomApi } from '@/api/room'
import { useSessionGuard } from '@/composables/useSessionGuard'
import { useAuthStore } from '@/store/authStore'
import { storeToRefs } from 'pinia'
import { ApiError } from '@/api/client'
import type { Room, HallSort, RoomApplication } from '@/types/room'
import ProxiedImage from '@/components/ProxiedImage.vue'
import { collabRoomEvents, type CollabRoomEvent } from '@/utils/collabRoomEvents'
import { readActiveRoomIds, activeRoomStorageKeys } from '@/utils/activeRoomRegistry'

const router = useRouter()
const authStore = useAuthStore()
const { user } = storeToRefs(authStore)

useSessionGuard({
  onInvalidated: () => {
    router.replace({ path: '/login', query: { reason: 'expired', redirect: '/collab-hall' } })
  },
})

// ---- 当前正在协作的房间检测（跨 Tab 共享，参考房间列表页）----
// 采用多条目注册表（roomId → 心跳时间戳）：每个编辑器 Tab 只登记/刷新/注销
// 自己的房间，多 Tab 同时加入不同房间时互不覆盖；读取时校验 TTL 新鲜度，
// 避免编辑器 Tab 被直接关闭后标记残留。
const activeRoomIds = ref<Set<string>>(new Set())

const refreshActiveRoom = () => {
  activeRoomIds.value = readActiveRoomIds()
}

const isActiveRoom = (room: Room): boolean => activeRoomIds.value.has(room.id)

const allRooms = ref<Room[]>([])
const isLoading = ref(false)
const searchKeyword = ref('')
const currentSort = ref<HallSort>('latest')
const joiningRoomId = ref<string | null>(null)

// ---- 懒加载：滚动到底部附近时追加渲染一批 ----
// 一次性拉取全部公开房间数据，但只渲染前 visibleCount 个卡片，
// 接近底部时再追加，避免房间很多时首屏一次性挂载大量 DOM。
const LAZY_BATCH_SIZE = 12
const visibleCount = ref(LAZY_BATCH_SIZE)
const bodyRef = ref<HTMLElement | null>(null)
const showBackToTop = ref(false)

const hasMore = computed(() => visibleCount.value < filteredRooms.value.length)
const visibleRooms = computed(() => filteredRooms.value.slice(0, visibleCount.value))

const loadMore = () => {
  if (!hasMore.value) return
  visibleCount.value = Math.min(visibleCount.value + LAZY_BATCH_SIZE, filteredRooms.value.length)
}

const onBodyScroll = () => {
  const el = bodyRef.value
  if (!el) return
  showBackToTop.value = el.scrollTop > 240
  if (!hasMore.value) return
  // 距离底部 400px 内即预加载下一批，滚动无停顿感
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 400) {
    loadMore()
  }
}

const scrollToTop = () => {
  bodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 搜索/排序变化时重置懒加载窗口，避免"结果变少了但已渲染很多"的错位 */
const resetVisible = () => {
  visibleCount.value = LAZY_BATCH_SIZE
  bodyRef.value?.scrollTo({ top: 0 })
}

// 我的申请状态缓存（用于显示"正在审核"遮罩）
const myApplicationsByRoom = computed(() => {
  const map = new Map<string, RoomApplication>()
  if (!user.value?.id) return map
  myApplications.value.forEach(app => {
    if (!map.has(app.roomId)) map.set(app.roomId, app)
  })
  return map
})
const myApplications = ref<RoomApplication[]>([])

// 排序方向（组件内 UI 概念，不进入共享类型）
type HallSortDir = 'asc' | 'desc'

const sortOptions: {
  value: HallSort
  defaultDir: HallSortDir
  labels: Record<HallSortDir, string>
}[] = [
  { value: 'latest', defaultDir: 'desc', labels: { desc: '最新', asc: '最早' } },
  { value: 'active', defaultDir: 'desc', labels: { desc: '最多在线', asc: '最少在线' } },
  { value: 'members', defaultDir: 'desc', labels: { desc: '最多成员', asc: '最少成员' } },
  { value: 'capacity', defaultDir: 'desc', labels: { desc: '最大容量', asc: '最小容量' } },
]

// 各维度的排序方向记忆：每个维度各自记住上次选定的方向，切换维度互不影响。
// 仅存活于组件实例内存中（页面刷新即回到 defaultDir），不写入 localStorage / sessionStorage。
const sortDirMap = ref<Record<HallSort, HallSortDir>>(
  Object.fromEntries(sortOptions.map((o) => [o.value, o.defaultDir])) as Record<
    HallSort,
    HallSortDir
  >,
)

/** 按钮文案：取自该维度自己记住的方向（含未激活的维度，故切换维度不丢失方向） */
const sortLabelOf = (opt: (typeof sortOptions)[number]) => opt.labels[sortDirMap.value[opt.value]]

// 客户端排序：大厅一次性加载全部公开房间后，本地按需排序
const filteredRooms = computed(() => {
  const rooms = [...allRooms.value]
  // asc → 1 / desc → -1，统一乘到比较结果上
  const dir = sortDirMap.value[currentSort.value] === 'asc' ? 1 : -1
  switch (currentSort.value) {
    case 'active':
      rooms.sort((a, b) => ((a.onlineCount || 0) - (b.onlineCount || 0)) * dir)
      break
    case 'members':
      rooms.sort((a, b) => ((a.memberCount || 0) - (b.memberCount || 0)) * dir)
      break
    case 'capacity':
      rooms.sort((a, b) => ((a.maxMembers || 0) - (b.maxMembers || 0)) * dir)
      break
    default:
      rooms.sort(
        (a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir,
      )
  }
  return rooms
})

const loadRooms = async (silent = false) => {
  if (!silent) isLoading.value = true
  try {
    allRooms.value = await roomApi.getHallRooms(searchKeyword.value.trim() || undefined)
    // 列表变短时收敛已渲染窗口，避免 visibleRooms 越界（slice 本身安全，这里是状态一致性）
    if (visibleCount.value > allRooms.value.length) {
      visibleCount.value = Math.max(LAZY_BATCH_SIZE, allRooms.value.length)
    }
    // 同时加载当前用户的申请状态
    if (user.value?.id) {
      myApplications.value = await roomApi.getMyApplications()
    }
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '加载房间失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    isLoading.value = false
  }
}

// 审核中弹窗
const pendingReviewPopupOpen = ref(false)
const closePendingReviewPopup = () => {
  pendingReviewPopupOpen.value = false
}

// 申请加入弹窗
const applyPopupOpen = ref(false)
const selectedApplyRoom = ref<Room | null>(null)
const applyForm = ref<{ requestedRole: 'viewer' | 'editor'; reason: string }>({
  requestedRole: 'viewer',
  reason: '',
})
const applySubmitting = ref(false)
const closeApplyPopup = () => {
  applyPopupOpen.value = false
  selectedApplyRoom.value = null
  applySubmitting.value = false
}

const submitApplication = async () => {
  if (!selectedApplyRoom.value) return
  applySubmitting.value = true
  try {
    await roomApi.submitApplication(selectedApplyRoom.value.id, {
      requestedRole: applyForm.value.requestedRole,
      reason: applyForm.value.reason || undefined,
    })
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '申请已提交，等待房主审核', scope: 'global' } }),
    )
    closeApplyPopup()
    // 刷新申请状态，使卡片显示"正在审核"遮罩
    await loadRooms()
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '申请提交失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    applySubmitting.value = false
  }
}

const handleSearch = () => {
  resetVisible()
  loadRooms()
}

const handleSort = (sort: HallSort) => {
  if (currentSort.value === sort) {
    // 重复点击同一按钮：切换该维度的排序方向（如「最多在线」⇄「最少在线」）
    sortDirMap.value[sort] = sortDirMap.value[sort] === 'desc' ? 'asc' : 'desc'
  } else {
    // 切换到另一维度：沿用该维度上次记住的方向，不重置
    currentSort.value = sort
  }
  // 客户端排序，无需重新请求；重置懒加载窗口避免错位
  resetVisible()
}

const formatTime = (iso: string): string => {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isPendingReview = (room: Room): boolean => {
  const app = myApplicationsByRoom.value.get(room.id)
  return !!app && app.status === 'PENDING'
}

const joinRoom = async (room: Room) => {
  if (joiningRoomId.value) return

  // 已在协作中：不执行加入流程，仅提示
  if (isActiveRoom(room)) {
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '你已在房间中，无需重复加入。', scope: 'global' } }),
    )
    return
  }

  // 已有权限进入（创建者 or 已是成员）→ 直接执行加入协作房间流程
  if (room.ownerId === user.value?.id || room.isMember) {
    doJoinRoom(room)
    return
  }

  // 如果有正在审核中的申请，弹出提示（只能通过确认按钮关闭）
  if (isPendingReview(room)) {
    pendingReviewPopupOpen.value = true
    return
  }

  // 如果房间需要批准且没有正在审核中的申请，弹出"申请加入"浮窗
  if (room.approvalRequired) {
    selectedApplyRoom.value = room
    applyPopupOpen.value = true
    return
  }

  // 无需批准，直接加入
  doJoinRoom(room)
}

const doJoinRoom = async (room: Room) => {
  joiningRoomId.value = room.id
  try {
    const joinResult = await roomApi.joinRoom(room.id)
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
    window.dispatchEvent(
      new CustomEvent('toast', { detail: { msg: '正在加入协作房间...', scope: 'global' } }),
    )
    const resolved = router.resolve({ name: 'editor', query: { roomId: room.id } })
    window.open(resolved.href, '_blank')
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '加入房间失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    joiningRoomId.value = null
  }
}

const goToEditor = () => router.push('/')
const goToRooms = () => router.push('/rooms')

// ---- 跨 Tab 协作事件 / active-room 标记同步 ----
const handleCollabRoomEvent = (event: CollabRoomEvent) => {
  if (event.type === 'join' || event.type === 'leave') {
    refreshActiveRoom()
  }
}

const handleStorageEvent = (e: StorageEvent) => {
  if (e.key && activeRoomStorageKeys.includes(e.key)) {
    refreshActiveRoom()
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refreshActiveRoom()
  loadRooms()
  // 跨 Tab 同步：active-room 标记变化时立即刷新高亮
  window.addEventListener('storage', handleStorageEvent)
  collabRoomEvents.on(handleCollabRoomEvent)
  // 懒加载滚动监听
  if (bodyRef.value) {
    bodyRef.value.addEventListener('scroll', onBodyScroll, { passive: true })
  }
  // 定时轮询：实时同步在线人数、标签、房间信息（静默刷新，不触发 loading 骨架）
  // 间隔 15 秒（与房间列表页对齐）：大厅轮询的目的只是刷新 onlineCount 与标签，
  // 而在线状态本身由信令服务器的实时 peer 查询提供，3 秒一轮并无额外精度收益，
  // 却让每轮多打一批请求（hall + myApplications + peers）。
  pollTimer = setInterval(() => {
    void loadRooms(true)
    refreshActiveRoom()
  }, 15_000)
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', handleStorageEvent)
  collabRoomEvents.off(handleCollabRoomEvent)
  if (bodyRef.value) {
    bodyRef.value.removeEventListener('scroll', onBodyScroll)
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="hall-page">
    <div class="hall-sticky-top">
      <header class="hall-header">
        <div class="hall-header-inner">
          <img src="@/assets/GeoMesh3D_logo_white_1240x300.png" class="hall-logo" @click="goToEditor" alt="GeoMesh3D" />
          <h1 class="hall-title">协作大厅</h1>
          <div class="hall-header-actions">
            <div class="hall-action-wrap">
              <button class="hall-header-action-btn" @click="goToRooms" title="房间列表">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </button>
              <div class="hall-tooltip">房间列表</div>
            </div>
          </div>
        </div>
      </header>
      <div class="hall-toolbar">
        <div class="hall-search-bar">
          <svg class="hall-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            v-model="searchKeyword"
            class="hall-search-input"
            type="text"
            placeholder="搜索房间名称或描述..."
            @keyup.enter="handleSearch"
          />
          <button v-if="searchKeyword" class="hall-search-clear" @click="searchKeyword = ''; handleSearch()">×</button>
        </div>
        <div class="hall-sort-bar">
          <!-- 每个按钮各自记住自己的排序方向；重复点击同一按钮切换方向，箭头指示该维度当前方向 -->
          <button
            v-for="opt in sortOptions"
            :key="opt.value"
            class="hall-sort-btn"
            :class="{ active: currentSort === opt.value }"
            @click="handleSort(opt.value)"
          >
            {{ sortLabelOf(opt) }}
            <span class="hall-sort-arrow" :class="{ 'is-dim': currentSort !== opt.value }">{{
              sortDirMap[opt.value] === 'asc' ? '↑' : '↓'
            }}</span>
          </button>
        </div>
      </div>
      <div class="hall-divider"></div>
    </div>

    <div ref="bodyRef" class="hall-body">
      <div class="hall-body-inner">
        <div v-if="isLoading" class="hall-loading">
          <div class="hall-spinner"></div>
          <span>加载中...</span>
        </div>
        <div v-else-if="filteredRooms.length === 0" class="hall-empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <p>暂无公开房间</p>
        </div>
        <template v-else>
        <div class="hall-grid">
          <div
            v-for="room in visibleRooms"
            :key="room.id"
            class="hall-card"
            :class="{
              'is-active': isActiveRoom(room),
              'is-pending-review': isPendingReview(room),
            }"
            @click="joinRoom(room)"
          >
            <div class="hall-card-cover">
              <!-- 在线标签（当前正在此房间协作） -->
              <span v-if="isActiveRoom(room)" class="hall-online-tag">在线</span>
              <ProxiedImage
                v-if="room.projectThumbnailUrl"
                :src="room.projectThumbnailUrl"
                class="hall-card-img"
                alt=""
              />
              <div v-else class="hall-card-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <!-- 正在审核遮罩 -->
              <div v-if="isPendingReview(room)" class="hall-pending-overlay">
                <span class="hall-pending-text">正在审核...</span>
              </div>
              <div class="hall-card-overlay">
                <span class="hall-card-online">
                  <span class="hall-online-dot"></span>
                  {{ room.onlineCount }}/{{ room.maxMembers }}人在线
                </span>
                <span v-if="room.approvalRequired" class="hall-card-badge is-approval">需要批准</span>
                <span v-else class="hall-card-badge is-open">无需批准</span>
              </div>
            </div>
            <div class="hall-card-info">
              <div class="hall-card-name" :title="room.name">{{ room.name }}</div>
              <div class="hall-card-desc" v-if="room.description">{{ room.description }}</div>
              <div class="hall-card-meta">
                <span class="hall-card-owner">{{ room.ownerName || '未知' }}</span>
                <span class="hall-card-time">{{ formatTime(room.createdAt) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 懒加载状态：还有更多时显示触发按钮（滚动也会自动加载），到底显示结束提示 -->
        <div v-if="hasMore" class="hall-load-more">
          <button class="hall-load-more-btn" @click="loadMore">加载更多</button>
        </div>
        <div v-else class="hall-list-end">已显示全部 {{ filteredRooms.length }} 个房间</div>
        </template>
      </div>
    </div>

    <!-- 回到顶部悬浮按钮 -->
    <Transition name="backtop-fade">
      <button
        v-if="showBackToTop"
        class="hall-back-to-top"
        @click="scrollToTop"
        title="回到顶部"
        aria-label="回到顶部"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>
    </Transition>

    <!-- 申请加入浮窗（需要批准的房间） -->
    <Transition name="hall-fade">
      <div v-if="applyPopupOpen" class="hall-mask" @click.self="closeApplyPopup">
        <div class="hall-popup hall-apply-popup">
          <div class="hall-popup-header">
            <h3 class="hall-popup-title">申请加入房间</h3>
            <button class="hall-popup-close" @click="closeApplyPopup" :disabled="applySubmitting">×</button>
          </div>
          <div class="hall-popup-body">
            <div class="hall-apply-room-name">{{ selectedApplyRoom?.name }}</div>
            <div class="hall-form-group">
              <label class="hall-label">用户名</label>
              <input type="text" class="hall-input hall-input-readonly" :value="user?.username || ''" readonly />
            </div>
            <div class="hall-form-group">
              <label class="hall-label">昵称</label>
              <input type="text" class="hall-input hall-input-readonly" :value="user?.nickname || user?.username || ''" readonly />
            </div>
            <div class="hall-form-group">
              <label class="hall-label">申请协作权限类型 <span class="hall-required">*</span></label>
              <select v-model="applyForm.requestedRole" class="hall-input" :disabled="applySubmitting">
                <option value="viewer">仅观看</option>
                <option value="editor">可编辑</option>
              </select>
            </div>
            <div class="hall-form-group">
              <label class="hall-label">申请理由（选填）</label>
              <textarea v-model="applyForm.reason" class="hall-input hall-textarea" rows="3" placeholder="请输入申请理由..." :disabled="applySubmitting"></textarea>
            </div>
          </div>
          <div class="hall-popup-footer">
            <button class="hall-popup-btn hall-popup-cancel" @click="closeApplyPopup" :disabled="applySubmitting">取消</button>
            <button class="hall-popup-btn hall-popup-submit" :disabled="applySubmitting" @click="submitApplication">
              {{ applySubmitting ? '提交中...' : '提交' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 审核中提示浮窗（只能通过确认按钮关闭） -->
    <Transition name="hall-fade">
      <div v-if="pendingReviewPopupOpen" class="hall-mask">
        <div class="hall-popup hall-review-popup">
          <div class="hall-popup-header">
            <h3 class="hall-popup-title">提示</h3>
          </div>
          <div class="hall-popup-body hall-review-body">
            <p class="hall-review-msg">申请正在审核，请耐心等待。</p>
          </div>
          <div class="hall-popup-footer">
            <button class="hall-popup-btn hall-popup-submit" @click="closePendingReviewPopup">确认</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hall-page {
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
.hall-sticky-top {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    linear-gradient(180deg, #141414 0%, #121212 100%);
}
.hall-header { padding: 20px 28px; }
.hall-header-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}
.hall-logo {
  height: 32px;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.15s ease;
}
.hall-logo:hover { opacity: 1; }
.hall-title {
  font-size: 22px;
  font-weight: 700;
  color: #f5f5f5;
  margin: 0;
  flex: 1;
}
.hall-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hall-header-action-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.hall-header-action-btn:hover {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}
.hall-header-action-btn svg { width: 18px; height: 18px; }

.hall-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 28px 16px;
}
.hall-search-bar {
  position: relative;
  flex: 1;
  max-width: 480px;
}
.hall-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: #888;
  pointer-events: none;
}
.hall-search-input {
  width: 100%;
  padding: 9px 36px 9px 38px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #1a1a1a;
  color: #f5f5f5;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}
.hall-search-input::placeholder { color: #777; }
.hall-search-input:focus { border-color: #43f260; box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1); }
.hall-search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
  padding: 4px;
}
.hall-search-clear:hover { color: #ccc; }

.hall-sort-bar {
  display: flex;
  gap: 8px;
}
.hall-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.hall-sort-btn:hover {
  border-color: #555;
  color: #f5f5f5;
  background: #2a2a2a;
}
.hall-sort-btn.active {
  border-color: #43f260;
  color: #43f260;
  background: rgba(67, 242, 96, 0.08);
}
/* 排序方向箭头：每个按钮显示自己记住的方向 */
.hall-sort-arrow {
  font-size: 12px;
  line-height: 1;
}
/* 非当前生效的维度：箭头降透明度，突出真正生效的排序 */
.hall-sort-arrow.is-dim {
  opacity: 0.5;
}

.hall-divider {
  height: 1px;
  background: #2a2a2a;
  margin: 0 28px;
}

.hall-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}
.hall-body-inner {
  max-width: 1600px;
  margin: 0 auto;
}

.hall-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: #888;
}
.hall-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #3d3d3d;
  border-top-color: #43f260;
  border-radius: 50%;
  animation: hall-spin 0.8s linear infinite;
}
@keyframes hall-spin { to { transform: rotate(360deg); } }

.hall-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: #666;
}
.hall-empty svg { width: 48px; height: 48px; }
.hall-empty p { margin: 0; font-size: 15px; }

.hall-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.hall-card {
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  border: 1px solid #3d3d3d;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}
.hall-card:hover {
  border-color: #43f260;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(67, 242, 96, 0.15);
  transform: translateY(-2px);
}
/* 当前正在协作的房间：绿色边框高亮 */
.hall-card.is-active {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.25);
}
/* 正在审核的房间：黄色边框高亮 */
.hall-card.is-pending-review {
  border-color: #ffb450;
  box-shadow: 0 0 0 2px rgba(255, 180, 80, 0.2);
}

.hall-card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111;
  overflow: hidden;
}
/* 在线标签（当前正在此房间协作） */
.hall-online-tag {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 3;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(67, 242, 96, 0.9);
  color: #0a1a0f;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}
.hall-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.hall-card:hover .hall-card-img { transform: scale(1.05); }
.hall-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #444;
}
.hall-card-placeholder svg { width: 48px; height: 48px; }

.hall-card-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.hall-card-online {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #ddd;
}
.hall-online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #43f260;
  box-shadow: 0 0 4px rgba(67, 242, 96, 0.6);
}
.hall-card-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.hall-card-badge.is-open {
  background: rgba(67, 242, 96, 0.15);
  color: #43f260;
}
.hall-card-badge.is-approval {
  background: rgba(255, 180, 80, 0.15);
  color: #ffb450;
}

.hall-card-info {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.hall-card-name {
  font-size: 15px;
  font-weight: 600;
  color: #f5f5f5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hall-card-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.hall-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 4px;
}
.hall-card-owner {
  font-size: 12px;
  color: #aaa;
}
.hall-card-time {
  font-size: 12px;
  color: #777;
}

/* ---- 顶部按钮 tooltip（参考房间列表页） ---- */
.hall-action-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.hall-tooltip {
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
.hall-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: #2a2a2a;
}
.hall-action-wrap:hover .hall-tooltip {
  opacity: 1;
  visibility: visible;
}

/* ---- 正在审核遮罩 ---- */
.hall-pending-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  z-index: 2;
}
.hall-pending-text {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 1px;
}

/* ---- 弹窗通用 ---- */
.hall-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}
.hall-popup {
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  border: 1px solid #3d3d3d;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 480px;
  max-width: 100%;
}
.hall-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #2a2a2a;
}
.hall-popup-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0;
  color: #f5f5f5;
}
.hall-popup-close {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s ease;
}
.hall-popup-close:hover:not(:disabled) {
  color: #f5f5f5;
}
.hall-popup-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hall-popup-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: rgba(140, 140, 140, 0.4) transparent;
}
.hall-popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid #2a2a2a;
}
.hall-popup-btn {
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.hall-popup-cancel {
  background: #2a2a2a;
  color: #aaa;
}
.hall-popup-cancel:hover:not(:disabled) {
  background: #333;
}
.hall-popup-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.hall-popup-submit {
  background: #43f260;
  color: #0a1a0f;
}
.hall-popup-submit:hover:not(:disabled) {
  background: #5cf87a;
}
.hall-popup-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ---- 申请加入浮窗表单 ---- */
.hall-apply-room-name {
  font-size: 15px;
  font-weight: 600;
  color: #e0e0e0;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
}
.hall-form-group {
  margin-bottom: 14px;
}
.hall-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #b0b0b0;
  margin-bottom: 6px;
}
.hall-required {
  color: #ef4444;
}
.hall-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  font-size: 14px;
  color: #e0e0e0;
  background: #1a1a1a;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.hall-input:focus {
  outline: none;
  border-color: #43f260;
  box-shadow: 0 0 0 3px rgba(67, 242, 96, 0.1);
}
.hall-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.hall-input-readonly {
  background: rgba(255, 255, 255, 0.03);
  color: #777;
  cursor: not-allowed;
}
.hall-textarea {
  resize: vertical;
}

/* ---- 审核中提示浮窗 ---- */
.hall-review-popup {
  width: 360px;
}
.hall-review-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}
.hall-review-msg {
  font-size: 15px;
  color: #e0e0e0;
  margin: 0;
  text-align: center;
}

/* ---- 弹窗过渡 ---- */
.hall-fade-enter-active,
.hall-fade-leave-active {
  transition: opacity 0.2s ease;
}
.hall-fade-enter-from,
.hall-fade-leave-to {
  opacity: 0;
}
.hall-fade-enter-active .hall-popup,
.hall-fade-leave-active .hall-popup {
  transition: transform 0.2s ease;
}
.hall-fade-enter-from .hall-popup,
.hall-fade-leave-to .hall-popup {
  transform: scale(0.96);
}

/* ---- 懒加载 ---- */
.hall-load-more {
  display: flex;
  justify-content: center;
  padding: 28px 0 8px;
}
.hall-load-more-btn {
  padding: 9px 28px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.hall-load-more-btn:hover {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
}
.hall-list-end {
  text-align: center;
  padding: 24px 0 8px;
  color: #666;
  font-size: 12px;
}

/* ---- 回到顶部 ---- */
.hall-back-to-top {
  position: fixed;
  right: 28px;
  bottom: 32px;
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
.hall-back-to-top svg {
  width: 20px;
  height: 20px;
}
.hall-back-to-top:hover {
  transform: translateY(-2px);
  border-color: rgba(67, 242, 96, 0.7);
  color: #8df2a0;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(67, 242, 96, 0.18);
}
.hall-back-to-top:active {
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
</style>
