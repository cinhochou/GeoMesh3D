<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/authStore'
import { profileApi } from '@/api/profile'
import type { UserStats } from '@/api/profile'
import { getApiConfig } from '@/config/api'
import { useSessionGuard } from '@/composables/useSessionGuard'
import { crossTabLoginEvents, type CrossTabLoginEvent } from '@/utils/sessionEvents'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { user, isLoading } = storeToRefs(authStore)

// 会话失效感知：统一跳转登录页
useSessionGuard({
  onInvalidated: () => {
    router.replace({
      path: '/login',
      query: { reason: 'expired', redirect: route.fullPath },
    })
  },
})

const avatarInput = ref<HTMLInputElement | null>(null)

const stats = ref<UserStats | null>(null)
const statsLoading = ref(false)

const nickname = ref('')
const editingNickname = ref(false)
const nicknameError = ref('')

const editingEmail = ref(false)
const email = ref('')
const emailError = ref('')

const editingPassword = ref(false)
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')

const avatarPreview = ref<string | null>(null)
const avatarUploading = ref(false)
const avatarPreviewVisible = ref(false)

const toastMessage = ref('')
const toastVisible = ref(false)
let toastTimer: number | null = null

const datePopupVisible = ref(false)
const datePopupRef = ref<HTMLElement | null>(null)

const isTouchDevice = () => !window.matchMedia('(hover: hover) and (pointer: fine)').matches

const toggleDatePopup = () => {
  if (isTouchDevice()) {
    datePopupVisible.value = !datePopupVisible.value
  }
}

const handleClickOutside = (e: MouseEvent) => {
  if (datePopupVisible.value && datePopupRef.value && !datePopupRef.value.contains(e.target as Node)) {
    datePopupVisible.value = false
  }
}

// B6：合并成一个 onMounted，保留原有两个块的所有职责
//   - click outside 关闭日期弹窗
//   - 跨 Tab 重新登录事件订阅
//   - 路由级 auth check（已登录才进本页）
//   - 同步表单初值 + 拉取用户统计
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  crossTabLoginEvents.on(handleCrossTabLogin)
  if (!authStore.isAuthenticated) {
    router.replace({ name: 'login' })
    return
  }
  syncFormFromUser()
  loadStats()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  crossTabLoginEvents.off(handleCrossTabLogin)
})

// B10：仅在切换账号时重拉统计；同账号重登统计未变，跳过无意义的 API 调用
const handleCrossTabLogin = (event: CrossTabLoginEvent) => {
  if (event.changed) {
    // store.user 已被 reinitializeFromStorageToken 同步更新（watch user 会触发 syncFormFromUser）
    // 这里只需重拉用户统计
    void loadStats()
  }
}

const showToast = (msg: string) => {
  if (toastTimer) clearTimeout(toastTimer)
  toastMessage.value = msg
  toastVisible.value = true
  toastTimer = window.setTimeout(() => {
    toastVisible.value = false
  }, 2000)
}

const displayName = computed(() => user.value?.nickname || user.value?.username || '未登录')
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

const joinedDays = computed(() => {
  if (!user.value?.createdAt) return 0
  const created = new Date(user.value.createdAt)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
})

const createdDateFormatted = computed(() => {
  if (!user.value?.createdAt) return ''
  const d = new Date(user.value.createdAt)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
})

const goToEditor = () => {
  router.push({ name: 'editor' })
}

const goToProjectList = () => {
  const resolved = router.resolve({ name: 'projects' })
  window.open(resolved.href, '_blank')
}

const loadStats = async () => {
  if (!user.value?.id) return
  statsLoading.value = true
  try {
    stats.value = await profileApi.getUserStats(user.value.id)
  } catch {
    stats.value = { projectCount: 0, roomCount: 0 }
  } finally {
    statsLoading.value = false
  }
}

watch(
  () => user.value,
  () => syncFormFromUser(),
)

