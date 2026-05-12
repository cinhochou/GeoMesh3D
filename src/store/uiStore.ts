import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { EditorMode } from '@/core/editor/Editor'

export type ToastScope = 'global' | 'viewport'

type ContentGroupKey =
  | 'point'
  | 'line'
  | 'straightLine'
  | 'ray'
  | 'vector'
  | 'circle'
  | 'face'
  | 'hexahedron'
  | 'tetrahedron'
  | 'sphere'

interface MergePointDialogState {
  visible: boolean
  targetId: string
}

interface RegularPolygonDialogState {
  visible: boolean
  firstPointId: string
  secondPointId: string
  vertexCount: number
}

interface NormalCircleRadiusDialogState {
  visible: boolean
  radius: number
}

interface RadiusSphereDialogState {
  visible: boolean
  centerPointId: string
  radius: number
}

interface ContentGroupCollapseState {
  point: boolean
  line: boolean
  straightLine: boolean
  ray: boolean
  vector: boolean
  circle: boolean
  face: boolean
  hexahedron: boolean
  tetrahedron: boolean
  sphere: boolean
}

const createContentGroupsCollapsed = (): ContentGroupCollapseState => ({
  point: false,
  line: false,
  straightLine: false,
  ray: false,
  vector: false,
  circle: false,
  face: false,
  hexahedron: false,
  tetrahedron: false,
  sphere: false,
})

