<!-- eslint-disable vue/multi-word-component-names -- 沿用既有组件名 Timeline -->
<script setup lang="ts">
// P2 时间轴：会话下拉（多段录音管理）+ 录制（含暂停/继续）+ 完整回放控制（节奏选择器 / 循环 / 方向）+ 步带。
// 步间过渡与相机聚焦在 P3 阶段加入；浮窗（第二 renderer）在 P9。
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAnimationStore } from '../store/animationStore'
import { useAnimationLibraryStore } from '../store/animationLibraryStore'
import {
  RHYTHM_PRESETS,
  RHYTHM_MIN_MS,
  RHYTHM_MAX_MS,
  TRANSITION_PRESETS,
  FOCUS_ZOOM_PRESETS,
} from '../core/animation/types'
import AnimIcon from './AnimIcon.vue'
import { EASING_LABELS } from '../core/animation/EasingLibrary'
import type { EasingType, RecordingSession } from '../core/animation/types'

const anim = useAnimationStore()
const libStore = useAnimationLibraryStore()

const steps = computed(() => anim.currentSession?.steps ?? [])

/** 缓动选项（供下拉渲染） */
const EASING_OPTIONS = Object.entries(EASING_LABELS) as Array<[EasingType, string]>

// ── 会话下拉 ──
const menuOpen = ref(false)
const renamingId = ref<string | null>(null)
const renameText = ref('')

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (menuOpen.value) rhythmOpen.value = false
}
function closeMenu() {
  menuOpen.value = false
  renamingId.value = null
}
function pickSession(id: string) {
  if (anim.isActive) anim.exitPlayback()
  anim.setActiveSession(id)
  closeMenu()
}
function startRename(id: string, current: string) {
  renamingId.value = id
  renameText.value = current
}
function commitRename() {
  if (renamingId.value) anim.renameSession(renamingId.value, renameText.value)
  renamingId.value = null
}
function onRenameKey(e: KeyboardEvent) {
  if (e.key === 'Enter') commitRename()
  if (e.key === 'Escape') renamingId.value = null
}
function onDelete(id: string, name: string) {
  if (!window.confirm(`删除录制段「${name}」？该操作不可撤销。`)) return
  anim.removeSession(id)
  if (anim.activeSession?.id !== id) closeMenu()
}
/** 保存当前段到云端动画库（手动上传；本地段保留） */
function onSaveToLibrary(session: RecordingSession) {
  void libStore.saveSession(session)
}
/** 打开动画库弹窗（先收起会话下拉） */
function onOpenLibrary() {
  closeMenu()
  libStore.openDialog()
}

// ── 录制 ──
function onToggleRecord() {
  if (anim.isRecording) anim.stopRecording()
  else anim.startRecording()
}
function onPauseOrResume() {
  anim.toggleRecordingPause()
}

// ── 播放 ──
/** 正在观看他人广播时，本地控制一律锁住（由心跳纠偏，避免与房主抢控制权） */
const bcLocked = computed(() => anim.isWatchingBroadcast)

/**
 * 广播条文案：统一一句话，**不再按跟随 / 已收起 / 强制观看分类**。
 *
 * 当前处于哪种状态由右侧那个唯一的动作按钮体现（收起 / 跟随），
 * 文案只负责说明「谁在演示、我在跟随」这一件事，避免同一信息两处表达。
 * 房主自身不适用「跟随」措辞，单独给一句。
 */
const broadcastText = computed(() => {
  if (anim.broadcast.selfHosted) return '你正在广播动画'
  return `正在跟随 ${anim.broadcast.hostName || '房主'} 播放动画`
})

/**
 * 进入 / 退出播放（普通场景）。
 *
 * 广播期间的「收起 / 跟随」不在本按钮上 —— 由广播条上的按钮承担，
 * 避免同一功能出现两个入口（用户反馈过重复与歧义）。
 */
function onEnterOrExit() {
  if (anim.isActive) anim.exitPlayback()
  else anim.enterPlayback()
}
function onStepClick(index: number) {
  if (bcLocked.value) return
  if (!anim.isActive) anim.enterPlayback()
  anim.goto(index)
}

// ── 节奏选择器 ──
const rhythmOpen = ref(false)
const customMs = ref<string>('')

function toggleRhythm() {
  rhythmOpen.value = !rhythmOpen.value
  if (rhythmOpen.value) {
    menuOpen.value = false
    customMs.value = anim.autoAdvanceMs ? String(anim.autoAdvanceMs) : ''
  }
}
function pickRhythm(ms: number) {
  anim.setRhythmMs(ms)
  rhythmOpen.value = false
}
function applyCustomRhythm() {
  const n = Number(customMs.value)
  if (!Number.isFinite(n) || n <= 0) return
  anim.setRhythmMs(n)
  rhythmOpen.value = false
}
function onCustomKey(e: KeyboardEvent) {
  if (e.key === 'Enter') applyCustomRhythm()
  if (e.key === 'Escape') rhythmOpen.value = false
}

