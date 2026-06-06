// src/composables/useSessionGuard.ts
// 统一的会话失效感知 composable。
// 使用方式（在 Vue 组件 setup 中）：
//   const { isInvalidated, reason } = useSessionGuard({
//     onInvalidated: (r) => { /* 善后逻辑 */ }
//   })
//
// 行为：
// - isInvalidated / reason 始终 derived 自 authStore.sessionInvalidatedAt / sessionInvalidationReason，
//   重登（clearSessionInvalidation）后会自动复位；
// - 在 onMounted 订阅 sessionEvents，onBeforeUnmount 退订；
// - onInvalidated 回调在同一会话生命周期内只触发一次；通过 watcher 在 store 复位时清零 handled。

import { computed, onMounted, onBeforeUnmount, watch, type ComputedRef } from 'vue'
import { useAuthStore } from '@/store/authStore'
import {
  sessionEvents,
  type InvalidationReason,
} from '@/utils/sessionEvents'

export type UseSessionGuardOptions = {
  /**
   * 自定义善后逻辑。组件可在此执行：清状态、弹窗、跳转、强制刷新等。
   * 同一会话生命周期内只会触发一次；用户重新登录后失效标记被清空，下次失效时仍会触发。
   */
  onInvalidated?: (reason: InvalidationReason) => void
}

export type UseSessionGuardResult = {
  /** 当前是否处于失效态（true 表示本会话已失效，应进入占位/善后 UI）。Vue 模板中会自动 unwrap。 */
  isInvalidated: ComputedRef<boolean>
  /** 触发失效的原因，未失效时为 null。Vue 模板中会自动 unwrap。 */
  reason: ComputedRef<InvalidationReason | null>
  /**
   * 手动标记为失效（一般不需要：useAuthStore 已统一管理；保留以备特殊场景）。
   */
  markInvalidated: (reason: InvalidationReason) => void
}

export function useSessionGuard(options: UseSessionGuardOptions = {}): UseSessionGuardResult {
  const authStore = useAuthStore()

  // 关键：直接 derived from store，重登后自动恢复
  const isInvalidated = computed(() => authStore.sessionInvalidatedAt !== null)
  const reason = computed(() => authStore.sessionInvalidationReason)

  // handled 标记：同一失效事件周期内 onInvalidated 回调只跑一次
  let handled = false

  const handle = (r: InvalidationReason) => {
    if (handled) return
    handled = true
    try {
      options.onInvalidated?.(r)
    } catch (err) {
      console.error('[useSessionGuard] onInvalidated threw:', err)
    }
  }

  // store 失效标记被清空（用户重登成功）→ 重置 handled，下次失效时仍可触发善后
  // 同时 watch reason：极少数边界场景下 reason 可能从一种变为另一种（如 S2 切到 S4），
  // 重置 handled 以便 onInvalidated 携带新 reason 再次触发；
  // 正常使用流程下 reason 变化与 invalidatedAt 变化是绑定的，已有 watch 覆盖。
  watch(
    () => authStore.sessionInvalidatedAt,
    (val) => {
      if (val === null) {
        handled = false
      }
    },
  )
  watch(
    () => authStore.sessionInvalidationReason,
    (newReason, oldReason) => {
      if (newReason !== oldReason) {
        handled = false
      }
    },
  )

  let unsubscribe: (() => void) | null = null
  onMounted(() => {
    unsubscribe = sessionEvents.on(handle)
  })
  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    isInvalidated,
    reason,
    markInvalidated: handle,
  }
}
