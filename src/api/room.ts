import { apiClient } from './client'
import { projectApi } from './project'
import { withThumbnailVersion } from '@/utils/imageCache'
import { signalingApi } from './signaling'
import type {
  Room,
  RoomDetail,
  RoomMember,
  RoomRole,
  CreateRoomRequest,
  UpdateRoomRequest,
  JoinRoomResult,
  RoomApplication,
  ApplyJoinRequest,
  ReviewApplicationRequest,
  ApprovalBadge,
  RoomImportMode,
} from '@/types/room'

// ============================================================================
// 真实后端 API 调用 —— 对接 service-collab 模块
// 端点映射：
//   GET    /collab/room                  → 获取当前用户加入的房间列表
//   GET    /collab/room/:roomId          → 获取房间基本信息
//   GET    /collab/room/:roomId/detail   → 获取房间详情（含成员列表）
//   GET    /collab/room/search           → 搜索公开房间
//   GET    /collab/room/recommended      → 获取推荐房间
//   POST   /collab/room                  → 创建房间
//   PUT    /collab/room/:roomId          → 更新房间信息（仅房主）
//   DELETE /collab/room/:roomId          → 关闭房间（仅房主）
//   DELETE /collab/room/:roomId/delete   → 彻底删除房间及成员记录（仅房主，需先关闭）
//   POST   /collab/room/:roomId/join     → 加入房间（返回 wsUrl + ticket）
//   POST   /collab/room/:roomId/leave    → 离开房间
//   POST   /collab/room/:roomId/reopen   → 重新开放房间（仅房主）
//   GET    /collab/room/:roomId/members  → 获取成员列表
//   PUT    /collab/room/:roomId/member/:memberId/role → 修改成员角色（仅房主）
//   DELETE /collab/room/:roomId/member/:memberId     → 移除成员（仅房主）
//   POST   /collab/room/:roomId/transfer → 转让房间（仅房主）
// ============================================================================

// ---- 后端 DTO 原始结构 ----
interface BackendRoomDTO {
  id: string
  name: string
  projectId: string | null
  ownerId: string
  ownerName: string | null
  isPublic: boolean | null
  approvalRequired: boolean | null
  maxPeers: number | null
  allowShare: boolean | null
  disableExport: boolean | null
  disableImport: boolean | null
  importMode: string | null // OVERWRITE / MERGE
  disableClear: boolean | null
  disableUndoRedo: boolean | null
  defaultRole: string | null
  currentPeers: number | null
  onlineCount: number | null
  myRole: string | null // OWNER / EDITOR / VIEWER / null
  status: number | null // 0-已关闭 1-活跃中
  createdAt: string | null
  updatedAt: string | null
  description: string | null
  projectName: string | null
  projectThumbnailUrl: string | null
  thumbnailUrl: string | null
  deletedAt: string | null
}

interface BackendRoomMemberDTO {
  userId: string
  username: string | null
  nickname: string | null
  avatarUrl: string | null
  role: string // OWNER / EDITOR / VIEWER
  joinedAt: string | null
  /** 上一次加入房间的时间（后端新增字段；旧版本后端不返回，映射为 null） */
  lastJoinedAt?: string | null
  isOnline: boolean | null
  lastSeenAt: string | null
}

interface BackendRoomDetailDTO extends BackendRoomDTO {
  members: BackendRoomMemberDTO[]
}

interface BackendJoinRoomResponse {
  roomId: string
  roomName: string
  wsUrl: string
  ticket: string
  ticketExpiresIn: number
  role: string // OWNER / EDITOR / VIEWER
}

// ---- 角色 / 字段映射层 ----
const mapRole = (backendRole: string | null): RoomRole => {
  switch (backendRole) {
    case 'OWNER':
      return 'creator'
    case 'EDITOR':
      return 'editor'
    case 'VIEWER':
      return 'viewer'
    default:
      return 'viewer'
  }
}

// ---- 房间权限控制：localStorage 持久化（后端尚未支持这些字段时的前端方案）----
const DEFAULT_ROOM_PERMS: {
  allowShare: boolean
  disableExport: boolean
  disableImport: boolean
  importMode: RoomImportMode
  defaultRole: 'editor' | 'viewer'
  disableClear: boolean
  disableUndoRedo: boolean
} = {
  allowShare: true,
  disableExport: false,
  disableImport: false,
  importMode: 'overwrite',
  defaultRole: 'editor',
  disableClear: false,
  disableUndoRedo: false,
}

