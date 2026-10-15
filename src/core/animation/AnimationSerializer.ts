// src/core/animation/AnimationSerializer.ts
// 动画文档（操作录像机）的持久化：序列化 / 反序列化 / 兼容校验 / 差异比对。
//
// 设计要点：
//  - 持久化形态 `SavedAnimationDocument` 由 SceneSerializer 定义（避免序列化器反向依赖本模块）；
//    本模块负责把它还原成强类型的 AnimationDocument，并补齐缺失字段（向前兼容）。
//  - 差异比对用「剔除 meta.updatedAt」的文本，避免「只改时间戳」被当成内容变化而触发重复保存。

import { exportScene, type SavedAnimationDocument, type SerializedScene } from '../editor/SceneSerializer'
import type { Scene } from '../scene/Scene'
import {
  DEFAULT_ANIMATION_SETTINGS,
  createEmptyAnimationDocument,
  snapFocusZoomFactor,
  type AnimationDocument,
  type AnimationSettings,
  type AnimationStep,
  type RecordingSession,
  type SnapshotDelta,
  type EasingType,
} from './types'

const ANIMATION_DOC_VERSION = 1

const VALID_EASINGS: readonly EasingType[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInOutCubic',
  'step',
]

/**
 * 转成可持久化形态。
 * 返回 null 表示「没有值得保存的内容」（无录制段且设置全为默认），
 * 此时不写入场景文件，避免给从未用过动画的场景增加体积。
 */
export function serializeAnimationDocument(doc: AnimationDocument): SavedAnimationDocument | null {
  if (isAnimationDocumentEmpty(doc)) return null
  return {
    version: ANIMATION_DOC_VERSION,
    meta: { createdAt: doc.meta.createdAt, updatedAt: doc.meta.updatedAt },
    sessions: doc.sessions as unknown[],
    activeSessionId: doc.activeSessionId,
    settings: { ...doc.settings } as Record<string, unknown>,
  }
}

/**
 * 是否没有值得保存的内容（无会话 + 设置全默认）。
 *
 * 注意：设置会被「本地偏好」填补（见 store 的 applyLocalSettingsPreference），
 * 因此用户调过偏好后，即使从未录制，序列化结果也不再是 null ——
 * 项目会多存一段「仅含设置」的动画块（几百字节），这是预期行为：
 * 让偏好随项目一起带走。仅用于决定是否写盘，不影响任何 UI 判定。
 */
export function isAnimationDocumentEmpty(doc: AnimationDocument): boolean {
  if (doc.sessions.length > 0) return false
  return isDefaultSettings(doc.settings)
}

function isDefaultSettings(settings: AnimationSettings): boolean {
  const keys = Object.keys(DEFAULT_ANIMATION_SETTINGS) as Array<keyof AnimationSettings>
  return keys.every((k) => settings[k] === DEFAULT_ANIMATION_SETTINGS[k])
}

/**
 * 从场景数据还原动画文档。
 * 任何缺失或损坏都安全降级：整体不可用 → 返回 null；字段级问题 → 用默认值补齐。
 */
export function deserializeAnimationDocument(raw: unknown): AnimationDocument | null {
  if (!raw || typeof raw !== 'object') return null

  const data = raw as Partial<SavedAnimationDocument>
  if (!Array.isArray(data.sessions)) return null

  const sessions = data.sessions.filter((s): s is RecordingSession => isValidSession(s))
  if (sessions.length === 0 && isDefaultRecordedSettings(data.settings)) {
    // 既没有可用会话、设置也是默认 → 视为无动画数据
    return null
  }

  const base = createEmptyAnimationDocument()
  const activeId =
    typeof data.activeSessionId === 'string' && sessions.some((s) => s.id === data.activeSessionId)
      ? data.activeSessionId
      : (sessions[0]?.id ?? null)

  return {
    version: ANIMATION_DOC_VERSION,
    meta: {
      createdAt: typeof data.meta?.createdAt === 'number' ? data.meta.createdAt : base.meta.createdAt,
      updatedAt: typeof data.meta?.updatedAt === 'number' ? data.meta.updatedAt : base.meta.updatedAt,
    },
    sessions,
    activeSessionId: activeId,
    settings: mergeAnimationSettings(data.settings),
  }
}

/** 从场景数据里取出动画文档（场景未携带 → null） */
export function animationFromSceneData(data: SerializedScene | null | undefined): AnimationDocument | null {
  return deserializeAnimationDocument(data?.animation)
}

/**
 * 动画数据的差异比对文本。
 * 剔除 `meta.updatedAt`：仅时间戳变化不代表内容变化，不应触发保存。
 */
export function animationCompareJson(payload: SavedAnimationDocument | null): string {
  if (!payload) return ''
  return JSON.stringify({
    version: payload.version,
    sessions: payload.sessions,
    activeSessionId: payload.activeSessionId,
    settings: payload.settings,
  })
}

