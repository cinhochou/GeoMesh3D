<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/store/authStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const redirect = computed(() => (route.query.redirect as string) || '/')

onMounted(() => {
  if (authStore.isAuthenticated) {
    router.replace(redirect.value)
  }
})

const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

const validateForm = () => {
  if (!username.value.trim()) {
    errorMessage.value = '请输入用户名'
    return false
  }
  if (username.value.trim().length < 3) {
    errorMessage.value = '用户名长度不能少于3位'
    return false
  }
  if (!email.value.trim()) {
    errorMessage.value = '请输入邮箱地址'
    return false
  }
  if (!validateEmail(email.value)) {
    errorMessage.value = '请输入有效的邮箱地址'
    return false
  }
  if (!password.value) {
    errorMessage.value = '请输入密码'
    return false
  }
  if (password.value.length < 6) {
    errorMessage.value = '密码长度不能少于6位'
    return false
  }
  if (!confirmPassword.value) {
    errorMessage.value = '请确认密码'
    return false
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的密码不一致'
    return false
  }
  return true
}

const handleSubmit = async () => {
  errorMessage.value = ''
  authStore.clearError()

  if (!validateForm()) {
    return
  }

  isLoading.value = true
  try {
    await authStore.register({
      username: username.value.trim(),
      email: email.value.trim(),
      password: password.value,
    })
    router.replace(redirect.value)
  } catch (error: any) {
    errorMessage.value = error.message || '注册失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">注册</h1>
        <p class="auth-subtitle">3D 几何编辑器</p>
      </div>

      <form @submit.prevent="handleSubmit" class="auth-form">
        <div class="form-group">
          <label for="username" class="form-label">用户名</label>
          <input
            id="username"
            v-model="username"
            type="text"
            class="form-input"
            placeholder="请输入用户名（至少3位）"
            :disabled="isLoading"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="email" class="form-label">邮箱</label>
          <input
            id="email"
            v-model="email"
            type="email"
            class="form-input"
            placeholder="请输入邮箱地址"
            :disabled="isLoading"
            autocomplete="email"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="form-input"
            placeholder="请输入密码（至少6位）"
            :disabled="isLoading"
            autocomplete="new-password"
          />
        </div>

        <div class="form-group">
          <label for="confirmPassword" class="form-label">确认密码</label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            class="form-input"
            placeholder="请再次输入密码"
            :disabled="isLoading"
            autocomplete="new-password"
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <button type="submit" class="submit-button" :disabled="isLoading">
          {{ isLoading ? '注册中...' : '注册' }}
        </button>

        <div class="auth-footer">
          <span class="auth-footer-text">已有账号？</span>
          <router-link to="/login" class="auth-link">去登录</router-link>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #111;
  padding: 20px;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 40px 32px;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
}

.auth-subtitle {
  font-size: 14px;
  color: #888;
  margin: 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: #eee;
}

.form-input {
  background: #222;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 12px 16px;
  font-size: 14px;
  color: #fff;
  outline: none;
  transition: all 0.2s;
}

.form-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.1);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-input::placeholder {
  color: #666;
}

.error-message {
  padding: 12px 16px;
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.3);
  border-radius: 6px;
  color: #ff3b30;
  font-size: 13px;
  text-align: center;
}

.submit-button {
  background: #43f260;
  color: #000;
  border: none;
  border-radius: 6px;
  padding: 14px 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.submit-button:hover:not(:disabled) {
  background: #36d150;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(67, 242, 96, 0.3);
}

.submit-button:active:not(:disabled) {
  transform: translateY(0);
}

.submit-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.auth-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 8px;
}

.auth-footer-text {
  font-size: 14px;
  color: #888;
}

.auth-link {
  font-size: 14px;
  color: #43f260;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}

.auth-link:hover {
  text-decoration: underline;
}

@media (max-width: 480px) {
  .auth-card {
    padding: 32px 24px;
  }

  .auth-title {
    font-size: 24px;
  }

  .form-input {
    padding: 10px 14px;
  }

  .submit-button {
    padding: 12px 20px;
    font-size: 14px;
  }
}
</style>
