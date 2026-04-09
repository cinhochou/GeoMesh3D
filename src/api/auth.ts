import { apiClient } from './client'
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
    })
    return response
  },

  async register(data: RegisterRequest & RegisterBody): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data)
    apiClient.setTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
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
    })
    return response
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post<void>('/auth/logout')
    } finally {
      apiClient.clearTokens()
    }
  },

  async me(): Promise<User> {
    return apiClient.get<User>('/auth/me')
  },
}
