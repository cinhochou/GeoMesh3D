<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { projectApi } from '@/api/project'
import { userApi } from '@/api/user'
import { useSessionGuard } from '@/composables/useSessionGuard'
import { ApiError } from '@/api/client'
import type { Project } from '@/types/project'
import ProxiedImage from '@/components/ProxiedImage.vue'
import { mergeArrayById } from '@/utils/reactiveMerge'
import { withThumbnailVersion } from '@/utils/imageCache'

const router = useRouter()

useSessionGuard({
  onInvalidated: () => {
    router.replace({ path: '/login', query: { reason: 'expired', redirect: '/public-resources' } })
  },
})

// ---- 数据 ----
const allProjects = ref<Project[]>([])
const isLoading = ref(false)
const ownerMap = ref<Record<string, string>>({})
const searchKeyword = ref('')
// 已上报浏览量的项目（本会话内去重，减少无谓请求；后端另有 5 分钟窗口去重）
const viewedProjectIds = new Set<string>()

type PublicSort = 'latest' | 'views' | 'clones' | 'name'
type SortDir = 'asc' | 'desc'

// 排序维度定义：同一按钮重复点击可切换方向（如「最多浏览」⇄「最少浏览」），
// labels 按方向给出两套文案，defaultDir 为首次点选该维度时的默认方向。
const sortOptions: {
  value: PublicSort
  defaultDir: SortDir
  labels: Record<SortDir, string>
}[] = [
  { value: 'latest', defaultDir: 'desc', labels: { desc: '最新', asc: '最早' } },
  { value: 'views', defaultDir: 'desc', labels: { desc: '最多浏览', asc: '最少浏览' } },
  { value: 'clones', defaultDir: 'desc', labels: { desc: '最多另存', asc: '最少另存' } },
  { value: 'name', defaultDir: 'asc', labels: { asc: '名称升序', desc: '名称降序' } },
]

const currentSort = ref<PublicSort>('latest')
// 各维度的排序方向记忆：每个维度各自记住上次选定的方向，切换维度互不影响。
// 仅存活于组件实例内存中（页面刷新即回到 defaultDir），不写入 localStorage / sessionStorage。
const sortDirMap = ref<Record<PublicSort, SortDir>>(
  Object.fromEntries(sortOptions.map((o) => [o.value, o.defaultDir])) as Record<PublicSort, SortDir>,
)

/** 按钮文案：取自该维度自己记住的方向（含未激活的维度，故切换维度不丢失方向） */
const sortLabelOf = (opt: (typeof sortOptions)[number]) => opt.labels[sortDirMap.value[opt.value]]

// 搜索类型对齐「项目列表」页：按 名称 / ID / 描述 过滤（客户端过滤）
const filteredProjects = computed(() => {
  const q = searchKeyword.value.trim().toLowerCase()
  const base = q
    ? allProjects.value.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      )
    : allProjects.value
  const list = [...base]
  // asc → 1 / desc → -1，统一乘到比较结果上，避免每个分支各写两遍
  const dir = sortDirMap.value[currentSort.value] === 'asc' ? 1 : -1
  switch (currentSort.value) {
    case 'views':
      list.sort((a, b) => ((a.viewCount || 0) - (b.viewCount || 0)) * dir)
      break
    case 'clones':
      list.sort((a, b) => ((a.cloneCount || 0) - (b.cloneCount || 0)) * dir)
      break
    case 'name':
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') * dir)
      break
    default:
      // 「最新」与卡片展示的时间保持一致：均按项目创建时间
      list.sort(
        (a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir,
      )
  }
  return list
})

// ---- 懒加载：滚动到底部附近时追加渲染一批 ----
// 一次性拉取全部公开项目数据，但只渲染前 visibleCount 个卡片，
// 接近底部时再追加，避免公开项目很多时首屏一次性挂载大量 DOM。
const LAZY_BATCH_SIZE = 12
const visibleCount = ref(LAZY_BATCH_SIZE)
const visibleProjects = computed(() => filteredProjects.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < filteredProjects.value.length)

const bodyRef = ref<HTMLElement | null>(null)
const showBackToTop = ref(false)

