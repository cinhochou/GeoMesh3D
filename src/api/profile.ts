import { apiClient } from './client'

export interface UserStats {
  projectCount: number
  roomCount: number
}

export const profileApi = {
  async getUserStats(userId: string): Promise<UserStats> {
    return apiClient.get<UserStats>(`/user/${userId}/stats`)
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const accessToken = apiClient.getAccessToken()
    const config = await import('@/config/api')
    const baseUrl = config.getApiConfig().baseUrl
    const response = await fetch(`${baseUrl}/user/${userId}/avatar`, {
      method: 'POST',
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`上传头像失败: ${response.status}`)
    }
    const rawText = await response.text()
    const payload = rawText ? JSON.parse(rawText) : null
    if (payload && typeof payload === 'object' && 'data' in payload) {
      return payload.data
    }
    return payload
  },
}
