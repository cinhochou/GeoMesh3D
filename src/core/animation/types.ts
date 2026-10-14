// src/core/animation/types.ts
// 动画系统（操作录像机）核心类型定义。
//
// 设计要点：
//  - 每个 HistoryEntry = 一个操作步（AnimationStep）。
//  - 播放走独立影子场景，绝不触碰编辑器主场景（完全解耦）。
//  - 存储采用「首帧全量 + 后续增量 diff + 周期性全量锚点」，内存占用较全量方案降 99%+。
//  - 内存中一律存 JS 对象（实测比 JSON 字符串更省：JS 字符串为 UTF-16 且无 interning 复用）。

import type { SceneSubgraphSnapshot } from '../editor/commands/SnapshotCommand'

/** 场景快照（复用现有 takeFullSnapshot 的产出结构，可 JSON 往返） */
export type SceneSnapshot = SceneSubgraphSnapshot

// ─────────────────────────────────────────────
// 缓动
// ─────────────────────────────────────────────

export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeInOutCubic' | 'step'

// ─────────────────────────────────────────────
// 增量结构
// ─────────────────────────────────────────────

/**
 * 快照中「各类型实体数组」的键名（与 SceneSubgraphSnapshot 的可 diff 字段对应）。
 * constraints 单独处理（无稳定 id 索引）。
 */
export type DeltaEntityKey =
  | 'points'
  | 'lines'
  | 'straightLines'
  | 'rays'
  | 'vectors'
  | 'circles'
  | 'faces'
  | 'spheres'
  | 'cones'
  | 'cylinders'
  | 'perpendicularLines'
  | 'parallelLines'
  | 'nets'

/** 单个实体集的变更 */
export interface DeltaEntityChange {
  /** 新增或修改的实体（完整对象，恢复时按键覆盖/追加） */
  upsert: UnknownEntity[]
  /** 被删除的实体 id */
  removed: string[]
}

/** 任意实体（增量内部按 id 索引，不约束具体形状） */
export type UnknownEntity = Record<string, unknown> & { id: string }

/**
 * 一步操作的增量描述。
 * - changes：按实体类型记录的 upsert/removed。
 * - constraints：约束部分每步全量（约束无稳定 id 索引，且数量远小于几何对象）；
 *   为 null 表示本步约束未变化。
 */
export interface SnapshotDelta {
  changes: Partial<Record<DeltaEntityKey, DeltaEntityChange>>
  constraints: unknown[] | null
}

// ─────────────────────────────────────────────
// 操作步 / 录制段 / 动画文档
// ─────────────────────────────────────────────

/** 操作意图元数据（来自 CollabOperationIntent，用于步标签与聚焦） */
export interface StepIntent {
  category:
    | 'create'
    | 'delete'
    | 'update'
    | 'move'
    | 'lock'
    | 'unlock'
    | 'merge'
    | 'clear'
    /** 撤销（仅当设置开启记录撤销/重做时出现） */
    | 'undo'
    /** 重做（同上） */
    | 'redo'
  targetType?: string | null
  targetName?: string | null
  subject?: string | null
  note?: string | null
}

/** 相机聚焦目标（录制时算好 AABB，回放时零成本） */
export interface FocusTarget {
  /** 世界坐标中心 */
  position: [number, number, number]
  /** 包围球半径 */
  radius: number
}

/** 一个操作步 */
export interface AnimationStep {
  id: string
  /** 步序号（0 基） */
  index: number
  /** 操作标签，来自 HistoryEntry.label，如「添加两点球」「移动球心点 A」 */
  label: string
  /** 操作意图（可选） */
  intent?: StepIntent
  /** 相对上一步的增量（首步相对 baseSnapshot） */
  delta: SnapshotDelta
  /** 真实操作发生的时间（相对录制起点，毫秒），仅展示用 */
  offsetMs: number
  /** 该步关联的几何对象 id（用于高亮/聚焦） */
  focusElementIds: string[]
  /** 该步的聚焦目标 */
  focusTarget?: FocusTarget
  /** 是否为全量锚点（每 N 步一个，便于跨步跳转快速重放） */
  isAnchor: boolean
  /** 仅当 isAnchor=true 时存在：该步的完整快照 */
  anchorSnapshot?: SceneSnapshot
}

/** 一次录制（可长可短，多段独立共存） */
export interface RecordingSession {
  id: string
  name: string
  color: string
  createdAt: number
  /** 录制时长（真实时间，仅用于展示） */
  durationMs: number
  /** 首帧全量快照（回放/重放的基准锚点） */
  baseSnapshot: SceneSnapshot
  /** 有序操作步 */
  steps: AnimationStep[]
}

