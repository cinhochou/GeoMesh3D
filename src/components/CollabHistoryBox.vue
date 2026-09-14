<!-- src/components/CollabHistoryBox.vue
  协作历史消息框（按设计定稿实现）：
  - 左上角置放，整个消息框背景完全透明
  - 消息带年月日-时间：2026-09-08 14:30:05
  - 消息文案：时间 + [分类前缀] 昵称 动作 对象[:参数 修改前→修改后]（撤销/重做带「引用操作」）
  - 几何对象 = 种类+名称紧密相连的整体（点A、三点圆圆A），内部无空隙
  - 高度自适应内容：展开最多显示 5 条完整消息，收起只显示 1 条；超出可滚动
  - 宽度自适应：枚举片段前缀和候选，取 ≤ 上限（容器 1/3）的最大者——有折行时宽度尽量
    接近上限且最宽行右缘恰好填满（无空白）；无折行时等于最长消息宽。展开/收起按钮小尺寸恒在最右
  - 滚动条不在底部且有新消息时显示未读数字角标，点击回到最新
  - 收起后再展开不回到顶部（保留滚动位置） -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CollabHistoryMessage, CollabHistoryCategory, CollabHistoryParam } from '@/types/collabHistory'
import { COLLAB_HISTORY_PREFIX, formatCollabHistoryTime } from '@/types/collabHistory'

defineOptions({ name: 'CollabHistoryBox' })

const props = defineProps<{
  messages: CollabHistoryMessage[]
}>()

/** 展开时最多显示的完整消息条数 */
const MAX_EXPANDED_ROWS = 5
/** 收起时显示的完整消息条数 */
const MAX_COLLAPSED_ROWS = 1

const expanded = ref(true)
const rootRef = ref<HTMLDivElement | null>(null)
const scrollRef = ref<HTMLDivElement | null>(null)
const savedScrollTop = ref(0)
// 未读新消息计数：滚动条不在底部且有新消息时显示数字角标，滚到底部或点击角标后清零
const unreadCount = ref(0)
/** 用户已“看过”的消息条数（底部自动跟随 / 点击角标 / 真实滚动到底时更新）；-1 表示尚未初始化 */
let lastSeenCount = -1
/**
 * 已见消息 id 集合：精确统计未读新消息。
 * 不能用「数组长度差」判断新增——消息达到 200 条上限后每次新增都会裁剪最旧的，
 * 长度恒为 200，长度差语义完全失效（未读角标与自动跟随会永久失效）。
 */
const seenMsgIds = new Set<string>()

const markAllSeen = () => {
  seenMsgIds.clear()
  props.messages.forEach((m) => seenMsgIds.add(m.id))
}
/**
 * 是否锚定在底部：用户最后一次滚动位于底部则为 true。
 * 锚定状态下新增消息自动跟随滚动到底；一旦用户向上滚动则解除锚定（仅显示未读提醒）。
 * 不能直接在 watcher 里用 isAtBottom() 判定——flush:'post' 时 DOM 已加入新消息，
 * 按新高度判定旧位置必然非底部，会导致永不跟随。
 */
let pinnedToBottom = true

const visibleRows = computed(() => (expanded.value ? MAX_EXPANDED_ROWS : MAX_COLLAPSED_ROWS))

/** 每个消息分类的前缀颜色 */
const PREFIX_COLOR: Record<CollabHistoryCategory, string> = {
  create: '#7ee787',
  delete: '#ff7b72',
  update: '#79c0ff',
  move: '#d2a8ff',
  lock: '#f2cc60',
  unlock: '#f2cc60',
  merge: '#79c0ff',
  clear: '#ff7b72',
  room: '#8b949e',
  undo: '#79c0ff',
  redo: '#79c0ff',
}

const prefixOf = (category: CollabHistoryCategory) => COLLAB_HISTORY_PREFIX[category]
const colorOf = (category: CollabHistoryCategory) => PREFIX_COLOR[category]
const timeOf = (createdAt: number) => formatCollabHistoryTime(createdAt)

/** 渲染单个参数：半径 3.00→4.50；仅有 before（如合并吸收点）显示「标签 值」 */
const renderParam = (p: CollabHistoryParam) => {
  if (p.before && p.after) return `${p.label} ${p.before}→${p.after}`
  if (p.before) return `${p.label} ${p.before}`
  return p.label
}

