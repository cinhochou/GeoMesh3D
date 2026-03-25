<!-- src/components/SideBar.vue -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Scene } from '../core/scene/Scene'
import { Editor } from '../core/editor/Editor'
import { Vec3 } from '../core/geometry/Vec3'
import type { Point3 } from '../core/geometry/Point3'
import type { Line3 } from '../core/geometry/Line3'

const props = defineProps<{
  scene: Scene
  editor: Editor
  modeName: string
}>()

const selectedPoints = computed(() => {
  return [...props.scene.selection.points].map((id) => props.scene.points.get(id))
})
const selectedLines = computed(() => {
  return [...props.scene.selection.lines].map((id) => props.scene.lines.get(id))
})
const pointsInScene = computed(() => {
  return [...props.scene.points.values()]
})
const linesInScene = computed(() => {
  return [...props.scene.lines.values()]
})

const editing = ref<{ type: 'point' | 'line'; id: string } | null>(null)
const editPoint = reactive({ name: '', nameVisible: true, x: '', y: '', z: '' })
const editLine = reactive({
  name: '',
  nameVisible: true,
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const focusedCoord = reactive<Record<string, boolean>>({})
const coordInputs = new Map<string, HTMLInputElement>()

const selectedPointIds = computed(() => selectedPoints.value.map((p) => p?.id).filter(Boolean))
const selectedLineIds = computed(() => selectedLines.value.map((l) => l?.id).filter(Boolean))

watch([selectedPointIds, selectedLineIds], () => {
  if (!editing.value) return
  const { type, id } = editing.value
  if (type === 'point' && !selectedPointIds.value.includes(id)) editing.value = null
  if (type === 'line' && !selectedLineIds.value.includes(id)) editing.value = null
})

const toFixed2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00')
const setCoordFocus = (key: string, isFocused: boolean) => {
  focusedCoord[key] = isFocused
}
const normalizeCoord = (value: string) => {
  const n = Number(value)
  return Number.isFinite(n) ? toFixed2(n) : value
}
const setCoordInputRef = (key: string, el: unknown) => {
  if (el instanceof HTMLInputElement) {
    coordInputs.set(key, el)
    return
  }
  coordInputs.delete(key)
}
const stepCoordInput = (key: string, direction: 'up' | 'down') => {
  const input = coordInputs.get(key)
  if (!input || input.disabled) return null
  if (direction === 'up') input.stepUp()
  else input.stepDown()
  return input.value
}
const handlePointCoordFocus = (axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`point.${axis}`, true)
}
const handlePointCoordBlur = (axis: 'x' | 'y' | 'z') => {
  editPoint[axis] = normalizeCoord(editPoint[axis])
  setCoordFocus(`point.${axis}`, false)
  applyEditPoint()
}
const handleLineCoordFocus = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`line.${which}.${axis}`, true)
}
const handleLineCoordBlur = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editLine[which][axis] = normalizeCoord(editLine[which][axis])
  setCoordFocus(`line.${which}.${axis}`, false)
  applyEditLine()
}
const nudgePointCoord = (axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`point.${axis}`, direction)
  if (nextValue === null) return
  editPoint[axis] = nextValue
  applyEditPoint()
}
const nudgeLineCoord = (
  which: 'p1' | 'p2',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`line.${which}.${axis}`, direction)
  if (nextValue === null) return
  editLine[which][axis] = nextValue
  applyEditLine()
}

const startEditPoint = (p: Point3 | undefined) => {
  if (!p) return
  if (p.locked) return
  editing.value = { type: 'point', id: p.id }
  editPoint.name = p.name ?? ''
  editPoint.nameVisible = p.nameVisible !== false
  editPoint.x = toFixed2(p.position.x)
  editPoint.y = toFixed2(p.position.y)
  editPoint.z = toFixed2(p.position.z)
}

