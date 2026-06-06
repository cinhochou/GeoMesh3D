import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { EditorMode } from '@/core/editor/Editor'

export type ToastScope = 'global' | 'viewport'

export type SettingsCategory = 'graphics' | 'performance' | 'display' | 'advanced' | 'interaction'

// GPU 偏好选项：默认 / 高性能
export type PowerPreference = 'default' | 'high-performance'

export interface AppSettings {
  antialias: boolean
  pixelRatioScale: number
  fpsCap: number
  powerPreference: PowerPreference
  depthOcclusion: boolean
  hiddenEdge: boolean
  confirmBeforeDelete: boolean
  autoSaveProject: boolean
  draftProtection: boolean
  enableSnapping: boolean
  globalPointValue: boolean
}

const APP_SETTINGS_KEY = 'geomesh3d-settings'

const defaultAppSettings: AppSettings = {
  antialias: false,
  pixelRatioScale: 1.0,
  fpsCap: 0,
  powerPreference: 'default',
  depthOcclusion: true,
  hiddenEdge: true,
  confirmBeforeDelete: false,
  autoSaveProject: true,
  draftProtection: true,
  enableSnapping: false,
  globalPointValue: false,
}

function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY)
    if (!raw) return { ...defaultAppSettings }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      antialias: typeof parsed.antialias === 'boolean' ? parsed.antialias : defaultAppSettings.antialias,
      pixelRatioScale:
        typeof parsed.pixelRatioScale === 'number'
          ? Math.min(1.0, Math.max(0.5, parsed.pixelRatioScale))
          : defaultAppSettings.pixelRatioScale,
      fpsCap: [0, 30, 60, 90, 120].includes(parsed.fpsCap as number) ? (parsed.fpsCap as number) : defaultAppSettings.fpsCap,
      powerPreference:
        parsed.powerPreference === 'high-performance' ? 'high-performance' : defaultAppSettings.powerPreference,
      depthOcclusion: typeof parsed.depthOcclusion === 'boolean' ? parsed.depthOcclusion : defaultAppSettings.depthOcclusion,
      hiddenEdge: typeof parsed.hiddenEdge === 'boolean' ? parsed.hiddenEdge : defaultAppSettings.hiddenEdge,
      confirmBeforeDelete: typeof parsed.confirmBeforeDelete === 'boolean' ? parsed.confirmBeforeDelete : defaultAppSettings.confirmBeforeDelete,
      autoSaveProject: typeof parsed.autoSaveProject === 'boolean' ? parsed.autoSaveProject : defaultAppSettings.autoSaveProject,
      draftProtection: typeof parsed.draftProtection === 'boolean' ? parsed.draftProtection : defaultAppSettings.draftProtection,
      enableSnapping: typeof parsed.enableSnapping === 'boolean' ? parsed.enableSnapping : defaultAppSettings.enableSnapping,
      globalPointValue: typeof parsed.globalPointValue === 'boolean' ? parsed.globalPointValue : defaultAppSettings.globalPointValue,
    }
  } catch {
    return { ...defaultAppSettings }
  }
}

