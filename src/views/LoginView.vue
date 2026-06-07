<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/authStore'
import { credentialStorage } from '@/utils/credentialStorage'
import { projectApi } from '@/api/project'
import { crossTabLoginEvents } from '@/utils/sessionEvents'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { error, isLoading } = storeToRefs(authStore)

const identifier = ref('')
const password = ref('')
const rememberPassword = ref(false)
const formError = ref('')
const isRedirecting = ref(false)
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

// O5：安全校验 redirect 路径，防止开放重定向到外站
// 拒绝：
//   - 非字符串
//   - 非以 / 开头（绝对路径必须是同源）
//   - 以 // 开头（协议相对 URL，会被浏览器解析为外站）
//   - 以 /\ 开头（Windows 风格路径分隔，浏览器可能解析为外站）
//   - 包含 ://（显式协议）
const isSafeRedirectPath = (path: unknown): path is string => {
  if (typeof path !== 'string') return false
  if (!path.startsWith('/')) return false
  if (path.startsWith('//') || path.startsWith('/\\')) return false
  if (path.includes('://')) return false
  return true
}

// 解析重定向目标（query.redirect 默认 /）
//   /profile        -> 正在进入个人主页
//   /projects       -> 正在进入项目列表
//   /editor 或 /    -> 正在进入编辑器（无项目时）/ 正在进入"项目名"项目（有 projectId 时）
const redirect = computed(() => {
  const value = route.query.redirect
  return isSafeRedirectPath(value) ? value : '/'
})

// 会话失效 reason → 提示文案
const sessionInvalidationReason = computed(() => {
  const value = route.query.reason
  if (typeof value !== 'string') return null
  if (value === 'expired' || value === 'refresh_failed') return '登录状态已过期，请重新登录'
  return null
})

// 从 redirect URL 中解析出 projectId（用于预取项目名以填充成功文案）
const redirectProjectId = computed(() => {
  const path = redirect.value
  try {
    // 构造 dummy base 让相对路径也能被 URL 解析
    const url = new URL(path, 'http://dummy.local')
    return url.searchParams.get('projectId')
  } catch {
    return null
  }
})

// 登录成功后异步拉取项目名；successMsg 通过 redirectProjectName 自动刷新
const redirectProjectName = ref<string | null>(null)

// successMsg 会随 redirectProjectName 异步填充而刷新
const successMsg = computed(() => {
  const path = redirect.value
  if (path.includes('/profile')) {
    return '登录成功！正在进入个人主页...'
  }
  if (path.includes('/projects')) {
    return '登录成功！正在进入项目列表...'
  }
  // 编辑器路由是 /，redirect 可能是 / 或 /?projectId=xxx
  if (path.startsWith('/editor') || path === '/' || path.startsWith('/?')) {
    const name = redirectProjectName.value
    if (name) {
      return `登录成功！正在进入"${name}"项目...`
    }
    return '登录成功！正在进入编辑器...'
  }
  return '登录成功！'
})

watch([identifier, password], () => {
  formError.value = ''
  authStore.clearError()
})

onMounted(async () => {
  const savedIdentifier = credentialStorage.getSavedIdentifier()
  if (savedIdentifier) {
    identifier.value = savedIdentifier
    const savedPassword = await credentialStorage.load(savedIdentifier)
    if (savedPassword) {
      password.value = savedPassword
      rememberPassword.value = true
    }
  }
  // 跨 Tab 重新登录：当其他 Tab 登录/重新登录（覆盖"同账号重登"和"切换账号"）后，
  // 当前 Tab 如果停留在 /login（说明是被会话失效拦截后跳过来的），
  // 需要自动跳回 redirect URL，回到用户原本要去的页面。
  //
  // 注：本 Tab 自己登录成功时，form 的 handleSubmit 走的是 router.replace 路径，
  // 与本订阅是不同的事件来源（form 不会触发 storage 事件），所以不会重复跳转。
  crossTabLoginEvents.on(handleCrossTabLogin)
})

onBeforeUnmount(() => {
  crossTabLoginEvents.off(handleCrossTabLogin)
})

