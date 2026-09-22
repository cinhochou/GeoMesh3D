// src/utils/activeRoomRegistry.ts
// 跨 Tab「正在协作的房间」注册表（localStorage 多条目 + TTL 新鲜度校验）。
//
// 背景：加入房间会在新 Tab 打开编辑器，用户可能同时加入多个房间。
// 旧的单值标记（collab:active-room）会被后加入的 Tab 覆盖，且离开任一房间
// 都会清空共享标记，导致其他 Tab 的协作状态显示错误——房间列表的
// 「加入/离开」按钮状态不正确，甚至在两个状态之间来回跳动。
//
// 现改为「roomId → 最后心跳时间」多条目注册表：
// - 编辑器 Tab 加入时登记自己的 roomId，轮询心跳只刷新自己的时间戳；
// - 离开 / 页面隐藏时只注销自己的 roomId，多 Tab 互不影响；
// - 读取方按 TTL 过滤，得到当前仍在线协作的房间集合。

const REGISTRY_KEY = 'collab:active-rooms:v1'
/** 旧版单值标记：部署过渡期内由旧编辑器 Tab 持续刷新，读取时做迁移合并 */
const LEGACY_KEY = 'collab:active-room'
/** 心跳 10s 一次，TTL 20s 允许丢失一次心跳 */
export const ACTIVE_ROOM_TTL_MS = 20_000

type RoomTimestampMap = Record<string, number>

const parseMap = (raw: string | null): RoomTimestampMap => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: RoomTimestampMap = {}
    for (const [roomId, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts === 'number' && Number.isFinite(ts)) result[roomId] = ts
    }
    return result
  } catch {
    return {}
  }
}

const readMap = (): RoomTimestampMap => {
  try {
    return parseMap(localStorage.getItem(REGISTRY_KEY))
  } catch {
    return {}
  }
}

const writeMap = (map: RoomTimestampMap) => {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(map))
  } catch {
    // ignore storage errors
  }
}

const readLegacyEntry = (): { roomId: string; ts: number } | null => {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { roomId?: unknown; ts?: unknown }
    if (typeof parsed.roomId === 'string' && typeof parsed.ts === 'number') {
      return { roomId: parsed.roomId, ts: parsed.ts }
    }
    return null
  } catch {
    return null
  }
}

/** 读取当前仍在线协作（TTL 内）的房间 id 集合；兼容合并旧的单值标记 */
export const readActiveRoomIds = (): Set<string> => {
  const now = Date.now()
  const ids = new Set<string>()
  for (const [roomId, ts] of Object.entries(readMap())) {
    if (now - ts <= ACTIVE_ROOM_TTL_MS) ids.add(roomId)
  }
  const legacy = readLegacyEntry()
  if (legacy && now - legacy.ts <= ACTIVE_ROOM_TTL_MS) ids.add(legacy.roomId)
  return ids
}

/** 最新鲜的在线协作房间 id（供编辑器异常退出后的重连判定） */
export const getFreshestActiveRoomId = (): string | null => {
  const now = Date.now()
  let freshestId: string | null = null
  let freshestTs = -1
  const consider = (roomId: string, ts: number) => {
    if (now - ts <= ACTIVE_ROOM_TTL_MS && ts > freshestTs) {
      freshestTs = ts
      freshestId = roomId
    }
  }
  for (const [roomId, ts] of Object.entries(readMap())) consider(roomId, ts)
  const legacy = readLegacyEntry()
  if (legacy) consider(legacy.roomId, legacy.ts)
  return freshestId
}

/** 加入房间：登记（或刷新）自己的房间 */
export const setActiveRoom = (roomId: string) => {
  const map = readMap()
  map[roomId] = Date.now()
  writeMap(map)
}

/**
 * 心跳：仅刷新已登记的自己的房间。
 * 未登记（已离开）时不创建条目——避免离开后迟到的轮询回调复活陈旧状态。
 */
export const touchActiveRoom = (roomId: string) => {
  const map = readMap()
  if (!(roomId in map)) return
  map[roomId] = Date.now()
  writeMap(map)
}

/** 离开房间 / 页面隐藏：只注销自己的房间，不影响其他 Tab 的协作状态 */
export const removeActiveRoom = (roomId: string) => {
  const map = readMap()
  if (!(roomId in map)) return
  delete map[roomId]
  writeMap(map)
}

/** 需要监听的 storage 键（跨 Tab 同步按钮状态） */
export const activeRoomStorageKeys: readonly string[] = [REGISTRY_KEY, LEGACY_KEY]
