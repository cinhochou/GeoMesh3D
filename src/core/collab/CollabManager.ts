// src/core/collab/CollabManager.ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { Scene } from '../scene/Scene'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { Vec3 } from '../geometry/Vec3'

export type CollabStatus = {
  room: string | null
  connecting: boolean
  connected: boolean
}

type LocalSceneSnapshot = {
  points: Point3[]
  lines: Line3[]
  rays: Ray3[]
}

type PointSyncData = {
  x: number
  y: number
  z: number
  name: string
  nameVisible: boolean
  userLocked: boolean
}

type LineSyncData = {
  p1Id: string
  p2Id: string
  name: string
  nameVisible: boolean
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
}

type RaySyncData = {
  p1Id: string
  p2Id: string
  name: string
  nameVisible: boolean
  visible: boolean
  displayLength: number
  userLocked: boolean
}

type ProviderStatusEvent = {
  status: 'connecting' | 'connected' | 'disconnected'
}

export class CollabManager {
  // 本地 websocket 服务不可用时，回退到这个公网协作地址。
  private static readonly FALLBACK_SERVER_URL = 'wss://electrokinetic-shawanna-unstrewn.ngrok-free.dev'

  private ydoc: Y.Doc
  private provider: WebsocketProvider | null = null
  private yPoints: Y.Map<PointSyncData>
  private yLines: Y.Map<LineSyncData>
  private yRays: Y.Map<RaySyncData>
  private pointsObserver: ((event: Y.YMapEvent<PointSyncData>) => void) | null = null
  private linesObserver: ((event: Y.YMapEvent<LineSyncData>) => void) | null = null
  private raysObserver: ((event: Y.YMapEvent<RaySyncData>) => void) | null = null

  private roomName: string | null = null
  private connecting = false
  private connected = false

  private syncTimer: number | null = null
  private syncPending = false
  private providerCleanup: Array<() => void> = []
  private readonly serverUrls: string[]

  public onPeersUpdate: (count: number) => void = () => {}
  public onStatusUpdate: (status: CollabStatus) => void = () => {}

  constructor(private scene: Scene) {
    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap('points')
    this.yLines = this.ydoc.getMap('lines')
    this.yRays = this.ydoc.getMap('rays')
    this.serverUrls = CollabManager.resolveServerUrls()
    this.setupObservers()
  }

  private static normalizeServerUrl(url: string) {
    // y-websocket 只接受 ws / wss，这里顺手把 http / https 也规范成对应协议。
    return url.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://').replace(/\/+$/, '')
  }

  private static resolveServerUrls() {
    const configuredUrl = import.meta.env.VITE_COLLAB_WS_URL?.trim()
    // 连接优先级：
    // 1. 优先使用环境变量里显式配置的地址
    // 2. 否则使用当前站点主机上的本地/默认 websocket 服务
    // 3. 最后回退到公网备用地址
    const candidates = configuredUrl
      ? [configuredUrl]
      : [
          `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname || 'localhost'}:1234`,
        ]

    candidates.push(CollabManager.FALLBACK_SERVER_URL)
    return [...new Set(candidates.map((url) => CollabManager.normalizeServerUrl(url)))]
  }

  getStatus(): CollabStatus {
    return {
      room: this.roomName,
      connecting: this.connecting,
      connected: this.connected,
    }
  }

  async joinRoom(roomName: string) {
    const normalizedRoomName = roomName.trim()
    if (!normalizedRoomName) throw new Error('roomName is empty')

    const localSnapshot = this.captureLocalSnapshot()
    this.leaveRoom()
    this.resetDoc()
    this.clearLocalSceneForJoin()

    this.roomName = normalizedRoomName
    this.connecting = true
    this.connected = false
    this.emitStatus()

    // 按顺序尝试每个候选 websocket 地址，只要有一个成功完成同步就停止继续回退。
    const timeoutMs = 10_000
    let lastError: unknown = null

    for (const serverUrl of this.serverUrls) {
      console.log(`joining room: ${normalizedRoomName} via ${serverUrl}`)
      this.provider = new WebsocketProvider(serverUrl, normalizedRoomName, this.ydoc)

      try {
        const provider = this.provider
        this.bindProviderStatus(provider)
        await this.waitForInitialRoomState(provider, normalizedRoomName, timeoutMs)
        this.reconcileInitialScene(localSnapshot)
        return
      } catch (err) {
        lastError = err
        // 当前地址连接失败后，先完整释放 provider，再尝试下一个备用地址。
        this.clearProviderBindings()
        this.provider.disconnect()
        this.provider.destroy()
        this.provider = null
        this.connected = false
        this.connecting = true
        this.emitStatus()
        console.warn(`collab room: ${normalizedRoomName}, failed to connect via ${serverUrl}`, err)
      }
    }

    this.leaveRoom()
    this.restoreLocalSnapshot(localSnapshot)
    throw lastError instanceof Error ? lastError : new Error('all collaboration servers failed')
  }