// ── 点击空白处收起下拉 ──
const sessionEl = ref<HTMLElement | null>(null)
const rhythmEl = ref<HTMLElement | null>(null)
const settingsEl = ref<HTMLElement | null>(null)

function onDocPointerDown(e: PointerEvent) {
  const target = e.target as Node
  if (menuOpen.value && sessionEl.value && !sessionEl.value.contains(target)) closeMenu()
  if (rhythmOpen.value && rhythmEl.value && !rhythmEl.value.contains(target))
    rhythmOpen.value = false
  if (settingsOpen.value && settingsEl.value && !settingsEl.value.contains(target))
    settingsOpen.value = false
}
onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointerDown, true))

// ── 设置面板的自适应定位 ──
// 时间轴贴在视口底部，面板需向上弹出；但它可能因为下列原因被裁切或覆盖：
//   1) 屏幕上方的可用高度不足（矮视口 / 横屏）；
//   2) 工具栏右侧空间不足（面板溢出视口右缘）；
//   3) 其他浮层 z-index 更高（工具栏菜单 1000+、协作面板 1300+）盖住它。
// 因此面板采用 fixed 定位 + 由 JS 计算坐标并限制高度，确保完整可见。
const settingsMenuEl = ref<HTMLElement | null>(null)
/** 面板与触发按钮/视口边缘的留白 */
const MENU_GAP = 8
const MENU_MARGIN = 8
/** 面板期望宽度（窄屏时收窄） */
const MENU_WIDTH = 320
/** 高度下限：低于该值就不再压缩，改为内部滚动 */
const MENU_MIN_HEIGHT = 180

const settingsMenuStyle = ref<Record<string, string>>({})

function positionSettingsMenu() {
  const trigger = settingsEl.value?.getBoundingClientRect()
  if (!trigger) return

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 宽度：不超出视口
  const width = Math.min(MENU_WIDTH, vw - MENU_MARGIN * 2)
  // 水平：默认与触发按钮右对齐（面板向左展开）；越界时夹紧到视口内
  let left = trigger.right - width
  left = Math.max(MENU_MARGIN, Math.min(left, vw - width - MENU_MARGIN))
  // 高度：向上弹出，可用高度 = 触发按钮顶部以上、扣除间距与留白
  const available = trigger.top - MENU_GAP - MENU_MARGIN
  // 下限兜底（极小视口时不至于压缩到不可用），同时不超过视口本身
  const maxHeight = Math.min(Math.max(MENU_MIN_HEIGHT, available), vh - MENU_MARGIN * 2)
  // 垂直：用 bottom 定位，无需预先知道内容高度
  const bottom = vh - trigger.top + MENU_GAP

  settingsMenuStyle.value = {
    left: `${Math.round(left)}px`,
    bottom: `${Math.round(bottom)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(maxHeight)}px`,
  }
}

function onViewportResize() {
  if (settingsOpen.value) positionSettingsMenu()
}
onMounted(() => window.addEventListener('resize', onViewportResize))
onBeforeUnmount(() => window.removeEventListener('resize', onViewportResize))

// ── 设置面板（录制 + 播放两组，统一入口） ──
// 说明：录制开关与设置曾经是两个名字相近的按钮（「录制」/「录制设置」），
// 容易误点；现合并为单一「设置」入口，既消除歧义又减少工具栏占用。
const settingsOpen = ref(false)
const maxStepsText = ref('')

function toggleSettings() {
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) {
    menuOpen.value = false
    rhythmOpen.value = false
    maxStepsText.value = String(anim.maxStepsPerSession)
    // 面板由 v-if 渲染，需等挂载后再测量并定位
    void nextTick(() => positionSettingsMenu())
  } else {
    disarmClearAll()
  }
}
function pickTransition(ms: number) {
  anim.setTransitionMs(ms)
}
function pickEasing(type: EasingType) {
  anim.setTransitionEasing(type)
}
/** 过渡时长展示名 */
const transitionLabel = computed(() => {
  const preset = TRANSITION_PRESETS.find((p) => p.ms === anim.transitionMs)
  return preset ? preset.label : `${anim.transitionMs} ms`
})
function applyMaxSteps() {
  const n = Number(maxStepsText.value)
  if (!Number.isFinite(n) || n <= 0) return
  anim.setMaxStepsPerSession(n)
  maxStepsText.value = String(anim.maxStepsPerSession)
}
/**
 * 清空全部录制：两步确认（首次点击进入待确认态，3 秒内再点一次才执行）。
 * 用两步按钮替代原生 window.confirm —— 后者与应用整体风格不符，
 * 且会阻塞渲染循环。
 */
