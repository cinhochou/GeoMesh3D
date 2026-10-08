// src/utils/collabWriteEvents.ts
// 协作写互斥拦截事件总线（同 Tab 内存事件）：
// - 由 EditorView 在「本地命令因他人正在操作相关几何对象而被拦截」时 emit
// - 由 SideBar 订阅，把当前编辑卡片的字段从场景重新回灌
//
// 为什么需要它：命令被拦截意味着**场景没有发生变化**，而 SideBar 的草稿同步依赖
// 「场景对象变化」触发的 watcher（见 SideBar 中监听 editing 对象位置的若干 watch），
// 因此输入框会保留用户已输入但未生效的值，表现为「填了新值、几何没变，过一会儿又跳回来」。
// 拦截时主动对齐一次即可消除这种界面临时漂移。
//
// 风格与 sessionEvents / crossTabLoginEvents 保持一致，不依赖任何外部库。

export type CollabWriteBlockedEvent = {
  /** 面向用户的提示文案 */
  message: string
  /** 本次被拦命令涉及的场景元素 id（供订阅者判断是否需要回灌自己正在编辑的对象） */
  elementIds: string[]
}

type Listener = (event: CollabWriteBlockedEvent) => void

const listeners = new Set<Listener>()

export const collabWriteEvents = {
  on(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  off(listener: Listener): void {
    listeners.delete(listener)
  },

  emit(event: CollabWriteBlockedEvent): void {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch (err) {
        // 单个订阅者抛错不影响其他订阅者
        console.error('[collabWriteEvents] listener threw:', err)
      }
    }
  },
}
