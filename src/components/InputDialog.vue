<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    visible: boolean
    title: string
    errorMessage?: string
    canConfirm?: boolean
    minStepHint?: string
    minStepValue?: number
    bodyClass?: string
  }>(),
  {
    errorMessage: '',
    canConfirm: true,
    minStepHint: '',
    bodyClass: '',
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialogRef = ref<HTMLDivElement | null>(null)
const showMinStepHint = ref(false)
const bubbleLeft = ref(0)
const bubbleTop = ref(0)
let minStepHintTimer: ReturnType<typeof setTimeout> | null = null

const updateBubblePosition = () => {
  const input = dialogRef.value?.querySelector('input') as HTMLElement | null
  if (!input || !dialogRef.value) return
  const inputRect = input.getBoundingClientRect()
  const dialogRect = dialogRef.value.getBoundingClientRect()
  bubbleLeft.value = inputRect.left - dialogRect.left + inputRect.width / 2
  bubbleTop.value = inputRect.top - dialogRect.top - 8
}

const showBubble = () => {
  if (!props.minStepHint) return
  nextTick(() => {
    updateBubblePosition()
    showMinStepHint.value = true
  })
  if (minStepHintTimer) clearTimeout(minStepHintTimer)
  minStepHintTimer = setTimeout(() => {
    showMinStepHint.value = false
    minStepHintTimer = null
  }, 3000)
}

const handleDialogInput = (e: Event) => {
  if (props.minStepValue === undefined || !props.minStepHint) return
  const input = e.target as HTMLInputElement
  if (input.tagName !== 'INPUT' || input.type !== 'number') return
  if (Number(input.value) === props.minStepValue) {
    showBubble()
  }
}

const handleDialogPointerDown = (e: PointerEvent) => {
  if (props.minStepValue === undefined || !props.minStepHint) return
  const input = e.target as HTMLInputElement
  if (input.tagName !== 'INPUT' || input.type !== 'number') return
  const rect = input.getBoundingClientRect()
  const isSpinnerArea = e.clientX > rect.right - 24
  if (!isSpinnerArea) return
  const isDownButton = e.clientY > rect.top + rect.height / 2
  if (!isDownButton) return
  if (Number(input.value) === props.minStepValue) {
    showBubble()
  }
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      nextTick(() => {
        const firstInput = dialogRef.value?.querySelector('input')
        if (firstInput) {
          firstInput.focus()
          firstInput.select()
        }
      })
    } else {
      showMinStepHint.value = false
      if (minStepHintTimer) {
        clearTimeout(minStepHintTimer)
        minStepHintTimer = null
      }
    }
  },
)

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.visible) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (minStepHintTimer) {
    clearTimeout(minStepHintTimer)
    minStepHintTimer = null
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-overlay">
      <div v-if="visible" class="dialog-overlay" @click.self="emit('cancel')">
        <div
          ref="dialogRef"
          class="dialog-content"
          :class="bodyClass"
          @input="handleDialogInput"
          @pointerdown="handleDialogPointerDown"
        >
          <div class="dialog-header">
            <span class="dialog-title">{{ title }}</span>
            <button class="dialog-close" @click="emit('cancel')">✕</button>
          </div>
          <div class="dialog-body">
            <slot />
          </div>
          <div v-if="errorMessage" class="dialog-error">{{ errorMessage }}</div>
          <Transition name="bubble-fade">
            <div
              v-if="showMinStepHint && minStepHint"
              class="step-hint-bubble"
              :style="{ left: bubbleLeft + 'px', top: bubbleTop + 'px' }"
            >
              {{ minStepHint }}
            </div>
          </Transition>
          <div class="dialog-footer">
            <button class="dialog-btn dialog-btn-cancel" @click="emit('cancel')">取消</button>
            <button
              class="dialog-btn dialog-btn-confirm"
              :disabled="!canConfirm"
              @click="emit('confirm')"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.dialog-content {
  position: relative;
  min-width: 320px;
  max-width: 420px;
  max-height: calc(100vh - 32px);
  padding: 20px;
  background: linear-gradient(180deg, #1f1f1f 0%, #191919 100%);
  border: 1px solid #3d3d3d;
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  color: #f3f3f3;
  font-size: 16px;
  font-weight: 700;
}

.dialog-close {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.dialog-close:hover {
  color: #e0e0e0;
  background: #333;
}

.dialog-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.dialog-error {
  color: #f25c5c;
  font-size: 12px;
  line-height: 1.4;
}

.step-hint-bubble {
  position: absolute;
  transform: translate(-50%, -100%);
  max-width: 260px;
  background: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  color: #333333;
  font-size: 12px;
  line-height: 1.5;
  z-index: 10;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.step-hint-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 6px solid #ffffff;
}

.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 0.3s ease;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn {
  padding: 8px 20px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.dialog-btn-cancel {
  background: #252525;
  color: #ececec;
}

.dialog-btn-cancel:hover {
  background: #2d2d2d;
}

.dialog-btn-confirm {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.dialog-btn-confirm:hover:not(:disabled) {
  background: #357a3f;
}

.dialog-btn-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.2s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

.dialog-content.shake-warning {
  position: relative;
  animation: hold-red-border 1.4s ease-in-out forwards;
}

.dialog-content.shake-warning::before,
.dialog-content.shake-warning::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  border: 2px solid transparent;
}

.dialog-content.shake-warning::before {
  box-shadow: 0 0 14px 2px rgba(255, 80, 80, 0.35);
  animation: wave-red-glow 1.4s ease-in-out infinite;
}

.dialog-content.shake-warning::after {
  box-shadow: 0 0 20px 6px rgba(255, 80, 80, 0.22);
  animation: wave-red-glow 1.4s ease-in-out 0.45s infinite;
}

@keyframes hold-red-border {
  0% {
    border-color: #3d3d3d;
  }
  20%,
  100% {
    border-color: #ff5050;
  }
}

@keyframes wave-red-glow {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }
  45% {
    opacity: 1;
    transform: scale(1.02);
  }
  100% {
    opacity: 0;
    transform: scale(1.08);
  }
}
</style>