const startEditLine = (l: Line3 | undefined) => {
  if (!l) return
  editing.value = { type: 'line', id: l.id }
  editLine.name = l.name ?? ''
  editLine.nameVisible = l.nameVisible !== false
  editLine.p1.x = toFixed2(l.p1.position.x)
  editLine.p1.y = toFixed2(l.p1.position.y)
  editLine.p1.z = toFixed2(l.p1.position.z)
  editLine.p2.x = toFixed2(l.p2.position.x)
  editLine.p2.y = toFixed2(l.p2.position.y)
  editLine.p2.z = toFixed2(l.p2.position.z)
}

const applyPointPosition = (id: string, xStr: string, yStr: string, zStr: string) => {
  const x = Number(xStr)
  const y = Number(yStr)
  const z = Number(zStr)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
  const point = props.scene.points.get(id)
  if (!point) return
  if (point.locked) return
  props.editor.setPointPosition(id, new Vec3(x, y, z))
}

const applyEditPoint = () => {
  if (!editing.value || editing.value.type !== 'point') return
  const point = props.scene.points.get(editing.value.id)
  if (point && !point.locked) {
    props.editor.updatePoint(editing.value.id, {
      name: editPoint.name,
      nameVisible: editPoint.nameVisible,
    })
  }
  applyPointPosition(editing.value.id, editPoint.x, editPoint.y, editPoint.z)
}

const applyEditLine = () => {
  if (!editing.value || editing.value.type !== 'line') return
  const line = props.scene.lines.get(editing.value.id)
  if (!line) return
  props.editor.updateLine(editing.value.id, {
    name: editLine.name,
    nameVisible: editLine.nameVisible,
  })
  applyPointPosition(line.p1.id, editLine.p1.x, editLine.p1.y, editLine.p1.z)
  applyPointPosition(line.p2.id, editLine.p2.x, editLine.p2.y, editLine.p2.z)
}

const handleGlobalClick = (e: MouseEvent) => {
  if (!editing.value) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // 点击编辑框内部不退出，点击其他空白或区域则退出
  if (target.closest('.edit-grid')) return
  // 点击 3D 视口区域（viewport）→ 不退出
  if (target.closest('.viewport')) return
  editing.value = null
}

// 监听当前编辑的点位置变化
watch(
  () => {
    if (!editing.value || editing.value.type !== 'point') return null
    const p = props.scene.points.get(editing.value.id)
    return p
      ? {
          name: p.name ?? '',
          nameVisible: p.nameVisible !== false,
          x: p.position.x,
          y: p.position.y,
          z: p.position.z,
        }
      : null
  },
  (newPos) => {
    if (!newPos) return
    editPoint.name = newPos.name
    editPoint.nameVisible = newPos.nameVisible
    if (!focusedCoord['point.x']) editPoint.x = toFixed2(newPos.x)
    if (!focusedCoord['point.y']) editPoint.y = toFixed2(newPos.y)
    if (!focusedCoord['point.z']) editPoint.z = toFixed2(newPos.z)
  },
  { immediate: true },
)

// 监听当前编辑的线端点位置变化
watch(
  () => {
    if (!editing.value || editing.value.type !== 'line') return null
    const l = props.scene.lines.get(editing.value.id)
    if (!l) return null
    return {
      name: l.name ?? '',
      nameVisible: l.nameVisible !== false,
      p1: { x: l.p1.position.x, y: l.p1.position.y, z: l.p1.position.z },
      p2: { x: l.p2.position.x, y: l.p2.position.y, z: l.p2.position.z },
    }
  },
  (newLine) => {
    if (!newLine) return
    editLine.name = newLine.name
    editLine.nameVisible = newLine.nameVisible
    if (!focusedCoord['line.p1.x']) editLine.p1.x = toFixed2(newLine.p1.x)
    if (!focusedCoord['line.p1.y']) editLine.p1.y = toFixed2(newLine.p1.y)
    if (!focusedCoord['line.p1.z']) editLine.p1.z = toFixed2(newLine.p1.z)
    if (!focusedCoord['line.p2.x']) editLine.p2.x = toFixed2(newLine.p2.x)
    if (!focusedCoord['line.p2.y']) editLine.p2.y = toFixed2(newLine.p2.y)
    if (!focusedCoord['line.p2.z']) editLine.p2.z = toFixed2(newLine.p2.z)
  },
  { immediate: true },
)