const syncFormFromUser = () => {
  if (!user.value) return
  if (!editingNickname.value) nickname.value = user.value.nickname || ''
  if (!editingEmail.value) email.value = user.value.email || ''
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const openAvatarPreview = () => {
  if (avatarUrl.value || avatarPreview.value) {
    avatarPreviewVisible.value = true
  }
}

const closeAvatarPreview = () => {
  avatarPreviewVisible.value = false
}

const triggerAvatarUpload = () => {
  avatarInput.value?.click()
}

const handleAvatarChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !user.value?.id) return

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片大小不能超过 5MB')
    return
  }

  avatarPreview.value = URL.createObjectURL(file)
  avatarUploading.value = true
  try {
    await profileApi.uploadAvatar(user.value.id, file)
    await authStore.refreshCurrentUser()
    showToast('头像更新成功')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '头像上传失败')
  } finally {
    avatarPreview.value = null
    avatarUploading.value = false
    input.value = ''
  }
}

const startEditNickname = () => {
  nickname.value = user.value?.nickname || ''
  nicknameError.value = ''
  editingNickname.value = true
}

const confirmEditNickname = async () => {
  if (!user.value?.id) return
  nicknameError.value = ''
  if (!nickname.value.trim()) {
    nicknameError.value = '昵称不能为空'
    return
  }
  try {
    await authStore.updateProfile(user.value.id, { nickname: nickname.value.trim() })
    editingNickname.value = false
    showToast('昵称修改成功')
  } catch (err) {
    nicknameError.value = err instanceof Error ? err.message : '修改失败'
  }
}

const cancelEditNickname = () => {
  editingNickname.value = false
  nicknameError.value = ''
  nickname.value = user.value?.nickname || ''
}

const startEditEmail = () => {
  email.value = user.value?.email || ''
  emailError.value = ''
  editingEmail.value = true
}

const confirmEditEmail = async () => {
  if (!user.value?.id) return
  emailError.value = ''
  if (!email.value.trim()) {
    emailError.value = '邮箱不能为空'
    return
  }
  if (!isValidEmail(email.value.trim())) {
    emailError.value = '请输入有效的邮箱地址'
    return
  }
  try {
    await authStore.updateProfile(user.value.id, { email: email.value.trim() })
    editingEmail.value = false
    showToast('邮箱修改成功')
  } catch (err) {
    emailError.value = err instanceof Error ? err.message : '修改失败'
  }
}

const cancelEditEmail = () => {
  editingEmail.value = false
  emailError.value = ''
  email.value = user.value?.email || ''
}

const startEditPassword = () => {
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
  passwordError.value = ''
  editingPassword.value = true
}

const confirmEditPassword = async () => {
  if (!user.value?.id) return
  passwordError.value = ''
  if (!oldPassword.value) {
    passwordError.value = '请输入原密码'
    return
  }
  if (!newPassword.value) {
    passwordError.value = '请输入新密码'
    return
  }
  if (newPassword.value.length < 6) {
    passwordError.value = '新密码长度不能少于 6 位'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的密码不一致'
    return
  }
  try {
    await authStore.changePassword(user.value.id, {
      oldPassword: oldPassword.value,
      newPassword: newPassword.value,
    })
    editingPassword.value = false
    showToast('密码修改成功')
  } catch (err) {
    passwordError.value = err instanceof Error ? err.message : '密码修改失败'
  }
}

const cancelEditPassword = () => {
  editingPassword.value = false
  passwordError.value = ''
  oldPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}
</script>