/** 动画设置（随文档持久化，可被协作权限覆盖计算） */
export interface AnimationSettings {
  /** 是否把撤销/重做也录进去（默认 false） */
  recordUndoRedo: boolean
  /** 自动播放每一步的总时长（毫秒）＝ 停留 + 过渡，由节奏选择器设置 */
  autoAdvanceMs: number
  /** 自动播放是否默认循环 */
  loopByDefault: boolean
  /** 默认播放方向：1 正序 / -1 倒序 */
  defaultDirection: 1 | -1
  /** 步间过渡时长（毫秒） */
  transitionMs: number
  /** 步间过渡缓动 */
  transitionEasing: EasingType
  /** 是否启用相机聚焦 */
  focusEnabled: boolean
  /** 聚焦时相机距离 = 目标半径 × 该系数 */
  focusZoomFactor: number
  /** 是否高亮聚焦目标（过渡期间） */
  focusHighlight: boolean
  /** 单段最大步数（防内存爆炸） */
  maxStepsPerSession: number
  /** 每隔多少步插入一个全量锚点 */
  anchorInterval: number
}

export const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  recordUndoRedo: false,
  autoAdvanceMs: 1200,
  loopByDefault: false,
  defaultDirection: 1,
  transitionMs: 300,
  transitionEasing: 'easeInOutCubic',
  focusEnabled: true,
  focusZoomFactor: 6,
  focusHighlight: false,
  maxStepsPerSession: 1000,
  anchorInterval: 50,
}

// ─────────────────────────────────────────────
// 播放节奏档位
// ─────────────────────────────────────────────

/** 自动播放节奏档位（每步总时长 = 停留 + 过渡，毫秒） */
export interface RhythmPreset {
  id: string
  /** 展示名 */
  label: string
  /** 每步总时长（毫秒） */
  ms: number
}

/** 预设节奏档位：由慢到快 */
export const RHYTHM_PRESETS: RhythmPreset[] = [
  { id: 'verySlow', label: '很慢', ms: 3000 },
  { id: 'slow', label: '慢', ms: 2000 },
  { id: 'normal', label: '中', ms: 1200 },
  { id: 'fast', label: '快', ms: 700 },
  { id: 'veryFast', label: '很快', ms: 400 },
]

/** 节奏档位取值范围（供自定义输入钳制） */
export const RHYTHM_MIN_MS = 100
export const RHYTHM_MAX_MS = 10000

/** 按毫秒匹配最接近的档位（无精确匹配则返回 null，表示自定义） */
export function matchRhythmPreset(ms: number): RhythmPreset | null {
  return RHYTHM_PRESETS.find((p) => p.ms === ms) ?? null
}

/** 把毫秒钳制到合法范围 */
export function clampRhythmMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_ANIMATION_SETTINGS.autoAdvanceMs
  return Math.max(RHYTHM_MIN_MS, Math.min(RHYTHM_MAX_MS, Math.round(ms)))
}

// ─────────────────────────────────────────────
// 步间过渡档位
// ─────────────────────────────────────────────

/** 步间过渡时长档位 */
export interface TransitionPreset {
  label: string
  ms: number
}

/** 过渡时长档位：0 = 硬切（无过渡） */
export const TRANSITION_PRESETS: TransitionPreset[] = [
  { label: '无过渡', ms: 0 },
  { label: '很快', ms: 150 },
  { label: '快', ms: 250 },
  // 默认值 300 必须在档位表内，否则设置面板无高亮档、会显示成「300 ms」自定义值
  { label: '标准', ms: 300 },
  { label: '中', ms: 400 },
  { label: '慢', ms: 700 },
]

export const TRANSITION_MIN_MS = 0
export const TRANSITION_MAX_MS = 3000

/** 把过渡时长钳制到合法范围 */
export function clampTransitionMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_ANIMATION_SETTINGS.transitionMs
  return Math.max(TRANSITION_MIN_MS, Math.min(TRANSITION_MAX_MS, Math.round(ms)))
}

// ─────────────────────────────────────────────
// 相机聚焦
// ─────────────────────────────────────────────

export const FOCUS_ZOOM_MIN = 1.2
export const FOCUS_ZOOM_MAX = 12

/**
 * 相机聚焦的「推近程度」档位（factor = 相机距离 / 主体包围球半径）。
 *
 * ⚠ 档位值必须大于「完整容纳包围球」所需的距离系数：
 *   竖直 FOV = 30° 时，完整可见要求 d ≥ R / sin(15°) ≈ 3.86R。
 *   低于该值时主体会被视锥裁掉一部分——这正是「创建正六面体后只能看到一部分」
 *   与「切换档位感知不强」的成因之一（旧档位 1.8/2.5/3.5 都小于 3.86）。
 *
 * 另外，轨道控制的 minDistance 也会把过近的机位顶回固定距离，
 * 使多个档位落到同一距离（详见 EditorView 中对距离钳制的放开）。
 */
