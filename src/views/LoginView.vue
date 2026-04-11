<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/store/authStore'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const identifier = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

const redirect = computed(() => (route.query.redirect as string) || '/')

onMounted(() => {
  if (authStore.isAuthenticated) {
    router.replace(redirect.value)
  }
})

const validateForm = () => {
  if (!identifier.value.trim()) {
    errorMessage.value = '请输入用户名或邮箱'
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
    await authStore.login({
      identifier: identifier.value.trim(),
      password: password.value,
    })
    router.replace(redirect.value)
  } catch (error: any) {
    errorMessage.value = error.message || '登录失败，请检查用户名和密码'
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="auth-container">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">登录</h1>
        <p class="auth-subtitle">3D 几何编辑器</p>
      </div>

      <form @submit.prevent="handleSubmit" class="auth-form">
        <div class="form-group">
          <label for="identifier" class="form-label">用户名或邮箱</label>
          <input
            id="identifier"
            v-model="identifier"
            type="text"
            class="form-input"
            placeholder="请输入用户名或邮箱"
            :disabled="isLoading"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            class="form-input"
            placeholder="请输入密码"
            :disabled="isLoading"
            autocomplete="current-password"
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>

        <button type="submit" class="submit-button" :disabled="isLoading">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>

        <div class="auth-footer">
          <span class="auth-footer-text">还没有账号？</span>
          <router-link to="/register" class="auth-link">去注册</router-link>
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
