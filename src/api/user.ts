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

// ---- 用户信息短时缓存 ----
// getUser 被多处轮询路径反复调用（如项目列表每 30 秒对每个 ownerId 各查一次），
// 而昵称/头像这类资料几乎不变。用短 TTL 缓存 + in-flight 去重消除这些重复请求。
/** 用户资料缓存有效期：5 分钟。资料变更不敏感，可安全缓存 */
const USER_CACHE_TTL_MS = 5 * 60_000

interface UserCacheEntry {
  at: number
  data: User
}

const userCache = new Map<string, UserCacheEntry>()
const userPending = new Map<string, Promise<User>>()

const fetchUserCached = (id: GetUserPathId): Promise<User> => {
  const now = Date.now()
  const cached = userCache.get(id)
  if (cached && now - cached.at < USER_CACHE_TTL_MS) {
    return Promise.resolve(cached.data)
  }
  const pending = userPending.get(id)
  if (pending) return pending

  const task = (async () => {
    const user = await apiClient.get<User>(`/user/${id}`)
    userCache.set(id, { at: Date.now(), data: user })
    return user
  })().finally(() => {
    userPending.delete(id)
  })

  userPending.set(id, task)
  return task
}

/** 用户资料变更后（改名/换头像）使缓存立即失效，避免界面长时间显示旧昵称 */
export const invalidateUserCache = (id?: string): void => {
  if (id) userCache.delete(id)
  else userCache.clear()
}

export const userApi = {
  async getUser(id: GetUserPathId): Promise<User> {
    return fetchUserCached(id)
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