onMounted(() => {
  document.addEventListener('mousedown', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleGlobalClick)
})
</script>

<template>
  <div class="sidebar">
    <p>当前操作模式：{{ modeName }}</p>
    <div class="divider"></div>
    <h3>选中</h3>
    <div class="hint" v-if="selectedPoints.length > 0 || selectedLines.length > 0">
      双击标签以编辑几何元素~
    </div>
    <div class="box selected-box">
      <div v-if="selectedPoints.length === 0 && selectedLines.length === 0">无</div>

      <div
        v-for="p in selectedPoints"
        :key="p!.id"
        class="selectedPoint-info"
        @dblclick="startEditPoint(p)"
      >
        <div v-if="editing?.type === 'point' && editing?.id === p!.id" class="edit-grid">
          <div class="name-row">
            <label>名称</label>
            <input type="text" v-model="editPoint.name" @input="applyEditPoint" />
            <label class="toggle-label">
              <input type="checkbox" v-model="editPoint.nameVisible" @change="applyEditPoint" />
              {{ editPoint.nameVisible ? '隐藏' : '显示' }}
            </label>
          </div>
          <div class="coord-row">
            <div class="axis-field">
              <label>x</label>
              <div class="coord-input">
                <button type="button" class="step-btn" @click="nudgePointCoord('x', 'down')">-</button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('point.x', el)"
                  v-model="editPoint.x"
                  @input="applyEditPoint"
                  @focus="handlePointCoordFocus('x')"
                  @blur="handlePointCoordBlur('x')"
                  step="0.5"
                />
                <button type="button" class="step-btn" @click="nudgePointCoord('x', 'up')">+</button>
              </div>
            </div>
            <div class="axis-field">
              <label>y</label>
              <div class="coord-input">
                <button type="button" class="step-btn" @click="nudgePointCoord('y', 'down')">-</button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('point.y', el)"
                  v-model="editPoint.y"
                  @input="applyEditPoint"
                  @focus="handlePointCoordFocus('y')"
                  @blur="handlePointCoordBlur('y')"
                  step="0.5"
                />
                <button type="button" class="step-btn" @click="nudgePointCoord('y', 'up')">+</button>
              </div>
            </div>
            <div class="axis-field">
              <label>z</label>
              <div class="coord-input">
                <button type="button" class="step-btn" @click="nudgePointCoord('z', 'down')">-</button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('point.z', el)"
                  v-model="editPoint.z"
                  @input="applyEditPoint"
                  @focus="handlePointCoordFocus('z')"
                  @blur="handlePointCoordBlur('z')"
                  step="0.5"
                />
                <button type="button" class="step-btn" @click="nudgePointCoord('z', 'up')">+</button>
              </div>
            </div>
          </div>
        </div>
        <div v-else>
          <div>
            点{{ p!.name ?? '' }}，ID: {{ p!.id }}
            <span v-if="p!.locked" class="lock-badge">🔒</span>
          </div>
          <div>
            x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
            {{ p!.position.z.toFixed(2) }}
          </div>
        </div>
      </div>

      <div
        v-for="l in selectedLines"
        :key="l!.id"
        class="selectedLine-info"
        @dblclick="startEditLine(l)"
      >
        <div v-if="editing?.type === 'line' && editing?.id === l!.id" class="edit-grid">
          <div class="name-row">
            <label>名称</label>
            <input type="text" v-model="editLine.name" @input="applyEditLine" />
            <label class="toggle-label">
              <input type="checkbox" v-model="editLine.nameVisible" @change="applyEditLine" />
              {{ editLine.nameVisible ? '隐藏' : '显示' }}
            </label>
          </div>
          <div class="line-point-row">
            <span class="line-point-label">点{{ l!.p1.name ?? '' }}(x,y,z)</span>
            <div class="line-coord-stack">
              <div class="axis-field line-axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p1', 'x', 'down')"
                    :disabled="l!.p1.locked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('line.p1.x', el)"
                    v-model="editLine.p1.x"
                    @input="applyEditLine"
                    @focus="handleLineCoordFocus('p1', 'x')"
                    @blur="handleLineCoordBlur('p1', 'x')"
                    step="0.5"
                    :disabled="l!.p1.locked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p1', 'x', 'up')"
                    :disabled="l!.p1.locked"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="axis-field line-axis-field">
                <label>y</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p1', 'y', 'down')"
                    :disabled="l!.p1.locked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('line.p1.y', el)"
                    v-model="editLine.p1.y"
                    @input="applyEditLine"
                    @focus="handleLineCoordFocus('p1', 'y')"
                    @blur="handleLineCoordBlur('p1', 'y')"
                    step="0.5"
                    :disabled="l!.p1.locked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p1', 'y', 'up')"
                    :disabled="l!.p1.locked"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="axis-field line-axis-field">
                <label>z</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p1', 'z', 'down')"
                    :disabled="l!.p1.locked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('line.p1.z', el)"
                    v-model="editLine.p1.z"
                    @input="applyEditLine"
                    @focus="handleLineCoordFocus('p1', 'z')"
                    @blur="handleLineCoordBlur('p1', 'z')"
                    step="0.5"
                    :disabled="l!.p1.locked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p1', 'z', 'up')"
                    :disabled="l!.p1.locked"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <span v-if="l!.p1.locked" class="lock-badge">🔒</span>
          </div>
          <div class="line-point-row">
            <span class="line-point-label">点{{ l!.p2.name ?? '' }}(x,y,z)</span>
            <div class="line-coord-stack">
              <div class="axis-field line-axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p2', 'x', 'down')"
                    :disabled="l!.p2.locked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('line.p2.x', el)"
                    v-model="editLine.p2.x"
                    @input="applyEditLine"
                    @focus="handleLineCoordFocus('p2', 'x')"
                    @blur="handleLineCoordBlur('p2', 'x')"
                    step="0.5"
                    :disabled="l!.p2.locked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p2', 'x', 'up')"
                    :disabled="l!.p2.locked"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="axis-field line-axis-field">
                <label>y</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p2', 'y', 'down')"
                    :disabled="l!.p2.locked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('line.p2.y', el)"
                    v-model="editLine.p2.y"
                    @input="applyEditLine"
                    @focus="handleLineCoordFocus('p2', 'y')"
                    @blur="handleLineCoordBlur('p2', 'y')"
                    step="0.5"
                    :disabled="l!.p2.locked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p2', 'y', 'up')"
                    :disabled="l!.p2.locked"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="axis-field line-axis-field">
                <label>z</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p2', 'z', 'down')"
                    :disabled="l!.p2.locked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('line.p2.z', el)"
                    v-model="editLine.p2.z"
                    @input="applyEditLine"
                    @focus="handleLineCoordFocus('p2', 'z')"
                    @blur="handleLineCoordBlur('p2', 'z')"
                    step="0.5"
                    :disabled="l!.p2.locked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeLineCoord('p2', 'z', 'up')"
                    :disabled="l!.p2.locked"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <span v-if="l!.p2.locked" class="lock-badge">🔒</span>
          </div>
        </div>
        <div v-else>
          <div>线{{ l!.name ?? '' }}，ID: {{ l!.id }}</div>
          <div>
            点{{ l!.p1.name ?? '' }}（{{ l!.p1.position.x.toFixed(2) }},
            {{ l!.p1.position.y.toFixed(2) }}, {{ l!.p1.position.z.toFixed(2) }}）
          </div>
          <div>
            点{{ l!.p2.name ?? '' }}（{{ l!.p2.position.x.toFixed(2) }},
            {{ l!.p2.position.y.toFixed(2) }}, {{ l!.p2.position.z.toFixed(2) }}）
          </div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <h3>内容</h3>
    <div class="box content-box">
      <div v-if="pointsInScene.length === 0 && linesInScene.length === 0">无</div>
      <div v-for="p in pointsInScene" :key="p!.id" class="point-info">
        <div>
          点{{ p!.name ?? '' }}，ID: {{ p!.id }}
          <span v-if="p!.locked" class="lock-badge">🔒</span>
        </div>
        <div>
          x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
          {{ p!.position.z.toFixed(2) }}
        </div>
      </div>
      <div v-for="l in linesInScene" :key="l!.id" class="line-info">
        <div>线{{ l!.name ?? '' }}，ID: {{ l!.id }}</div>
        <div>
          <div>
            点{{ l!.p1.name ?? '' }}（{{ l!.p1.position.x.toFixed(2) }},
            {{ l!.p1.position.y.toFixed(2) }}, {{ l!.p1.position.z.toFixed(2) }}）
          </div>
          <div>
            点{{ l!.p2.name ?? '' }}（{{ l!.p2.position.x.toFixed(2) }},
            {{ l!.p2.position.y.toFixed(2) }}, {{ l!.p2.position.z.toFixed(2) }}）
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: clamp(200px, 21vw, 280px);
  min-width: 200px;
  max-width: 280px;
  background: #1a1a1a;
  color: #ddd;
  padding: 12px;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  flex-shrink: 0;
}
.sidebar > p {
  flex-shrink: 0;
}
h3 {
  margin-top: 0;
  margin-bottom: 6px;
  flex-shrink: 0;
}
hr {
  border: none;
  border-top: 1px solid #333;
  margin: 12px 0;
}
.selectedPoint-info,
.selectedLine-info,
.point-info,
.line-info {
  background-color: rgba(44, 90, 52, 0.4); /* 使用半透明绿色 */
  border-left: 3px solid #43f260; /* 增加一个亮色左边框提升质感 */
  margin-bottom: 6px;
  padding: 8px;
  font-size: 13px;
}
.divider {
  width: 100%;
  height: 1px;
  background: #444;
  margin-top: 5px;
  margin-bottom: 5px;
  flex-shrink: 0;
}
.box {
  flex: 0 1 auto;
  overflow-y: auto; /* 垂直滚动 */
  overflow-x: hidden;
  margin-bottom: 2px; /* 底部边距 */
  min-height: 96px;
}
.selected-box {
  flex-basis: 38%;
}
.content-box {
  flex: 1 1 auto;
  min-height: 140px;
}
.box::-webkit-scrollbar {
  width: 5px;
}
.box::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 10px;
}
.box::-webkit-scrollbar-track {
  background: transparent;
}
.selected-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.hint {
  color: #ffffff;
  font-size: 12px;
  margin-top: -4px;
  margin-bottom: 6px;
}
.edit-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 4px;
}
.edit-grid input {
  background: #0f0f0f;
  border: 1px solid #355b3a;
  color: #e6ffe9;
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 12px;
}
.edit-grid input[type='text'] {
  width: 56px;
}
.edit-grid input[type='number'] {
  width: 48px;
}
.coord-input {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
}
.axis-field {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 4px;
  align-items: center;
  min-width: 0;
}
.compact-axis {
  flex: 1 1 0;
}
.axis-field > label {
  font-size: 11px;
  color: #8fdc9b;
  text-align: center;
}
.coord-input input[type='number'] {
  width: 54px;
  text-align: center;
  border-radius: 0;
}
.step-btn {
  min-width: 26px;
  border: 1px solid #355b3a;
  background: #214126;
  color: #e6ffe9;
  padding: 0 6px;
  font-size: 14px;
  line-height: 1;
  touch-action: manipulation;
}
.step-btn:first-child {
  border-radius: 4px 0 0 4px;
  border-right: none;
}
.step-btn:last-child {
  border-radius: 0 4px 4px 0;
  border-left: none;
}
.step-btn:hover:not(:disabled) {
  background: #2c5a34;
}
.step-btn:active:not(:disabled) {
  background: #43f260;
  color: #000;
}
.step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.coord-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  grid-column: 1 / -1;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  grid-column: 1 / -1;
}
.toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #8fdc9b;
}
.toggle-label input {
  margin: 0;
}
.line-point-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 4px;
  grid-column: 1 / -1;
}
.line-point-label {
  white-space: nowrap;
}
.line-coord-stack {
  display: grid;
  gap: 4px;
  width: 100%;
}
.line-axis-field {
  grid-template-columns: 14px minmax(0, 1fr);
}
.line-axis-field .coord-input {
  width: 100%;
}
.lock-badge {
  font-size: 11px;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 6px;
}