  leaveRoom() {
    this.clearProviderBindings()

    if (this.provider) {
      console.log('disconnecting collaboration provider...')
      this.provider.disconnect()
      this.provider.destroy()
      this.provider = null
      this.onPeersUpdate(1)
    }

    if (this.syncTimer) {
      window.clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
    this.syncPending = false

    this.roomName = null
    this.connecting = false
    this.connected = false
    this.emitStatus()
  }

  private emitStatus() {
    this.onStatusUpdate(this.getStatus())
  }

  private emitPeerCount(provider: WebsocketProvider | null = this.provider) {
    const count = provider ? Math.max(provider.awareness.getStates().size, 1) : 1
    this.onPeersUpdate(count)
  }

  private updateConnectionStateFromProvider(provider: WebsocketProvider) {
    const isRoomOpen = this.roomName !== null
    this.connected = provider.wsconnected && provider.synced
    this.connecting =
      isRoomOpen && (provider.wsconnecting || (provider.wsconnected && !provider.synced))
    this.emitStatus()
  }

  private clearProviderBindings() {
    this.providerCleanup.forEach((cleanup) => cleanup())
    this.providerCleanup = []
  }

  private bindProviderStatus(provider: WebsocketProvider) {
    this.clearProviderBindings()

    const syncProviderState = () => {
      this.updateConnectionStateFromProvider(provider)
      this.emitPeerCount(provider)
    }

    const handleStatus = () => {
      syncProviderState()
    }
    const handleSync = () => {
      syncProviderState()
    }
    const handleAwarenessChange = () => {
      this.emitPeerCount(provider)
    }

    provider.on('status', handleStatus)
    provider.on('sync', handleSync)
    provider.awareness.on('change', handleAwarenessChange)
    this.providerCleanup.push(() => {
      provider.off('status', handleStatus)
      provider.off('sync', handleSync)
      provider.awareness.off('change', handleAwarenessChange)
    })

    syncProviderState()
  }

  private captureLocalSnapshot(): LocalSceneSnapshot {
    return {
      points: [...this.scene.points.values()].filter((point) => !point.locked),
      lines: [...this.scene.lines.values()],
      rays: [...this.scene.rays.values()],
    }
  }

  private clearLocalSceneForJoin() {
    this.scene.lines.clear()
    this.scene.rays.clear()
    this.scene.points.forEach((point, id) => {
      if (!point.locked) this.scene.points.delete(id)
    })
    this.scene.constraints.length = 0
    this.scene.selection.clear()
  }

  private restoreLocalSnapshot(snapshot: LocalSceneSnapshot) {
    snapshot.points.forEach((point) => this.scene.addPoint(point))
    snapshot.lines.forEach((line) => this.scene.addLine(line))
    snapshot.rays.forEach((ray) => this.scene.addRay(ray))
  }

  private roomHasSharedGeometry() {
    return (
      [...this.yPoints.keys()].some((id) => id !== Scene.ORIGIN_ID) ||
      this.yLines.size > 0 ||
      this.yRays.size > 0
    )
  }

  private reconcileInitialScene(localSnapshot: LocalSceneSnapshot) {
    if (this.roomHasSharedGeometry()) return
    if (
      localSnapshot.points.length === 0 &&
      localSnapshot.lines.length === 0 &&
      localSnapshot.rays.length === 0
    ) {
      return
    }

    this.restoreLocalSnapshot(localSnapshot)
    this.syncNow()
  }

  private waitForInitialRoomState(
    provider: WebsocketProvider,
    roomName: string,
    timeoutMs: number,
  ) {
    const settleMs = 150

    return new Promise<void>((resolve, reject) => {
      let done = false
      let settleTimer: number | null = null

      const cleanup = () => {
        provider.off('sync', handleSync)
        provider.off('status', handleStatus)
        window.clearTimeout(timeoutTimer)
        if (settleTimer !== null) window.clearTimeout(settleTimer)
      }

      const finish = () => {
        if (done) return
        done = true
        cleanup()
        resolve()
      }

      const fail = (err: Error) => {
        if (done) return
        done = true
        cleanup()
        reject(err)
      }

      const scheduleSettle = () => {
        if (settleTimer !== null || !provider.wsconnected || !provider.synced) return
        settleTimer = window.setTimeout(() => {
          finish()
        }, settleMs)
      }

      const timeoutTimer = window.setTimeout(() => {
        fail(new Error(`connect timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const handleStatus = ({ status }: ProviderStatusEvent) => {
        if (status === 'connected') {
          console.log(`collab room: ${roomName}, y-websocket connected`)
        }
        this.updateConnectionStateFromProvider(provider)
        scheduleSettle()
      }

      const handleSync = (isSynced: boolean) => {
        if (isSynced) {
          console.log(`collab room: ${roomName}, initial room sync completed`)
          scheduleSettle()
        }
      }

      provider.on('status', handleStatus)
      provider.on('sync', handleSync)
      console.log(`collab room: ${roomName}, waiting for y-websocket server...`)

      handleStatus({
        status: provider.wsconnecting
          ? 'connecting'
          : provider.wsconnected
            ? 'connected'
            : 'disconnected',
      })
      handleSync(provider.synced)
    })
  }

  private resetDoc() {
    if (this.pointsObserver) this.yPoints.unobserve(this.pointsObserver)
    if (this.linesObserver) this.yLines.unobserve(this.linesObserver)
    if (this.raysObserver) this.yRays.unobserve(this.raysObserver)

    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap('points')
    this.yLines = this.ydoc.getMap('lines')
    this.yRays = this.ydoc.getMap('rays')
    this.setupObservers()
  }

  private setupObservers() {
    this.pointsObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yPoints.get(id)
          if (!data) return
          const point = this.scene.points.get(id)
          if (point) {
            if (point.locked) return
            point.name = data.name ?? point.name
            if (typeof data.nameVisible === 'boolean') point.nameVisible = data.nameVisible
            if (typeof data.userLocked === 'boolean') point.userLocked = data.userLocked
            point.setPosition(new Vec3(data.x, data.y, data.z))
          } else {
            const isOrigin = id === Scene.ORIGIN_ID
            this.scene.addPoint(
              new Point3(
                id,
                data.name ?? '',
                new Vec3(data.x, data.y, data.z),
                isOrigin,
                typeof data.nameVisible === 'boolean' ? data.nameVisible : true,
                typeof data.userLocked === 'boolean' ? data.userLocked : false,
              ),
            )
          }
        } else if (change.action === 'delete') {
          if (id === Scene.ORIGIN_ID) return

          this.scene.lines.forEach((line, lineId) => {
            if (line.p1.id === id || line.p2.id === id) {
              this.scene.lines.delete(lineId)
            }
          })
          this.scene.rays.forEach((ray, rayId) => {
            if (ray.p1.id === id || ray.p2.id === id) {
              this.scene.rays.delete(rayId)
              this.scene.selection.rays.delete(rayId)
            }
          })
          this.scene.points.delete(id)
          this.scene.selection.points.delete(id)
        }
      })
    }
    this.yPoints.observe(this.pointsObserver)

    this.linesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yLines.get(id)
          if (!data) return
          const p1 = this.scene.points.get(data.p1Id)
          const p2 = this.scene.points.get(data.p2Id)
          if (!p1 || !p2) return

          const line = this.scene.lines.get(id)
          if (line) {
            line.name = data.name ?? line.name
            line.nameVisible = data.nameVisible ?? line.nameVisible
            line.visible = data.visible ?? line.visible
            line.userLocked = data.userLocked ?? line.userLocked
            line.lengthLocked = data.lengthLocked ?? line.lengthLocked
            line.lockedLength =
              typeof data.lockedLength === 'number'
                ? Line3.normalizeLockedLength(data.lockedLength)
                : line.lockedLength
            line.p1 = p1
            line.p2 = p2
          } else {
            this.scene.addLine(
              new Line3(
                id,
                data.name ?? '',
                p1,
                p2,
                data.nameVisible ?? true,
                data.visible ?? true,
                data.lengthLocked ?? false,
                Line3.normalizeLockedLength(
                  data.lockedLength ??
                    Math.hypot(
                      p2.position.x - p1.position.x,
                      p2.position.y - p1.position.y,
                      p2.position.z - p1.position.z,
                    ),
                ),
                data.userLocked ?? false,
              ),
            )
          }
        } else if (change.action === 'delete') {
          this.scene.lines.delete(id)
          this.scene.selection.lines.delete(id)
        }
      })
    }
    this.yLines.observe(this.linesObserver)

    this.raysObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yRays.get(id)
          if (!data) return
          const p1 = this.scene.points.get(data.p1Id)
          const p2 = this.scene.points.get(data.p2Id)
          if (!p1 || !p2) return

          const ray = this.scene.rays.get(id)
          if (ray) {
            ray.name = data.name ?? ray.name
            ray.nameVisible = data.nameVisible ?? ray.nameVisible
            ray.visible = data.visible ?? ray.visible
            ray.userLocked = data.userLocked ?? ray.userLocked
            ray.displayLength =
              typeof data.displayLength === 'number'
                ? Ray3.normalizeDisplayLength(data.displayLength)
                : ray.displayLength
            ray.p1 = p1
            ray.p2 = p2
          } else {
            this.scene.addRay(
              new Ray3(
                id,
                data.name ?? '',
                p1,
                p2,
                data.nameVisible ?? true,
                data.visible ?? true,
                Ray3.normalizeDisplayLength(data.displayLength ?? Ray3.DEFAULT_DISPLAY_LENGTH),
                data.userLocked ?? false,
              ),
            )
          }
        } else if (change.action === 'delete') {
          this.scene.rays.delete(id)
          this.scene.selection.rays.delete(id)
        }
      })
    }
    this.yRays.observe(this.raysObserver)
  }

  syncAction() {
    if (!this.provider || !this.connected) return

    this.syncPending = true
    if (this.syncTimer) return

    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null
      if (!this.syncPending) return
      this.syncPending = false
      this.syncNow()
    }, 50)
  }

  private syncNow() {
    if (!this.provider || !this.connected) return

    this.ydoc.transact(() => {
      const pointIds = new Set(this.scene.points.keys())
      const lineIds = new Set(this.scene.lines.keys())
      const rayIds = new Set(this.scene.rays.keys())

      for (const id of [...this.yPoints.keys()]) {
        if (!pointIds.has(id)) this.yPoints.delete(id)
      }
      for (const id of [...this.yLines.keys()]) {
        if (!lineIds.has(id)) this.yLines.delete(id)
      }
      for (const id of [...this.yRays.keys()]) {
        if (!rayIds.has(id)) this.yRays.delete(id)
      }

      this.scene.points.forEach((p, id) => {
        const next = {
          x: p.position.x,
          y: p.position.y,
          z: p.position.z,
          name: p.name,
          nameVisible: p.nameVisible,
          userLocked: p.userLocked,
        }
        const prev = this.yPoints.get(id)
        if (
          !prev ||
          prev.x !== next.x ||
          prev.y !== next.y ||
          prev.z !== next.z ||
          prev.name !== next.name ||
          prev.nameVisible !== next.nameVisible ||
          prev.userLocked !== next.userLocked
        ) {
          this.yPoints.set(id, next)
        }
      })

      this.scene.lines.forEach((l, id) => {
        const next = {
          p1Id: l.p1.id,
          p2Id: l.p2.id,
          name: l.name,
          nameVisible: l.nameVisible,
          visible: l.visible,
          userLocked: l.userLocked,
          lengthLocked: l.lengthLocked,
          lockedLength: l.lockedLength,
        }
        const prev = this.yLines.get(id)
        if (
          !prev ||
          prev.p1Id !== next.p1Id ||
          prev.p2Id !== next.p2Id ||
          prev.name !== next.name ||
          prev.nameVisible !== next.nameVisible ||
          prev.visible !== next.visible ||
          prev.userLocked !== next.userLocked ||
          prev.lengthLocked !== next.lengthLocked ||
          prev.lockedLength !== next.lockedLength
        ) {
          this.yLines.set(id, next)
        }
      })

      this.scene.rays.forEach((ray, id) => {
        const next = {
          p1Id: ray.p1.id,
          p2Id: ray.p2.id,
          name: ray.name,
          nameVisible: ray.nameVisible,
          visible: ray.visible,
          displayLength: ray.displayLength,
          userLocked: ray.userLocked,
        }
        const prev = this.yRays.get(id)
        if (
          !prev ||
          prev.p1Id !== next.p1Id ||
          prev.p2Id !== next.p2Id ||
          prev.name !== next.name ||
          prev.nameVisible !== next.nameVisible ||
          prev.visible !== next.visible ||
          prev.displayLength !== next.displayLength ||
          prev.userLocked !== next.userLocked
        ) {
          this.yRays.set(id, next)
        }
      })
    })
  }
}
