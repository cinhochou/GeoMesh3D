<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { projectApi } from '@/api/project'
import { userApi } from '@/api/user'
import { ApiError } from '@/api/client'
import { getApiConfig } from '@/config/api'
import type { Project } from '@/types/project'

const router = useRouter()
const plBodyRef = ref<HTMLElement | null>(null)

const resolveThumbnailUrl = (url: string | null | undefined): string => {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('data:')) return url
  return getApiConfig().baseUrl + url
}

const allProjects = ref<Project[]>([])
const isLoading = ref(false)
const deleteConfirmId = ref<string | null>(null)
const pageSize = ref(5)
const currentPage = ref(1)
const searchQuery = ref('')
type SortValue =
  | 'nameAsc'
  | 'nameDesc'
  | 'updatedDesc'
  | 'updatedAsc'
  | 'createdDesc'
  | 'createdAsc'
const sortBy = ref<SortValue>('nameAsc')
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

const currentSortLabel = computed(
  () => sortOptions.find((o) => o.value === sortBy.value)?.label || '',
)
const currentSortArrow = computed(
  () => sortOptions.find((o) => o.value === sortBy.value)?.arrow || 'up',
)

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
const editingField = ref<{ projectId: string; field: 'name' | 'description' } | null>(null)
const editingValue = ref('')
const editingOriginal = ref('')
const expandedProjects = ref<Set<string>>(new Set())
const descOverflowMap = ref<Record<string, boolean>>({})
const ownerMap = ref<Record<string, string>>({})

const fetchProjects = async () => {
  isLoading.value = true
  try {
    allProjects.value = await projectApi.getMyProjects()
    const ownerIds = [...new Set(allProjects.value.map((p) => p.ownerId))]
    const users = await Promise.all(ownerIds.map((id) => userApi.getUser(id).catch(() => null)))
    const map: Record<string, string> = {}
    users.forEach((u) => {
      if (u) map[u.id] = u.nickname || u.username
    })
    ownerMap.value = map
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '获取项目列表失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchProjects()
  document.addEventListener('click', onSortClickOutside)
})

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

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const base = q
    ? allProjects.value.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q),
      )
    : allProjects.value
  const sorted = [...base]
  const timeOf = (s: string) => new Date(s).getTime()
  switch (sortBy.value) {
    case 'nameAsc':
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      break
    case 'nameDesc':
      sorted.sort((a, b) => b.name.localeCompare(a.name, 'zh-CN'))
      break
    case 'updatedDesc':
      sorted.sort((a, b) => timeOf(b.updatedAt) - timeOf(a.updatedAt))
      break
    case 'updatedAsc':
      sorted.sort((a, b) => timeOf(a.updatedAt) - timeOf(b.updatedAt))
      break
    case 'createdDesc':
      sorted.sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt))
      break
    case 'createdAsc':
      sorted.sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt))
      break
  }
  return sorted
})

const totalItems = computed(() => filteredProjects.value.length)
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))

const paginatedProjects = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredProjects.value.slice(start, start + pageSize.value)
})