const getRoomPermsKey = (roomId: string) => `collab:room_perms:${roomId}`

const loadRoomPerms = (roomId: string) => {
  try {
    const raw = localStorage.getItem(getRoomPermsKey(roomId))
    if (!raw) return null
    return JSON.parse(raw) as Partial<typeof DEFAULT_ROOM_PERMS>
  } catch {
    return null
  }
}

const saveRoomPerms = (roomId: string, perms: Partial<typeof DEFAULT_ROOM_PERMS>) => {
  try {
    const existing = loadRoomPerms(roomId) || {}
    localStorage.setItem(getRoomPermsKey(roomId), JSON.stringify({ ...existing, ...perms }))
  } catch {
    // ignore
  }
}

const mapRoom = (dto: BackendRoomDTO): Room => {
  const perms = loadRoomPerms(dto.id)
  return {
    id: dto.id,
    name: dto.name,
    description: dto.description ?? '',
    projectId: dto.projectId ?? '',
    projectName: dto.projectName ?? '',
    projectThumbnailUrl: dto.projectThumbnailUrl ?? '',
    ownerId: dto.ownerId,
    ownerName: dto.ownerName ?? '',
    ownerAvatarUrl: '',
    deletedAt: dto.deletedAt ?? null,
    myRole: mapRole(dto.myRole),
    isMember: dto.myRole != null,
    hasLeft: false,
    isOpen: dto.status === 1,
    isPublic: dto.isPublic === true,
    approvalRequired: dto.approvalRequired === true,
    maxMembers: dto.maxPeers ?? 10,
    thumbnailUrl: dto.thumbnailUrl ?? '',
    createdAt: dto.createdAt ?? new Date().toISOString(),
    updatedAt: dto.updatedAt ?? new Date().toISOString(),
    memberCount: dto.currentPeers ?? 0,
    onlineCount: dto.onlineCount ?? 0,
    allowShare: dto.allowShare ?? perms?.allowShare ?? DEFAULT_ROOM_PERMS.allowShare,
    disableExport: dto.disableExport ?? perms?.disableExport ?? DEFAULT_ROOM_PERMS.disableExport,
    disableImport: dto.disableImport ?? perms?.disableImport ?? DEFAULT_ROOM_PERMS.disableImport,
    // 后端值优先（大写）；后端未提供时回退 localStorage，再回退默认值
    importMode:
      dto.importMode?.toLowerCase() === 'merge'
        ? 'merge'
        : dto.importMode?.toLowerCase() === 'overwrite'
          ? 'overwrite'
          : (perms?.importMode ?? DEFAULT_ROOM_PERMS.importMode),
    defaultRole:
      dto.defaultRole?.toLowerCase() === 'editor' || dto.defaultRole?.toLowerCase() === 'viewer'
        ? (dto.defaultRole.toLowerCase() as 'editor' | 'viewer')
        : (perms?.defaultRole ?? DEFAULT_ROOM_PERMS.defaultRole),
    disableClear: dto.disableClear ?? perms?.disableClear ?? DEFAULT_ROOM_PERMS.disableClear,
    disableUndoRedo:
      dto.disableUndoRedo ?? perms?.disableUndoRedo ?? DEFAULT_ROOM_PERMS.disableUndoRedo,
  }
}

const mapMember = (dto: BackendRoomMemberDTO): RoomMember => ({
  userId: dto.userId,
  username: dto.username ?? dto.userId,
  nickname: dto.nickname,
  avatarUrl: dto.avatarUrl,
  role: mapRole(dto.role),
  joinedAt: dto.joinedAt ?? new Date().toISOString(),
  // 后端未提供时保持 null，由 getMemberJoinedTime 回退到 joinedAt
  lastJoinedAt: dto.lastJoinedAt ?? null,
  isOnline: dto.isOnline === true,
  lastSeenAt: dto.lastSeenAt ?? null,
})

const mapRoomDetail = (dto: BackendRoomDetailDTO): RoomDetail => {
  const members = (dto.members ?? []).map(mapMember)
  const creator = members.find((m) => m.role === 'creator')
  return {
    ...mapRoom(dto),
    ownerAvatarUrl: creator?.avatarUrl ?? '',
    members,
  }
}

