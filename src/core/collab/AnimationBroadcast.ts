// src/core/collab/AnimationBroadcast.ts
// 动画广播（房主向房间成员演示录制内容）的共享协议。
//
// 设计要点：
//  - **广播控制状态**写入 Y.Map `animationBroadcast`，**key = 被广播的录制段 id**；
//    value 是**扁平对象**（全部为标量），不是嵌套 Y.Map。
//    原因：嵌套 Y.Map 的字段变更只有 `observeDeep` 才能感知（浅观察收不到），
//    而控制状态仅 9 个标量、体积可忽略，直接整体覆盖写入更简单且无该陷阱。
//  - **录制段数据**单独放在 Y.Map `animationBroadcastData`（key 同上，value 为 JSON 字符串）：
//    只在开播时写入一次。若与心跳共用一张表，每次心跳都会把整段数据重新同步一遍。
//  - 同步粒度：**只同步控制状态**（cursor/playing/direction/节奏/循环）+ 500ms 心跳纠偏，
//    不对齐到毫秒级——成员侧按自己的帧循环播放，看到的是同一段演示而非同一帧。
//  - **只在房主侧写入**，成员只读。
//  - 心跳超时（`BROADCAST_STALE_MS`）自动失效：房主掉线/关页/离开房间后成员自动退出广播视图。

import type * as Y from 'yjs'

/** 广播控制状态（写入共享表的完整值；全部为标量，可 JSON 往返） */
export interface AnimationBroadcastState {
  /** 被广播的录制段 id（同时是 Y.Map 的 key） */
  sessionId: string
  /** 房主当前所在步（-1 = 起点） */
  cursor: number
  playing: boolean
  direction: 1 | -1
  autoAdvanceMs: number
  loop: boolean
  /** 房主 clientId（用于识别广播来源与归属校验） */
  hostClientId: number
  /** 房主昵称（展示用） */
  hostName: string
  /** 房主写入时间戳（毫秒），成员据此做过期判定与新旧取舍 */
  updatedAt: number
}

/** 房主侧要写入的控制状态（不含 host/时间戳，由通道补齐） */
export type BroadcastControlInput = Omit<
  AnimationBroadcastState,
  'hostClientId' | 'hostName' | 'updatedAt'
>

/** 共享控制表：key = 录制段 id，value = 扁平控制状态 */
export type BroadcastControlMap = Y.Map<AnimationBroadcastState>

/** 广播共享表（由 CollabManager 创建） */
export interface BroadcastMaps {
  control: BroadcastControlMap
  data: Y.Map<string>
}

/** 房主侧数据来源（由播放引擎侧提供） */
export interface BroadcastHostSource {
  /** 当前要广播的控制状态；返回 null 表示无可广播内容（本次不写心跳） */
  getControl(sessionId: string): BroadcastControlInput | null
  /** 取某录制段的序列化数据（开播时一次性写入） */
  getSessionPayload(sessionId: string): string | null
}

/** 心跳间隔：成员最多滞后该时长后得到纠正 */
export const BROADCAST_HEARTBEAT_MS = 500

/**
 * 过期阈值：心跳间隔的 6 倍。
 * 超过该时长未收到心跳即认为广播已结束（房主掉线/关闭页面/离开房间）。
 */
export const BROADCAST_STALE_MS = BROADCAST_HEARTBEAT_MS * 6

// ─────────────────────────────────────────────
// 读取工具（纯函数，便于单测）
// ─────────────────────────────────────────────

function toFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * 校验并归一化共享表里的一条记录。
 * 结构不合法（缺少 sessionId / hostClientId）时返回 null，避免脏数据导致成员误入广播视图。
 */
export function normalizeBroadcastState(raw: unknown): AnimationBroadcastState | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  const sessionId = typeof v.sessionId === 'string' ? v.sessionId : ''
  if (!sessionId) return null
  const hostClientId = typeof v.hostClientId === 'number' ? v.hostClientId : null
  if (hostClientId === null) return null
  return {
    sessionId,
    cursor: toFiniteNumber(v.cursor, -1),
    playing: v.playing === true,
    direction: v.direction === -1 ? -1 : 1,
    autoAdvanceMs: toFiniteNumber(v.autoAdvanceMs, 1200),
    loop: v.loop === true,
    hostClientId,
    hostName: typeof v.hostName === 'string' ? v.hostName : '',
    updatedAt: toFiniteNumber(v.updatedAt, 0),
  }
}

/**
 * 指定时刻下仍然生效的广播。
 * 多条并存时（理论上只在广播段切换的瞬间）取 `updatedAt` 最新的一条；全部过期则返回 null。
 */
export function pickActiveBroadcast(
  states: AnimationBroadcastState[],
  now: number,
  staleMs: number = BROADCAST_STALE_MS,
): AnimationBroadcastState | null {
  let best: AnimationBroadcastState | null = null
  for (const state of states) {
    if (now - state.updatedAt > staleMs) continue
    if (!best || state.updatedAt > best.updatedAt) best = state
  }
  return best
}

// ─────────────────────────────────────────────
// 通道
// ─────────────────────────────────────────────

/**
 * 动画广播通道。
 *
 * 房主：`startBroadcast` 写一次数据 + 控制状态，随后 500ms 心跳只更新变化的控制字段；
 * 成员：监听共享表变化即时反应，并另有轮询兜底处理「房主停止心跳导致的过期」。
 */
