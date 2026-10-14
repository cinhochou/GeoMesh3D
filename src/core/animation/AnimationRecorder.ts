// src/core/animation/AnimationRecorder.ts
// 操作录像机的录制器。
//
// 通过旁听 HistoryManager 的 push 事件，把每一次真实操作记录为一个操作步。
// 与历史系统完全解耦：只读监听，不修改、不拦截、不 push。
//
// 存储策略：首帧 baseSnapshot 全量 + 每步增量 diff + 周期性全量锚点。

import type { Scene, SceneConstraint } from '../scene/Scene'
import type { Point3 } from '../geometry/Point3'
import type { SerializedScene } from '../editor/SceneSerializer'
import { takeFullSnapshot } from '../editor/commands/SnapshotCommand'
import type { HistoryPushEvent, HistoryNavEvent } from '../editor/HistoryManager'
import type { CollabOperationIntent } from '../../types/collabIntent'
import { diffSnapshot } from './SnapshotDelta'
import {
  type AnimationDocument,
  type AnimationStep,
  type RecordingSession,
  type SceneSnapshot,
  type StepIntent,
  type FocusTarget,
} from './types'

const genId = (prefix: string): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 录制段配色（循环取用） */
const SESSION_COLORS = ['#4a9eff', '#ff8a4a', '#4aff9e', '#ff4a9e', '#c44aff', '#ffd24a']

/**
 * 元素对「主体完整几何范围」的一项贡献：以「球（中心 + 半径）」表示。
 * 半径 0 表示点这类无体积元素；球/锥/柱等有体积元素必须给出真实半径。
 */
interface FocusBounds {
  cx: number
  cy: number
  cz: number
  radius: number
}

interface RecorderCallbacks {
  /** 录制状态变化（开始/新增一步/暂停/继续/结束） */
  onChange?: () => void
  /** 超过步数上限 */
  onLimitReached?: (limit: number) => void
}

export class AnimationRecorder {
  /**
   * 录制期间的「上一步快照」（JS 对象，非 JSON 字符串）：
   * 用于计算下一步的增量。首步相对 baseSnapshot。
   */
  private lastSnapshot: SceneSnapshot | null = null

  /** 当前正在录制的会话（未录制时为 null） */
  private current: RecordingSession | null = null

  /** 是否暂停（暂停时保留会话，但不累积新步） */
  private paused = false

  /** 已累计的暂停总时长（毫秒），用于 offsetMs 对齐真实操作时间 */
  private pausedAccumMs = 0

  /** 本次暂停的开始时刻（performance.now()，未暂停为 0） */
  private pauseStartedAt = 0

  private startedAt = 0

  constructor(
    private readonly scene: Scene,
    private readonly document: AnimationDocument,
    private readonly callbacks: RecorderCallbacks = {},
  ) {}

  get isRecording(): boolean {
    return this.current !== null
  }

  /** 是否处于暂停（仅在录制中才有意义） */
  get isPaused(): boolean {
    return this.current !== null && this.paused
  }

  /** 是否正在累积新步（录制中且未暂停） */
  get isCapturing(): boolean {
    return this.current !== null && !this.paused
  }

  get currentSessionId(): string | null {
    return this.current?.id ?? null
  }

  get currentStepCount(): number {
    return this.current?.steps.length ?? 0
  }

  /** 当前录制中的会话（只读快照，供 UI 展示） */
  getCurrentSession(): RecordingSession | null {
    return this.current
  }

  /**
   * 开始录制：抓取起点快照，建立新会话。
   * @param name 会话名（缺省自动命名）
   */
  start(name?: string): RecordingSession {
    if (this.current) {
      // 已在录制：直接返回当前会话（幂等）
      return this.current
    }

    const baseSnapshot = takeFullSnapshot(this.scene)
    const index = this.document.sessions.length + 1
    const session: RecordingSession = {
      id: genId('sess'),
      name: name ?? `录制 ${index}`,
      color: SESSION_COLORS[(index - 1) % SESSION_COLORS.length]!,
      createdAt: Date.now(),
      durationMs: 0,
      baseSnapshot,
      steps: [],
    }

    this.current = session
    this.lastSnapshot = baseSnapshot
    this.paused = false
    this.pausedAccumMs = 0
    this.pauseStartedAt = 0
    this.startedAt = performance.now()
    this.callbacks.onChange?.()
    return session
  }