const mapJoinResult = (dto: BackendJoinRoomResponse): JoinRoomResult => ({
  roomId: dto.roomId,
  roomName: dto.roomName,
  wsUrl: dto.wsUrl,
  ticket: dto.ticket,
  ticketExpiresIn: dto.ticketExpiresIn,
  role: mapRole(dto.role),
})

// ---- 后端请求体映射 ----
const toBackendCreateRequest = (req: CreateRoomRequest) => ({
  name: req.name,
  projectId: req.projectId || undefined,
  isPublic: req.isPublic ?? false,
  maxPeers: req.maxMembers ?? 10,
  description: req.description,
})

const toBackendUpdateRequest = (req: UpdateRoomRequest) => ({
  name: req.name,
  description: req.description,
  isPublic: req.isPublic,
  approvalRequired: req.approvalRequired,
  maxPeers: req.maxMembers,
  allowShare: req.allowShare,
  disableExport: req.disableExport,
  disableImport: req.disableImport,
  importMode: req.importMode?.toUpperCase(),
  disableClear: req.disableClear,
  disableUndoRedo: req.disableUndoRedo,
  defaultRole: req.defaultRole?.toUpperCase(),
})

// 后端角色值
const toBackendRole = (role: RoomRole): string => {
  switch (role) {
    case 'creator':
      return 'OWNER'
    case 'editor':
      return 'EDITOR'
    case 'viewer':
      return 'VIEWER'
  }
}

// ---- 项目信息补全 / 实时对账 ----
// 后端已通过 Feign 填充 projectThumbnailUrl/projectName，但项目内容(场景)修改后
// 后端房间表不会自动刷新缩略图与修改时间。这里每次读取时都拿关联项目的最新数据
// 与房间对账：用实时项目缩略图覆盖（"改动即更新"），并让房间修改时间取 项目更新时间
// 与 房间时间 的较大者，使协作房间的项目信息/缩略图/修改时间始终与项目列表保持一致。

/** "我的项目"列表缓存有效期：项目列表在几十秒内几乎不变，而轮询每3~15 秒就会触发一次 */
const MY_PROJECTS_CACHE_TTL_MS = 30_000
/** 项目详情对账缓存有效期：与我的项目同量级，避免轮询反复回查同一projectId */
const PROJECT_DETAIL_CACHE_TTL_MS = 30_000

interface ProjectSnapshot {
  id: string
  name?: string
  thumbnailUrl?: string
  updatedAt?: string
}

let myProjectsCache: { at: number; data: ProjectSnapshot[] } | null = null
/** in-flight 去重：同一时刻多个调用方共用同一次 "我的项目" 请求 */
let myProjectsPending: Promise<ProjectSnapshot[]> | null = null

const projectDetailCache = new Map<string, { at: number; data: ProjectSnapshot }>()
/** projectId -> in-flight，避免同一 projectId 被并发重复查询 */
const projectDetailPending = new Map<string, Promise<ProjectSnapshot>>()

/**
 * 读取"我的项目"（带短 TTL 缓存与 in-flight 去重）。
 *
 * 该接口原先在每轮轮询中被无条件调用：协作大厅 3 秒一次、房间列表 15 秒一次、
 * 协作面板打开一次 → 大量重复请求，而"我的项目"在这期间几乎不会变化。
 */
const fetchMyProjectSnapshots = async (): Promise<ProjectSnapshot[]> => {
  const now = Date.now()
  if (myProjectsCache && now - myProjectsCache.at < MY_PROJECTS_CACHE_TTL_MS) {
    return myProjectsCache.data
  }
  if (myProjectsPending) return myProjectsPending

  const task = (async () => {
    const projects = await projectApi.getMyProjects()
    const data: ProjectSnapshot[] = projects.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnailUrl: p.thumbnailUrl ?? undefined,
      updatedAt: p.updatedAt ?? undefined,
    }))
    myProjectsCache = { at: Date.now(), data }
    return data
  })().finally(() => {
    myProjectsPending = null
  })

  myProjectsPending = task
  return task
}

