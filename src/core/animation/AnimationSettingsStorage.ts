// 录制/播放设置偏好的本地持久化。
//
// 为什么需要它：
//   动画设置原本只随「项目文件 / 草稿」落盘，于是以下情况刷新后必然回到默认：
//     · 未保存为项目、且未开启「草稿保护」
//     · 有项目但这段时间没有触发自动保存
//     · 有草稿但用户在恢复提示里选择了「不恢复」
//   设置本身是**用户偏好**（步进节奏、过渡时长、缓动、聚焦、推近、上限…），
//   与具体项目无关，因此单独在 localStorage 里留一份最稳妥。
//
// 与项目文件的关系（重要）：
//   本地这份是「偏好」，只在文档里该项**仍是默认值**时填补（见 store 的
//   applyLocalSettingsPreference）。项目里明确调过的非默认值优先，
//   不会被本地偏好静默覆盖。

import type { AnimationSettings } from './types'
import { mergeAnimationSettings } from './AnimationSerializer'

/** 本地设置偏好存储键（带版本号，便于将来结构变更时自然失效） */
export const ANIMATION_SETTINGS_STORAGE_KEY = 'geomesh3d_animation_settings_v1'

/**
 * 读取本地设置偏好。
 *
 * 返回 `AnimationSettings`（缺失字段已回退默认）或 `null`（从未保存过 / 读取失败）。
 * 值一律经 mergeAnimationSettings 校验，脏数据不会进入运行时。
 */
export function loadLocalAnimationSettings(): AnimationSettings | null {
  try {
    const raw = localStorage.getItem(ANIMATION_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    return mergeAnimationSettings(JSON.parse(raw))
  } catch {
    // 隐私模式 / 存储被禁用 / JSON 损坏：静默降级为「无本地偏好」
    return null
  }
}

/** 写入本地设置偏好；失败时静默（存储不可用不应影响编辑） */
export function saveLocalAnimationSettings(settings: AnimationSettings): void {
  try {
    localStorage.setItem(ANIMATION_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 忽略：配额满 / 隐私模式
  }
}

/** 清除本地设置偏好（用于「恢复默认设置」这类显式操作） */
export function clearLocalAnimationSettings(): void {
  try {
    localStorage.removeItem(ANIMATION_SETTINGS_STORAGE_KEY)
  } catch {
    // 忽略
  }
}
