import { apiClient } from './client'
import type {
  ChangePasswordRequest,
  CheckEmailRequest,
  ResetPasswordRequest,
  UpdateUserRequest,
  User,
} from '@/types/user'
import type { operations as UserOperations } from '@/types/api-service-user'

type GetUserPathId = UserOperations['getUser']['parameters']['path']['id']
type UpdateUserPathId = UserOperations['updateUser']['parameters']['path']['id']
type DeleteUserPathId = UserOperations['deleteUser']['parameters']['path']['id']
type ChangePasswordPathId = UserOperations['changePassword']['parameters']['path']['id']
type UpdateUserBody = UserOperations['updateUser']['requestBody']['content']['application/json']
type ChangePasswordBody = UserOperations['changePassword']['requestBody']['content']['application/json']
type ResetPasswordBody = UserOperations['resetPassword']['requestBody']['content']['application/json']
type CheckEmailBody = UserOperations['checkEmail']['requestBody']['content']['application/json']

export const userApi = {
  async getUser(id: GetUserPathId): Promise<User> {
    return apiClient.get<User>(`/user/${id}`)
  },

  async updateUser(id: UpdateUserPathId, data: UpdateUserRequest & UpdateUserBody): Promise<User> {
    return apiClient.put<User>(`/user/${id}`, data)
  },

  async deleteUser(id: DeleteUserPathId): Promise<void> {
    return apiClient.delete<void>(`/user/${id}`)
  },

  async getAllUsers(): Promise<User[]> {
    return apiClient.get<User[]>('/user')
  },

  async changePassword(
    id: ChangePasswordPathId,
    data: ChangePasswordRequest & ChangePasswordBody,
  ): Promise<void> {
    return apiClient.put<void>(`/user/${id}/password`, data)
  },

  async resetPassword(data: ResetPasswordRequest & ResetPasswordBody): Promise<void> {
    return apiClient.post<void>('/user/reset-password', data)
  },

  async checkEmail(data: CheckEmailRequest & CheckEmailBody): Promise<boolean> {
    return apiClient.post<boolean>('/user/check-email', data)
  },
}