  /**
   * 暂停录制：保留会话与「上一步快照」，但不再累积新步。
   * 恢复后从暂停时的基准继续做增量，因此暂停期间的操作不会丢失、
   * 而是会被合并进「恢复后的第一步」的增量里。
   */
  pause(): void {
    if (!this.current || this.paused) return
    this.paused = true
    this.pauseStartedAt = performance.now()
    this.callbacks.onChange?.()
  }

  /** 恢复录制 */
  resume(): void {
    if (!this.current || !this.paused) return
    this.paused = false
    if (this.pauseStartedAt > 0) {
      this.pausedAccumMs += performance.now() - this.pauseStartedAt
      this.pauseStartedAt = 0
    }
    this.callbacks.onChange?.()
  }

  /**
   * 结束录制：封存会话加入文档，返回该会话。
   * 返回 null 表示当前没有在录制。
   */
  stop(): RecordingSession | null {
    if (!this.current) return null
    const session = this.current
    session.durationMs = this.elapsedMs()
    this.current = null
    this.lastSnapshot = null
    this.paused = false
    this.pausedAccumMs = 0
    this.pauseStartedAt = 0

    // 只有记录了至少一步才保留（避免空会话）
    if (session.steps.length > 0) {
      this.document.sessions.push(session)
      this.document.meta.updatedAt = Date.now()
      if (!this.document.activeSessionId) {
        this.document.activeSessionId = session.id
      }
    }
    this.callbacks.onChange?.()
    return session
  }

  /** 放弃当前录制（不封存） */
  discard(): void {
    this.current = null
    this.lastSnapshot = null
    this.paused = false
    this.pausedAccumMs = 0
    this.pauseStartedAt = 0
    this.callbacks.onChange?.()
  }

  /** 累计录制时长（扣掉暂停时间） */
  private elapsedMs(): number {
    const now = performance.now()
    const pauseExtra = this.paused && this.pauseStartedAt > 0 ? now - this.pauseStartedAt : 0
    return now - this.startedAt - this.pausedAccumMs - pauseExtra
  }

  /**
   * 旁听挂点：HistoryManager 每次真实入栈时调用。
   * 只有处于「录制中且未暂停」状态才处理。
   */
  onOperationPushed(event: HistoryPushEvent): void {
    if (!this.current) return
    if (this.paused) return

    const focusElementIds = extractFocusElementIds(event)
    // 优先用「操作后」的场景求聚焦目标；
    // 删除类操作的目标已消失，回退到「操作前」快照里求位置（否则相机不会动到被删对象处）。
    const focusTarget =
      this.computeFocusTarget(focusElementIds) ??
      computeFocusTargetFromSerialized(event.before, focusElementIds)

    this.captureStep({
      label: event.entry.label,
      intent: extractStepIntent(event),
      focusElementIds,
      focusTarget,
    })
  }

  /**
   * 旁听挂点：撤销/重做发生时调用。
   *
   * 默认**不记录**（用户要求「播放是另一套系统，不掺入撤销/重做」）；
   * 仅当设置项 `recordUndoRedo` 开启时才把撤销/重做本身也记为一个操作步，
   * 便于演示「走错再撤销」这类教学过程。
   */
  onHistoryNav(event: HistoryNavEvent): void {
    if (!this.current) return
    if (this.paused) return
    if (!this.document.settings.recordUndoRedo) return

    // 撤销/重做后场景回到历史条目对应状态，几何位置直接取当前场景
    const focusElementIds = extractFocusElementIds({ entry: event.entry })
    const focusTarget = this.computeFocusTarget(focusElementIds)

    this.captureStep({
      label: `${event.action === 'undo' ? '撤销' : '重做'}：${event.entry.label}`,
      intent: {
        category: event.action,
        targetType: null,
        targetName: event.entry.label,
        subject: event.entry.label,
        note: null,
      },
      focusElementIds,
      focusTarget,
    })
  }

