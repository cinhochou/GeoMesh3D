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
const sidebarRef = ref<HTMLElement | null>(null)
const editPoint = reactive({ name: '', x: '', y: '', z: '' })
const editLine = reactive({
  name: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})

const selectedPointIds = computed(() => selectedPoints.value.map((p) => p?.id).filter(Boolean))
const selectedLineIds = computed(() => selectedLines.value.map((l) => l?.id).filter(Boolean))

watch([selectedPointIds, selectedLineIds], () => {
  if (!editing.value) return
  const { type, id } = editing.value
  if (type === 'point' && !selectedPointIds.value.includes(id)) editing.value = null
  if (type === 'line' && !selectedLineIds.value.includes(id)) editing.value = null
})

const toFixed2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00')

const startEditPoint = (p: Point3 | undefined) => {
  if (!p) return
  if (p.locked) return
  editing.value = { type: 'point', id: p.id }
  editPoint.name = p.name ?? ''
  editPoint.x = toFixed2(p.position.x)
  editPoint.y = toFixed2(p.position.y)
  editPoint.z = toFixed2(p.position.z)
}

const startEditLine = (l: Line3 | undefined) => {
  if (!l) return
  if (l.p1.locked || l.p2.locked) return
  editing.value = { type: 'line', id: l.id }
  editLine.name = l.name ?? ''
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
  const before = point.position
  const delta = new Vec3(x - before.x, y - before.y, z - before.z)
  if (Math.abs(delta.x) + Math.abs(delta.y) + Math.abs(delta.z) < 1e-6) return
  props.editor.movePoint(id, delta)
}

const applyEditPoint = () => {
  if (!editing.value || editing.value.type !== 'point') return
  const point = props.scene.points.get(editing.value.id)
  if (point && !point.locked) {
    point.name = editPoint.name
  }
  applyPointPosition(editing.value.id, editPoint.x, editPoint.y, editPoint.z)
}

