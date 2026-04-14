import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { apiClient, ApiError } from '@/api/client'
import { userApi } from '@/api/user'
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateUserRequest,
  User,
} from '@/types/user'

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error'

const extractErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Authentication request failed'
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const status = ref<AuthStatus>('idle')
  const initialized = ref(false)
  const error = ref<string | null>(null)
  let initializePromise: Promise<User | null> | null = null

  const isAuthenticated = computed(() => Boolean(user.value && apiClient.getAccessToken()))
  const isLoading = computed(() => status.value === 'loading')

  const clearError = () => {
    error.value = null
  }

  const setAuthenticated = (nextUser: User | null) => {
    user.value = nextUser
    status.value = nextUser ? 'authenticated' : 'idle'
  }

  const applyAuthResponse = (response: AuthResponse) => {
    setAuthenticated(response.user)
    clearError()
    return response.user
  }

  const initialize = async () => {
    if (initializePromise) return initializePromise
    if (initialized.value) return user.value

    initializePromise = (async () => {
      const accessToken = apiClient.getAccessToken()
      if (!accessToken) {
        initialized.value = true
        setAuthenticated(null)
        return null
      }

      status.value = 'loading'
      clearError()

      try {
        const currentUser = await authApi.me()
        setAuthenticated(currentUser)
        initialized.value = true
        return currentUser
      } catch (err) {
        apiClient.clearTokens()
        error.value = extractErrorMessage(err)
        setAuthenticated(null)
        initialized.value = true
        return null
      } finally {
        initializePromise = null
      }
    })()

    return initializePromise
  }

  const login = async (payload: LoginRequest) => {
    status.value = 'loading'
    clearError()

    try {
      const response = await authApi.login(payload)
      return applyAuthResponse(response)
    } catch (err) {
      status.value = 'error'
      error.value = extractErrorMessage(err)
      throw err
    }
  }

  const register = async (payload: RegisterRequest) => {
    status.value = 'loading'
    clearError()

    try {
      const response = await authApi.register(payload)
      return applyAuthResponse(response)
    } catch (err) {
      status.value = 'error'
      error.value = extractErrorMessage(err)
      throw err
    }
  }

  const logout = async () => {
    status.value = 'loading'
    clearError()

    try {
      await authApi.logout()
    } catch (err) {
      // 退出登录以本地清理为准，不让后端异常阻断退出流程。
      error.value = null
    } finally {
      setAuthenticated(null)
      status.value = 'idle'
    }
  }

  const refreshCurrentUser = async () => {
    if (!apiClient.getAccessToken()) {
      setAuthenticated(null)
      return null
    }

    status.value = 'loading'
    clearError()

    try {
      const currentUser = await authApi.me()
      setAuthenticated(currentUser)
      return currentUser
    } catch (err) {
      status.value = 'error'
      error.value = extractErrorMessage(err)
      throw err
    }
  }

  const refreshSession = async () => {
    status.value = 'loading'
    clearError()

    try {
      const response = await authApi.refresh()
      return applyAuthResponse(response)
    } catch (err) {
      apiClient.clearTokens()
      status.value = 'error'
      error.value = extractErrorMessage(err)
      setAuthenticated(null)
      throw err
    }
  }

  const updateProfile = async (userId: string, payload: UpdateUserRequest) => {
    status.value = 'loading'
    clearError()

    try {
      const updatedUser = await userApi.updateUser(userId, payload)
      setAuthenticated(updatedUser)
      return updatedUser
    } catch (err) {
      status.value = 'error'
      error.value = extractErrorMessage(err)
      throw err
    }
  }

  const changePassword = async (userId: string, payload: ChangePasswordRequest) => {
    status.value = 'loading'
    clearError()

    try {
      await userApi.changePassword(userId, payload)
      status.value = 'authenticated'
    } catch (err) {
      status.value = 'error'
      error.value = extractErrorMessage(err)
      throw err
    }
  }

  return {
    user,
    status,
    initialized,
    error,
    isAuthenticated,
    isLoading,
    clearError,
    initialize,
    login,
    register,
    logout,
    refreshCurrentUser,
    refreshSession,
    updateProfile,
    changePassword,
  }
})