  /**
   * 统一记一步：抓当前快照 → 算增量 → 组装 AnimationStep 入列。
   * 被「操作入栈」与「撤销/重做」两条旁听路径共用。
   */
  private captureStep(input: {
    label: string
    intent?: StepIntent
    focusElementIds: string[]
    focusTarget?: FocusTarget
  }): void {
    if (!this.current) return

    const settings = this.document.settings
    if (this.current.steps.length >= settings.maxStepsPerSession) {
      this.callbacks.onLimitReached?.(settings.maxStepsPerSession)
      return
    }

    const nextSnapshot: SceneSnapshot = takeFullSnapshot(this.scene)
    const prevSnapshot = this.lastSnapshot ?? this.current.baseSnapshot
    const delta = diffSnapshot(prevSnapshot, nextSnapshot)

    const steps = this.current.steps
    const index = steps.length
    const isAnchor = index > 0 && index % settings.anchorInterval === 0

    const step: AnimationStep = {
      id: genId('step'),
      index,
      label: input.label,
      intent: input.intent,
      delta,
      offsetMs: this.elapsedMs(),
      focusElementIds: input.focusElementIds,
      focusTarget: input.focusTarget,
      isAnchor,
      anchorSnapshot: isAnchor ? nextSnapshot : undefined,
    }

    steps.push(step)
    this.lastSnapshot = nextSnapshot
    this.current.durationMs = this.elapsedMs()
    this.callbacks.onChange?.()
  }

