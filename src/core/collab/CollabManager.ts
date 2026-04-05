// src/core/collab/CollabManager.ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { Scene } from '../scene/Scene'
import { Point3 } from '../geometry/Point3'
import { Line3 } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarFace } from '../geometry/Plane'
import { Vec3 } from '../geometry/Vec3'

export type CollabStatus = {
  room: string | null
  connecting: boolean
  connected: boolean
}

type LocalSceneSnapshot = {
  points: Point3[]
  lines: Line3[]
  straightLines: StraightLine3[]
  rays: Ray3[]
  faces: PlanarFace[]
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

type StraightLineSyncData = {
  p1Id: string
  p2Id: string
  name: string
  nameVisible: boolean
  visible: boolean
  displayLength: number
  userLocked: boolean
}

type FaceSyncData = {
  name: string
  nameVisible: boolean
  visible: boolean
  userLocked: boolean
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
}

type ProviderStatusEvent = {
  status: 'connecting' | 'connected' | 'disconnected'
}

export class CollabManager {
  private static readonly LIVE_SYNC_THROTTLE_MS = 33
  // 本地 websocket 服务不可用时，回退到这个公网协作地址。
  private static readonly FALLBACK_SERVER_URL = 'wss://kraig-scarabaeiform-zealously.ngrok-free.dev'

  private ydoc: Y.Doc
  private provider: WebsocketProvider | null = null
  private yPoints: Y.Map<PointSyncData>
  private yLines: Y.Map<LineSyncData>
  private yStraightLines: Y.Map<StraightLineSyncData>
  private yRays: Y.Map<RaySyncData>
  private yFaces: Y.Map<FaceSyncData>
  private pointsObserver: ((event: Y.YMapEvent<PointSyncData>) => void) | null = null
  private linesObserver: ((event: Y.YMapEvent<LineSyncData>) => void) | null = null
  private straightLinesObserver: ((event: Y.YMapEvent<StraightLineSyncData>) => void) | null = null
  private raysObserver: ((event: Y.YMapEvent<RaySyncData>) => void) | null = null
  private facesObserver: ((event: Y.YMapEvent<FaceSyncData>) => void) | null = null

  private roomName: string | null = null
  private connecting = false
  private connected = false

  private syncTimer: number | null = null
  private syncPending = false
  private liveSyncTimer: number | null = null
  private liveSyncPending = false
  private providerCleanup: Array<() => void> = []
  private readonly serverUrls: string[]
  private readonly dirtyPointIds = new Set<string>()
  private readonly dirtyLineIds = new Set<string>()
  private readonly dirtyStraightLineIds = new Set<string>()
  private readonly dirtyRayIds = new Set<string>()
  private readonly dirtyFaceIds = new Set<string>()
  private readonly deletedPointIds = new Set<string>()
  private readonly deletedLineIds = new Set<string>()
  private readonly deletedStraightLineIds = new Set<string>()
  private readonly deletedRayIds = new Set<string>()
  private readonly deletedFaceIds = new Set<string>()

  public onPeersUpdate: (count: number) => void = () => {}
  public onStatusUpdate: (status: CollabStatus) => void = () => {}

  constructor(private scene: Scene) {
    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap('points')
    this.yLines = this.ydoc.getMap('lines')
    this.yStraightLines = this.ydoc.getMap('straightLines')
    this.yRays = this.ydoc.getMap('rays')
    this.yFaces = this.ydoc.getMap('faces')
    this.serverUrls = CollabManager.resolveServerUrls()
    this.setupObservers()
  }

  private static normalizeServerUrl(url: string) {
    // y-websocket 只接受 ws / wss，这里把 http / https 也规范成对应协议。
    return url
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://')
      .replace(/\/+$/, '')
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
    const timeoutMs = 3_000
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
    if (this.liveSyncTimer) {
      window.clearTimeout(this.liveSyncTimer)
      this.liveSyncTimer = null
    }
    this.syncPending = false
    this.liveSyncPending = false
    this.clearDirtyState()

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
    provider.awareness.setLocalStateField('online', true)

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
      straightLines: [...this.scene.straightLines.values()],
      rays: [...this.scene.rays.values()],
      faces: [...this.scene.faces.values()],
    }
  }

  private clearLocalSceneForJoin() {
    this.scene.lines.clear()
    this.scene.straightLines.clear()
    this.scene.rays.clear()
    this.scene.faces.clear()
    this.scene.points.forEach((point, id) => {
      if (!point.locked) this.scene.points.delete(id)
    })
    this.scene.constraints.length = 0
    this.scene.selection.clear()
  }

  private restoreLocalSnapshot(snapshot: LocalSceneSnapshot) {
    snapshot.points.forEach((point) => this.scene.addPoint(point))
    snapshot.lines.forEach((line) => this.scene.addLine(line))
    snapshot.straightLines.forEach((line) => this.scene.addStraightLine(line))
    snapshot.rays.forEach((ray) => this.scene.addRay(ray))
    snapshot.faces.forEach((face) => this.scene.addFace(face))
  }

  private clearDirtyState() {
    this.dirtyPointIds.clear()
    this.dirtyLineIds.clear()
    this.dirtyStraightLineIds.clear()
    this.dirtyRayIds.clear()
    this.dirtyFaceIds.clear()
    this.deletedPointIds.clear()
    this.deletedLineIds.clear()
    this.deletedStraightLineIds.clear()
    this.deletedRayIds.clear()
    this.deletedFaceIds.clear()
  }

  private markPointDirty(id: string) {
    this.deletedPointIds.delete(id)
    this.dirtyPointIds.add(id)
  }

  private markLineDirty(id: string) {
    this.deletedLineIds.delete(id)
    this.dirtyLineIds.add(id)
  }

  private markRayDirty(id: string) {
    this.deletedRayIds.delete(id)
    this.dirtyRayIds.add(id)
  }

  private markStraightLineDirty(id: string) {
    this.deletedStraightLineIds.delete(id)
    this.dirtyStraightLineIds.add(id)
  }

  private markFaceDirty(id: string) {
    this.deletedFaceIds.delete(id)
    this.dirtyFaceIds.add(id)
  }

  private markPointDeleted(id: string) {
    this.dirtyPointIds.delete(id)
    this.deletedPointIds.add(id)
  }

  private markLineDeleted(id: string) {
    this.dirtyLineIds.delete(id)
    this.deletedLineIds.add(id)
  }

  private markRayDeleted(id: string) {
    this.dirtyRayIds.delete(id)
    this.deletedRayIds.add(id)
  }

  private markStraightLineDeleted(id: string) {
    this.dirtyStraightLineIds.delete(id)
    this.deletedStraightLineIds.add(id)
  }

  private markFaceDeleted(id: string) {
    this.dirtyFaceIds.delete(id)
    this.deletedFaceIds.add(id)
  }

  private markLinkedGeometryDirtyForPoint(pointId: string) {
    this.scene.lines.forEach((line, id) => {
      if (line.p1.id === pointId || line.p2.id === pointId) this.markLineDirty(id)
    })
    this.scene.rays.forEach((ray, id) => {
      if (ray.p1.id === pointId || ray.p2.id === pointId) this.markRayDirty(id)
    })
    this.scene.straightLines.forEach((line, id) => {
      if (line.p1.id === pointId || line.p2.id === pointId) this.markStraightLineDirty(id)
    })
    this.scene.faces.forEach((face, id) => {
      if (face.includesPoint(pointId)) this.markFaceDirty(id)
    })
  }

  markSceneDirty() {
    this.scene.points.forEach((point, id) => {
      if (!point.locked) this.markPointDirty(id)
    })
    this.scene.lines.forEach((_, id) => this.markLineDirty(id))
    this.scene.straightLines.forEach((_, id) => this.markStraightLineDirty(id))
    this.scene.rays.forEach((_, id) => this.markRayDirty(id))
    this.scene.faces.forEach((_, id) => this.markFaceDirty(id))

    for (const id of [...this.yPoints.keys()]) {
      if (!this.scene.points.has(id) && id !== Scene.ORIGIN_ID) this.markPointDeleted(id)
    }
    for (const id of [...this.yLines.keys()]) {
      if (!this.scene.lines.has(id)) this.markLineDeleted(id)
    }
    for (const id of [...this.yStraightLines.keys()]) {
      if (!this.scene.straightLines.has(id)) this.markStraightLineDeleted(id)
    }
    for (const id of [...this.yRays.keys()]) {
      if (!this.scene.rays.has(id)) this.markRayDeleted(id)
    }
    for (const id of [...this.yFaces.keys()]) {
      if (!this.scene.faces.has(id)) this.markFaceDeleted(id)
    }
  }

  markPreviewPointsDirty(pointIds: Iterable<string>) {
    for (const id of pointIds) {
      const point = this.scene.points.get(id)
      if (!point || point.locked) continue
      this.markPointDirty(id)
      this.markLinkedGeometryDirtyForPoint(id)
    }
  }

  private roomHasSharedGeometry() {
    return (
      [...this.yPoints.keys()].some((id) => id !== Scene.ORIGIN_ID) ||
      this.yLines.size > 0 ||
      this.yStraightLines.size > 0 ||
      this.yRays.size > 0 ||
      this.yFaces.size > 0
    )
  }

  private reconcileInitialScene(localSnapshot: LocalSceneSnapshot) {
    if (this.roomHasSharedGeometry()) return
    if (
      localSnapshot.points.length === 0 &&
      localSnapshot.lines.length === 0 &&
      localSnapshot.straightLines.length === 0 &&
      localSnapshot.rays.length === 0 &&
      localSnapshot.faces.length === 0
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
    if (this.straightLinesObserver) this.yStraightLines.unobserve(this.straightLinesObserver)
    if (this.raysObserver) this.yRays.unobserve(this.raysObserver)
    if (this.facesObserver) this.yFaces.unobserve(this.facesObserver)

    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap('points')
    this.yLines = this.ydoc.getMap('lines')
    this.yStraightLines = this.ydoc.getMap('straightLines')
    this.yRays = this.ydoc.getMap('rays')
    this.yFaces = this.ydoc.getMap('faces')
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

          this.scene.faces.forEach((face, faceId) => {
            if (face.includesPoint(id)) {
              this.scene.removeFace(faceId)
            }
          })
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
          this.scene.straightLines.forEach((line, lineId) => {
            if (line.p1.id === id || line.p2.id === id) {
              this.scene.straightLines.delete(lineId)
              this.scene.selection.straightLines.delete(lineId)
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

    this.straightLinesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yStraightLines.get(id)
          if (!data) return
          const p1 = this.scene.points.get(data.p1Id)
          const p2 = this.scene.points.get(data.p2Id)
          if (!p1 || !p2) return

          const line = this.scene.straightLines.get(id)
          if (line) {
            line.name = data.name ?? line.name
            line.nameVisible = data.nameVisible ?? line.nameVisible
            line.visible = data.visible ?? line.visible
            line.userLocked = data.userLocked ?? line.userLocked
            line.displayLength =
              typeof data.displayLength === 'number'
                ? StraightLine3.normalizeDisplayLength(data.displayLength)
                : line.displayLength
            line.p1 = p1
            line.p2 = p2
          } else {
            this.scene.addStraightLine(
              new StraightLine3(
                id,
                data.name ?? '',
                p1,
                p2,
                data.nameVisible ?? true,
                data.visible ?? true,
                StraightLine3.normalizeDisplayLength(
                  data.displayLength ?? StraightLine3.DEFAULT_DISPLAY_LENGTH,
                ),
                data.userLocked ?? false,
              ),
            )
          }
        } else if (change.action === 'delete') {
          this.scene.straightLines.delete(id)
          this.scene.selection.straightLines.delete(id)
        }
      })
    }
    this.yStraightLines.observe(this.straightLinesObserver)

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

    this.facesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'add' || change.action === 'update') {
          const data = this.yFaces.get(id)
          if (!data) return
          const allPointIds = [...new Set([...data.boundaryPointIds, ...data.memberPointIds])]
          if (allPointIds.some((pointId) => !this.scene.points.has(pointId))) return

          const face = this.scene.faces.get(id)
          if (face) {
            face.name = data.name ?? face.name
            face.nameVisible = data.nameVisible ?? face.nameVisible
            face.visible = data.visible ?? face.visible
            face.userLocked = data.userLocked ?? face.userLocked
            face.boundaryPointIds = [...data.boundaryPointIds]
            face.memberPointIds = [...data.memberPointIds]
            face.boundaryLineIds = [...data.boundaryLineIds]
            face.supportPointIds = [...data.supportPointIds]
            face.normalize(this.scene.points)
          } else {
            this.scene.addFace(
              new PlanarFace(
                id,
                data.name ?? '',
                [...data.boundaryPointIds],
                [...data.memberPointIds],
                [...data.boundaryLineIds],
                data.nameVisible ?? true,
                data.visible ?? true,
                data.userLocked ?? false,
                [...data.supportPointIds],
              ),
            )
          }
        } else if (change.action === 'delete') {
          this.scene.removeFace(id)
        }
      })
    }
    this.yFaces.observe(this.facesObserver)
  }

  syncAction() {
    if (!this.provider || !this.connected) return

    this.markSceneDirty()
    this.syncPending = true
    if (this.syncTimer) return

    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null
      if (!this.syncPending) return
      this.syncPending = false
      this.syncNow()
    }, 50)
  }

  syncLivePreview(pointIds: Iterable<string>) {
    if (!this.provider || !this.connected) return

    this.markPreviewPointsDirty(pointIds)
    this.liveSyncPending = true
    if (this.liveSyncTimer) return

    this.liveSyncTimer = window.setTimeout(() => {
      this.liveSyncTimer = null
      if (!this.liveSyncPending) return
      this.liveSyncPending = false
      this.syncDirtyNow()
    }, CollabManager.LIVE_SYNC_THROTTLE_MS)
  }

  private syncNow() {
    if (!this.provider || !this.connected) return

    this.markSceneDirty()
    this.syncDirtyNow()
  }

  private syncDirtyNow() {
    if (!this.provider || !this.connected) return

    const pointIds = [...this.dirtyPointIds]
    const lineIds = [...this.dirtyLineIds]
    const straightLineIds = [...this.dirtyStraightLineIds]
    const rayIds = [...this.dirtyRayIds]
    const faceIds = [...this.dirtyFaceIds]
    const deletedPointIds = [...this.deletedPointIds]
    const deletedLineIds = [...this.deletedLineIds]
    const deletedStraightLineIds = [...this.deletedStraightLineIds]
    const deletedRayIds = [...this.deletedRayIds]
    const deletedFaceIds = [...this.deletedFaceIds]

    if (
      pointIds.length === 0 &&
      lineIds.length === 0 &&
      straightLineIds.length === 0 &&
      rayIds.length === 0 &&
      faceIds.length === 0 &&
      deletedPointIds.length === 0 &&
      deletedLineIds.length === 0 &&
      deletedStraightLineIds.length === 0 &&
      deletedRayIds.length === 0 &&
      deletedFaceIds.length === 0
    ) {
      return
    }

    this.ydoc.transact(() => {
      deletedPointIds.forEach((id) => {
        if (id !== Scene.ORIGIN_ID) this.yPoints.delete(id)
      })
      deletedLineIds.forEach((id) => {
        this.yLines.delete(id)
      })
      deletedStraightLineIds.forEach((id) => {
        this.yStraightLines.delete(id)
      })
      deletedRayIds.forEach((id) => {
        this.yRays.delete(id)
      })
      deletedFaceIds.forEach((id) => {
        this.yFaces.delete(id)
      })

      pointIds.forEach((id) => {
        const p = this.scene.points.get(id)
        if (!p) {
          if (id !== Scene.ORIGIN_ID) this.yPoints.delete(id)
          return
        }
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

      lineIds.forEach((id) => {
        const l = this.scene.lines.get(id)
        if (!l) {
          this.yLines.delete(id)
          return
        }
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

      straightLineIds.forEach((id) => {
        const line = this.scene.straightLines.get(id)
        if (!line) {
          this.yStraightLines.delete(id)
          return
        }
        const next = {
          p1Id: line.p1.id,
          p2Id: line.p2.id,
          name: line.name,
          nameVisible: line.nameVisible,
          visible: line.visible,
          displayLength: line.displayLength,
          userLocked: line.userLocked,
        }
        const prev = this.yStraightLines.get(id)
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
          this.yStraightLines.set(id, next)
        }
      })

      rayIds.forEach((id) => {
        const ray = this.scene.rays.get(id)
        if (!ray) {
          this.yRays.delete(id)
          return
        }
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

      faceIds.forEach((id) => {
        const face = this.scene.faces.get(id)
        if (!face) {
          this.yFaces.delete(id)
          return
        }
        const next = {
          name: face.name,
          nameVisible: face.nameVisible,
          visible: face.visible,
          userLocked: face.userLocked,
          boundaryPointIds: [...face.boundaryPointIds],
          memberPointIds: [...face.memberPointIds],
          boundaryLineIds: [...face.boundaryLineIds],
          supportPointIds: [...face.supportPointIds],
        }
        const prev = this.yFaces.get(id)
        if (
          !prev ||
          JSON.stringify(prev.boundaryPointIds) !== JSON.stringify(next.boundaryPointIds) ||
          JSON.stringify(prev.memberPointIds) !== JSON.stringify(next.memberPointIds) ||
          JSON.stringify(prev.boundaryLineIds) !== JSON.stringify(next.boundaryLineIds) ||
          JSON.stringify(prev.supportPointIds) !== JSON.stringify(next.supportPointIds) ||
          prev.name !== next.name ||
          prev.nameVisible !== next.nameVisible ||
          prev.visible !== next.visible ||
          prev.userLocked !== next.userLocked
        ) {
          this.yFaces.set(id, next)
        }
      })
    })

    pointIds.forEach((id) => this.dirtyPointIds.delete(id))
    lineIds.forEach((id) => this.dirtyLineIds.delete(id))
    straightLineIds.forEach((id) => this.dirtyStraightLineIds.delete(id))
    rayIds.forEach((id) => this.dirtyRayIds.delete(id))
    faceIds.forEach((id) => this.dirtyFaceIds.delete(id))
    deletedPointIds.forEach((id) => this.deletedPointIds.delete(id))
    deletedLineIds.forEach((id) => this.deletedLineIds.delete(id))
    deletedStraightLineIds.forEach((id) => this.deletedStraightLineIds.delete(id))
    deletedRayIds.forEach((id) => this.deletedRayIds.delete(id))
    deletedFaceIds.forEach((id) => this.deletedFaceIds.delete(id))
  }
}