export const FOCUS_ZOOM_PRESETS: Array<{ label: string; factor: number }> = [
  { label: '紧凑', factor: 4.5 },
  { label: '标准', factor: 6 },
  { label: '远', factor: 8.5 },
  { label: '很远', factor: 12 },
]

/** 完整容纳主体所需的最小距离系数（FOV 30°） */
export const FOCUS_ZOOM_FIT_FACTOR = 3.86

/** 把任意系数吸附到最近的档位（旧文档里的 1.8/2.5/3.5 会自动落到「紧凑」） */
export function snapFocusZoomFactor(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_ANIMATION_SETTINGS.focusZoomFactor
  let best = FOCUS_ZOOM_PRESETS[0]!.factor
  let bestDiff = Infinity
  for (const preset of FOCUS_ZOOM_PRESETS) {
    const diff = Math.abs(preset.factor - factor)
    if (diff < bestDiff) {
      bestDiff = diff
      best = preset.factor
    }
  }
  return best
}

/** 把聚焦系数钳制到合法范围 */
export function clampFocusZoom(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_ANIMATION_SETTINGS.focusZoomFactor
  return Math.max(FOCUS_ZOOM_MIN, Math.min(FOCUS_ZOOM_MAX, factor))
}

/** 动画文档：一个项目/场景的多段录制 */
export interface AnimationDocument {
  version: 1
  meta: {
    createdAt: number
    updatedAt: number
  }
  sessions: RecordingSession[]
  /** 当前激活的录制段 id（TimeLine 主要展示它） */
  activeSessionId: string | null
  settings: AnimationSettings
}

export function createEmptyAnimationDocument(): AnimationDocument {
  const now = Date.now()
  return {
    version: 1,
    meta: { createdAt: now, updatedAt: now },
    sessions: [],
    activeSessionId: null,
    settings: { ...DEFAULT_ANIMATION_SETTINGS },
  }
}

// ─────────────────────────────────────────────
// 播放状态
// ─────────────────────────────────────────────

/** 播放载体模式 */
export type PlaybackMode = 'inline' | 'float'

// ─────────────────────────────────────────────
// 浮窗几何（尺寸档位 / 比例锁定 / 硬下限）
// ─────────────────────────────────────────────

/** 浮窗尺寸档位（值为占主视图宽度的比例） */
export type FloatSizePreset = 'small' | 'medium' | 'large' | 'max'

export const FLOAT_SIZE_RATIOS: Record<FloatSizePreset, number> = {
  small: 0.28,
  medium: 0.36,
  large: 0.5,
  /** 最大化：占满主视图可用区域（仍保持主视图比例） */
  max: 1,
}

export const FLOAT_SIZE_LABELS: Record<FloatSizePreset, string> = {
  small: '小',
  medium: '中',
  large: '大',
  max: '最大',
}

export const FLOAT_SIZE_ORDER: FloatSizePreset[] = ['small', 'medium', 'large', 'max']

/** 浮窗硬下限：宽度不小于该像素值 */
export const FLOAT_MIN_WIDTH_PX = 320
/** 浮窗硬下限：宽度不小于主视图宽度的该比例 */
export const FLOAT_MIN_WIDTH_RATIO = 0.2
/** 浮窗与主视图边缘的留白 */
export const FLOAT_WINDOW_MARGIN_PX = 12

/**
 * 浮窗头部是否需要把「尺寸档位按钮组」折叠成选择器。
 *
 * @param requiredWidth 展开态所需的自然宽度（由隐藏探针测得，**不随折叠状态变化**）
 * @param availableWidth 窗口当前可用宽度
 *
 * 之所以用「展开态所需宽度」而不是「当前内容宽度」判断：后者在折叠后会变小，
 * 会立刻满足「放得下」的条件 → 又展开 → 又放不下，形成来回抖动。
 *
 * 判定采用**保守**口径：所需宽度与可用宽度相差在 1px 以内即视为放不下。
 * 宁可提前 1px 折叠，也不要出现「看起来正好、实际被裁掉 1px」。
 */
export function shouldCollapseSizeGroup(requiredWidth: number, availableWidth: number): boolean {
  if (!(requiredWidth > 0) || !(availableWidth > 0)) return false
  return requiredWidth > availableWidth - 1
}