const clearAllArmed = ref(false)
let clearAllTimer: ReturnType<typeof setTimeout> | null = null

function disarmClearAll() {
  if (clearAllTimer !== null) {
    clearTimeout(clearAllTimer)
    clearAllTimer = null
  }
  clearAllArmed.value = false
}

function onClearAll() {
  const n = anim.sessions.length
  if (n === 0) return
  if (!clearAllArmed.value) {
    clearAllArmed.value = true
    clearAllTimer = setTimeout(disarmClearAll, 3000)
    return
  }
  disarmClearAll()
  anim.clearAllSessions()
  settingsOpen.value = false
}

// ── 步带自动滚动：让当前步始终可见 ──
const trackEl = ref<HTMLElement | null>(null)
const startEl = ref<HTMLElement | null>(null)
const stepEls = new Map<number, HTMLElement>()

function setStepRef(index: number) {
  return (el: unknown) => {
    if (el instanceof HTMLElement) stepEls.set(index, el)
    else stepEls.delete(index)
  }
}

watch(
  () => anim.cursor,
  (cursor) => {
    void nextTick(() => {
      const track = trackEl.value
      const el = cursor >= 0 ? stepEls.get(cursor) : startEl.value
      if (!track || !el) return
      const elLeft = el.offsetLeft
      const elRight = elLeft + el.offsetWidth
      const viewLeft = track.scrollLeft
      const viewRight = viewLeft + track.clientWidth
      if (elLeft < viewLeft) {
        track.scrollTo({ left: Math.max(0, elLeft - 8), behavior: 'smooth' })
      } else if (elRight > viewRight) {
        track.scrollTo({ left: elRight - track.clientWidth + 8, behavior: 'smooth' })
      }
    })
  },
)
</script>