const applyEditLine = () => {
  if (!editing.value || editing.value.type !== 'line') return
  const line = props.scene.lines.get(editing.value.id)
  if (!line) return
  line.name = editLine.name
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
    return p ? { name: p.name ?? '', x: p.position.x, y: p.position.y, z: p.position.z } : null
  },
  (newPos) => {
    if (!newPos) return
    editPoint.name = newPos.name
    editPoint.x = toFixed2(newPos.x)
    editPoint.y = toFixed2(newPos.y)
    editPoint.z = toFixed2(newPos.z)
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
      p1: { x: l.p1.position.x, y: l.p1.position.y, z: l.p1.position.z },
      p2: { x: l.p2.position.x, y: l.p2.position.y, z: l.p2.position.z },
    }
  },
  (newLine) => {
    if (!newLine) return
    editLine.name = newLine.name
    editLine.p1.x = toFixed2(newLine.p1.x)
    editLine.p1.y = toFixed2(newLine.p1.y)
    editLine.p1.z = toFixed2(newLine.p1.z)
    editLine.p2.x = toFixed2(newLine.p2.x)
    editLine.p2.y = toFixed2(newLine.p2.y)
    editLine.p2.z = toFixed2(newLine.p2.z)
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
  <div class="sidebar" ref="sidebarRef">
    <p>当前操作模式：{{ modeName }}</p>
    <div class="divider"></div>
    <h3>选中</h3>
    <div class="box">
      <div v-if="selectedPoints.length === 0 && selectedLines.length === 0">无</div>

      <div
        v-for="p in selectedPoints"
        :key="p!.id"
        class="selectedPoint-info"
        @dblclick="startEditPoint(p)"
      >
        <div class="selected-title">
          <span>ID: {{ p!.id }}</span>
        </div>
        <div v-if="editing?.type === 'point' && editing?.id === p!.id" class="edit-grid">
          <label>name</label>
          <input type="text" v-model="editPoint.name" @input="applyEditPoint" />
          <label>x</label>
          <input type="number" v-model="editPoint.x" @input="applyEditPoint" step="0.5" />
          <label>y</label>
          <input type="number" v-model="editPoint.y" @input="applyEditPoint" step="0.5" />
          <label>z</label>
          <input type="number" v-model="editPoint.z" @input="applyEditPoint" step="0.5" />
        </div>
        <div v-else>
          name: {{ p!.name ?? '' }}<br />
          x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
          {{ p!.position.z.toFixed(2) }}
        </div>
      </div>

      <div
        v-for="l in selectedLines"
        :key="l!.id"
        class="selectedLine-info"
        @dblclick="startEditLine(l)"
      >
        <div class="selected-title">
          <span>ID: {{ l!.id }}</span>
        </div>
        <div v-if="editing?.type === 'line' && editing?.id === l!.id" class="edit-grid">
          <label>name</label>
          <input type="text" v-model="editLine.name" @input="applyEditLine" />
          <label>{{ l!.p1.id }} x</label>
          <input type="number" v-model="editLine.p1.x" @input="applyEditLine" step="0.5" />
          <label>{{ l!.p1.id }} y</label>
          <input type="number" v-model="editLine.p1.y" @input="applyEditLine" step="0.5" />
          <label>{{ l!.p1.id }} z</label>
          <input type="number" v-model="editLine.p1.z" @input="applyEditLine" step="0.5" />
          <label>{{ l!.p2.id }} x</label>
          <input type="number" v-model="editLine.p2.x" @input="applyEditLine" step="0.5" />
          <label>{{ l!.p2.id }} y</label>
          <input type="number" v-model="editLine.p2.y" @input="applyEditLine" step="0.5" />
          <label>{{ l!.p2.id }} z</label>
          <input type="number" v-model="editLine.p2.z" @input="applyEditLine" step="0.5" />
        </div>
        <div v-else>
          <div>name: {{ l!.name ?? '' }}</div>
          <div>
            {{ l!.p1.id }}(x,y,z): {{ l!.p1.position.x.toFixed(2) }},
            {{ l!.p1.position.y.toFixed(2) }},
            {{ l!.p1.position.z.toFixed(2) }}
          </div>
          <div>
            {{ l!.p2.id }}(x,y,z): {{ l!.p2.position.x.toFixed(2) }},
            {{ l!.p2.position.y.toFixed(2) }},
            {{ l!.p2.position.z.toFixed(2) }}
          </div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <h3>内容</h3>
    <div class="box">
      <div v-if="pointsInScene.length === 0 && linesInScene.length === 0">无</div>
      <div v-for="p in pointsInScene" :key="p!.id" class="point-info">
        <div>ID: {{ p!.id }}</div>
        <div>name: {{ p!.name ?? '' }}</div>
        <div>
          x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
          {{ p!.position.z.toFixed(2) }}
        </div>
      </div>
      <div v-for="l in linesInScene" :key="l!.id" class="line-info">
        <div>ID: {{ l!.id }}</div>
        <div>name: {{ l!.name ?? '' }}</div>
        <div>
          <div>
            {{ l!.p1.id }}(x,y,z): {{ l!.p1.position.x.toFixed(2) }},
            {{ l!.p1.position.y.toFixed(2) }},
            {{ l!.p1.position.z.toFixed(2) }}
          </div>
          <div>
            {{ l!.p2.id }}(x,y,z): {{ l!.p2.position.x.toFixed(2) }},
            {{ l!.p2.position.y.toFixed(2) }},
            {{ l!.p2.position.z.toFixed(2) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  min-width: 220px;
  background: #1a1a1a;
  color: #ddd;
  padding: 12px;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止内部滚动影响 */
}
.sidebar > p {
  flex-shrink: 0;
}
h3 {
  margin-top: 0;
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
  width: 220px;
  height: 1px;
  background: #444;
  margin-top: 5px;
  margin-bottom: 5px;
  flex-shrink: 0;
}
.box {
  flex: 1; /* 占据剩余空间 */
  overflow-y: auto; /* 垂直滚动 */
  overflow-x: hidden;
  margin-bottom: 2px; /* 底部边距 */
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
  color: #8fdc9b;
  font-size: 12px;
}
.edit-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
}
.edit-grid input {
  background: #0f0f0f;
  border: 1px solid #355b3a;
  color: #e6ffe9;
  padding: 2px 4px;
  border-radius: 2px;
  font-size: 12px;
}
</style>
