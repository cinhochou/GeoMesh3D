<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  projectName: string
  projectDescription: string
  projectIsPublic: boolean
}>()

const emit = defineEmits<{
  confirm: [data: { name: string; description: string; isPublic: boolean }]
  cancel: []
  delete: []
}>()

const editName = ref('')
const editDescription = ref('')
const editIsPublic = ref(true)
const nameError = ref('')
const deleteConfirmVisible = ref(false)
const descTextareaRef = ref<HTMLTextAreaElement | null>(null)

const hasChanges = computed(() => {
  return (
    editName.value.trim() !== props.projectName.trim() ||
    editDescription.value.trim() !== props.projectDescription.trim() ||
    editIsPublic.value !== props.projectIsPublic
  )
})

const canConfirm = computed(() => {
  return hasChanges.value && editName.value.trim().length > 0
})

const autoResizeTextarea = () => {
  const el = descTextareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const handleConfirm = () => {
  const trimmed = editName.value.trim()
  if (!trimmed) {
    nameError.value = '项目名不能为空'
    return
  }
  emit('confirm', {
    name: trimmed,
    description: editDescription.value.trim(),
    isPublic: editIsPublic.value,
  })
}

const handleCancel = () => {
  emit('cancel')
}

const requestDelete = () => {
  deleteConfirmVisible.value = true
}

const cancelDelete = () => {
  deleteConfirmVisible.value = false
}

const confirmDelete = () => {
  deleteConfirmVisible.value = false
  emit('delete')
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      editName.value = props.projectName
      editDescription.value = props.projectDescription
      editIsPublic.value = props.projectIsPublic
      nameError.value = ''
      deleteConfirmVisible.value = false
      nextTick(() => {
        const input = document.querySelector('.ep-name-input') as HTMLInputElement | null
        input?.focus()
        autoResizeTextarea()
      })
    }
  },
)

watch(editName, () => {
  if (nameError.value && editName.value.trim()) {
    nameError.value = ''
  }
})

