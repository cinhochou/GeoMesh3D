import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { apiClient, ApiError } from '@/api/client'
import { userApi } from '@/api/user'
import { credentialStorage } from '@/utils/credentialStorage'
import {
  crossTabLoginEvents,
  SESSION_STATE_INACTIVE,
  SESSION_STATE_STORAGE_KEY,
  sessionEvents,
  type InvalidationReason,
} from '@/utils/sessionEvents'
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
  // 会话失效时间戳：null 表示当前会话有效；非 null 表示自该时刻起会话已被服务端或本地判定为失效
  // 用途：跨 Tab/页面统一感知登出与 token 过期；订阅者通过 sessionEvents 监听变化
  const sessionInvalidatedAt = ref<number | null>(null)
  const sessionInvalidationReason = ref<InvalidationReason | null>(null)
  let initializePromise: Promise<User | null> | null = null
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let storageBound = false
  let apiHandlerBound = false
  // 跨 Tab 重新初始化的去重：同一时刻只跑一次
  let crossTabReinitPromise: Promise<void> | null = null

  const isAuthenticated = computed(() => Boolean(user.value && apiClient.getAccessToken()))
  const isLoading = computed(() => status.value === 'loading')
  const hasSwitchSnapshot = ref(
    typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(SWITCH_USER_SNAPSHOT_KEY)),
  )
  // 标记下一次进入编辑器时是否跳过草稿恢复提示
  // 由 cancelSwitchUser 在 SPA 内取消切换时置位，编辑器消费后清零
  // 使用 ref 而非 sessionStorage 可在页面刷新（JS context 重置）时自动失效
  const skipNextDraftRecovery = ref(false)

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
    // 登录/注册/续签成功后清空失效标记，UI 重新进入可用态
    clearSessionInvalidation()
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

  /**
   * 内部失效标记：不写 localStorage、仅设状态 + 广播订阅者。
   * 由 markSessionInvalidated 和跨 Tab storage 事件处理共用。
   * 去重逻辑：以 sessionInvalidatedAt 已被设置为准，避免对同一事件多次善后。
   */
  const markInvalidatedInternal = (reason: InvalidationReason) => {
    if (sessionInvalidatedAt.value !== null) {
      return
    }
    sessionInvalidatedAt.value = Date.now()
    sessionInvalidationReason.value = reason
    sessionEvents.emit(reason)
  }

  /**
   * 将当前会话标记为已失效：
   * - 调用 markInvalidatedInternal 走统一的去重 + 状态写入
   * - 额外写 localStorage，让其他 Tab 通过 storage 事件感知
   * - reason 用于日志与 UI 提示文案
   */
  const markSessionInvalidated = (reason: InvalidationReason) => {
    if (sessionInvalidatedAt.value !== null) {
      return
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(SESSION_STATE_STORAGE_KEY, SESSION_STATE_INACTIVE)
      } catch {
        // 写入失败（如 quota 满）不影响本 Tab 内的失效流程
      }
    }
    markInvalidatedInternal(reason)
  }

  /**
   * 重置失效标记：用于用户重新登录成功后清空状态
   */
  const clearSessionInvalidation = () => {
    sessionInvalidatedAt.value = null
    sessionInvalidationReason.value = null
    if (typeof window !== 'undefined') {
      try {
        // 清理 localStorage（如果它仍然指向 inactive）
        const current = window.localStorage.getItem(SESSION_STATE_STORAGE_KEY)
        if (current === SESSION_STATE_INACTIVE) {
          window.localStorage.removeItem(SESSION_STATE_STORAGE_KEY)
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * 跨 Tab 重新初始化：
   * 场景：其他 Tab 完成了登录 / 重新登录（即便本 Tab 之前已经处于登录态），
   *       localStorage 里的 access_token 已更新 → 本 Tab 需要拉取最新 user 并同步 store。
   *
   * 实现：用最新的 localStorage token 调一次 authApi.me()，把 user 写回 store；
   *       然后 clearSessionInvalidation() 同步清掉本 Tab 的失效态与 localStorage 标志；
   *       之后通过 crossTabLoginEvents 广播给其他模块（订阅者决定是否需要重新拉数据）。
   *
   * 防御：
   *   - crossTabReinitPromise 去重：同一时刻只跑一次，避免 storage 事件风暴
   *   - 仅在 user.id 实际变化时才 setAuthenticated（避免无意义的响应式触发与重新渲染）
   *   - 出错时保持当前状态不动（不会让已登录的 Tab 变成未登录）
   *   - 事件每次成功都广播（覆盖"同账号重登"和"切换账号"两种情况）；
   *     订阅者按需决定是否重拉数据；LoginView 会用它自动跳回原页面
   */
  const reinitializeFromStorageToken = (): Promise<void> => {
    if (crossTabReinitPromise) return crossTabReinitPromise
    crossTabReinitPromise = (async () => {
      try {
        const fresh = await authApi.me()
        // 仅在 user 实际变化时才更新（覆盖了"重新登录但还是同一个用户"和"切换账号"两种情况）
        const userChanged = !user.value || user.value.id !== fresh.id
        if (userChanged) {
          setAuthenticated(fresh)
        }
        // 总是清失效态（no-op if already null）和重置 refresh timer
        clearSessionInvalidation()
        scheduleTokenRefresh()
        // 每次成功都广播，订阅者自行决定如何响应：
        //   - 视图（项目列表/个人中心/编辑器）→ 根据 event.changed 决定是否重拉数据
        //   - LoginView                          → 自动跳回 redirect URL
        // 通过 changed 字段让订阅者区分"同账号重登"与"切换账号"两种情况
        crossTabLoginEvents.emit({
          userId: fresh.id,
          source: 'access_token_change',
          changed: userChanged,
        })
      } catch {
        // token 无效（被服务端撤销、跨域 cookie 失效等）：保持当前状态不动
      } finally {
        crossTabReinitPromise = null
      }
    })()
    return crossTabReinitPromise
  }

  /**
   * 绑定跨 Tab 会话同步监听（仅在首次调用时生效）。
   * 监听两个 localStorage key：
   * 1) access_token 从有变无 → 走本地清理流程（兼容旧逻辑）
   * 2) auth:session_state 变为 'inactive' → 触发失效广播（其他 Tab 主动登出 / 服务端失效）
   *
   * 注：只在调用方处于登录态时才广播失效。未登录 Tab 收到事件直接忽略，避免占位 UI 误显示。
   */
  const bindCrossTabSessionSyncOnce = () => {
    if (storageBound) return
    if (typeof window === 'undefined') return
    storageBound = true

    window.addEventListener('storage', (event) => {
      // 关键：跨 Tab 退出/refresh 失败的同步。
      // 在原作者的代码里，这里只调了 clearSessionLocal()，导致 Tab B 收到 access_token 移除
      // 后 isAuthenticated 变 false，紧接着收到 auth:session_state='inactive' 时被第二道
      // if (!isAuthenticated.value) return 守卫挡掉，从而永远不触发 markInvalidatedInternal。
      // 占位卡不会显示。修复：清完本地后立刻广播失效。
      if (event.key === 'access_token' && event.oldValue && !event.newValue) {
        if (isAuthenticated.value) {
          clearSessionLocal()
          markInvalidatedInternal('other_tab')
        }
        return
      }

      // 关键：其他 Tab 完成了登录 / 重新登录（access_token 被新值覆盖）。
      //   - 从有到新值：典型场景——其他 Tab 重新登录（包括同账号重登 / 切换账号）
      //   - 从无到有：典型场景——其他 Tab 完成首次登录
      // 这两种情况都要让本 Tab 同步最新 user 状态。即便本 Tab 当前是登录态（非失效态），
      // 如果是切换账号，user.id 会变；如果是同账号重登，user.id 不变但 token 已轮换，
      // 都要保证本 Tab 拿到最新 user、失效态被清、refresh timer 被重置。
      // 守卫：新值与旧值不同（避免无意义的同值写入触发）；新值存在（不是 logout 事件）。
      if (
        event.key === 'access_token' &&
        event.newValue &&
        event.newValue !== event.oldValue
      ) {
        void reinitializeFromStorageToken()
        return
      }

      // 关键：其他 Tab 清除了失效标志（auth:session_state 从 'inactive' 变为 null）。
      // 典型触发场景：其他 Tab 的 clearSessionInvalidation 被调用（登录成功 / 显式重置）。
      // 即便本 Tab 没有收到 access_token 事件（例如清失效的人没换 token），也要同步把本 Tab
      // 的占位卡撤掉。
      if (
        event.key === SESSION_STATE_STORAGE_KEY &&
        event.oldValue === SESSION_STATE_INACTIVE &&
        !event.newValue
      ) {
        if (sessionInvalidatedAt.value !== null) {
          // 若当前没有有效 token（极端情况），先尝试拉取 user；否则仅清失效态
          if (apiClient.getAccessToken()) {
            void reinitializeFromStorageToken()
          } else {
            clearSessionInvalidation()
          }
        }
        return
      }

      // 其他 Tab 主动标记会话失效（来自 markSessionInvalidated 的写入）
      // 守卫保留：未登录 Tab 收到事件不渲染占位卡（防御性，正常路径不会走到这里）
      if (event.key === SESSION_STATE_STORAGE_KEY && event.newValue === SESSION_STATE_INACTIVE) {
        if (!isAuthenticated.value) {
          return
        }
        clearSessionLocal()
        markInvalidatedInternal('other_tab')
      }
    })
  }

  /**
   * 注册 apiClient 的会话失效回调：
   * 当 refreshToken 失效（refresh HTTP 401、网络错误、refreshToken 缺失等）时，
   * apiClient 内部会清掉 token；这里把会话标记为失效并广播订阅者。
   */
  const bindApiSessionExpiredHandlerOnce = () => {
    if (apiHandlerBound) return
    apiHandlerBound = true
    apiClient.setSessionExpiredHandler(() => {
      markSessionInvalidated('refresh_failed')
    })
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
      // 跨 Tab / API 钩子的绑定已经移到 setup 末尾，这里不再重复调用
      // （避免 initialize() 之前的 storage 事件被遗漏）

      // P1：读取跨 Tab 同步的失效标志
      // 场景：用户刷新页面的瞬间，另一 Tab 已经触发了失效（logout / refresh 失败）。
      // 之前的代码没有读这个标志，导致刷新后视图不再感知"会话已失效"语义。
      // 走 markInvalidatedInternal 是为了和正常失效路径走同一套状态变更。
      // 此时尚无订阅者，sessionEvents.emit 不会触发任何回调。
      if (typeof window !== 'undefined') {
        try {
          const state = window.localStorage.getItem(SESSION_STATE_STORAGE_KEY)
          if (state === SESSION_STATE_INACTIVE) {
            // 持久化标志只表示"已被标为失效"，无法还原 reason；
            // 'manual' 仅在当前 Tab 主动 logout 时出现（其他 Tab 写入是 'other_tab' / 'refresh_failed'），
            // 刷新后统一按 'other_tab' 处理，UI 走"登录状态已过期"提示。
            markInvalidatedInternal('other_tab')
          }
        } catch {
          // 读取失败（如 SSR / 隐私模式）按未失效处理
        }
      }

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
        // 即便 token 仍有效（理论上不会出现：clearSessionInvalidation 应该在登录后清掉标志），
        // 也尊重持久化的失效标志——视图的 useSessionGuard 会接管后续跳转。
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
    } catch {
      error.value = null
    } finally {
      clearSwitchSnapshot()
      setAuthenticated(null)
      status.value = 'idle'
      // 本 Tab 主动登出：标记会话失效 → 写 localStorage 通知其他 Tab → 广播订阅者
      markSessionInvalidated('manual')
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
    // 标记从切换用户取消流程返回编辑器：跳过草稿恢复提示
    // （scene/editor 已在 editorSession 模块级变量中保留）
    skipNextDraftRecovery.value = true
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

  // 必须在 store 第一次被使用时就绑定：覆盖 initialize() 之前的 storage 事件
  bindCrossTabSessionSyncOnce()
  bindApiSessionExpiredHandlerOnce()

  return {
    user,
    status,
    initialized,
    error,
    isAuthenticated,
    isLoading,
    sessionInvalidatedAt,
    sessionInvalidationReason,
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
    skipNextDraftRecovery,
    refreshCurrentUser,
    refreshSession,
    updateProfile,
    changePassword,
    markSessionInvalidated,
    clearSessionInvalidation,
  }
})