/** 读取单个项目详情（带短 TTL 缓存与 in-flight 去重） */
const fetchProjectSnapshot = (projectId: string): Promise<ProjectSnapshot> => {
  const now = Date.now()
  const cached = projectDetailCache.get(projectId)
  if (cached && now - cached.at < PROJECT_DETAIL_CACHE_TTL_MS) {
    return Promise.resolve(cached.data)
  }
  const pending = projectDetailPending.get(projectId)
  if (pending) return pending

  const task = (async () => {
    const detail = await projectApi.getProject(projectId)
    const data: ProjectSnapshot = {
      id: projectId,
      name: detail.name,
      thumbnailUrl: detail.thumbnailUrl ?? undefined,
      updatedAt: detail.updatedAt ?? undefined,
    }
    projectDetailCache.set(projectId, { at: Date.now(), data })
    return data
  })().finally(() => {
    projectDetailPending.delete(projectId)
  })

  projectDetailPending.set(projectId, task)
  return task
}

/** 项目更新（改名/换缩略图）后调用，使相关对账缓存立即失效 */
export const invalidateProjectSnapshotCache = (projectId?: string): void => {
  myProjectsCache = null
  if (projectId) projectDetailCache.delete(projectId)
  else projectDetailCache.clear()
}

/**
 * @param includeMyProjects 是否把"我的项目"纳入对账。
 *   公开大厅（getHallRooms）传 false —— 大厅里的房间大多属于他人，
 *   拉"我的项目"几乎无用，却是每 3 秒轮询里最大的固定开销。
 */
const enrichRoomThumbnails = async (
  rooms: Room[],
  includeMyProjects = true,
): Promise<Room[]> => {
  const linked = rooms.filter((r) => r.projectId)
  if (linked.length === 0) return rooms
  const coverMap = new Map<string, string>()
  const nameMap = new Map<string, string>()
  const updatedMap = new Map<string, string>()
  // 1) 批量拿"我的项目"构建映射（带缓存；公开大厅跳过）
  if (includeMyProjects) {
    try {
      const myProjects = await fetchMyProjectSnapshots()
      for (const p of myProjects) {
        if (!p || !p.id) continue
        nameMap.set(p.id, p.name ?? '')
        if (p.thumbnailUrl) coverMap.set(p.id, p.thumbnailUrl)
        if (p.updatedAt) updatedMap.set(p.id, p.updatedAt)
      }
    } catch {
      // 忽略，下面逐个兜底
    }
  }
  // 2) 仍未匹配到的逐个查项目详情（可能属于他人公开项目）
  //projectId 去重：多个房间关联同一项目时只查一次
  const missingIds = [...new Set(linked.filter((r) => !nameMap.has(r.projectId)).map((r) => r.projectId))]
  await Promise.all(
    missingIds.map(async (projectId) => {
      try {
        const detail = await fetchProjectSnapshot(projectId)
        if (detail.name) nameMap.set(projectId, detail.name)
        if (detail.thumbnailUrl) coverMap.set(projectId, detail.thumbnailUrl)
        if (detail.updatedAt) updatedMap.set(projectId, detail.updatedAt)
      } catch {
        // 项目可能已删除或无权限，保留后端已有值
      }
    }),
  )
  return rooms.map((r) => {
    if (!r.projectId) return r
    const cover = coverMap.get(r.projectId)
    const name = nameMap.get(r.projectId)
    const updated = updatedMap.get(r.projectId)
    if (!cover && !name && !updated) return r
    return {
      ...r,
      // 缩略图 URL 追加版本参数（项目 updatedAt），使 URL 随内容变化以突破持久化缓存并触发重渲染
      projectThumbnailUrl: cover ? withThumbnailVersion(cover, updated) : r.projectThumbnailUrl,
      projectName: name || r.projectName,
      // ISO 字符串可逐字符比较：房间修改时间取 项目修改时间 与 原房间时间 的较大者
      updatedAt:
        updated && (!r.updatedAt || updated > r.updatedAt) ? updated : r.updatedAt,
    }
  })
}

// ---- 实时在线人数补全：从信令服务器批量查询，覆盖后端的 onlineCount ----
const enrichRoomPeerCounts = async (rooms: Room[]): Promise<Room[]> => {
  if (rooms.length === 0) return rooms
  const roomIds = rooms.map((r) => r.id)
  const peerMap = await signalingApi.batchGetRoomPeers(roomIds)
  return rooms.map((r) => {
    const onlineCount = peerMap[r.id]
    // 信令服务器返回的实时在线人数优先于后端 onlineCount（更实时）
    if (typeof onlineCount === 'number') {
      return { ...r, onlineCount }
    }
    return r
  })
}

