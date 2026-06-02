export interface Project {
  id: string
  name: string
  description: string
  ownerId: string
  ownerName: string
  thumbnailUrl: string
  isPublic: boolean
  status: number
  createdAt: string
  updatedAt: string
}

export interface ProjectDetail {
  id: string
  name: string
  description: string
  ownerId: string
  ownerName: string
  thumbnailUrl: string
  isPublic: boolean
  sceneData: string | null
  status: number
  createdAt: string
  updatedAt: string
}

export interface CreateProjectRequest {
  name: string
  description?: string
  isPublic: boolean
}

export interface UpdateProjectRequest {
  name?: string
  description?: string
  isPublic?: boolean
  thumbnailUrl?: string
}

export interface SaveSceneRequest {
  sceneData: string
  thumbnailUrl?: string
}
