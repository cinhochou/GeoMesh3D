import { apiClient } from './client'

// ============================================================================
// 动画库 API —— 对接 service-project 的 /animation/library（网关前缀 /api）
// 端点映射（网关 StripPrefix=1 后）：
//   GET    /animation/library            → 列表（仅元数据，不含 payload）
//   GET    /animation/library/:itemId    → 详情（含 payload，按需拉取）
//   POST   /animation/library            → 保存到动画库（手动触发）
//   PUT    /animation/library/:itemId    → 重命名
//   DELETE /animation/library/:itemId    → 删除
// 权限：服务端强制以 owner_id 过滤；读取他人条目一律 404（不泄露存在性）。
// ============================================================================

/** 动画库条目（列表不含 payload；详情接口携带） */
export interface AnimationLibraryItem {
  id: string
  /** 录制段 id（RecordingSession.id；前端用于标记「已在库」） */
  sessionId: string | null
  name: string
  color: string | null
  projectId: string | null
  roomId: string | null
  stepCount: number | null
  durationMs: number | null
  payloadVersion: number | null
  payloadBytes: number | null
  createdAt: string | null
  updatedAt: string | null
  /** 完整段数据（serializeRecordingSession 产物；仅详情接口返回） */
  payload?: string | null
}

/** 保存到动画库的请求体 */
export interface SaveAnimationPayload {
  name: string
  color?: string
  projectId?: string | null
  roomId?: string | null
  payload: string
}

export const animationLibraryApi = {
  /** 列表（仅元数据，按更新时间倒序） */
  async list(): Promise<AnimationLibraryItem[]> {
    return apiClient.get<AnimationLibraryItem[]>('/animation/library')
  },

  /** 详情（含 payload） */
  async detail(itemId: string): Promise<AnimationLibraryItem> {
    return apiClient.get<AnimationLibraryItem>(`/animation/library/${itemId}`)
  },

  /** 保存到动画库 */
  async create(data: SaveAnimationPayload): Promise<AnimationLibraryItem> {
    return apiClient.post<AnimationLibraryItem>('/animation/library', data)
  },

  /** 重命名 */
  async rename(itemId: string, name: string): Promise<void> {
    return apiClient.put<void>(`/animation/library/${itemId}`, { name })
  },

  /** 删除 */
  async remove(itemId: string): Promise<void> {
    return apiClient.delete<void>(`/animation/library/${itemId}`)
  },
}
