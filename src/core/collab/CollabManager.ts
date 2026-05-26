// src/core/collab/CollabManager.ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { Scene } from '../scene/Scene'
import { Point3, type ConstrainedToRef } from '../geometry/Point3'
import { Line3, type FaceConstraintType } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { GeoVector3 } from '../geometry/GeoVector3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { Circle3, type CircleType, type DirectionType } from '../geometry/Circle3'
import { Sphere3 } from '../geometry/Sphere3'
import { Cone3, type ConeType } from '../geometry/Cone3'
import { Cylinder3, type CylinderType } from '../geometry/Cylinder3'
import { CylinderConstraint } from '../constraints/CylinderConstraint'
import { ObjectConstrainedPointConstraint, type ParametricData } from '../constraints/ObjectConstrainedPointConstraint'
import { PlanarPolygon } from '../geometry/PlanarPolygon'
import { Vec3 } from '../geometry/Vec3'
import { CubeConstraint } from '../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../constraints/RegularPolygonConstraint'
import { IntersectionPointConstraint } from '../constraints/IntersectionPointConstraint'
import {
  canCreateIntersectionFromTargets,
  isIntersectionTargetType,
  type IntersectionTargetRef,
} from '../geometry/IntersectionPoint3'

export type CollabStatus = {
  room: string | null
  connecting: boolean
  connected: boolean
}

type LiveLabelTarget = {
  type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'sphere' | 'cone' | 'cylinder' | 'face'
  geoId: string
}

type LocalSceneSnapshot = {
  points: Point3[]
  lines: Line3[]
  straightLines: StraightLine3[]
  rays: Ray3[]
  vectors: GeoVector3[]
  circles: Circle3[]
  spheres: Sphere3[]
  cones: Cone3[]
  cylinders: Cylinder3[]
  faces: PlanarPolygon[]
  intersections: IntersectionPointConstraint[]
  cubes: CubeConstraint[]
  regularPolygons: RegularPolygonConstraint[]
  cylinderConstraints: CylinderConstraint[]
  objectConstrainedPoints: ObjectConstrainedPointConstraint[]
}

type PointSharedMap = Y.Map<string | number | boolean>
type LineSharedMap = Y.Map<string | number | boolean>
type StraightLineSharedMap = Y.Map<string | number | boolean>
type RaySharedMap = Y.Map<string | number | boolean>
type VectorSharedMap = Y.Map<string | number | boolean>
type CircleSharedMap = Y.Map<string | number | boolean>
type SphereSharedMap = Y.Map<string | number | boolean>
type ConeSharedMap = Y.Map<string | number | boolean>
type CylinderSharedMap = Y.Map<string | number | boolean>
type IntersectionSharedMap = Y.Map<string>
type ObjectConstrainedPointSharedMap = Y.Map<string | number | boolean>
type FaceSharedArrayValue = string | number | null
type FaceSharedMapValue = string | number | boolean | Y.Array<FaceSharedArrayValue>
type FaceSharedMap = Y.Map<FaceSharedMapValue>
type CubeSharedMap = Y.Map<string | number | boolean>
type RegularPolygonSharedMap = Y.Map<string | number | boolean>
type WorldTransformSharedMap = Y.Map<string | number | boolean>

export type SharedWorldRotationState = {
  quaternion: {
    x: number
    y: number
    z: number
    w: number
  }
  ownerClientId: number | null
  ownerUpdatedAt: number | null
  ownerName: string | null
  isOwnedByLocal: boolean
}

export class CollabManager {
  private static readonly LIVE_SYNC_THROTTLE_MS = 33
  private static readonly WORLD_ROTATION_OWNER_TIMEOUT_MS = 1500
  private static readonly WORLD_ROTATION_OWNER_HEARTBEAT_MS = 500
  private static readonly LATENCY_SAMPLE_INTERVAL_MS = 2000
  // 本地 websocket 服务不可用时，回退到这个公网协作地址。
  private static readonly FALLBACK_SERVER_URL = 'wss://kraig-scarabaeiform-zealously.ngrok-free.dev'

  private ydoc: Y.Doc
  private provider: WebsocketProvider | null = null
  private yPoints: Y.Map<PointSharedMap>
  private yLines: Y.Map<LineSharedMap>
  private yStraightLines: Y.Map<StraightLineSharedMap>
  private yRays: Y.Map<RaySharedMap>
  private yVectors: Y.Map<VectorSharedMap>
  private yCircles: Y.Map<CircleSharedMap>
  private ySpheres: Y.Map<SphereSharedMap>
  private yCones: Y.Map<ConeSharedMap>
  private yCylinders: Y.Map<CylinderSharedMap>
  private yIntersections: Y.Map<IntersectionSharedMap>
  private yObjectConstrainedPoints: Y.Map<ObjectConstrainedPointSharedMap>
  private yFaces: Y.Map<FaceSharedMap>
  private yCubes: Y.Map<CubeSharedMap>
  private yRegularPolygons: Y.Map<RegularPolygonSharedMap>
  private yWorldTransform: WorldTransformSharedMap
  private pointsObserver: ((event: Y.YMapEvent<PointSharedMap>) => void) | null = null
  private linesObserver: ((event: Y.YMapEvent<LineSharedMap>) => void) | null = null
  private straightLinesObserver: ((event: Y.YMapEvent<StraightLineSharedMap>) => void) | null = null
  private raysObserver: ((event: Y.YMapEvent<RaySharedMap>) => void) | null = null
  private vectorsObserver: ((event: Y.YMapEvent<VectorSharedMap>) => void) | null = null
  private circlesObserver: ((event: Y.YMapEvent<CircleSharedMap>) => void) | null = null
  private spheresObserver: ((event: Y.YMapEvent<SphereSharedMap>) => void) | null = null
  private conesObserver: ((event: Y.YMapEvent<ConeSharedMap>) => void) | null = null
  private cylindersObserver: ((event: Y.YMapEvent<CylinderSharedMap>) => void) | null = null
  private intersectionsObserver: ((event: Y.YMapEvent<IntersectionSharedMap>) => void) | null = null
  private objectConstrainedPointsObserver: ((event: Y.YMapEvent<ObjectConstrainedPointSharedMap>) => void) | null = null
  private facesObserver: ((event: Y.YMapEvent<FaceSharedMap>) => void) | null = null
  private cubesObserver: ((event: Y.YMapEvent<CubeSharedMap>) => void) | null = null
  private regularPolygonsObserver: ((event: Y.YMapEvent<RegularPolygonSharedMap>) => void) | null = null
  private worldTransformObserver: ((event: Y.YMapEvent<string | number | boolean>) => void) | null = null
  private readonly pointRecordCleanup = new Map<string, () => void>()
  private readonly lineRecordCleanup = new Map<string, () => void>()
  private readonly straightLineRecordCleanup = new Map<string, () => void>()
  private readonly rayRecordCleanup = new Map<string, () => void>()
  private readonly vectorRecordCleanup = new Map<string, () => void>()
  private readonly circleRecordCleanup = new Map<string, () => void>()
  private readonly sphereRecordCleanup = new Map<string, () => void>()
  private readonly coneRecordCleanup = new Map<string, () => void>()
  private readonly cylinderRecordCleanup = new Map<string, () => void>()
  private readonly intersectionRecordCleanup = new Map<string, () => void>()
  private readonly objectConstrainedPointRecordCleanup = new Map<string, () => void>()
  private readonly faceRecordCleanup = new Map<string, () => void>()
  private readonly cubeRecordCleanup = new Map<string, () => void>()
  private readonly regularPolygonRecordCleanup = new Map<string, () => void>()

  private roomName: string | null = null
  private connecting = false
  private connected = false
  private latencyMs: number | null = null

  private syncTimer: number | null = null
  private syncPending = false
  private liveSyncTimer: number | null = null
  private liveSyncPending = false
  private latencyTimer: number | null = null
  private readonly latencySamples = new Map<string, number>()
  private providerCleanup: Array<() => void> = []
  private readonly serverUrls: string[]
  private localUserLabel: string | null = null
  private worldRotationOwnerHeartbeatTimer: number | null = null
  private readonly dirtyPointIds = new Set<string>()
  private readonly dirtyLineIds = new Set<string>()
  private readonly dirtyStraightLineIds = new Set<string>()
  private readonly dirtyRayIds = new Set<string>()
  private readonly dirtyVectorIds = new Set<string>()
  private readonly dirtyCircleIds = new Set<string>()
  private readonly dirtySphereIds = new Set<string>()
  private readonly dirtyConeIds = new Set<string>()
  private readonly dirtyCylinderIds = new Set<string>()
  private readonly dirtyIntersectionIds = new Set<string>()
  private readonly dirtyObjectConstrainedPointIds = new Set<string>()
  private readonly dirtyFaceIds = new Set<string>()
  private readonly dirtyCubeIds = new Set<string>()
  private readonly dirtyRegularPolygonIds = new Set<string>()
  private readonly deletedPointIds = new Set<string>()
  private readonly deletedLineIds = new Set<string>()
  private readonly deletedStraightLineIds = new Set<string>()
  private readonly deletedRayIds = new Set<string>()
  private readonly deletedVectorIds = new Set<string>()
  private readonly deletedCircleIds = new Set<string>()
  private readonly deletedSphereIds = new Set<string>()
  private readonly deletedConeIds = new Set<string>()
  private readonly deletedCylinderIds = new Set<string>()
  private readonly deletedIntersectionIds = new Set<string>()
  private readonly deletedObjectConstrainedPointIds = new Set<string>()
  private readonly deletedFaceIds = new Set<string>()
  private readonly deletedCubeIds = new Set<string>()
  private readonly deletedRegularPolygonIds = new Set<string>()

  public onPeersUpdate: (count: number) => void = () => {}
  public onStatusUpdate: (status: CollabStatus) => void = () => {}
  public onLatencyUpdate: (latencyMs: number | null) => void = () => {}
  public onSharedWorldRotationUpdate: (state: SharedWorldRotationState) => void = () => {}

  constructor(private scene: Scene) {
    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap<PointSharedMap>('points')
    this.yLines = this.ydoc.getMap<LineSharedMap>('lines')
    this.yStraightLines = this.ydoc.getMap<StraightLineSharedMap>('straightLines')
    this.yRays = this.ydoc.getMap<RaySharedMap>('rays')
    this.yVectors = this.ydoc.getMap<VectorSharedMap>('vectors')
    this.yCircles = this.ydoc.getMap<CircleSharedMap>('circles')
    this.ySpheres = this.ydoc.getMap<SphereSharedMap>('spheres')
    this.yCones = this.ydoc.getMap<ConeSharedMap>('cones')
    this.yCylinders = this.ydoc.getMap<CylinderSharedMap>('cylinders')
    this.yIntersections = this.ydoc.getMap<IntersectionSharedMap>('intersections')
    this.yObjectConstrainedPoints = this.ydoc.getMap<ObjectConstrainedPointSharedMap>('objectConstrainedPoints')
    this.yFaces = this.ydoc.getMap<FaceSharedMap>('faces')
    this.yCubes = this.ydoc.getMap<CubeSharedMap>('cubes')
    this.yRegularPolygons = this.ydoc.getMap<RegularPolygonSharedMap>('regularPolygons')
    this.yWorldTransform = this.ydoc.getMap<string | number | boolean>('worldTransform')
    this.serverUrls = CollabManager.resolveServerUrls()
    this.setupObservers()
  }

  private cleanupRecordObservers(cleanups: Map<string, () => void>) {
    cleanups.forEach((cleanup) => cleanup())
    cleanups.clear()
  }

  private cleanupAllRecordObservers() {
    this.cleanupRecordObservers(this.pointRecordCleanup)
    this.cleanupRecordObservers(this.lineRecordCleanup)
    this.cleanupRecordObservers(this.straightLineRecordCleanup)
    this.cleanupRecordObservers(this.rayRecordCleanup)
    this.cleanupRecordObservers(this.vectorRecordCleanup)
    this.cleanupRecordObservers(this.circleRecordCleanup)
    this.cleanupRecordObservers(this.sphereRecordCleanup)
    this.cleanupRecordObservers(this.coneRecordCleanup)
    this.cleanupRecordObservers(this.cylinderRecordCleanup)
    this.cleanupRecordObservers(this.intersectionRecordCleanup)
    this.cleanupRecordObservers(this.objectConstrainedPointRecordCleanup)
    this.cleanupRecordObservers(this.faceRecordCleanup)
    this.cleanupRecordObservers(this.cubeRecordCleanup)
    this.cleanupRecordObservers(this.regularPolygonRecordCleanup)
  }

  private readString<T>(record: Y.Map<T>, key: string, fallback: string) {
    const value = record.get(key)
    return typeof value === 'string' ? value : fallback
  }

  private readNumber<T>(record: Y.Map<T>, key: string, fallback: number) {
    const value = record.get(key)
    return typeof value === 'number' ? value : fallback
  }

  private readBoolean<T>(record: Y.Map<T>, key: string, fallback: boolean) {
    const value = record.get(key)
    return typeof value === 'boolean' ? value : fallback
  }

  private readNullableString<T>(record: Y.Map<T>, key: string) {
    const value = record.get(key)
    return typeof value === 'string' ? value : null
  }

  private readNullableNumber<T>(record: Y.Map<T>, key: string) {
    const value = record.get(key)
    return typeof value === 'number' ? value : null
  }

  private readStringArray(record: FaceSharedMap, key: string) {
    const value = record.get(key)
    if (!(value instanceof Y.Array)) return []
    return value.toArray().filter((item): item is string => typeof item === 'string')
  }

  private readNullableNumberArray(record: FaceSharedMap, key: string) {
    const value = record.get(key)
    if (!(value instanceof Y.Array)) return []
    return value
      .toArray()
      .filter((item): item is number | null => item === null || typeof item === 'number')
  }

  private setScalarField<T>(record: Y.Map<T>, key: string, value: T) {
    if (record.get(key) !== value) record.set(key, value)
  }

  private setNullableScalarField<T>(record: Y.Map<T>, key: string, value: T | null) {
    if (value === null) {
      if (record.has(key)) record.delete(key)
      return
    }
    if (record.get(key) !== value) record.set(key, value)
  }

