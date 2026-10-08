// 房间角色：创建者拥有全部权限；可编辑者可参与协作场景编辑但不能改房间基本信息；仅观看者只能加入房间
export type RoomRole = 'creator' | 'editor' | 'viewer'

// 房间级导入模式：房主统一设定，房间内全体协作成员强制遵循（房主本人同样遵循）
// - overwrite：覆盖模式，导入时清空原场景后重建
// - merge：合并模式，在原场景基础上追加导入内容
export type RoomImportMode = 'overwrite' | 'merge'

// 房间成员
export interface RoomMember {
  userId: string
  username: string
  nickname: string | null
  avatarUrl: string | null
  role: RoomRole
  /** 首次加入房间的时间（后端成员记录创建时间，整个成员关系存续期不变） */
  joinedAt: string
  /**
   * 上一次加入房间的时间：每次重新加入协作都会刷新。
   * 后端未提供该字段时回退为 null，此时界面退化为展示 joinedAt。
   */
  lastJoinedAt?: string | null
  // 是否在线（由后端心跳维护）
  isOnline?: boolean
  // 最后心跳时间
  lastSeenAt?: string | null
}

/**
 * 成员列表排序与展示所用的「加入时间」。
 * 优先取上一次加入时间（lastJoinedAt），缺失时回退到首次加入时间（joinedAt），
 * 保证后端尚未提供 lastJoinedAt 时界面行为与原先一致。
 */
export const getMemberJoinedTime = (member: RoomMember): string =>
  member.lastJoinedAt || member.joinedAt

// 房间（当前用户视角）
export interface Room {
  id: string
  name: string
  description: string
  // 关联项目：一个房间对应一个项目，点击项目名可跳转项目编辑页
  projectId: string
  projectName: string
  projectThumbnailUrl: string
  ownerId: string
  ownerName: string
  // 创建者头像（列表接口可能不返回，详情接口从成员中提取）
  ownerAvatarUrl: string
  // 当前用户在该房间中的角色
  myRole: RoomRole
  // 当前用户是否是房间成员（后端 myRole 非 null 即为成员）
  // 权限判断唯一标准：isMember = true 才有权限进入
  isMember: boolean
  // 当前用户是否已离开房间（离开后仍保留历史记录，列表项边框变黄）
  hasLeft: boolean
  // 房间是否处于打开状态（打开时列表项边框变绿）
  isOpen: boolean
  // 房间是否公开（公开后可被搜索加入，仅创建者可修改）
  isPublic: boolean
  // 是否需要批准加入（开启后新成员需提交申请等待房主审核，开启前已在房间的成员默认有权限）
  approvalRequired: boolean
  // 房间最大人数上限（仅创建者可修改）
  maxMembers: number
  thumbnailUrl: string
  createdAt: string
  updatedAt: string
  // 成员表累计人数（含离线成员）
  memberCount: number
  // 实时在线人数（由后端心跳 + 定时清理维护）
  onlineCount: number
  // ---- 房间权限控制（仅创建者可修改）----
  // 房间是否可分享（关闭后不可复制邀请链接）
  allowShare: boolean
  // 协作项目是否禁用导出
  disableExport: boolean
  // 是否禁用导入
  disableImport: boolean
  // 房间级导入模式（「禁用导入」未勾选时生效，房主在权限管理中设定）
  importMode: RoomImportMode
  // 新成员进入房间的默认身份
  defaultRole: 'editor' | 'viewer'
  // 是否禁用清空场景
  disableClear: boolean
  // 是否禁止成员撤销/重做
  disableUndoRedo: boolean
  // 软删除时间（回收站用，null=未删除）
  deletedAt: string | null
}

// 协作大厅排序方式
export type HallSort = 'latest' | 'active' | 'members' | 'capacity'

// 房间详情（含成员列表）
export interface RoomDetail extends Room {
  members: RoomMember[]
}

export interface CreateRoomRequest {
  name: string
  description?: string
  projectId?: string
  isPublic?: boolean
  maxMembers?: number
}

export interface UpdateRoomRequest {
  name?: string
  description?: string
  isPublic?: boolean
  approvalRequired?: boolean
  maxMembers?: number
  allowShare?: boolean
  disableExport?: boolean
  disableImport?: boolean
  importMode?: RoomImportMode
  defaultRole?: 'editor' | 'viewer'
  disableClear?: boolean
  disableUndoRedo?: boolean
}

// 加入房间后后端返回的连接凭证
export interface JoinRoomResult {
  roomId: string
  roomName: string
  wsUrl: string
  ticket: string
  ticketExpiresIn: number
  role: RoomRole
}

// 房间列表分类：全部 / 我创建的 / 我参与的 / 我观看的
export type RoomCategory = 'all' | 'created' | 'participated' | 'watched'

// ---- 房间加入申请 ----
// 申请权限类型
export type ApplicationRole = 'viewer' | 'editor'

// 审核状态
// PENDING: 待审核
// APPROVED: 已批准（批准时自动创建 member 记录）
// REJECTED: 已拒绝
// REVOKED: 批准后因成员被移除而撤销，可重新申请
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'

// 审批列表分类筛选
export type ApplicationFilter = 'all' | 'unread' | 'read' | 'pending' | 'reviewed'

// 申请记录
export interface RoomApplication {
  id: string
  roomId: string
  roomName: string | null
  applicantId: string
  applicantUsername: string
  applicantNickname: string | null
  requestedRole: string
  reason: string | null
  appliedAt: string
  status: ApplicationStatus
  reviewerId: string | null
  reviewerName: string | null
  grantedRole: string | null
  reviewComment: string | null
  reviewedAt: string | null
  applicantRead: boolean
  reviewerRead: boolean
}

// 提交申请请求
export interface ApplyJoinRequest {
  requestedRole: ApplicationRole
  reason?: string
}

// 审核请求
export interface ReviewApplicationRequest {
  decision: 'APPROVED' | 'REJECTED'
  grantedRole?: ApplicationRole
  reviewComment?: string
}

// 审批消息角标
export interface ApprovalBadge {
  sentUnread: number
  reviewUnread: number
  totalUnread: number
}