  /**
   * 计算聚焦目标：遍历场景中被操作对象的点，求 AABB → 中心 + 包围球半径。
   * 仅在录制时算一次，回放零成本。
   */
  /**
   * 计算「本步主体对象的完整几何范围」。
   *
   * ⚠ 关键：不能只取「构成点」的包围盒。有体积的几何体（球/锥/柱）其构成点只有
   * 球心 + 半径点、底心 + 顶点这类**骨架点**，骨架点集的包围球半径只有真实值的一半，
   * 相机聚焦后实体必然被视锥裁掉一部分——这正是「只能看到正六面体/球体的一部分」的成因。
   * 因此本函数按类型给出真正覆盖几何表面的范围：
   *  - 球：球心 + **真实半径**（由 Sphere3.getRadius 得到）
   *  - 锥：底面圆（底心 + 底半径）+ 顶点
   *  - 柱：上下底圆（各自圆心 + 半径）
   *  - 圆：圆心 + 半径
   *  - 正六面体/棱柱/棱锥/正多边形/面等约束型几何：取其**全部依赖点**（含派生顶点）
   *  - 线/射线/向量：两端点；点：其自身
   *  - 兜底：按归属字段（sphereId/coneId/cubeId/…）扫描出的点
   */
  private computeFocusTarget(elementIds: string[]): FocusTarget | undefined {
    if (elementIds.length === 0) return undefined

    const bounds: FocusBounds[] = []
    for (const id of elementIds) this.collectFocusBounds(id, bounds)
    if (bounds.length === 0) return undefined

    // 聚焦中心 = 各贡献范围并集的轴对齐包围盒中心
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    for (const b of bounds) {
      if (b.cx - b.radius < minX) minX = b.cx - b.radius
      if (b.cy - b.radius < minY) minY = b.cy - b.radius
      if (b.cz - b.radius < minZ) minZ = b.cz - b.radius
      if (b.cx + b.radius > maxX) maxX = b.cx + b.radius
      if (b.cy + b.radius > maxY) maxY = b.cy + b.radius
      if (b.cz + b.radius > maxZ) maxZ = b.cz + b.radius
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const cz = (minZ + maxZ) / 2

    // 半径 = 中心到各贡献球面的最大距离。
    // 对纯点集，该值与「半对角线」等价（不改变原有行为）；对球/锥/柱则给出真实外接半径。
    let radius = 0
    for (const b of bounds) {
      const d = Math.hypot(b.cx - cx, b.cy - cy, b.cz - cz) + b.radius
      if (d > radius) radius = d
    }

    return { position: [cx, cy, cz], radius: Math.max(radius, 0.5) }
  }

  /** 把某元素覆盖的几何范围追加到 out（见 computeFocusTarget 的类型说明） */
  private collectFocusBounds(elementId: string, out: FocusBounds[]): void {
    const pushPoint = (p: Point3 | null | undefined) => {
      if (!p) return
      out.push({ cx: p.position.x, cy: p.position.y, cz: p.position.z, radius: 0 })
    }
    const pushBall = (
      center: { x: number; y: number; z: number },
      radius: number,
    ) => {
      out.push({ cx: center.x, cy: center.y, cz: center.z, radius: Math.max(radius, 0) })
    }

    // 点本身
    const point = this.scene.points.get(elementId)
    if (point) {
      pushPoint(point)
      return
    }

    // 球：必须带真实半径，否则范围只有「球心→半径点」的一半
    const sphere = this.scene.spheres.get(elementId)
    if (sphere) {
      pushBall(sphere.centerPoint.position, sphere.getRadius())
      return
    }

    // 锥：底面圆盘 + 顶点。
    // 注意用「圆盘」而不是「球」——球会在轴向额外扩张半径，
    // 使包围范围虚大（实测半径从 2.5 虚增到 3.5），主体在画面里显得偏小。
    const cone = this.scene.cones.get(elementId)
    if (cone) {
      const base = cone.baseCenterPoint.position
      const apex = cone.apexPoint.position
      this.pushDiscExtremes(out, base, cone.getRadius(), {
        x: apex.x - base.x,
        y: apex.y - base.y,
        z: apex.z - base.z,
      })
      pushPoint(cone.apexPoint)
      return
    }

    // 柱：上下底圆盘（两者都要计入，否则柱体会有一端被裁掉）
    const cylinder = this.scene.cylinders.get(elementId)
    if (cylinder) {
      const bottom = cylinder.bottomCenterPoint.position
      const top = cylinder.topCenterPoint.position
      const axis = { x: top.x - bottom.x, y: top.y - bottom.y, z: top.z - bottom.z }
      this.pushDiscExtremes(out, bottom, cylinder.getRadius(), axis)
      this.pushDiscExtremes(out, top, cylinder.getRadius(), axis)
      return
    }

    // 圆：圆心 + 半径（覆盖整个圆面，而不是只覆盖三个定义点）
    const circle = this.scene.circles.get(elementId)
    if (circle) {
      // ⚠ 法向圆必须传入**解析出的法向量**：
      // Circle3.getFrame() 在法向圆缺少法向量时直接返回 null（方向来自线/射线/向量
      // 而非「点」的情况），旧代码于是退回 pushPoint(circle.p1) —— 而法向圆的 p1
      // 就是**圆心**，结果整步聚焦只有圆心一个点、圆完全不在画面里（用户反馈）。
      const axis = this.scene.resolveNormalCircleDirection(circle)
      const frame = circle.getFrame(axis)
      if (frame) {
        // 用「圆盘」而不是「球」：圆是平面图形，球会在法向额外扩张半径，
        // 使包围范围虚大、主体在画面里偏小（与圆锥/圆柱同一处理）。
        this.pushDiscExtremes(out, frame.center, frame.radius, frame.normal)
      } else {
        pushPoint(circle.p1)
        pushPoint(circle.p2)
        pushPoint(circle.p3)
      }
      return
    }

    // 线 / 直线 / 射线 / 向量：两端点
    const line = this.scene.lines.get(elementId)
    if (line) {
      pushPoint(line.p1)
      pushPoint(line.p2)
      return
    }
    const straightLine = this.scene.straightLines.get(elementId)
    if (straightLine) {
      pushPoint(straightLine.p1)
      pushPoint(straightLine.p2)
      return
    }
    const ray = this.scene.rays.get(elementId)
    if (ray) {
      pushPoint(ray.p1)
      pushPoint(ray.p2)
      return
    }
    const vector = this.scene.vectors.get(elementId)
    if (vector) {
      pushPoint(vector.p1)
      pushPoint(vector.p2)
      return
    }

    // 约束型几何体（正六面体/棱柱/棱锥/正多边形/面/交点/受约束点）：
    // 统一取「全部依赖点」——它包含用户选定的 owner 点与求解派生的顶点，
    // 是覆盖整个实体的可靠来源（不依赖点的归属字段是否已回填）。
    for (const container of this.constraintContainers()) {
      const constraint = container.get(elementId)
      const dependencyIds = constraint?.getDependencyPointIds?.()
      if (!dependencyIds) continue
      let added = false
      for (const pid of dependencyIds) {
        const p = this.scene.points.get(pid)
        if (p) {
          pushPoint(p)
          added = true
        }
      }
      if (added) return
    }

    // 面的边界点与成员点
    const face = this.scene.faces.get(elementId)
    if (face) {
      let added = false
      for (const pid of [...face.boundaryPointIds, ...face.memberPointIds]) {
        const p = this.scene.points.get(pid)
        if (p) {
          pushPoint(p)
          added = true
        }
      }
      if (added) return
    }

    // 兜底：按归属字段扫描（sphereId / coneId / cylinderId / cubeId / prismId / …）
    let added = false
    for (const p of this.scene.points.values()) {
      if (!pointBelongsToElement(p, elementId)) continue
      pushPoint(p)
      added = true
    }
    void added
  }

  /**
   * 把「垂直于 axis、半径为 radius 的圆盘」的四个极值点加入范围。
   *
   * 用圆盘的四个边缘极值点（而不是一个球）表示底面/顶面：
   * 球会在轴向上额外扩张 radius，使包围范围虚大；
   * 圆盘极值点在轴向上扩张为 0，得到的范围既紧致又完整覆盖。
   * 轴向退化（顶点与底面中心重合等）时退化为一个点。
   */
  private pushDiscExtremes(
    out: FocusBounds[],
    center: { x: number; y: number; z: number },
    radius: number,
    axis: { x: number; y: number; z: number },
  ): void {
    if (!(radius > 0)) {
      out.push({ cx: center.x, cy: center.y, cz: center.z, radius: 0 })
      return
    }
    const axisLength = Math.hypot(axis.x, axis.y, axis.z)
    if (!(axisLength > 1e-9)) {
      out.push({ cx: center.x, cy: center.y, cz: center.z, radius: 0 })
      return
    }
    const nx = axis.x / axisLength
    const ny = axis.y / axisLength
    const nz = axis.z / axisLength

    // 与轴不平行的参考向量 → 构造垂直于轴的基 (u, v)
    const fx = Math.abs(ny) < 1 - 1e-6 ? 0 : 1
    const fy = Math.abs(ny) < 1 - 1e-6 ? 1 : 0
    let ux = ny * 0 - nz * fy
    let uy = nz * fx - nx * 0
    let uz = nx * fy - ny * fx
    const uLength = Math.hypot(ux, uy, uz)
    if (!(uLength > 1e-9)) {
      out.push({ cx: center.x, cy: center.y, cz: center.z, radius: 0 })
      return
    }
    ux /= uLength
    uy /= uLength
    uz /= uLength
    const vx = ny * uz - nz * uy
    const vy = nz * ux - nx * uz
    const vz = nx * uy - ny * ux

    for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      out.push({
        cx: center.x + (ux * su + vx * sv) * radius,
        cy: center.y + (uy * su + vy * sv) * radius,
        cz: center.z + (uz * su + vz * sv) * radius,
        radius: 0,
      })
    }
  }