function saveAppSettings(settings: AppSettings) {
  try {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

type ContentGroupKey =
  | 'point'
  | 'line'
  | 'straightLine'
  | 'perpendicularLine'
  | 'parallelLine'
  | 'ray'
  | 'vector'
  | 'circle'
  | 'face'
  | 'hexahedron'
  | 'tetrahedron'
  | 'sphere'
  | 'cone'
  | 'cylinder'

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

interface ConeRadiusDialogState {
  visible: boolean
  baseCenterPointId: string
  apexPointId: string
  radius: number
}

interface CylinderRadiusDialogState {
  visible: boolean
  bottomCenterPointId: string
  topCenterPointId: string
  radius: number
}

interface ContentGroupCollapseState {
  point: boolean
  line: boolean
  straightLine: boolean
  perpendicularLine: boolean
  parallelLine: boolean
  ray: boolean
  vector: boolean
  circle: boolean
  face: boolean
  hexahedron: boolean
  tetrahedron: boolean
  sphere: boolean
  cone: boolean
  cylinder: boolean
}

const createContentGroupsCollapsed = (): ContentGroupCollapseState => ({
  point: false,
  line: false,
  straightLine: false,
  perpendicularLine: false,
  parallelLine: false,
  ray: false,
  vector: false,
  circle: false,
  face: false,
  hexahedron: false,
  tetrahedron: false,
  sphere: false,
  cone: false,
  cylinder: false,
})

export const useUiStore = defineStore('ui', () => {
  const isTouchDevice = ref(false)
  const isCompactLineEditor = ref(false)

  const fps = ref(0)
  const axisGridSize = ref(10)
  const isGridVisible = ref(true)
  const isCoordinateSystemVisible = ref(true)
  const isARMode = ref(false)
  const lastModeBeforeAR = ref<EditorMode | null>(null)
  const lastModeBeforeCoordinateOff = ref<EditorMode | null>(null)

  const isGlobalPointValueMode = computed(() => appSettings.value.globalPointValue)
  const isSnappingEnabled = computed(() => appSettings.value.enableSnapping)

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

  const coneRadiusDialog = ref<ConeRadiusDialogState>({
    visible: false,
    baseCenterPointId: '',
    apexPointId: '',
    radius: 1,
  })

  const cylinderRadiusDialog = ref<CylinderRadiusDialogState>({
    visible: false,
    bottomCenterPointId: '',
    topCenterPointId: '',
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

  const appSettings = ref<AppSettings>(loadAppSettings())
  const isSettingsPanelOpen = ref(false)

  watch(
    appSettings,
    (settings) => {
      saveAppSettings(settings)
    },
    { deep: true },
  )

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
    appSettings.value.globalPointValue = value
  }

  const toggleGlobalPointValueMode = () => {
    appSettings.value.globalPointValue = !appSettings.value.globalPointValue
  }

  const setSnappingEnabled = (value: boolean) => {
    appSettings.value.enableSnapping = value
  }

  const toggleSnappingEnabled = () => {
    appSettings.value.enableSnapping = !appSettings.value.enableSnapping
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

  const openConeRadiusDialog = (baseCenterPointId: string, apexPointId: string) => {
    coneRadiusDialog.value = {
      visible: true,
      baseCenterPointId,
      apexPointId,
      radius: 1,
    }
  }

  const closeConeRadiusDialog = () => {
    coneRadiusDialog.value = {
      visible: false,
      baseCenterPointId: '',
      apexPointId: '',
      radius: 1,
    }
  }

  const openCylinderRadiusDialog = (bottomCenterPointId: string, topCenterPointId: string) => {
    cylinderRadiusDialog.value = {
      visible: true,
      bottomCenterPointId,
      topCenterPointId,
      radius: 1,
    }
  }

  const closeCylinderRadiusDialog = () => {
    cylinderRadiusDialog.value = {
      visible: false,
      bottomCenterPointId: '',
      topCenterPointId: '',
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
      perpendicularLine: collapsed,
      parallelLine: collapsed,
      ray: collapsed,
      vector: collapsed,
      circle: collapsed,
      face: collapsed,
      hexahedron: collapsed,
      tetrahedron: collapsed,
      sphere: collapsed,
      cone: collapsed,
      cylinder: collapsed,
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
    appSettings.value.globalPointValue = false
    appSettings.value.enableSnapping = false
    isARMode.value = false
    lastModeBeforeAR.value = null
    lastModeBeforeCoordinateOff.value = null
    clearToast()
    closeMergePointDialog()
    closeRegularPolygonDialog()
    closeNormalCircleRadiusDialog()
    closeRadiusSphereDialog()
    closeConeRadiusDialog()
    closeCylinderRadiusDialog()
    closeAllToolbarMenus()
    contentGroupsCollapsed.value = createContentGroupsCollapsed()
    hasAutoCollapsedContentGroups.value = false
  }

  const openSettingsPanel = () => {
    isSettingsPanelOpen.value = true
  }

  const closeSettingsPanel = () => {
    isSettingsPanelOpen.value = false
  }

  const setAppSettings = (settings: Partial<AppSettings>) => {
    appSettings.value = {
      ...appSettings.value,
      ...settings,
    }
  }

  const resetAppSettings = () => {
    appSettings.value = { ...defaultAppSettings }
  }

  return {
    isTouchDevice,
    isCompactLineEditor,
    fps,
    axisGridSize,
    isGridVisible,
    isCoordinateSystemVisible,
    isGlobalPointValueMode,
    isSnappingEnabled,
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
    coneRadiusDialog,
    cylinderRadiusDialog,
    toolbarMenus,
    contentGroupsCollapsed,
    hasAutoCollapsedContentGroups,
    anyToolbarMenuOpen,
    appSettings,
    isSettingsPanelOpen,
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
    setSnappingEnabled,
    toggleSnappingEnabled,
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
    openConeRadiusDialog,
    closeConeRadiusDialog,
    openCylinderRadiusDialog,
    closeCylinderRadiusDialog,
    setMergePointTargetId,
    closeAllToolbarMenus,
    setToolbarMenuOpen,
    toggleToolbarMenu,
    setContentGroupsCollapsed,
    setContentGroupCollapsed,
    toggleContentGroup,
    resetUiState,
    openSettingsPanel,
    closeSettingsPanel,
    setAppSettings,
    resetAppSettings,
  }
})