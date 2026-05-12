import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { EditorMode, type Editor } from '@/core/editor/Editor'
import type { Scene } from '@/core/scene/Scene'

type CountSummary = {
  point: number
  line: number
  straightLine: number
  ray: number
  vector: number
  circle: number
  face: number
  sphere: number
}

const createEmptyCounts = (): CountSummary => ({
  point: 0,
  line: 0,
  straightLine: 0,
  ray: 0,
  vector: 0,
  circle: 0,
  face: 0,
  sphere: 0,
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
    case EditorMode.CreateVector:
      return '创建向量'
    case EditorMode.CreateCircleThreePoints:
      return '创建三点圆'
    case EditorMode.CreateCircleNormal:
      return '法向圆'
    case EditorMode.CreatePlane:
      return '创建多边形'
    case EditorMode.CreateRegularPolygon:
      return '创建正多边形'
    case EditorMode.CreateHexahedron:
      return '创建正六面体'
    case EditorMode.CreateTetrahedron:
      return '创建正四面体'
    case EditorMode.CreateSphereTwoPoints:
      return '创建两点球'
    case EditorMode.CreateSphereRadius:
      return '创建半径球'
    default:
      return ''
  }
}

const getModeHint = (mode: EditorMode) => {
  switch (mode) {
    case EditorMode.Delete:
      return '单击场景中的几何对象即可删除~'
    case EditorMode.CreatePoint:
      return 'Tips:旋转或缩放场景可以更好地确定落点位置哦~'
    case EditorMode.CreateLine:
      return '选中场景中的两个不同点以创建线段~'
    case EditorMode.CreateStraightLine:
      return '选中场景中的两个不同点以创建直线~'
    case EditorMode.CreateRay:
      return '选中场景中的两个不同点以创建射线~'
    case EditorMode.CreateVector:
      return '选中场景中的两个不同点以创建向量~'
    case EditorMode.CreateCircleThreePoints:
      return '选中场景中的三个不共线的点以创建三点圆~'
    case EditorMode.CreateCircleNormal:
      return '先选中一个点作为圆心，再选中一个法向量（线/射线/直线/向量/点）~'
    case EditorMode.CreatePlane:
      return '先选择多个点或闭合线段，再点击空白处确认创建多边形~'
    case EditorMode.CreateRegularPolygon:
      return '选中两个不同的点，再输入顶点数即可创建正多边形~'
    case EditorMode.MergePoint:
      return '先选中两个点，再选择保留哪个点完成合并~'
    case EditorMode.IntersectionPoint:
      return '选中两个可求交的对象来创建交点~'
    case EditorMode.CreateHexahedron:
      return '选中两个点或一条线段以创建正六面体~'
    case EditorMode.CreateTetrahedron:
      return '选中两个点或一条线段以创建正四面体~'
    case EditorMode.CreateSphereTwoPoints:
      return '先选中一点作为球心，再选中一点以创建球体~'
    case EditorMode.CreateSphereRadius:
      return '先选中一点作为球心，输入半径以创建球体~'
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
      selectionCounts.value.vector +
      selectionCounts.value.face +
      selectionCounts.value.sphere,
  )
  const totalSceneElements = computed(
    () =>
      sceneCounts.value.point +
      sceneCounts.value.line +
      sceneCounts.value.straightLine +
      sceneCounts.value.ray +
      sceneCounts.value.vector +
      sceneCounts.value.face +
      sceneCounts.value.sphere,
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
      vector: scene.selection.vectors.size,
      circle: scene.selection.circles.size,
      face: scene.selection.faces.size,
      sphere: scene.selection.spheres.size,
    }
    sceneCounts.value = {
      point: scene.points.size,
      line: scene.lines.size,
      straightLine: scene.straightLines.size,
      ray: scene.rays.size,
      vector: scene.vectors.size,
      circle: scene.circles.size,
      face: scene.faces.size,
      sphere: scene.spheres.size,
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
