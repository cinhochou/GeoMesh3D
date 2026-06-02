import { apiClient } from './client'
import type { Project, ProjectDetail, CreateProjectRequest, UpdateProjectRequest, SaveSceneRequest } from '@/types/project'

export const projectApi = {
  async createProject(data: CreateProjectRequest): Promise<Project> {
    return apiClient.post<Project>('/project', data)
  },

  async getMyProjects(): Promise<Project[]> {
    return apiClient.get<Project[]>('/project/my')
  },

  async getPublicProjects(): Promise<Project[]> {
    return apiClient.get<Project[]>('/project/public')
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

  async uploadThumbnail(file: Blob): Promise<string> {
    const formData = new FormData()
    formData.append('file', file, 'thumbnail.jpg')
    return apiClient.upload<string>('/project/upload-thumbnail', formData)
  },
}
