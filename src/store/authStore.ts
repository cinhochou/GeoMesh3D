import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { apiClient, ApiError } from '@/api/client'
import { userApi } from '@/api/user'
import { credentialStorage } from '@/utils/credentialStorage'
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateUserRequest,
  User,
} from '@/types/user'

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error'
const SWITCH_USER_SNAPSHOT_KEY = 'auth_switch_snapshot'
const REFRESH_AHEAD_MS = 5 * 60 * 1000
const REFRESH_CHECK_INTERVAL_MS = 60 * 1000

type SwitchUserSnapshot = {
  accessToken: string
  refreshToken: string | null
  user: User | null
}

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
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  const isAuthenticated = computed(() => Boolean(user.value && apiClient.getAccessToken()))
  const isLoading = computed(() => status.value === 'loading')
  const hasSwitchSnapshot = ref(
    typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(SWITCH_USER_SNAPSHOT_KEY)),
  )

  const clearError = () => {
    error.value = null
  }

  const setAuthenticated = (nextUser: User | null) => {
    user.value = nextUser
    status.value = nextUser ? 'authenticated' : 'idle'
  }

  const applyAuthResponse = (response: AuthResponse) => {
    clearSwitchSnapshot()
    setAuthenticated(response.user)
    clearError()
    scheduleTokenRefresh()
    return response.user
  }

  const readSwitchSnapshot = (): SwitchUserSnapshot | null => {
    if (typeof window === 'undefined') return null
    const raw = window.sessionStorage.getItem(SWITCH_USER_SNAPSHOT_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SwitchUserSnapshot
    } catch {
      window.sessionStorage.removeItem(SWITCH_USER_SNAPSHOT_KEY)
      hasSwitchSnapshot.value = false
      return null
    }
  }

  const saveSwitchSnapshot = (snapshot: SwitchUserSnapshot) => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(SWITCH_USER_SNAPSHOT_KEY, JSON.stringify(snapshot))
    hasSwitchSnapshot.value = true
  }

  const clearSwitchSnapshot = () => {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(SWITCH_USER_SNAPSHOT_KEY)
    hasSwitchSnapshot.value = false
  }

  const clearRefreshTimer = () => {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  const scheduleTokenRefresh = () => {
    clearRefreshTimer()
    if (!isAuthenticated.value) return
    refreshTimer = setInterval(async () => {
      if (!isAuthenticated.value) {
        clearRefreshTimer()
        return
      }
      if (apiClient.isTokenExpiringSoon(REFRESH_AHEAD_MS)) {
        try {
          await authApi.refresh()
        } catch {
          clearRefreshTimer()
        }
      }
    }, REFRESH_CHECK_INTERVAL_MS)
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
        scheduleTokenRefresh()
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
    clearRefreshTimer()

    try {
      await authApi.logout()
    } catch (err) {
      error.value = null
    } finally {
      clearSwitchSnapshot()
      setAuthenticated(null)
      status.value = 'idle'
    }
  }

  const clearSessionLocal = (options?: { preserveSwitchSnapshot?: boolean }) => {
    if (!options?.preserveSwitchSnapshot) {
      clearSwitchSnapshot()
    }
    apiClient.clearTokens()
    clearError()
    setAuthenticated(null)
    status.value = 'idle'
    clearRefreshTimer()
  }

  const beginSwitchUser = () => {
    const accessToken = apiClient.getAccessToken()
    if (!accessToken) {
      clearSessionLocal()
      return
    }
    saveSwitchSnapshot({
      accessToken,
      refreshToken: apiClient.getRefreshToken(),
      user: user.value,
    })
    clearSessionLocal({ preserveSwitchSnapshot: true })
  }

  const cancelSwitchUser = async () => {
    const snapshot = readSwitchSnapshot()
    if (!snapshot) return false
    apiClient.setTokens({
      accessToken: snapshot.accessToken,
      refreshToken: snapshot.refreshToken,
    })
    if (snapshot.user) {
      setAuthenticated(snapshot.user)
      clearError()
      status.value = 'authenticated'
      scheduleTokenRefresh()
    } else {
      await refreshCurrentUser()
    }
    clearSwitchSnapshot()
    return true
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
      credentialStorage.clear()
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
    clearSessionLocal,
    beginSwitchUser,
    cancelSwitchUser,
    hasSwitchSnapshot,
    clearSwitchSnapshot,
    refreshCurrentUser,
    refreshSession,
    updateProfile,
    changePassword,
  }
})
