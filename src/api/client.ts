import { getApiConfig } from '@/config/api'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export class ApiError extends Error {
  code: number
  status: number

  constructor(message: string, options: { code?: number; status: number }) {
    super(message)
    this.name = 'ApiError'
    this.code = options.code ?? options.status
    this.status = options.status
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'

const isNgrokUrl = (url: string): boolean => /\.ngrok(?:-free)?\.[^/]+/i.test(url)

const getStorage = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

class ApiClient {
  private baseUrl: string
  private refreshPromise: Promise<boolean> | null = null
  // 当 refresh token 失效时由调用方注册的回调，用于触发前端会话失效广播
  private sessionExpiredHandler: (() => void) | null = null

  constructor(baseUrl: string = getApiConfig().baseUrl) {
    this.baseUrl = baseUrl
  }

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.sessionExpiredHandler = handler
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', data })
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PUT', data })
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' })
  }

  private getDefaultHeaders(needsJson = false): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (needsJson) {
      headers['Content-Type'] = 'application/json'
    }
    if (isNgrokUrl(this.baseUrl)) {
      headers['ngrok-skip-browser-warning'] = 'true'
    }
    return headers
  }

  private async parseResponse<T>(response: Response): Promise<ApiResponse<T> | T | null> {
    const rawText = await response.text()
    if (!rawText) return null
    try {
      return JSON.parse(rawText) as ApiResponse<T> | T
    } catch {
      throw new ApiError('服务端返回非 JSON 数据，可能是 ngrok 警告页或代理中间页', {
        status: response.status,
      })
    }
  }

  async upload<T>(path: string, formData: FormData): Promise<T> {
    if (!this.isAuthPath(path) && this.isTokenExpiringSoon()) {
      await this.tryRefreshToken()
    }

    const accessToken = this.getAccessToken()
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        ...this.getDefaultHeaders(),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    })

    if (response.status === 401 && !this.isAuthPath(path)) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        const newToken = this.getAccessToken()
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: {
            ...this.getDefaultHeaders(),
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          },
          body: formData,
        })

        const retryPayload = await this.parseResponse<T>(retryResponse)

        if (!retryResponse.ok) {
          const apiMessage =
            retryPayload && typeof retryPayload === 'object' && 'message' in retryPayload
              ? String(retryPayload.message)
              : `Request failed with status ${retryResponse.status}`
          const apiCode =
            retryPayload && typeof retryPayload === 'object' && 'code' in retryPayload
              ? Number(retryPayload.code)
              : retryResponse.status
          throw new ApiError(apiMessage, { code: apiCode, status: retryResponse.status })
        }

        if (retryPayload === null) return undefined as T
        if (this.isApiResponse<T>(retryPayload)) {
          if (retryPayload.code !== 200) {
            throw new ApiError(retryPayload.message || 'Request failed', {
              code: retryPayload.code,
              status: retryResponse.status,
            })
          }
          return retryPayload.data
        }
        return retryPayload
      }
    }

    const payload = await this.parseResponse<T>(response)

    if (!response.ok) {
      const apiMessage =
        payload && typeof payload === 'object' && 'message' in payload
          ? String(payload.message)
          : `Request failed with status ${response.status}`
      const apiCode =
        payload && typeof payload === 'object' && 'code' in payload
          ? Number(payload.code)
          : response.status
      throw new ApiError(apiMessage, { code: apiCode, status: response.status })
    }

    if (payload === null) return undefined as T
    if (this.isApiResponse<T>(payload)) {
      if (payload.code !== 200) {
        throw new ApiError(payload.message || 'Request failed', {
          code: payload.code,
          status: response.status,
        })
      }
      return payload.data
    }
    return payload
  }

  getAccessToken(): string | null {
    return getStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null
  }

  getRefreshToken(): string | null {
    return getStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null
  }

  setTokens(tokens: { accessToken: string; refreshToken?: string | null; expiresIn?: number }) {
    const storage = getStorage()
    if (!storage) return

    storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
    if (tokens.refreshToken) {
      storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
    }
    if (tokens.expiresIn != null && tokens.expiresIn > 0) {
      storage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + tokens.expiresIn * 1000))
    }
  }

  clearTokens() {
    const storage = getStorage()
    if (!storage) return

    storage.removeItem(ACCESS_TOKEN_KEY)
    storage.removeItem(REFRESH_TOKEN_KEY)
    storage.removeItem(TOKEN_EXPIRES_AT_KEY)
  }

  getTokenExpiresAt(): number | null {
    const raw = getStorage()?.getItem(TOKEN_EXPIRES_AT_KEY)
    if (!raw) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }

  isTokenExpiringSoon(thresholdMs = 5 * 60 * 1000): boolean {
    const expiresAt = this.getTokenExpiresAt()
    if (!expiresAt) return false
    return Date.now() > expiresAt - thresholdMs
  }

  private isAuthPath(path: string): boolean {
    // 把 /auth/logout 也视为鉴权无关路径：它走 gateway 白名单，token 失效时也要能调通。
    // 关键：让预刷新和 401 重试都跳过 logout，避免：
    //   1) 用户主动登出时 apiClient 触发 tryRefreshToken；
    //   2) refresh 失败导致 reason 错误地变成 'refresh_failed'，登录页显示"会话已过期"而非"你已退出登录"。
    return path.startsWith('/auth/login')
        || path.startsWith('/auth/register')
        || path.startsWith('/auth/refresh')
        || path.startsWith('/auth/logout')
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = (async () => {
      const refreshToken = this.getRefreshToken()
      if (!refreshToken) {
        this.notifySessionExpired()
        return false
      }

      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            ...this.getDefaultHeaders(true),
          },
          body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) {
          this.clearTokens()
          this.notifySessionExpired()
          return false
        }

        const payload = await this.parseResponse(response)
        const data = (payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload) as {
          accessToken?: string
          refreshToken?: string | null
          expiresIn?: number
        } | null

        if (!data?.accessToken) {
          this.clearTokens()
          this.notifySessionExpired()
          return false
        }

        this.setTokens({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken ?? undefined,
          expiresIn: data.expiresIn,
        })
        return true
      } catch {
        this.clearTokens()
        this.notifySessionExpired()
        return false
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
  }

  private notifySessionExpired(): void {
    const handler = this.sessionExpiredHandler
    if (handler) {
      try {
        handler()
      } catch {
        // 回调自身异常不影响主流程
      }
    }
  }

  private async request<T>(
    path: string,
    options: {
      method: HttpMethod
      data?: unknown
    },
  ): Promise<T> {
    if (!this.isAuthPath(path) && this.isTokenExpiringSoon()) {
      await this.tryRefreshToken()
    }

    const accessToken = this.getAccessToken()
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        ...this.getDefaultHeaders(true),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
    })

    if (response.status === 401 && !this.isAuthPath(path)) {
      const refreshed = await this.tryRefreshToken()
      if (refreshed) {
        const newToken = this.getAccessToken()
        const retryResponse = await fetch(`${this.baseUrl}${path}`, {
          method: options.method,
          headers: {
            ...this.getDefaultHeaders(true),
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          },
          body: options.data === undefined ? undefined : JSON.stringify(options.data),
        })

        const retryPayload = await this.parseResponse<T>(retryResponse)

        if (!retryResponse.ok) {
          const apiMessage =
            retryPayload && typeof retryPayload === 'object' && 'message' in retryPayload
              ? String(retryPayload.message)
              : `Request failed with status ${retryResponse.status}`
          const apiCode =
            retryPayload && typeof retryPayload === 'object' && 'code' in retryPayload
              ? Number(retryPayload.code)
              : retryResponse.status
          throw new ApiError(apiMessage, { code: apiCode, status: retryResponse.status })
        }

        if (retryPayload === null) {
          return undefined as T
        }

        if (this.isApiResponse<T>(retryPayload)) {
          if (retryPayload.code !== 200) {
            throw new ApiError(retryPayload.message || 'Request failed', {
              code: retryPayload.code,
              status: retryResponse.status,
            })
          }
          return retryPayload.data
        }

        return retryPayload
      }
    }

    const payload = await this.parseResponse<T>(response)

    if (!response.ok) {
      const apiMessage =
        payload && typeof payload === 'object' && 'message' in payload
          ? String(payload.message)
          : `Request failed with status ${response.status}`
      const apiCode =
        payload && typeof payload === 'object' && 'code' in payload
          ? Number(payload.code)
          : response.status
      throw new ApiError(apiMessage, { code: apiCode, status: response.status })
    }

    if (payload === null) {
      return undefined as T
    }

    if (this.isApiResponse<T>(payload)) {
      if (payload.code !== 200) {
        throw new ApiError(payload.message || 'Request failed', {
          code: payload.code,
          status: response.status,
        })
      }
      return payload.data
    }

    return payload
  }

  private isApiResponse<T>(payload: ApiResponse<T> | T): payload is ApiResponse<T> {
    return typeof payload === 'object' && payload !== null && 'code' in payload && 'message' in payload
  }
}

export const apiClient = new ApiClient()
