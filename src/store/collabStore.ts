import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { CollabManager } from '@/core/collab/CollabManager'
import type { CollabStatus } from '@/core/collab/CollabManager'

interface CollabJoinDialogState {
  visible: boolean
  message: string
}

const DEFAULT_ROOM_NAME = 'default-room'
const DEFAULT_COLLAB_JOIN_MESSAGE = '正在加入房间中...'

export const useCollabStore = defineStore('collab', () => {
  const roomName = ref(DEFAULT_ROOM_NAME)
  const peerCount = ref(1)
  const latencyMs = ref<number | null>(null)
  const status = ref<CollabStatus>({
    room: null,
    connecting: false,
    connected: false,
  })
  const joinDialog = ref<CollabJoinDialogState>({
    visible: false,
    message: DEFAULT_COLLAB_JOIN_MESSAGE,
  })
  // 持有当前活跃的 CollabManager 引用（由 EditorView 注册）；
  // 提供 leave() 让 useSessionGuard / 上层组件在会话失效时直接断网（不做权限校验）。
  const activeManager = ref<CollabManager | null>(null)

  const isConnected = computed(() => status.value.connected)
  const isConnecting = computed(() => status.value.connecting)
  const hasActiveRoom = computed(() => status.value.room !== null)

  const setRoomName = (value: string) => {
    roomName.value = value
  }

  const setPeerCount = (value: number) => {
    peerCount.value = value
  }

  const setLatencyMs = (value: number | null) => {
    latencyMs.value = value
  }

  const setStatus = (value: CollabStatus) => {
    status.value = value
  }

  const openJoinDialog = (message: string = DEFAULT_COLLAB_JOIN_MESSAGE) => {
    joinDialog.value = {
      visible: true,
      message,
    }
  }

  const closeJoinDialog = () => {
    joinDialog.value = {
      visible: false,
      message: DEFAULT_COLLAB_JOIN_MESSAGE,
    }
  }

  const setJoinDialogMessage = (message: string) => {
    joinDialog.value = {
      ...joinDialog.value,
      message,
    }
  }

  const resetCollabState = () => {
    roomName.value = DEFAULT_ROOM_NAME
    peerCount.value = 1
    latencyMs.value = null
    status.value = {
      room: null,
      connecting: false,
      connected: false,
    }
    closeJoinDialog()
  }

  /**
   * 注册当前 EditorView 创建的 CollabManager 引用，使 store 拥有控制协作连接的能力。
   * EditorView 在 onMounted 期间调用一次；onUnmounted 时调 setManager(null) 解绑。
   *
   * 用结构化类型接收，避免跨包导入 CollabManager 类后类型识别不一致的问题。
   */
  type LeaveableCollab = { leaveRoom: () => void }
  const setManager = (manager: LeaveableCollab | null) => {
    activeManager.value = manager as CollabManager | null
  }

  /**
   * 离开当前协作房间并断开 WebSocket。
   * 纯粹的网络层清理：不会重新做权限校验（Yjs 房间是独立的）；
   * 适用于会话失效时立即把本 Tab 退出协作，避免继续往房间发脏数据。
   */
  const leave = () => {
    const manager = activeManager.value
    if (!manager) return
    try {
      manager.leaveRoom()
    } catch (err) {
      // 断网失败不应阻塞后续善后流程
       
      console.warn('[collabStore] leaveRoom failed:', err)
    }
    activeManager.value = null
  }

  return {
    roomName,
    peerCount,
    latencyMs,
    status,
    joinDialog,
    isConnected,
    isConnecting,
    hasActiveRoom,
    setRoomName,
    setPeerCount,
    setLatencyMs,
    setStatus,
    openJoinDialog,
    closeJoinDialog,
    setJoinDialogMessage,
    resetCollabState,
    setManager,
    leave,
  }
})
