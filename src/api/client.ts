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

const getStorage = () => {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

class ApiClient {
  private baseUrl: string

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

  getAccessToken(): string | null {
    return getStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null
  }

  getRefreshToken(): string | null {
    return getStorage()?.getItem(REFRESH_TOKEN_KEY) ?? null
  }

  setTokens(tokens: { accessToken: string; refreshToken?: string | null }) {
    const storage = getStorage()
    if (!storage) return

    storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
    if (tokens.refreshToken) {
      storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
    }
  }

  clearTokens() {
    const storage = getStorage()
    if (!storage) return

    storage.removeItem(ACCESS_TOKEN_KEY)
    storage.removeItem(REFRESH_TOKEN_KEY)
  }

  private async request<T>(
    path: string,
    options: {
      method: HttpMethod
      data?: unknown
    },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(this.getAccessToken() ? { Authorization: `Bearer ${this.getAccessToken()}` } : {}),
      },
      body: options.data === undefined ? undefined : JSON.stringify(options.data),
    })

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
