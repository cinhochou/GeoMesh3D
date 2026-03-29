// src/core/collab/CollabManager.ts
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
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

type SignalingConnLike = {
  connected: boolean
  connecting: boolean
  on: (event: 'connect' | 'disconnect', listener: () => void) => void
  off: (event: 'connect' | 'disconnect', listener: () => void) => void
}

export class CollabManager {
  private ydoc: Y.Doc
  private provider: WebrtcProvider | null = null
  private yPoints: Y.Map<any>
  private yLines: Y.Map<any>
  private yRays: Y.Map<any>
  private pointsObserver: ((event: Y.YMapEvent<any>) => void) | null = null
  private linesObserver: ((event: Y.YMapEvent<any>) => void) | null = null
  private raysObserver: ((event: Y.YMapEvent<any>) => void) | null = null

  private roomName: string | null = null
  private connecting = false
  private connected = false

  private syncTimer: number | null = null
  private syncPending = false
  private signalingCleanup: Array<() => void> = []

  public onPeersUpdate: (count: number) => void = () => {}
  public onStatusUpdate: (status: CollabStatus) => void = () => {}

  constructor(private scene: Scene) {
    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap('points')
    this.yLines = this.ydoc.getMap('lines')
    this.yRays = this.ydoc.getMap('rays')
    this.setupObservers()
  }

  getStatus(): CollabStatus {
    return {
      room: this.roomName,
      connecting: this.connecting,
      connected: this.connected,
    }
  }

  async joinRoom(roomName: string) {
    if (!roomName.trim()) throw new Error('roomName is empty')

    const localSnapshot = this.captureLocalSnapshot()
    this.leaveRoom()
    this.resetDoc()
    this.clearLocalSceneForJoin()

    this.roomName = roomName
    this.connecting = true
    this.connected = false
    this.emitStatus()

    console.log(`joining room: ${roomName}`)

    //npx y-webrtc-signaling命令部署本地信令服务器，公网部署地址：'wss://electrokinetic-shawanna-unstrewn.ngrok-free.dev/'
    this.provider = new WebrtcProvider(roomName, this.ydoc, {
      signaling: ['ws://localhost:4444/'],
    })

    this.provider.on('peers', (params: any) => {
      const count = params.webrtcPeers ? params.webrtcPeers.length + 1 : 1
      this.onPeersUpdate(count)
    })

    const provider = this.provider
    const timeoutMs = 10_000

    try {
      this.bindSignalingStatus(provider)
      await this.waitForInitialRoomState(provider, roomName, timeoutMs)
      this.reconcileInitialScene(localSnapshot)
    } catch (err) {
      this.leaveRoom()
      this.restoreLocalSnapshot(localSnapshot)
      throw err
    }
  }

  leaveRoom() {
    this.clearSignalingBindings()

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

  private getSignalingConnections(provider: WebrtcProvider): SignalingConnLike[] {
    return ((provider as any).signalingConns ?? []) as SignalingConnLike[]
  }

  private hasConnectedSignaling(provider: WebrtcProvider) {
    return this.getSignalingConnections(provider).some((conn) => conn.connected)
  }

  private updateConnectionStateFromProvider(provider: WebrtcProvider) {
    const hasConnectedSignaling = this.hasConnectedSignaling(provider)
    this.connected = hasConnectedSignaling
    this.connecting = this.roomName !== null && !hasConnectedSignaling
    this.emitStatus()
  }

  private clearSignalingBindings() {
    this.signalingCleanup.forEach((cleanup) => cleanup())
    this.signalingCleanup = []
  }

  private bindSignalingStatus(provider: WebrtcProvider) {
    this.clearSignalingBindings()

    const syncStatus = () => {
      this.updateConnectionStateFromProvider(provider)
    }

    this.getSignalingConnections(provider).forEach((conn) => {
      const handleConnect = () => syncStatus()
      const handleDisconnect = () => syncStatus()
      conn.on('connect', handleConnect)
      conn.on('disconnect', handleDisconnect)
      this.signalingCleanup.push(() => {
        conn.off('connect', handleConnect)
        conn.off('disconnect', handleDisconnect)
      })
    })

    syncStatus()
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

  private waitForInitialRoomState(provider: WebrtcProvider, roomName: string, timeoutMs: number) {
    const settleMs = 600

    return new Promise<void>((resolve, reject) => {
      let done = false
      let settleTimer: number | null = null

      const cleanup = () => {
        provider.off('synced', handleSynced)
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
        if (settleTimer !== null) return
        settleTimer = window.setTimeout(() => {
          finish()
        }, settleMs)
      }

      const timeoutTimer = window.setTimeout(() => {
        fail(new Error(`connect timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      const handleSynced = ({ synced }: { synced: boolean }) => {
        if (synced) finish()
      }

      provider.on('synced', handleSynced)
      console.log(`collab room: ${roomName}, waiting for signaling server connection...`)

      const waitForSignal = () => {
        if (done) return
        if (this.hasConnectedSignaling(provider)) {
          console.log(`collab room: ${roomName}, signaling server connected`)
          scheduleSettle()
          return
        }
        window.setTimeout(waitForSignal, 100)
      }

      waitForSignal()
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