/**
 * 计算浮窗尺寸。
 *
 * 规则（与设计定稿一致）：
 *  - **比例锁定** = 主视图宽高比；
 *  - 宽度 = 主视图宽 × 档位比例；
 *  - **硬下限**：宽度 ≥ 320px 且 ≥ 主视图宽度的 20%；
 *  - 高度溢出可用区域时按比例回退（保持比例不变）。
 */
export function computeFloatWindowSize(
  hostWidth: number,
  hostHeight: number,
  preset: FloatSizePreset,
): { width: number; height: number } {
  const margin = FLOAT_WINDOW_MARGIN_PX
  const availableW = Math.max(1, hostWidth - margin * 2)
  const availableH = Math.max(1, hostHeight - margin * 2)
  const aspect = hostWidth > 0 && hostHeight > 0 ? hostWidth / hostHeight : 1

  const minW = Math.min(availableW, Math.max(FLOAT_MIN_WIDTH_PX, hostWidth * FLOAT_MIN_WIDTH_RATIO))
  let width = Math.min(availableW, Math.max(minW, hostWidth * FLOAT_SIZE_RATIOS[preset]))
  let height = width / aspect
  if (height > availableH) {
    height = availableH
    width = height * aspect
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

/**
 * 动画系统的「环境能力」。
 *
 * 由承载环境（编辑器 / AR）决定，而非用户设置：
 *  - AR 模式：设备摄像头即相机、虚实叠加，**只能播放不能录制**，
 *    且播放不应操作虚拟相机（视角由设备姿态决定），浮窗也无意义。
 */
export interface AnimationCapabilities {
  /** 是否允许录制 */
  canRecord: boolean
  /** 是否允许浮窗播放 */
  canFloat: boolean
  /** 是否允许自动移动相机（聚焦） */
  canMoveCamera: boolean
  /** 录制被禁用的原因（canRecord=false 时供 UI 提示；空串表示未禁用） */
  recordBlockedReason: string
}

export function createDefaultCapabilities(): AnimationCapabilities {
  return { canRecord: true, canFloat: true, canMoveCamera: true, recordBlockedReason: '' }
}

// ─────────────────────────────────────────────
// 协作广播（本地视图状态）
// ─────────────────────────────────────────────

/**
 * 广播的本地视图状态。
 * 与共享表的区别：这里只保留 UI 需要的最少信息，且不参与持久化。
 */
export interface AnimationBroadcastView {
  /** 是否有生效中的广播（房主/成员视角都可能为 true） */
  active: boolean
  /** 被广播的录制段 id */
  sessionId: string | null
  /** 广播发起者昵称 */
  hostName: string
  /** 本机是否为广播发起者 */
  selfHosted: boolean
  /** 房间是否要求强制观看（强制时成员无法收起） */
  forceWatch: boolean
  /** 成员是否已主动收起（仅非强制时可用；广播结束或换段时自动复位） */
  dismissed: boolean
  /** 广播数据是否已就绪（成员侧已拿到可播放的录制段） */
  ready: boolean
}

export function createInitialBroadcastView(): AnimationBroadcastView {
  return {
    active: false,
    sessionId: null,
    hostName: '',
    selfHosted: false,
    forceWatch: false,
    dismissed: false,
    ready: false,
  }
}

/** 播放状态 */
export interface PlaybackState {
  sessionId: string | null
  /** 当前位于第几步（-1 = 起点 / 未开始） */
  cursor: number
  playing: boolean
  /** 是否正在执行步间过渡（相机/几何插值中） */
  transitioning: boolean
  /** 播放方向：1 正序 / -1 倒序 */
  direction: 1 | -1
  /** 自动播放每步总时长（毫秒） */
  autoAdvanceMs: number
  loop: boolean
  /** 是否处于播放视图（进入播放模式，即使暂停也为 true） */
  active: boolean
  /** 播放载体模式 */
  mode: PlaybackMode
  /** 浮窗尺寸档位 */
  floatSize: FloatSizePreset
}

export function createInitialPlaybackState(): PlaybackState {
  return {
    sessionId: null,
    cursor: -1,
    playing: false,
    transitioning: false,
    direction: 1,
    autoAdvanceMs: DEFAULT_ANIMATION_SETTINGS.autoAdvanceMs,
    loop: DEFAULT_ANIMATION_SETTINGS.loopByDefault,
    active: false,
    mode: 'inline',
    floatSize: 'medium',
  }
}

/** 录制状态 */
export interface RecordingState {
  active: boolean
  /** 是否处于暂停（会话保留，但不累积新步） */
  paused: boolean
  sessionId: string | null
  /** 已记录的步数 */
  stepCount: number
  /** 录制开始时间戳 */
  startedAt: number
}

export function createInitialRecordingState(): RecordingState {
  return { active: false, paused: false, sessionId: null, stepCount: 0, startedAt: 0 }
}
