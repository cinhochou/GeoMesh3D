<!-- src/components/SideBar.vue -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Scene } from '../core/scene/Scene'
import { Editor } from '../core/editor/Editor'
import { Vec3 } from '../core/geometry/Vec3'
import type { Point3 } from '../core/geometry/Point3'
import type { Line3 } from '../core/geometry/Line3'
import type { Ray3 } from '../core/geometry/Ray3'

const props = defineProps<{
  scene: Scene
  editor: Editor
  modeName: string
  modeHint: string
}>()

const commandRevision = computed(() => props.editor.historyIndex)

const selectedPoints = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.points]
    .map((id) => props.scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined)
})
const selectedLines = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.lines]
    .map((id) => props.scene.lines.get(id))
    .filter((line): line is Line3 => line !== undefined)
})
const selectedRays = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.rays]
    .map((id) => props.scene.rays.get(id))
    .filter((ray): ray is Ray3 => ray !== undefined)
})
const pointsInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.points.values()]
})
const linesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.lines.values()]
})
const raysInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.rays.values()]
})

const editing = ref<{ type: 'point' | 'line' | 'ray'; id: string } | null>(null)
const isCompactLineEditor = ref(false)
const expandedLineEditorPoint = ref<'p1' | 'p2' | null>(null)
const expandedRayEditorPoint = ref<'p1' | 'p2' | null>(null)
const isPointCoordinateLocked = (point: Point3 | undefined) =>
  Boolean(point && props.editor.isPointCoordinateLocked(point))
const isLineEndpointCoordinateLocked = (line: Line3 | undefined, point: Point3 | undefined) =>
  Boolean(line && point && (props.editor.isLineLocked(line) || isPointCoordinateLocked(point)))
const isRayEndpointCoordinateLocked = (ray: Ray3 | undefined, point: Point3 | undefined) =>
  Boolean(ray && point && (props.editor.isRayLocked(ray) || isPointCoordinateLocked(point)))
const isLineConstraintLocked = (line: Line3 | undefined) =>
  Boolean(
    line &&
      (props.editor.isLineLocked(line) ||
        (isPointCoordinateLocked(line.p1) && isPointCoordinateLocked(line.p2))),
  )