/** 是否已滚动到最底部（允许 4px 容差） */
const isAtBottom = () => {
  const el = scrollRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= 4
}

const scrollToBottom = () => {
  // 同步设置：调用时机（消息变更 flush:'post' + fitWidth 强制 reflow 之后）布局已就绪，
  // scrollHeight 是最新值，直接设置即可让滚动条在底部时跟随新消息自动滚动到底
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// 滚动过程中持续记录位置：收起后再展开时恢复不回到顶部；滚动到底部时锚定跟随并清空未读角标
const handleScroll = () => {
  const el = scrollRef.value
  if (!el) return
  savedScrollTop.value = el.scrollTop
  const bottom = isAtBottom()
  pinnedToBottom = bottom
  if (bottom) {
    unreadCount.value = 0
    lastSeenCount = props.messages.length
    markAllSeen()
  }
}

/** 点击未读角标或跳转最新：锚定底部并滚到最新消息 */
const jumpToLatest = () => {
  unreadCount.value = 0
  lastSeenCount = props.messages.length
  markAllSeen()
  pinnedToBottom = true
  scrollToBottom()
}

/** 宽度上限：min(容器宽度的 1/3, 100vw - 48px)；计算样式未解析出像素值时回退实测 */
const resolveWidthCap = () => {
  const box = rootRef.value
  if (!box) return Infinity
  const raw = parseFloat(getComputedStyle(box).maxWidth)
  if (Number.isFinite(raw) && raw >= 50) return raw
  const parent = box.parentElement
  const third = parent ? parent.clientWidth / 3 : Infinity
  return Math.min(third, window.innerWidth - 48)
}

/**
 * 宽度自适应（确定性算法，不存在「卡在窄宽度」的不动点问题）：
 * - 目标：宽度尽量接近上限，且最宽的一行恰好填满框宽（右缘不留空白）。
 * - 每条消息由若干不可拆分片段组成（nowrap、间距 6px）。某消息在宽度 W 下折行时，
 *   其片段「前缀和」正是让首行恰好填满 W 的临界宽度。枚举所有消息的全部前缀和候选，
 *   取 ≤ 上限的最大者作为框宽：既尽量达到上限，又保证最宽行右缘紧贴框边（无空白）。
 * - 若最长消息整条放得下（无需折行），最大候选即其整条宽，行为退化为
 *   「按最长消息自适应」；无候选（单片段已超上限）时取上限，超宽由滚动区裁切。
 * - 滚动条出现/消失会改变可用宽度，应用后复测，最多 4 轮收敛。
 * 注意：绝不先跳回 max-content 全宽再收紧——滚动区高度塌缩会把 scrollTop 夹紧到底部
 * 并派发 scroll 事件，误触发 handleScroll 清零未读角标。
 */
const fitWidth = () => {
  const box = rootRef.value
  const scroller = scrollRef.value
  if (!box || !scroller) return
  const cap = resolveWidthCap()
  const MSG_PAD = 8 // .collab-history-msg 左右 padding 2px 4px
  const GAP = 6 // column-gap
  let scrollbar = scroller.offsetWidth - scroller.clientWidth
  let applied = -1
  for (let round = 0; round < 4; round++) {
    // 1. 采集每条消息的片段宽度（nowrap 片段宽度与框宽无关，测量稳定）
    //    主干片段与从属片段（含缩进偏移）组成连续的“前缀和”序列
    const fragmentWidths: number[][] = []
    for (const msg of Array.from(scroller.querySelectorAll<HTMLElement>('.collab-history-msg'))) {
      const msgLeft = msg.getBoundingClientRect().left
      const widths: number[] = []
      for (const span of Array.from(msg.querySelectorAll<HTMLElement>(':scope > .collab-history-main > span'))) {
        widths.push(span.getBoundingClientRect().width)
      }
      const detail = msg.querySelector<HTMLElement>(':scope > .collab-history-detail')
      if (detail) {
        const offset = detail.getBoundingClientRect().left - msgLeft
        const spans = Array.from(detail.querySelectorAll<HTMLElement>(':scope > span'))
        spans.forEach((span, i) => {
          // 从属的尾注（级联删除/由X拖动）与引用（撤销/重做）内部允许换行，
          // 不参与“恰好填满”宽度候选（避免长文本把消息框撑到和文本一样宽而失去折行）
          if (span.classList.contains('collab-history-note') || span.classList.contains('collab-history-quote')) return
          widths.push(span.getBoundingClientRect().width + (i === 0 ? offset : 0))
        })
      }
      if (widths.length > 0) fragmentWidths.push(widths)
    }
    if (fragmentWidths.length === 0) {
      // 无可测内容（空态）：还原自然宽度
      if (box.style.width !== '') box.style.width = ''
      return
    }
    // 2. 候选框宽 = 各消息每个片段前缀和 + 消息内边距 + 滚动条（该宽度下此行恰好填满）
    let best = 0
    for (const widths of fragmentWidths) {
      let line = 0
      for (let k = 0; k < widths.length; k++) {
        line += widths[k]! + (k > 0 ? GAP : 0)
        const candidate = line + MSG_PAD + scrollbar
        if (candidate <= cap + 0.5 && candidate > best) best = candidate
      }
    }
    // 3. 目标宽度：取 ≤ 上限的最大候选（尽量达到上限且右缘无空白）
    const target = Math.ceil(best > 0 ? best : cap)
    if (!Number.isFinite(target)) return
    if (target === applied) break
    applied = target
    box.style.width = `${target}px`
    // 4. 宽度变化可能使滚动条出现/消失（占位宽度变化）→ 复测一轮
    const actual = scroller.offsetWidth - scroller.clientWidth
    if (actual === scrollbar) break
    scrollbar = actual
  }
}

const toggleExpanded = () => {
  expanded.value = !expanded.value
  if (expanded.value) {
    nextTick(() => {
      if (scrollRef.value) scrollRef.value.scrollTop = savedScrollTop.value
    })
  }
  // 展开/收起改变可见高度，滚动条可能出现/消失（占位宽度变化），需要重新贴合宽度
  nextTick(fitWidth)
}

// 容器尺寸变化（上限为容器宽的 1/3）时重新贴合
let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  fitWidth()
  resizeObserver = new ResizeObserver(() => fitWidth())
  if (rootRef.value?.parentElement) resizeObserver.observe(rootRef.value.parentElement)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

// 消息变更处理：
// - 清空（房间关闭重置）：滚动/未读/锚定/已见状态一并重置
// - 初次到位（加入房间同步历史）：全部视为已见，直接滚到最新，不产生未读
// - 新增消息：锚定在底部则自动跟随滚动到底；否则未读数按「不在已见集合中的消息」精确统计
//   （基于消息 id，不受 200 条上限裁剪影响，长度恒为 200 时跟随/未读依旧有效）
watch(
  () => props.messages,
  (messages) => {
    // 是否跟随新消息：先于 fitWidth 记录锚定状态（避免宽度重排影响判定）
    const shouldFollow = messages.length > 0 && pinnedToBottom
    fitWidth()
    if (messages.length === 0) {
      lastSeenCount = 0
      unreadCount.value = 0
      savedScrollTop.value = 0
      pinnedToBottom = true
      expanded.value = true
      seenMsgIds.clear()
      nextTick(() => {
        if (scrollRef.value) scrollRef.value.scrollTop = 0
      })
      return
    }
    // 初次到位：全部视为已见
    if (lastSeenCount < 0) {
      lastSeenCount = messages.length
      unreadCount.value = 0
      pinnedToBottom = true
      markAllSeen()
      scrollToBottom()
      return
    }
    // 未读统计：不在已见集合中的消息条数（基于 id 判断，200 条上限裁剪不影响精确性）
    const unseen = messages.filter((m) => !seenMsgIds.has(m.id))
    if (shouldFollow) {
      // 锚定底部：新增消息（含上限裁剪下“等量位移”的末尾新增）一律视为已见并跟随滚到底
      if (unseen.length > 0) lastSeenCount = messages.length
      markAllSeen()
      unreadCount.value = 0
      scrollToBottom()
    } else if (unseen.length > 0) {
      unreadCount.value = unseen.length
    }
    // 无新增消息（头部裁剪/等量重推等）：保持现状
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="rootRef" class="collab-history-box" :style="{ '--chb-rows': visibleRows }">
    <div class="collab-history-header">
      <span class="collab-history-title">协作历史</span>
      <button
        type="button"
        class="collab-history-toggle"
        :title="expanded ? '收起（只显示1条）' : '展开（显示5条）'"
        :aria-label="expanded ? '收起协作历史' : '展开协作历史'"
        @click="toggleExpanded"
      >
        <!-- 展开时显示"收起"（上箭头），收起时显示"展开"（下箭头） -->
        <svg
          v-if="expanded"
          class="collab-history-toggle-icon"
          viewBox="0 0 16 16"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 10l4-4 4 4"></path>
        </svg>
        <svg
          v-else
          class="collab-history-toggle-icon"
          viewBox="0 0 16 16"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4"></path>
        </svg>
      </button>
    </div>
    <div ref="scrollRef" class="collab-history-messages" @scroll.passive="handleScroll">
      <div v-if="messages.length === 0" class="collab-history-msg collab-history-empty">
        暂无协作历史消息
      </div>
      <div v-for="msg in messages" :key="msg.id" class="collab-history-msg">
        <!-- 主干：时间/前缀/昵称/动作/对象，均为不可拆分整体，宽度不足时整体折行 -->
        <div class="collab-history-main">
          <span class="collab-history-time">{{ timeOf(msg.createdAt) }}</span>
          <span class="collab-history-prefix" :style="{ color: colorOf(msg.category) }">{{ prefixOf(msg.category) }}</span>
          <span class="collab-history-name">{{ msg.userName || '其他用户' }}</span>
          <span class="collab-history-action">{{ msg.action }}</span>
          <!-- 几何对象：种类+名称紧密相连为一个整体（点A、三点圆圆A），中间不留空隙 -->
          <span v-if="msg.targetName" class="collab-history-target"><span v-if="msg.targetType" class="collab-history-kind">{{ msg.targetType }}</span>{{ msg.targetName }}</span>
        </div>
        <!-- 从属信息：参数变化 / 撤销引用 / 拖拽标注 / 级联删除，换行时缩进体现分级 -->
        <div
          v-if="msg.params.length > 0 || msg.quote || msg.note"
          class="collab-history-detail"
        >
          <template v-if="msg.params.length > 0">
            <span class="collab-history-params-colon">：</span>
            <!-- 每个「属性名称 + 属性变化」为一个整体，不够宽度时整组换行 -->
            <span
              v-for="(p, idx) in msg.params"
              :key="idx"
              class="collab-history-param"
            >
              {{ renderParam(p) }}<span v-if="idx < msg.params.length - 1" class="collab-history-param-sep">，</span>
            </span>
          </template>
          <span v-if="msg.quote" class="collab-history-quote">「{{ msg.quote }}」</span>
          <!-- 删除的级联标注：红系 + 箭头，区别于修改的「由X点拖动」（斜体弱化） -->
          <span v-if="msg.note && msg.category === 'delete'" class="collab-history-note collab-history-note-delete">→ {{ msg.note }}</span>
          <span v-if="msg.note && msg.category !== 'delete'" class="collab-history-note collab-history-note-update">{{ msg.note }}</span>
        </div>
      </div>
    </div>
    <!-- 未读新消息数字角标：滚动条不在底部且有新消息时出现，点击回到最新 -->
    <button
      v-if="unreadCount > 0"
      type="button"
      class="collab-history-badge"
      :title="`有 ${unreadCount} 条新消息，点击回到最新`"
      :aria-label="`有 ${unreadCount} 条新消息，点击回到最新`"
      @click="jumpToLatest"
    >
      {{ unreadCount }}
    </button>
  </div>
</template>

<style scoped>
/* 整个消息框背景完全透明；宽度由 fitWidth() 枚举候选确定（≤ 上限的最大「恰好填满」宽度） */
.collab-history-box {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: max-content;
  max-width: min(33.3333%, calc(100vw - 48px));
  background: transparent;
  pointer-events: auto;
  --chb-row: 22px;
}

/* 头部仅按标题自然宽度，不撑满消息框；高度与按钮一致，按钮不会压到下方消息/滚动条 */
.collab-history-header {
  display: flex;
  align-items: center;
  width: max-content;
  min-height: 16px;
  margin-bottom: 2px;
}

.collab-history-title {
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.65);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
}

/* 纯 SVG 图标按钮，无需文字；小尺寸（16px）绝对定位到消息框右上角 */
.collab-history-toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition:
    background-color 0.15s,
    border-color 0.15s,
    color 0.15s;
}

.collab-history-toggle:hover {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.55);
  color: #ffffff;
}

