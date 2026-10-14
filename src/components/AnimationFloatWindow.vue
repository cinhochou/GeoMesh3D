<script setup lang="ts">
// 浮窗播放（第二 renderer + 第二 canvas）的窗口外框与几何计算。
//
// 分工：本组件只负责「窗口 UI + 尺寸/位置计算 + 容器 DOM」，
// 真正的 WebGL 渲染栈由 EditorView 创建并挂到 emit('container') 给出的元素上，
// 以便渲染器随页面生命周期统一管理与释放。
//
// 尺寸规则（与设计定稿一致）：比例锁定 = 主视图比例；档位按主视图宽度取比例；
// 硬下限 宽 ≥ 320px 且 ≥ 主视图 20%；默认停靠右下角。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnimationStore } from '../store/animationStore'
import {
  FLOAT_SIZE_LABELS,
  FLOAT_SIZE_ORDER,
  FLOAT_WINDOW_MARGIN_PX,
  computeFloatWindowSize,
  shouldCollapseSizeGroup,
  type FloatSizePreset,
} from '../core/animation/types'

const props = defineProps<{
  /** 主视图容器：作为尺寸档位与比例锁定的基准，也是浮窗的定位参照 */
  hostEl: HTMLElement | null
}>()

const emit = defineEmits<{
  (e: 'container', el: HTMLElement | null): void
  (e: 'resize', width: number, height: number): void
  /** 复位浮窗相机到默认视角 */
  (e: 'reset-camera'): void
  /** 坐标系显示开关 */
  (e: 'toggle-axes', visible: boolean): void
}>()

const anim = useAnimationStore()

// 坐标系显示：仅影响浮窗本机观感，默认开启
const AXES_KEY = 'geomesh3d_float_axes'
const axesVisible = ref(localStorage.getItem(AXES_KEY) !== '0')
function toggleAxes() {
  axesVisible.value = !axesVisible.value
  try {
    localStorage.setItem(AXES_KEY, axesVisible.value ? '1' : '0')
  } catch {
    // 存储不可用时仅本次会话生效
  }
  emit('toggle-axes', axesVisible.value)
}

const frameEl = ref<HTMLElement | null>(null)
const canvasHostEl = ref<HTMLElement | null>(null)
/** 隐藏探针（始终按「展开态」渲染，用于测量所需自然宽度） */
const measureProbeEl = ref<HTMLElement | null>(null)
/** 折叠态的尺寸选择器按钮与菜单 */
const sizeMenuButtonEl = ref<HTMLElement | null>(null)
const sizeMenuEl = ref<HTMLElement | null>(null)

/**
 * 头部空间不足时，把「小/中/大/最大化」四个按钮折叠成一个选择器。
 *
 * 判定：用**隐藏探针**测量展开态所需自然宽度，与窗口可用宽度比较。
 * 探针始终按展开态渲染，所需宽度不随折叠状态变化 —— 因此不会出现
 * 「折叠后够用了 → 又展开 → 又不够」的来回抖动。
 */
const sizeGroupCollapsed = ref(false)
const sizeMenuOpen = ref(false)
const sizeMenuPosition = ref({ top: 0, left: 0 })

const measureHeaderFit = () => {
  const probe = measureProbeEl.value
  const frame = frameEl.value
  if (!probe || !frame) return
  const required = probe.offsetWidth
  const available = frame.clientWidth
  if (required <= 0 || available <= 0) return
  sizeGroupCollapsed.value = shouldCollapseSizeGroup(required, available)
  if (!sizeGroupCollapsed.value) sizeMenuOpen.value = false
}

let frameResizeObserver: ResizeObserver | null = null

const watchFrameSize = (el: HTMLElement | null) => {
  frameResizeObserver?.disconnect()
  frameResizeObserver = null
  if (!el) return
  frameResizeObserver = new ResizeObserver(() => measureHeaderFit())
  frameResizeObserver.observe(el)
}

/** 打开折叠选择器：fixed 定位，避免被窗口的 overflow:hidden 裁掉 */
const openSizeMenu = () => {
  const button = sizeMenuButtonEl.value
  if (!button) return
  const rect = button.getBoundingClientRect()
  const menuWidth = 104
  sizeMenuPosition.value = {
    top: Math.round(rect.bottom + 4),
    left: Math.round(Math.max(4, rect.right - menuWidth)),
  }
  sizeMenuOpen.value = true
}