export class AnimationBroadcastChannel {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private broadcastingSessionId: string | null = null
  private controlObserver: (() => void) | null = null
  private dataObserver: (() => void) | null = null

  constructor(
    private readonly maps: BroadcastMaps,
    private readonly selfClientId: number,
    private readonly getHostName: () => string,
  ) {}

  // ─────────────── 观察 ───────────────

  /** 注册「共享表发生变化」回调；成员侧据此即时响应 */
  observe(callback: () => void): void {
    this.unobserve()
    this.controlObserver = () => callback()
    this.dataObserver = () => callback()
    this.maps.control.observe(this.controlObserver)
    this.maps.data.observe(this.dataObserver)
  }

  unobserve(): void {
    if (this.controlObserver) this.maps.control.unobserve(this.controlObserver)
    if (this.dataObserver) this.maps.data.unobserve(this.dataObserver)
    this.controlObserver = null
    this.dataObserver = null
  }

  dispose(): void {
    this.stopBroadcast()
    this.unobserve()
  }

  // ─────────────── 房主侧 ───────────────

  get isBroadcasting(): boolean {
    return this.broadcastingSessionId !== null
  }

  get broadcastingId(): string | null {
    return this.broadcastingSessionId
  }

  /** 开始广播：写入录制段数据 + 首次控制状态，并启动 500ms 心跳 */
  startBroadcast(sessionId: string, source: BroadcastHostSource): boolean {
    // 换段广播时先清掉上一段，避免共享表里同时存在两条有效广播
    this.stopBroadcast()

    const payload = source.getSessionPayload(sessionId)
    if (payload === null) return false

    this.maps.data.set(sessionId, payload)
    this.broadcastingSessionId = sessionId
    this.pushControl(source)

    this.heartbeatTimer = setInterval(() => {
      this.pushControl(source)
    }, BROADCAST_HEARTBEAT_MS)
    return true
  }

  /**
   * 心跳：写入当前控制状态。
   *
   * ⚠ **必须每次写入**，不能按内容去重。
   *
   * 原因：成员的「广播是否仍然有效」判定依据是 `updatedAt` 相对
   * `BROADCAST_STALE_MS`（3s）是否过期。若内容未变化就跳过写入，
   * 一旦房主暂停/停在中途超过 3s，成员侧就会把这条广播判为过期：
   * 于是被踢出播放 → 等房主状态再次变化又重新进入 → 反复进出，
   * 并反复弹出「正在广播动画」提示（用户实测反馈的正是这个现象）。
   *
   * 心跳的意义就是「定期声明我还活着」，因此时间戳刷新优先于流量节省。
   * 流量代价可忽略：每 500ms 一个小对象写入。
   */
  pushControl(source: BroadcastHostSource): void {
    const sessionId = this.broadcastingSessionId
    if (!sessionId) return
    const control = source.getControl(sessionId)
    if (!control) return

    const next: AnimationBroadcastState = {
      ...control,
      hostClientId: this.selfClientId,
      hostName: this.getHostName(),
      updatedAt: Date.now(),
    }
    this.maps.control.set(sessionId, next)
  }

  /** 停止广播：删除自己写入的两条记录并停掉心跳 */
  stopBroadcast(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    const sessionId = this.broadcastingSessionId
    this.broadcastingSessionId = null
    if (!sessionId) return

    // 只删自己写入的条目（房间内同时只有房主会写，但仍做归属校验）
    const record = this.maps.control.get(sessionId)
    if (record && record.hostClientId === this.selfClientId) {
      this.maps.control.delete(sessionId)
    }
    this.maps.data.delete(sessionId)
  }

  // ─────────────── 成员侧（只读） ───────────────

  /** 读取当前生效的广播（已过期则返回 null） */
  getActiveBroadcast(now: number = Date.now()): AnimationBroadcastState | null {
    return pickActiveBroadcast(this.readAllStates(), now)
  }

  /** 读取共享表中全部（未过滤过期）的广播状态 */
  readAllStates(): AnimationBroadcastState[] {
    const states: AnimationBroadcastState[] = []
    this.maps.control.forEach((value) => {
      const state = normalizeBroadcastState(value)
      if (state) states.push(state)
    })
    return states
  }

  /** 读取广播附带的录制段数据（JSON 字符串） */
  getSessionPayload(sessionId: string): string | null {
    const raw = this.maps.data.get(sessionId)
    return typeof raw === 'string' ? raw : null
  }

  /** 清理共享表里所有过期的广播条目（成员侧兜底，避免残留脏数据） */
  pruneStale(now: number = Date.now()): void {
    const stale: string[] = []
    for (const state of this.readAllStates()) {
      if (now - state.updatedAt > BROADCAST_STALE_MS) stale.push(state.sessionId)
    }
    stale.forEach((sessionId) => {
      this.maps.control.delete(sessionId)
      this.maps.data.delete(sessionId)
    })
  }
}

/** 便捷判断：某录制段是否正被广播（供 UI 标记） */
export function isSessionBroadcasting(
  states: AnimationBroadcastState[],
  sessionId: string,
): boolean {
  return states.some((s) => s.sessionId === sessionId)
}
