/**
 * 手机端方向锁定工具
 *
 * - isPhoneDevice()：判断当前设备是否为手机（排除平板与桌面）
 * - lock()：若为手机且支持方向锁定 API，则尝试锁定为指定方向
 * - unlockOrientation()：解除方向锁定
 * - getCurrentOrientation()：读取当前屏幕方向
 * - onOrientationChange()：订阅 orientationchange 事件
 *
 * 平板端不做处理（用户可自由旋转）。
 */

export type TargetOrientation = 'portrait' | 'landscape'

const PHONE_UA_PATTERN = /iPhone|iPod|Mobi/i

const isPhoneDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (PHONE_UA_PATTERN.test(ua)) return true
  // Android 平板 UA 通常包含 Android 但不包含 Mobile；手机则两者都有
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return true
  return false
}

type Orientation = 'portrait' | 'landscape' | 'unknown'

const getCurrentOrientation = (): Orientation => {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return 'unknown'
  const type = screen.orientation?.type
  if (!type) return 'unknown'
  if (type.startsWith('portrait')) return 'portrait'
  if (type.startsWith('landscape')) return 'landscape'
  return 'unknown'
}

const onOrientationChange = (cb: (orientation: Orientation) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb(getCurrentOrientation())
  window.addEventListener('orientationchange', handler)
  // 部分浏览器仅触发 resize 不触发 orientationchange，兜底
  window.addEventListener('resize', handler)
  return () => {
    window.removeEventListener('orientationchange', handler)
    window.removeEventListener('resize', handler)
  }
}

const lock = async (target: TargetOrientation): Promise<boolean> => {
  if (typeof window === 'undefined' || typeof screen === 'undefined') return false
  if (!isPhoneDevice()) return false
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: TargetOrientation) => Promise<void>
  }
  if (orientation && typeof orientation.lock === 'function') {
    try {
      await orientation.lock(target)
      return true
    } catch {
      // 锁定失败（需用户手势/不支持/被拒绝），返回 false 由调用方决定兜底策略
      return false
    }
  }
  return false
}

const unlockOrientation = (): void => {
  if (typeof screen === 'undefined') return
  const orientation = screen.orientation as ScreenOrientation & {
    unlock?: () => void
  }
  if (orientation && typeof orientation.unlock === 'function') {
    try {
      orientation.unlock()
    } catch {
      // 忽略解锁失败
    }
  }
}

export const orientationLock = {
  isPhoneDevice,
  getCurrentOrientation,
  onOrientationChange,
  lock,
  unlockOrientation,
}
