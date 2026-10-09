import { apiClient } from './client'
import type {
  Project,
  ProjectDetail,
  CreateProjectRequest,
  UpdateProjectRequest,
  SaveSceneRequest,
  CloneProjectRequest,
} from '@/types/project'

export const projectApi = {
  async createProject(data: CreateProjectRequest): Promise<Project> {
    return apiClient.post<Project>('/project', data)
  },

  async getMyProjects(): Promise<Project[]> {
    return apiClient.get<Project[]>('/project/my')
  },

  /**
   * 公开项目列表。
   * @param excludeMine 是否排除自己创建的项目（公开资源页传 true，只展示他人的公开项目）
   */
  async getPublicProjects(excludeMine = false): Promise<Project[]> {
    return apiClient.get<Project[]>(`/project/public${excludeMine ? '?excludeMine=true' : ''}`)
  },

  async getProject(id: string): Promise<ProjectDetail> {
    return apiClient.get<ProjectDetail>(`/project/${id}`)
  },

  async loadScene(id: string): Promise<ProjectDetail> {
    return apiClient.get<ProjectDetail>(`/project/${id}/scene`)
  },

  async saveScene(id: string, data: SaveSceneRequest): Promise<void> {
    return apiClient.post<void>(`/project/${id}/save`, data)
  },

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    return apiClient.put<Project>(`/project/${id}`, data)
  },

  async deleteProject(id: string): Promise<void> {
    return apiClient.delete<void>(`/project/${id}`)
  },

  async countByUserId(userId: string): Promise<number> {
    return apiClient.get<number>(`/project/count?userId=${userId}`)
  },

  async uploadThumbnail(file: Blob, projectId?: string): Promise<string> {
    const formData = new FormData()
    formData.append('file', file, 'thumbnail.jpg')
    // 携带项目ID，后端以项目ID作为缩略图文件名：同一项目的新缩略图会覆盖旧文件，避免累积
    if (projectId) formData.append('projectId', projectId)
    return apiClient.upload<string>('/project/upload-thumbnail', formData)
  },

  /**
   * 上报浏览量：进入他人公开项目时调用。
   * 后端按 (项目, 用户) 做 5 分钟去重，重复调用是安全的幂等操作。
   */
  async reportView(id: string): Promise<void> {
    return apiClient.post<void>(`/project/${id}/view`)
  },

  /**
   * 另存为我的项目：服务端复制源项目的场景与缩略图（含缩略图文件），
   * 创建属于当前用户的新项目并在源项目上 另存量 +1。
   */
  async cloneProject(sourceProjectId: string, data: CloneProjectRequest): Promise<Project> {
    return apiClient.post<Project>(`/project/${sourceProjectId}/clone`, data)
  },

  // ---- 回收站 ----
  async getTrashedProjects(): Promise<Project[]> {
    return apiClient.get<Project[]>('/project/trash')
  },

  async restoreProject(id: string): Promise<void> {
    return apiClient.post<void>(`/project/${id}/restore`)
  },

  async purgeProject(id: string): Promise<void> {
    return apiClient.delete<void>(`/project/${id}/purge`)
  },
}