const closeSizeMenu = () => {
  sizeMenuOpen.value = false
}

const pickCollapsedSize = (preset: FloatSizePreset) => {
  pickSize(preset)
  closeSizeMenu()
}

const onSizeMenuDocumentPointerDown = (e: PointerEvent) => {
  const target = e.target as Node
  if (sizeMenuEl.value?.contains(target)) return
  if (sizeMenuButtonEl.value?.contains(target)) return
  closeSizeMenu()
}
const onSizeMenuKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeSizeMenu()
}

watch(sizeMenuOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onSizeMenuDocumentPointerDown, true)
    document.addEventListener('keydown', onSizeMenuKeydown)
  } else {
    document.removeEventListener('pointerdown', onSizeMenuDocumentPointerDown, true)
    document.removeEventListener('keydown', onSizeMenuKeydown)
  }
})

/** 主视图尺寸（ResizeObserver 实时跟踪） */
const hostWidth = ref(0)
const hostHeight = ref(0)

let hostObserver: ResizeObserver | null = null

const measureHost = () => {
  const host = props.hostEl
  if (!host) return
  hostWidth.value = host.clientWidth
  hostHeight.value = host.clientHeight
}

const watchHost = (host: HTMLElement | null) => {
  hostObserver?.disconnect()
  hostObserver = null
  if (!host) return
  measureHost()
  hostObserver = new ResizeObserver(() => measureHost())
  hostObserver.observe(host)
}

onMounted(() => {
  watchHost(props.hostEl)
  if (canvasHostEl.value) emit('container', canvasHostEl.value)
  // 容器就绪后再同步一次坐标系状态（此刻渲染栈刚被创建）
  nextTick(() => emit('toggle-axes', axesVisible.value))
  watchFrameSize(frameEl.value)
  void nextTick(() => {
    measureHeaderFit()
    // 字体加载完成后度量会变化，再测一次
    void document.fonts?.ready?.then(() => measureHeaderFit())
  })
})
onBeforeUnmount(() => {
  hostObserver?.disconnect()
  hostObserver = null
  frameResizeObserver?.disconnect()
  frameResizeObserver = null
  closeSizeMenu()
  emit('container', null)
})

watch(
  () => props.hostEl,
  (el) => watchHost(el),
)

/** 浮窗尺寸（含比例锁定与硬下限） */
const size = computed(() =>
  computeFloatWindowSize(hostWidth.value, hostHeight.value, anim.floatSize),
)