const loadMore = () => {
  if (!hasMore.value) return
  visibleCount.value = Math.min(visibleCount.value + LAZY_BATCH_SIZE, filteredProjects.value.length)
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

// 搜索或排序变化时重置懒加载窗口（否则会出现"结果变少了但已渲染很多"的错位）
const resetVisible = () => {
  visibleCount.value = LAZY_BATCH_SIZE
  bodyRef.value?.scrollTo({ top: 0 })
}
const handleSort = (value: PublicSort) => {
  if (currentSort.value === value) {
    // 重复点击同一按钮：切换该维度的排序方向（如「最多浏览」⇄「最少浏览」）
    sortDirMap.value[value] = sortDirMap.value[value] === 'desc' ? 'asc' : 'desc'
  } else {
    // 切换到另一维度：沿用该维度上次记住的方向，不重置
    currentSort.value = value
  }
  resetVisible()
}
const handleSearch = () => {
  resetVisible()
}
// 清空搜索关键词并立即刷新列表
const clearSearch = () => {
  searchKeyword.value = ''
  handleSearch()
}

// ---- 数据加载 ----
const loadProjects = async (silent = false) => {
  if (!silent) isLoading.value = true
  try {
    // 展示所有公开项目（含当前用户自己的），自己的项目打开后可直接编辑
    const projects = await projectApi.getPublicProjects(false)
    allProjects.value = mergeArrayById(allProjects.value, projects) as Project[]
    // 已渲染的可见数量不能因为列表变短而超出
    if (visibleCount.value > allProjects.value.length) {
      visibleCount.value = Math.max(LAZY_BATCH_SIZE, allProjects.value.length)
    }
    // 补齐所有者昵称（与项目列表页一致：批量查询，失败静默降级为 ownerName）
    const ownerIds = [...new Set(allProjects.value.map((p) => p.ownerId))]
    const users = await Promise.all(ownerIds.map((id) => userApi.getUser(id).catch(() => null)))
    const map: Record<string, string> = {}
    users.forEach((u) => {
      if (u) map[u.id] = u.nickname || u.username
    })
    const prevMap = ownerMap.value
    const mapChanged =
      Object.keys(map).length !== Object.keys(prevMap).length ||
      Object.entries(map).some(([k, v]) => prevMap[k] !== v)
    if (mapChanged) ownerMap.value = map
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '加载公开项目失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    if (!silent) isLoading.value = false
  }
}

// ---- 打开项目：上报浏览量 + 带来源标记跳转 ----
const openProject = (project: Project) => {
  // 浏览量上报：会话内同一项目只报一次；失败静默（不阻塞打开流程）
  if (!viewedProjectIds.has(project.id)) {
    viewedProjectIds.add(project.id)
    void projectApi.reportView(project.id).catch(() => {})
  }
  // from=public 让编辑器识别"这是他人公开项目"，从而进入只读 + 另存为模式
  const resolved = router.resolve({
    name: 'editor',
    query: { projectId: project.id, from: 'public' },
  })
  window.open(resolved.href, '_blank')
}

const goToEditor = () => router.push('/')
const goToProjects = () => router.push('/projects')

const formatTime = (dateStr: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
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

/** 完整时间（用于悬浮提示）：YYYY-MM-DD HH:mm */
const formatFullTime = (dateStr: string) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ownerNameOf = (project: Project) =>
  ownerMap.value[project.ownerId] || project.ownerName || '未知用户'

// ---- 轮询：静默刷新浏览量/另存量与列表变化 ----
let pollTimer: ReturnType<typeof setInterval> | null = null

/** 防抖搜索：输入停顿后再重置懒加载窗口 */
let searchTimer: ReturnType<typeof setTimeout> | null = null
const onSearchInput = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    handleSearch()
  }, 300)
}

onMounted(() => {
  void loadProjects()
  if (bodyRef.value) {
    bodyRef.value.addEventListener('scroll', onBodyScroll, { passive: true })
  }
  pollTimer = setInterval(() => {
    void loadProjects(true)
  }, 30_000)
})

