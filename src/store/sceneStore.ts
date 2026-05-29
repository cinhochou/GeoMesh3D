import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { EditorMode, type Editor } from '@/core/editor/Editor'
import type { Scene } from '@/core/scene/Scene'

type CountSummary = {
  point: number
  line: number
  straightLine: number
  perpendicularLine: number
  ray: number
  vector: number
  circle: number
  face: number
  sphere: number
  cone: number
  cylinder: number
}

const createEmptyCounts = (): CountSummary => ({
  point: 0,
  line: 0,
  straightLine: 0,
  perpendicularLine: 0,
  ray: 0,
  vector: 0,
  circle: 0,
  face: 0,
  sphere: 0,
  cone: 0,
  cylinder: 0,
})

const modeNameMap: Record<EditorMode, string> = {
  [EditorMode.Select]: '选择',
  [EditorMode.Delete]: '删除',
  [EditorMode.CreatePoint]: '创建自由点',
  [EditorMode.MergePoint]: '合并点',
  [EditorMode.IntersectionPoint]: '创建交点',
  [EditorMode.CreateLine]: '创建线段',
  [EditorMode.CreateStraightLine]: '创建直线',
  [EditorMode.CreateRay]: '创建射线',
  [EditorMode.CreateVector]: '创建向量',
  [EditorMode.CreateCircleThreePoints]: '创建三点圆',
  [EditorMode.CreateCircleNormal]: '法向圆',
  [EditorMode.CreatePlane]: '创建多边形',
  [EditorMode.CreateRegularPolygon]: '创建正多边形',
  [EditorMode.CreateHexahedron]: '创建正六面体',
  [EditorMode.CreateTetrahedron]: '创建正四面体',
  [EditorMode.CreateSphereTwoPoints]: '创建两点球',
  [EditorMode.CreateSphereRadius]: '创建半径球',
  [EditorMode.CreateCone]: '创建圆锥',
  [EditorMode.CreateCylinder]: '创建圆柱',
  [EditorMode.CreatePerpendicularLine]: '创建垂线',
}

const modeHintMap: Record<EditorMode, string> = {
  [EditorMode.Select]: '',
  [EditorMode.Delete]: '单击场景中的几何对象即可删除~',
  [EditorMode.CreatePoint]: 'Tips:旋转或缩放场景可以更好地确定落点位置哦~',
  [EditorMode.MergePoint]: '先选中两个点，再选择保留哪个点完成合并~',
  [EditorMode.IntersectionPoint]: '选中两个可求交的对象来创建交点~',
  [EditorMode.CreateLine]: '选中场景中的两个不同点以创建线段~',
  [EditorMode.CreateStraightLine]: '选中场景中的两个不同点以创建直线~',
  [EditorMode.CreateRay]: '选中场景中的两个不同点以创建射线~',
  [EditorMode.CreateVector]: '选中场景中的两个不同点以创建向量~',
  [EditorMode.CreateCircleThreePoints]: '选中场景中的三个不共线的点以创建三点圆~',
  [EditorMode.CreateCircleNormal]:
    '先选中一个点作为圆心，再选中一个法向量（线/射线/直线/向量/点）~',
  [EditorMode.CreatePlane]: '先选择多个点或闭合线段，再点击空白处确认创建多边形~',
  [EditorMode.CreateRegularPolygon]: '选中两个不同的点，再输入顶点数即可创建正多边形~',
  [EditorMode.CreateHexahedron]: '选中两个点或一条线段以创建正六面体~',
  [EditorMode.CreateTetrahedron]: '选中两个点或一条线段以创建正四面体~',
  [EditorMode.CreateSphereTwoPoints]: '先选中一点作为球心，再选中一点以创建球体~',
  [EditorMode.CreateSphereRadius]: '先选中一点作为球心，输入半径以创建球体~',
  [EditorMode.CreateCone]:
    '1.先选中一点作为底面圆心，再选中顶点，最后输入半径以创建圆锥 2.先选中一个法向圆，再选中一个顶点以创建圆锥',
  [EditorMode.CreateCylinder]: '先选中两点作为两底圆心，再输入底面半径以创建圆柱~',
  [EditorMode.CreatePerpendicularLine]: '先选中要经过的点，再选中要垂直的线或平面以创建垂线~',
}

const getModeName = (mode: EditorMode) => modeNameMap[mode] ?? ''

const getModeHint = (mode: EditorMode) => modeHintMap[mode] ?? ''

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
      selectionCounts.value.sphere +
      selectionCounts.value.cone +
      selectionCounts.value.cylinder,
  )
  const totalSceneElements = computed(
    () =>
      sceneCounts.value.point +
      sceneCounts.value.line +
      sceneCounts.value.straightLine +
      sceneCounts.value.ray +
      sceneCounts.value.vector +
      sceneCounts.value.face +
      sceneCounts.value.sphere +
      sceneCounts.value.cone +
      sceneCounts.value.cylinder,
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
      perpendicularLine: scene.selection.perpendicularLines.size,
      ray: scene.selection.rays.size,
      vector: scene.selection.vectors.size,
      circle: scene.selection.circles.size,
      face: scene.selection.faces.size,
      sphere: scene.selection.spheres.size,
      cone: scene.selection.cones.size,
      cylinder: scene.selection.cylinders.size,
    }
    sceneCounts.value = {
      point: scene.points.size,
      line: scene.lines.size,
      straightLine: scene.straightLines.size,
      perpendicularLine: scene.perpendicularLines.size,
      ray: scene.rays.size,
      vector: scene.vectors.size,
      circle: scene.circles.size,
      face: scene.faces.size,
      sphere: scene.spheres.size,
      cone: scene.cones.size,
      cylinder: scene.cylinders.size,
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
