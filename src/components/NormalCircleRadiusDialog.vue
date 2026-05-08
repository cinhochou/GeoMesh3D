<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'

const visible = ref(false)
const radius = ref(1)
const radiusInput = ref<HTMLInputElement | null>(null)

const handleShow = () => {
  radius.value = 1
  visible.value = true
  nextTick(() => {
    radiusInput.value?.focus()
    radiusInput.value?.select()
  })
}

const handleConfirm = () => {
  const r = Math.round(radius.value * 10) / 10
  if (typeof r !== 'number' || isNaN(r) || r < 0.5) return
  visible.value = false
  window.dispatchEvent(
    new CustomEvent('confirm-normal-circle-radius', { detail: { radius: r } }),
  )
}

const handleCancel = () => {
  visible.value = false
  window.dispatchEvent(new CustomEvent('cancel-normal-circle-radius'))
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!visible.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    handleCancel()
  }
}

onMounted(() => {
  window.addEventListener('show-normal-circle-radius-dialog', handleShow)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('show-normal-circle-radius-dialog', handleShow)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
      <div class="dialog-content">
        <div class="dialog-header">
          <span class="dialog-title">输入半径</span>
          <button class="dialog-close" @click="handleCancel">✕</button>
        </div>
        <div class="dialog-body">
          <label class="dialog-label">半径</label>
          <input
            ref="radiusInput"
            v-model.number="radius"
            type="number"
            min="0.5"
            step="0.5"
            class="dialog-input"
            @keydown.enter="handleConfirm"
            @keydown.escape="handleCancel"
          />
        </div>
        <div class="dialog-footer">
          <button class="dialog-btn dialog-btn-cancel" @click="handleCancel">取消</button>
          <button class="dialog-btn dialog-btn-confirm" @click="handleConfirm">确认</button>
        </div>
      </div>
    </div>
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
}

.dialog-content {
  min-width: 320px;
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
}

.dialog-label {
  color: #a0a0a0;
  font-size: 13px;
}

.dialog-input {
  width: 100%;
  padding: 8px 10px;
  background: #222;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.dialog-input:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
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

.dialog-btn-confirm:hover {
  background: #357a3f;
}
</style>