onBeforeUnmount(() => {
  if (bodyRef.value) {
    bodyRef.value.removeEventListener('scroll', onBodyScroll)
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})
</script>

<template>
  <div class="pr-page">
    <div class="pr-sticky-top">
      <header class="pr-header">
        <div class="pr-header-inner">
          <img
            src="@/assets/GeoMesh3D_logo_white_1240x300.png"
            class="pr-logo"
            @click="goToEditor"
            alt="GeoMesh3D"
          />
          <h1 class="pr-title">公开资源</h1>
          <div class="pr-header-actions">
            <div class="pr-action-wrap">
              <button class="pr-header-action-btn" @click="goToProjects" title="项目列表">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <div class="pr-tooltip">项目列表</div>
            </div>
          </div>
        </div>
      </header>
      <div class="pr-toolbar">
        <div class="pr-search-bar">
          <svg
            class="pr-search-icon"
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
            v-model="searchKeyword"
            class="pr-search-input"
            type="text"
            placeholder="项目名称、ID 或描述..."
            @input="onSearchInput"
            @keyup.enter="handleSearch"
          />
          <button
            v-if="searchKeyword"
            class="pr-search-clear"
            @click="clearSearch"
          >
            ×
          </button>
        </div>
        <div class="pr-sort-bar">
          <!-- 每个按钮各自记住自己的排序方向；重复点击同一按钮切换方向，箭头指示该维度当前方向 -->
          <button
            v-for="opt in sortOptions"
            :key="opt.value"
            class="pr-sort-btn"
            :class="{ active: currentSort === opt.value }"
            @click="handleSort(opt.value)"
          >
            {{ sortLabelOf(opt) }}
            <span class="pr-sort-arrow" :class="{ 'is-dim': currentSort !== opt.value }">{{
              sortDirMap[opt.value] === 'asc' ? '↑' : '↓'
            }}</span>
          </button>
        </div>
      </div>
      <div class="pr-divider"></div>
    </div>

    <div ref="bodyRef" class="pr-body">
      <div class="pr-body-inner">
        <div v-if="isLoading" class="pr-loading">
          <div class="pr-spinner"></div>
          <span>加载中...</span>
        </div>
        <div v-else-if="filteredProjects.length === 0" class="pr-empty">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path
              d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
            />
          </svg>
          <p>{{ searchKeyword ? '未找到匹配的公开项目' : '暂无公开项目' }}</p>
        </div>
        <template v-else>
          <div class="pr-grid">
            <div
              v-for="project in visibleProjects"
              :key="project.id"
              class="pr-card"
              @click="openProject(project)"
            >
              <div class="pr-card-cover">
                <ProxiedImage
                  v-if="project.thumbnailUrl"
                  :src="withThumbnailVersion(project.thumbnailUrl, project.updatedAt)"
                  class="pr-card-img"
                  alt=""
                />
                <div v-else class="pr-card-placeholder">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                    />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div class="pr-card-overlay">
                  <span class="pr-card-stat" title="浏览量">
                    <svg
                      class="pr-stat-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {{ project.viewCount ?? 0 }}
                  </span>
                  <span class="pr-card-stat" title="另存量">
                    <svg
                      class="pr-stat-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {{ project.cloneCount ?? 0 }}
                  </span>
                </div>
              </div>
              <div class="pr-card-info">
                <div class="pr-card-name" :title="project.name">{{ project.name }}</div>
                <div class="pr-card-desc" v-if="project.description">{{ project.description }}</div>
                <div class="pr-card-meta">
                  <span class="pr-card-owner">{{ ownerNameOf(project) }}</span>
                  <span class="pr-card-time" :title="`创建于 ${formatFullTime(project.createdAt)}`">{{
                    formatTime(project.createdAt)
                  }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 懒加载状态：还有更多时显示触发按钮（滚动也会自动加载），到底显示结束提示 -->
          <div v-if="hasMore" class="pr-load-more">
            <button class="pr-load-more-btn" @click="loadMore">加载更多</button>
          </div>
          <div v-else class="pr-list-end">已显示全部 {{ filteredProjects.length }} 个项目</div>
        </template>
      </div>
    </div>

    <!-- 回到顶部悬浮按钮 -->
    <Transition name="backtop-fade">
      <button
        v-if="showBackToTop"
        class="pr-back-to-top"
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
  </div>
</template>

<style scoped>
.pr-page {
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
.pr-sticky-top {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    linear-gradient(180deg, #141414 0%, #121212 100%);
}
.pr-header {
  padding: 20px 28px;
}
.pr-header-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
}
.pr-logo {
  height: 32px;
  cursor: pointer;
  opacity: 0.85;
  transition: opacity 0.15s ease;
}
.pr-logo:hover {
  opacity: 1;
}
.pr-title {
  font-size: 22px;
  font-weight: 700;
  color: #f5f5f5;
  margin: 0;
  flex: 1;
}
.pr-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pr-header-action-btn {
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
.pr-header-action-btn:hover {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}
.pr-header-action-btn svg {
  width: 18px;
  height: 18px;
}

.pr-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 28px 16px;
}
.pr-search-bar {
  position: relative;
  flex: 1;
  max-width: 480px;
}
.pr-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: #888;
  pointer-events: none;
}
.pr-search-input {
  width: 100%;
  padding: 9px 36px 9px 38px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #1a1a1a;
  color: #f5f5f5;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.pr-search-input::placeholder {
  color: #777;
}
.pr-search-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}
.pr-search-clear {
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
.pr-search-clear:hover {
  color: #ccc;
}

.pr-sort-bar {
  display: flex;
  gap: 8px;
}
.pr-sort-btn {
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
.pr-sort-btn:hover {
  border-color: #555;
  color: #f5f5f5;
  background: #2a2a2a;
}
.pr-sort-btn.active {
  border-color: #43f260;
  color: #43f260;
  background: rgba(67, 242, 96, 0.08);
}
/* 排序方向箭头：每个按钮显示自己记住的方向 */
.pr-sort-arrow {
  font-size: 12px;
  line-height: 1;
}
/* 非当前生效的维度：箭头降透明度，突出真正生效的排序 */
.pr-sort-arrow.is-dim {
  opacity: 0.5;
}

.pr-divider {
  height: 1px;
  background: #2a2a2a;
  margin: 0 28px;
}

.pr-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px 48px;
}
.pr-body-inner {
  max-width: 1600px;
  margin: 0 auto;
}

.pr-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: #888;
}
.pr-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #3d3d3d;
  border-top-color: #43f260;
  border-radius: 50%;
  animation: pr-spin 0.8s linear infinite;
}
@keyframes pr-spin {
  to {
    transform: rotate(360deg);
  }
}

