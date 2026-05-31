import { apiClient, ApiError } from './client'
import type { AuthResponse, LoginRequest, RegisterRequest, User } from '@/types/user'
import type { operations as AuthOperations } from '@/types/api-service-auth'

type LoginBody = AuthOperations['login']['requestBody']['content']['application/json']
type RegisterBody = AuthOperations['register']['requestBody']['content']['application/json']
type RefreshBody = AuthOperations['refresh']['requestBody']['content']['application/json']

export const authApi = {
  async login(data: LoginRequest & LoginBody): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', data)
    apiClient.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresIn: response.expiresIn,
    })
    return response
  },

  async register(data: RegisterRequest & RegisterBody): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data)
    apiClient.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresIn: response.expiresIn,
    })
    return response
  },

  async refresh(refreshToken?: string): Promise<AuthResponse> {
    const token = refreshToken ?? apiClient.getRefreshToken()
    if (!token) {
      throw new Error('Missing refresh token')
    }

    const response = await apiClient.post<AuthResponse>('/auth/refresh', {
      refreshToken: token,
    } satisfies RefreshBody)
    apiClient.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      expiresIn: response.expiresIn,
    })
    return response
  },

  async logout(): Promise<void> {
    const accessToken = apiClient.getAccessToken()

    try {
      if (!accessToken) {
        return
      }

      await apiClient.post<void>('/auth/logout')
    } catch (error) {
      // 对登出来说，401 更接近“服务端已不认当前令牌”，本地仍然应该继续清理。
      if (!(error instanceof ApiError) || error.status !== 401) {
        throw error
      }
    } finally {
      apiClient.clearTokens()
    }
  },

  async me(): Promise<User> {
    return apiClient.get<User>('/auth/me')
  },
}
