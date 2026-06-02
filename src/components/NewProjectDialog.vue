<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  confirm: [data: { name: string; description: string; isPublic: boolean; sceneFile: File | null }]
  cancel: []
}>()

const projectName = ref('')
const projectDescription = ref('')
const isPublic = ref(true)
const sceneFile = ref<File | null>(null)
const sceneFileName = ref('')
const nameError = ref('')

const canConfirm = computed(() => projectName.value.trim().length > 0)

const fileInputRef = ref<HTMLInputElement | null>(null)
const descTextareaRef = ref<HTMLTextAreaElement | null>(null)

const autoResizeTextarea = () => {
  const el = descTextareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const handlePickFile = () => {
  fileInputRef.value?.click()
}

const handleFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    sceneFile.value = file
    sceneFileName.value = file.name
  } else {
    sceneFile.value = null
    sceneFileName.value = ''
  }
}

const clearFile = () => {
  sceneFile.value = null
  sceneFileName.value = ''
  if (fileInputRef.value) fileInputRef.value.value = ''
}

const handleConfirm = () => {
  const trimmed = projectName.value.trim()
  if (!trimmed) {
    nameError.value = '项目名不能为空'
    return
  }
  emit('confirm', {
    name: trimmed,
    description: projectDescription.value.trim(),
    isPublic: isPublic.value,
    sceneFile: sceneFile.value,
  })
}

const handleCancel = () => {
  emit('cancel')
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      projectName.value = ''
      projectDescription.value = ''
      isPublic.value = true
      sceneFile.value = null
      sceneFileName.value = ''
      nameError.value = ''
      nextTick(() => {
        const input = document.querySelector('.np-name-input') as HTMLInputElement | null
        input?.focus()
      })
    }
  },
)

watch(projectName, () => {
  if (nameError.value && projectName.value.trim()) {
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
      <div v-if="visible" class="np-overlay" @click.self="handleCancel" @keydown="handleKeydown">
        <div class="np-dialog">
          <div class="np-header">
            <span class="np-title">新建项目</span>
            <button class="np-close" @click="handleCancel">✕</button>
          </div>

          <div class="np-body">
            <div class="np-field">
              <label class="np-label">项目名 <span class="np-required">*</span></label>
              <input
                v-model="projectName"
                class="np-input"
                :class="{ 'np-input-error': nameError }"
                placeholder="请输入项目名"
                @keydown.enter="handleConfirm"
              />
              <div v-if="nameError" class="np-error">{{ nameError }}</div>
            </div>

            <div class="np-field">
              <label class="np-label">项目描述</label>
              <textarea
                v-model="projectDescription"
                class="np-textarea"
                rows="3"
                placeholder="请输入项目描述（可选）"
                @input="autoResizeTextarea"
                ref="descTextareaRef"
              ></textarea>
            </div>

            <div class="np-field">
              <label class="np-label">是否公开</label>
              <div class="np-toggle-row">
                <button
                  class="np-toggle-btn"
                  :class="{ active: isPublic }"
                  @click="isPublic = true"
                >
                  <svg class="np-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  公开
                </button>
                <button
                  class="np-toggle-btn"
                  :class="{ active: !isPublic }"
                  @click="isPublic = false"
                >
                  <svg class="np-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  隐藏
                </button>
              </div>
            </div>

            <div class="np-field">
              <label class="np-label">预导入场景文件</label>
              <div class="np-file-row">
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".json"
                  class="np-file-hidden"
                  @change="handleFileChange"
                />
                <button class="np-file-btn" @click="handlePickFile">选择文件</button>
                <span v-if="sceneFileName" class="np-file-name">
                  {{ sceneFileName }}
                  <button class="np-file-clear" @click="clearFile">✕</button>
                </span>
                <span v-else class="np-file-hint">未选择文件</span>
              </div>
            </div>
          </div>

          <div class="np-footer">
            <button class="np-btn np-btn-cancel" @click="handleCancel">取消</button>
            <button
              class="np-btn np-btn-confirm"
              :disabled="!canConfirm"
              @click="handleConfirm"
            >
              创建
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.np-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.np-dialog {
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

.np-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.np-title {
  color: #f3f3f3;
  font-size: 16px;
  font-weight: 700;
}

.np-close {
  background: none;
  border: none;
  color: #999;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.np-close:hover {
  color: #e0e0e0;
  background: #333;
}

.np-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.np-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.np-label {
  color: #a0a0a0;
  font-size: 13px;
}

.np-required {
  color: #f25c5c;
}

.np-input,
.np-textarea {
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

.np-input:focus,
.np-textarea:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
}

.np-input-error {
  border-color: #f25c5c !important;
}

.np-input-error:focus {
  border-color: #f25c5c !important;
  box-shadow: 0 0 0 2px rgba(242, 92, 92, 0.12) !important;
}

.np-error {
  color: #f25c5c;
  font-size: 12px;
  line-height: 1.4;
}

.np-textarea {
  resize: none;
  min-height: 60px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
}

.np-textarea::-webkit-scrollbar {
  width: 6px;
}

.np-textarea::-webkit-scrollbar-track {
  background: transparent;
}

.np-textarea::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.np-textarea::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.np-toggle-row {
  display: flex;
  gap: 8px;
}

.np-toggle-btn {
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

.np-toggle-btn:hover {
  background: #2d2d2d;
}

.np-toggle-btn.active {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.np-toggle-icon {
  width: 14px;
  height: 14px;
}

.np-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.np-file-hidden {
  display: none;
}

.np-file-btn {
  padding: 6px 14px;
  background: #252525;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  color: #ececec;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.np-file-btn:hover {
  background: #2d2d2d;
}

.np-file-name {
  color: #43f260;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.np-file-clear {
  background: none;
  border: none;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  padding: 0 2px;
}

.np-file-clear:hover {
  color: #f25c5c;
}

.np-file-hint {
  color: #666;
  font-size: 13px;
}

.np-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.np-btn {
  padding: 8px 20px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.np-btn-cancel {
  background: #252525;
  color: #ececec;
}

.np-btn-cancel:hover {
  background: #2d2d2d;
}

.np-btn-confirm {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.np-btn-confirm:hover:not(:disabled) {
  background: #357a3f;
}

.np-btn-confirm:disabled {
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