const handleCrossTabLogin = async () => {
  // 仅当当前用户已经被认定为已登录（store.isAuthenticated）时跳转：
  // 防止罕见的、跨 Tab 广播与本 Tab 自身初始化之间的竞争导致
  // "还没真正登录"就被跳转走的边界情况
  if (!authStore.isAuthenticated) return
  // 二次校验 redirect 路径：与 computed redirect 共用 isSafeRedirectPath
  // （理论上一致，但显式校验防御未来逻辑分叉）
  const target = redirect.value
  if (!isSafeRedirectPath(target)) return
  // B7：跨 Tab 重登的体验对齐 form 登录后的 520ms 等待。
  // 给用户视觉上的"正在为你跳转"反馈（遮罩 isRedirecting 已经显示），与 form 路径一致
  isRedirecting.value = true
  await wait(200)
  await router.replace(target)
}

const validateForm = () => {
  if (!identifier.value.trim()) {
    formError.value = '请输入用户名或邮箱'
    return false
  }

  if (!password.value) {
    formError.value = '请输入密码'
    return false
  }

  if (password.value.length < 6) {
    formError.value = '密码长度不能少于 6 位'
    return false
  }

  return true
}

const isSwitchingUser = computed(() => route.query.switchUser === '1')

const handleSubmit = async () => {
  formError.value = ''
  authStore.clearError()

  if (!validateForm()) return

  if (isSwitchingUser.value) {
    const snapshotRaw = window.sessionStorage.getItem('auth_switch_snapshot')
    if (snapshotRaw) {
      try {
        const snapshot = JSON.parse(snapshotRaw) as { user?: { username?: string; email?: string } | null }
        const snapshotUser = snapshot.user
        const inputId = identifier.value.trim().toLowerCase()
        if (snapshotUser) {
          const matchesUsername = snapshotUser.username?.toLowerCase() === inputId
          const matchesEmail = snapshotUser.email?.toLowerCase() === inputId
          if (matchesUsername || matchesEmail) {
            formError.value = '该账号已登录，无需切换'
            return
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  try {
    await authStore.login({
      identifier: identifier.value.trim(),
      password: password.value,
    })
    if (rememberPassword.value) {
      await credentialStorage.save(identifier.value.trim(), password.value)
    } else {
      credentialStorage.clear()
    }
    // 若重定向到带 projectId 的编辑器，后台拉一次项目名用于填充"正在进入xxx项目"文案
    // 不阻塞 520ms 等待：successMsg 会随 redirectProjectName 异步更新而刷新
    const pid = redirectProjectId.value
    if (pid) {
      redirectProjectName.value = null
      void projectApi
        .getProject(pid)
        .then((p) => {
          if (p?.name) redirectProjectName.value = p.name
        })
        .catch(() => {
          // 拉取失败：保留通用文案"正在进入编辑器..."
        })
    }
    isRedirecting.value = true
    await wait(520)
    await router.replace(redirect.value)
  } catch {
    isRedirecting.value = false
  }
}

const handleBack = async () => {
  const restored = await authStore.cancelSwitchUser()
  if (restored) {
    await router.replace(redirect.value)
    return
  }
  await router.replace({ name: 'editor' })
}
</script>

<template>
  <div class="auth-page">
    <button type="button" class="back-link" @click="handleBack">返回</button>
    <Transition name="fade-overlay">
      <div v-if="isRedirecting" class="collab-wait-overlay">
        <div class="collab-wait-dialog">
          <div class="collab-spinner"></div>
          <div class="collab-wait-text">{{ successMsg }}</div>
        </div>
      </div>
    </Transition>

    <div class="auth-layout">
      <section class="auth-side">
        <img src="@/assets/GeoMesh3D_logo_white_1240x300.png" alt="GeoMesh3D" class="side-tag" />
        <h1 class="side-title">登录后，编辑体验更完整</h1>
        <p class="side-text">获得身份、接入协作、AR体验、继续你的编辑进度...</p>

        <div class="side-panel">
          <div class="side-panel-label">登录后你可以</div>
          <div class="side-panel-item">获得用户身份</div>
          <div class="side-panel-item">解锁关键功能</div>
          <div class="side-panel-item">继续进入已保存的工作区</div>
        </div>
      </section>

      <section class="auth-main">
        <div class="auth-card">
          <div class="card-badge">欢迎回来</div>
          <h2 class="card-title">登录</h2>
          <p class="card-text">输入账号信息以验证你的身份</p>

          <!-- 会话失效原因提示：当从 useSessionGuard 跳转过来时显示 -->
          <div v-if="sessionInvalidationReason" class="session-banner">
            {{ sessionInvalidationReason }}
          </div>

          <form class="auth-form" @submit.prevent="handleSubmit">
            <label class="field">
              <span class="field-label">用户名或邮箱</span>
              <input
                v-model="identifier"
                class="field-input"
                type="text"
                placeholder="请输入用户名或邮箱"
                autocomplete="username"
                :disabled="isLoading"
              />
            </label>

            <label class="field">
              <span class="field-label">密码</span>
              <input
                v-model="password"
                class="field-input"
                type="password"
                placeholder="请输入密码"
                autocomplete="current-password"
                :disabled="isLoading"
              />
            </label>

            <label class="remember-field">
              <input v-model="rememberPassword" type="checkbox" class="remember-checkbox" :disabled="isLoading" />
              <span class="remember-label">记住密码</span>
            </label>

            <div v-if="formError || error" class="error-box">
              {{ formError || error }}
            </div>

            <button class="submit-button" type="submit" :disabled="isLoading || isRedirecting">
              {{ isRedirecting ? '正在进入...' : isLoading ? '登录中...' : '登录' }}
            </button>

            <div class="links">
              <router-link class="secondary-link" :to="{ name: 'editor' }">
                先进入编辑器
              </router-link>
              <router-link :to="{ name: 'register', query: route.query }" class="primary-link">
                去注册
              </router-link>
            </div>
          </form>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  position: relative;
  height: 100%;
  min-height: 100vh;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  background:
    radial-gradient(circle at top left, rgba(67, 242, 96, 0.08), transparent 22%),
    radial-gradient(circle at bottom right, rgba(255, 255, 255, 0.04), transparent 18%),
    linear-gradient(180deg, #141414 0%, #101010 100%);
  color: #ddd;
}

.back-link {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 20;
  border: 1px solid #3f3f3f;
  border-radius: 999px;
  background: rgba(24, 24, 24, 0.88);
  color: #dcdcdc;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
}

.back-link:hover {
  border-color: #43f260;
  color: #a6f3b5;
}

.auth-layout {
  width: min(1040px, calc(100% - 40px));
  min-height: 100vh;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(320px, 1fr) minmax(360px, 430px);
  gap: 56px;
  align-items: center;
}

@media (max-width: 920px) {
  .auth-layout {
    width: min(560px, calc(100% - 24px));
    grid-template-columns: 1fr;
    gap: 28px;
    padding: 28px 0;
    align-items: start;
  }

  .side-title {
    max-width: none;
    font-size: 40px;
  }

  .auth-side {
    display: none;
  }

  .auth-main {
    width: 100%;
  }
}

.auth-side {
  padding: 24px 0;
}

.side-tag {
  display: block;
  width: 180px;
  height: auto;
  margin: 0 0 18px;
  object-fit: contain;
  user-select: none;
}

.side-title {
  margin: 0 0 16px;
  max-width: 10ch;
  color: #fff;
  font-size: clamp(38px, 4.8vw, 58px);
  line-height: 0.98;
  letter-spacing: -0.03em;
}

.side-text {
  margin: 0 0 28px;
  max-width: 420px;
  color: #9f9f9f;
  font-size: 16px;
  line-height: 1.7;
}

.side-panel {
  width: min(440px, 100%);
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.025);
}

.side-panel-label {
  margin-bottom: 10px;
  color: #8f8f8f;
  font-size: 12px;
}

.side-panel-item {
  padding: 12px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  color: #e4e4e4;
  font-size: 14px;
}

.side-panel-item:first-of-type {
  border-top: none;
}

.auth-main {
  display: flex;
  justify-content: center;
}

.auth-card {
  width: 100%;
  padding: 34px 32px 30px;
  border-radius: 22px;
  border: 1px solid #343434;
  background: linear-gradient(180deg, #1d1d1d 0%, #171717 100%);
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.35);
}

.card-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(67, 242, 96, 0.08);
  color: #7bf58f;
  font-size: 12px;
  font-weight: 700;
}

.card-title {
  margin: 18px 0 8px;
  color: #fff;
  font-size: 30px;
}

.card-text {
  margin: 0 0 24px;
  color: #8f8f8f;
  font-size: 14px;
}

.session-banner {
  margin: 0 0 18px;
  padding: 10px 14px;
  background: rgba(246, 178, 60, 0.12);
  border: 1px solid rgba(246, 178, 60, 0.4);
  color: #f6b23c;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  color: #ececec;
  font-size: 13px;
  font-weight: 600;
}

.field-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #444;
  border-radius: 12px;
  background: #232323;
  color: #fff;
  padding: 14px 15px;
  font-size: 14px;
  outline: none;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    background 0.2s ease;
}

.field-input::placeholder {
  color: #676767;
}

.field-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 3px rgba(67, 242, 96, 0.1);
  background: #262626;
}

.field-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.remember-field {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.remember-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1px solid #555;
  border-radius: 4px;
  background: #232323;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.remember-checkbox:checked {
  border-color: #43f260;
  background: #43f260;
}

.remember-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #081408;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.remember-checkbox:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.remember-label {
  color: #9f9f9f;
  font-size: 13px;
}