const editPoint = reactive({
  name: '',
  nameVisible: true,
  userLocked: false,
  x: '',
  y: '',
  z: '',
})
const editLine = reactive({
  name: '',
  nameVisible: true,
  visible: true,
  userLocked: false,
  lengthLocked: false,
  lockedLength: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const editRay = reactive({
  name: '',
  nameVisible: true,
  visible: true,
  userLocked: false,
  displayLength: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const focusedCoord = reactive<Record<string, boolean>>({})
const coordInputs = new Map<string, HTMLInputElement>()
let lineCoordCollapseTimer: number | null = null
let rayCoordCollapseTimer: number | null = null

const selectedPointIds = computed(() => selectedPoints.value.map((p) => p?.id).filter(Boolean))
const selectedLineIds = computed(() => selectedLines.value.map((l) => l?.id).filter(Boolean))
const selectedRayIds = computed(() => selectedRays.value.map((r) => r?.id).filter(Boolean))
const totalContentCount = computed(
  () => pointsInScene.value.length + linesInScene.value.length + raysInScene.value.length,
)
const canCollapseContentGroups = computed(() => totalContentCount.value > 10)
const collapsedContentGroups = reactive({
  point: false,
  line: false,
  ray: false,
})
const contentGroupLabels: Record<'point' | 'line' | 'ray', string> = {
  point: '点',
  line: '线段',
  ray: '射线',
}
const hasAutoCollapsedContentGroups = ref(false)

const setContentGroupsCollapsed = (collapsed: boolean) => {
  collapsedContentGroups.point = collapsed
  collapsedContentGroups.line = collapsed
  collapsedContentGroups.ray = collapsed
}

const toggleContentGroup = (type: 'point' | 'line' | 'ray') => {
  if (!canCollapseContentGroups.value) return
  collapsedContentGroups[type] = !collapsedContentGroups[type]
}

const emitToast = (msg: string, scope: 'global' | 'viewport' = 'global') => {
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { msg, scope },
    }),
  )
}

const selectPointFromContent = (id: string) => {
  editing.value = null
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  props.scene.selection.selectPoint(id)
}

const selectLineFromContent = (id: string) => {
  editing.value = null
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  props.scene.selection.selectLine(id)
}

const selectRayFromContent = (id: string) => {
  editing.value = null
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  props.scene.selection.selectRay(id)
}

const clearContentSelection = () => {
  editing.value = null
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  props.scene.selection.clear()
}

const updateCompactLineEditorMode = () => {
  const touchLike =
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  isCompactLineEditor.value = touchLike || mobileUA
}

watch([selectedPointIds, selectedLineIds, selectedRayIds], () => {
  if (!editing.value) return
  const { type, id } = editing.value
  if (type === 'point' && !selectedPointIds.value.includes(id)) editing.value = null
  if (type === 'line' && !selectedLineIds.value.includes(id)) editing.value = null
  if (type === 'ray' && !selectedRayIds.value.includes(id)) editing.value = null
})

watch(
  totalContentCount,
  (count) => {
    if (count > 10) {
      if (!hasAutoCollapsedContentGroups.value) {
        setContentGroupsCollapsed(true)
        hasAutoCollapsedContentGroups.value = true
        emitToast('内容区元素数量大于10，已自动折叠')
      }
      return
    }
    setContentGroupsCollapsed(false)
  },
  { immediate: true },
)

const toFixed2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '0.00')
const setCoordFocus = (key: string, isFocused: boolean) => {
  focusedCoord[key] = isFocused
}
const normalizeCoord = (value: string) => {
  const n = Number(value)
  return Number.isFinite(n) ? toFixed2(n) : value
}
const normalizeDisplayLength = (value: string) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(1, n).toFixed(2) : value
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
  if (lineCoordCollapseTimer !== null) {
    window.clearTimeout(lineCoordCollapseTimer)
    lineCoordCollapseTimer = null
  }
  expandedLineEditorPoint.value = which
  setCoordFocus(`line.${which}.${axis}`, true)
}
const handleLineCoordBlur = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editLine[which][axis] = normalizeCoord(editLine[which][axis])
  setCoordFocus(`line.${which}.${axis}`, false)
  applyEditLine()
  if (lineCoordCollapseTimer !== null) {
    window.clearTimeout(lineCoordCollapseTimer)
  }
  lineCoordCollapseTimer = window.setTimeout(() => {
    const stillFocused =
      focusedCoord[`line.${which}.x`] ||
      focusedCoord[`line.${which}.y`] ||
      focusedCoord[`line.${which}.z`]
    if (!stillFocused && expandedLineEditorPoint.value === which) {
      expandedLineEditorPoint.value = null
    }
    lineCoordCollapseTimer = null
  }, 0)
}
const handleRayCoordFocus = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  if (rayCoordCollapseTimer !== null) {
    window.clearTimeout(rayCoordCollapseTimer)
    rayCoordCollapseTimer = null
  }
  expandedRayEditorPoint.value = which
  setCoordFocus(`ray.${which}.${axis}`, true)
}
const handleRayCoordBlur = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editRay[which][axis] = normalizeCoord(editRay[which][axis])
  setCoordFocus(`ray.${which}.${axis}`, false)
  applyEditRay()
  if (rayCoordCollapseTimer !== null) {
    window.clearTimeout(rayCoordCollapseTimer)
  }
  rayCoordCollapseTimer = window.setTimeout(() => {
    const stillFocused =
      focusedCoord[`ray.${which}.x`] ||
      focusedCoord[`ray.${which}.y`] ||
      focusedCoord[`ray.${which}.z`]
    if (!stillFocused && expandedRayEditorPoint.value === which) {
      expandedRayEditorPoint.value = null
    }
    rayCoordCollapseTimer = null
  }, 0)
}
const nudgePointCoord = (axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`point.${axis}`, direction)
  if (nextValue === null) return
  editPoint[axis] = nextValue
  applyEditPoint()
}
const keepLineCoordExpanded = (which: 'p1' | 'p2') => {
  if (lineCoordCollapseTimer !== null) {
    window.clearTimeout(lineCoordCollapseTimer)
    lineCoordCollapseTimer = null
  }
  expandedLineEditorPoint.value = which
}
const nudgeLineCoord = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`line.${which}.${axis}`, direction)
  if (nextValue === null) return
  editLine[which][axis] = nextValue
  applyEditLine()
}
const handleLineLengthFocus = () => {
  setCoordFocus('line.lockedLength', true)
}
const handleLineLengthBlur = () => {
  editLine.lockedLength = normalizeDisplayLength(editLine.lockedLength)
  setCoordFocus('line.lockedLength', false)
  applyEditLine()
}
const nudgeLineLength = (direction: 'up' | 'down') => {
  const nextValue = stepCoordInput('line.lockedLength', direction)
  if (nextValue === null) return
  editLine.lockedLength = nextValue
  applyEditLine()
}
const keepRayCoordExpanded = (which: 'p1' | 'p2') => {
  if (rayCoordCollapseTimer !== null) {
    window.clearTimeout(rayCoordCollapseTimer)
    rayCoordCollapseTimer = null
  }
  expandedRayEditorPoint.value = which
}
const nudgeRayCoord = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`ray.${which}.${axis}`, direction)
  if (nextValue === null) return
  editRay[which][axis] = nextValue
  applyEditRay()
}
const handleRayDisplayLengthFocus = () => {
  setCoordFocus('ray.displayLength', true)
}
const handleRayDisplayLengthBlur = () => {
  editRay.displayLength = normalizeDisplayLength(editRay.displayLength)
  setCoordFocus('ray.displayLength', false)
  applyEditRay()
}
const nudgeRayDisplayLength = (direction: 'up' | 'down') => {
  const nextValue = stepCoordInput('ray.displayLength', direction)
  if (nextValue === null) return
  editRay.displayLength = nextValue
  applyEditRay()
}

const startEditPoint = (p: Point3 | undefined) => {
  if (!p) return
  if (p.id === Scene.ORIGIN_ID) return
  editing.value = { type: 'point', id: p.id }
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  editPoint.name = p.name ?? ''
  editPoint.nameVisible = p.nameVisible !== false
  editPoint.userLocked = isPointCoordinateLocked(p)
  editPoint.x = toFixed2(p.position.x)
  editPoint.y = toFixed2(p.position.y)
  editPoint.z = toFixed2(p.position.z)
}

const startEditLine = (l: Line3 | undefined) => {
  if (!l) return
  editing.value = { type: 'line', id: l.id }
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  editLine.name = l.name ?? ''
  editLine.nameVisible = l.nameVisible !== false
  editLine.visible = l.visible !== false
  editLine.userLocked = props.editor.isLineLocked(l)
  editLine.lengthLocked = l.lengthLocked === true
  editLine.lockedLength = toFixed2(l.lengthLocked ? l.lockedLength : l.getLength())
  editLine.p1.x = toFixed2(l.p1.position.x)
  editLine.p1.y = toFixed2(l.p1.position.y)
  editLine.p1.z = toFixed2(l.p1.position.z)
  editLine.p2.x = toFixed2(l.p2.position.x)
  editLine.p2.y = toFixed2(l.p2.position.y)
  editLine.p2.z = toFixed2(l.p2.position.z)
}
const startEditRay = (r: Ray3 | undefined) => {
  if (!r) return
  editing.value = { type: 'ray', id: r.id }
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
  editRay.name = r.name ?? ''
  editRay.nameVisible = r.nameVisible !== false
  editRay.visible = r.visible !== false
  editRay.userLocked = props.editor.isRayLocked(r)
  editRay.displayLength = toFixed2(r.displayLength)
  editRay.p1.x = toFixed2(r.p1.position.x)
  editRay.p1.y = toFixed2(r.p1.position.y)
  editRay.p1.z = toFixed2(r.p1.position.z)
  editRay.p2.x = toFixed2(r.p2.position.x)
  editRay.p2.y = toFixed2(r.p2.position.y)
  editRay.p2.z = toFixed2(r.p2.position.z)
}

