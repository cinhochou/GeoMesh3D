// src/utils/sessionEvents.ts
// 会话失效事件总线：
// - 由 authStore 在检测到本地/其他 Tab 登出、refresh 失败、token 被清除等场景下调用 emit
// - 由 useSessionGuard 等订阅者在 onMounted 中订阅、onUnmounted 中退订
// 不依赖任何外部库，纯 TS 内存事件

export type InvalidationReason = 'manual' | 'other_tab' | 'refresh_failed'

type Listener = (reason: InvalidationReason) => void

const listeners = new Set<Listener>()

export const sessionEvents = {
  on(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  off(listener: Listener): void {
    listeners.delete(listener)
  },

  emit(reason: InvalidationReason): void {
    for (const listener of listeners) {
      try {
        listener(reason)
      } catch (err) {
        // 单个订阅者抛错不影响其他订阅者

        console.error('[sessionEvents] listener threw:', err)
      }
    }
  },
}

/**
 * 跨 Tab 同步会话失效状态使用的 localStorage key。
 * 写入 'inactive' 表示会话已失效；其他 Tab 监听 storage 事件即可感知。
 * 注意：'storage' 事件只会在**其他** Tab 触发，本 Tab 写入不会触发本 Tab 的 storage 事件。
 *
 * 版本说明（v1）：
 * - 引入 :v1 后缀是为未来 schema 变更预留升级空间。
 * - 旧 Tab 还在用 'auth:session_state'（无版本号）写入时，新 Tab 不会识别，
 *   但这只是"未检测到失效"的小副作用；下次该 Tab 自己操作（如 logout/login）会自然重置。
 * - 升级 schema 时，把 :v1 改为 :v2 即可，老 key 残留不影响新流程。
 */
export const SESSION_STATE_STORAGE_KEY = 'auth:session_state:v1'

export const SESSION_STATE_INACTIVE = 'inactive'

/**
 * 跨 Tab 重新登录事件：
 * 当一个 Tab 完成登录 / 重新登录后（access_token 变更 + user 信息已同步到 store），
 * 通知其他 Tab："其他 Tab 上的视图需要重新拉取/重置自己的数据"。
 *
 * 设计要点：
 * - 与 sessionEvents（会话失效广播）解耦：登录是"激活"，失效是"停用"，语义不同
 * - 每次 reinitializeFromStorageToken 成功都广播，覆盖"同账号重登"和"切换账号"两种场景
 * - 按需决定是否重拉数据：
 *   - 切换账号（event.userId !== 当前 user.id）→ 必须重拉（数据属于旧 user）
 *   - 同账号重登（event.userId === 当前 user.id）→ 可选重拉（数据未变，但 token 已刷新）
 * - 订阅者在 onMounted 订阅、onBeforeUnmount 退订，参考 useSessionGuard 的实现
 */
export type CrossTabLoginSource = 'access_token_change'

export type CrossTabLoginEvent = {
  userId: string
  source: CrossTabLoginSource
  /**
   * 触发本次广播的 user 是否与本 Tab 上一次已知的 user 不同。
   *   - true: 切换账号 / 从无到有 → 订阅者必须重拉数据（数据属于旧 user）
   *   - false: 同账号重登 → 数据未变，订阅者按需选择是否重拉
   *
   * 设计原因：单凭 event.userId 与 authStore.user.id 的对比无法判断是否变化，
   * 因为 authStore.user 在 emit 之前已经被 setAuthenticated 更新过；
   * 需要 emit 端在写入 store 时同时记录下变化标志。
   */
  changed: boolean
}

type CrossTabLoginListener = (event: CrossTabLoginEvent) => void

const crossTabLoginListeners = new Set<CrossTabLoginListener>()

export const crossTabLoginEvents = {
  on(listener: CrossTabLoginListener): () => void {
    crossTabLoginListeners.add(listener)
    return () => {
      crossTabLoginListeners.delete(listener)
    }
  },

  off(listener: CrossTabLoginListener): void {
    crossTabLoginListeners.delete(listener)
  },

  emit(event: CrossTabLoginEvent): void {
    for (const listener of crossTabLoginListeners) {
      try {
        listener(event)
      } catch (err) {
        // 单个订阅者抛错不影响其他订阅者
        console.error('[crossTabLoginEvents] listener threw:', err)
      }
    }
  },
}