.remember-field:hover .remember-label {
  color: #dcdcdc;
}

.error-box {
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 89, 89, 0.25);
  background: rgba(255, 89, 89, 0.08);
  color: #ff9c95;
  font-size: 13px;
  line-height: 1.5;
}

.submit-button {
  border: none;
  border-radius: 12px;
  padding: 14px 18px;
  background: linear-gradient(180deg, #56f86f 0%, #43f260 100%);
  color: #081408;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 28px rgba(67, 242, 96, 0.18);
}

.submit-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.secondary-link,
.primary-link {
  text-decoration: none;
  font-size: 13px;
}

.secondary-link {
  color: #979797;
}

.secondary-link:hover {
  color: #fff;
}

.primary-link {
  color: #43f260;
  font-weight: 700;
}

.collab-wait-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.collab-wait-dialog {
  min-width: 240px;
  padding: 20px 24px;
  border: 1px solid #ffffff;
  border-radius: 8px;
  background: rgba(20, 20, 20, 0.94);
  color: #ffffff;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.collab-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.25);
  border-top-color: #43f260;
  border-radius: 50%;
  animation: collab-spin 0.8s linear infinite;
}

.collab-wait-text {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

@keyframes collab-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px), (max-height: 500px) and (orientation: landscape) {
  .auth-page {
    min-height: 100dvh;
  }

  .auth-layout {
    width: calc(100% - 20px);
    min-height: unset;
    gap: 16px;
    padding: 52px 0 20px;
    align-items: start;
  }

  .auth-side {
    display: none;
  }

  .auth-main {
    width: 100%;
    order: -1;
  }

  .auth-card {
    padding: 24px 18px 22px;
    border-radius: 16px;
  }

  .card-title {
    margin: 14px 0 6px;
    font-size: 24px;
  }

  .card-text {
    margin: 0 0 18px;
    font-size: 13px;
  }

  .auth-form {
    gap: 14px;
  }

  .field-input {
    padding: 12px 13px;
    font-size: 16px;
    border-radius: 10px;
  }

  .submit-button {
    padding: 13px 16px;
    font-size: 16px;
    border-radius: 10px;
  }

  .back-link {
    top: 10px;
    left: 10px;
    padding: 5px 10px;
    font-size: 12px;
  }

  .links {
    gap: 10px;
  }

  .secondary-link,
  .primary-link {
    font-size: 14px;
  }
}
</style>