<template>
  <div class="profile-page">
    <header class="profile-header">
      <div class="profile-header-inner">
        <img src="@/assets/GeoMesh3D_logo_white_1240x300.png" alt="GeoMesh3D" class="header-logo" @click="goToEditor" />
        <h1 class="profile-page-title">个人主页</h1>
      </div>
    </header>

    <main class="profile-body">
      <div class="profile-card">
        <div class="info-section">
          <div class="avatar-ring" @click="openAvatarPreview">
            <img v-if="avatarPreview || avatarUrl" :src="avatarPreview || avatarUrl" alt="avatar" class="avatar-image" />
            <div v-else class="avatar-fallback">{{ defaultAvatarText }}</div>
            <button class="avatar-edit-btn" @click.stop="triggerAvatarUpload" title="修改头像">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <div v-if="avatarUploading" class="avatar-uploading-mask">
              <div class="mini-spinner"></div>
            </div>
          </div>
          <input
            ref="avatarInput"
            type="file"
            accept="image/*"
            class="avatar-input"
            @change="handleAvatarChange"
          />

          <div class="info-details">
            <div class="info-row nickname-row">
              <template v-if="!editingNickname">
                <span class="info-nickname">{{ displayName }}</span>
                <button class="icon-btn icon-btn-edit" @click="startEditNickname" title="修改昵称">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                </button>
              </template>
              <template v-else>
                <input
                  v-model="nickname"
                  class="inline-input"
                  type="text"
                  placeholder="请输入昵称"
                  :disabled="isLoading"
                  @keydown.enter="confirmEditNickname"
                  @keydown.escape="cancelEditNickname"
                />
                <button class="icon-btn icon-btn-confirm" @click="confirmEditNickname" :disabled="isLoading" title="确认">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <button class="icon-btn icon-btn-cancel" @click="cancelEditNickname" title="取消">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </template>
            </div>
            <div v-if="nicknameError" class="field-error">{{ nicknameError }}</div>
            <div class="info-username">@{{ user?.username || '-' }}</div>
            <div class="info-stats-row">
              <span class="stat-chip stat-chip-joined" ref="datePopupRef" @click="toggleDatePopup">
                已加入GeoMesh3D <span class="stat-val">{{ joinedDays }}</span> 天
                <span class="date-popup" :class="{ 'is-active': datePopupVisible }" @click.stop>注册日期：{{ createdDateFormatted }}</span>
              </span>
              <span class="stat-sep">·</span>
              <span class="stat-chip stat-chip-clickable" @click="goToProjectList"><span class="stat-val">{{ statsLoading ? '-' : stats?.projectCount ?? 0 }}</span> 项目</span>
              <span class="stat-sep">·</span>
              <span class="stat-chip"><span class="stat-val">{{ statsLoading ? '-' : stats?.roomCount ?? 0 }}</span> 房间</span>
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <div class="security-section">
          <div class="section-title">安全设置</div>

          <div class="security-item">
            <div class="security-item-header">
              <span class="security-label">邮箱</span>
              <button v-if="!editingEmail && !editingPassword" class="text-btn" @click="startEditEmail">修改</button>
            </div>
            <div v-if="!editingEmail" class="security-value">{{ user?.email || '-' }}</div>
            <div v-else class="security-edit">
              <input
                v-model="email"
                class="field-input"
                type="email"
                placeholder="请输入新邮箱"
                :disabled="isLoading"
                @keydown.enter="confirmEditEmail"
                @keydown.escape="cancelEditEmail"
              />
              <div v-if="emailError" class="field-error">{{ emailError }}</div>
              <div class="security-actions">
                <button class="btn-confirm" @click="confirmEditEmail" :disabled="isLoading">确认</button>
                <button class="btn-cancel" @click="cancelEditEmail">取消</button>
              </div>
            </div>
          </div>

          <div class="security-item-gap"></div>

          <div class="security-item">
            <div class="security-item-header">
              <span class="security-label">密码</span>
              <button v-if="!editingPassword && !editingEmail" class="text-btn" @click="startEditPassword">修改</button>
            </div>
            <div v-if="!editingPassword" class="security-value">••••••••</div>
            <div v-else class="security-edit">
              <input
                v-model="oldPassword"
                class="field-input"
                type="password"
                placeholder="原密码"
                autocomplete="current-password"
                :disabled="isLoading"
              />
              <input
                v-model="newPassword"
                class="field-input"
                type="password"
                placeholder="新密码（至少 6 位）"
                autocomplete="new-password"
                :disabled="isLoading"
              />
              <input
                v-model="confirmPassword"
                class="field-input"
                type="password"
                placeholder="确认新密码"
                autocomplete="new-password"
                :disabled="isLoading"
                @keydown.enter="confirmEditPassword"
                @keydown.escape="cancelEditPassword"
              />
              <div v-if="passwordError" class="field-error">{{ passwordError }}</div>
              <div class="security-actions">
                <button class="btn-confirm" @click="confirmEditPassword" :disabled="isLoading">确认</button>
                <button class="btn-cancel" @click="cancelEditPassword">取消</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <Transition name="toast-fade">
      <div v-if="toastVisible" class="toast-container">
        <div class="toast-content">{{ toastMessage }}</div>
      </div>
    </Transition>

    <Transition name="preview-fade">
      <div v-if="avatarPreviewVisible" class="avatar-preview-backdrop" @click="closeAvatarPreview">
        <div class="avatar-preview-wrapper" @click.stop>
          <img :src="avatarPreview || avatarUrl" alt="avatar" class="avatar-preview-image" />
          <button class="avatar-preview-close" @click="closeAvatarPreview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.profile-page {
  position: relative;
  min-height: 100vh;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    radial-gradient(circle at bottom right, rgba(255, 255, 255, 0.04), transparent 18%),
    linear-gradient(180deg, #141414 0%, #101010 100%);
  color: #ddd;
  display: flex;
  flex-direction: column;
}