const applyPointPosition = (id: string, xStr: string, yStr: string, zStr: string) => {
  const x = Number(xStr)
  const y = Number(yStr)
  const z = Number(zStr)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
  const point = props.scene.points.get(id)
  if (!point) return
  if (isPointCoordinateLocked(point)) return
  props.editor.setPointPosition(id, new Vec3(x, y, z))
}

const applyEditPoint = () => {
  if (!editing.value || editing.value.type !== 'point') return
  const point = props.scene.points.get(editing.value.id)
  if (point) {
    props.editor.updatePoint(editing.value.id, {
      name: editPoint.name,
      nameVisible: editPoint.nameVisible,
    })
    if (editPoint.userLocked !== isPointCoordinateLocked(point)) {
      props.editor.setPointLockState(editing.value.id, editPoint.userLocked)
    }
  }
  applyPointPosition(editing.value.id, editPoint.x, editPoint.y, editPoint.z)
}

const applyEditLine = () => {
  if (!editing.value || editing.value.type !== 'line') return
  const line = props.scene.lines.get(editing.value.id)
  if (!line) return
  const previousUserLocked = props.editor.isLineLocked(line)
  const previousLengthLocked = line.lengthLocked
  const previousLockedLength = line.lockedLength
  const parsedLockedLength = Number(editLine.lockedLength)
  props.editor.updateLine(editing.value.id, {
    name: editLine.name,
    nameVisible: editLine.nameVisible,
    visible: editLine.visible,
    lengthLocked: editLine.lengthLocked,
    lockedLength: Number.isFinite(parsedLockedLength) ? parsedLockedLength : undefined,
  })
  if (editLine.userLocked !== previousUserLocked) {
    props.editor.setLineLockState(editing.value.id, editLine.userLocked)
  }

  const updatedLine = props.scene.lines.get(editing.value.id)
  if (!updatedLine) return
  if (props.editor.isLineLocked(updatedLine)) return

  const constraintChanged =
    editLine.lengthLocked !== previousLengthLocked ||
    (editLine.lengthLocked &&
      Number.isFinite(parsedLockedLength) &&
      Math.abs(parsedLockedLength - previousLockedLength) > 1e-6)
  if (constraintChanged) return

  const p1x = Number(editLine.p1.x)
  const p1y = Number(editLine.p1.y)
  const p1z = Number(editLine.p1.z)
  const p2x = Number(editLine.p2.x)
  const p2y = Number(editLine.p2.y)
  const p2z = Number(editLine.p2.z)
  if (
    !Number.isFinite(p1x) ||
    !Number.isFinite(p1y) ||
    !Number.isFinite(p1z) ||
    !Number.isFinite(p2x) ||
    !Number.isFinite(p2y) ||
    !Number.isFinite(p2z)
  ) {
    return
  }

  if (!updatedLine.lengthLocked) {
    applyPointPosition(updatedLine.p1.id, editLine.p1.x, editLine.p1.y, editLine.p1.z)
    applyPointPosition(updatedLine.p2.id, editLine.p2.x, editLine.p2.y, editLine.p2.z)
    return
  }

  const deltaP1 = {
    x: p1x - updatedLine.p1.position.x,
    y: p1y - updatedLine.p1.position.y,
    z: p1z - updatedLine.p1.position.z,
  }
  const deltaP2 = {
    x: p2x - updatedLine.p2.position.x,
    y: p2y - updatedLine.p2.position.y,
    z: p2z - updatedLine.p2.position.z,
  }
  const hasDeltaP1 =
    Math.abs(deltaP1.x) > 1e-6 || Math.abs(deltaP1.y) > 1e-6 || Math.abs(deltaP1.z) > 1e-6
  const hasDeltaP2 =
    Math.abs(deltaP2.x) > 1e-6 || Math.abs(deltaP2.y) > 1e-6 || Math.abs(deltaP2.z) > 1e-6
  const sameDelta =
    Math.abs(deltaP1.x - deltaP2.x) <= 1e-6 &&
    Math.abs(deltaP1.y - deltaP2.y) <= 1e-6 &&
    Math.abs(deltaP1.z - deltaP2.z) <= 1e-6

  if (hasDeltaP1 && (!hasDeltaP2 || sameDelta)) {
    props.editor.setPointPosition(updatedLine.p1.id, new Vec3(p1x, p1y, p1z))
  } else if (hasDeltaP2) {
    props.editor.setPointPosition(updatedLine.p2.id, new Vec3(p2x, p2y, p2z))
  }
}
const applyEditRay = () => {
  if (!editing.value || editing.value.type !== 'ray') return
  const ray = props.scene.rays.get(editing.value.id)
  if (!ray) return
  const previousUserLocked = props.editor.isRayLocked(ray)
  const displayLength = Number(editRay.displayLength)
  props.editor.updateRay(editing.value.id, {
    name: editRay.name,
    nameVisible: editRay.nameVisible,
    visible: editRay.visible,
    displayLength: Number.isFinite(displayLength) ? displayLength : undefined,
  })
  if (editRay.userLocked !== previousUserLocked) {
    props.editor.setRayLockState(editing.value.id, editRay.userLocked)
  }
  const updatedRay = props.scene.rays.get(editing.value.id)
  if (!updatedRay || props.editor.isRayLocked(updatedRay)) return
  applyPointPosition(ray.p1.id, editRay.p1.x, editRay.p1.y, editRay.p1.z)
  applyPointPosition(ray.p2.id, editRay.p2.x, editRay.p2.y, editRay.p2.z)
}
const getRayDirection = (ray: Ray3) => ray.getDirectionVector()
const getRayDisplayEnd = (ray: Ray3) => ray.getDisplayEndPoint()