// ── 位置：默认停靠右下角；标题栏可拖拽，拖拽偏移量以「距右/距下」记录 ──
// 位置记忆到本地：浮窗随播放挂载/卸载，不记忆的话每次都会回到右下角。
const FLOAT_POS_KEY = 'geomesh3d_float_position'
const FLOAT_POS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function loadStoredOffsets(): { right: number; bottom: number } | null {
  try {
    const raw = localStorage.getItem(FLOAT_POS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { right?: number; bottom?: number; at?: number }
    if (typeof parsed.right !== 'number' || typeof parsed.bottom !== 'number') return null
    // 过期位置数据作废（避免很久以后用不同窗口尺寸打开时位置离谱）
    if (typeof parsed.at === 'number' && Date.now() - parsed.at > FLOAT_POS_MAX_AGE_MS) return null
    return { right: parsed.right, bottom: parsed.bottom }
  } catch {
    return null
  }
}

const storedOffsets = loadStoredOffsets()
const offsetRight = ref(storedOffsets?.right ?? FLOAT_WINDOW_MARGIN_PX)
const offsetBottom = ref(storedOffsets?.bottom ?? FLOAT_WINDOW_MARGIN_PX)

/** 换档位或改变主视图尺寸时，把偏移量夹紧回可用范围，避免窗口跑出可视区 */
const clampOffsets = () => {
  const maxRight = Math.max(FLOAT_WINDOW_MARGIN_PX, hostWidth.value - size.value.width)
  const maxBottom = Math.max(FLOAT_WINDOW_MARGIN_PX, hostHeight.value - size.value.height)
  offsetRight.value = Math.min(Math.max(FLOAT_WINDOW_MARGIN_PX, offsetRight.value), maxRight)
  offsetBottom.value = Math.min(Math.max(FLOAT_WINDOW_MARGIN_PX, offsetBottom.value), maxBottom)
}

const frameStyle = computed(() => ({
  width: `${size.value.width}px`,
  height: `${size.value.height}px`,
  right: `${offsetRight.value}px`,
  bottom: `${offsetBottom.value}px`,
}))

// 尺寸变化 → 通知上层调整渲染器；同时夹紧位置
watch(
  size,
  (s) => {
    clampOffsets()
    emit('resize', s.width, s.height)
    void nextTick(() => measureHeaderFit())
  },
  { immediate: true },
)
watch([hostWidth, hostHeight], clampOffsets)

// ── 拖拽（标题栏） ──
let dragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartRight = 0
let dragStartBottom = 0

function onHeaderPointerDown(e: PointerEvent) {
  // 只响应标题栏空白处（按钮自身处理点击）
  if ((e.target as HTMLElement).closest('button')) return
  dragging = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartRight = offsetRight.value
  dragStartBottom = offsetBottom.value
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  // 向右拖 → 距右变小（窗口右移）
  offsetRight.value = dragStartRight - (e.clientX - dragStartX)
  offsetBottom.value = dragStartBottom - (e.clientY - dragStartY)
  clampOffsets()
}

function onPointerUp() {
  if (!dragging) return
  dragging = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  // 拖拽结束后记忆位置（下一次挂载直接落在这里）
  try {
    localStorage.setItem(
      FLOAT_POS_KEY,
      JSON.stringify({ right: offsetRight.value, bottom: offsetBottom.value, at: Date.now() }),
    )
  } catch {
    // 存储不可用时忽略，位置仅在本次会话内生效
  }
}

onBeforeUnmount(onPointerUp)

// ── 尺寸档位 ──
const presets = FLOAT_SIZE_ORDER
const sizeLabel = (p: FloatSizePreset) => FLOAT_SIZE_LABELS[p]
function pickSize(p: FloatSizePreset) {
  anim.setFloatSize(p)
}

// ── 强制观看时不可关闭；模式切换始终自由 ──
const canClose = computed(() => !anim.isBroadcastForced)

function onSwitchInline() {
  anim.setMode('inline')
}
function onClose() {
  if (!canClose.value) return
  // 「退出播放」= 结束播放回到编辑器场景（若正在跟随广播，先尝试收起）
  if (anim.isWatchingBroadcast) {
    anim.dismissBroadcast()
    return
  }
  anim.exitPlayback()
}
</script>

<template>
  <div ref="frameEl" class="float-window" :style="frameStyle">
    <div class="fw-header" @pointerdown="onHeaderPointerDown">
      <span class="fw-title">动画播放</span>

      <!-- 展开态：四个尺寸按钮 -->
      <div v-if="!sizeGroupCollapsed" class="fw-size-group">
        <button
          v-for="p in presets"
          :key="p"
          class="fw-size-btn"
          :class="{ on: anim.floatSize === p }"
          :title="`尺寸：${sizeLabel(p)}`"
          @click="pickSize(p)"
        >
          {{ sizeLabel(p) }}
        </button>
      </div>

      <!-- 折叠态：窗口放不下四个按钮时收成一个选择器 -->
      <button
        v-else
        ref="sizeMenuButtonEl"
        class="fw-btn size-select"
        :class="{ on: sizeMenuOpen }"
        title="切换窗口尺寸档位"
        @click="sizeMenuOpen ? closeSizeMenu() : openSizeMenu()"
      >
        {{ sizeLabel(anim.floatSize) }}
        <span class="caret">▾</span>
      </button>
      <!-- 复位 / 坐标系 / 原地：仅文字，不用图标 -->
      <button class="fw-btn" title="复位视角到默认机位" @click="emit('reset-camera')">复位</button>
      <button
        class="fw-btn"
        :class="{ on: axesVisible }"
        :title="axesVisible ? '隐藏坐标系' : '显示坐标系'"
        @click="toggleAxes"
      >
        坐标系
      </button>
      <button class="fw-btn" title="切回原地播放" @click="onSwitchInline">原地</button>
      <button
        class="fw-btn close"
        :disabled="!canClose"
        :title="canClose ? '退出播放' : '房主已开启强制观看，无法退出'"
        @click="onClose"
      >
        ✕
      </button>
    </div>
    <div ref="canvasHostEl" class="fw-canvas-host"></div>

    <!-- 折叠选择器的下拉菜单（fixed 定位，不受窗口 overflow:hidden 裁剪） -->
    <div
      v-if="sizeMenuOpen"
      ref="sizeMenuEl"
      class="fw-size-menu"
      :style="{ top: `${sizeMenuPosition.top}px`, left: `${sizeMenuPosition.left}px` }"
    >
      <button
        v-for="p in presets"
        :key="p"
        class="fw-size-menu-item"
        :class="{ on: anim.floatSize === p }"
        @click="pickCollapsedSize(p)"
      >
        {{ sizeLabel(p) }}
      </button>
    </div>

    <!-- 隐藏探针：始终按「展开态」渲染，用于测量所需宽度（不可见、不参与布局） -->
    <div ref="measureProbeEl" class="fw-measure-probe" aria-hidden="true">
      <span class="fw-title">动画播放</span>
      <div class="fw-size-group">
        <button v-for="p in presets" :key="p" class="fw-size-btn">{{ sizeLabel(p) }}</button>
      </div>
      <button class="fw-btn">复位</button>
      <button class="fw-btn">坐标系</button>
      <button class="fw-btn">原地</button>
      <button class="fw-btn close">✕</button>
    </div>
  </div>
</template>

<style scoped>
.float-window {
  position: absolute;
  z-index: 60;
  display: flex;
  flex-direction: column;
  background: #111;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  overflow: hidden;
  /* 浮窗自身的指针事件不穿透；主视图仍可继续协作作图 */
  pointer-events: auto;
}

.fw-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 6px 0 10px;
  background: #1e1e1e;
  border-bottom: 1px solid #333;
  cursor: move;
  user-select: none;
}