  /** 所有「约束型几何体」的容器（用于按 id 取依赖点） */
  private constraintContainers(): Array<Map<string, SceneConstraint>> {
    return [
      this.scene.cubeConstraints,
      this.scene.prismConstraints,
      this.scene.pyramidConstraints,
      this.scene.regularPolygonConstraints,
      this.scene.cylinderConstraints as unknown as Map<string, SceneConstraint>,
      this.scene.faceConstraints,
      this.scene.intersectionConstraints,
      this.scene.objectConstrainedPointConstraints as unknown as Map<string, SceneConstraint>,
    ]
  }
}

// ─────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────

/** 从 HistoryEntry 的 intent 提取步意图 */
function extractStepIntent(event: HistoryPushEvent): StepIntent | undefined {
  const intent = (event.entry as { intent?: CollabOperationIntent | null }).intent
  if (!intent || !intent.category) return undefined
  return {
    category: intent.category,
    targetType: intent.targetType ?? null,
    targetName: intent.targetName ?? null,
    subject: intent.subject ?? null,
    note: intent.note ?? null,
  }
}

/** 提取该步操作的焦点对象 id（接受 Push/Nav 两种事件载荷） */
function extractFocusElementIds(event: { entry: unknown }): string[] {
  const entry = event.entry as {
    intent?: CollabOperationIntent | null
    keepPointId?: string | null
    deleteTargetId?: string | null
  }
  const ids: string[] = []
  const targetId = entry?.intent?.targetId
  if (targetId) ids.push(targetId)
  if (entry?.keepPointId) ids.push(entry.keepPointId)
  if (entry?.deleteTargetId && !ids.includes(entry.deleteTargetId)) ids.push(entry.deleteTargetId)
  return [...new Set(ids)]
}

