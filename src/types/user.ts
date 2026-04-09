import type { components as AuthComponents } from './api-service-auth'
import type { components as UserComponents } from './api-service-user'

type UserDtoSchema = UserComponents['schemas']['UserDTO']
type AuthResponseSchema = AuthComponents['schemas']['AuthResponse']

type RequiredFields<T, K extends keyof T> = Required<Pick<T, K>> & Omit<T, K>

export type User = RequiredFields<
  UserDtoSchema,
  'id' | 'username' | 'email' | 'role' | 'status' | 'createdAt' | 'updatedAt'
> & {
  nickname: UserDtoSchema['nickname'] | null
  avatarUrl: UserDtoSchema['avatarUrl'] | null
}

export type CreateUserRequest = UserComponents['schemas']['CreateUserRequest']

export type RegisterRequest = AuthComponents['schemas']['RegisterRequest']

export type UpdateUserRequest = UserComponents['schemas']['UpdateUserRequest']

export type LoginRequest = AuthComponents['schemas']['LoginRequest']

export type ChangePasswordRequest = UserComponents['schemas']['ChangePasswordRequest']

export type ResetPasswordRequest = UserComponents['schemas']['ResetPasswordRequest']

export type CheckEmailRequest = UserComponents['schemas']['EmailCheckRequest']

export type AuthResponse = RequiredFields<
  AuthResponseSchema,
  'accessToken' | 'refreshToken' | 'expiresIn'
> & {
  user: User
}
