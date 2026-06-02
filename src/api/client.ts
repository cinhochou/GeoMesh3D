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

const getStorage = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

class ApiClient {
  private baseUrl: string
  private refreshPromise: Promise<boolean> | null = null

  constructor(baseUrl: string = getApiConfig().baseUrl) {
    this.baseUrl = baseUrl
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

  async upload<T>(path: string, formData: FormData): Promise<T> {
    if (!this.isAuthPath(path) && this.isTokenExpiringSoon()) {
      await this.tryRefreshToken()
    }

    const accessToken = this.getAccessToken()
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
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
            Accept: 'application/json',
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          },
          body: formData,
        })

        const retryRawText = await retryResponse.text()
        const retryPayload = retryRawText ? (JSON.parse(retryRawText) as ApiResponse<T> | T) : null

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

    const rawText = await response.text()
    const payload = rawText ? (JSON.parse(rawText) as ApiResponse<T> | T) : null

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
    return path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/refresh')
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise

    this.refreshPromise = (async () => {
      const refreshToken = this.getRefreshToken()
      if (!refreshToken) return false

      try {
        const response = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        })

        if (!response.ok) {
          this.clearTokens()
          return false
        }

        const rawText = await response.text()
        const payload = rawText ? JSON.parse(rawText) : null
        const data = payload?.data ?? payload

        if (!data?.accessToken) {
          this.clearTokens()
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
        return false
      } finally {
        this.refreshPromise = null
      }
    })()

    return this.refreshPromise
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
        Accept: 'application/json',
        'Content-Type': 'application/json',
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
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(newToken ? { Authorization: `Bearer ${newToken}` } : {}),
          },
          body: options.data === undefined ? undefined : JSON.stringify(options.data),
        })

        const retryRawText = await retryResponse.text()
        const retryPayload = retryRawText ? (JSON.parse(retryRawText) as ApiResponse<T> | T) : null

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

    const rawText = await response.text()
    const payload = rawText ? (JSON.parse(rawText) as ApiResponse<T> | T) : null

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
