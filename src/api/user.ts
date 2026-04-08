// src/api/user.ts
import { apiClient } from './client'
import type { User, CreateUserRequest, UpdateUserRequest, LoginRequest } from '@/types/user'

export const userApi = {
  // 获取用户信息
  async getUser(id: string): Promise<User> {
    return apiClient.get<User>(`/user/${id}`)
  },

  // 创建用户
  async createUser(data: CreateUserRequest): Promise<User> {
    return apiClient.post<User>('/user', data)
  },

  // 更新用户
  async updateUser(id: string, data: UpdateUserRequest): Promise<User> {
    return apiClient.put<User>(`/user/${id}`, data)
  },

  // 删除用户
  async deleteUser(id: string): Promise<void> {
    return apiClient.delete<void>(`/user/${id}`)
  },

  // 获取所有用户
  async getAllUsers(): Promise<User[]> {
    return apiClient.get<User[]>('/user')
  },

  // 用户登录
  async login(data: LoginRequest): Promise<User> {
    return apiClient.post<User>('/user/login', data)
  },
}