.collab-history-toggle-icon {
  display: block;
}

/* 消息滚动区：高度自适应内容，最多显示 visibleRows 条（单行当量），超出滚动；
   宽度随内容（作为消息框的 max-content 来源）实时自适应 */
.collab-history-messages {
  max-height: calc(var(--chb-rows) * var(--chb-row));
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.5) transparent;
}

/* 消息行：主干 + 从属信息两级结构。各片段（时间/前缀/昵称/动作/对象/单条属性）为不可拆分整体，
   整体放不下时整组换行并保持左对齐；列间距 6px、换行产生的子行与母行及各子行之间 0 间距 */
.collab-history-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  min-height: var(--chb-row);
  padding: 2px 4px;
  color: #ffffff;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
}

/* 主干（时间/前缀/昵称/动作/对象）：同段自动换行 */
.collab-history-main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: flex-start;
  column-gap: 6px;
  row-gap: 0;
}

/* 从属信息（参数/撤销引用/拖拽标注/级联删除）：相对主干缩进 + 浅色竖线，体现分级 */
.collab-history-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: flex-start;
  column-gap: 6px;
  row-gap: 0;
  margin-left: 16px;
  padding-left: 6px;
  border-left: 1px solid rgba(255, 255, 255, 0.16);
}

/* 年月日-时间：细节弱化 */
.collab-history-time {
  flex-shrink: 0;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.45);
  font-family: monospace;
}

