<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  /** 源项目名称：用于标题文案「正在基于「源项目名」创建副本...」及默认副本名 */
  sourceProjectName: string
  /** 源项目描述：作为副本描述默认值 */
  sourceDescription?: string
  /** 源项目是否公开：作为副本是否公开的默认值 */
  sourceIsPublic?: boolean
}>()

const emit = defineEmits<{
  confirm: [data: { name: string; description: string; isPublic: boolean }]
  cancel: []
}>()

const projectName = ref('')
const projectDescription = ref('')
const isPublic = ref(true)
const nameError = ref('')
const descTextareaRef = ref<HTMLTextAreaElement | null>(null)

const canConfirm = computed(() => projectName.value.trim().length > 0)

const autoResizeTextarea = () => {
  const el = descTextareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
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
  })
}

const handleCancel = () => {
  emit('cancel')
}

// 打开时按源项目信息预填：副本名 = 源名 + " 副本"，描述/公开性沿用源项目
watch(
  () => props.visible,
  (val) => {
    if (val) {
      const base = (props.sourceProjectName || '').trim()
      projectName.value = base ? `${base} 副本` : ''
      projectDescription.value = props.sourceDescription ?? ''
      isPublic.value = props.sourceIsPublic ?? true
      nameError.value = ''
      nextTick(() => {
        const input = document.querySelector('.sap-name-input') as HTMLInputElement | null
        input?.focus()
        input?.select()
        autoResizeTextarea()
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
      <div v-if="visible" class="sap-overlay" @keydown="handleKeydown">
        <div class="sap-dialog">
          <div class="sap-header">
            <span class="sap-title">另存为我的项目</span>
          </div>

          <div class="sap-notice">
            正在基于「{{ sourceProjectName || '该公开项目' }}」创建副本，编辑改动将一并保存到新项目。
          </div>

          <div class="sap-body">
            <div class="sap-field">
              <label class="sap-label">项目名 <span class="sap-required">*</span></label>
              <input
                v-model="projectName"
                class="sap-input sap-name-input"
                :class="{ 'sap-input-error': nameError }"
                placeholder="请输入项目名"
                @keydown.enter="handleConfirm"
              />
              <div v-if="nameError" class="sap-error">{{ nameError }}</div>
            </div>

            <div class="sap-field">
              <label class="sap-label">项目描述</label>
              <textarea
                v-model="projectDescription"
                ref="descTextareaRef"
                class="sap-textarea"
                rows="3"
                placeholder="请输入项目描述（可选）"
                @input="autoResizeTextarea"
              ></textarea>
            </div>

            <div class="sap-field">
              <label class="sap-label">是否公开</label>
              <div class="sap-toggle-row">
                <button class="sap-toggle-btn" :class="{ active: isPublic }" @click="isPublic = true">
                  <svg class="sap-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  公开
                </button>
                <button
                  class="sap-toggle-btn"
                  :class="{ active: !isPublic }"
                  @click="isPublic = false"
                >
                  <svg class="sap-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  隐藏
                </button>
              </div>
            </div>
          </div>

          <div class="sap-footer">
            <button class="sap-btn sap-btn-cancel" @click="handleCancel">取消</button>
            <button class="sap-btn sap-btn-confirm" :disabled="!canConfirm" @click="handleConfirm">
              确认
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sap-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
}

.sap-dialog {
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

.sap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sap-title {
  color: #f3f3f3;
  font-size: 16px;
  font-weight: 700;
}

/* 只读说明：提示"正在基于源项目创建副本，不影响原项目" */
.sap-notice {
  padding: 9px 12px;
  border-radius: 8px;
  background: rgba(67, 242, 96, 0.08);
  border: 1px solid rgba(67, 242, 96, 0.25);
  color: #8df2a0;
  font-size: 12.5px;
  line-height: 1.5;
}

.sap-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sap-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sap-label {
  color: #a0a0a0;
  font-size: 13px;
}

.sap-required {
  color: #f25c5c;
}

.sap-input,
.sap-textarea {
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

.sap-input:focus,
.sap-textarea:focus {
  border-color: #43f260;
  box-shadow: 0 0 0 2px rgba(67, 242, 96, 0.12);
}

.sap-input-error {
  border-color: #f25c5c !important;
}

.sap-input-error:focus {
  border-color: #f25c5c !important;
  box-shadow: 0 0 0 2px rgba(242, 92, 92, 0.12) !important;
}

.sap-error {
  color: #f25c5c;
  font-size: 12px;
  line-height: 1.4;
}

.sap-textarea {
  resize: none;
  min-height: 60px;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #444 transparent;
}

.sap-textarea::-webkit-scrollbar {
  width: 6px;
}

.sap-textarea::-webkit-scrollbar-track {
  background: transparent;
}

.sap-textarea::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 3px;
}

.sap-textarea::-webkit-scrollbar-thumb:hover {
  background: #555;
}

.sap-toggle-row {
  display: flex;
  gap: 8px;
}

.sap-toggle-btn {
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

.sap-toggle-btn:hover {
  background: #2d2d2d;
}

.sap-toggle-btn.active {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.sap-toggle-icon {
  width: 14px;
  height: 14px;
}

.sap-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.sap-btn {
  padding: 8px 20px;
  border: 1px solid #3d3d3d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.sap-btn-cancel {
  background: #252525;
  color: #ececec;
}

.sap-btn-cancel:hover {
  background: #2d2d2d;
}

.sap-btn-confirm {
  background: #2c5a34;
  color: #43f260;
  border-color: rgba(67, 242, 96, 0.45);
}

.sap-btn-confirm:hover:not(:disabled) {
  background: #357a3f;
}

.sap-btn-confirm:disabled {
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
