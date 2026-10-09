/** 项目来源：用户自主创建 / 协作关联创建 / 公开资源创建 */
export type ProjectSource = 'USER' | 'COLLAB' | 'PUBLIC_RESOURCE'

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
  // 软删除时间（回收站用，null=未删除）
  deletedAt: string | null
  // 浏览量：其他用户通过公开资源页进入该项目的累计次数（同一用户 5 分钟内去重）
  viewCount: number
  // 另存量：其他用户通过「另存为我的项目」成功复制该项目的累计次数
  cloneCount: number
  // 项目来源
  source: ProjectSource
  // 派生自的源项目 ID（仅「公开资源创建」时有值）
  sourceProjectId: string | null
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
  viewCount: number
  cloneCount: number
  source: ProjectSource
  sourceProjectId: string | null
}

export interface CreateProjectRequest {
  name: string
  description?: string
  isPublic: boolean
  /**
   * 项目来源。仅在后端 createProject 时有效：
   * - 不传 → USER（用户自主创建）
   * - 'COLLAB' → 创建协作房间时系统自动创建
   * PUBLIC_RESOURCE 由服务端另存接口内部写入，前端传入会被忽略
   */
  source?: ProjectSource
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

/** 另存为我的项目请求：缩略图由服务端从源项目复制，sceneData 可选（用户编辑过时传入） */
export interface CloneProjectRequest {
  name: string
  description?: string
  isPublic: boolean
  /** 编辑后的场景数据；不传则复制源项目场景 */
  sceneData?: string
}