const handleGlobalClick = (e: MouseEvent) => {
  if (!editing.value) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // 点击编辑框内部不退出，点击其他空白或区域则退出
  if (target.closest('.edit-grid')) return
  // 点击 3D 视口区域（viewport）→ 不退出
  if (target.closest('.viewport')) return
  editing.value = null
  expandedLineEditorPoint.value = null
  expandedRayEditorPoint.value = null
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
          userLocked: isPointCoordinateLocked(p),
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
    editPoint.userLocked = newPos.userLocked
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
      visible: l.visible !== false,
      userLocked: props.editor.isLineLocked(l),
      lengthLocked: l.lengthLocked === true,
      lockedLength: l.lockedLength,
      actualLength: l.getLength(),
      p1: { x: l.p1.position.x, y: l.p1.position.y, z: l.p1.position.z },
      p2: { x: l.p2.position.x, y: l.p2.position.y, z: l.p2.position.z },
    }
  },
  (newLine) => {
    if (!newLine) return
    editLine.name = newLine.name
    editLine.nameVisible = newLine.nameVisible
    editLine.visible = newLine.visible
    editLine.userLocked = newLine.userLocked
    editLine.lengthLocked = newLine.lengthLocked
    if (!focusedCoord['line.lockedLength']) {
      editLine.lockedLength = toFixed2(
        newLine.lengthLocked ? newLine.lockedLength : newLine.actualLength,
      )
    }
    if (!focusedCoord['line.p1.x']) editLine.p1.x = toFixed2(newLine.p1.x)
    if (!focusedCoord['line.p1.y']) editLine.p1.y = toFixed2(newLine.p1.y)
    if (!focusedCoord['line.p1.z']) editLine.p1.z = toFixed2(newLine.p1.z)
    if (!focusedCoord['line.p2.x']) editLine.p2.x = toFixed2(newLine.p2.x)
    if (!focusedCoord['line.p2.y']) editLine.p2.y = toFixed2(newLine.p2.y)
    if (!focusedCoord['line.p2.z']) editLine.p2.z = toFixed2(newLine.p2.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'ray') return null
    const r = props.scene.rays.get(editing.value.id)
    if (!r) return null
    return {
      name: r.name ?? '',
      nameVisible: r.nameVisible !== false,
      visible: r.visible !== false,
      userLocked: props.editor.isRayLocked(r),
      displayLength: r.displayLength,
      p1: { x: r.p1.position.x, y: r.p1.position.y, z: r.p1.position.z },
      p2: { x: r.p2.position.x, y: r.p2.position.y, z: r.p2.position.z },
    }
  },
  (newRay) => {
    if (!newRay) return
    editRay.name = newRay.name
    editRay.nameVisible = newRay.nameVisible
    editRay.visible = newRay.visible
    editRay.userLocked = newRay.userLocked
    if (!focusedCoord['ray.displayLength']) editRay.displayLength = toFixed2(newRay.displayLength)
    if (!focusedCoord['ray.p1.x']) editRay.p1.x = toFixed2(newRay.p1.x)
    if (!focusedCoord['ray.p1.y']) editRay.p1.y = toFixed2(newRay.p1.y)
    if (!focusedCoord['ray.p1.z']) editRay.p1.z = toFixed2(newRay.p1.z)
    if (!focusedCoord['ray.p2.x']) editRay.p2.x = toFixed2(newRay.p2.x)
    if (!focusedCoord['ray.p2.y']) editRay.p2.y = toFixed2(newRay.p2.y)
    if (!focusedCoord['ray.p2.z']) editRay.p2.z = toFixed2(newRay.p2.z)
  },
  { immediate: true },
)

onMounted(() => {
  updateCompactLineEditorMode()
  window.addEventListener('resize', updateCompactLineEditorMode)
  document.addEventListener('mousedown', handleGlobalClick)
})

onUnmounted(() => {
  if (lineCoordCollapseTimer !== null) {
    window.clearTimeout(lineCoordCollapseTimer)
  }
  if (rayCoordCollapseTimer !== null) {
    window.clearTimeout(rayCoordCollapseTimer)
  }
  window.removeEventListener('resize', updateCompactLineEditorMode)
  document.removeEventListener('mousedown', handleGlobalClick)
})
</script>

