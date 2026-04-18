import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { EditorMode, type Editor } from '@/core/editor/Editor'
import type { Scene } from '@/core/scene/Scene'

type CountSummary = {
  point: number
  line: number
  straightLine: number
  ray: number
  face: number
}

const createEmptyCounts = (): CountSummary => ({
  point: 0,
  line: 0,
  straightLine: 0,
  ray: 0,
  face: 0,
})

const getModeName = (mode: EditorMode) => {
  switch (mode) {
    case EditorMode.Select:
      return '选择'
    case EditorMode.Delete:
      return '删除'
    case EditorMode.CreatePoint:
      return '创建自由点'
    case EditorMode.MergePoint:
      return '合并点'
    case EditorMode.IntersectionPoint:
      return '创建交点'
    case EditorMode.CreateLine:
      return '创建线段'
    case EditorMode.CreateStraightLine:
      return '创建直线'
    case EditorMode.CreateRay:
      return '创建射线'
    case EditorMode.CreatePlane:
      return '创建面'
    case EditorMode.CreateHexahedron:
      return '创建正六面体'
    default:
      return ''
  }
}

const getModeHint = (mode: EditorMode) => {
  switch (mode) {
    case EditorMode.Delete:
      return '单击场景中的几何对象即可删除。'
    case EditorMode.CreateLine:
      return '点击场景中的两个不同点以创建线段。'
    case EditorMode.CreateStraightLine:
      return '点击场景中的两个不同点以创建直线。'
    case EditorMode.CreateRay:
      return '点击场景中的两个不同点以创建射线。'
    case EditorMode.CreatePlane:
      return '先选择多个点或闭合线段，再点击空白处确认创建面。'
    case EditorMode.MergePoint:
      return '先选中两个点，再选择保留哪个点完成合并。'
    case EditorMode.IntersectionPoint:
      return '选中两个可求交的对象来创建交点。'
    case EditorMode.CreateHexahedron:
      return '选中两个点或一条线段以创建正六面体~'
    default:
      return ''
  }
}

export const useSceneStore = defineStore('scene', () => {
  const currentMode = ref(EditorMode.Select)
  const isSnappingEnabled = ref(true)
  const canUndo = ref(false)
  const canRedo = ref(false)
  const selectionCounts = ref<CountSummary>(createEmptyCounts())
  const sceneCounts = ref<CountSummary>(createEmptyCounts())

  const modeName = computed(() => getModeName(currentMode.value))
  const modeHint = computed(() => getModeHint(currentMode.value))
  const totalSelected = computed(
    () =>
      selectionCounts.value.point +
      selectionCounts.value.line +
      selectionCounts.value.straightLine +
      selectionCounts.value.ray +
      selectionCounts.value.face,
  )
  const totalSceneElements = computed(
    () =>
      sceneCounts.value.point +
      sceneCounts.value.line +
      sceneCounts.value.straightLine +
      sceneCounts.value.ray +
      sceneCounts.value.face,
  )

  const setCurrentMode = (mode: EditorMode) => {
    currentMode.value = mode
  }

  const setSnappingEnabled = (value: boolean) => {
    isSnappingEnabled.value = value
  }

  const setHistoryState = (value: { canUndo: boolean; canRedo: boolean }) => {
    canUndo.value = value.canUndo
    canRedo.value = value.canRedo
  }

  const setSelectionCounts = (value: CountSummary) => {
    selectionCounts.value = value
  }

  const setSceneCounts = (value: CountSummary) => {
    sceneCounts.value = value
  }

  const syncEditorState = (editor: Editor) => {
    currentMode.value = editor.mode
    isSnappingEnabled.value = editor.isSnappingEnabled
    canUndo.value = editor.canUndo
    canRedo.value = editor.canRedo
  }

  const syncSceneState = (scene: Scene) => {
    selectionCounts.value = {
      point: scene.selection.points.size,
      line: scene.selection.lines.size,
      straightLine: scene.selection.straightLines.size,
      ray: scene.selection.rays.size,
      face: scene.selection.faces.size,
    }
    sceneCounts.value = {
      point: scene.points.size,
      line: scene.lines.size,
      straightLine: scene.straightLines.size,
      ray: scene.rays.size,
      face: scene.faces.size,
    }
  }

  const resetSceneState = () => {
    currentMode.value = EditorMode.Select
    isSnappingEnabled.value = true
    canUndo.value = false
    canRedo.value = false
    selectionCounts.value = createEmptyCounts()
    sceneCounts.value = createEmptyCounts()
  }

  return {
    currentMode,
    modeName,
    modeHint,
    isSnappingEnabled,
    canUndo,
    canRedo,
    selectionCounts,
    sceneCounts,
    totalSelected,
    totalSceneElements,
    setCurrentMode,
    setSnappingEnabled,
    setHistoryState,
    setSelectionCounts,
    setSceneCounts,
    syncEditorState,
    syncSceneState,
    resetSceneState,
  }
})
