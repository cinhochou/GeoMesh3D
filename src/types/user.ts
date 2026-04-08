// src/types/user.ts
import type { components } from './api-service-user'

// 创建类型别名
export type User = components['schemas']['UserDTO']
export type CreateUserRequest = components['schemas']['CreateUserRequest']
export type UpdateUserRequest = components['schemas']['UpdateUserRequest']
export type LoginRequest = components['schemas']['LoginRequest']