<template>
  <div class="sidebar">
    <p>当前操作模式：{{ modeName }}</p>
    <div v-if="modeHint" class="hint mode-hint">{{ modeHint }}</div>
    <div class="divider"></div>
    <h3>选中</h3>
    <div
      class="hint"
      v-if="selectedPoints.length > 0 || selectedLines.length > 0 || selectedRays.length > 0"
    >
      双击标签以编辑几何元素~
    </div>
    <div class="box selected-box">
      <div
        v-if="
          selectedPoints.length === 0 && selectedLines.length === 0 && selectedRays.length === 0
        "
      >
        无
      </div>

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
            <label class="toggle-label">
              <input type="checkbox" v-model="editPoint.userLocked" @change="applyEditPoint" />
              锁定
            </label>
          </div>
          <div class="coord-row">
            <div class="axis-field">
              <label>x</label>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePointCoord('x', 'down')"
                  :disabled="isPointCoordinateLocked(p!)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('point.x', el)"
                  v-model="editPoint.x"
                  @input="applyEditPoint"
                  @focus="handlePointCoordFocus('x')"
                  @blur="handlePointCoordBlur('x')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(p!)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePointCoord('x', 'up')"
                  :disabled="isPointCoordinateLocked(p!)"
                >
                  +
                </button>
              </div>
            </div>
            <div class="axis-field">
              <label>y</label>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePointCoord('y', 'down')"
                  :disabled="isPointCoordinateLocked(p!)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('point.y', el)"
                  v-model="editPoint.y"
                  @input="applyEditPoint"
                  @focus="handlePointCoordFocus('y')"
                  @blur="handlePointCoordBlur('y')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(p!)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePointCoord('y', 'up')"
                  :disabled="isPointCoordinateLocked(p!)"
                >
                  +
                </button>
              </div>
            </div>
            <div class="axis-field">
              <label>z</label>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePointCoord('z', 'down')"
                  :disabled="isPointCoordinateLocked(p!)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('point.z', el)"
                  v-model="editPoint.z"
                  @input="applyEditPoint"
                  @focus="handlePointCoordFocus('z')"
                  @blur="handlePointCoordBlur('z')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(p!)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePointCoord('z', 'up')"
                  :disabled="isPointCoordinateLocked(p!)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else>
          <div>
            点{{ p!.name ?? '' }}
            <span v-if="isPointCoordinateLocked(p!)" class="lock-badge">🔒</span>
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
              <input type="checkbox" v-model="editLine.visible" @change="applyEditLine" />
              线段显示
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="editLine.nameVisible" @change="applyEditLine" />
              名称显示
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="editLine.userLocked" @change="applyEditLine" />
              锁定
            </label>
          </div>
          <div class="name-row length-row">
            <label>长度</label>
            <div class="coord-input compact-length-input">
              <button
                type="button"
                class="step-btn"
                @click="nudgeLineLength('down')"
                :disabled="!editLine.lengthLocked || isLineConstraintLocked(l!)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('line.lockedLength', el)"
                v-model="editLine.lockedLength"
                @input="applyEditLine"
                @focus="handleLineLengthFocus"
                @blur="handleLineLengthBlur"
                step="0.5"
                min="0"
                :disabled="!editLine.lengthLocked || isLineConstraintLocked(l!)"
              />
              <button
                type="button"
                class="step-btn"
                @click="nudgeLineLength('up')"
                :disabled="!editLine.lengthLocked || isLineConstraintLocked(l!)"
              >
                +
              </button>
            </div>
            <label class="toggle-label">
              <input
                type="checkbox"
                v-model="editLine.lengthLocked"
                @change="applyEditLine"
                :disabled="isLineConstraintLocked(l!)"
              />
              {{ isCompactLineEditor ? '约束' : '长度约束' }}
            </label>
          </div>
          <div
            class="line-editor-grid"
            :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
          >
            <div class="line-editor-head"></div>
            <div class="line-editor-head">
              <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                点{{ l!.p1.name ?? '' }}(x,y,z)
              </span>
              <span v-else class="line-editor-title-short">点A</span>
              <span v-if="isPointCoordinateLocked(l!.p1)" class="lock-badge">🔒</span>
            </div>
            <div class="line-editor-head">
              <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                点{{ l!.p2.name ?? '' }}(x,y,z)
              </span>
              <span v-else class="line-editor-title-short">点B</span>
              <span v-if="isPointCoordinateLocked(l!.p2)" class="lock-badge">🔒</span>
            </div>

            <div class="line-axis-label">x</div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedLineEditorPoint !== 'p1',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p1')"
                @click="nudgeLineCoord('p1', 'x', 'down')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
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
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p1')"
                @click="nudgeLineCoord('p1', 'x', 'up')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
              >
                +
              </button>
            </div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedLineEditorPoint !== 'p2',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p2')"
                @click="nudgeLineCoord('p2', 'x', 'down')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
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
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p2')"
                @click="nudgeLineCoord('p2', 'x', 'up')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
              >
                +
              </button>
            </div>

            <div class="line-axis-label">y</div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedLineEditorPoint !== 'p1',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p1')"
                @click="nudgeLineCoord('p1', 'y', 'down')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
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
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p1')"
                @click="nudgeLineCoord('p1', 'y', 'up')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
              >
                +
              </button>
            </div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedLineEditorPoint !== 'p2',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p2')"
                @click="nudgeLineCoord('p2', 'y', 'down')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
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
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p2')"
                @click="nudgeLineCoord('p2', 'y', 'up')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
              >
                +
              </button>
            </div>

            <div class="line-axis-label">z</div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedLineEditorPoint !== 'p1',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p1')"
                @click="nudgeLineCoord('p1', 'z', 'down')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
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
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p1')"
                @click="nudgeLineCoord('p1', 'z', 'up')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
              >
                +
              </button>
            </div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedLineEditorPoint !== 'p2',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p2')"
                @click="nudgeLineCoord('p2', 'z', 'down')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
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
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepLineCoordExpanded('p2')"
                @click="nudgeLineCoord('p2', 'z', 'up')"
                :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div v-else>
          <div>
            线{{ l!.name ?? '' }}
            <span v-if="props.editor.isLineLocked(l!)" class="lock-badge">🔒</span>
          </div>
          <div>
            长度：{{ l!.getLength().toFixed(2) }}
            <span v-if="l!.lengthLocked" class="constraint-badge">受约束</span>
          </div>
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

      <div
        v-for="r in selectedRays"
        :key="r!.id"
        class="selectedRay-info"
        @dblclick="startEditRay(r)"
      >
        <div v-if="editing?.type === 'ray' && editing?.id === r!.id" class="edit-grid">
          <div class="name-row">
            <label>名称</label>
            <input type="text" v-model="editRay.name" @input="applyEditRay" />
            <label class="toggle-label">
              <input type="checkbox" v-model="editRay.visible" @change="applyEditRay" />
              {{ editRay.visible ? '射线显示' : '射线隐藏' }}
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="editRay.nameVisible" @change="applyEditRay" />
              {{ editRay.nameVisible ? '名称显示' : '名称隐藏' }}
            </label>
            <label class="toggle-label">
              <input type="checkbox" v-model="editRay.userLocked" @change="applyEditRay" />
              锁定
            </label>
          </div>
          <div class="name-row">
            <label>长度</label>
            <div class="coord-input">
              <button type="button" class="step-btn" @click="nudgeRayDisplayLength('down')">
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.displayLength', el)"
                v-model="editRay.displayLength"
                @input="applyEditRay"
                @focus="handleRayDisplayLengthFocus"
                @blur="handleRayDisplayLengthBlur"
                step="1"
                min="1"
              />
              <button type="button" class="step-btn" @click="nudgeRayDisplayLength('up')">+</button>
            </div>
          </div>
          <div
            class="line-editor-grid"
            :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
          >
            <div class="line-editor-head"></div>
            <div class="line-editor-head">
              <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                起点{{ r!.p1.name ?? '' }}(x,y,z)
              </span>
              <span v-else class="line-editor-title-short">起点{{ r!.p1.name ?? '' }}</span>
              <span v-if="isPointCoordinateLocked(r!.p1)" class="lock-badge">🔒</span>
            </div>
            <div class="line-editor-head">
              <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                方向点{{ r!.p2.name ?? '' }}(x,y,z)
              </span>
              <span v-else class="line-editor-title-short">方向点{{ r!.p2.name ?? '' }}</span>
              <span v-if="isPointCoordinateLocked(r!.p2)" class="lock-badge">🔒</span>
            </div>

            <div class="line-axis-label">x</div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedRayEditorPoint !== 'p1',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p1')"
                @click="nudgeRayCoord('p1', 'x', 'down')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.p1.x', el)"
                v-model="editRay.p1.x"
                @input="applyEditRay"
                @focus="handleRayCoordFocus('p1', 'x')"
                @blur="handleRayCoordBlur('p1', 'x')"
                step="0.5"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p1')"
                @click="nudgeRayCoord('p1', 'x', 'up')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              >
                +
              </button>
            </div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedRayEditorPoint !== 'p2',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p2')"
                @click="nudgeRayCoord('p2', 'x', 'down')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.p2.x', el)"
                v-model="editRay.p2.x"
                @input="applyEditRay"
                @focus="handleRayCoordFocus('p2', 'x')"
                @blur="handleRayCoordBlur('p2', 'x')"
                step="0.5"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p2')"
                @click="nudgeRayCoord('p2', 'x', 'up')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              >
                +
              </button>
            </div>

            <div class="line-axis-label">y</div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedRayEditorPoint !== 'p1',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p1')"
                @click="nudgeRayCoord('p1', 'y', 'down')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.p1.y', el)"
                v-model="editRay.p1.y"
                @input="applyEditRay"
                @focus="handleRayCoordFocus('p1', 'y')"
                @blur="handleRayCoordBlur('p1', 'y')"
                step="0.5"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p1')"
                @click="nudgeRayCoord('p1', 'y', 'up')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              >
                +
              </button>
            </div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedRayEditorPoint !== 'p2',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p2')"
                @click="nudgeRayCoord('p2', 'y', 'down')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.p2.y', el)"
                v-model="editRay.p2.y"
                @input="applyEditRay"
                @focus="handleRayCoordFocus('p2', 'y')"
                @blur="handleRayCoordBlur('p2', 'y')"
                step="0.5"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p2')"
                @click="nudgeRayCoord('p2', 'y', 'up')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              >
                +
              </button>
            </div>

            <div class="line-axis-label">z</div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedRayEditorPoint !== 'p1',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p1')"
                @click="nudgeRayCoord('p1', 'z', 'down')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.p1.z', el)"
                v-model="editRay.p1.z"
                @input="applyEditRay"
                @focus="handleRayCoordFocus('p1', 'z')"
                @blur="handleRayCoordBlur('p1', 'z')"
                step="0.5"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p1')"
                @click="nudgeRayCoord('p1', 'z', 'up')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
              >
                +
              </button>
            </div>
            <div
              class="coord-input"
              :class="{
                'line-point-collapsed': isCompactLineEditor && expandedRayEditorPoint !== 'p2',
              }"
            >
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p2')"
                @click="nudgeRayCoord('p2', 'z', 'down')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              >
                -
              </button>
              <input
                type="number"
                :ref="(el) => setCoordInputRef('ray.p2.z', el)"
                v-model="editRay.p2.z"
                @input="applyEditRay"
                @focus="handleRayCoordFocus('p2', 'z')"
                @blur="handleRayCoordBlur('p2', 'z')"
                step="0.5"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              />
              <button
                type="button"
                class="step-btn"
                @pointerdown.prevent="keepRayCoordExpanded('p2')"
                @click="nudgeRayCoord('p2', 'z', 'up')"
                :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <div v-else>
          <div>
            射线{{ r!.name ?? '' }}
            <span v-if="props.editor.isRayLocked(r!)" class="lock-badge">🔒</span>
          </div>
          <div>显示长度：{{ r!.displayLength.toFixed(2) }}</div>
          <div>
            起点{{ r!.p1.name ?? '' }}（{{ r!.p1.position.x.toFixed(2) }},
            {{ r!.p1.position.y.toFixed(2) }}, {{ r!.p1.position.z.toFixed(2) }}）
          </div>
          <div>
            方向点{{ r!.p2.name ?? '' }}（{{ r!.p2.position.x.toFixed(2) }},
            {{ r!.p2.position.y.toFixed(2) }}, {{ r!.p2.position.z.toFixed(2) }}）
          </div>
          <div>
            方向向量（{{ getRayDirection(r!).x.toFixed(2) }},
            {{ getRayDirection(r!).y.toFixed(2) }}, {{ getRayDirection(r!).z.toFixed(2) }}）
          </div>
          <div>
            显示终点（{{ getRayDisplayEnd(r!).x.toFixed(2) }},
            {{ getRayDisplayEnd(r!).y.toFixed(2) }}, {{ getRayDisplayEnd(r!).z.toFixed(2) }}）
          </div>
        </div>
      </div>
    </div>
    <div class="divider"></div>
    <h3>内容</h3>
    <div class="box content-box" @click.self="clearContentSelection">
      <div
        v-if="pointsInScene.length === 0 && linesInScene.length === 0 && raysInScene.length === 0"
      >
        无
      </div>
      <div v-if="pointsInScene.length > 0" class="content-group">
        <button
          v-if="canCollapseContentGroups"
          type="button"
          class="content-group-header content-group-toggle"
          :aria-expanded="!collapsedContentGroups.point"
          @click="toggleContentGroup('point')"
        >
          <span class="content-group-toggle-icon">
            {{ collapsedContentGroups.point ? '▸' : '▾' }}
          </span>
          <span class="content-group-label">{{ contentGroupLabels.point }}</span>
          <span class="content-group-count">{{ pointsInScene.length }}</span>
        </button>
        <div v-else class="content-group-header content-group-title">
          <span class="content-group-label">{{ contentGroupLabels.point }}</span>
          <span class="content-group-count">{{ pointsInScene.length }}</span>
        </div>
        <div
          v-show="!collapsedContentGroups.point || !canCollapseContentGroups"
          class="content-group-body"
        >
          <div
            v-for="p in pointsInScene"
            :key="p!.id"
            class="point-info selectable-geo"
            :class="{ 'is-selected': selectedPointIds.includes(p!.id) }"
            @click="selectPointFromContent(p!.id)"
          >
            <div>
              点{{ p!.name ?? '' }}（{{ p!.position.x.toFixed(2) }}, {{ p!.position.y.toFixed(2) }},
              {{ p!.position.z.toFixed(2) }}）
              <span v-if="isPointCoordinateLocked(p!)" class="lock-badge">🔒</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="linesInScene.length > 0" class="content-group">
        <button
          v-if="canCollapseContentGroups"
          type="button"
          class="content-group-header content-group-toggle"
          :aria-expanded="!collapsedContentGroups.line"
          @click="toggleContentGroup('line')"
        >
          <span class="content-group-toggle-icon">
            {{ collapsedContentGroups.line ? '▸' : '▾' }}
          </span>
          <span class="content-group-label">{{ contentGroupLabels.line }}</span>
          <span class="content-group-count">{{ linesInScene.length }}</span>
        </button>
        <div v-else class="content-group-header content-group-title">
          <span class="content-group-label">{{ contentGroupLabels.line }}</span>
          <span class="content-group-count">{{ linesInScene.length }}</span>
        </div>
        <div
          v-show="!collapsedContentGroups.line || !canCollapseContentGroups"
          class="content-group-body"
        >
          <div
            v-for="l in linesInScene"
            :key="l!.id"
            class="line-info selectable-geo"
            :class="{ 'is-selected': selectedLineIds.includes(l!.id) }"
            @click="selectLineFromContent(l!.id)"
          >
            <div>
              线段{{ l!.name ?? '' }}
              <span v-if="props.editor.isLineLocked(l!)" class="lock-badge">🔒</span>
            </div>
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
      <div v-if="raysInScene.length > 0" class="content-group">
        <button
          v-if="canCollapseContentGroups"
          type="button"
          class="content-group-header content-group-toggle"
          :aria-expanded="!collapsedContentGroups.ray"
          @click="toggleContentGroup('ray')"
        >
          <span class="content-group-toggle-icon">
            {{ collapsedContentGroups.ray ? '▸' : '▾' }}
          </span>
          <span class="content-group-label">{{ contentGroupLabels.ray }}</span>
          <span class="content-group-count">{{ raysInScene.length }}</span>
        </button>
        <div v-else class="content-group-header content-group-title">
          <span class="content-group-label">{{ contentGroupLabels.ray }}</span>
          <span class="content-group-count">{{ raysInScene.length }}</span>
        </div>
        <div
          v-show="!collapsedContentGroups.ray || !canCollapseContentGroups"
          class="content-group-body"
        >
          <div
            v-for="r in raysInScene"
            :key="r!.id"
            class="ray-info selectable-geo"
            :class="{ 'is-selected': selectedRayIds.includes(r!.id) }"
            @click="selectRayFromContent(r!.id)"
          >
            <div>
              射线{{ r!.name ?? '' }}
              <span v-if="props.editor.isRayLocked(r!)" class="lock-badge">🔒</span>
            </div>
            <div>
              起点{{ r!.p1.name ?? '' }}（{{ r!.p1.position.x.toFixed(2) }},
              {{ r!.p1.position.y.toFixed(2) }}, {{ r!.p1.position.z.toFixed(2) }}）
            </div>
            <div>
              方向点{{ r!.p2.name ?? '' }}（{{ r!.p2.position.x.toFixed(2) }},
              {{ r!.p2.position.y.toFixed(2) }}, {{ r!.p2.position.z.toFixed(2) }}）
            </div>
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
.point-info,
.selectedLine-info,
.selectedRay-info,
.line-info,
.ray-info {
  background-color: rgba(44, 90, 52, 0.4); /* 使用半透明绿色 */
  border-left: 3px solid #43f260; /* 增加一个亮色左边框提升质感 */
  margin-bottom: 6px;
  padding: 8px;
  font-size: 13px;
}
.selectedLine-info,
.line-info {
  background-color: rgba(158, 106, 28, 0.28);
  border-left-color: #ffb347;
}
.selectedRay-info,
.ray-info {
  background-color: rgba(80, 136, 194, 0.28);
  border-left-color: #7fc8ff;
}
.selectable-geo {
  cursor: pointer;
}
.selectable-geo.is-selected {
  background-color: rgba(67, 242, 96, 0.18);
  border-left-color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(67, 242, 96, 0.35);
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
.content-group {
  margin-bottom: 8px;
}
.content-group:last-child {
  margin-bottom: 0;
}
.content-group-header {
  position: sticky;
  top: 0;
  z-index: 4;
  isolation: isolate;
}
.content-group-header::before {
  content: '';
  position: absolute;
  left: -8px;
  right: -8px;
  top: -8px;
  bottom: -2px;
  background: #1a1a1a;
  pointer-events: none;
  z-index: 0;
}
.content-group-toggle,
.content-group-title {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 4px 8px;
  margin-bottom: 4px;
  border: 1px solid #9d9c9c;
  border-radius: 5px;
  background: rgba(26, 26, 26, 0.96);
  color: #f0f0f0;
  font-size: 11px;
  box-sizing: border-box;
  backdrop-filter: blur(4px);
}
.content-group-header::after {
  content: '';
  position: absolute;
  left: -1px;
  right: -1px;
  bottom: -8px;
  height: 12px;
  background: #1a1a1a;
  pointer-events: none;
  z-index: 0;
}
.content-group-toggle > *,
.content-group-title > * {
  position: relative;
  z-index: 1;
}
.content-group-toggle {
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.content-group-toggle:hover {
  background: rgba(42, 42, 42, 0.98);
}
.content-group-toggle-icon {
  width: 10px;
  flex-shrink: 0;
  text-align: center;
  color: #9fd8ff;
  font-size: 10px;
}
.content-group-label {
  font-weight: 600;
}
.content-group-count {
  margin-left: auto;
  color: #a8a8a8;
  font-size: 10px;
}
.content-group-body {
  display: flex;
  flex-direction: column;
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
.length-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-wrap: nowrap;
  gap: 4px;
}
.length-row > label {
  flex: 0 0 auto;
}
.compact-length-input {
  width: 108px;
  flex: 0 0 auto;
}
.length-row .toggle-label {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
  white-space: nowrap;
}
.line-editor-grid {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) minmax(0, 1fr);
  gap: 6px 8px;
  align-items: center;
  grid-column: 1 / -1;
}
.line-editor-head {
  font-size: 12px;
  color: #e6ffe9;
  white-space: nowrap;
}
.line-editor-title-short {
  display: none;
}
.line-axis-label {
  font-size: 11px;
  color: #8fdc9b;
  text-align: center;
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
.constraint-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.4;
  color: #ffe2b7;
  background: rgba(255, 179, 71, 0.18);
  border: 1px solid rgba(255, 179, 71, 0.42);
  vertical-align: middle;
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
  .selectedRay-info,
  .point-info,
  .line-info,
  .ray-info {
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

  .name-row {
    flex-wrap: wrap;
  }

  .length-row {
    flex-wrap: nowrap;
  }

  .line-editor-grid {
    gap: 4px 6px;
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
  .selectedRay-info,
  .point-info,
  .line-info,
  .ray-info {
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

  .compact-length-input {
    width: 84px;
    justify-self: start;
    grid-template-columns: 22px minmax(0, 1fr) 22px;
  }

  .compact-length-input .step-btn {
    min-width: 22px;
    min-height: 24px;
    padding: 0;
    font-size: 12px;
  }

  .step-btn {
    min-width: 36px;
    min-height: 36px;
    font-size: 18px;
  }

  .name-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    align-items: center;
  }

  .length-row {
    display: flex;
    grid-template-columns: auto minmax(0, auto);
    justify-content: start;
    align-items: center;
    gap: 3px;
    flex-wrap: nowrap;
  }

  .length-row .toggle-label {
    flex: 0 1 auto;
    min-width: 0;
    margin-left: auto;
    font-size: 10px;
    gap: 2px;
  }

  .toggle-label {
    grid-column: 1 / -1;
  }

  .line-editor-grid {
    grid-template-columns: 14px minmax(0, 1fr) minmax(0, 1fr);
  }

  .compact-axis {
    grid-column: 1 / -1;
  }
}

.line-editor-grid--compact {
  grid-template-columns: 12px minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 10px;
  row-gap: 5px;
}

.line-editor-grid--compact > .line-editor-head:first-child {
  display: block;
}

.line-editor-grid--compact > .line-editor-head {
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
  line-height: 1.2;
  font-size: 11px;
}

.line-editor-grid--compact .line-editor-title-short {
  display: inline;
}

.line-editor-grid--compact > .line-editor-head:nth-child(2) {
  padding-right: 3px;
}

.line-editor-grid--compact > .line-editor-head:nth-child(3) {
  padding-left: 3px;
}

.line-editor-grid--compact > .coord-input {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  transition: grid-template-columns 0.16s ease;
}

.line-editor-grid--compact > .coord-input:nth-child(3n + 2) {
  margin-right: 2px;
}

.line-editor-grid--compact > .coord-input:nth-child(3n) {
  margin-left: 2px;
}

.line-editor-grid--compact > .coord-input input[type='number'] {
  width: 100%;
  min-width: 0;
  padding-left: 2px;
  padding-right: 2px;
  font-size: 11px;
}

.line-editor-grid--compact > .coord-input.line-point-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 0;
}

.line-editor-grid--compact > .coord-input.line-point-collapsed .step-btn {
  min-width: 0;
  min-height: 0;
  padding: 0;
  border-width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
}

.line-editor-grid--compact > .coord-input .step-btn {
  min-width: 24px;
  min-height: 26px;
  font-size: 13px;
}

.line-editor-grid--compact .line-axis-label {
  font-size: 10px;
  text-align: left;
}

@media (hover: none) and (pointer: coarse) {
  .selectedPoint-info,
  .selectedLine-info,
  .selectedRay-info,
  .point-info,
  .line-info,
  .ray-info {
    padding: 4px;
    font-size: 10px;
  }
}
</style>