@media (max-width: 1024px) and (orientation: landscape) {
  .sidebar {
    width: clamp(156px, 30vw, 216px);
    min-width: 156px;
    padding: 8px;
    font-size: 12px;
  }

  .selectedPoint-info,
  .selectedLine-info,
  .point-info,
  .line-info {
    padding: 6px;
    font-size: 12px;
  }

  .selected-box {
    flex-basis: 44%;
    min-height: 112px;
  }

  .content-box {
    min-height: 0;
  }

  .hint {
    font-size: 11px;
  }

  .edit-grid input[type='text'] {
    width: 48px;
  }

  .edit-grid input[type='number'] {
    width: 44px;
  }

  .coord-input input[type='number'] {
    width: 48px;
  }

  .step-btn {
    min-width: 30px;
    font-size: 16px;
  }

  .name-row,
  .line-point-row {
    flex-wrap: wrap;
  }

  .line-point-label {
    width: 100%;
  }
}

@media (max-width: 820px) and (orientation: landscape) {
  .sidebar {
    width: clamp(132px, 28vw, 172px);
    min-width: 132px;
    max-width: 172px;
    display: block;
    padding: 6px;
    font-size: 11px;
    overflow-y: auto;
  }

  .sidebar > p,
  h3,
  .divider,
  .hint {
    margin-bottom: 4px;
  }

  .selectedPoint-info,
  .selectedLine-info,
  .point-info,
  .line-info {
    margin-bottom: 4px;
    padding: 5px;
    font-size: 11px;
  }

  .box,
  .selected-box,
  .content-box {
    display: block;
    flex: none;
    min-height: 0;
    max-height: none;
    overflow: visible;
  }

  .edit-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .edit-grid input[type='text'],
  .edit-grid input[type='number'] {
    width: 100%;
    min-width: 0;
  }

  .coord-input {
    width: 100%;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) 36px;
  }

  .coord-input input[type='number'] {
    flex: 1;
    width: auto;
  }

  .step-btn {
    min-width: 36px;
    min-height: 36px;
    font-size: 18px;
  }

  .name-row,
  .line-point-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    align-items: center;
  }

  .line-point-label,
  .toggle-label {
    grid-column: 1 / -1;
  }

  .compact-axis {
    grid-column: 1 / -1;
  }
}

@media (max-width: 640px) {
  .coord-input {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .coord-input input[type='number'] {
    order: 2;
    width: 100%;
    border-radius: 0;
  }

  .coord-input .step-btn:first-child {
    order: 1;
    border-radius: 4px 4px 0 0;
    border-right: 1px solid #355b3a;
    border-bottom: none;
  }

  .coord-input .step-btn:last-child {
    order: 3;
    border-radius: 0 0 4px 4px;
    border-left: 1px solid #355b3a;
    border-top: none;
  }

  .step-btn {
    min-width: 100%;
    min-height: 28px;
    padding: 4px 0;
    font-size: 16px;
  }

  .axis-field > label {
    font-size: 10px;
  }

  .selectedPoint-info,
  .selectedLine-info,
  .point-info,
  .line-info {
    padding: 4px;
    font-size: 10px;
  }
}
</style>
