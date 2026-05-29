<script setup lang="ts">
/**
 * 渲染设置面板组件
 * 提供画质、性能、高级三类渲染参数的配置界面
 * 支持实时预览、确认保存、恢复默认、二次确认等功能
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore, type RenderSettingsCategory, type RenderSettings } from '@/store/uiStore'

defineOptions({
  name: 'RenderSettingsPanel',
})

const uiStore = useUiStore()
const { renderSettings, isRenderSettingsPanelOpen } = storeToRefs(uiStore)

// 当前激活的设置分类标签
const activeCategory = ref<RenderSettingsCategory>('interaction')

// 设置分类选项：画质 / 性能 / 高级
const categories: { key: RenderSettingsCategory; label: string }[] = [
  { key: 'interaction', label: '交互' },
  { key: 'graphics', label: '画质' },
  { key: 'performance', label: '性能' },
  { key: 'display', label: '显示' },
  { key: 'advanced', label: '高级' },
]

// 帧率限制下拉选项
const fpsCapOptions = [
  { value: 0, label: '无限制' },
  { value: 30, label: '30 FPS' },
  { value: 60, label: '60 FPS' },
  { value: 90, label: '90 FPS' },
  { value: 120, label: '120 FPS' },
]

// GPU 偏好下拉选项
const powerPreferenceOptions = [
  { value: 'default' as const, label: '默认' },
  { value: 'high-performance' as const, label: '高性能' },
]

// 分辨率缩放步长选项
const stepOptions = [
  { value: 10, label: '10' },
  { value: 5, label: '5' },
  { value: 1, label: '1' },
]

// 本地预览状态（未点击确认前不保存到 store，仅用于面板内预览）
const localSettings = ref<RenderSettings>({ ...renderSettings.value })
const localStep = ref(10)

// 二次确认弹窗相关状态
const showConfirmDialog = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmDialogAction = ref<(() => void) | null>(null)

// 面板打开时同步本地状态为当前已保存的设置
watch(isRenderSettingsPanelOpen, (open) => {
  if (open) {
    localSettings.value = { ...renderSettings.value }
  }
})

// 计算本地设置是否与已保存设置存在差异（用于控制确认按钮高亮与可用状态）
const hasChanges = computed(() => {
  return (
    localSettings.value.antialias !== renderSettings.value.antialias ||
    localSettings.value.pixelRatioScale !== renderSettings.value.pixelRatioScale ||
    localSettings.value.fpsCap !== renderSettings.value.fpsCap ||
    localSettings.value.powerPreference !== renderSettings.value.powerPreference ||
    localSettings.value.depthOcclusion !== renderSettings.value.depthOcclusion ||
    localSettings.value.hiddenEdge !== renderSettings.value.hiddenEdge ||
    localSettings.value.confirmBeforeDelete !== renderSettings.value.confirmBeforeDelete
  )
})

// 分辨率缩放百分比的双向计算属性（50% ~ 100%）
const pixelRatioPercent = computed({
  get: () => Math.round(localSettings.value.pixelRatioScale * 100),
  set: (v: number) => {
    localSettings.value.pixelRatioScale = Math.min(100, Math.max(50, v)) / 100
  },
})

// 关闭设置面板
const handleClose = () => {
  uiStore.closeRenderSettingsPanel()
}

// 确认保存：将本地设置写入 store 并触发持久化
const handleConfirm = () => {
  if (!hasChanges.value) return
  uiStore.setRenderSettings({ ...localSettings.value })
  uiStore.closeRenderSettingsPanel()
}

// 判断当前本地设置是否已经是默认设置
const isDefaultSettings = computed(() => {
  return (
    localSettings.value.antialias === false &&
    localSettings.value.pixelRatioScale === 1.0 &&
    localSettings.value.fpsCap === 0 &&
    localSettings.value.powerPreference === 'default' &&
    localSettings.value.depthOcclusion === true &&
    localSettings.value.hiddenEdge === true &&
    localSettings.value.confirmBeforeDelete === false
  )
})

// 恢复默认设置：若已是默认则提示无需恢复，否则弹出二次确认
const handleReset = () => {
  if (isDefaultSettings.value) {
    window.dispatchEvent(
      new CustomEvent('toast', {
        detail: { msg: '已是默认设置，无需恢复', scope: 'global' },
      }),
    )
    return
  }
  confirmDialogTitle.value = '恢复默认设置'
  confirmDialogMessage.value = '确定要将所有渲染设置恢复为默认值吗？此操作不可撤销。'
  confirmDialogAction.value = () => {
    localSettings.value = {
      antialias: false,
      pixelRatioScale: 1.0,
      fpsCap: 0,
      powerPreference: 'default',
      depthOcclusion: true,
      hiddenEdge: true,
      confirmBeforeDelete: false,
    }
    showConfirmDialog.value = false
  }
  showConfirmDialog.value = true
}

// 取消二次确认弹窗
const handleConfirmDialogCancel = () => {
  showConfirmDialog.value = false
  confirmDialogAction.value = null
}

// 确认执行二次确认弹窗中的操作
const handleConfirmDialogConfirm = () => {
  confirmDialogAction.value?.()
}

// 点击遮罩层关闭面板
const handleOverlayClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    handleClose()
  }
}

// 实时预览：将本地设置通过自定义事件发送给 EditorView（不保存到 store/localStorage）
const previewSettings = computed(() => ({ ...localSettings.value }))

watch(
  previewSettings,
  (newSettings) => {
    window.dispatchEvent(new CustomEvent('preview-render-settings', { detail: newSettings }))
  },
  { deep: true },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-fade">
      <div v-if="isRenderSettingsPanelOpen" class="settings-overlay" @click="handleOverlayClick">
        <div class="settings-panel">
          <div class="settings-header">
            <h3 class="settings-title">设置</h3>
            <button class="settings-close" @click="handleClose" title="关闭">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div class="settings-tabs">
            <button
              v-for="cat in categories"
              :key="cat.key"
              class="settings-tab"
              :class="{ active: activeCategory === cat.key }"
              @click="activeCategory = cat.key"
            >
              {{ cat.label }}
            </button>
          </div>

          <div class="settings-body">
            <div v-if="activeCategory === 'graphics'" class="settings-section">
              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">抗锯齿</label>
                  <button
                    class="setting-toggle"
                    :class="{ active: localSettings.antialias }"
                    @click="localSettings.antialias = !localSettings.antialias"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
                <p class="setting-desc">
                  开启抗锯齿可使边缘更平滑，但会消耗更多性能。修改后需刷新页面生效。
                </p>
              </div>

              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">分辨率缩放</label>
                  <span class="setting-value">{{ pixelRatioPercent }}%</span>
                </div>
                <input
                  type="range"
                  class="setting-slider"
                  min="50"
                  max="100"
                  :step="localStep"
                  v-model.number="pixelRatioPercent"
                />
                <div class="setting-sub-row">
                  <span class="setting-sub-label">缩放步长:</span>
                  <div class="step-options">
                    <button
                      v-for="opt in stepOptions"
                      :key="opt.value"
                      class="step-option"
                      :class="{ active: localStep === opt.value }"
                      @click="localStep = opt.value"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
                <p class="setting-desc">降低分辨率可提升性能，但画面会变得更模糊。</p>
              </div>
            </div>

            <div v-if="activeCategory === 'display'" class="settings-section">
              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">深度遮挡</label>
                  <button
                    class="setting-toggle"
                    :class="{ active: localSettings.depthOcclusion }"
                    @click="localSettings.depthOcclusion = !localSettings.depthOcclusion"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
                <p class="setting-desc">
                  开启后，被几何体遮挡的点和标签会变暗，减少视觉干扰。
                </p>
              </div>

              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">隐藏边虚线</label>
                  <button
                    class="setting-toggle"
                    :class="{ active: localSettings.hiddenEdge }"
                    @click="localSettings.hiddenEdge = !localSettings.hiddenEdge"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
                <p class="setting-desc">
                  开启后，被面遮挡的边会以虚线显示，帮助理解三维结构；关闭后所有边始终以实线显示。
                </p>
              </div>
            </div>

            <div v-if="activeCategory === 'performance'" class="settings-section">
              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">帧率限制</label>
                </div>
                <select class="setting-select" v-model.number="localSettings.fpsCap">
                  <option v-for="opt in fpsCapOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <p class="setting-desc">限制最大渲染帧率以降低功耗和发热。</p>
              </div>
            </div>

            <div v-if="activeCategory === 'advanced'" class="settings-section">
              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">GPU 偏好</label>
                </div>
                <select class="setting-select" v-model="localSettings.powerPreference">
                  <option v-for="opt in powerPreferenceOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <p class="setting-desc">
                  选择高性能 GPU 可提升渲染性能，但会增加功耗。修改后需刷新页面生效。
                </p>
              </div>
            </div>

            <div v-if="activeCategory === 'interaction'" class="settings-section">
              <div class="setting-item">
                <div class="setting-header">
                  <label class="setting-label">删除前确认</label>
                  <button
                    class="setting-toggle"
                    :class="{ active: localSettings.confirmBeforeDelete }"
                    @click="localSettings.confirmBeforeDelete = !localSettings.confirmBeforeDelete"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
                <p class="setting-desc">
                  开启后，通过侧边栏选中区的删除按钮删除几何元素时，将弹出确认对话框；关闭则直接删除。
                </p>
              </div>
            </div>
          </div>

          <div class="settings-footer">
            <button class="settings-btn settings-btn-secondary" @click="handleReset">
              恢复默认
            </button>
            <button
              class="settings-btn settings-btn-primary"
              :class="{ disabled: !hasChanges }"
              :disabled="!hasChanges"
              @click="handleConfirm"
            >
              确定
            </button>
          </div>
        </div>

        <!-- 二次确认弹窗 -->
        <Transition name="confirm-fade">
          <div v-if="showConfirmDialog" class="confirm-overlay" @click="handleConfirmDialogCancel">
            <div class="confirm-dialog" @click.stop>
              <div class="confirm-header">
                <h4 class="confirm-title">{{ confirmDialogTitle }}</h4>
              </div>
              <div class="confirm-body">
                <p class="confirm-message">{{ confirmDialogMessage }}</p>
              </div>
              <div class="confirm-footer">
                <button class="settings-btn settings-btn-secondary" @click="handleConfirmDialogCancel">
                  取消
                </button>
                <button class="settings-btn settings-btn-danger" @click="handleConfirmDialogConfirm">
                  确认
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(3px);
}

.settings-panel {
  width: 420px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #333;
}

.settings-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #f0f0f0;
}

.settings-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #aaa;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s;
}

.settings-close:hover {
  background: #333;
  color: #fff;
}

.settings-close svg {
  width: 16px;
  height: 16px;
}

.settings-tabs {
  display: flex;
  gap: 4px;
  padding: 10px 16px 0;
  border-bottom: 1px solid #333;
}

.settings-tab {
  padding: 8px 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #aaa;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -1px;
}

.settings-tab:hover {
  color: #ddd;
}

.settings-tab.active {
  color: #43f260;
  border-bottom-color: #43f260;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
}

.setting-value {
  font-size: 12px;
  color: #43f260;
  font-family: monospace;
  min-width: 36px;
  text-align: right;
}

.setting-desc {
  margin: 0;
  font-size: 12px;
  color: #888;
  line-height: 1.5;
}

.setting-sub-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

.setting-sub-label {
  font-size: 12px;
  color: #aaa;
}

.step-options {
  display: flex;
  gap: 4px;
}

.step-option {
  padding: 3px 10px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.step-option:hover {
  background: #333;
}

.step-option.active {
  background: #43f260;
  color: #000;
  border-color: #43f260;
  font-weight: 600;
}

.setting-toggle {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: #444;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  transition: background 0.2s;
  flex-shrink: 0;
}

.setting-toggle.active {
  background: #43f260;
}

.toggle-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.setting-toggle.active .toggle-thumb {
  transform: translateX(18px);
}

.setting-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: #333;
  outline: none;
  cursor: pointer;
}

.setting-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #43f260;
  cursor: pointer;
  border: 2px solid #1e1e1e;
  box-shadow: 0 0 0 1px #43f260;
}

.setting-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #43f260;
  cursor: pointer;
  border: 2px solid #1e1e1e;
  box-shadow: 0 0 0 1px #43f260;
}

.setting-select {
  width: 100%;
  padding: 8px 10px;
  background: #252525;
  border: 1px solid #444;
  border-radius: 6px;
  color: #eee;
  font-size: 13px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s;
}

.setting-select:focus {
  border-color: #43f260;
}

.setting-select option {
  background: #1e1e1e;
  color: #eee;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #333;
}

.settings-btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.settings-btn-primary {
  background: #43f260;
  color: #000;
  border-color: #43f260;
  font-weight: 600;
}

.settings-btn-primary:hover:not(:disabled) {
  background: #5aff75;
}

.settings-btn-primary.disabled {
  background: #2a5a30;
  color: #888;
  border-color: #2a5a30;
  cursor: not-allowed;
}

.settings-btn-secondary {
  background: transparent;
  color: #ccc;
  border-color: #444;
}

.settings-btn-secondary:hover {
  background: #2a2a2a;
  color: #fff;
}

.settings-btn-danger {
  background: #ff4d4f;
  color: #fff;
  border-color: #ff4d4f;
  font-weight: 600;
}

.settings-btn-danger:hover {
  background: #ff7875;
}

/* 二次确认弹窗 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.confirm-dialog {
  width: 340px;
  max-width: calc(100vw - 32px);
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.confirm-header {
  padding: 14px 16px 0;
}

.confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #f0f0f0;
}

.confirm-body {
  padding: 10px 16px 14px;
}

.confirm-message {
  margin: 0;
  font-size: 13px;
  color: #ccc;
  line-height: 1.5;
}

.confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #333;
}

/* Transition animations */
.settings-fade-enter-active,
.settings-fade-leave-active {
  transition: opacity 0.2s ease;
}

.settings-fade-enter-from,
.settings-fade-leave-to {
  opacity: 0;
}

.settings-fade-enter-active .settings-panel,
.settings-fade-leave-active .settings-panel {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.settings-fade-enter-from .settings-panel,
.settings-fade-leave-to .settings-panel {
  opacity: 0;
  transform: scale(0.96);
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.15s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-fade-enter-active .confirm-dialog,
.confirm-fade-leave-active .confirm-dialog {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.confirm-fade-enter-from .confirm-dialog,
.confirm-fade-leave-to .confirm-dialog {
  opacity: 0;
  transform: scale(0.95);
}

@media (max-width: 480px) {
  .settings-panel {
    width: 100%;
    max-width: none;
    max-height: 80vh;
    margin: 0 16px;
  }
}
</style>
