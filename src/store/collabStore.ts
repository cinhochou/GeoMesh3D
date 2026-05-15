import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
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
  }
})