.collab-history-prefix {
  flex-shrink: 0;
  white-space: nowrap;
  font-weight: 600;
}

.collab-history-name {
  flex-shrink: 0;
  white-space: nowrap;
  color: #9fd8ff;
}

.collab-history-action {
  flex-shrink: 0;
  white-space: nowrap;
}

/* 几何对象：种类+名称作为一个整体，整体不拆分、内部无空隙（点A、三点圆圆A） */
.collab-history-target {
  flex-shrink: 0;
  white-space: nowrap;
}

/* 几何对象种类（嵌在对象整体内，紧贴名称） */
.collab-history-kind {
  color: rgba(255, 255, 255, 0.75);
}

.collab-history-params-colon {
  flex-shrink: 0;
  white-space: nowrap;
}

/* 单个“属性名称 + 属性变化”：整体不拆分，宽度不足时整组换行 */
.collab-history-param {
  flex-shrink: 0;
  white-space: nowrap;
}

.collab-history-param-sep {
  margin-left: 1px;
}

/* 引用「…」（撤销/重做）：内部允许换行，不撑宽消息框 */
.collab-history-quote {
  flex-shrink: 1;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
  color: rgba(255, 255, 255, 0.75);
}

/* 尾注（删除「级联删除…」/ 修改「由X点拖动」）：从属消息统一允许内部换行 */
.collab-history-note {
  flex-shrink: 1;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: normal;
}

/* 修改类标注：斜体弱化 */
.collab-history-note-update {
  font-style: italic;
  color: rgba(255, 255, 255, 0.5);
}

/* 删除类标注（级联删除）：红系、非斜体、箭头前缀 */
.collab-history-note-delete {
  font-style: normal;
  color: rgba(255, 123, 114, 0.9);
}

.collab-history-empty {
  color: rgba(255, 255, 255, 0.45);
}

/* 未读新消息数字角标：悬浮于消息区右下角，点击回到最新消息 */
.collab-history-badge {
  position: absolute;
  right: 8px;
  bottom: 6px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border: none;
  border-radius: 999px;
  background: #f56c6c;
  color: #ffffff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  transition: background-color 0.15s;
}

.collab-history-badge:hover {
  background: #e5563c;
}
</style>