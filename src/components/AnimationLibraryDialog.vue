<script setup lang="ts">
// 动画库弹窗：浏览私有录制段，执行「导入播放 / 存到本场景 / 重命名 / 删除」。
// 显隐与数据全部由 animationLibraryStore 承载（EditorView 常挂本组件，内部按 dialogOpen 显隐）。
import { useAnimationLibraryStore } from '../store/animationLibraryStore'
import type { AnimationLibraryItem } from '../api/animationLibrary'
import AnimIcon from './AnimIcon.vue'

const store = useAnimationLibraryStore()

const FILTER_TABS = [
  { id: 'all', label: '全部' },
  { id: 'project', label: '当前项目' },
  { id: 'unbound', label: '未绑定' },
] as const

/**
 * 绑定标签：只标记「有归属」的段 ——「当前项目」/「项目」/「房间」。
 * 未绑定返回空串（模板按 v-if 过滤，不渲染任何标签）：
 * 未绑定是常态（草稿录制的段大多如此），逐个挂标签只是噪音；
 * 专门的「未绑定」视图由顶部筛选 tab 承担。
 */
function bindLabel(item: AnimationLibraryItem): string {
  if (item.projectId && item.projectId === store.currentProjectId) return '当前项目'
  if (item.projectId) return '项目'
  if (item.roomId) return '房间'
  return ''
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function onRename(item: AnimationLibraryItem): void {
  const next = window.prompt('重命名录制段', item.name)
  if (next !== null) void store.rename(item, next)
}

function onDelete(item: AnimationLibraryItem): void {
  if (!window.confirm(`删除录制段「${item.name}」？该操作不可撤销。`)) return
  void store.remove(item)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="al-fade">
      <!-- 只允许通过右上角「✕」关闭：遮罩不响应点击，避免浏览列表时误触关闭 -->
      <div v-if="store.dialogOpen" class="al-overlay">
        <div class="al-dialog">
          <div class="al-header">
            <span class="al-title">动画库</span>
            <button class="al-close" title="关闭" @click="store.closeDialog()">✕</button>
          </div>

          <div class="al-toolbar">
            <div class="al-tabs">
              <button
                v-for="tab in FILTER_TABS"
                :key="tab.id"
                class="al-tab"
                :class="{ on: store.filter === tab.id }"
                @click="store.filter = tab.id"
              >
                {{ tab.label }}
              </button>
            </div>
            <button class="al-refresh" :disabled="store.loading" @click="store.refresh()">
              刷新
            </button>
          </div>

          <div class="al-body">
            <div v-if="store.loading" class="al-empty">加载中…</div>
            <div v-else-if="store.filteredItems.length === 0" class="al-empty">
              {{
                store.items.length === 0
                  ? '暂无录制段：录制动画后，点击「保存到动画库」上传录制段'
                  : '没有符合筛选条件的录制段'
              }}
            </div>
            <div v-else class="al-list">
              <div v-for="item in store.filteredItems" :key="item.id" class="al-item">
                <span class="al-swatch" :style="{ background: item.color || '#4a9eff' }" />
                <div class="al-main">
                  <div class="al-name-row">
                    <span class="al-name" :title="item.name">{{ item.name }}</span>
                    <span v-if="bindLabel(item)" class="al-bind">{{ bindLabel(item) }}</span>
                  </div>
                  <div class="al-meta">
                    {{ item.stepCount ?? 0 }} 步 · {{ formatDuration(item.durationMs) }} ·
                    {{ formatBytes(item.payloadBytes) }}
                    <template v-if="formatTime(item.updatedAt)">
                      · {{ formatTime(item.updatedAt) }}
                    </template>
                  </div>
                </div>
                <div class="al-actions">
                  <button
                    class="al-btn primary"
                    :disabled="store.busyItemId === item.id"
                    title="导入播放：临时预览，不写入本场景，退出播放后不留痕迹"
                    @click="store.importPlay(item)"
                  >
                    导入播放
                  </button>
                  <button
                    class="al-btn"
                    :disabled="store.busyItemId === item.id"
                    title="存到本场景：导入并保存为本场景的录制段，随项目保存 / 分享持久化"
                    @click="store.solidify(item)"
                  >
                    存到本场景
                  </button>
                  <button class="al-icon-btn" title="重命名" @click="onRename(item)">✎</button>
                  <button class="al-icon-btn" title="删除" @click="onDelete(item)">
                    <AnimIcon name="close" :size="10" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.al-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.al-dialog {
  width: min(760px, calc(100vw - 48px));
  max-height: min(560px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: #ddd;
}
.al-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #333;
}
.al-title {
  font-size: 14px;
  font-weight: 500;
}
.al-close {
  margin-left: auto;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #999;
  font-size: 13px;
  cursor: pointer;
}
.al-close:hover {
  background: #333;
  color: #fff;
}
.al-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px 0;
}
.al-tabs {
  display: flex;
  gap: 6px;
}
.al-tab {
  padding: 4px 10px;
  background: #262626;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #999;
  font-size: 12px;
  cursor: pointer;
}
.al-tab.on {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.al-refresh {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #999;
  font-size: 12px;
  cursor: pointer;
}
.al-refresh:hover:not(:disabled) {
  color: #fff;
  border-color: #4a4a4a;
}
.al-refresh:disabled {
  opacity: 0.5;
  cursor: default;
}
.al-body {
  flex: 1;
  min-height: 140px;
  overflow-y: auto;
  padding: 10px 16px 14px;
}
.al-empty {
  padding: 40px 0;
  text-align: center;
  color: #777;
  font-size: 12px;
}
.al-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.al-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #242424;
  border: 1px solid #333;
  border-radius: 6px;
}
.al-swatch {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.al-main {
  flex: 1;
  min-width: 0;
}
.al-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.al-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  color: #e6e6e6;
}
.al-bind {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid #3a4a5a;
  border-radius: 3px;
  color: #8ab8e8;
  font-size: 11px;
}
.al-meta {
  margin-top: 3px;
  color: #888;
  font-size: 12px;
}
.al-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}
.al-btn {
  padding: 4px 10px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
}
.al-btn:hover:not(:disabled) {
  background: #333;
  color: #fff;
}
.al-btn.primary {
  background: #1d4a7a;
  border-color: #2f6ea8;
  color: #eaf4ff;
}
.al-btn.primary:hover:not(:disabled) {
  background: #24588e;
}
.al-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.al-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #999;
  font-size: 12px;
  cursor: pointer;
}
.al-icon-btn:hover {
  background: #444;
  color: #fff;
}
.al-fade-enter-active,
.al-fade-leave-active {
  transition: opacity 0.15s ease;
}
.al-fade-enter-from,
.al-fade-leave-to {
  opacity: 0;
}
</style>
