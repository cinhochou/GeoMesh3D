import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { orientationLock, type TargetOrientation } from '@/utils/orientation'

/**
 * 手机端强制指定方向显示。
 *
 * 行为：
 * 1. 仅在手机端生效，平板与桌面端直接跳过。
 * 2. 挂载时尝试调用 Screen Orientation API 锁定为 target 方向。
 * 3. 若锁定失败（缺少用户手势等），在首次用户交互时重试。
 * 4. 始终监听 orientationchange：若手机端方向与 target 不一致，返回
 *    needsRotateToTarget = true，由调用方渲染"请旋转"遮罩。
 * 5. 卸载时解除方向锁定并清理监听。
 *
 * @param target 目标方向：'portrait'（竖屏）或 'landscape'（横屏）
 */
export function useOrientationLock(
  target: TargetOrientation,
): { needsRotateToTarget: Ref<boolean> } {
  const needsRotateToTarget = ref(false)

  let unsubscribeOrientation: (() => void) | null = null
  let cleanupInteraction: (() => void) | null = null
  let interactionTried = false

  const updateRotateState = () => {
    if (!orientationLock.isPhoneDevice()) {
      needsRotateToTarget.value = false
      return
    }
    needsRotateToTarget.value = orientationLock.getCurrentOrientation() !== target
  }

  const tryLock = async () => {
    const ok = await orientationLock.lock(target)
    if (ok) {
      // 锁定成功则不再监听交互事件
      cleanupInteraction?.()
      cleanupInteraction = null
    }
    updateRotateState()
  }

  const onUserInteract = () => {
    if (interactionTried) return
    interactionTried = true
    cleanupInteraction?.()
    cleanupInteraction = null
    void tryLock()
  }

  onMounted(async () => {
    if (!orientationLock.isPhoneDevice()) return

    await tryLock()

    unsubscribeOrientation = orientationLock.onOrientationChange(() => {
      updateRotateState()
    })

    // 首次用户交互时重试锁定（Screen Orientation API 多数浏览器要求用户手势）
    const handler = onUserInteract
    window.addEventListener('touchstart', handler, { passive: true })
    window.addEventListener('click', handler)
    cleanupInteraction = () => {
      window.removeEventListener('touchstart', handler)
      window.removeEventListener('click', handler)
    }
  })

  onUnmounted(() => {
    unsubscribeOrientation?.()
    cleanupInteraction?.()
    orientationLock.unlockOrientation()
  })

  return { needsRotateToTarget }
}