export const useUiStore = defineStore('ui', () => {
  const isTouchDevice = ref(false)
  const isCompactLineEditor = ref(false)

  const fps = ref(0)
  const axisGridSize = ref(10)
  const isGridVisible = ref(true)
  const isCoordinateSystemVisible = ref(true)
  const isGlobalPointValueMode = ref(false)
  const isARMode = ref(false)
  const lastModeBeforeAR = ref<EditorMode | null>(null)
  const lastModeBeforeCoordinateOff = ref<EditorMode | null>(null)

  const toastMessage = ref('')
  const toastVisible = ref(false)
  const toastScope = ref<ToastScope>('global')

  const mergePointDialog = ref<MergePointDialogState>({
    visible: false,
    targetId: '',
  })

  const regularPolygonDialog = ref<RegularPolygonDialogState>({
    visible: false,
    firstPointId: '',
    secondPointId: '',
    vertexCount: 5,
  })

  const normalCircleRadiusDialog = ref<NormalCircleRadiusDialogState>({
    visible: false,
    radius: 1,
  })

  const radiusSphereDialog = ref<RadiusSphereDialogState>({
    visible: false,
    centerPointId: '',
    radius: 1,
  })

  const toolbarMenus = ref({
    deleteOpen: false,
    pointOpen: false,
    lineOpen: false,
    circleOpen: false,
    polygonOpen: false,
    solidOpen: false,
  })

  const contentGroupsCollapsed = ref<ContentGroupCollapseState>(createContentGroupsCollapsed())
  const hasAutoCollapsedContentGroups = ref(false)

  const anyToolbarMenuOpen = computed(
    () =>
      toolbarMenus.value.deleteOpen ||
      toolbarMenus.value.pointOpen ||
      toolbarMenus.value.lineOpen ||
      toolbarMenus.value.circleOpen ||
      toolbarMenus.value.polygonOpen ||
      toolbarMenus.value.solidOpen,
  )

  const openToast = (message: string, scope: ToastScope = 'global') => {
    toastMessage.value = message
    toastScope.value = scope
    toastVisible.value = true
  }

  const closeToast = () => {
    toastVisible.value = false
  }

  const clearToast = () => {
    toastMessage.value = ''
    toastScope.value = 'global'
    toastVisible.value = false
  }

  const setTouchDevice = (value: boolean) => {
    isTouchDevice.value = value
  }

  const setCompactLineEditor = (value: boolean) => {
    isCompactLineEditor.value = value
  }

  const setFps = (value: number) => {
    fps.value = value
  }

  const setAxisGridSize = (value: number) => {
    axisGridSize.value = value
  }

  const setGridVisible = (value: boolean) => {
    isGridVisible.value = value
  }

  const toggleGridVisible = () => {
    isGridVisible.value = !isGridVisible.value
  }

  const setCoordinateSystemVisible = (value: boolean) => {
    isCoordinateSystemVisible.value = value
  }

  const setGlobalPointValueMode = (value: boolean) => {
    isGlobalPointValueMode.value = value
  }

  const toggleGlobalPointValueMode = () => {
    isGlobalPointValueMode.value = !isGlobalPointValueMode.value
  }

  const setARMode = (value: boolean) => {
    isARMode.value = value
  }

  const setLastModeBeforeAR = (mode: EditorMode | null) => {
    lastModeBeforeAR.value = mode
  }

  const setLastModeBeforeCoordinateOff = (mode: EditorMode | null) => {
    lastModeBeforeCoordinateOff.value = mode
  }

  const openMergePointDialog = (targetId = '') => {
    mergePointDialog.value = {
      visible: true,
      targetId,
    }
  }

  const closeMergePointDialog = () => {
    mergePointDialog.value = {
      visible: false,
      targetId: '',
    }
  }

  const openRegularPolygonDialog = (firstPointId: string, secondPointId: string) => {
    regularPolygonDialog.value = {
      visible: true,
      firstPointId,
      secondPointId,
      vertexCount: 5,
    }
  }

  const closeRegularPolygonDialog = () => {
    regularPolygonDialog.value = {
      visible: false,
      firstPointId: '',
      secondPointId: '',
      vertexCount: 5,
    }
  }

  const openNormalCircleRadiusDialog = () => {
    normalCircleRadiusDialog.value = {
      visible: true,
      radius: 1,
    }
  }

  const closeNormalCircleRadiusDialog = () => {
    normalCircleRadiusDialog.value = {
      visible: false,
      radius: 1,
    }
  }

  const openRadiusSphereDialog = (centerPointId: string) => {
    radiusSphereDialog.value = {
      visible: true,
      centerPointId,
      radius: 1,
    }
  }

  const closeRadiusSphereDialog = () => {
    radiusSphereDialog.value = {
      visible: false,
      centerPointId: '',
      radius: 1,
    }
  }

  const setMergePointTargetId = (targetId: string) => {
    mergePointDialog.value = {
      ...mergePointDialog.value,
      targetId,
    }
  }

  const closeAllToolbarMenus = () => {
    toolbarMenus.value = {
      deleteOpen: false,
      pointOpen: false,
      lineOpen: false,
      circleOpen: false,
      polygonOpen: false,
      solidOpen: false,
    }
  }

  const setToolbarMenuOpen = (
    menu: 'deleteOpen' | 'pointOpen' | 'lineOpen' | 'circleOpen' | 'polygonOpen' | 'solidOpen',
    value: boolean,
    options?: { exclusive?: boolean },
  ) => {
    const exclusive = options?.exclusive ?? true
    if (exclusive && value) {
      closeAllToolbarMenus()
    }
    toolbarMenus.value = {
      ...toolbarMenus.value,
      [menu]: value,
    }
  }

  const toggleToolbarMenu = (
    menu: 'deleteOpen' | 'pointOpen' | 'lineOpen' | 'circleOpen' | 'polygonOpen' | 'solidOpen',
  ) => {
    const next = !toolbarMenus.value[menu]
    setToolbarMenuOpen(menu, next, { exclusive: true })
  }

  const setContentGroupsCollapsed = (collapsed: boolean) => {
    contentGroupsCollapsed.value = {
      point: collapsed,
      line: collapsed,
      straightLine: collapsed,
      ray: collapsed,
      vector: collapsed,
      circle: collapsed,
      face: collapsed,
      hexahedron: collapsed,
      tetrahedron: collapsed,
      sphere: collapsed,
    }
  }

  const setContentGroupCollapsed = (group: ContentGroupKey, collapsed: boolean) => {
    contentGroupsCollapsed.value = {
      ...contentGroupsCollapsed.value,
      [group]: collapsed,
    }
  }

  const toggleContentGroup = (group: ContentGroupKey) => {
    setContentGroupCollapsed(group, !contentGroupsCollapsed.value[group])
  }

  const resetUiState = () => {
    isTouchDevice.value = false
    isCompactLineEditor.value = false
    fps.value = 0
    axisGridSize.value = 10
    isGridVisible.value = true
    isCoordinateSystemVisible.value = true
    isGlobalPointValueMode.value = false
    isARMode.value = false
    lastModeBeforeAR.value = null
    lastModeBeforeCoordinateOff.value = null
    clearToast()
    closeMergePointDialog()
    closeRegularPolygonDialog()
    closeNormalCircleRadiusDialog()
    closeRadiusSphereDialog()
    closeAllToolbarMenus()
    contentGroupsCollapsed.value = createContentGroupsCollapsed()
    hasAutoCollapsedContentGroups.value = false
  }

  return {
    isTouchDevice,
    isCompactLineEditor,
    fps,
    axisGridSize,
    isGridVisible,
    isCoordinateSystemVisible,
    isGlobalPointValueMode,
    isARMode,
    lastModeBeforeAR,
    lastModeBeforeCoordinateOff,
    toastMessage,
    toastVisible,
    toastScope,
    mergePointDialog,
    regularPolygonDialog,
    normalCircleRadiusDialog,
    radiusSphereDialog,
    toolbarMenus,
    contentGroupsCollapsed,
    hasAutoCollapsedContentGroups,
    anyToolbarMenuOpen,
    openToast,
    closeToast,
    clearToast,
    setTouchDevice,
    setCompactLineEditor,
    setFps,
    setAxisGridSize,
    setGridVisible,
    toggleGridVisible,
    setCoordinateSystemVisible,
    setGlobalPointValueMode,
    toggleGlobalPointValueMode,
    setARMode,
    setLastModeBeforeAR,
    setLastModeBeforeCoordinateOff,
    openMergePointDialog,
    closeMergePointDialog,
    openRegularPolygonDialog,
    closeRegularPolygonDialog,
    openNormalCircleRadiusDialog,
    closeNormalCircleRadiusDialog,
    openRadiusSphereDialog,
    closeRadiusSphereDialog,
    setMergePointTargetId,
    closeAllToolbarMenus,
    setToolbarMenuOpen,
    toggleToolbarMenu,
    setContentGroupsCollapsed,
    setContentGroupCollapsed,
    toggleContentGroup,
    resetUiState,
  }
})