<template>
  <div class="timeline">
    <div class="tl-bar">
      <!-- 会话下拉 -->
      <div ref="sessionEl" class="tl-session" :class="{ open: menuOpen }">
        <button
          class="tl-session-btn"
          :title="'录制段：' + (anim.activeSessionName || '（无）')"
          @click="toggleMenu"
        >
          <span class="swatch" :style="{ background: anim.activeSession?.color || '#555' }" />
          <span class="sname">{{ anim.activeSessionName || '（无录制段）' }}</span>
          <span class="caret">▾</span>
        </button>
        <div v-if="menuOpen" class="tl-menu">
          <div v-if="anim.sessions.length === 0" class="tl-menu-empty">暂无录制段</div>
          <div
            v-for="s in anim.sessions"
            :key="s.id"
            class="tl-menu-item"
            :class="{ current: s.id === anim.activeSession?.id }"
          >
            <span class="swatch" :style="{ background: s.color }" />
            <template v-if="renamingId === s.id">
              <input
                v-model="renameText"
                class="rename-input"
                autofocus
                @keydown="onRenameKey"
                @blur="commitRename"
              />
            </template>
            <template v-else>
              <span class="sname" :title="s.name" @click="pickSession(s.id)">{{ s.name }}</span>
              <span class="meta">{{ s.steps.length }} 步</span>
              <button
                class="mini"
                :title="libStore.savedSessionIds.has(s.id) ? '已在动画库' : '保存到动画库'"
                :disabled="libStore.savingSessionId === s.id || libStore.savedSessionIds.has(s.id)"
                @click.stop="onSaveToLibrary(s)"
              >
                <AnimIcon name="upload" :size="10" />
              </button>
              <button class="mini" title="重命名" @click.stop="startRename(s.id, s.name)">✎</button>
              <button class="mini" title="删除" @click.stop="onDelete(s.id, s.name)">
                <AnimIcon name="close" :size="10" />
              </button>
            </template>
          </div>
          <div class="tl-menu-sep" />
          <button class="tl-menu-lib" @click="onOpenLibrary">动画库…</button>
        </div>
      </div>

      <!-- 协作广播状态 -->
      <div
        v-if="anim.isBroadcastActive"
        class="tl-broadcast"
        :class="{ forced: anim.isBroadcastForced, hosted: anim.broadcast.selfHosted }"
      >
        <span class="bc-dot" />
        <span class="bc-text">{{ broadcastText }}</span>
        <!--
          广播控制：同一时刻**只呈现一个**动作，与当前状态一一对应。
          ⚠ 必须用互斥的 v-if/v-else-if：canDismissBroadcast 只排除「强制观看」，
          不排除「已收起」，若两个判断各自独立，已收起时会同时冒出「收起 + 跟随」两个按钮，
          而且「收起」此时点了也没有意义。
        -->
        <template v-if="!anim.broadcast.selfHosted">
          <button
            v-if="anim.isWatchingBroadcast && anim.canDismissBroadcast"
            class="mini"
            title="收起：不再跟随广播，回到自己的工作（可随时重新跟随）"
            @click="anim.dismissBroadcast()"
          >
            收起
          </button>
          <button
            v-else-if="anim.hasUnfollowedBroadcast"
            class="mini follow"
            title="重新跟随房主的广播动画"
            @click="anim.followBroadcast()"
          >
            跟随
          </button>
        </template>
      </div>

      <!-- 录制（AR 模式下禁用：环境只支持播放） -->
      <button
        class="tl-btn"
        :class="{ recording: anim.isRecording, paused: anim.isRecordingPaused }"
        :disabled="(!anim.isRecording && !anim.canRecord) || bcLocked"
        :title="
          anim.isRecording ? '停止录制' : anim.canRecord ? '开始录制' : anim.recordBlockedReason
        "
        @click="onToggleRecord"
      >
        <span class="dot" />
        {{ anim.isRecording ? `停止 (${anim.recording.stepCount})` : '录制' }}
      </button>
      <button
        v-if="anim.isRecording"
        class="tl-btn"
        :class="{ paused: anim.isRecordingPaused }"
        :title="anim.isRecordingPaused ? '继续录制' : '暂停录制'"
        @click="onPauseOrResume"
      >
        <AnimIcon :name="anim.isRecordingPaused ? 'play' : 'pause'" :size="12" />
        {{ anim.isRecordingPaused ? '继续' : '暂停' }}
      </button>

      <!-- 播放 -->
      <!--
        播放 / 退出播放（普通场景）。
        ⚠ 跟随广播期间隐藏：此时「收起 / 跟随」由上方广播条统一提供，
        这里再放一个既重复又与「对账逻辑会把退出的人立刻拉回」相互打架。
        已收起（不再跟随）时恢复显示 —— 成员仍可播放自己的录制段。
      -->
      <button
        v-if="!anim.isWatchingBroadcast"
        class="tl-btn"
        :class="{ 'glow-alert': anim.interactionBlockedHint }"
        :disabled="anim.stepCount === 0"
        :title="anim.isActive ? '退出播放' : '进入播放'"
        @click="onEnterOrExit"
      >
        {{ anim.isActive ? '退出播放' : '播放' }}
      </button>

      <template v-if="anim.isActive">
        <button
          class="tl-btn"
          :disabled="!anim.canPrev || bcLocked"
          title="回到起点"
          @click="anim.toStart()"
        >
          <AnimIcon name="skipStart" />
        </button>
        <button
          class="tl-btn"
          :disabled="!anim.canPrev || bcLocked"
          title="上一步（快捷键：←）"
          @click="anim.prev()"
        >
          <AnimIcon name="stepPrev" />
        </button>
        <button
          class="tl-btn play"
          :disabled="bcLocked"
          :title="
            bcLocked
              ? '房主广播中，播放由房主控制'
              : `${anim.isPlaying ? '暂停' : '播放'}（快捷键：空格）`
          "
          @click="anim.togglePlay()"
        >
          <AnimIcon :name="anim.isPlaying ? 'pause' : 'play'" :size="16" />
        </button>
        <button
          class="tl-btn"
          :disabled="!anim.canNext || bcLocked"
          title="下一步（快捷键：→）"
          @click="anim.next()"
        >
          <AnimIcon name="stepNext" />
        </button>
        <button
          class="tl-btn"
          :disabled="!anim.canNext || bcLocked"
          title="跳到末尾"
          @click="anim.toEnd()"
        >
          <AnimIcon name="skipEnd" />
        </button>

        <button
          class="tl-btn"
          :class="{ on: anim.isReverse }"
          :disabled="bcLocked"
          :title="
            anim.direction === 1 ? '当前正序播放（点击切为倒序）' : '当前倒序播放（点击切为正序）'
          "
          @click="anim.toggleDirection()"
        >
          <AnimIcon :name="anim.isReverse ? 'orderReverse' : 'orderForward'" />
          {{ anim.isReverse ? '倒序' : '正序' }}
        </button>

        <!-- 节奏选择器 -->
        <div ref="rhythmEl" class="tl-rhythm" :class="{ open: rhythmOpen }">
          <button
            class="tl-btn"
            :disabled="bcLocked"
            :title="'自动播放节奏（每步总时长，含过渡）：' + anim.rhythmLabel"
            @click="toggleRhythm"
          >
            <AnimIcon name="rhythm" :size="12" />
            {{ anim.rhythmLabel }}
          </button>
          <div v-if="rhythmOpen" class="tl-menu rhythm-menu">
            <div
              v-for="p in RHYTHM_PRESETS"
              :key="p.id"
              class="tl-menu-item rhythm-item"
              :class="{ current: anim.rhythmPreset?.id === p.id }"
              @click="pickRhythm(p.ms)"
            >
              <span class="rlabel">{{ p.label }}</span>
              <span class="rms">{{ p.ms }} ms</span>
            </div>
            <div class="rhythm-custom">
              <input
                v-model="customMs"
                class="rename-input"
                type="number"
                :min="RHYTHM_MIN_MS"
                :max="RHYTHM_MAX_MS"
                placeholder="自定义 ms"
                @keydown="onCustomKey"
              />
              <button class="mini apply" title="应用" @click="applyCustomRhythm">应用</button>
            </div>
            <div class="rhythm-hint">
              每步总时长（含过渡）· 范围 {{ RHYTHM_MIN_MS }}–{{ RHYTHM_MAX_MS }} ms
            </div>
          </div>
        </div>

        <!-- 循环 -->
        <button
          class="tl-btn"
          :class="{ on: anim.loop }"
          :disabled="bcLocked"
          :title="anim.loop ? '循环播放：开' : '循环播放：关'"
          @click="anim.toggleLoop()"
        >
          <AnimIcon name="loop" :size="12" />
          {{ anim.loop ? '循环' : '单次' }}
        </button>

        <!-- 播放载体切换（原地 ⇄ 浮窗）；AR 等环境禁止浮窗时不可用 -->
        <button
          class="tl-btn"
          :class="{ on: anim.mode === 'float' }"
          :disabled="!anim.canFloat"
          :title="
            anim.canFloat
              ? anim.mode === 'float'
                ? '当前在浮窗中播放（点击切回原地）'
                : '在浮窗中播放，主视图可继续协作作图'
              : '当前环境不支持浮窗播放'
          "
          @click="anim.setMode(anim.mode === 'float' ? 'inline' : 'float')"
        >
          <AnimIcon :name="anim.mode === 'float' ? 'float' : 'inline'" :size="12" />
          {{ anim.mode === 'float' ? '浮窗' : '原地' }}
        </button>
      </template>

      <!-- 设置（录制 + 播放统一入口；常显，避免与「录制」开关混淆） -->
      <div ref="settingsEl" class="tl-rhythm" :class="{ open: settingsOpen }">
        <button
          class="tl-btn"
          :class="{ on: settingsOpen }"
          :title="`设置：录制行为与播放过渡（当前过渡 ${transitionLabel} · 聚焦 ${anim.focusEnabled ? '开' : '关'}）`"
          @click="toggleSettings"
        >
          <AnimIcon name="settings" :size="12" />
          设置
        </button>
        <div
          v-if="settingsOpen"
          ref="settingsMenuEl"
          class="tl-menu settings-menu"
          :style="settingsMenuStyle"
        >
          <div class="set-group">录制{{ anim.canRecord ? '' : '（当前环境不可用）' }}</div>

          <div class="set-row">
            <span class="set-label">撤销重做</span>
            <div class="set-chips">
              <button
                class="chip"
                :class="{ on: anim.recordUndoRedo }"
                title="开启后，撤销/重做本身也会被记录为一个操作步"
                @click="anim.setRecordUndoRedo(true)"
              >
                记录
              </button>
              <button
                class="chip"
                :class="{ on: !anim.recordUndoRedo }"
                title="默认：播放是独立的一套演示，不掺入撤销/重做"
                @click="anim.setRecordUndoRedo(false)"
              >
                不记录
              </button>
            </div>
          </div>

          <div class="set-row">
            <span class="set-label">步数上限</span>
            <div class="set-chips">
              <input
                v-model="maxStepsText"
                class="rename-input steps-input"
                type="number"
                min="10"
                placeholder="每段最大步数"
                @keydown.enter="applyMaxSteps"
                @blur="applyMaxSteps"
              />
              <span class="hint-inline">步 / 段</span>
            </div>
          </div>

          <div class="set-row">
            <span class="set-label">清理</span>
            <div class="set-chips">
              <button
                class="chip danger"
                :class="{ armed: clearAllArmed }"
                :disabled="anim.sessions.length === 0"
                @click="onClearAll"
              >
                {{
                  clearAllArmed
                    ? `确认清空 ${anim.sessions.length} 段？再点一次`
                    : `清空全部录制（${anim.sessions.length} 段）`
                }}
              </button>
            </div>
          </div>

          <div class="set-group">播放</div>

          <div class="set-row">
            <span class="set-label">过渡时长</span>
            <div class="set-chips">
              <button
                v-for="p in TRANSITION_PRESETS"
                :key="p.label"
                class="chip"
                :class="{ on: anim.transitionMs === p.ms }"
                @click="pickTransition(p.ms)"
              >
                {{ p.label }}
              </button>
            </div>
          </div>

          <div class="set-row">
            <span class="set-label">缓动曲线</span>
            <div class="set-chips">
              <button
                v-for="[key, label] in EASING_OPTIONS"
                :key="key"
                class="chip"
                :class="{ on: anim.transitionEasing === key }"
                :disabled="!anim.hasTransition"
                @click="pickEasing(key)"
              >
                {{ label }}
              </button>
            </div>
          </div>

          <div class="set-row">
            <span class="set-label">相机聚焦</span>
            <div class="set-chips">
              <button
                class="chip"
                :class="{ on: anim.focusEnabled }"
                title="每步自动把操作对象置于视野中心（播放中手动旋转视角时自动让位）"
                @click="anim.setFocusEnabled(true)"
              >
                开
              </button>
              <button
                class="chip"
                :class="{ on: !anim.focusEnabled }"
                @click="anim.setFocusEnabled(false)"
              >
                关
              </button>
            </div>
          </div>

          <div v-if="anim.focusEnabled" class="set-row">
            <span class="set-label">推近程度</span>
            <div class="set-chips">
              <button
                v-for="preset in FOCUS_ZOOM_PRESETS"
                :key="preset.label"
                class="chip"
                :class="{ on: anim.focusZoomFactor === preset.factor }"
                :title="`相机距离 = 主体包围球半径 × ${preset.factor}`"
                @click="anim.setFocusZoom(preset.factor)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <span class="tl-info">
        <!-- 广播状态与操作已统一由上方广播条承担，此处不再重复 -->
        <!--
          状态标签与步骤文案**并存**：
          原先用 v-if / v-else-if 互斥，导致播放（或过渡）期间整条步骤内容被状态文案顶掉，
          用户只能看到「播放中 · 中」「过渡中…」，只有暂停时才看得到这一步在做什么。
          现在状态作为前置小标签，步骤内容始终显示。
        -->
        <span v-if="anim.isRecordingPaused" class="pause-tag">已暂停录制</span>
        <span v-else-if="anim.isTransitioning && anim.isActive" class="move-tag">过渡中…</span>
        <!-- 只保留「播放中…」：节奏档位（很慢/慢/中/快/很快）在右侧节奏选择器已经显示，
             放在这里属于重复信息，且会与步骤文案争夺宽度 -->
        <span v-else-if="anim.isPlaying && anim.isActive" class="play-tag"
          >播放中…{{ anim.loop ? ' · 循环' : '' }}</span
        >
        <span class="step-label">{{ anim.currentStepLabel || '（无录制段）' }}</span>
      </span>
    </div>

    <!--
      步带：独立成行（自身是 .timeline 的子元素，不再放在 .tl-bar 里）。
      ⚠ 不能放回控制行内：那样它的行位置会随窗口宽度在「同行 / 被挤到下一行」
      之间跳变，用户会看到进度按钮忽而在同一行、忽而换行。
      独立成行后位置恒定，且步骤过多时由自身横向滚动（trackEl 自动跟随当前步）。
    -->
    <div ref="trackEl" class="tl-track">
      <template v-if="steps.length > 0">
        <button
          ref="startEl"
          class="tl-step start"
          :class="{ active: anim.isActive && anim.cursor === -1 }"
          title="起点"
          @click="onStepClick(-1)"
        >
          起点
        </button>
        <button
          v-for="(step, i) in steps"
          :key="step.id"
          :ref="setStepRef(i)"
          class="tl-step"
          :class="{
            active: anim.isActive && anim.cursor === i,
            anchor: step.isAnchor,
            undo: step.intent?.category === 'undo' || step.intent?.category === 'redo',
          }"
          :title="`第 ${i + 1} 步：${step.label}`"
          @click="onStepClick(i)"
        >
          {{ i + 1 }}
        </button>
        <span class="tl-count">{{ anim.cursor + 1 || 0 }} / {{ steps.length }}</span>
      </template>
      <span v-else class="tl-empty">
        {{
          anim.canRecord
            ? '点击「录制」开始记录你的第一步操作'
            : anim.recordBlockedReason || '当前环境不支持录制'
        }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  /* 高度自适应：窗口变窄时控制行会换行到第二行，固定高度会把按钮裁掉 */
  height: auto;
  min-height: 96px;
  background: #1e1e1e;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
  padding: 6px 12px;
  gap: 6px;
  box-sizing: border-box;
  /* 下拉菜单需向上弹出（时间轴位于屏幕底部），故不裁剪 */
  overflow: visible;
}