const handleKeydown = (e: KeyboardEvent) => {
  if (!props.visible) return
  if (e.key === 'Escape') {
    e.preventDefault()
    handleCancel()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-overlay">
      <div v-if="visible" class="ep-overlay" @click.self="handleCancel" @keydown="handleKeydown">
        <div class="ep-dialog">
          <div class="ep-header">
            <span class="ep-title">编辑项目</span>
            <button class="ep-close" @click="handleCancel">✕</button>
          </div>

          <div class="ep-body">
            <div class="ep-field">
              <label class="ep-label">项目名 <span class="ep-required">*</span></label>
              <input
                v-model="editName"
                class="ep-input ep-name-input"
                :class="{ 'ep-input-error': nameError }"
                placeholder="请输入项目名"
                @keydown.enter="handleConfirm"
              />
              <div v-if="nameError" class="ep-error">{{ nameError }}</div>
            </div>

            <div class="ep-field">
              <label class="ep-label">项目描述</label>
              <textarea
                v-model="editDescription"
                class="ep-textarea"
                rows="3"
                placeholder="请输入项目描述（可选）"
                @input="autoResizeTextarea"
                ref="descTextareaRef"
              ></textarea>
            </div>

            <div class="ep-field">
              <label class="ep-label">是否公开</label>
              <div class="ep-toggle-row">
                <button
                  class="ep-toggle-btn"
                  :class="{ active: editIsPublic }"
                  @click="editIsPublic = true"
                >
                  <svg class="ep-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  公开
                </button>
                <button
                  class="ep-toggle-btn"
                  :class="{ active: !editIsPublic }"
                  @click="editIsPublic = false"
                >
                  <svg class="ep-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  隐藏
                </button>
              </div>
            </div>

            <div class="ep-divider"></div>

            <div class="ep-danger-zone">
              <div v-if="!deleteConfirmVisible" class="ep-delete-row">
                <button class="ep-delete-btn" @click="requestDelete">
                  <svg class="ep-delete-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  删除项目
                </button>
              </div>
              <div v-else class="ep-delete-confirm">
                <span class="ep-confirm-text">确认删除该项目？此操作不可撤销</span>
                <div class="ep-confirm-actions">
                  <button class="ep-confirm-yes" @click="confirmDelete">确认删除</button>
                  <button class="ep-confirm-no" @click="cancelDelete">取消</button>
                </div>
              </div>
            </div>
          </div>

          <div class="ep-footer">
            <button class="ep-btn ep-btn-cancel" @click="handleCancel">取消</button>
            <button
              class="ep-btn ep-btn-confirm"
              :disabled="!canConfirm"
              @click="handleConfirm"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ep-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.ep-dialog {
  min-width: 380px;
  max-width: 460px;
  padding: 20px;
  background: linear-gradient(180deg, #1f1f1f 0%, #191919 100%);
  border: 1px solid #3d3d3d;
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ep-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ep-title {
  color: #f3f3f3;
  font-size: 16px;
  font-weight: 700;
}

.ep-close {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.ep-close:hover {
  color: #e0e0e0;
  background: #333;
}

.ep-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ep-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ep-label {
  color: #a0a0a0;
  font-size: 13px;
}

.ep-required {
  color: #f25c5c;
}

.ep-input,
.ep-textarea {
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
  font-family: inherit;
}

.ep-input:focus,
.ep-textarea:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
}

.ep-input-error {
  border-color: #f25c5c !important;
}

.ep-input-error:focus {
  border-color: #f25c5c !important;
  box-shadow: 0 0 0 2px rgba(242, 92, 92, 0.12) !important;
}

.ep-error {
  color: #f25c5c;
  font-size: 12px;
  line-height: 1.4;
}

.ep-textarea {
  resize: none;
  min-height: 60px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
}

.ep-textarea::-webkit-scrollbar {
  width: 6px;
}

.ep-textarea::-webkit-scrollbar-track {
  background: transparent;
}

.ep-textarea::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.ep-textarea::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.ep-toggle-row {
  display: flex;
  gap: 8px;
}

.ep-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #252525;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  color: #999;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.ep-toggle-btn:hover {
  background: #2d2d2d;
}

.ep-toggle-btn.active {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.ep-toggle-icon {
  width: 14px;
  height: 14px;
}

.ep-divider {
  height: 1px;
  background: #333;
  margin: 2px 0;
}

.ep-danger-zone {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ep-delete-row {
  display: flex;
  justify-content: flex-end;
}

.ep-delete-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(255, 95, 95, 0.08);
  border: 1px solid rgba(255, 95, 95, 0.25);
  border-radius: 6px;
  color: #ff9999;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.ep-delete-btn:hover {
  background: rgba(255, 95, 95, 0.15);
  border-color: rgba(255, 95, 95, 0.5);
}

.ep-delete-icon {
  width: 14px;
  height: 14px;
}

.ep-delete-confirm {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 95, 95, 0.4);
  background: rgba(255, 95, 95, 0.06);
}

.ep-confirm-text {
  color: #ffb0b0;
  font-size: 13px;
}

.ep-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ep-confirm-yes,
.ep-confirm-no {
  padding: 5px 14px;
  border-radius: 4px;
  border: none;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.ep-confirm-yes {
  background: #e04040;
  color: #fff;
}

.ep-confirm-yes:hover {
  opacity: 0.85;
}

.ep-confirm-no {
  background: #333;
  color: #ccc;
  border: 1px solid #444;
}

.ep-confirm-no:hover {
  background: #3d3d3d;
}

.ep-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.ep-btn {
  padding: 8px 20px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.ep-btn-cancel {
  background: #252525;
  color: #ececec;
}

.ep-btn-cancel:hover {
  background: #2d2d2d;
}

.ep-btn-confirm {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.ep-btn-confirm:hover:not(:disabled) {
  background: #357a3f;
}

.ep-btn-confirm:disabled {
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
</style>