// ---- 后端申请 DTO 原始结构 ----
interface BackendApplicationDTO {
  id: string
  roomId: string
  roomName: string | null
  applicantId: string
  applicantUsername: string
  applicantNickname: string | null
  requestedRole: string
  reason: string | null
  appliedAt: string | null
  status: string
  reviewerId: string | null
  reviewerName: string | null
  grantedRole: string | null
  reviewComment: string | null
  reviewedAt: string | null
  applicantRead: boolean | null
  reviewerRead: boolean | null
}

const mapApplication = (dto: BackendApplicationDTO): RoomApplication => ({
  id: dto.id,
  roomId: dto.roomId,
  roomName: dto.roomName,
  applicantId: dto.applicantId,
  applicantUsername: dto.applicantUsername,
  applicantNickname: dto.applicantNickname,
  requestedRole: dto.requestedRole,
  reason: dto.reason,
  appliedAt: dto.appliedAt ?? new Date().toISOString(),
  status: (dto.status as RoomApplication['status']) ?? 'PENDING',
  reviewerId: dto.reviewerId,
  reviewerName: dto.reviewerName,
  grantedRole: dto.grantedRole,
  reviewComment: dto.reviewComment,
  reviewedAt: dto.reviewedAt,
  applicantRead: dto.applicantRead === true,
  reviewerRead: dto.reviewerRead === true,
})

// ---- 房间详情：短时缓存 + 并发合并 ----
//协作浮窗打开时，房间详情存在两条并行的轮询链路：
//   CollabPanel：每 15 秒 GET /collab/room/:id/detail（展示成员列表）
//   EditorView：每 20 秒 GET /collab/room/:id/detail（兜底检测是否被踢出）
// 两者打同一端点，浮窗开着时该端点被双份请求。
//
// 这里按「房间 id」做一个极短 TTL 的合并窗口：窗口内的重复请求复用同一结果，
// in-flight 期间到来的请求共享同一个 Promise。
// TTL 取得很短（2秒），既足以合并两条错开的轮询，又不会让数据明显滞后——
// 成员变化另有 Yjs awareness 与跨 Tab 事件实时推送，不依赖此接口的时效性。
const ROOM_DETAIL_MERGE_WINDOW_MS = 2_000

interface RoomDetailEntry {
  at: number
  data: RoomDetail
}

const roomDetailCache = new Map<string, RoomDetailEntry>()
const roomDetailPending = new Map<string, Promise<RoomDetail>>()

const fetchRoomDetailMerged = (id: string, fetchPeerCount: boolean): Promise<RoomDetail> => {
  const key = `${id}|${fetchPeerCount ? 'peer' : 'nopeer'}`
  const now = Date.now()
  const cached = roomDetailCache.get(key)
  if (cached && now - cached.at < ROOM_DETAIL_MERGE_WINDOW_MS) {
    return Promise.resolve(cached.data)
  }
  const pending = roomDetailPending.get(key)
  if (pending) return pending

  const task = (async () => {
    const dto = await apiClient.get<BackendRoomDetailDTO>(`/collab/room/${id}/detail`)
    const detail = mapRoomDetail(dto)
    if (fetchPeerCount) {
      try {
        const peerInfo = await signalingApi.getRoomPeers(id)
        detail.onlineCount = peerInfo.onlineCount
      } catch {
        // 信令服务器不可用时使用后端的 onlineCount
      }
    }
    roomDetailCache.set(key, { at: Date.now(), data: detail })
    return detail
  })().finally(() => {
    roomDetailPending.delete(key)
  })

  roomDetailPending.set(key, task)
  return task
}