.tl-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  /* 窗口变窄时换行，而不是把右侧按钮挤出可视区导致点不到 */
  flex-wrap: wrap;
  row-gap: 6px;
  overflow: visible;
}

.tl-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.tl-btn:hover:not(:disabled) {
  background: #333;
  border-color: #4a4a4a;
}
.tl-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.tl-btn.recording {
  background: #4a1e1e;
  border-color: #8a3030;
  color: #ff9a9a;
}
.tl-btn.paused {
  background: #4a3a1e;
  border-color: #8a7a30;
  color: #ffe09a;
}
.tl-btn.on {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.tl-btn.play {
  min-width: 34px;
  justify-content: center;
  font-size: 13px;
}
.tl-btn .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d04040;
}
.tl-btn.recording .dot {
  animation: tl-blink 1s infinite;
}
.tl-btn.recording.paused .dot {
  animation: none;
  opacity: 0.4;
}
@keyframes tl-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}

/* ── 会话下拉 ── */
.tl-session {
  position: relative;
  flex: 0 0 auto;
}
.tl-session-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  max-width: 180px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #ccc;
  font-size: 12px;
  cursor: pointer;
}
.tl-session-btn:hover {
  background: #333;
}
.tl-session-btn .sname {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-session-btn .caret {
  color: #888;
  font-size: 10px;
}
.swatch {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}
.tl-menu {
  position: absolute;
  left: 0;
  /* 向上弹出（时间轴在屏幕底部） */
  bottom: 30px;
  /* 需高于工具栏菜单/协作面板等浮层，否则会被盖住；仍低于模态对话框(2000) */
  z-index: 1500;
  min-width: 200px;
  max-height: 240px;
  overflow-y: auto;
  background: #252525;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.5);
  padding: 4px;
}
.tl-menu-empty {
  padding: 8px 10px;
  color: #777;
  font-size: 12px;
}
.tl-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
}
.tl-menu-item:hover {
  background: #333;
}
.tl-menu-item.current {
  background: #1d4a7a33;
}
.tl-menu-item .sname {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ddd;
  font-size: 12px;
  cursor: pointer;
}
.tl-menu-item .meta {
  color: #777;
  font-size: 11px;
  white-space: nowrap;
}
.mini {
  flex: 0 0 auto;
  /* 图标子项（.anim-icon 为 display:block）不吃 button 的 text-align 居中，
     块级 SVG 会贴按钮左上角；用 inline-flex 把内容（图标或文字）稳定放在正中 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  border-radius: 3px;
}
.mini:hover {
  background: #444;
  color: #fff;
}
.mini:disabled {
  opacity: 0.45;
  cursor: default;
}
.mini:disabled:hover {
  background: transparent;
  color: #999;
}
.tl-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: #333;
}
.tl-menu-lib {
  display: block;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #8ab8e8;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
}
.tl-menu-lib:hover {
  background: #333;
  color: #cfe4ff;
}
.rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 6px;
  background: #1a1a1a;
  border: 1px solid #4a90d9;
  border-radius: 3px;
  color: #eee;
  font-size: 12px;
  outline: none;
}

.tl-info {
  margin-left: auto;
  color: #888;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}
.pause-tag {
  color: #ffe09a;
}
/* 状态标签与步骤文案并存时的分隔与省略 */
.tl-info .pause-tag,
.tl-info .play-tag,
.tl-info .move-tag {
  flex: 0 0 auto;
  margin-right: 8px;
}
.tl-info .step-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.play-tag {
  color: #9fd8ff;
}
.move-tag {
  color: #c4a0ff;
}

/* ── 协作广播状态条 ── */
/* ── 退出播放按钮的泛红光提示 ──
   原地播放期间主视图显示的是播放场景、几何对象不可拖拽，用户容易误以为
   「已经是原场景」。当用户**真的去拖拽几何对象**时（被拦下的那一刻起算）
   让退出播放按钮泛红光 1.5s，以无文字的方式提示「仍在播放态，需先退出播放」。
   注意：不是播放期间一直亮，只有在发生操作尝试时才亮。 */
@keyframes tl-glow-alert {
  0%,
  100% {
    border-color: #a04040;
    box-shadow:
      0 0 0 1px rgba(255, 90, 90, 0.35),
      0 0 6px rgba(255, 90, 90, 0.25);
    color: #ffd0d0;
  }
  50% {
    border-color: #ff6a6a;
    box-shadow:
      0 0 0 2px rgba(255, 90, 90, 0.85),
      0 0 16px rgba(255, 90, 90, 0.7);
    color: #fff;
  }
}
.tl-btn.glow-alert:not(:disabled) {
  animation: tl-glow-alert 1.6s ease-in-out infinite;
}

.tl-broadcast {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  max-width: 240px;
  border-radius: 4px;
  background: #3a2f1a;
  border: 1px solid #6a5528;
  color: #ffc46b;
  font-size: 12px;
  white-space: nowrap;
}
.tl-broadcast.hosted {
  background: #1e3a2a;
  border-color: #2f6a48;
  color: #7fe0a8;
}
.tl-broadcast.forced {
  background: #3a1f24;
  border-color: #6a2f38;
  color: #ff9aa8;
}
.tl-broadcast .bc-text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.tl-broadcast .bc-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  animation: tl-blink 1.2s infinite;
}
.tl-broadcast .mini {
  color: inherit;
  font-size: 11px;
  width: auto;
  padding: 0 5px;
}
.tl-broadcast .mini.follow {
  color: #fff;
  background: rgba(255, 255, 255, 0.14);
  font-weight: 500;
}
.tl-broadcast .mini:hover {
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
}
/* ── 节奏选择器 ── */
.tl-rhythm {
  position: relative;
  flex: 0 0 auto;
}
.rhythm-menu {
  /* 节奏按钮靠近工具栏右侧 → 右对齐弹出，避免超出视口右缘 */
  left: auto;
  right: 0;
  min-width: 190px;
  padding: 6px;
}
.rhythm-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}
.rhythm-item .rlabel {
  color: #ddd;
  font-size: 12px;
}
.rhythm-item .rms {
  color: #777;
  font-size: 11px;
}
.rhythm-item.current {
  background: #1d4a7a55;
}
.rhythm-item.current .rlabel {
  color: #9fd8ff;
}
.rhythm-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-top: 1px solid #3a3a3a;
  margin-top: 4px;
}
.rhythm-custom .rename-input {
  width: 90px;
}
.mini.apply {
  width: auto;
  padding: 0 8px;
  height: 22px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #ccc;
}
.mini.apply:hover {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.rhythm-hint {
  padding: 2px 6px 0;
  color: #666;
  font-size: 11px;
}

/* ── 过渡设置面板 ── */
/* 用复合选择器提升优先级，确保能稳定覆盖 .tl-menu 的 max-height/overflow */
.tl-menu.settings-menu {
  /* 脱离时间轴的层叠/裁切环境：fixed + JS 计算坐标，保证不被遮挡且完整可见 */
  position: fixed;
  top: auto;
  right: auto;
  /* left / bottom / width / maxHeight 由 settingsMenuStyle 内联给出 */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 10px;
}
.set-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 2px;
}
.set-row + .set-row {
  border-top: 1px solid #333;
}
/* 分组标题自带分隔线，其后第一行不再重复画线 */
.set-group + .set-row {
  border-top: none;
}
.set-label {
  flex: 0 0 auto;
  width: 60px;
  padding-top: 3px;
  color: #888;
  font-size: 12px;
}
.set-chips {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  height: 22px;
  padding: 0 8px;
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #bbb;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.chip:hover:not(:disabled) {
  background: #333;
  border-color: #4a4a4a;
}
.chip.on {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.chip:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.chip.danger.armed {
  background: #6a2020;
  border-color: #c05050;
  color: #ffd0d0;
}
.chip.danger {
  border-color: #5a3030;
  color: #e09090;
}
.chip.danger:hover:not(:disabled) {
  background: #4a1e1e;
  border-color: #8a3030;
  color: #ffb0b0;
}

/* ── 设置面板分组标题 ── */
.set-group {
  padding: 4px 2px 2px;
  color: #6a8fb5;
  font-size: 11px;
  letter-spacing: 0.5px;
}
.set-group:not(:first-child) {
  margin-top: 4px;
  border-top: 1px solid #333;
  padding-top: 6px;
}
.steps-input {
  width: 96px;
  height: 22px;
}
.hint-inline {
  align-self: center;
  color: #666;
  font-size: 11px;
}

.tl-track {
  display: flex;
  align-items: center;
  gap: 4px;
  /* 作为独立一行：不参与纵向伸缩（父容器是列方向，flex:1 会撑高整条时间轴） */
  flex: 0 0 auto;
  /* 允许收缩到内容宽度以下：否则步骤多时会把整行撑出可视区，而不是自身滚动 */
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 2px 0;
  /* 作为 offsetParent，供步带自动滚动计算 offsetLeft */
  position: relative;
}

.tl-step {
  flex: 0 0 auto;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  background: #262626;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.tl-step:hover {
  background: #333;
  border-color: #4a90d9;
}
.tl-step.active {
  background: #1d4a7a;
  border-color: #4a9eff;
  color: #eaf4ff;
}
.tl-step.anchor {
  border-color: #7a6a2a;
}
.tl-step.undo {
  border-color: #7a3a7a;
}
.tl-step.start {
  min-width: 44px;
}

.tl-count {
  flex: 0 0 auto;
  margin-left: 6px;
  padding-left: 8px;
  border-left: 1px solid #3a3a3a;
  color: #777;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.tl-empty {
  color: #666;
  font-size: 12px;
}

@media (max-width: 1024px) and (orientation: landscape) {
  .timeline {
    height: 64px;
    padding: 4px 8px;
  }
  .tl-info {
    display: none;
  }
}
</style>