.profile-header {
  padding: 20px 28px;
  border-bottom: 1px solid #2a2a2a;
}

.profile-header-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.header-logo {
  height: 28px;
  width: auto;
  object-fit: contain;
  user-select: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
  position: absolute;
  left: 28px;
}

.header-logo:hover {
  opacity: 0.7;
}

.profile-page-title {
  color: #f5f5f5;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  margin: 0;
}

.profile-body {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 40px 20px 60px;
}

.profile-card {
  width: min(520px, 100%);
  padding: 36px 32px;
  border-radius: 22px;
  border: 1px solid #343434;
  background: linear-gradient(180deg, #1d1d1d 0%, #171717 100%);
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.35);
}

.info-section {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.avatar-ring {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  border: 2px solid #4d4d4d;
  background: #1c1c1c;
  overflow: visible;
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.avatar-ring:hover {
  border-color: #43f260;
  box-shadow: 0 0 0 3px rgba(67, 242, 96, 0.12);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9cf0ad;
  font-size: 32px;
  font-weight: 700;
  border-radius: 50%;
}

.avatar-edit-btn {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #2a2a2a;
  background: #43f260;
  color: #081408;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: transform 0.15s ease, background 0.15s ease;
  z-index: 2;
}

.avatar-edit-btn:hover {
  transform: scale(1.12);
  background: #56f86f;
}

.avatar-edit-btn svg {
  width: 14px;
  height: 14px;
}

.avatar-uploading-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
}

.mini-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #43f260;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.avatar-input {
  display: none;
}

.info-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-nickname {
  color: #f5f5f5;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
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

.inline-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  border: 1px solid #43f260;
  border-radius: 8px;
  background: #232323;
  color: #fff;
  font-size: 15px;
  outline: none;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.inline-input::placeholder {
  color: #676767;
}

.field-error {
  color: #ff9c95;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 2px;
}

.info-username {
  color: #8f8f8f;
  font-size: 14px;
}

.info-stats-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.stat-chip {
  color: #a0a0a0;
  font-size: 13px;
}

.stat-chip-clickable {
  cursor: pointer;
  transition: color 0.15s ease;
}

.stat-chip-clickable:hover {
  color: #43f260;
}

.stat-chip-joined {
  position: relative;
  cursor: pointer;
}

.stat-chip-joined:hover {
  color: #c0c0c0;
}

.date-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  padding: 6px 12px;
  border-radius: 8px;
  background: #1e1e1e;
  color: #e0e0e0;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  z-index: 10;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s ease, visibility 0.15s ease;
}