/** 判断某个点是否属于给定元素 id */
function pointBelongsToElement(p: { cubeId?: string | null; circleId?: string | null; sphereId?: string | null; coneId?: string | null; cylinderId?: string | null; prismId?: string | null; pyramidId?: string | null; regularPolygonId?: string | null }, elementId: string): boolean {
  return (
    p.cubeId === elementId ||
    p.circleId === elementId ||
    p.sphereId === elementId ||
    p.coneId === elementId ||
    p.cylinderId === elementId ||
    p.prismId === elementId ||
    p.pyramidId === elementId ||
    p.regularPolygonId === elementId
  )
}

/**
 * 从「操作前」的序列化场景求聚焦目标。
 * 用于删除类操作：目标在操作后已不存在，只能回到操作前状态定位其几何位置。
 *
 * 覆盖：点本身 / 点的角色归属字段 / 线类端点 / 圆三点 /
 *      面的边界与成员点 / 球心与半径点 / 锥底心与顶点 / 柱上下底心。
 */
function computeFocusTargetFromSerialized(
  data: SerializedScene,
  elementIds: string[],
): FocusTarget | undefined {
  if (elementIds.length === 0 || !data?.points?.length) return undefined

  const wanted = new Set(elementIds)
  const byId = new Map<string, { x: number; y: number; z: number }>()
  for (const p of data.points) byId.set(p.id, p.position)

  const collected = new Set<string>()

  // ① 点本身 + 角色归属
  for (const p of data.points) {
    if (wanted.has(p.id)) {
      collected.add(p.id)
      continue
    }
    if (
      (p.cubeId && wanted.has(p.cubeId)) ||
      (p.circleId && wanted.has(p.circleId)) ||
      (p.regularPolygonId && wanted.has(p.regularPolygonId)) ||
      (p.sphereId && wanted.has(p.sphereId)) ||
      (p.coneId && wanted.has(p.coneId)) ||
      (p.cylinderId && wanted.has(p.cylinderId)) ||
      (p.prismId && wanted.has(p.prismId)) ||
      (p.pyramidId && wanted.has(p.pyramidId))
    ) {
      collected.add(p.id)
    }
  }

  // ② 线类（含直线/射线/向量）端点
  const addEndpoints = (
    items: Array<{ id: string; p1Id?: string; p2Id?: string; p3Id?: string }>,
  ) => {
    for (const item of items) {
      if (!wanted.has(item.id)) continue
      if (item.p1Id) collected.add(item.p1Id)
      if (item.p2Id) collected.add(item.p2Id)
      if (item.p3Id) collected.add(item.p3Id)
    }
  }
  addEndpoints(data.lines)
  addEndpoints(data.straightLines)
  addEndpoints(data.rays)
  addEndpoints(data.vectors)
  addEndpoints(data.circles)

  // ③ 面
  for (const f of data.faces) {
    if (!wanted.has(f.id)) continue
    for (const pid of f.boundaryPointIds) collected.add(pid)
    for (const pid of f.memberPointIds) collected.add(pid)
  }

  // ④ 球 / 锥 / 柱
  for (const s of data.spheres) {
    if (!wanted.has(s.id)) continue
    collected.add(s.centerPointId)
    if (s.radiusPointId) collected.add(s.radiusPointId)
  }
  for (const c of data.cones) {
    if (!wanted.has(c.id)) continue
    collected.add(c.baseCenterPointId)
    collected.add(c.apexPointId)
  }
  for (const c of data.cylinders) {
    if (!wanted.has(c.id)) continue
    if (c.bottomCenterPointId) collected.add(c.bottomCenterPointId)
    if (c.topCenterPointId) collected.add(c.topCenterPointId)
  }

  // 求 AABB
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let found = false
  for (const id of collected) {
    const pos = byId.get(id)
    if (!pos) continue
    found = true
    if (pos.x < minX) minX = pos.x
    if (pos.y < minY) minY = pos.y
    if (pos.z < minZ) minZ = pos.z
    if (pos.x > maxX) maxX = pos.x
    if (pos.y > maxY) maxY = pos.y
    if (pos.z > maxZ) maxZ = pos.z
  }
  if (!found) return undefined

  const dx = maxX - minX
  const dy = maxY - minY
  const dz = maxZ - minZ
  return {
    position: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    radius: Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz) / 2, 0.5),
  }
}

/** 导出序列化场景（供外部构造 baseSnapshot 时对齐；当前未使用但保留接口） */