.pr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 80px 0;
  color: #666;
}
.pr-empty svg {
  width: 48px;
  height: 48px;
}
.pr-empty p {
  margin: 0;
  font-size: 15px;
}

.pr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.pr-card {
  background: linear-gradient(180deg, #1f1f1f 0%, #181818 100%);
  border: 1px solid #3d3d3d;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}
.pr-card:hover {
  border-color: #43f260;
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(67, 242, 96, 0.15);
  transform: translateY(-2px);
}

.pr-card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #111;
  overflow: hidden;
}
.pr-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}
.pr-card:hover .pr-card-img {
  transform: scale(1.05);
}
.pr-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #444;
}
.pr-card-placeholder svg {
  width: 48px;
  height: 48px;
}

.pr-card-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  display: flex;
  align-items: center;
  gap: 14px;
}
.pr-card-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #ddd;
  font-variant-numeric: tabular-nums;
}
.pr-stat-icon {
  width: 13px;
  height: 13px;
  opacity: 0.85;
}

.pr-card-info {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}
.pr-card-name {
  font-size: 15px;
  font-weight: 600;
  color: #f5f5f5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pr-card-desc {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.pr-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 4px;
}
.pr-card-owner {
  font-size: 12px;
  color: #aaa;
}
.pr-card-time {
  font-size: 12px;
  color: #777;
}

/* 懒加载 */
.pr-load-more {
  display: flex;
  justify-content: center;
  padding: 28px 0 8px;
}
.pr-load-more-btn {
  padding: 9px 28px;
  border-radius: 8px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.pr-load-more-btn:hover {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
}
.pr-list-end {
  text-align: center;
  padding: 24px 0 8px;
  color: #666;
  font-size: 12px;
}

/* tooltip */
.pr-action-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.pr-tooltip {
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
.pr-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: #2a2a2a;
}
.pr-action-wrap:hover .pr-tooltip {
  opacity: 1;
  visibility: visible;
}

/* 回到顶部 */
.pr-back-to-top {
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
.pr-back-to-top svg {
  width: 20px;
  height: 20px;
}
.pr-back-to-top:hover {
  transform: translateY(-2px);
  border-color: rgba(67, 242, 96, 0.7);
  color: #8df2a0;
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.5),
    0 0 0 2px rgba(67, 242, 96, 0.18);
}
.pr-back-to-top:active {
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