.fw-title {
  /* 空间不足时优先压缩标题（省略号），而不是把按钮挤变形 */
  flex: 0 1 auto;
  min-width: 0;
  margin-right: auto;
  overflow: hidden;
  color: #bbb;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.fw-size-group {
  display: inline-flex;
  gap: 2px;
}

.fw-size-btn,
.fw-btn {
  /* 按钮不参与压缩：放不下时由折叠逻辑处理，避免被挤到互相遮挡 */
  flex: 0 0 auto;
  height: 22px;
  padding: 0 8px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #bbb;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.fw-size-btn:hover,
.fw-btn:hover:not(:disabled) {
  background: #333;
  border-color: #4a4a4a;
  color: #eee;
}
.fw-size-btn.on {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.fw-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.fw-btn.on {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.fw-btn.exit {
  background: #3a1e1e;
  border-color: #6a3030;
  color: #ffc0c0;
}
.fw-btn.exit:hover:not(:disabled) {
  background: #4a1e1e;
  border-color: #8a3030;
  color: #ffdcdc;
}
.fw-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* 折叠态的选择器按钮 */
.fw-btn.size-select {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.fw-btn.size-select .caret {
  font-size: 9px;
  line-height: 1;
  opacity: 0.75;
}

/* 下拉菜单（fixed：不会被窗口的 overflow:hidden 裁掉） */
.fw-size-menu {
  position: fixed;
  z-index: 80;
  display: flex;
  flex-direction: column;
  min-width: 104px;
  padding: 4px;
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
}
.fw-size-menu-item {
  height: 24px;
  padding: 0 10px;
  background: transparent;
  border: 0;
  border-radius: 4px;
  color: #bbb;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.fw-size-menu-item:hover {
  background: #2f2f2f;
  color: #eee;
}
.fw-size-menu-item.on {
  background: #1d4a7a;
  color: #eaf4ff;
}

/*
 * 隐藏探针：始终按展开态渲染，仅用于测量「放下全部按钮需要多宽」。
 * 放在窗口外（left 负向偏移）且 visibility:hidden，不参与可见布局、不响应交互。
 */
.fw-measure-probe {
  position: absolute;
  top: 0;
  left: -99999px;
  display: flex;
  align-items: center;
  gap: 4px;
  width: max-content;
  height: 30px;
  padding: 0 6px 0 10px;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
}
.fw-measure-probe .fw-btn,
.fw-measure-probe .fw-size-btn {
  flex: 0 0 auto;
}

.fw-canvas-host {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #111;
}
</style>