const startEdit = (project: Project, field: 'name' | 'description') => {
  editingField.value = { projectId: project.id, field }
  editingValue.value = project[field]
  editingOriginal.value = project[field]
  if (field === 'description') {
    nextTick(() => {
      const textarea = document.querySelector('.pl-edit-textarea') as HTMLTextAreaElement | null
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
  const project = allProjects.value.find((p) => p.id === editingField.value!.projectId)
  if (project) {
    const trimmed = editingValue.value.trim()
    if (editingField.value.field === 'name' && !trimmed) {
      editingField.value = null
      editingValue.value = ''
      editingOriginal.value = ''
      return
    }
    const field = editingField.value.field
    const oldValue = project[field]
    project[field] = trimmed
    try {
      const updated = await projectApi.updateProject(project.id, { [field]: trimmed })
      project.updatedAt = updated.updatedAt
    } catch (err) {
      project[field] = oldValue
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

const toggleExpanded = (projectId: string) => {
  if (expandedProjects.value.has(projectId)) {
    expandedProjects.value.delete(projectId)
  } else {
    expandedProjects.value.add(projectId)
  }
}

const isExpanded = (projectId: string) => expandedProjects.value.has(projectId)

const isDescOverflow = (projectId: string) => descOverflowMap.value[projectId] ?? false

const onDescMounted = (el: HTMLElement | null, projectId: string) => {
  if (!el) return
  const check = () => {
    descOverflowMap.value[projectId] = el.scrollHeight > el.clientHeight
  }
  check()
  const ro = new ResizeObserver(check)
  ro.observe(el)
}

const isEditing = (projectId: string, field: 'name' | 'description') => {
  return editingField.value?.projectId === projectId && editingField.value?.field === field
}

const autoResize = (e: Event) => {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const goToEditor = () => {
  const resolved = router.resolve({ name: 'editor' })
  window.open(resolved.href, '_blank')
}

const openProject = (projectId: string) => {
  const resolved = router.resolve({ name: 'editor', query: { projectId } })
  window.open(resolved.href, '_blank')
}

const togglePublic = async (project: Project) => {
  const oldValue = project.isPublic
  project.isPublic = !project.isPublic
  try {
    const updated = await projectApi.updateProject(project.id, { isPublic: project.isPublic })
    project.updatedAt = updated.updatedAt
  } catch (err) {
    project.isPublic = oldValue
    const msg = err instanceof ApiError ? err.message : '更新失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
  }
}

const requestDelete = (id: string) => {
  deleteConfirmId.value = id
}

const cancelDelete = () => {
  deleteConfirmId.value = null
}

const confirmDelete = async (id: string) => {
  try {
    await projectApi.deleteProject(id)
    allProjects.value = allProjects.value.filter((p) => p.id !== id)
    deleteConfirmId.value = null
    if (currentPage.value > totalPages.value) {
      currentPage.value = totalPages.value
    }
  } catch (err) {
    const msg = err instanceof ApiError ? err.message : '删除失败'
    window.dispatchEvent(new CustomEvent('toast', { detail: { msg, scope: 'global' } }))
    deleteConfirmId.value = null
  }
}

const changePageSize = (size: number) => {
  let centerIndex = 0
  const body = plBodyRef.value
  if (body) {
    const cards = body.querySelectorAll('.pl-card')
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
  return dateStr.replace('T', ' ').replace(/\.\d+$/, '')
}

const handlePublicResources = () => {
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { msg: '公开资源功能开发中', scope: 'global' },
    }),
  )
}

const handleNewProject = () => {
  const resolved = router.resolve({ name: 'editor', query: { newProject: 'true' } })
  window.open(resolved.href, '_blank')
}

const handleRecycleBin = () => {
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { msg: '回收站功能开发中', scope: 'global' },
    }),
  )
}
</script>

<template>
  <div class="project-list-page">
    <div class="pl-sticky-top">
      <header class="pl-header">
        <div class="pl-header-inner">
          <img
            src="@/assets/GeoMesh3D_logo_white_1240x300.png"
            alt="GeoMesh3D"
            class="pl-logo"
            @click="goToEditor"
          />
          <h1 class="pl-title">项目列表</h1>
          <div class="pl-header-actions">
            <div class="pl-action-wrap">
              <button class="pl-header-action-btn" @click="handlePublicResources">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path
                    d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                  />
                </svg>
              </button>
              <div class="pl-tooltip">公开资源</div>
            </div>
            <div class="pl-action-wrap">
              <button class="pl-header-action-btn" @click="handleNewProject">
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
              <div class="pl-tooltip">新建项目</div>
            </div>
            <div class="pl-action-wrap">
              <button class="pl-header-action-btn" @click="handleRecycleBin">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
              <div class="pl-tooltip">回收站</div>
            </div>
          </div>
        </div>
      </header>

      <div class="pl-divider"></div>
    </div>

    <div ref="plBodyRef" class="pl-body">
      <div class="pl-body-inner">
        <div class="pl-toolbar-row">
          <div class="pl-search-bar">
            <svg
              class="pl-search-icon"
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
              class="pl-search-input"
              placeholder="项目名称、ID 或描述..."
            />
            <button v-if="searchQuery" class="pl-search-clear" @click="searchQuery = ''">
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
          <div ref="sortBarRef" class="pl-sort-bar">
            <button class="pl-sort-trigger" @click="toggleSortOpen">
              <svg
                class="pl-sort-icon"
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
              <span class="pl-sort-label">{{ currentSortLabel }}</span>
              <span class="pl-sort-arrow">{{ currentSortArrow === 'up' ? '↑' : '↓' }}</span>
              <svg
                class="pl-sort-caret"
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
              <ul v-if="sortOpen" class="pl-sort-dropdown">
                <li
                  v-for="opt in sortOptions"
                  :key="opt.value"
                  class="pl-sort-option"
                  :class="{ active: sortBy === opt.value }"
                  @click="selectSort(opt.value)"
                >
                  <span class="pl-sort-option-label">{{ opt.label }}</span>
                  <span class="pl-sort-option-arrow">{{ opt.arrow === 'up' ? '↑' : '↓' }}</span>
                </li>
              </ul>
            </Transition>
          </div>
        </div>

        <div v-if="filteredProjects.length === 0" class="pl-empty">
          <svg
            class="pl-empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <p class="pl-empty-text">{{ searchQuery ? '未找到匹配的项目' : '暂无项目' }}</p>
        </div>

        <div v-else class="pl-list">
          <div v-for="project in paginatedProjects" :key="project.id" class="pl-card">
            <div class="pl-card-thumb" @click="openProject(project.id)">
              <div v-if="!project.thumbnailUrl" class="pl-thumb-placeholder">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                  />
                </svg>
              </div>
              <img
                v-else
                :src="resolveThumbnailUrl(project.thumbnailUrl)"
                alt="thumbnail"
                class="pl-thumb-image"
              />
            </div>

            <div class="pl-card-content">
              <div class="pl-card-top">
                <div class="pl-card-info">
                  <div class="pl-card-name-row">
                    <template v-if="isEditing(project.id, 'name')">
                      <input
                        v-model="editingValue"
                        class="pl-edit-input pl-edit-name"
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
                      <span
                        class="pl-card-name pl-card-name-link"
                        @click="openProject(project.id)"
                        >{{ project.name }}</span
                      >
                      <button
                        class="icon-btn icon-btn-edit"
                        @click.stop="startEdit(project, 'name')"
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
                    <span class="pl-card-id">#{{ project.id }}</span>
                  </div>
                  <div v-if="isEditing(project.id, 'description')" class="pl-edit-wrap">
                    <textarea
                      v-model="editingValue"
                      class="pl-edit-textarea"
                      rows="1"
                      @input="autoResize"
                      @blur="saveEdit"
                      @keydown.escape="cancelEdit"
                      autofocus
                    ></textarea>
                    <button
                      class="pl-edit-check"
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
                  <div v-else class="pl-desc-wrap">
                    <div
                      class="pl-desc-content"
                      :class="{ expanded: isExpanded(project.id) }"
                      @dblclick="startEdit(project, 'description')"
                    >
                      <div
                        class="pl-desc-text"
                        :class="{ 'pl-desc-placeholder': !project.description }"
                        :ref="(el) => onDescMounted(el as HTMLElement, project.id)"
                      >
                        {{ project.description || '该用户还未编辑描述文字，双击可编辑~' }}
                      </div>
                    </div>
                    <button
                      v-if="isDescOverflow(project.id) || isExpanded(project.id)"
                      class="pl-toggle-btn"
                      @click.stop="toggleExpanded(project.id)"
                    >
                      <svg
                        v-if="!isExpanded(project.id)"
                        class="pl-toggle-icon"
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
                        class="pl-toggle-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                      <span class="pl-toggle-text">{{
                        isExpanded(project.id) ? '收起' : '展开'
                      }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="pl-card-meta">
                <span class="pl-meta-item">
                  <svg
                    class="pl-meta-icon"
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
                  {{ ownerMap[project.ownerId] || project.ownerName || '未知用户' }}
                </span>
                <span class="pl-meta-sep">·</span>
                <span class="pl-meta-item">
                  <svg
                    class="pl-meta-icon"
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
                  创建：{{ formatDate(project.createdAt) }}
                </span>
                <span class="pl-meta-sep">·</span>
                <span class="pl-meta-item">
                  <svg
                    class="pl-meta-icon"
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
                  修改：{{ formatDate(project.updatedAt) }}
                </span>
              </div>

              <div class="pl-card-actions">
                <button
                  class="pl-visibility-btn"
                  :class="{ 'is-public': project.isPublic, 'is-private': !project.isPublic }"
                  @click="togglePublic(project)"
                  :title="project.isPublic ? '点击设为隐藏' : '点击设为公开'"
                >
                  <svg
                    v-if="project.isPublic"
                    class="pl-action-icon"
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
                  <svg
                    v-else
                    class="pl-action-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                    />
                    <path
                      d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                    />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  <span>{{ project.isPublic ? '公开' : '隐藏' }}</span>
                </button>

                <button
                  v-if="deleteConfirmId !== project.id"
                  class="pl-delete-btn"
                  @click="requestDelete(project.id)"
                  title="删除项目"
                >
                  <svg
                    class="pl-action-icon"
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
                  <span>删除</span>
                </button>
                <div v-else class="pl-delete-confirm">
                  <span class="pl-confirm-text">确认删除？</span>
                  <button class="pl-confirm-yes" @click="confirmDelete(project.id)">确认</button>
                  <button class="pl-confirm-no" @click="cancelDelete">取消</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="pl-sticky-bottom">
      <div class="pl-pagination">
        <div class="pl-page-size">
          <span class="pl-page-size-label">每页显示</span>
          <div class="pl-page-size-options">
            <button
              v-for="size in [5, 10, 15, 30]"
              :key="size"
              class="pl-page-size-btn"
              :class="{ active: pageSize === size }"
              @click="changePageSize(size)"
            >
              {{ size }}
            </button>
          </div>
        </div>
        <div class="pl-page-center">
          <span class="pl-total-count"
            >共 <span class="pl-total-num">{{ totalItems }}</span> 个项目</span
          >
        </div>
        <div class="pl-page-info">
          <button
            class="pl-page-nav"
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
          <span class="pl-page-text">{{ currentPage }} / {{ totalPages }}</span>
          <button
            class="pl-page-nav"
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
  </div>
</template>

<style scoped>
.project-list-page {
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

.pl-sticky-top {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    linear-gradient(180deg, #141414 0%, #121212 100%);
}

.pl-header {
  padding: 20px 28px;
}

.pl-header-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.pl-logo {
  height: 28px;
  width: auto;
  object-fit: contain;
  user-select: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
  position: absolute;
  left: 28px;
}

.pl-logo:hover {
  opacity: 0.7;
}

.pl-title {
  color: #f5f5f5;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 0;
}

.pl-header-actions {
  position: absolute;
  right: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.pl-action-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.pl-header-action-btn {
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

.pl-header-action-btn svg {
  width: 18px;
  height: 18px;
}

.pl-header-action-btn:hover {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.pl-tooltip {
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

.pl-tooltip::after {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-bottom-color: #2a2a2a;
}

.pl-action-wrap:hover .pl-tooltip {
  opacity: 1;
  visibility: visible;
}

.pl-divider {
  height: 1px;
  background: #2a2a2a;
  margin: 0;
}

.pl-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  display: flex;
  justify-content: center;
  padding: 24px 20px;
}

.pl-body::-webkit-scrollbar {
  width: 6px;
}

.pl-body::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 999px;
}

.pl-body::-webkit-scrollbar-track {
  background: transparent;
}

.pl-body-inner {
  width: min(800px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pl-toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.pl-search-bar {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.pl-search-icon {
  position: absolute;
  left: 14px;
  width: 18px;
  height: 18px;
  color: #666;
  pointer-events: none;
}

.pl-search-input {
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

.pl-search-input::placeholder {
  color: #666;
}

.pl-search-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.pl-search-clear {
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

.pl-search-clear svg {
  width: 14px;
  height: 14px;
}

.pl-search-clear:hover {
  color: #fff;
  background: #333;
}

.pl-sort-bar {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.pl-sort-trigger {
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

.pl-sort-trigger:hover {
  border-color: #555;
}

.pl-sort-trigger:focus,
.pl-sort-bar:focus-within .pl-sort-trigger {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.pl-sort-icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: #666;
  pointer-events: none;
}

.pl-sort-label {
  color: #eee;
}

.pl-sort-arrow {
  color: #888;
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
}

.pl-sort-caret {
  position: absolute;
  right: 10px;
  width: 14px;
  height: 14px;
  color: #888;
  transition: transform 0.2s ease;
}

.pl-sort-caret.open {
  transform: rotate(180deg);
}

.pl-sort-dropdown {
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

.pl-sort-option {
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

.pl-sort-option:hover {
  background: #2a2a2a;
  color: #eee;
}

.pl-sort-option.active {
  background: rgba(67, 242, 96, 0.12);
  color: #43f260;
  font-weight: 600;
}

.pl-sort-option-label {
  line-height: 1;
}

.pl-sort-option-arrow {
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

.pl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 80px 0;
  color: #666;
}

.pl-empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.4;
}

.pl-empty-text {
  font-size: 15px;
  color: #888;
}

.pl-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.pl-card {
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

.pl-card:hover {
  border-color: #3d3d3d;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.pl-card-thumb {
  width: 120px;
  height: 90px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid #333;
  background: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.2s;
}

.pl-card-thumb:hover {
  border-color: #43f260;
}

.pl-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #444;
}

.pl-thumb-placeholder svg {
  width: 36px;
  height: 36px;
}

.pl-thumb-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pl-card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.pl-card-top {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.pl-card-info {
  flex: 1;
  min-width: 0;
}

.pl-card-name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.pl-card-name {
  color: #f5f5f5;
  font-size: 16px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-card-name-link {
  cursor: pointer;
  transition: color 0.2s;
}

.pl-card-name-link:hover {
  color: #43f260;
}

.pl-card-id {
  color: #666;
  font-size: 12px;
  font-family: monospace;
  flex-shrink: 0;
}

.pl-desc-text {
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

.pl-desc-placeholder {
  color: #666;
  font-style: italic;
}

.pl-desc-content {
  position: relative;
  width: 100%;
  font-size: 13px;
}

.pl-desc-content:not(.expanded) {
  max-height: calc(1.5em * 2);
  overflow: hidden;
}

.pl-desc-content:not(.expanded) .pl-desc-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
  min-width: 100%;
  -webkit-box-flex: 1;
}

.pl-desc-wrap {
  position: relative;
}

.pl-toggle-btn {
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

.pl-toggle-btn:hover {
  color: #43f260;
}

.pl-toggle-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.pl-card-name {
  cursor: default;
}

.pl-edit-input,
.pl-edit-textarea {
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

.pl-edit-textarea {
  word-break: break-all;
}

.pl-edit-wrap {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  flex: 1;
  min-width: 0;
}

.pl-edit-wrap .pl-edit-input,
.pl-edit-wrap .pl-edit-textarea {
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

.pl-edit-check {
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

.pl-edit-check svg {
  width: 14px;
  height: 14px;
}

.pl-edit-check.changed {
  color: #43f260;
  cursor: pointer;
}

.pl-edit-check.changed:hover {
  color: #8df2a0;
}

.pl-edit-name {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.pl-edit-textarea {
  font-size: 13px;
  line-height: 1.5;
  margin: 0;
  overflow: hidden;
}

.pl-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.pl-visibility-btn,
.pl-delete-btn {
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

.pl-action-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.pl-visibility-btn.is-public {
  border-color: rgba(67, 242, 96, 0.3);
  color: #8df2a0;
}

.pl-visibility-btn.is-public:hover {
  background: rgba(67, 242, 96, 0.1);
  border-color: rgba(67, 242, 96, 0.5);
}

.pl-visibility-btn.is-private {
  border-color: rgba(255, 180, 80, 0.3);
  color: #ffb450;
}

.pl-visibility-btn.is-private:hover {
  background: rgba(255, 180, 80, 0.1);
  border-color: rgba(255, 180, 80, 0.5);
}

.pl-delete-btn {
  border-color: rgba(255, 95, 95, 0.25);
  color: #ff9999;
}

.pl-delete-btn:hover {
  background: rgba(255, 95, 95, 0.1);
  border-color: rgba(255, 95, 95, 0.5);
}

.pl-delete-confirm {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 95, 95, 0.4);
  background: rgba(255, 95, 95, 0.08);
}

.pl-confirm-text {
  color: #ffb0b0;
  font-size: 12px;
  white-space: nowrap;
}

.pl-confirm-yes,
.pl-confirm-no {
  padding: 3px 10px;
  border-radius: 4px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.pl-confirm-yes {
  background: #e04040;
  color: #fff;
}

.pl-confirm-yes:hover {
  opacity: 0.85;
}

.pl-confirm-no {
  background: #333;
  color: #ccc;
  border: 1px solid #444;
}

.pl-confirm-no:hover {
  background: #3d3d3d;
}

.pl-card-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: #888;
  font-size: 12px;
}

.pl-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pl-meta-icon {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  opacity: 0.6;
}

.pl-meta-sep {
  color: #444;
}

.pl-sticky-bottom {
  flex-shrink: 0;
  background: linear-gradient(180deg, #121212 0%, #141414 100%);
  border-top: 1px solid #2a2a2a;
  padding: 12px 28px;
}

.pl-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 800px;
  margin: 0 auto;
}

.pl-page-size {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pl-page-size-label {
  color: #888;
  font-size: 13px;
}

.pl-page-size-options {
  display: flex;
  gap: 4px;
}

.pl-page-size-btn {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #3d3d3d;
  background: #252525;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pl-page-size-btn:hover {
  border-color: #555;
  background: #2d2d2d;
}

.pl-page-size-btn.active {
  border-color: rgba(67, 242, 96, 0.5);
  background: rgba(67, 242, 96, 0.12);
  color: #43f260;
  font-weight: 600;
}

.pl-page-center {
  display: flex;
  align-items: center;
}

.pl-total-count {
  color: #888;
  font-size: 13px;
}

.pl-total-num {
  color: #43f260;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.pl-page-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pl-page-nav {
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

.pl-page-nav svg {
  width: 16px;
  height: 16px;
}

.pl-page-nav:hover:not(:disabled) {
  border-color: #43f260;
  color: #43f260;
  background: #2a2a2a;
}

.pl-page-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.pl-page-text {
  color: #ccc;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
}

@media (max-width: 640px) {
  .pl-header {
    padding: 16px;
  }

  .pl-logo {
    height: 22px;
    left: 16px;
  }

  .pl-title {
    font-size: 17px;
  }

  .pl-header-actions {
    right: 16px;
    gap: 6px;
  }

  .pl-header-action-btn {
    width: 32px;
    height: 32px;
  }

  .pl-header-action-btn svg {
    width: 16px;
    height: 16px;
  }

  .pl-tooltip {
    display: none;
  }

  .pl-body {
    padding: 16px 12px;
  }

  .pl-search-input {
    font-size: 16px;
    padding: 9px 36px 9px 38px;
  }

  .pl-card {
    flex-direction: column;
    gap: 14px;
    padding: 16px;
  }

  .pl-card-thumb {
    width: 100%;
    height: 140px;
  }

  .pl-card-meta {
    gap: 4px;
  }

  .pl-meta-sep {
    display: inline;
  }

  .pl-sticky-bottom {
    padding: 10px 16px;
  }

  .pl-pagination {
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
}
</style>
