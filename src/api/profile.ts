import { apiClient } from './client'
import { getApiConfig } from '@/config/api'

export interface UserStats {
  projectCount: number
  roomCount: number
}

const isNgrokUrl = (url: string): boolean => /\.ngrok(?:-free)?\.[^/]+/i.test(url)

export const profileApi = {
  async getUserStats(userId: string): Promise<UserStats> {
    return apiClient.get<UserStats>(`/user/${userId}/stats`)
  },

  async uploadAvatar(userId: string, file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const accessToken = apiClient.getAccessToken()
    const baseUrl = getApiConfig().baseUrl
    const headers: Record<string, string> = {}
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }
    if (isNgrokUrl(baseUrl)) {
      headers['ngrok-skip-browser-warning'] = 'true'
    }
    const response = await fetch(`${baseUrl}/user/${userId}/avatar`, {
      method: 'POST',
      headers,
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
