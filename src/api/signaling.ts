// src/api/signaling.ts
// 信令服务器 HTTP API 客户端：
// 用于查询房间的实时在线人数（直接从 y-websocket-server 获取，而非后端数据库）

/**
 * 从 localStorage 的 collab:join:* 记录中读取实际连接用的 wsUrl
 * （加入房间时由后端返回并写入，是 WebSocket 真正连上的信令实例地址）。
 * 在线人数查询必须与 WebSocket 连接指向同一个实例，否则 localhost 客户端
 * 会查到本机空实例而显示 0。
 */
const readJoinedWsUrl = (): string | null => {
  try {
    const PREFIX = 'collab:join:'
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(PREFIX)) {
        const raw = localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw) as { wsUrl?: string }
          if (parsed.wsUrl) return parsed.wsUrl
        }
      }
    }
  } catch {
    // 忽略读取异常，回退到默认地址
  }
  return null
}

/**
 * 生成有序的信令服务器 HTTP 基础地址候选列表：公网优先，本地兜底。
 *
 * 顺序：
 * 1. 本次/上次加入房间时后端返回的 wsUrl（localStorage collab:join:*，通常是公网实例）；
 * 2. 共享公网信令实例（固定公网地址，公网优先的关键兜底）；
 * 3. VITE_COLLAB_WS_URL 显式配置的本地实例（本地开发兜底）；
 * 4. dev 模式下当前站点主机上的本地 1234 服务。
 *
 * 每个候选限时 3 秒，公网不可达时快速回退本地实例，保证协作功能本地照常可用。
 */
const PROD_SIGNALING_HTTP_URL = 'https://47.239.188.55/signal'

const SIGNALING_FETCH_TIMEOUT_MS = 3_000

const getSignalingHttpBaseUrls = (): string[] => {
  const urls: string[] = []
  const push = (raw: string | undefined) => {
    if (!raw?.trim()) return
    const http = raw
      .trim()
      .replace(/^wss:\/\//i, 'https://')
      .replace(/^ws:\/\//i, 'http://')
      .replace(/\/+$/, '')
    if (http && !urls.includes(http)) urls.push(http)
  }
  // 1. 实际加入房间的后端返回 wsUrl（与 WebSocket 连接一致，通常是公网实例）
  push(readJoinedWsUrl() ?? undefined)
  // 2. 共享公网信令实例（公网优先的关键候选）
  push(PROD_SIGNALING_HTTP_URL)
  // 3. VITE_COLLAB_WS_URL 显式配置的本地实例（本地开发兜底）
  push(import.meta.env.VITE_COLLAB_WS_URL)
  // 4. dev 模式下站点主机上的本地 1234 服务
  if (import.meta.env.MODE !== 'production') {
    push(
      `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname || 'localhost'}:1234`,
    )
  }
  return urls
}

const fetchWithTimeout = async (url: string, init?: RequestInit): Promise<Response> => {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), SIGNALING_FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

export interface RoomPeerInfo {
  roomId: string
  onlineCount: number
  onlineUsers: Array<{ userId: string; username: string; role: string }>
}

export const signalingApi = {
  /**
   * 查询指定房间的实时在线人数（公网优先，不可达时依次回退本地实例）
   */
  async getRoomPeers(roomId: string): Promise<RoomPeerInfo> {
    let lastError: unknown = null
    for (const baseUrl of getSignalingHttpBaseUrls()) {
      try {
        const url = `${baseUrl}/room/${encodeURIComponent(roomId)}/peers`
        const response = await fetchWithTimeout(url, { method: 'GET' })
        if (!response.ok) throw new Error(`signaling API error: ${response.status}`)
        return response.json()
      } catch (err) {
        lastError = err
      }
    }
    throw lastError instanceof Error ? lastError : new Error('all signaling servers failed')
  },

  /**
   * 批量查询多个房间的实时在线人数
   * 返回 { [roomId]: onlineCount } 映射（公网优先，失败依次回退本地实例；
   * 全部不可用时返回空映射，调用方使用后端的 memberCount 兜底）
   */
  async batchGetRoomPeers(roomIds: string[]): Promise<Record<string, number>> {
    if (roomIds.length === 0) return {}
    for (const baseUrl of getSignalingHttpBaseUrls()) {
      try {
        const url = `${baseUrl}/rooms/peers`
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomIds }),
        })
        if (!response.ok) throw new Error(`signaling API error: ${response.status}`)
        return response.json()
      } catch {
        // 公网不可达时尝试下一个候选（本地实例）
      }
    }
    // 全部信令服务器不可用时返回空映射，调用方使用后端的 memberCount 兜底
    return {}
  },
}