  private readJsonStringArray<T>(record: Y.Map<T>, key: string) {
    const raw = record.get(key)
    if (typeof raw !== 'string') return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
    } catch {
      return []
    }
  }

  private readJsonCubeLayouts<T>(record: Y.Map<T>, key: string) {
    const raw = record.get(key)
    if (typeof raw !== 'string') return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter(
            (
              item,
            ): item is {
              pointId: string
              x: number
              y: number
              z: number
            } =>
              typeof item?.pointId === 'string' &&
              typeof item?.x === 'number' &&
              typeof item?.y === 'number' &&
              typeof item?.z === 'number',
          )
        : []
    } catch {
      return []
    }
  }

  private readJsonRegularPolygonLayouts<T>(record: Y.Map<T>, key: string) {
    const raw = record.get(key)
    if (typeof raw !== 'string') return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter(
            (
              item,
            ): item is {
              pointId: string
              angleIndex: number
            } =>
              typeof item?.pointId === 'string' &&
              typeof item?.angleIndex === 'number',
          )
        : []
    } catch {
      return []
    }
  }

  private getLocalClientId() {
    return this.ydoc.clientID
  }

  private getSharedWorldTransformRecord() {
    return this.yWorldTransform
  }

  private readSharedWorldRotationState(record: WorldTransformSharedMap | null = null): SharedWorldRotationState {
    const source = record ?? this.yWorldTransform ?? null
    const ownerClientId = source ? this.readNullableNumber(source, 'ownerClientId') : null
    return {
      quaternion: {
        x: source ? this.readNumber(source, 'qx', 0) : 0,
        y: source ? this.readNumber(source, 'qy', 0) : 0,
        z: source ? this.readNumber(source, 'qz', 0) : 0,
        w: source ? this.readNumber(source, 'qw', 1) : 1,
      },
      ownerClientId,
      ownerUpdatedAt: source ? this.readNullableNumber(source, 'ownerUpdatedAt') : null,
      ownerName: source ? this.readNullableString(source, 'ownerName') : null,
      isOwnedByLocal: ownerClientId === this.getLocalClientId(),
    }
  }

  private emitSharedWorldRotation(record: WorldTransformSharedMap | null = null) {
    this.onSharedWorldRotationUpdate(this.readSharedWorldRotationState(record))
  }

  setLocalUserLabel(label: string | null) {
    const nextLabel = label?.trim() || null
    this.localUserLabel = nextLabel
    if (this.provider) {
      this.provider.awareness.setLocalStateField('userLabel', nextLabel)
    }
  }

  private stopWorldRotationOwnerHeartbeat() {
    if (this.worldRotationOwnerHeartbeatTimer !== null) {
      window.clearInterval(this.worldRotationOwnerHeartbeatTimer)
      this.worldRotationOwnerHeartbeatTimer = null
    }
  }

  private writeWorldRotationOwnerHeartbeat(record: WorldTransformSharedMap) {
    this.setScalarField(record, 'ownerClientId', this.getLocalClientId())
    this.setScalarField(record, 'ownerUpdatedAt', Date.now())
    this.setNullableScalarField(record, 'ownerName', this.localUserLabel)
  }

  private ensureWorldRotationOwnerHeartbeat() {
    if (this.worldRotationOwnerHeartbeatTimer !== null) return
    this.worldRotationOwnerHeartbeatTimer = window.setInterval(() => {
      if (!this.provider || this.roomName === null) {
        this.stopWorldRotationOwnerHeartbeat()
        return
      }
      const state = this.readSharedWorldRotationState()
      if (state.ownerClientId !== this.getLocalClientId()) {
        this.stopWorldRotationOwnerHeartbeat()
        return
      }
      const record = this.getSharedWorldTransformRecord()
      this.ydoc.transact(() => {
        this.writeWorldRotationOwnerHeartbeat(record)
      })
    }, CollabManager.WORLD_ROTATION_OWNER_HEARTBEAT_MS)
  }

  private syncFaceArrayField(record: FaceSharedMap, key: string, values: FaceSharedArrayValue[]) {
    let shared = record.get(key)
    if (!(shared instanceof Y.Array)) {
      shared = new Y.Array<FaceSharedArrayValue>()
      record.set(key, shared)
    }

    const current = shared.toArray()
    if (
      current.length === values.length &&
      current.every((value, index) => value === values[index])
    ) {
      return
    }

    if (shared.length > 0) shared.delete(0, shared.length)
    if (values.length > 0) shared.insert(0, values)
  }

  private ensurePointRecord(id: string) {
    let record = this.yPoints.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yPoints.set(id, record)
    }
    return record
  }

  private ensureLineRecord(id: string) {
    let record = this.yLines.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yLines.set(id, record)
    }
    return record
  }

  private ensureStraightLineRecord(id: string) {
    let record = this.yStraightLines.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yStraightLines.set(id, record)
    }
    return record
  }

  private ensureRayRecord(id: string) {
    let record = this.yRays.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yRays.set(id, record)
    }
    return record
  }

  private ensureVectorRecord(id: string) {
    let record = this.yVectors.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yVectors.set(id, record)
    }
    return record
  }

  private ensureCircleRecord(id: string) {
    let record = this.yCircles.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yCircles.set(id, record)
    }
    return record
  }

  private ensureSphereRecord(id: string) {
    let record = this.ySpheres.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.ySpheres.set(id, record)
    }
    return record
  }

  private ensureConeRecord(id: string) {
    let record = this.yCones.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yCones.set(id, record)
    }
    return record
  }

  private ensureCylinderRecord(id: string) {
    let record = this.yCylinders.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yCylinders.set(id, record)
    }
    return record
  }

  private ensureIntersectionRecord(id: string) {
    let record = this.yIntersections.get(id)
    if (!record) {
      record = new Y.Map<string>()
      this.yIntersections.set(id, record)
    }
    return record
  }

  private ensureFaceRecord(id: string) {
    let record = this.yFaces.get(id)
    if (!record) {
      record = new Y.Map<FaceSharedMapValue>()
      this.yFaces.set(id, record)
    }
    return record
  }

  private ensureCubeRecord(id: string) {
    let record = this.yCubes.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yCubes.set(id, record)
    }
    return record
  }

  private ensureRegularPolygonRecord(id: string) {
    let record = this.yRegularPolygons.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yRegularPolygons.set(id, record)
    }
    return record
  }

  private ensureObjectConstrainedPointRecord(id: string) {
    let record = this.yObjectConstrainedPoints.get(id)
    if (!record) {
      record = new Y.Map<string | number | boolean>()
      this.yObjectConstrainedPoints.set(id, record)
    }
    return record
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

  getLatencyMs() {
    return this.latencyMs
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
      this.provider = new WebsocketProvider(serverUrl, normalizedRoomName, this.ydoc)

      try {
        const provider = this.provider
        this.bindProviderStatus(provider)
        await this.waitForInitialRoomState(provider, normalizedRoomName, timeoutMs)
        this.reconcileInitialScene(localSnapshot)
        return
      } catch (err) {
        lastError = err
        console.warn(`collab room: ${normalizedRoomName}, failed to connect via ${serverUrl}`, err)
        // 当前地址连接失败后，先完整释放 provider，再尝试下一个备用地址。
        this.clearProviderBindings()
        this.provider.disconnect()
        this.provider.destroy()
        this.provider = null
        this.connected = false
        this.connecting = true
        this.emitStatus()
      }
    }

    this.leaveRoom()
    this.restoreLocalSnapshot(localSnapshot)
    throw lastError instanceof Error ? lastError : new Error('all collaboration servers failed')
  }

  leaveRoom() {
    if (this.provider && this.roomName !== null) {
      this.releaseSharedWorldRotationOwnership()
    }
    this.clearProviderBindings()
    this.stopWorldRotationOwnerHeartbeat()
    this.stopLatencySampling()

    if (this.provider) {
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
    this.setLatencyMs(null)
    this.emitStatus()
    this.onSharedWorldRotationUpdate({
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      ownerClientId: null,
      ownerUpdatedAt: null,
      ownerName: null,
      isOwnedByLocal: false,
    })
  }

  private emitStatus() {
    this.onStatusUpdate(this.getStatus())
  }

  private emitPeerCount(provider: WebsocketProvider | null = this.provider) {
    const count = provider ? Math.max(provider.awareness.getStates().size, 1) : 1
    this.onPeersUpdate(count)
  }

  private setLatencyMs(value: number | null) {
    if (this.latencyMs === value) return
    this.latencyMs = value
    this.onLatencyUpdate(value)
  }

  private updateConnectionStateFromProvider(provider: WebsocketProvider) {
    const isRoomOpen = this.roomName !== null
    this.connected = provider.wsconnected && provider.synced
    this.connecting =
      isRoomOpen && (provider.wsconnecting || (provider.wsconnected && !provider.synced))
    if (this.connected) {
      this.startLatencySampling(provider)
    } else {
      this.stopLatencySampling()
    }
    this.emitStatus()
  }

  private clearProviderBindings() {
    this.providerCleanup.forEach((cleanup) => cleanup())
    this.providerCleanup = []
  }

  private startLatencySampling(provider: WebsocketProvider) {
    if (this.latencyTimer !== null) return
    this.sendLatencyPing(provider)
    this.latencyTimer = window.setInterval(() => {
      this.sendLatencyPing(provider)
    }, CollabManager.LATENCY_SAMPLE_INTERVAL_MS)
  }

  private stopLatencySampling() {
    if (this.latencyTimer !== null) {
      window.clearInterval(this.latencyTimer)
      this.latencyTimer = null
    }
    this.latencySamples.clear()
    this.setLatencyMs(null)
  }

  private sendLatencyPing(provider: WebsocketProvider) {
    if (this.roomName === null || !provider.synced) return
    const id = `${this.getLocalClientId()}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.latencySamples.set(id, performance.now())
    provider.awareness.setLocalStateField('latencyPing', {
      id,
      senderClientId: this.getLocalClientId(),
      sentAt: Date.now(),
    })
  }

  private clearLatencyAwareness(provider: WebsocketProvider) {
    provider.awareness.setLocalStateField('latencyPing', null)
    provider.awareness.setLocalStateField('latencyPong', null)
  }

  private readAwarenessLatencyMessage(value: unknown) {
    if (!value || typeof value !== 'object') return null
    const message = value as {
      id?: unknown
      senderClientId?: unknown
      responderClientId?: unknown
      sentAt?: unknown
    }
    if (typeof message.id !== 'string' || typeof message.senderClientId !== 'number') return null
    return {
      id: message.id,
      senderClientId: message.senderClientId,
      responderClientId:
        typeof message.responderClientId === 'number' ? message.responderClientId : null,
      sentAt: typeof message.sentAt === 'number' ? message.sentAt : null,
    }
  }

  private handleLatencyAwarenessChange(provider: WebsocketProvider) {
    const localClientId = this.getLocalClientId()
    provider.awareness.getStates().forEach((state, clientId) => {
      if (clientId === localClientId) return

      const ping = this.readAwarenessLatencyMessage(state.latencyPing)
      if (ping && ping.senderClientId !== localClientId) {
        provider.awareness.setLocalStateField('latencyPong', {
          id: ping.id,
          senderClientId: ping.senderClientId,
          responderClientId: localClientId,
          sentAt: Date.now(),
        })
      }

      const pong = this.readAwarenessLatencyMessage(state.latencyPong)
      if (!pong || pong.senderClientId !== localClientId) return
      const startedAt = this.latencySamples.get(pong.id)
      if (startedAt === undefined) return
      this.latencySamples.delete(pong.id)
      this.setLatencyMs(Math.max(0, Math.round(performance.now() - startedAt)))
    })
  }

  private bindProviderStatus(provider: WebsocketProvider) {
    this.clearProviderBindings()
    provider.awareness.setLocalStateField('online', true)
    provider.awareness.setLocalStateField('userLabel', this.localUserLabel)

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
      this.handleLatencyAwarenessChange(provider)
    }

    provider.on('status', handleStatus)
    provider.on('sync', handleSync)
    provider.awareness.on('change', handleAwarenessChange)
    this.providerCleanup.push(() => {
      this.clearLatencyAwareness(provider)
      provider.off('status', handleStatus)
      provider.off('sync', handleSync)
      provider.awareness.off('change', handleAwarenessChange)
    })

    syncProviderState()
  }

  private captureLocalSnapshot(): LocalSceneSnapshot {
    return {
      points: [...this.scene.points.values()].filter(
        (point) => !point.locked || point.circleRole === 'center' || point.sphereRole === 'center' || point.sphereRole === 'radius' || point.coneRole === 'baseCenter' || point.coneRole === 'apex' || point.cylinderRole === 'bottomCenter' || point.cylinderRole === 'topCenter',
      ),
      lines: [...this.scene.lines.values()],
      straightLines: [...this.scene.straightLines.values()],
      rays: [...this.scene.rays.values()],
      vectors: [...this.scene.vectors.values()],
      circles: [...this.scene.circles.values()],
      spheres: [...this.scene.spheres.values()],
      cones: [...this.scene.cones.values()],
      cylinders: [...this.scene.cylinders.values()],
      faces: [...this.scene.faces.values()],
      intersections: [...this.scene.intersectionConstraints.values()].filter(
        (constraint): constraint is IntersectionPointConstraint =>
          constraint instanceof IntersectionPointConstraint,
      ),
      cubes: [...this.scene.cubeConstraints.values()].filter(
        (constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint,
      ),
      regularPolygons: [...this.scene.regularPolygonConstraints.values()].filter(
        (constraint): constraint is RegularPolygonConstraint =>
          constraint instanceof RegularPolygonConstraint,
      ),
      cylinderConstraints: [...this.scene.cylinderConstraints.values()].filter(
        (constraint): constraint is CylinderConstraint =>
          constraint instanceof CylinderConstraint,
      ),
      objectConstrainedPoints: [...this.scene.objectConstrainedPointConstraints.values()].filter(
        (constraint): constraint is ObjectConstrainedPointConstraint =>
          constraint instanceof ObjectConstrainedPointConstraint,
      ),
    }
  }

  private clearLocalSceneForJoin() {
    this.scene.lines.clear()
    this.scene.straightLines.clear()
    this.scene.rays.clear()
    this.scene.vectors.clear()
    this.scene.circles.clear()
    this.scene.spheres.clear()
    this.scene.cones.clear()
    this.scene.cylinders.clear()
    this.scene.faces.clear()
    this.scene.points.forEach((point, id) => {
      if (!point.locked || point.circleRole === 'center' || point.sphereRole === 'center' || point.sphereRole === 'radius' || point.coneRole === 'baseCenter' || point.coneRole === 'apex' || point.cylinderRole === 'bottomCenter' || point.cylinderRole === 'topCenter') this.scene.points.delete(id)
    })
    this.scene.clearAllConstraints()
    this.scene.selection.clear()
  }

  private restoreLocalSnapshot(snapshot: LocalSceneSnapshot) {
    snapshot.points.forEach((point) => this.scene.addPoint(point))
    snapshot.lines.forEach((line) => this.scene.addLine(line))
    snapshot.straightLines.forEach((line) => this.scene.addStraightLine(line))
    snapshot.rays.forEach((ray) => this.scene.addRay(ray))
    snapshot.vectors.forEach((vector) => this.scene.addVector(vector))
    snapshot.circles.forEach((circle) => this.scene.addCircle(circle))
    snapshot.spheres.forEach((sphere) => this.scene.addSphere(sphere))
    snapshot.cones.forEach((cone) => this.scene.addCone(cone))
    snapshot.cylinders.forEach((cylinder) => this.scene.addCylinder(cylinder))
    snapshot.faces.forEach((face) => this.scene.addFace(face))
    snapshot.intersections.forEach((constraint) => this.scene.addIntersectionConstraint(constraint))
    snapshot.objectConstrainedPoints.forEach((constraint) => this.scene.addObjectConstrainedPointConstraint(constraint))
    snapshot.cubes.forEach((cube) => this.scene.addCubeConstraint(cube))
    snapshot.regularPolygons.forEach((constraint) => this.scene.addRegularPolygonConstraint(constraint))
    snapshot.cylinderConstraints.forEach((constraint) => this.scene.addCylinderConstraint(constraint))
  }

  private clearDirtyState() {
    this.dirtyPointIds.clear()
    this.dirtyLineIds.clear()
    this.dirtyStraightLineIds.clear()
    this.dirtyRayIds.clear()
    this.dirtyVectorIds.clear()
    this.dirtyCircleIds.clear()
    this.dirtySphereIds.clear()
    this.dirtyConeIds.clear()
    this.dirtyCylinderIds.clear()
    this.dirtyFaceIds.clear()
    this.dirtyIntersectionIds.clear()
    this.dirtyObjectConstrainedPointIds.clear()
    this.deletedPointIds.clear()
    this.deletedLineIds.clear()
    this.deletedStraightLineIds.clear()
    this.deletedRayIds.clear()
    this.deletedVectorIds.clear()
    this.deletedCircleIds.clear()
    this.deletedSphereIds.clear()
    this.deletedConeIds.clear()
    this.deletedCylinderIds.clear()
    this.deletedFaceIds.clear()
    this.deletedIntersectionIds.clear()
    this.deletedObjectConstrainedPointIds.clear()
    this.dirtyCubeIds.clear()
    this.dirtyRegularPolygonIds.clear()
    this.deletedCubeIds.clear()
    this.deletedRegularPolygonIds.clear()
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

  private markVectorDirty(id: string) {
    this.deletedVectorIds.delete(id)
    this.dirtyVectorIds.add(id)
  }

  private markCircleDirty(id: string) {
    this.deletedCircleIds.delete(id)
    this.dirtyCircleIds.add(id)
  }

  private markSphereDirty(id: string) {
    this.deletedSphereIds.delete(id)
    this.dirtySphereIds.add(id)
  }

  private markConeDirty(id: string) {
    this.deletedConeIds.delete(id)
    this.dirtyConeIds.add(id)
  }

  private markCylinderDirty(id: string) {
    this.deletedCylinderIds.delete(id)
    this.dirtyCylinderIds.add(id)
  }

  private markStraightLineDirty(id: string) {
    this.deletedStraightLineIds.delete(id)
    this.dirtyStraightLineIds.add(id)
  }

  private markFaceDirty(id: string) {
    this.deletedFaceIds.delete(id)
    this.dirtyFaceIds.add(id)
  }

  private markIntersectionDirty(id: string) {
    this.deletedIntersectionIds.delete(id)
    this.dirtyIntersectionIds.add(id)
  }

  private markCubeDirty(id: string) {
    this.deletedCubeIds.delete(id)
    this.dirtyCubeIds.add(id)
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

  private markVectorDeleted(id: string) {
    this.dirtyVectorIds.delete(id)
    this.deletedVectorIds.add(id)
  }

  private markCircleDeleted(id: string) {
    this.dirtyCircleIds.delete(id)
    this.deletedCircleIds.add(id)
  }

  private markSphereDeleted(id: string) {
    this.dirtySphereIds.delete(id)
    this.deletedSphereIds.add(id)
  }

  private markConeDeleted(id: string) {
    this.dirtyConeIds.delete(id)
    this.deletedConeIds.add(id)
  }

  private markCylinderDeleted(id: string) {
    this.dirtyCylinderIds.delete(id)
    this.deletedCylinderIds.add(id)
  }

  private markStraightLineDeleted(id: string) {
    this.dirtyStraightLineIds.delete(id)
    this.deletedStraightLineIds.add(id)
  }

  private markFaceDeleted(id: string) {
    this.dirtyFaceIds.delete(id)
    this.deletedFaceIds.add(id)
  }

  private markIntersectionDeleted(id: string) {
    this.dirtyIntersectionIds.delete(id)
    this.deletedIntersectionIds.add(id)
  }

  private markCubeDeleted(id: string) {
    this.dirtyCubeIds.delete(id)
    this.deletedCubeIds.add(id)
  }

  private markRegularPolygonDirty(id: string) {
    this.deletedRegularPolygonIds.delete(id)
    this.dirtyRegularPolygonIds.add(id)
  }

  private markRegularPolygonDeleted(id: string) {
    this.dirtyRegularPolygonIds.delete(id)
    this.deletedRegularPolygonIds.add(id)
  }

  private markObjectConstrainedPointDirty(id: string) {
    this.deletedObjectConstrainedPointIds.delete(id)
    this.dirtyObjectConstrainedPointIds.add(id)
  }

  private markObjectConstrainedPointDeleted(id: string) {
    this.dirtyObjectConstrainedPointIds.delete(id)
    this.deletedObjectConstrainedPointIds.add(id)
  }

  private markLinkedGeometryDirtyForPoint(pointId: string) {
    const point = this.scene.points.get(pointId)
    if (point?.cubeId) this.markCubeDirty(point.cubeId)
    this.scene.intersectionConstraints.forEach((constraint, id) => {
      const dependencyIds = constraint.getDependencyPointIds?.()
      if (!dependencyIds) return
      for (const dependencyId of dependencyIds) {
        if (dependencyId === pointId) {
          this.markPointDirty(id)
          return
        }
      }

      if (id === pointId) {
        for (const dependencyId of dependencyIds) {
          if (dependencyId !== pointId) this.markPointDirty(dependencyId)
        }
      }
    })
    this.scene.objectConstrainedPointConstraints.forEach((constraint) => {
      const dependencyIds = constraint.getDependencyPointIds?.()
      if (!dependencyIds) return
      for (const dependencyId of dependencyIds) {
        if (dependencyId === pointId && dependencyId !== constraint.pointId) {
          this.markPointDirty(constraint.pointId)
          this.markObjectConstrainedPointDirty(constraint.pointId)
          return
        }
      }
    })
    this.scene.lines.forEach((line, id) => {
      if (line.p1.id === pointId || line.p2.id === pointId) this.markLineDirty(id)
    })
    this.scene.rays.forEach((ray, id) => {
      if (ray.p1.id === pointId || ray.p2.id === pointId) this.markRayDirty(id)
    })
    this.scene.vectors.forEach((vector, id) => {
      if (vector.p1.id === pointId || vector.p2.id === pointId) this.markVectorDirty(id)
    })
    this.scene.circles.forEach((circle, id) => {
      if (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId) {
        this.markCircleDirty(id)
        this.markCircleCenterPointDirty(id)
      }
    })
    this.scene.spheres.forEach((sphere, id) => {
      if (sphere.centerPoint.id === pointId || (sphere.radiusPoint && sphere.radiusPoint.id === pointId)) {
        this.markSphereDirty(id)
      }
    })
    this.scene.cones.forEach((cone, id) => {
      if (cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId) {
        this.markConeDirty(id)
      }
    })
    this.scene.cylinders.forEach((cylinder, id) => {
      if (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId) {
        this.markCylinderDirty(id)
      }
    })
    this.scene.straightLines.forEach((line, id) => {
      if (line.p1.id === pointId || line.p2.id === pointId) this.markStraightLineDirty(id)
    })
    this.scene.faces.forEach((face, id) => {
      if (face.includesPoint(pointId)) this.markFaceDirty(id)
    })
  }

  private findCircleCenterPoint(circleId: string) {
    return [...this.scene.points.values()].find(
      (point) => point.circleId === circleId && point.circleRole === 'center',
    )
  }

  private isPointReferencedByOtherGeometry(pointId: string, excludeCircleId?: string): boolean {
    for (const line of this.scene.lines.values()) {
      if (line.p1.id === pointId || line.p2.id === pointId) return true
    }
    for (const ray of this.scene.rays.values()) {
      if (ray.p1.id === pointId || ray.p2.id === pointId) return true
    }
    for (const vec of this.scene.vectors.values()) {
      if (vec.p1.id === pointId || vec.p2.id === pointId) return true
    }
    for (const sl of this.scene.straightLines.values()) {
      if (sl.p1.id === pointId || sl.p2.id === pointId) return true
    }
    for (const circle of this.scene.circles.values()) {
      if (circle.id !== excludeCircleId &&
        (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId)) return true
    }
    for (const sphere of this.scene.spheres.values()) {
      if (sphere.centerPoint.id === pointId || (sphere.radiusPoint && sphere.radiusPoint.id === pointId)) return true
    }
    for (const cone of this.scene.cones.values()) {
      if (cone.baseCenterPoint.id === pointId || cone.apexPoint.id === pointId) return true
    }
    for (const cylinder of this.scene.cylinders.values()) {
      if (cylinder.bottomCenterPoint.id === pointId || cylinder.topCenterPoint.id === pointId) return true
    }
    for (const face of this.scene.faces.values()) {
      if (face.includesPoint(pointId)) return true
    }
    return false
  }

  private syncCircleCenterPointPosition(circleId: string) {
    const circle = this.scene.circles.get(circleId)
    const centerPoint = this.findCircleCenterPoint(circleId)
    const frame = circle?.getFrame()
    if (!centerPoint || !frame) return null
    centerPoint.setPosition(frame.center)
    return centerPoint
  }

  private markCircleCenterPointDirty(circleId: string) {
    const centerPoint = this.syncCircleCenterPointPosition(circleId)
    if (centerPoint) this.markPointDirty(centerPoint.id)
  }

  markSceneDirty() {
    this.scene.points.forEach((point, id) => {
      if (!point.locked || point.circleRole === 'center' || point.sphereRole === 'center' || point.sphereRole === 'radius' || point.coneRole === 'baseCenter' || point.coneRole === 'apex' || point.cylinderRole === 'bottomCenter' || point.cylinderRole === 'topCenter' || id === Scene.ORIGIN_ID) {
        this.markPointDirty(id)
      }
    })
    this.scene.lines.forEach((_, id) => this.markLineDirty(id))
    this.scene.straightLines.forEach((_, id) => this.markStraightLineDirty(id))
    this.scene.rays.forEach((_, id) => this.markRayDirty(id))
    this.scene.vectors.forEach((_, id) => this.markVectorDirty(id))
    this.scene.circles.forEach((_, id) => this.markCircleDirty(id))
    this.scene.spheres.forEach((_, id) => this.markSphereDirty(id))
    this.scene.cones.forEach((_, id) => this.markConeDirty(id))
    this.scene.cylinders.forEach((_, id) => this.markCylinderDirty(id))
    this.scene.faces.forEach((_, id) => this.markFaceDirty(id))
    this.scene.intersectionConstraints.forEach((constraint, id) => {
      if (constraint instanceof IntersectionPointConstraint) this.markIntersectionDirty(id)
    })
    this.scene.objectConstrainedPointConstraints.forEach((constraint, id) => {
      if (constraint instanceof ObjectConstrainedPointConstraint) this.markObjectConstrainedPointDirty(id)
    })
    this.scene.cubeConstraints.forEach((constraint, id) => {
      if (constraint instanceof CubeConstraint) this.markCubeDirty(id)
    })
    this.scene.regularPolygonConstraints.forEach((constraint, id) => {
      if (constraint instanceof RegularPolygonConstraint) this.markRegularPolygonDirty(id)
    })

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
    for (const id of [...this.yVectors.keys()]) {
      if (!this.scene.vectors.has(id)) this.markVectorDeleted(id)
    }
    for (const id of [...this.yCircles.keys()]) {
      if (!this.scene.circles.has(id)) this.markCircleDeleted(id)
    }
    for (const id of [...this.ySpheres.keys()]) {
      if (!this.scene.spheres.has(id)) this.markSphereDeleted(id)
    }
    for (const id of [...this.yCones.keys()]) {
      if (!this.scene.cones.has(id)) this.markConeDeleted(id)
    }
    for (const id of [...this.yCylinders.keys()]) {
      if (!this.scene.cylinders.has(id)) this.markCylinderDeleted(id)
    }
    for (const id of [...this.yIntersections.keys()]) {
      if (!this.scene.intersectionConstraints.has(id)) this.markIntersectionDeleted(id)
    }
    for (const id of [...this.yObjectConstrainedPoints.keys()]) {
      if (!this.scene.objectConstrainedPointConstraints.has(id)) this.markObjectConstrainedPointDeleted(id)
    }
    for (const id of [...this.yFaces.keys()]) {
      if (!this.scene.faces.has(id)) this.markFaceDeleted(id)
    }
    for (const id of [...this.yCubes.keys()]) {
      if (!this.scene.cubeConstraints.has(id)) this.markCubeDeleted(id)
    }
    for (const id of [...this.yRegularPolygons.keys()]) {
      if (!this.scene.regularPolygonConstraints.has(id)) this.markRegularPolygonDeleted(id)
    }
  }

  markPreviewPointsDirty(pointIds: Iterable<string>) {
    for (const id of pointIds) {
      const point = this.scene.points.get(id)
      if (!point || point.locked) continue
      this.markPointDirty(id)
      this.markLinkedGeometryDirtyForPoint(id)
      if (this.scene.objectConstrainedPointConstraints.has(id)) {
        this.markObjectConstrainedPointDirty(id)
      }
    }
  }

  private markPreviewLabelDirty(target: LiveLabelTarget | null) {
    if (!target) return
    if (target.type === 'point') {
      this.markPointDirty(target.geoId)
      return
    }
    if (target.type === 'line') {
      this.markLineDirty(target.geoId)
      return
    }
    if (target.type === 'straightLine') {
      this.markStraightLineDirty(target.geoId)
      return
    }
    if (target.type === 'ray') {
      this.markRayDirty(target.geoId)
      return
    }
    if (target.type === 'vector') {
      this.markVectorDirty(target.geoId)
      return
    }
    if (target.type === 'circle') {
      this.markCircleDirty(target.geoId)
      return
    }
    if (target.type === 'sphere') {
      this.markSphereDirty(target.geoId)
      return
    }
    if (target.type === 'cone') {
      this.markConeDirty(target.geoId)
      return
    }
    if (target.type === 'cylinder') {
      this.markCylinderDirty(target.geoId)
      return
    }
    this.markFaceDirty(target.geoId)
  }

  private roomHasSharedGeometry() {
    return (
      [...this.yPoints.keys()].some((id) => id !== Scene.ORIGIN_ID) ||
      this.yLines.size > 0 ||
      this.yStraightLines.size > 0 ||
      this.yRays.size > 0 ||
      this.yVectors.size > 0 ||
      this.yCircles.size > 0 ||
      this.ySpheres.size > 0 ||
      this.yCones.size > 0 ||
      this.yCylinders.size > 0 ||
      this.yIntersections.size > 0 ||
      this.yObjectConstrainedPoints.size > 0 ||
      this.yFaces.size > 0 ||
      this.yCubes.size > 0 ||
      this.yRegularPolygons.size > 0
    )
  }

  private reconcileInitialScene(localSnapshot: LocalSceneSnapshot) {
    if (this.roomHasSharedGeometry()) return
    if (
      localSnapshot.points.length === 0 &&
      localSnapshot.lines.length === 0 &&
      localSnapshot.straightLines.length === 0 &&
      localSnapshot.rays.length === 0 &&
      localSnapshot.vectors.length === 0 &&
      localSnapshot.circles.length === 0 &&
      localSnapshot.spheres.length === 0 &&
      localSnapshot.cones.length === 0 &&
      localSnapshot.cylinders.length === 0 &&
      localSnapshot.intersections.length === 0 &&
      localSnapshot.faces.length === 0 &&
      localSnapshot.cubes.length === 0 &&
      localSnapshot.regularPolygons.length === 0 &&
      localSnapshot.cylinderConstraints.length === 0 &&
      localSnapshot.objectConstrainedPoints.length === 0
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

      const handleStatus = () => {
        this.updateConnectionStateFromProvider(provider)
        scheduleSettle()
      }

      const handleSync = (isSynced: boolean) => {
        if (isSynced) {
          scheduleSettle()
        }
      }

      provider.on('status', handleStatus)
      provider.on('sync', handleSync)

      handleStatus()
      handleSync(provider.synced)
    })
  }

  private resetDoc() {
    if (this.pointsObserver) this.yPoints.unobserve(this.pointsObserver)
    if (this.linesObserver) this.yLines.unobserve(this.linesObserver)
    if (this.straightLinesObserver) this.yStraightLines.unobserve(this.straightLinesObserver)
    if (this.raysObserver) this.yRays.unobserve(this.raysObserver)
    if (this.vectorsObserver) this.yVectors.unobserve(this.vectorsObserver)
    if (this.circlesObserver) this.yCircles.unobserve(this.circlesObserver)
    if (this.spheresObserver) this.ySpheres.unobserve(this.spheresObserver)
    if (this.conesObserver) this.yCones.unobserve(this.conesObserver)
    if (this.cylindersObserver) this.yCylinders.unobserve(this.cylindersObserver)
    if (this.intersectionsObserver) this.yIntersections.unobserve(this.intersectionsObserver)
    if (this.objectConstrainedPointsObserver) this.yObjectConstrainedPoints.unobserve(this.objectConstrainedPointsObserver)
    if (this.facesObserver) this.yFaces.unobserve(this.facesObserver)
    if (this.cubesObserver) this.yCubes.unobserve(this.cubesObserver)
    if (this.regularPolygonsObserver) this.yRegularPolygons.unobserve(this.regularPolygonsObserver)
    if (this.worldTransformObserver) this.yWorldTransform.unobserve(this.worldTransformObserver)
    this.cleanupAllRecordObservers()

    this.ydoc = new Y.Doc()
    this.yPoints = this.ydoc.getMap<PointSharedMap>('points')
    this.yLines = this.ydoc.getMap<LineSharedMap>('lines')
    this.yStraightLines = this.ydoc.getMap<StraightLineSharedMap>('straightLines')
    this.yRays = this.ydoc.getMap<RaySharedMap>('rays')
    this.yVectors = this.ydoc.getMap<VectorSharedMap>('vectors')
    this.yCircles = this.ydoc.getMap<CircleSharedMap>('circles')
    this.ySpheres = this.ydoc.getMap<SphereSharedMap>('spheres')
    this.yCones = this.ydoc.getMap<ConeSharedMap>('cones')
    this.yCylinders = this.ydoc.getMap<CylinderSharedMap>('cylinders')
    this.yIntersections = this.ydoc.getMap<IntersectionSharedMap>('intersections')
    this.yObjectConstrainedPoints = this.ydoc.getMap<ObjectConstrainedPointSharedMap>('objectConstrainedPoints')
    this.yFaces = this.ydoc.getMap<FaceSharedMap>('faces')
    this.yCubes = this.ydoc.getMap<CubeSharedMap>('cubes')
    this.yRegularPolygons = this.ydoc.getMap<RegularPolygonSharedMap>('regularPolygons')
    this.yWorldTransform = this.ydoc.getMap<string | number | boolean>('worldTransform')
    this.setupObservers()
  }

  private releaseRecordObserver(id: string, cleanups: Map<string, () => void>) {
    const cleanup = cleanups.get(id)
    if (!cleanup) return
    cleanup()
    cleanups.delete(id)
  }

  private removePointFromScene(id: string) {
    if (id === Scene.ORIGIN_ID) return
    const point = this.scene.points.get(id)
    if (point?.circleId && point.circleRole === 'center') {
      if (!this.yCircles.has(point.circleId)) {
        this.removeCircleFromScene(point.circleId)
      }
      this.scene.points.delete(id)
      this.scene.selection.points.delete(id)
      return
    }
    if (point?.sphereId && (point.sphereRole === 'center' || point.sphereRole === 'radius')) {
      if (!this.ySpheres.has(point.sphereId)) {
        this.removeSphereFromScene(point.sphereId)
      }
      this.scene.points.delete(id)
      this.scene.selection.points.delete(id)
      return
    }
    if (point?.coneId && (point.coneRole === 'baseCenter' || point.coneRole === 'apex')) {
      if (!this.yCones.has(point.coneId)) {
        this.removeConeFromScene(point.coneId)
      }
      this.scene.points.delete(id)
      this.scene.selection.points.delete(id)
      return
    }
    if (point?.cylinderId && (point.cylinderRole === 'bottomCenter' || point.cylinderRole === 'topCenter')) {
      if (!this.yCylinders.has(point.cylinderId)) {
        this.removeCylinderFromScene(point.cylinderId)
      }
      this.scene.points.delete(id)
      this.scene.selection.points.delete(id)
      return
    }

    this.scene.faces.forEach((face, faceId) => {
      if (face.includesPoint(id)) {
        if (face.regularPolygonId) {
          this.scene.removeRegularPolygonConstraint(face.regularPolygonId)
        }
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
    this.scene.vectors.forEach((vector, vectorId) => {
      if (vector.p1.id === id || vector.p2.id === id) {
        this.scene.vectors.delete(vectorId)
        this.scene.selection.vectors.delete(vectorId)
      }
    })
    this.scene.circles.forEach((circle, circleId) => {
      if (circle.p1.id === id || circle.p2.id === id || circle.p3.id === id) {
        if (!this.yCircles.has(circleId)) {
          this.removeCircleFromScene(circleId)
        }
      }
    })
    this.scene.spheres.forEach((sphere, sphereId) => {
      if (sphere.centerPoint.id === id || (sphere.radiusPoint && sphere.radiusPoint.id === id)) {
        if (!this.ySpheres.has(sphereId)) {
          this.removeSphereFromScene(sphereId)
        }
      }
    })
    this.scene.cones.forEach((cone, coneId) => {
      if (cone.baseCenterPoint.id === id || cone.apexPoint.id === id) {
        if (!this.yCones.has(coneId)) {
          this.removeConeFromScene(coneId)
        }
      }
    })
    this.scene.cylinders.forEach((cylinder, cylinderId) => {
      if (cylinder.bottomCenterPoint.id === id || cylinder.topCenterPoint.id === id) {
        if (!this.yCylinders.has(cylinderId)) {
          this.removeCylinderFromScene(cylinderId)
        }
      }
    })
    this.scene.straightLines.forEach((line, lineId) => {
      if (line.p1.id === id || line.p2.id === id) {
        this.scene.straightLines.delete(lineId)
        this.scene.selection.straightLines.delete(lineId)
      }
    })
    this.scene.points.delete(id)
    this.scene.removeIntersectionConstraint(id)
    this.scene.selection.points.delete(id)
  }

  private removeCircleFromScene(id: string) {
    const circle = this.scene.circles.get(id)
    const isNormal = circle?.isNormalCircle() ?? false
    this.scene.circles.delete(id)
    this.scene.selection.circles.delete(id)
    this.scene.points.forEach((point, pointId) => {
      if (point.circleId === id && point.circleRole === 'center') {
        if (isNormal || this.isPointReferencedByOtherGeometry(pointId, id)) {
          point.circleId = null
          point.circleRole = null
        } else {
          this.scene.points.delete(pointId)
          this.scene.selection.points.delete(pointId)
        }
      }
    })
    this.scene.markAllRenderDirty()
  }

  private removeSphereFromScene(id: string) {
    this.scene.spheres.delete(id)
    this.scene.selection.spheres.delete(id)
    this.scene.points.forEach((point, pointId) => {
      if (point.sphereId === id && (point.sphereRole === 'center' || point.sphereRole === 'radius')) {
        if (this.isPointReferencedByOtherGeometry(pointId)) {
          point.sphereId = null
          point.sphereRole = null
        } else {
          this.scene.points.delete(pointId)
          this.scene.selection.points.delete(pointId)
        }
      }
    })
    this.scene.markAllRenderDirty()
  }

  private removeConeFromScene(id: string) {
    this.scene.cones.delete(id)
    this.scene.selection.cones.delete(id)
    this.scene.points.forEach((point, pointId) => {
      if (point.coneId === id && (point.coneRole === 'baseCenter' || point.coneRole === 'apex')) {
        if (this.isPointReferencedByOtherGeometry(pointId)) {
          point.coneId = null
          point.coneRole = null
        } else {
          this.scene.points.delete(pointId)
          this.scene.selection.points.delete(pointId)
        }
      }
    })
    this.scene.markAllRenderDirty()
  }

  private removeCylinderFromScene(id: string) {
    const cylinder = this.scene.cylinders.get(id)
    if (cylinder) {
      if (cylinder.normalCircleId) {
        const bottomCircle = this.scene.circles.get(cylinder.normalCircleId)
        if (bottomCircle) {
          bottomCircle.p1.circleId = null
          bottomCircle.p1.circleRole = null
        }
        this.scene.circles.delete(cylinder.normalCircleId)
        this.scene.selection.circles.delete(cylinder.normalCircleId)
      }
      if (cylinder.topNormalCircleId) {
        const topCircle = this.scene.circles.get(cylinder.topNormalCircleId)
        if (topCircle) {
          topCircle.p1.circleId = null
          topCircle.p1.circleRole = null
        }
        this.scene.circles.delete(cylinder.topNormalCircleId)
        this.scene.selection.circles.delete(cylinder.topNormalCircleId)
      }
    }
    this.scene.removeCylinderConstraint(id)
    this.scene.cylinders.delete(id)
    this.scene.selection.cylinders.delete(id)
    this.scene.points.forEach((point, pointId) => {
      if (point.cylinderId === id && (point.cylinderRole === 'bottomCenter' || point.cylinderRole === 'topCenter')) {
        if (this.isPointReferencedByOtherGeometry(pointId)) {
          point.cylinderId = null
          point.cylinderRole = null
        } else {
          this.scene.points.delete(pointId)
          this.scene.selection.points.delete(pointId)
        }
      }
    })
    this.scene.markAllRenderDirty()
  }

  private reconcileGeometryForPoint(pointId: string) {
    this.yLines.forEach((record, id) => {
      const p1Id = this.readString(record, 'p1Id', '')
      const p2Id = this.readString(record, 'p2Id', '')
      if (p1Id === pointId || p2Id === pointId) this.applyLineRecord(id, record)
    })
    this.yStraightLines.forEach((record, id) => {
      const p1Id = this.readString(record, 'p1Id', '')
      const p2Id = this.readString(record, 'p2Id', '')
      if (p1Id === pointId || p2Id === pointId) this.applyStraightLineRecord(id, record)
    })
    this.yRays.forEach((record, id) => {
      const p1Id = this.readString(record, 'p1Id', '')
      const p2Id = this.readString(record, 'p2Id', '')
      if (p1Id === pointId || p2Id === pointId) this.applyRayRecord(id, record)
    })
    this.yVectors.forEach((record, id) => {
      const p1Id = this.readString(record, 'p1Id', '')
      const p2Id = this.readString(record, 'p2Id', '')
      if (p1Id === pointId || p2Id === pointId) this.applyVectorRecord(id, record)
    })
    this.yCircles.forEach((record, id) => {
      const p1Id = this.readString(record, 'p1Id', '')
      const p2Id = this.readString(record, 'p2Id', '')
      const p3Id = this.readString(record, 'p3Id', '')
      if (p1Id === pointId || p2Id === pointId || p3Id === pointId) {
        this.applyCircleRecord(id, record)
      }
    })
    this.ySpheres.forEach((record, id) => {
      const centerPointId = this.readString(record, 'centerPointId', '')
      const radiusPointId = this.readString(record, 'radiusPointId', '')
      if (centerPointId === pointId || radiusPointId === pointId) {
        this.applySphereRecord(id, record)
      }
    })
    this.yCones.forEach((record, id) => {
      const baseCenterPointId = this.readString(record, 'baseCenterPointId', '')
      const apexPointId = this.readString(record, 'apexPointId', '')
      if (baseCenterPointId === pointId || apexPointId === pointId) {
        this.applyConeRecord(id, record)
      }
    })
    this.yCylinders.forEach((record, id) => {
      const bottomCenterPointId = this.readString(record, 'bottomCenterPointId', '')
      const topCenterPointId = this.readString(record, 'topCenterPointId', '')
      if (bottomCenterPointId === pointId || topCenterPointId === pointId) {
        this.applyCylinderRecord(id, record)
      }
    })
    this.yFaces.forEach((record, id) => {
      const boundaryPointIds = this.readStringArray(record, 'boundaryPointIds')
      const memberPointIds = this.readStringArray(record, 'memberPointIds')
      if (boundaryPointIds.includes(pointId) || memberPointIds.includes(pointId)) {
        this.applyFaceRecord(id, record)
      }
    })
    this.yCubes.forEach((record, id) => {
      const ownerPointIds = this.readJsonStringArray(record, 'ownerPointIds')
      const dependentLayouts = this.readJsonCubeLayouts(record, 'dependentLayouts')
      if (
        ownerPointIds.includes(pointId) ||
        dependentLayouts.some((layout) => layout.pointId === pointId)
      ) {
        this.applyCubeRecord(id, record)
      }
    })
    this.yRegularPolygons.forEach((record, id) => {
      const ownerPointIds = this.readJsonStringArray(record, 'ownerPointIds')
      const dependentLayouts = this.readJsonRegularPolygonLayouts(record, 'dependentLayouts')
      if (
        ownerPointIds.includes(pointId) ||
        dependentLayouts.some((layout) => layout.pointId === pointId)
      ) {
        this.applyRegularPolygonRecord(id, record)
      }
    })
    const intersectionRecord = this.yIntersections.get(pointId)
    if (intersectionRecord) this.applyIntersectionRecord(pointId, intersectionRecord)
  }

  private reconcileCubeForFace(cubeId: string | null) {
    if (!cubeId) return
    const cubeRecord = this.yCubes.get(cubeId)
    if (cubeRecord) this.applyCubeRecord(cubeId, cubeRecord)
  }

  private reconcileRegularPolygonForFace(regularPolygonId: string | null) {
    if (!regularPolygonId) return
    const rpRecord = this.yRegularPolygons.get(regularPolygonId)
    if (rpRecord) this.applyRegularPolygonRecord(regularPolygonId, rpRecord)
  }

  private readIntersectionTarget(
    record: IntersectionSharedMap,
    prefix: 'sourceA' | 'sourceB',
  ): IntersectionTargetRef | null {
    const typeValue = this.readString(record, `${prefix}Type`, '')
    const id = this.readString(record, `${prefix}Id`, '')
    if (!id || !isIntersectionTargetType(typeValue)) return null
    return { type: typeValue, id }
  }

  private hasIntersectionTarget(target: IntersectionTargetRef) {
    if (target.type === 'line') return this.scene.lines.has(target.id)
    if (target.type === 'straightLine') return this.scene.straightLines.has(target.id)
    if (target.type === 'ray') return this.scene.rays.has(target.id)
    if (target.type === 'vector') return this.scene.vectors.has(target.id)
    return this.scene.faces.has(target.id)
  }

  private reconcileIntersectionsForTarget(targetType: IntersectionTargetRef['type'], targetId: string) {
    this.yIntersections.forEach((record, pointId) => {
      const sourceA = this.readIntersectionTarget(record, 'sourceA')
      const sourceB = this.readIntersectionTarget(record, 'sourceB')
      if (
        (sourceA?.type === targetType && sourceA.id === targetId) ||
        (sourceB?.type === targetType && sourceB.id === targetId)
      ) {
        this.applyIntersectionRecord(pointId, record)
      }
    })
  }

  private applyPointRecord(id: string, record: PointSharedMap) {
    const point = this.scene.points.get(id)
    if (point?.locked && id !== Scene.ORIGIN_ID) return

    const x = this.readNumber(record, 'x', point?.position.x ?? 0)
    const y = this.readNumber(record, 'y', point?.position.y ?? 0)
    const z = this.readNumber(record, 'z', point?.position.z ?? 0)
    const name = this.readString(record, 'name', point?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', point?.nameVisible ?? true)
    const valueVisible = this.readBoolean(record, 'valueVisible', point?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      point?.labelOffsetX ?? Point3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      point?.labelOffsetY ?? Point3.DEFAULT_LABEL_OFFSET_Y,
    )
    const userLocked = this.readBoolean(record, 'userLocked', point?.userLocked ?? false)
    const cubeId = this.readNullableString(record, 'cubeId')
    const cubeRoleValue = this.readNullableString(record, 'cubeRole')
    const cubeRole =
      cubeRoleValue === 'owner' || cubeRoleValue === 'dependent' ? cubeRoleValue : null
    const circleId = this.readNullableString(record, 'circleId')
    const circleRoleValue = this.readNullableString(record, 'circleRole')
    const circleRole = circleRoleValue === 'center' ? circleRoleValue : null
    const regularPolygonId = this.readNullableString(record, 'regularPolygonId')
    const regularPolygonRoleValue = this.readNullableString(record, 'regularPolygonRole')
    const regularPolygonRole = regularPolygonRoleValue === 'owner' || regularPolygonRoleValue === 'dependent' ? regularPolygonRoleValue : null
    const sphereId = this.readNullableString(record, 'sphereId')
    const sphereRoleValue = this.readNullableString(record, 'sphereRole')
    const sphereRole = sphereRoleValue === 'center' || sphereRoleValue === 'radius' ? sphereRoleValue : null
    const coneId = this.readNullableString(record, 'coneId')
    const coneRoleValue = this.readNullableString(record, 'coneRole')
    const coneRole = coneRoleValue === 'baseCenter' || coneRoleValue === 'apex' ? coneRoleValue : null
    const cylinderId = this.readNullableString(record, 'cylinderId')
    const cylinderRoleValue = this.readNullableString(record, 'cylinderRole')
    const cylinderRole = cylinderRoleValue === 'bottomCenter' || cylinderRoleValue === 'topCenter' ? cylinderRoleValue : null
    const constrainedToType = this.readNullableString(record, 'constrainedToType')
    const constrainedToId = this.readNullableString(record, 'constrainedToId')
    const constrainedTo = constrainedToType && constrainedToId ? { type: constrainedToType as ConstrainedToRef['type'], id: constrainedToId } : null

    if (point) {
      point.name = name
      point.nameVisible = nameVisible
      point.valueVisible = valueVisible
      point.labelOffsetX = labelOffsetX
      point.labelOffsetY = labelOffsetY
      point.userLocked = userLocked
      point.cubeId = cubeId
      point.cubeRole = cubeRole
      point.circleId = circleId
      point.circleRole = circleRole
      point.regularPolygonId = regularPolygonId
      point.regularPolygonRole = regularPolygonRole
      point.sphereId = sphereId
      point.sphereRole = sphereRole
      point.coneId = coneId
      point.coneRole = coneRole
      point.cylinderId = cylinderId
      point.cylinderRole = cylinderRole
      point.constrainedTo = constrainedTo
      if (!point.locked) {
        point.setPosition(new Vec3(x, y, z))
      }
      const constraint = this.scene.getObjectConstrainedPointConstraint(id)
      if (constraint) {
        const projected = constraint.projectPosition(point.position)
        if (projected) {
          point.setPosition(projected)
          constraint.computeParametricDataFromPosition(projected)
        }
      }
      this.scene.markAllRenderDirty()
      return
    }

    const nextPoint = new Point3(
      id,
      name,
      new Vec3(x, y, z),
      id === Scene.ORIGIN_ID,
      nameVisible,
      userLocked,
      labelOffsetX,
      labelOffsetY,
      valueVisible,
    )
    nextPoint.cubeId = cubeId
    nextPoint.cubeRole = cubeRole
    nextPoint.circleId = circleId
    nextPoint.circleRole = circleRole
    nextPoint.regularPolygonId = regularPolygonId
    nextPoint.regularPolygonRole = regularPolygonRole
    nextPoint.sphereId = sphereId
    nextPoint.sphereRole = sphereRole
    nextPoint.coneId = coneId
    nextPoint.coneRole = coneRole
    nextPoint.cylinderId = cylinderId
    nextPoint.cylinderRole = cylinderRole
    nextPoint.constrainedTo = constrainedTo
    this.scene.addPoint(nextPoint)
    this.scene.markAllRenderDirty()
    this.reconcileGeometryForPoint(id)
  }

  private applyLineRecord(id: string, record: LineSharedMap) {
    const p1Id = this.readString(record, 'p1Id', '')
    const p2Id = this.readString(record, 'p2Id', '')
    const p1 = this.scene.points.get(p1Id)
    const p2 = this.scene.points.get(p2Id)
    if (!p1 || !p2) return

    const line = this.scene.lines.get(id)
    const name = this.readString(record, 'name', line?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', line?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', line?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      line?.labelOffsetX ?? Line3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      line?.labelOffsetY ?? Line3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', line?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', line?.userLocked ?? false)
    const lengthLocked = this.readBoolean(record, 'lengthLocked', line?.lengthLocked ?? false)
    const lockedLength = Line3.normalizeLockedLength(
      this.readNumber(
        record,
        'lockedLength',
        line?.lockedLength ??
          Math.hypot(
            p2.position.x - p1.position.x,
            p2.position.y - p1.position.y,
            p2.position.z - p1.position.z,
          ),
      ),
    )

    if (line) {
      line.name = name
      line.nameVisible = nameVisible
      line.valueVisible = valueVisible
      line.labelOffsetX = labelOffsetX
      line.labelOffsetY = labelOffsetY
      line.visible = visible
      line.userLocked = userLocked
      line.lengthLocked = lengthLocked
      line.lockedLength = lockedLength
      line.p1 = p1
      line.p2 = p2
      line.faceOwned = this.readBoolean(record, 'faceOwned', line.faceOwned)
    line.faceConstraintType = (this.readString(record, 'faceConstraintType', '') || null) as FaceConstraintType | null
    this.reconcileIntersectionsForTarget('line', id)
    return
  }

  const newLine = new Line3(
      id,
      name,
      p1,
      p2,
      nameVisible,
      visible,
      lengthLocked,
      lockedLength,
      userLocked,
      labelOffsetX,
      labelOffsetY,
      valueVisible,
    )
    newLine.faceOwned = this.readBoolean(record, 'faceOwned', false)
    newLine.faceConstraintType = (this.readString(record, 'faceConstraintType', '') || null) as FaceConstraintType | null
    this.scene.addLine(newLine)
    this.reconcileIntersectionsForTarget('line', id)
  }

  private applyStraightLineRecord(id: string, record: StraightLineSharedMap) {
    const p1Id = this.readString(record, 'p1Id', '')
    const p2Id = this.readString(record, 'p2Id', '')
    const p1 = this.scene.points.get(p1Id)
    const p2 = this.scene.points.get(p2Id)
    if (!p1 || !p2) return

    const line = this.scene.straightLines.get(id)
    const name = this.readString(record, 'name', line?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', line?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', line?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      line?.labelOffsetX ?? StraightLine3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      line?.labelOffsetY ?? StraightLine3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', line?.visible ?? true)
    const displayLength = StraightLine3.normalizeDisplayLength(
      this.readNumber(
        record,
        'displayLength',
        line?.displayLength ?? StraightLine3.DEFAULT_DISPLAY_LENGTH,
      ),
    )
    const userLocked = this.readBoolean(record, 'userLocked', line?.userLocked ?? false)

    if (line) {
      line.name = name
      line.nameVisible = nameVisible
      line.valueVisible = valueVisible
      line.labelOffsetX = labelOffsetX
      line.labelOffsetY = labelOffsetY
      line.visible = visible
      line.displayLength = displayLength
      line.userLocked = userLocked
      line.p1 = p1
      line.p2 = p2
      this.reconcileIntersectionsForTarget('straightLine', id)
      return
    }

    this.scene.addStraightLine(
      new StraightLine3(
        id,
        name,
        p1,
        p2,
        nameVisible,
        visible,
        displayLength,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
      ),
    )
    this.reconcileIntersectionsForTarget('straightLine', id)
  }

  private applyRayRecord(id: string, record: RaySharedMap) {
    const p1Id = this.readString(record, 'p1Id', '')
    const p2Id = this.readString(record, 'p2Id', '')
    const p1 = this.scene.points.get(p1Id)
    const p2 = this.scene.points.get(p2Id)
    if (!p1 || !p2) return

    const ray = this.scene.rays.get(id)
    const name = this.readString(record, 'name', ray?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', ray?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', ray?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      ray?.labelOffsetX ?? Ray3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      ray?.labelOffsetY ?? Ray3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', ray?.visible ?? true)
    const displayLength = Ray3.normalizeDisplayLength(
      this.readNumber(record, 'displayLength', ray?.displayLength ?? Ray3.DEFAULT_DISPLAY_LENGTH),
    )
    const userLocked = this.readBoolean(record, 'userLocked', ray?.userLocked ?? false)

    if (ray) {
      ray.name = name
      ray.nameVisible = nameVisible
      ray.valueVisible = valueVisible
      ray.labelOffsetX = labelOffsetX
      ray.labelOffsetY = labelOffsetY
      ray.visible = visible
      ray.displayLength = displayLength
      ray.userLocked = userLocked
      ray.p1 = p1
      ray.p2 = p2
      this.reconcileIntersectionsForTarget('ray', id)
      return
    }

    this.scene.addRay(
      new Ray3(
        id,
        name,
        p1,
        p2,
        nameVisible,
        visible,
        displayLength,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
      ),
    )
    this.reconcileIntersectionsForTarget('ray', id)
  }

  private applyVectorRecord(id: string, record: VectorSharedMap) {
    const p1Id = this.readString(record, 'p1Id', '')
    const p2Id = this.readString(record, 'p2Id', '')
    const p1 = this.scene.points.get(p1Id)
    const p2 = this.scene.points.get(p2Id)
    if (!p1 || !p2) return

    const vector = this.scene.vectors.get(id)
    const name = this.readString(record, 'name', vector?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', vector?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', vector?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      vector?.labelOffsetX ?? GeoVector3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      vector?.labelOffsetY ?? GeoVector3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', vector?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', vector?.userLocked ?? false)

    if (vector) {
      vector.name = name
      vector.nameVisible = nameVisible
      vector.valueVisible = valueVisible
      vector.labelOffsetX = labelOffsetX
      vector.labelOffsetY = labelOffsetY
      vector.visible = visible
      vector.userLocked = userLocked
      vector.p1 = p1
      vector.p2 = p2
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addVector(
      new GeoVector3(
        id,
        name,
        p1,
        p2,
        nameVisible,
        visible,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
      ),
    )
  }

  private applyCircleRecord(id: string, record: CircleSharedMap) {
    const p1Id = this.readString(record, 'p1Id', '')
    const p2Id = this.readString(record, 'p2Id', '')
    const p3Id = this.readString(record, 'p3Id', '')
    const p1 = this.scene.points.get(p1Id)
    const p2 = this.scene.points.get(p2Id)
    const p3 = this.scene.points.get(p3Id)
    if (!p1 || !p2 || !p3) return

    const circle = this.scene.circles.get(id)
    const name = this.readString(record, 'name', circle?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', circle?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', circle?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      circle?.labelOffsetX ?? Circle3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      circle?.labelOffsetY ?? Circle3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', circle?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', circle?.userLocked ?? false)
    const centerVisible = this.readBoolean(record, 'centerVisible', circle?.centerVisible ?? true)
    const circleTypeValue = this.readString(record, 'circleType', circle?.circleType ?? 'threePoint')
    const circleType: CircleType = circleTypeValue === 'normal' ? 'normal' : 'threePoint'
    const directionTypeRaw = this.readNullableString(record, 'directionType')
    const directionType: DirectionType | null =
      directionTypeRaw === 'line' ||
      directionTypeRaw === 'straightLine' ||
      directionTypeRaw === 'ray' ||
      directionTypeRaw === 'vector' ||
      directionTypeRaw === 'point'
        ? directionTypeRaw
        : null
    const directionId = this.readNullableString(record, 'directionId')
    const lockedRadius = this.readNullableNumber(record, 'lockedRadius')

    if (circle) {
      circle.name = name
      circle.nameVisible = nameVisible
      circle.valueVisible = valueVisible
      circle.labelOffsetX = labelOffsetX
      circle.labelOffsetY = labelOffsetY
      circle.visible = visible
      circle.userLocked = userLocked
      circle.centerVisible = centerVisible
      circle.circleType = circleType
      circle.directionType = directionType
      circle.directionId = directionId
      circle.lockedRadius = lockedRadius
      circle.p1 = p1
      circle.p2 = p2
      circle.p3 = p3
      if (circleType === 'normal') {
        p1.circleId = id
        p1.circleRole = 'center'
      }
      this.syncCircleCenterPointPosition(id)
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addCircle(
      new Circle3(
        id,
        name,
        p1,
        p2,
        p3,
        nameVisible,
        visible,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
        centerVisible,
        circleType,
        directionType,
        directionId,
        lockedRadius,
      ),
    )
    if (circleType === 'normal') {
      p1.circleId = id
      p1.circleRole = 'center'
    }
    this.syncCircleCenterPointPosition(id)
    this.scene.markAllRenderDirty()
  }

  private applySphereRecord(id: string, record: SphereSharedMap) {
    const centerPointId = this.readString(record, 'centerPointId', '')
    const radiusPointId = this.readString(record, 'radiusPointId', '')
    const radiusValue = this.readNumber(record, 'radiusValue', 0)
    const centerPoint = this.scene.points.get(centerPointId)
    if (!centerPoint) return
    const radiusPoint = radiusPointId ? this.scene.points.get(radiusPointId) ?? null : null

    const sphere = this.scene.spheres.get(id)
    const name = this.readString(record, 'name', sphere?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', sphere?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', sphere?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      sphere?.labelOffsetX ?? Sphere3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      sphere?.labelOffsetY ?? Sphere3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', sphere?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', sphere?.userLocked ?? false)

    if (sphere) {
      sphere.name = name
      sphere.nameVisible = nameVisible
      sphere.valueVisible = valueVisible
      sphere.labelOffsetX = labelOffsetX
      sphere.labelOffsetY = labelOffsetY
      sphere.visible = visible
      sphere.userLocked = userLocked
      sphere.centerPoint = centerPoint
      sphere.radiusPoint = radiusPoint
      sphere.radiusValue = radiusValue
      centerPoint.sphereId = id
      centerPoint.sphereRole = 'center'
      if (radiusPoint) {
        radiusPoint.sphereId = id
        radiusPoint.sphereRole = 'radius'
      }
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addSphere(
      new Sphere3(
        id,
        name,
        centerPoint,
        radiusPoint,
        nameVisible,
        visible,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
        radiusValue,
      ),
    )
    centerPoint.sphereId = id
    centerPoint.sphereRole = 'center'
    if (radiusPoint) {
      radiusPoint.sphereId = id
      radiusPoint.sphereRole = 'radius'
    }
    this.scene.markAllRenderDirty()
  }

  private applyConeRecord(id: string, record: ConeSharedMap) {
    const baseCenterPointId = this.readString(record, 'baseCenterPointId', '')
    const apexPointId = this.readString(record, 'apexPointId', '')
    const radiusValue = this.readNumber(record, 'radiusValue', 0)
    const coneTypeValue = this.readString(record, 'coneType', 'twoPoint')
    const coneType: ConeType = coneTypeValue === 'normalCircle' ? 'normalCircle' : 'twoPoint'
    const normalCircleId = this.readNullableString(record, 'normalCircleId')
    const baseCenterPoint = this.scene.points.get(baseCenterPointId)
    const apexPoint = this.scene.points.get(apexPointId)
    if (!baseCenterPoint || !apexPoint) return

    const cone = this.scene.cones.get(id)
    const name = this.readString(record, 'name', cone?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', cone?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', cone?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      cone?.labelOffsetX ?? Cone3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      cone?.labelOffsetY ?? Cone3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', cone?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', cone?.userLocked ?? false)

    if (cone) {
      cone.name = name
      cone.nameVisible = nameVisible
      cone.valueVisible = valueVisible
      cone.labelOffsetX = labelOffsetX
      cone.labelOffsetY = labelOffsetY
      cone.visible = visible
      cone.userLocked = userLocked
      cone.baseCenterPoint = baseCenterPoint
      cone.apexPoint = apexPoint
      cone.radiusValue = radiusValue
      cone.coneType = coneType
      cone.normalCircleId = normalCircleId
      baseCenterPoint.coneId = id
      baseCenterPoint.coneRole = 'baseCenter'
      apexPoint.coneId = id
      apexPoint.coneRole = 'apex'
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addCone(
      new Cone3(
        id,
        name,
        baseCenterPoint,
        apexPoint,
        coneType,
        nameVisible,
        visible,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
        radiusValue,
        normalCircleId,
      ),
    )
    baseCenterPoint.coneId = id
    baseCenterPoint.coneRole = 'baseCenter'
    apexPoint.coneId = id
    apexPoint.coneRole = 'apex'
    this.scene.markAllRenderDirty()
  }

  private applyCylinderRecord(id: string, record: CylinderSharedMap) {
    const bottomCenterPointId = this.readString(record, 'bottomCenterPointId', '')
    const topCenterPointId = this.readString(record, 'topCenterPointId', '')
    const radiusValue = this.readNumber(record, 'radiusValue', 0)
    const cylinderTypeValue = this.readString(record, 'cylinderType', 'twoPoint')
    const cylinderType: CylinderType = cylinderTypeValue === 'normalCircle' ? 'normalCircle' : 'twoPoint'
    const normalCircleId = this.readNullableString(record, 'normalCircleId')
    const topNormalCircleId = this.readNullableString(record, 'topNormalCircleId')
    const bottomCenterPoint = this.scene.points.get(bottomCenterPointId)
    const topCenterPoint = this.scene.points.get(topCenterPointId)
    if (!bottomCenterPoint || !topCenterPoint) return

    const cylinder = this.scene.cylinders.get(id)
    const name = this.readString(record, 'name', cylinder?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', cylinder?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', cylinder?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      cylinder?.labelOffsetX ?? Cylinder3.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      cylinder?.labelOffsetY ?? Cylinder3.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', cylinder?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', cylinder?.userLocked ?? false)

    if (cylinder) {
      cylinder.name = name
      cylinder.nameVisible = nameVisible
      cylinder.valueVisible = valueVisible
      cylinder.labelOffsetX = labelOffsetX
      cylinder.labelOffsetY = labelOffsetY
      cylinder.visible = visible
      cylinder.userLocked = userLocked
      cylinder.bottomCenterPoint = bottomCenterPoint
      cylinder.topCenterPoint = topCenterPoint
      cylinder.radiusValue = radiusValue
      cylinder.cylinderType = cylinderType
      cylinder.normalCircleId = normalCircleId
      cylinder.topNormalCircleId = topNormalCircleId
      bottomCenterPoint.cylinderId = id
      bottomCenterPoint.cylinderRole = 'bottomCenter'
      topCenterPoint.cylinderId = id
      topCenterPoint.cylinderRole = 'topCenter'
      if (normalCircleId) {
        const bottomCircle = this.scene.circles.get(normalCircleId)
        if (bottomCircle) bottomCircle.lockedRadius = radiusValue
      }
      if (topNormalCircleId) {
        const topCircle = this.scene.circles.get(topNormalCircleId)
        if (topCircle) topCircle.lockedRadius = radiusValue
      }
      if (
        normalCircleId != null &&
        topNormalCircleId != null &&
        this.scene.circles.has(normalCircleId) &&
        this.scene.circles.has(topNormalCircleId) &&
        !this.scene.cylinderConstraints.has(id)
      ) {
        this.scene.addCylinderConstraint(
          new CylinderConstraint(this.scene, id, normalCircleId, topNormalCircleId),
        )
      }
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addCylinder(
      new Cylinder3(
        id,
        name,
        bottomCenterPoint,
        topCenterPoint,
        cylinderType,
        nameVisible,
        visible,
        userLocked,
        labelOffsetX,
        labelOffsetY,
        valueVisible,
        radiusValue,
        normalCircleId,
        topNormalCircleId,
      ),
    )
    bottomCenterPoint.cylinderId = id
    bottomCenterPoint.cylinderRole = 'bottomCenter'
    topCenterPoint.cylinderId = id
    topCenterPoint.cylinderRole = 'topCenter'
    if (
      normalCircleId != null &&
      topNormalCircleId != null &&
      this.scene.circles.has(normalCircleId) &&
      this.scene.circles.has(topNormalCircleId)
    ) {
      this.scene.addCylinderConstraint(
        new CylinderConstraint(this.scene, id, normalCircleId, topNormalCircleId),
      )
    }
    this.scene.markAllRenderDirty()
  }

  private applyIntersectionRecord(id: string, record: IntersectionSharedMap) {
    const point = this.scene.points.get(id)
    if (!point || point.locked) return

    const sourceA = this.readIntersectionTarget(record, 'sourceA')
    const sourceB = this.readIntersectionTarget(record, 'sourceB')
    if (!sourceA || !sourceB) return
    if (!canCreateIntersectionFromTargets(sourceA, sourceB)) return
    if (!this.hasIntersectionTarget(sourceA) || !this.hasIntersectionTarget(sourceB)) return

    this.scene.addIntersectionConstraint(
      new IntersectionPointConstraint(this.scene, id, sourceA, sourceB),
    )
    this.scene.requestIntersectionConstraintSolve(id)
    this.scene.markAllRenderDirty()
  }

  private applyObjectConstrainedPointRecord(id: string, record: ObjectConstrainedPointSharedMap) {
    const point = this.scene.points.get(id)
    if (!point || point.locked) return

    const targetType = this.readString(record, 'targetType', '')
    const targetId = this.readString(record, 'targetId', '')
    if (!targetType || !targetId) return
    const validTargetTypes = new Set([
      'line', 'straightLine', 'ray', 'vector', 'circle', 'face', 'sphere',
      'cone', 'coneBase', 'cylinder', 'cylinderBottom', 'cylinderTop',
      'xAxis', 'yAxis', 'zAxis',
    ])
    if (!validTargetTypes.has(targetType)) return

    const constrainedTo: ConstrainedToRef = { type: targetType as ConstrainedToRef['type'], id: targetId }
    point.constrainedTo = constrainedTo

    const pdJson = this.readString(record, 'parametricData', '')
    let parametricData: ParametricData | null = null
    if (pdJson) {
      try {
        parametricData = JSON.parse(pdJson) as ParametricData
      } catch {
        parametricData = null
      }
    }

    const existing = this.scene.getObjectConstrainedPointConstraint(id)
    if (existing) {
      existing.target = constrainedTo
      if (parametricData) existing.parametricData = parametricData
      this.scene.requestConstraintSolve(existing)
    } else {
      const constraint = new ObjectConstrainedPointConstraint(this.scene, id, constrainedTo)
      if (parametricData) constraint.parametricData = parametricData
      this.scene.addObjectConstrainedPointConstraint(constraint)
    }
    this.scene.markAllRenderDirty()
  }

  private applyFaceRecord(id: string, record: FaceSharedMap) {
    const face = this.scene.faces.get(id)
    const boundaryPointIds = this.readStringArray(record, 'boundaryPointIds')
    const memberPointIds = this.readStringArray(record, 'memberPointIds')
    const allPointIds = [...new Set([...boundaryPointIds, ...memberPointIds])]
    if (allPointIds.some((pointId) => !this.scene.points.has(pointId))) return

    const boundaryLineIds = this.readStringArray(record, 'boundaryLineIds')
    const supportPointIds = this.readStringArray(record, 'supportPointIds')
    const edgeLengthLocks = this.readNullableNumberArray(record, 'edgeLengthLocks')
    const name = this.readString(record, 'name', face?.name ?? '')
    const nameVisible = this.readBoolean(record, 'nameVisible', face?.nameVisible ?? false)
    const valueVisible = this.readBoolean(record, 'valueVisible', face?.valueVisible ?? false)
    const labelOffsetX = this.readNumber(
      record,
      'labelOffsetX',
      face?.labelOffsetX ?? PlanarPolygon.DEFAULT_LABEL_OFFSET_X,
    )
    const labelOffsetY = this.readNumber(
      record,
      'labelOffsetY',
      face?.labelOffsetY ?? PlanarPolygon.DEFAULT_LABEL_OFFSET_Y,
    )
    const visible = this.readBoolean(record, 'visible', face?.visible ?? true)
    const userLocked = this.readBoolean(record, 'userLocked', face?.userLocked ?? false)
    const areaLocked = this.readBoolean(record, 'areaLocked', face?.areaLocked ?? false)
    const lockedArea = this.readNumber(record, 'lockedArea', face?.lockedArea ?? 0)
    const fillColor = this.readNullableNumber(record, 'fillColor')
    const fillOpacity = this.readNullableNumber(record, 'fillOpacity')
    const cubeId = this.readNullableString(record, 'cubeId')
    const cubeOwnerPointIds = this.readStringArray(record, 'cubeOwnerPointIds')
    const cubeDependentPointIds = this.readStringArray(record, 'cubeDependentPointIds')
    const isRegularPolygon = this.readBoolean(record, 'isRegularPolygon', face?.isRegularPolygon ?? false)
    const regularPolygonVertexCount = this.readNumber(record, 'regularPolygonVertexCount', face?.regularPolygonVertexCount ?? 0)
    const regularPolygonId = this.readNullableString(record, 'regularPolygonId')
    const regularPolygonOwnerPointIds = this.readStringArray(record, 'regularPolygonOwnerPointIds')
    const regularPolygonDependentPointIds = this.readStringArray(record, 'regularPolygonDependentPointIds')

    if (face) {
      face.name = name
      face.nameVisible = nameVisible
      face.valueVisible = valueVisible
      face.labelOffsetX = labelOffsetX
      face.labelOffsetY = labelOffsetY
      face.visible = visible
      face.userLocked = userLocked
      face.areaLocked = areaLocked
      face.lockedArea = lockedArea
      face.edgeLengthLocks = [...edgeLengthLocks]
      face.boundaryPointIds = [...boundaryPointIds]
      face.memberPointIds = [...memberPointIds]
      face.boundaryLineIds = [...boundaryLineIds]
      face.supportPointIds = [...supportPointIds]
      face.fillColor = fillColor
      face.fillOpacity = fillOpacity
      face.cubeId = cubeId
      face.cubeOwnerPointIds = [...cubeOwnerPointIds]
      face.cubeDependentPointIds = [...cubeDependentPointIds]
      face.isRegularPolygon = isRegularPolygon
      face.regularPolygonVertexCount = regularPolygonVertexCount
      face.regularPolygonId = regularPolygonId
      face.regularPolygonOwnerPointIds = [...regularPolygonOwnerPointIds]
      face.regularPolygonDependentPointIds = [...regularPolygonDependentPointIds]
      face.normalize(this.scene.points)
      this.scene.requestFaceConstraintSolve(id)
      this.scene.markAllRenderDirty()
      this.reconcileIntersectionsForTarget('face', id)
      this.reconcileCubeForFace(cubeId)
      this.reconcileRegularPolygonForFace(regularPolygonId)
      return
    }

    const nextFace = new PlanarPolygon(
      id,
      name,
      [...boundaryPointIds],
      [...memberPointIds],
      [...boundaryLineIds],
      nameVisible,
      visible,
      userLocked,
      [...supportPointIds],
      areaLocked,
      lockedArea,
      [...edgeLengthLocks],
      labelOffsetX,
      labelOffsetY,
      valueVisible,
    )
    nextFace.fillColor = fillColor
    nextFace.fillOpacity = fillOpacity
    nextFace.cubeId = cubeId
    nextFace.cubeOwnerPointIds = [...cubeOwnerPointIds]
    nextFace.cubeDependentPointIds = [...cubeDependentPointIds]
    nextFace.isRegularPolygon = isRegularPolygon
    nextFace.regularPolygonVertexCount = regularPolygonVertexCount
    nextFace.regularPolygonId = regularPolygonId
    nextFace.regularPolygonOwnerPointIds = [...regularPolygonOwnerPointIds]
    nextFace.regularPolygonDependentPointIds = [...regularPolygonDependentPointIds]
    this.scene.addFace(nextFace)
    this.scene.requestFaceConstraintSolve(id)
    this.scene.markAllRenderDirty()
    this.reconcileIntersectionsForTarget('face', id)
    this.reconcileCubeForFace(cubeId)
    this.reconcileRegularPolygonForFace(regularPolygonId)
  }

  private applyCubeRecord(id: string, record: CubeSharedMap) {
    const solidType = this.readString(record, 'solidType', 'hexahedron')
    if (solidType !== 'hexahedron' && solidType !== 'tetrahedron') return

    const ownerPointIds = this.readJsonStringArray(record, 'ownerPointIds')
    const faceIds = this.readJsonStringArray(record, 'faceIds')
    const dependentLayouts = this.readJsonCubeLayouts(record, 'dependentLayouts')
    if (ownerPointIds.length !== 2) return
    const ownerPointA = ownerPointIds[0]
    const ownerPointB = ownerPointIds[1]
    if (!ownerPointA || !ownerPointB) return
    if ([ownerPointA, ownerPointB].some((pointId) => !this.scene.points.has(pointId))) return
    if (faceIds.some((faceId) => !this.scene.faces.has(faceId))) return
    if (dependentLayouts.some((layout) => !this.scene.points.has(layout.pointId))) return

    const sourceLineId = this.readNullableString(record, 'sourceLineId')
    const vAxisHint = new Vec3(
      this.readNumber(record, 'vAxisHintX', 0),
      this.readNumber(record, 'vAxisHintY', 1),
      this.readNumber(record, 'vAxisHintZ', 0),
    )
    const name = this.readString(record, 'name', solidType === 'tetrahedron' ? '正四面体1' : '正六面体1')
    const edgeLengthLocked = this.readBoolean(record, 'edgeLengthLocked', false)
    const valueVisible = this.readBoolean(record, 'valueVisible', false)
    const lockedEdgeLength = this.readNullableNumber(record, 'lockedEdgeLength')

    ;[ownerPointA, ownerPointB].forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.cubeId = id
      point.cubeRole = 'owner'
    })
    dependentLayouts.forEach(({ pointId }) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.cubeId = id
      point.cubeRole = 'dependent'
    })
    faceIds.forEach((faceId) => {
      const face = this.scene.faces.get(faceId)
      if (!face) return
      face.cubeId = id
      face.cubeOwnerPointIds = [...ownerPointIds]
      face.cubeDependentPointIds = dependentLayouts.map((layout) => layout.pointId)
    })

    const existing = this.scene.getCubeConstraint(id)
    if (existing instanceof CubeConstraint) {
      existing.ownerPointIds[0] = ownerPointA
      existing.ownerPointIds[1] = ownerPointB
      existing.dependentLayouts.splice(
        0,
        existing.dependentLayouts.length,
        ...dependentLayouts.map((layout) => ({ ...layout })),
      )
      existing.faceIds.splice(0, existing.faceIds.length, ...faceIds)
      existing.setAxisHint(vAxisHint)
      existing.name = name
      existing.valueVisible = valueVisible
      existing.edgeLengthLocked = edgeLengthLocked
      existing.lockedEdgeLength = lockedEdgeLength
      this.scene.requestCubeConstraintSolve(id)
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addCubeConstraint(
      new CubeConstraint(
        this.scene,
        id,
        solidType,
        [ownerPointA, ownerPointB],
        dependentLayouts.map((layout) => ({ ...layout })),
        [...faceIds],
        sourceLineId,
        vAxisHint,
        name,
        edgeLengthLocked,
        lockedEdgeLength,
        valueVisible,
      ),
    )
    this.scene.requestCubeConstraintSolve(id)
    this.scene.markAllRenderDirty()
  }

  private applyRegularPolygonRecord(id: string, record: RegularPolygonSharedMap) {
    const ownerPointIds = this.readJsonStringArray(record, 'ownerPointIds')
    const dependentLayouts = this.readJsonRegularPolygonLayouts(record, 'dependentLayouts')
    if (ownerPointIds.length !== 2) return
    const ownerPointA = ownerPointIds[0]
    const ownerPointB = ownerPointIds[1]
    if (!ownerPointA || !ownerPointB) return
    if ([ownerPointA, ownerPointB].some((pointId) => !this.scene.points.has(pointId))) return
    if (dependentLayouts.some((layout) => !this.scene.points.has(layout.pointId))) return

    const faceId = this.readString(record, 'faceId', '')
    if (!this.scene.faces.has(faceId)) return

    const vertexCount = this.readNumber(record, 'vertexCount', 0)
    if (vertexCount < 3) return

    const vAxisHint = new Vec3(
      this.readNumber(record, 'vAxisHintX', 0),
      this.readNumber(record, 'vAxisHintY', 1),
      this.readNumber(record, 'vAxisHintZ', 0),
    )
    const name = this.readString(record, 'name', '正多边形1')
    const edgeLengthLocked = this.readBoolean(record, 'edgeLengthLocked', false)
    const lockedEdgeLength = this.readNullableNumber(record, 'lockedEdgeLength')
    const nameVisible = this.readBoolean(record, 'nameVisible', false)
    const valueVisible = this.readBoolean(record, 'valueVisible', false)

    ;[ownerPointA, ownerPointB].forEach((pointId) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.regularPolygonId = id
      point.regularPolygonRole = 'owner'
    })
    dependentLayouts.forEach(({ pointId }) => {
      const point = this.scene.points.get(pointId)
      if (!point) return
      point.regularPolygonId = id
      point.regularPolygonRole = 'dependent'
    })
    const face = this.scene.faces.get(faceId)
    if (face) {
      face.regularPolygonId = id
      face.regularPolygonVertexCount = vertexCount
      face.regularPolygonOwnerPointIds = [...ownerPointIds]
      face.regularPolygonDependentPointIds = dependentLayouts.map((layout) => layout.pointId)
      face.isRegularPolygon = true
    }

    const existing = this.scene.regularPolygonConstraints.get(id)
    if (existing instanceof RegularPolygonConstraint) {
      existing.ownerPointIds[0] = ownerPointA
      existing.ownerPointIds[1] = ownerPointB
      existing.dependentLayouts.splice(
        0,
        existing.dependentLayouts.length,
        ...dependentLayouts.map((layout) => ({ ...layout })),
      )
      existing.setAxisHint(vAxisHint)
      existing.name = name
      existing.edgeLengthLocked = edgeLengthLocked
      existing.lockedEdgeLength = lockedEdgeLength
      existing.nameVisible = nameVisible
      existing.valueVisible = valueVisible
      this.scene.requestConstraintSolve(this.scene.regularPolygonConstraints.get(id))
      this.scene.markAllRenderDirty()
      return
    }

    this.scene.addRegularPolygonConstraint(
      new RegularPolygonConstraint(
        this.scene,
        id,
        [ownerPointA, ownerPointB],
        dependentLayouts.map((layout) => ({ ...layout })),
        faceId,
        vertexCount,
        vAxisHint,
        name,
        edgeLengthLocked,
        lockedEdgeLength,
        nameVisible,
        valueVisible,
      ),
    )
    this.scene.requestConstraintSolve(this.scene.regularPolygonConstraints.get(id))
    this.scene.markAllRenderDirty()
  }

  private observePointRecord(id: string, record: PointSharedMap) {
    this.releaseRecordObserver(id, this.pointRecordCleanup)
    const handler = () => {
      this.applyPointRecord(id, record)
    }
    record.observe(handler)
    this.pointRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeLineRecord(id: string, record: LineSharedMap) {
    this.releaseRecordObserver(id, this.lineRecordCleanup)
    const handler = () => {
      this.applyLineRecord(id, record)
    }
    record.observe(handler)
    this.lineRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeStraightLineRecord(id: string, record: StraightLineSharedMap) {
    this.releaseRecordObserver(id, this.straightLineRecordCleanup)
    const handler = () => {
      this.applyStraightLineRecord(id, record)
    }
    record.observe(handler)
    this.straightLineRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeRayRecord(id: string, record: RaySharedMap) {
    this.releaseRecordObserver(id, this.rayRecordCleanup)
    const handler = () => {
      this.applyRayRecord(id, record)
    }
    record.observe(handler)
    this.rayRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeVectorRecord(id: string, record: VectorSharedMap) {
    this.releaseRecordObserver(id, this.vectorRecordCleanup)
    const handler = () => {
      this.applyVectorRecord(id, record)
    }
    record.observe(handler)
    this.vectorRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeCircleRecord(id: string, record: CircleSharedMap) {
    this.releaseRecordObserver(id, this.circleRecordCleanup)
    const handler = () => {
      this.applyCircleRecord(id, record)
    }
    record.observe(handler)
    this.circleRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeSphereRecord(id: string, record: SphereSharedMap) {
    this.releaseRecordObserver(id, this.sphereRecordCleanup)
    const handler = () => {
      this.applySphereRecord(id, record)
    }
    record.observe(handler)
    this.sphereRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeConeRecord(id: string, record: ConeSharedMap) {
    this.releaseRecordObserver(id, this.coneRecordCleanup)
    const handler = () => {
      this.applyConeRecord(id, record)
    }
    record.observe(handler)
    this.coneRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeCylinderRecord(id: string, record: CylinderSharedMap) {
    this.releaseRecordObserver(id, this.cylinderRecordCleanup)
    const handler = () => {
      this.applyCylinderRecord(id, record)
    }
    record.observe(handler)
    this.cylinderRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeIntersectionRecord(id: string, record: IntersectionSharedMap) {
    this.releaseRecordObserver(id, this.intersectionRecordCleanup)
    const handler = () => {
      this.applyIntersectionRecord(id, record)
    }
    record.observe(handler)
    this.intersectionRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeObjectConstrainedPointRecord(id: string, record: ObjectConstrainedPointSharedMap) {
    this.releaseRecordObserver(id, this.objectConstrainedPointRecordCleanup)
    const handler = () => {
      this.applyObjectConstrainedPointRecord(id, record)
    }
    record.observe(handler)
    this.objectConstrainedPointRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeFaceRecord(id: string, record: FaceSharedMap) {
    this.releaseRecordObserver(id, this.faceRecordCleanup)
    const handler = () => {
      this.applyFaceRecord(id, record)
    }
    record.observeDeep(handler)
    this.faceRecordCleanup.set(id, () => record.unobserveDeep(handler))
  }

  private observeCubeRecord(id: string, record: CubeSharedMap) {
    this.releaseRecordObserver(id, this.cubeRecordCleanup)
    const handler = () => {
      this.applyCubeRecord(id, record)
    }
    record.observe(handler)
    this.cubeRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private observeRegularPolygonRecord(id: string, record: RegularPolygonSharedMap) {
    this.releaseRecordObserver(id, this.regularPolygonRecordCleanup)
    const handler = () => {
      this.applyRegularPolygonRecord(id, record)
    }
    record.observe(handler)
    this.regularPolygonRecordCleanup.set(id, () => record.unobserve(handler))
  }

  private setupObservers() {
    this.pointsObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.pointRecordCleanup)
          this.removePointFromScene(id)
          return
        }

        const record = this.yPoints.get(id)
        if (!record) return
        this.observePointRecord(id, record)
        this.applyPointRecord(id, record)
      })
    }
    this.yPoints.observe(this.pointsObserver)
    this.yPoints.forEach((record, id) => {
      this.observePointRecord(id, record)
      this.applyPointRecord(id, record)
    })

    this.linesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.lineRecordCleanup)
          this.scene.lines.delete(id)
          this.scene.selection.lines.delete(id)
          return
        }

        const record = this.yLines.get(id)
        if (!record) return
        this.observeLineRecord(id, record)
        this.applyLineRecord(id, record)
      })
    }
    this.yLines.observe(this.linesObserver)
    this.yLines.forEach((record, id) => {
      this.observeLineRecord(id, record)
      this.applyLineRecord(id, record)
    })

    this.straightLinesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.straightLineRecordCleanup)
          this.scene.straightLines.delete(id)
          this.scene.selection.straightLines.delete(id)
          return
        }

        const record = this.yStraightLines.get(id)
        if (!record) return
        this.observeStraightLineRecord(id, record)
        this.applyStraightLineRecord(id, record)
      })
    }
    this.yStraightLines.observe(this.straightLinesObserver)
    this.yStraightLines.forEach((record, id) => {
      this.observeStraightLineRecord(id, record)
      this.applyStraightLineRecord(id, record)
    })

    this.raysObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.rayRecordCleanup)
          this.scene.rays.delete(id)
          this.scene.selection.rays.delete(id)
          return
        }

        const record = this.yRays.get(id)
        if (!record) return
        this.observeRayRecord(id, record)
        this.applyRayRecord(id, record)
      })
    }
    this.yRays.observe(this.raysObserver)
    this.yRays.forEach((record, id) => {
      this.observeRayRecord(id, record)
      this.applyRayRecord(id, record)
    })

    this.vectorsObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.vectorRecordCleanup)
          this.scene.vectors.delete(id)
          this.scene.selection.vectors.delete(id)
          return
        }

        const record = this.yVectors.get(id)
        if (!record) return
        this.observeVectorRecord(id, record)
        this.applyVectorRecord(id, record)
      })
    }
    this.yVectors.observe(this.vectorsObserver)
    this.yVectors.forEach((record, id) => {
      this.observeVectorRecord(id, record)
      this.applyVectorRecord(id, record)
    })

    this.circlesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.circleRecordCleanup)
          this.removeCircleFromScene(id)
          return
        }

        const record = this.yCircles.get(id)
        if (!record) return
        this.observeCircleRecord(id, record)
        this.applyCircleRecord(id, record)
      })
    }
    this.yCircles.observe(this.circlesObserver)
    this.yCircles.forEach((record, id) => {
      this.observeCircleRecord(id, record)
      this.applyCircleRecord(id, record)
    })

    this.spheresObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.sphereRecordCleanup)
          this.removeSphereFromScene(id)
          return
        }

        const record = this.ySpheres.get(id)
        if (!record) return
        this.observeSphereRecord(id, record)
        this.applySphereRecord(id, record)
      })
    }
    this.ySpheres.observe(this.spheresObserver)
    this.ySpheres.forEach((record, id) => {
      this.observeSphereRecord(id, record)
      this.applySphereRecord(id, record)
    })

    this.conesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.coneRecordCleanup)
          this.removeConeFromScene(id)
          return
        }

        const record = this.yCones.get(id)
        if (!record) return
        this.observeConeRecord(id, record)
        this.applyConeRecord(id, record)
      })
    }
    this.yCones.observe(this.conesObserver)
    this.yCones.forEach((record, id) => {
      this.observeConeRecord(id, record)
      this.applyConeRecord(id, record)
    })

    this.cylindersObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.cylinderRecordCleanup)
          this.removeCylinderFromScene(id)
          return
        }

        const record = this.yCylinders.get(id)
        if (!record) return
        this.observeCylinderRecord(id, record)
        this.applyCylinderRecord(id, record)
      })
    }
    this.yCylinders.observe(this.cylindersObserver)
    this.yCylinders.forEach((record, id) => {
      this.observeCylinderRecord(id, record)
      this.applyCylinderRecord(id, record)
    })

    this.intersectionsObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.intersectionRecordCleanup)
          this.scene.removeIntersectionConstraint(id)
          this.scene.markAllRenderDirty()
          return
        }

        const record = this.yIntersections.get(id)
        if (!record) return
        this.observeIntersectionRecord(id, record)
        this.applyIntersectionRecord(id, record)
      })
    }
    this.yIntersections.observe(this.intersectionsObserver)
    this.yIntersections.forEach((record, id) => {
      this.observeIntersectionRecord(id, record)
      this.applyIntersectionRecord(id, record)
    })

    this.objectConstrainedPointsObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.objectConstrainedPointRecordCleanup)
          this.scene.removeObjectConstrainedPointConstraint(id)
          this.scene.markAllRenderDirty()
          return
        }

        const record = this.yObjectConstrainedPoints.get(id)
        if (!record) return
        this.observeObjectConstrainedPointRecord(id, record)
        this.applyObjectConstrainedPointRecord(id, record)
      })
    }
    this.yObjectConstrainedPoints.observe(this.objectConstrainedPointsObserver)
    this.yObjectConstrainedPoints.forEach((record, id) => {
      this.observeObjectConstrainedPointRecord(id, record)
      this.applyObjectConstrainedPointRecord(id, record)
    })

    this.facesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.faceRecordCleanup)
          const face = this.scene.faces.get(id)
          if (face?.regularPolygonId) {
            this.scene.removeRegularPolygonConstraint(face.regularPolygonId)
          }
          this.scene.removeFace(id)
          return
        }

        const record = this.yFaces.get(id)
        if (!record) return
        this.observeFaceRecord(id, record)
        this.applyFaceRecord(id, record)
      })
    }
    this.yFaces.observe(this.facesObserver)
    this.yFaces.forEach((record, id) => {
      this.observeFaceRecord(id, record)
      this.applyFaceRecord(id, record)
    })

    this.cubesObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.cubeRecordCleanup)
          this.scene.removeCubeConstraint(id)
          this.scene.markAllRenderDirty()
          return
        }

        const record = this.yCubes.get(id)
        if (!record) return
        this.observeCubeRecord(id, record)
        this.applyCubeRecord(id, record)
      })
    }
    this.yCubes.observe(this.cubesObserver)
    this.yCubes.forEach((record, id) => {
      this.observeCubeRecord(id, record)
      this.applyCubeRecord(id, record)
    })

    this.regularPolygonsObserver = (event) => {
      event.changes.keys.forEach((change, id) => {
        if (change.action === 'delete') {
          this.releaseRecordObserver(id, this.regularPolygonRecordCleanup)
          this.scene.removeRegularPolygonConstraint(id)
          this.scene.markAllRenderDirty()
          return
        }

        const record = this.yRegularPolygons.get(id)
        if (!record) return
        this.observeRegularPolygonRecord(id, record)
        this.applyRegularPolygonRecord(id, record)
      })
    }
    this.yRegularPolygons.observe(this.regularPolygonsObserver)
    this.yRegularPolygons.forEach((record, id) => {
      this.observeRegularPolygonRecord(id, record)
      this.applyRegularPolygonRecord(id, record)
    })

    this.worldTransformObserver = () => {
      this.emitSharedWorldRotation(this.yWorldTransform)
    }
    this.yWorldTransform.observe(this.worldTransformObserver)
    this.emitSharedWorldRotation(this.yWorldTransform)
  }

  private syncPointRecord(record: PointSharedMap, point: Point3) {
    if (point.circleId && point.circleRole === 'center') {
      this.syncCircleCenterPointPosition(point.circleId)
    }
    this.setScalarField(record, 'x', point.position.x)
    this.setScalarField(record, 'y', point.position.y)
    this.setScalarField(record, 'z', point.position.z)
    this.setScalarField(record, 'name', point.name)
    this.setScalarField(record, 'nameVisible', point.nameVisible)
    this.setScalarField(record, 'valueVisible', point.valueVisible)
    this.setScalarField(record, 'labelOffsetX', point.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', point.labelOffsetY)
    this.setScalarField(record, 'userLocked', point.userLocked)
    this.setNullableScalarField(record, 'cubeId', point.cubeId)
    this.setNullableScalarField(record, 'cubeRole', point.cubeRole)
    this.setNullableScalarField(record, 'circleId', point.circleId)
    this.setNullableScalarField(record, 'circleRole', point.circleRole)
    this.setNullableScalarField(record, 'regularPolygonId', point.regularPolygonId)
    this.setNullableScalarField(record, 'regularPolygonRole', point.regularPolygonRole)
    this.setNullableScalarField(record, 'sphereId', point.sphereId)
    this.setNullableScalarField(record, 'sphereRole', point.sphereRole)
    this.setNullableScalarField(record, 'coneId', point.coneId)
    this.setNullableScalarField(record, 'coneRole', point.coneRole)
    this.setNullableScalarField(record, 'cylinderId', point.cylinderId)
    this.setNullableScalarField(record, 'cylinderRole', point.cylinderRole)
    const constrainedToType = point.constrainedTo?.type ?? null
    const constrainedToId = point.constrainedTo?.id ?? null
    this.setNullableScalarField(record, 'constrainedToType', constrainedToType)
    this.setNullableScalarField(record, 'constrainedToId', constrainedToId)
  }

  private syncLineRecord(record: LineSharedMap, line: Line3) {
    this.setScalarField(record, 'p1Id', line.p1.id)
    this.setScalarField(record, 'p2Id', line.p2.id)
    this.setScalarField(record, 'name', line.name)
    this.setScalarField(record, 'nameVisible', line.nameVisible)
    this.setScalarField(record, 'valueVisible', line.valueVisible)
    this.setScalarField(record, 'labelOffsetX', line.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', line.labelOffsetY)
    this.setScalarField(record, 'visible', line.visible)
    this.setScalarField(record, 'userLocked', line.userLocked)
    this.setScalarField(record, 'lengthLocked', line.lengthLocked)
    this.setScalarField(record, 'lockedLength', line.lockedLength)
    this.setScalarField(record, 'faceOwned', line.faceOwned)
    this.setScalarField(record, 'faceConstraintType', line.faceConstraintType ?? '')
  }

  private syncStraightLineRecord(record: StraightLineSharedMap, line: StraightLine3) {
    this.setScalarField(record, 'p1Id', line.p1.id)
    this.setScalarField(record, 'p2Id', line.p2.id)
    this.setScalarField(record, 'name', line.name)
    this.setScalarField(record, 'nameVisible', line.nameVisible)
    this.setScalarField(record, 'valueVisible', line.valueVisible)
    this.setScalarField(record, 'labelOffsetX', line.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', line.labelOffsetY)
    this.setScalarField(record, 'visible', line.visible)
    this.setScalarField(record, 'displayLength', line.displayLength)
    this.setScalarField(record, 'userLocked', line.userLocked)
  }

  private syncRayRecord(record: RaySharedMap, ray: Ray3) {
    this.setScalarField(record, 'p1Id', ray.p1.id)
    this.setScalarField(record, 'p2Id', ray.p2.id)
    this.setScalarField(record, 'name', ray.name)
    this.setScalarField(record, 'nameVisible', ray.nameVisible)
    this.setScalarField(record, 'valueVisible', ray.valueVisible)
    this.setScalarField(record, 'labelOffsetX', ray.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', ray.labelOffsetY)
    this.setScalarField(record, 'visible', ray.visible)
    this.setScalarField(record, 'displayLength', ray.displayLength)
    this.setScalarField(record, 'userLocked', ray.userLocked)
  }

  private syncVectorRecord(record: VectorSharedMap, vector: GeoVector3) {
    this.setScalarField(record, 'p1Id', vector.p1.id)
    this.setScalarField(record, 'p2Id', vector.p2.id)
    this.setScalarField(record, 'name', vector.name)
    this.setScalarField(record, 'nameVisible', vector.nameVisible)
    this.setScalarField(record, 'valueVisible', vector.valueVisible)
    this.setScalarField(record, 'labelOffsetX', vector.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', vector.labelOffsetY)
    this.setScalarField(record, 'visible', vector.visible)
    this.setScalarField(record, 'userLocked', vector.userLocked)
  }

  private syncCircleRecord(record: CircleSharedMap, circle: Circle3) {
    this.setScalarField(record, 'p1Id', circle.p1.id)
    this.setScalarField(record, 'p2Id', circle.p2.id)
    this.setScalarField(record, 'p3Id', circle.p3.id)
    this.setScalarField(record, 'name', circle.name)
    this.setScalarField(record, 'nameVisible', circle.nameVisible)
    this.setScalarField(record, 'valueVisible', circle.valueVisible)
    this.setScalarField(record, 'labelOffsetX', circle.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', circle.labelOffsetY)
    this.setScalarField(record, 'visible', circle.visible)
    this.setScalarField(record, 'userLocked', circle.userLocked)
    this.setScalarField(record, 'centerVisible', circle.centerVisible)
    this.setScalarField(record, 'circleType', circle.circleType)
    this.setNullableScalarField(record, 'directionType', circle.directionType)
    this.setNullableScalarField(record, 'directionId', circle.directionId)
    this.setNullableScalarField(record, 'lockedRadius', circle.lockedRadius)
  }

  private syncSphereRecord(record: SphereSharedMap, sphere: Sphere3) {
    this.setScalarField(record, 'centerPointId', sphere.centerPoint.id)
    this.setScalarField(record, 'radiusPointId', sphere.radiusPoint?.id ?? '')
    this.setScalarField(record, 'radiusValue', sphere.radiusValue)
    this.setScalarField(record, 'name', sphere.name)
    this.setScalarField(record, 'nameVisible', sphere.nameVisible)
    this.setScalarField(record, 'valueVisible', sphere.valueVisible)
    this.setScalarField(record, 'labelOffsetX', sphere.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', sphere.labelOffsetY)
    this.setScalarField(record, 'visible', sphere.visible)
    this.setScalarField(record, 'userLocked', sphere.userLocked)
  }

  private syncConeRecord(record: ConeSharedMap, cone: Cone3) {
    this.setScalarField(record, 'baseCenterPointId', cone.baseCenterPoint.id)
    this.setScalarField(record, 'apexPointId', cone.apexPoint.id)
    this.setScalarField(record, 'radiusValue', cone.radiusValue)
    this.setScalarField(record, 'coneType', cone.coneType)
    this.setNullableScalarField(record, 'normalCircleId', cone.normalCircleId)
    this.setScalarField(record, 'name', cone.name)
    this.setScalarField(record, 'nameVisible', cone.nameVisible)
    this.setScalarField(record, 'valueVisible', cone.valueVisible)
    this.setScalarField(record, 'labelOffsetX', cone.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', cone.labelOffsetY)
    this.setScalarField(record, 'visible', cone.visible)
    this.setScalarField(record, 'userLocked', cone.userLocked)
  }

  private syncCylinderRecord(record: CylinderSharedMap, cylinder: Cylinder3) {
    this.setScalarField(record, 'bottomCenterPointId', cylinder.bottomCenterPoint.id)
    this.setScalarField(record, 'topCenterPointId', cylinder.topCenterPoint.id)
    this.setScalarField(record, 'radiusValue', cylinder.radiusValue)
    this.setScalarField(record, 'cylinderType', cylinder.cylinderType)
    this.setNullableScalarField(record, 'normalCircleId', cylinder.normalCircleId)
    this.setNullableScalarField(record, 'topNormalCircleId', cylinder.topNormalCircleId)
    this.setScalarField(record, 'name', cylinder.name)
    this.setScalarField(record, 'nameVisible', cylinder.nameVisible)
    this.setScalarField(record, 'valueVisible', cylinder.valueVisible)
    this.setScalarField(record, 'labelOffsetX', cylinder.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', cylinder.labelOffsetY)
    this.setScalarField(record, 'visible', cylinder.visible)
    this.setScalarField(record, 'userLocked', cylinder.userLocked)
  }

  private syncIntersectionRecord(record: IntersectionSharedMap, constraint: IntersectionPointConstraint) {
    this.setScalarField(record, 'sourceAType', constraint.sourceA.type)
    this.setScalarField(record, 'sourceAId', constraint.sourceA.id)
    this.setScalarField(record, 'sourceBType', constraint.sourceB.type)
    this.setScalarField(record, 'sourceBId', constraint.sourceB.id)
  }

  private syncObjectConstrainedPointRecord(record: ObjectConstrainedPointSharedMap, constraint: ObjectConstrainedPointConstraint) {
    this.setScalarField(record, 'targetType', constraint.target.type)
    this.setScalarField(record, 'targetId', constraint.target.id)
    this.setScalarField(record, 'parametricData', constraint.parametricData ? JSON.stringify(constraint.parametricData) : '')
  }

  private syncFaceRecord(record: FaceSharedMap, face: PlanarPolygon) {
    this.setScalarField(record, 'name', face.name)
    this.setScalarField(record, 'nameVisible', face.nameVisible)
    this.setScalarField(record, 'valueVisible', face.valueVisible)
    this.setScalarField(record, 'labelOffsetX', face.labelOffsetX)
    this.setScalarField(record, 'labelOffsetY', face.labelOffsetY)
    this.setScalarField(record, 'visible', face.visible)
    this.setScalarField(record, 'userLocked', face.userLocked)
    this.setScalarField(record, 'areaLocked', face.areaLocked)
    this.setScalarField(record, 'lockedArea', face.lockedArea)
    this.setNullableScalarField(record, 'fillColor', face.fillColor)
    this.setNullableScalarField(record, 'fillOpacity', face.fillOpacity)
    this.setNullableScalarField(record, 'cubeId', face.cubeId)
    this.syncFaceArrayField(record, 'edgeLengthLocks', [...face.edgeLengthLocks])
    this.syncFaceArrayField(record, 'boundaryPointIds', [...face.boundaryPointIds])
    this.syncFaceArrayField(record, 'memberPointIds', [...face.memberPointIds])
    this.syncFaceArrayField(record, 'boundaryLineIds', [...face.boundaryLineIds])
    this.syncFaceArrayField(record, 'supportPointIds', [...face.supportPointIds])
    this.syncFaceArrayField(record, 'cubeOwnerPointIds', [...face.cubeOwnerPointIds])
    this.syncFaceArrayField(record, 'cubeDependentPointIds', [...face.cubeDependentPointIds])
    this.setScalarField(record, 'isRegularPolygon', face.isRegularPolygon)
    this.setScalarField(record, 'regularPolygonVertexCount', face.regularPolygonVertexCount)
    this.setNullableScalarField(record, 'regularPolygonId', face.regularPolygonId)
    this.syncFaceArrayField(record, 'regularPolygonOwnerPointIds', [...face.regularPolygonOwnerPointIds])
    this.syncFaceArrayField(record, 'regularPolygonDependentPointIds', [...face.regularPolygonDependentPointIds])
  }

  private syncCubeRecord(record: CubeSharedMap, cube: CubeConstraint) {
    this.setScalarField(record, 'solidType', cube.solidType)
    this.setScalarField(record, 'ownerPointIds', JSON.stringify([...cube.ownerPointIds]))
    this.setScalarField(record, 'dependentLayouts', JSON.stringify(cube.dependentLayouts))
    this.setScalarField(record, 'faceIds', JSON.stringify([...cube.faceIds]))
    this.setNullableScalarField(record, 'sourceLineId', cube.sourceLineId)
    const axes = cube.getResolvedAxes()
    const axisHint = axes?.vAxis ?? new Vec3(0, 1, 0)
    this.setScalarField(record, 'vAxisHintX', axisHint.x)
    this.setScalarField(record, 'vAxisHintY', axisHint.y)
    this.setScalarField(record, 'vAxisHintZ', axisHint.z)
    this.setScalarField(record, 'name', cube.name)
    this.setScalarField(record, 'valueVisible', cube.valueVisible)
    this.setScalarField(record, 'edgeLengthLocked', cube.edgeLengthLocked)
    this.setNullableScalarField(record, 'lockedEdgeLength', cube.lockedEdgeLength)
  }

  private syncRegularPolygonRecord(record: RegularPolygonSharedMap, constraint: RegularPolygonConstraint) {
    this.setScalarField(record, 'ownerPointIds', JSON.stringify([...constraint.ownerPointIds]))
    this.setScalarField(record, 'dependentLayouts', JSON.stringify(constraint.dependentLayouts))
    this.setScalarField(record, 'faceId', constraint.faceId)
    this.setScalarField(record, 'vertexCount', constraint.vertexCount)
    const axisHint = constraint.getVAxisHint()
    this.setScalarField(record, 'vAxisHintX', axisHint.x)
    this.setScalarField(record, 'vAxisHintY', axisHint.y)
    this.setScalarField(record, 'vAxisHintZ', axisHint.z)
    this.setScalarField(record, 'name', constraint.name)
    this.setScalarField(record, 'edgeLengthLocked', constraint.edgeLengthLocked)
    this.setNullableScalarField(record, 'lockedEdgeLength', constraint.lockedEdgeLength)
    this.setScalarField(record, 'nameVisible', constraint.nameVisible)
    this.setScalarField(record, 'valueVisible', constraint.valueVisible)
  }

  getSharedWorldRotationState() {
    return this.readSharedWorldRotationState()
  }

  canRotateSharedWorld() {
    const state = this.readSharedWorldRotationState()
    const now = Date.now()
    return (
      state.ownerClientId === null ||
      state.ownerClientId === this.getLocalClientId() ||
      state.ownerUpdatedAt === null ||
      now - state.ownerUpdatedAt > CollabManager.WORLD_ROTATION_OWNER_TIMEOUT_MS
    )
  }

  tryAcquireSharedWorldRotationOwnership() {
    if (!this.provider || this.roomName === null) return true
    if (!this.canRotateSharedWorld()) return false
    const record = this.getSharedWorldTransformRecord()
    this.ydoc.transact(() => {
      this.writeWorldRotationOwnerHeartbeat(record)
    })
    this.ensureWorldRotationOwnerHeartbeat()
    this.emitSharedWorldRotation(record)
    return true
  }

  releaseSharedWorldRotationOwnership() {
    if (!this.provider || this.roomName === null) return
    const state = this.readSharedWorldRotationState()
    if (state.ownerClientId !== this.getLocalClientId()) return
    this.stopWorldRotationOwnerHeartbeat()
    const record = this.getSharedWorldTransformRecord()
    this.ydoc.transact(() => {
      if (record.has('ownerClientId')) record.delete('ownerClientId')
      if (record.has('ownerUpdatedAt')) record.delete('ownerUpdatedAt')
      if (record.has('ownerName')) record.delete('ownerName')
    })
    this.emitSharedWorldRotation(record)
  }

  syncSharedWorldQuaternion(quaternion: { x: number; y: number; z: number; w: number }) {
    if (!this.provider || this.roomName === null) return
    if (!this.tryAcquireSharedWorldRotationOwnership()) return
    const record = this.getSharedWorldTransformRecord()
    this.ydoc.transact(() => {
      this.setScalarField(record, 'qx', quaternion.x)
      this.setScalarField(record, 'qy', quaternion.y)
      this.setScalarField(record, 'qz', quaternion.z)
      this.setScalarField(record, 'qw', quaternion.w)
      this.writeWorldRotationOwnerHeartbeat(record)
    })
    this.ensureWorldRotationOwnerHeartbeat()
    this.emitSharedWorldRotation(record)
  }

  syncAction() {
    if (!this.provider || this.roomName === null) return

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

  syncLivePreview(pointIds: Iterable<string>, labelTarget: LiveLabelTarget | null = null) {
    if (!this.provider || this.roomName === null) return

    this.markPreviewPointsDirty(pointIds)
    this.markPreviewLabelDirty(labelTarget)
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
    if (!this.provider || this.roomName === null) return

    this.markSceneDirty()
    this.syncDirtyNow()
  }

  private syncDirtyNow() {
    if (!this.provider || this.roomName === null) return

    const pointIds = [...this.dirtyPointIds]
    const lineIds = [...this.dirtyLineIds]
    const straightLineIds = [...this.dirtyStraightLineIds]
    const rayIds = [...this.dirtyRayIds]
    const vectorIds = [...this.dirtyVectorIds]
    const circleIds = [...this.dirtyCircleIds]
    const sphereIds = [...this.dirtySphereIds]
    const coneIds = [...this.dirtyConeIds]
    const cylinderIds = [...this.dirtyCylinderIds]
    const intersectionIds = [...this.dirtyIntersectionIds]
    const faceIds = [...this.dirtyFaceIds]
    const cubeIds = [...this.dirtyCubeIds]
    const regularPolygonIds = [...this.dirtyRegularPolygonIds]
    const deletedPointIds = [...this.deletedPointIds]
    const deletedLineIds = [...this.deletedLineIds]
    const deletedStraightLineIds = [...this.deletedStraightLineIds]
    const deletedRayIds = [...this.deletedRayIds]
    const deletedVectorIds = [...this.deletedVectorIds]
    const deletedCircleIds = [...this.deletedCircleIds]
    const deletedSphereIds = [...this.deletedSphereIds]
    const deletedConeIds = [...this.deletedConeIds]
    const deletedCylinderIds = [...this.deletedCylinderIds]
    const deletedIntersectionIds = [...this.deletedIntersectionIds]
    const deletedFaceIds = [...this.deletedFaceIds]
    const deletedCubeIds = [...this.deletedCubeIds]
    const deletedRegularPolygonIds = [...this.deletedRegularPolygonIds]
    const objectConstrainedPointIds = [...this.dirtyObjectConstrainedPointIds]
    const deletedObjectConstrainedPointIds = [...this.deletedObjectConstrainedPointIds]

    if (
      pointIds.length === 0 &&
      lineIds.length === 0 &&
      straightLineIds.length === 0 &&
      rayIds.length === 0 &&
      vectorIds.length === 0 &&
      circleIds.length === 0 &&
      sphereIds.length === 0 &&
      coneIds.length === 0 &&
      cylinderIds.length === 0 &&
      intersectionIds.length === 0 &&
      objectConstrainedPointIds.length === 0 &&
      faceIds.length === 0 &&
      cubeIds.length === 0 &&
      regularPolygonIds.length === 0 &&
      deletedPointIds.length === 0 &&
      deletedLineIds.length === 0 &&
      deletedStraightLineIds.length === 0 &&
      deletedRayIds.length === 0 &&
      deletedVectorIds.length === 0 &&
      deletedCircleIds.length === 0 &&
      deletedSphereIds.length === 0 &&
      deletedConeIds.length === 0 &&
      deletedCylinderIds.length === 0 &&
      deletedIntersectionIds.length === 0 &&
      deletedObjectConstrainedPointIds.length === 0 &&
      deletedFaceIds.length === 0 &&
      deletedCubeIds.length === 0 &&
      deletedRegularPolygonIds.length === 0
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
      deletedVectorIds.forEach((id) => {
        this.yVectors.delete(id)
      })
      deletedCircleIds.forEach((id) => {
        this.yCircles.delete(id)
      })
      deletedSphereIds.forEach((id) => {
        this.ySpheres.delete(id)
      })
      deletedConeIds.forEach((id) => {
        this.yCones.delete(id)
      })
      deletedCylinderIds.forEach((id) => {
        this.yCylinders.delete(id)
      })
      deletedIntersectionIds.forEach((id) => {
        this.yIntersections.delete(id)
      })
      deletedObjectConstrainedPointIds.forEach((id) => {
        this.yObjectConstrainedPoints.delete(id)
      })
      deletedFaceIds.forEach((id) => {
        this.yFaces.delete(id)
      })
      deletedCubeIds.forEach((id) => {
        this.yCubes.delete(id)
      })
      deletedRegularPolygonIds.forEach((id) => {
        this.yRegularPolygons.delete(id)
      })

      pointIds.forEach((id) => {
        const p = this.scene.points.get(id)
        if (!p) {
          if (id !== Scene.ORIGIN_ID) this.yPoints.delete(id)
          return
        }
        this.syncPointRecord(this.ensurePointRecord(id), p)
      })

      lineIds.forEach((id) => {
        const l = this.scene.lines.get(id)
        if (!l) {
          this.yLines.delete(id)
          return
        }
        this.syncLineRecord(this.ensureLineRecord(id), l)
      })

      straightLineIds.forEach((id) => {
        const line = this.scene.straightLines.get(id)
        if (!line) {
          this.yStraightLines.delete(id)
          return
        }
        this.syncStraightLineRecord(this.ensureStraightLineRecord(id), line)
      })

      rayIds.forEach((id) => {
        const ray = this.scene.rays.get(id)
        if (!ray) {
          this.yRays.delete(id)
          return
        }
        this.syncRayRecord(this.ensureRayRecord(id), ray)
      })

      vectorIds.forEach((id) => {
        const vector = this.scene.vectors.get(id)
        if (!vector) {
          this.yVectors.delete(id)
          return
        }
        this.syncVectorRecord(this.ensureVectorRecord(id), vector)
      })

      circleIds.forEach((id) => {
        const circle = this.scene.circles.get(id)
        if (!circle) {
          this.yCircles.delete(id)
          return
        }
        this.syncCircleRecord(this.ensureCircleRecord(id), circle)
      })

      sphereIds.forEach((id) => {
        const sphere = this.scene.spheres.get(id)
        if (!sphere) {
          this.ySpheres.delete(id)
          return
        }
        this.syncSphereRecord(this.ensureSphereRecord(id), sphere)
      })

      coneIds.forEach((id) => {
        const cone = this.scene.cones.get(id)
        if (!cone) {
          this.yCones.delete(id)
          return
        }
        this.syncConeRecord(this.ensureConeRecord(id), cone)
      })

      cylinderIds.forEach((id) => {
        const cylinder = this.scene.cylinders.get(id)
        if (!cylinder) {
          this.yCylinders.delete(id)
          return
        }
        this.syncCylinderRecord(this.ensureCylinderRecord(id), cylinder)
      })

      intersectionIds.forEach((id) => {
        const constraint = this.scene.getIntersectionConstraint(id)
        if (!(constraint instanceof IntersectionPointConstraint)) {
          this.yIntersections.delete(id)
          return
        }
        this.syncIntersectionRecord(this.ensureIntersectionRecord(id), constraint)
      })

      faceIds.forEach((id) => {
        const face = this.scene.faces.get(id)
        if (!face) {
          this.yFaces.delete(id)
          return
        }
        this.syncFaceRecord(this.ensureFaceRecord(id), face)
      })

      cubeIds.forEach((id) => {
        const cube = this.scene.getCubeConstraint(id)
        if (!(cube instanceof CubeConstraint)) {
          this.yCubes.delete(id)
          return
        }
        this.syncCubeRecord(this.ensureCubeRecord(id), cube)
      })

      regularPolygonIds.forEach((id) => {
        const constraint = this.scene.regularPolygonConstraints.get(id)
        if (!(constraint instanceof RegularPolygonConstraint)) {
          this.yRegularPolygons.delete(id)
          return
        }
        this.syncRegularPolygonRecord(this.ensureRegularPolygonRecord(id), constraint)
      })

      objectConstrainedPointIds.forEach((id) => {
        const constraint = this.scene.objectConstrainedPointConstraints.get(id)
        if (!(constraint instanceof ObjectConstrainedPointConstraint)) {
          this.yObjectConstrainedPoints.delete(id)
          return
        }
        this.syncObjectConstrainedPointRecord(this.ensureObjectConstrainedPointRecord(id), constraint)
      })
    })

    pointIds.forEach((id) => this.dirtyPointIds.delete(id))
    lineIds.forEach((id) => this.dirtyLineIds.delete(id))
    straightLineIds.forEach((id) => this.dirtyStraightLineIds.delete(id))
    rayIds.forEach((id) => this.dirtyRayIds.delete(id))
    vectorIds.forEach((id) => this.dirtyVectorIds.delete(id))
    circleIds.forEach((id) => this.dirtyCircleIds.delete(id))
    sphereIds.forEach((id) => this.dirtySphereIds.delete(id))
    coneIds.forEach((id) => this.dirtyConeIds.delete(id))
    cylinderIds.forEach((id) => this.dirtyCylinderIds.delete(id))
    intersectionIds.forEach((id) => this.dirtyIntersectionIds.delete(id))
    objectConstrainedPointIds.forEach((id) => this.dirtyObjectConstrainedPointIds.delete(id))
    faceIds.forEach((id) => this.dirtyFaceIds.delete(id))
    cubeIds.forEach((id) => this.dirtyCubeIds.delete(id))
    regularPolygonIds.forEach((id) => this.dirtyRegularPolygonIds.delete(id))
    deletedPointIds.forEach((id) => this.deletedPointIds.delete(id))
    deletedLineIds.forEach((id) => this.deletedLineIds.delete(id))
    deletedStraightLineIds.forEach((id) => this.deletedStraightLineIds.delete(id))
    deletedRayIds.forEach((id) => this.deletedRayIds.delete(id))
    deletedVectorIds.forEach((id) => this.deletedVectorIds.delete(id))
    deletedCircleIds.forEach((id) => this.deletedCircleIds.delete(id))
    deletedSphereIds.forEach((id) => this.deletedSphereIds.delete(id))
    deletedConeIds.forEach((id) => this.deletedConeIds.delete(id))
    deletedObjectConstrainedPointIds.forEach((id) => this.deletedObjectConstrainedPointIds.delete(id))
    deletedCylinderIds.forEach((id) => this.deletedCylinderIds.delete(id))
    deletedIntersectionIds.forEach((id) => this.deletedIntersectionIds.delete(id))
    deletedFaceIds.forEach((id) => this.deletedFaceIds.delete(id))
    deletedCubeIds.forEach((id) => this.deletedCubeIds.delete(id))
    deletedRegularPolygonIds.forEach((id) => this.deletedRegularPolygonIds.delete(id))
  }
}