/** 把动画文档挂到场景数据上（供保存/导出使用；无需保存时不写入） */
export function attachAnimationToSceneData(data: SerializedScene, doc: AnimationDocument): void {
  const payload = serializeAnimationDocument(doc)
  if (payload) data.animation = payload
  else delete data.animation
}

/** 导出场景 + 动画（便捷封装，供需要落盘的调用方使用） */
export function exportSceneWithAnimation(scene: Scene, doc: AnimationDocument): SerializedScene {
  const data = exportScene(scene)
  attachAnimationToSceneData(data, doc)
  return data
}

// ─────────────────────────────────────────────
// 单段序列化（协作广播用）
// ─────────────────────────────────────────────

/**
 * 序列化单个录制段为 JSON 字符串。
 * 协作广播时由房主一次性写入共享表，成员据此在本地重建该段（不写入成员自己的文档）。
 */
export function serializeRecordingSession(session: RecordingSession): string {
  return JSON.stringify(session)
}

/** 反序列化单个录制段；数据损坏或结构不合法时返回 null（不抛错） */
export function deserializeRecordingSession(raw: unknown): RecordingSession | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return isValidSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────
// 校验与兼容
// ─────────────────────────────────────────────

function isValidSession(value: unknown): value is RecordingSession {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<RecordingSession>
  if (typeof s.id !== 'string' || !Array.isArray(s.steps)) return false
  if (!s.baseSnapshot || typeof s.baseSnapshot !== 'object') return false
  // 步对象做最小校验并补齐索引，防止旧数据索引漂移
  s.steps = s.steps.filter((step): step is AnimationStep => isValidStep(step))
  s.steps.forEach((step, i) => {
    step.index = i
    if (!step.delta || typeof step.delta !== 'object') {
      step.delta = { changes: {}, constraints: null } as SnapshotDelta
    }
    if (!Array.isArray(step.focusElementIds)) step.focusElementIds = []
  })
  if (typeof s.name !== 'string' || !s.name) s.name = '录制'
  if (typeof s.color !== 'string') s.color = '#4a9eff'
  if (typeof s.createdAt !== 'number') s.createdAt = Date.now()
  if (typeof s.durationMs !== 'number') s.durationMs = 0
  // 播放语义只认 'merge'；缺失/脏值一律清除（缺省即 'native'），
  // 防止脏数据把段落导入合并路径或让 native 段走错分支。
  if (s.playbackMode !== 'merge') delete s.playbackMode
  return true
}

function isValidStep(value: unknown): value is AnimationStep {
  if (!value || typeof value !== 'object') return false
  const step = value as Partial<AnimationStep>
  return typeof step.id === 'string' && typeof step.label === 'string'
}

/**
 * 设置项：只接受类型正确的字段，其余回退默认（防止旧文件/脏数据）。
 *
 * 导出给「本地设置偏好」复用 —— 白名单、数值范围、缓动合法性、推近档位吸附
 * 等规则必须只有一处实现，避免本地存储与项目文件两套校验逐渐分叉。
 */
export function mergeAnimationSettings(raw: unknown): AnimationSettings {
  const out: AnimationSettings = { ...DEFAULT_ANIMATION_SETTINGS }
  if (!raw || typeof raw !== 'object') return out
  const s = raw as Record<string, unknown>

  const num = (key: keyof AnimationSettings) => {
    const v = s[key as string]
    if (typeof v === 'number' && Number.isFinite(v)) {
      ;(out[key] as number) = v
    }
  }
  const bool = (key: keyof AnimationSettings) => {
    const v = s[key as string]
    if (typeof v === 'boolean') {
      ;(out[key] as boolean) = v
    }
  }

  bool('recordUndoRedo')
  num('autoAdvanceMs')
  bool('loopByDefault')
  num('transitionMs')
  bool('focusEnabled')
  num('focusZoomFactor')
  // 旧文档里的推近系数（1.8/2.5/3.5/5）不在新档位表内，且低于「完整容纳主体」阈值，
  // 会显示成无高亮的自定义值——吸附到最近档位，让 UI 与观感都自愈。
  out.focusZoomFactor = snapFocusZoomFactor(out.focusZoomFactor)
  bool('focusHighlight')
  num('maxStepsPerSession')
  num('anchorInterval')

  const dir = s.defaultDirection
  if (dir === 1 || dir === -1) out.defaultDirection = dir

  const easing = s.transitionEasing
  if (typeof easing === 'string' && (VALID_EASINGS as readonly string[]).includes(easing)) {
    out.transitionEasing = easing as EasingType
  }

  return out
}

/** 判断（可能缺失的）设置块是否等价于默认值 */
function isDefaultRecordedSettings(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true
  const s = raw as Record<string, unknown>
  const keys = Object.keys(DEFAULT_ANIMATION_SETTINGS) as Array<keyof AnimationSettings>
  return keys.every((k) => s[k as string] === DEFAULT_ANIMATION_SETTINGS[k])
}
