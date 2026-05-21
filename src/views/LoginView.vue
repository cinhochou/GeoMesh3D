<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/authStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { error, isLoading } = storeToRefs(authStore)

const identifier = ref('')
const password = ref('')
const formError = ref('')
const isRedirecting = ref(false)
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const redirect = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
})

watch([identifier, password], () => {
  formError.value = ''
  authStore.clearError()
})

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

const handleSubmit = async () => {
  formError.value = ''
  authStore.clearError()

  if (!validateForm()) return

  try {
    await authStore.login({
      identifier: identifier.value.trim(),
      password: password.value,
    })
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
    <button type="button" class="back-link" @click="handleBack">&lt;返回</button>
    <Transition name="fade-overlay">
      <div v-if="isRedirecting" class="collab-wait-overlay">
        <div class="collab-wait-dialog">
          <div class="collab-spinner"></div>
          <div class="collab-wait-text">登录成功！正在进入编辑器...</div>
        </div>
      </div>
    </Transition>

    <div class="auth-layout">
      <section class="auth-side">
        <p class="side-tag">3D Geometry Editor</p>
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
  margin: 0 0 18px;
  color: #43f260;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
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