.date-popup.is-active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.date-popup::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 16px;
  border: 5px solid transparent;
  border-top-color: #1e1e1e;
}

@media (hover: hover) and (pointer: fine) {
  .stat-chip-joined:hover .date-popup {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
}

.stat-val {
  color: #43f260;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat-sep {
  color: #444;
  font-size: 13px;
}

.section-divider {
  height: 1px;
  background: #333;
  margin: 24px 0;
}

.security-section {
  display: flex;
  flex-direction: column;
}

.section-title {
  color: #f5f5f5;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 20px;
}

.security-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.security-item-gap {
  height: 16px;
}

.security-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.security-label {
  color: #ececec;
  font-size: 14px;
  font-weight: 600;
}

.security-value {
  color: #8f8f8f;
  font-size: 14px;
}

.security-edit {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #444;
  border-radius: 10px;
  background: #232323;
  color: #fff;
  padding: 10px 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.field-input::placeholder {
  color: #676767;
}

.field-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.field-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.security-actions {
  display: flex;
  gap: 10px;
}

.btn-confirm,
.btn-cancel {
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-confirm {
  background: linear-gradient(180deg, #56f86f 0%, #43f260 100%);
  color: #081408;
}

.btn-confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-cancel {
  background: #2d2d2d;
  color: #ccc;
  border: 1px solid #444;
}

.btn-cancel:hover {
  background: #363636;
  color: #fff;
}

.text-btn {
  border: none;
  background: transparent;
  color: #43f260;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 2px 0;
}

.text-btn:hover {
  color: #7bf58f;
}

.toast-container {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 9999;
  pointer-events: none;
}

.toast-content {
  background: rgba(30, 30, 30, 0.92);
  color: #43f260;
  padding: 14px 28px;
  border-radius: 8px;
  border: 1px solid #ffffff;
  font-size: 15px;
  font-weight: 600;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  white-space: nowrap;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -60%);
}

.avatar-preview-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(8px);
}

.avatar-preview-wrapper {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.avatar-preview-image {
  max-width: 90vw;
  max-height: 80vh;
  border-radius: 16px;
  object-fit: contain;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
}

.avatar-preview-close {
  position: absolute;
  top: -12px;
  right: -12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #2d2d2d;
  color: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.avatar-preview-close:hover {
  background: #444;
  color: #fff;
}

.avatar-preview-close svg {
  width: 16px;
  height: 16px;
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .profile-body {
    padding: 24px 12px 40px;
  }

  .profile-card {
    padding: 24px 18px;
    border-radius: 16px;
  }

  .info-section {
    gap: 14px;
  }

  .avatar-ring {
    width: 68px;
    height: 68px;
  }

  .avatar-fallback {
    font-size: 24px;
  }

  .avatar-edit-btn {
    width: 24px;
    height: 24px;
  }

  .avatar-edit-btn svg {
    width: 12px;
    height: 12px;
  }

  .info-nickname {
    font-size: 17px;
  }

  .header-logo {
    height: 22px;
    left: 16px;
  }

  .profile-page-title {
    font-size: 17px;
  }

  .field-input {
    padding: 9px 10px;
    font-size: 16px;
  }

  .info-stats-row {
    flex-wrap: wrap;
    gap: 4px 0;
  }

  .stat-chip {
    font-size: 12px;
  }

  .stat-sep {
    display: none;
  }

  .stat-chip-joined + .stat-sep {
    display: none;
  }

  .stat-chip:not(.stat-chip-joined) + .stat-sep {
    display: inline;
  }

  .stat-chip-joined {
    width: 100%;
  }
}

@media (max-height: 500px) and (orientation: landscape) {
  .profile-page {
    min-height: unset;
    height: auto;
  }
}
</style>