export const roomApi = {
  async getMyRooms(): Promise<Room[]> {
    const dtos = await apiClient.get<BackendRoomDTO[]>('/collab/room')
    const rooms = dtos.map(mapRoom)
    const enriched = await enrichRoomThumbnails(rooms)
    return enrichRoomPeerCounts(enriched)
  },

  async getRoom(id: string, fetchPeerCount = true): Promise<Room> {
    const dto = await apiClient.get<BackendRoomDTO>(`/collab/room/${id}`)
    const room = mapRoom(dto)
    // 查询信令服务器的实时在线人数，覆盖后端 onlineCount
    // 协作轮询路径传入 fetchPeerCount=false 跳过此请求：已通过 Yjs awareness
    // 获得实时 peerCount，无需每次轮询都额外打信令服务器（N 人时请求放大）
    if (fetchPeerCount) {
      try {
        const peerInfo = await signalingApi.getRoomPeers(id)
        room.onlineCount = peerInfo.onlineCount
      } catch {
        // 信令服务器不可用时使用后端的 onlineCount
      }
    }
    return room
  },

  async getRoomDetail(id: string, fetchPeerCount = true): Promise<RoomDetail> {
    return fetchRoomDetailMerged(id, fetchPeerCount)
  },

  async createRoom(data: CreateRoomRequest): Promise<Room> {
    const dto = await apiClient.post<BackendRoomDTO>(
      '/collab/room',
      toBackendCreateRequest(data),
    )
    return mapRoom(dto)
  },

  async updateRoom(id: string, data: UpdateRoomRequest): Promise<Room> {
    // 保留 localStorage 作为旧后端兼容回退；正式值由后端数据库返回。
    const permFields: Partial<typeof DEFAULT_ROOM_PERMS> = {}
    if (data.allowShare !== undefined) permFields.allowShare = data.allowShare
    if (data.disableExport !== undefined) permFields.disableExport = data.disableExport
    if (data.disableImport !== undefined) permFields.disableImport = data.disableImport
    if (data.importMode !== undefined) permFields.importMode = data.importMode
    if (data.defaultRole !== undefined) permFields.defaultRole = data.defaultRole
    if (data.disableClear !== undefined) permFields.disableClear = data.disableClear
    if (data.disableUndoRedo !== undefined) permFields.disableUndoRedo = data.disableUndoRedo
    if (Object.keys(permFields).length > 0) {
      saveRoomPerms(id, permFields)
    }
    const dto = await apiClient.put<BackendRoomDTO>(
      `/collab/room/${id}`,
      toBackendUpdateRequest(data),
    )
    return mapRoom(dto)
  },

  async deleteRoom(id: string): Promise<void> {
    await apiClient.delete<void>(`/collab/room/${id}/delete`)
  },

  async joinRoom(id: string): Promise<JoinRoomResult> {
    const dto = await apiClient.post<BackendJoinRoomResponse>(`/collab/room/${id}/join`)
    return mapJoinResult(dto)
  },

  async leaveRoom(id: string): Promise<void> {
    await apiClient.post<void>(`/collab/room/${id}/leave`)
  },

  // 移出房间：硬删除自己的成员记录，房间列表不再返回该房间
  // 若房间需要批准加入，再次加入需重新申请
  async removeSelfFromRoom(id: string): Promise<void> {
    await apiClient.delete<void>(`/collab/room/${id}/member/self`)
  },

  // 心跳：标记当前用户在线，后端据此维护实时在线人数（每 10 秒调用一次）
  async heartbeat(id: string): Promise<void> {
    await apiClient.post<void>(`/collab/room/${id}/heartbeat`)
  },

  async openRoom(id: string): Promise<void> {
    await apiClient.post<void>(`/collab/room/${id}/reopen`)
  },

  async closeRoom(id: string): Promise<void> {
    await apiClient.delete<void>(`/collab/room/${id}`)
  },

  async getRoomMembers(id: string): Promise<RoomMember[]> {
    const dtos = await apiClient.get<BackendRoomMemberDTO[]>(`/collab/room/${id}/members`)
    return dtos.map(mapMember)
  },

  async updateMemberRole(id: string, userId: string, role: RoomRole): Promise<void> {
    await apiClient.put<void>(
      `/collab/room/${id}/member/${userId}/role?role=${toBackendRole(role)}`,
    )
  },

  async removeMember(id: string, userId: string): Promise<void> {
    await apiClient.delete<void>(`/collab/room/${id}/member/${userId}`)
  },

  async transferRoom(id: string, newOwnerId: string): Promise<Room> {
    const dto = await apiClient.post<BackendRoomDTO>(
      `/collab/room/${id}/transfer?toUserId=${encodeURIComponent(newOwnerId)}`,
    )
    return mapRoom(dto)
  },

  async searchRooms(query: {
    name?: string
    roomId?: string
    creator?: string
  }): Promise<Room[]> {
    const params = new URLSearchParams()
    if (query.name) params.set('name', query.name)
    if (query.roomId) params.set('roomId', query.roomId)
    if (query.creator) params.set('creator', query.creator)
    const dtos = await apiClient.get<BackendRoomDTO[]>(
      `/collab/room/search?${params.toString()}`,
    )
    const rooms = dtos.map(mapRoom)
    return enrichRoomPeerCounts(rooms)
  },

  async getRecommendedRooms(): Promise<Room[]> {
    const dtos = await apiClient.get<BackendRoomDTO[]>('/collab/room/recommended')
    const rooms = dtos.map(mapRoom)
    return enrichRoomPeerCounts(rooms)
  },

  // ---- 协作大厅：获取公开且打开的房间，支持搜索和排序 ----
  async getHallRooms(keyword?: string): Promise<Room[]> {
    const params = new URLSearchParams()
    if (keyword) params.set('keyword', keyword)
    const dtos = await apiClient.get<BackendRoomDTO[]>(
      `/collab/room/hall?${params.toString()}`,
    )
    const rooms = dtos.map(mapRoom)
    // 大厅房间大多属于他人，不纳入"我的项目"对账（includeMyProjects=false）：
    // 大厅每 3 秒轮询一次，拉"我的项目"几乎无用却是最大的固定开销
    return enrichRoomPeerCounts(await enrichRoomThumbnails(rooms, false))
  },

  // ---- 回收站 ----
  async getTrashedRooms(): Promise<Room[]> {
    const dtos = await apiClient.get<BackendRoomDTO[]>('/collab/room/trash')
    return dtos.map(mapRoom)
  },

  async restoreRoom(id: string): Promise<void> {
    await apiClient.post<void>(`/collab/room/${id}/restore`)
  },

  async purgeRoom(id: string): Promise<void> {
    await apiClient.delete<void>(`/collab/room/${id}/purge`)
  },

  async joinRoomByUrl(url: string): Promise<JoinRoomResult> {
    const trimmed = url.trim()
    if (!trimmed) throw new Error('请输入有效的房间链接')
    let roomId = ''
    try {
      const parsed = new URL(trimmed)
      roomId = parsed.searchParams.get('roomId') || ''
      if (!roomId) {
        const pathMatch = parsed.pathname.match(/\/join\/(.+)/)
        if (pathMatch) roomId = pathMatch[1] || ''
      }
    } catch {
      roomId = trimmed
    }
    if (!roomId) throw new Error('无法从链接中识别房间 ID')
    return await this.joinRoom(roomId)
  },

  // ---- 房间加入申请 ----
  // 提交申请（系统自动记录申请时间）
  async submitApplication(roomId: string, data: ApplyJoinRequest): Promise<RoomApplication> {
    const dto = await apiClient.post<BackendApplicationDTO>(`/collab/room/${roomId}/apply`, {
      requestedRole: data.requestedRole.toUpperCase(),
      reason: data.reason,
    })
    return mapApplication(dto)
  },

  // 我发送的申请列表
  async getMyApplications(): Promise<RoomApplication[]> {
    const dtos = await apiClient.get<BackendApplicationDTO[]>('/collab/application/sent')
    return dtos.map(mapApplication)
  },

  // 我审核的申请列表
  async getReviewApplications(): Promise<RoomApplication[]> {
    const dtos = await apiClient.get<BackendApplicationDTO[]>('/collab/application/review')
    return dtos.map(mapApplication)
  },

  // 审核申请（系统自动记录审核时间）
  async reviewApplication(
    applicationId: string,
    data: ReviewApplicationRequest,
  ): Promise<RoomApplication> {
    const dto = await apiClient.put<BackendApplicationDTO>(
      `/collab/application/${applicationId}/review`,
      {
        decision: data.decision,
        grantedRole: data.grantedRole?.toUpperCase(),
        reviewComment: data.reviewComment,
      },
    )
    return mapApplication(dto)
  },

  // 标记申请消息已读（role: applicant / reviewer，实时修改数据库）
  async markApplicationRead(applicationId: string, role: 'applicant' | 'reviewer'): Promise<void> {
    await apiClient.put<void>(`/collab/application/${applicationId}/read?role=${role}`)
  },

  // 获取审批消息未读角标
  async getApprovalBadge(): Promise<ApprovalBadge> {
    return await apiClient.get<ApprovalBadge>('/collab/application/badge')
  },
}
