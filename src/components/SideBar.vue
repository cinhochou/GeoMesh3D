<!-- src/components/SideBar.vue -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Scene } from '../core/scene/Scene'
import { Editor } from '../core/editor/Editor'
import { Vec3 } from '../core/geometry/Vec3'
import type { Point3 } from '../core/geometry/Point3'
import type { Line3 } from '../core/geometry/Line3'
import type { Circle3 } from '../core/geometry/Circle3'
import type { Sphere3 } from '../core/geometry/Sphere3'
import type { Cone3 } from '../core/geometry/Cone3'
import type { Cylinder3 } from '../core/geometry/Cylinder3'
import type { Ray3 } from '../core/geometry/Ray3'
import type { GeoVector3 } from '../core/geometry/GeoVector3'
import type { StraightLine3 } from '../core/geometry/StraightLine3'
import type { PerpendicularLine3 } from '../core/geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../core/geometry/ParallelLine3'
import type { PlanarPolygon } from '../core/geometry/PlanarPolygon'

import type { ParametricRange } from '../core/constraints/ObjectConstrainedPointConstraint'
import { useUiStore } from '@/store/uiStore'
import { useSceneStore } from '@/store/sceneStore'

const props = defineProps<{
  scene: Scene
  editor: Editor
}>()

const uiStore = useUiStore()
const sceneStore = useSceneStore()
const {
  isCompactLineEditor,
  contentGroupsCollapsed,
  hasAutoCollapsedContentGroups,
  appSettings,
} = storeToRefs(uiStore)
const { modeName, modeHint } = storeToRefs(sceneStore)
const collapsedContentGroups = computed(() => contentGroupsCollapsed.value)
const showHiddenPointHint = ref(false)
const showHiddenLineHint = ref(false)
const hiddenPointHintPinned = ref(false)
const hiddenLineHintPinned = ref(false)
const hiddenPointHintTriggerRef = ref<HTMLElement | null>(null)
const hiddenLineHintTriggerRef = ref<HTMLElement | null>(null)
const hiddenPointHintPopoverRef = ref<HTMLElement | null>(null)
const hiddenLineHintPopoverRef = ref<HTMLElement | null>(null)
const hiddenPointHintStyle = ref<Record<string, string>>({})
const hiddenLineHintStyle = ref<Record<string, string>>({})
let hintRafId = 0

const isTriggerVisible = (el: HTMLElement | null): boolean => {
  if (!el) return false
  const container = el.closest('.content-box')
  if (!container) return true
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return elRect.bottom > containerRect.top && elRect.top < containerRect.bottom
}

const updateHintPositions = () => {
  if (showHiddenPointHint.value) {
    const el = hiddenPointHintTriggerRef.value
    if (el && isTriggerVisible(el)) {
      const rect = el.getBoundingClientRect()
      hiddenPointHintStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
      }
    } else {
      showHiddenPointHint.value = false
      hiddenPointHintPinned.value = false
    }
  }
  if (showHiddenLineHint.value) {
    const el = hiddenLineHintTriggerRef.value
    if (el && isTriggerVisible(el)) {
      const rect = el.getBoundingClientRect()
      hiddenLineHintStyle.value = {
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
      }
    } else {
      showHiddenLineHint.value = false
      hiddenLineHintPinned.value = false
    }
  }
  if (showHiddenPointHint.value || showHiddenLineHint.value) {
    hintRafId = requestAnimationFrame(updateHintPositions)
  }
}

watch([showHiddenPointHint, showHiddenLineHint], ([showPoint, showLine]) => {
  if (showPoint || showLine) {
    cancelAnimationFrame(hintRafId)
    updateHintPositions()
    hintRafId = requestAnimationFrame(updateHintPositions)
  } else {
    cancelAnimationFrame(hintRafId)
  }
})

const dismissHintPopovers = (e: MouseEvent | TouchEvent) => {
  const target = e.target as HTMLElement | null
  if (!target) return
  if (target.closest('.hidden-hint-trigger') || target.closest('.hidden-hint-popover')) return
  if (hiddenPointHintPinned.value) {
    hiddenPointHintPinned.value = false
    showHiddenPointHint.value = false
  }
  if (hiddenLineHintPinned.value) {
    hiddenLineHintPinned.value = false
    showHiddenLineHint.value = false
  }
}

const isAllGroupsCollapsed = ref(true)
const toggleAllContentGroups = () => {
  if (isAllGroupsCollapsed.value) {
    setContentGroupsCollapsed(false)
    isAllGroupsCollapsed.value = false
  } else {
    setContentGroupsCollapsed(true)
    isAllGroupsCollapsed.value = true
  }
}

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
const selectedStraightLines = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.straightLines]
    .map((id) => props.scene.straightLines.get(id))
    .filter((line): line is StraightLine3 => line !== undefined)
})
const selectedPerpendicularLines = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.perpendicularLines]
    .map((id) => props.scene.perpendicularLines.get(id))
    .filter((line): line is PerpendicularLine3 => line !== undefined)
})
const selectedParallelLines = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.parallelLines]
    .map((id) => props.scene.parallelLines.get(id))
    .filter((line): line is ParallelLine3 => line !== undefined)
})
const selectedRays = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.rays]
    .map((id) => props.scene.rays.get(id))
    .filter((ray): ray is Ray3 => ray !== undefined)
})
const selectedVectors = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.vectors]
    .map((id) => props.scene.vectors.get(id))
    .filter((vector): vector is GeoVector3 => vector !== undefined)
})
const selectedFaces = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.faces]
    .map((id) => props.scene.faces.get(id))
    .filter((face): face is PlanarPolygon => face !== undefined)
})
const selectedCircles = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.circles]
    .map((id) => props.scene.circles.get(id))
    .filter((circle): circle is Circle3 => circle !== undefined)
})
const selectedSpheres = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.spheres]
    .map((id) => props.scene.spheres.get(id))
    .filter((sphere): sphere is Sphere3 => sphere !== undefined)
})
const selectedCones = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.cones]
    .map((id) => props.scene.cones.get(id))
    .filter((cone): cone is Cone3 => cone !== undefined)
})
const selectedCylinders = computed(() => {
  void commandRevision.value
  return [...props.scene.selection.cylinders]
    .map((id) => props.scene.cylinders.get(id))
    .filter((cylinder): cylinder is Cylinder3 => cylinder !== undefined)
})
const isConstrainedPoint = (point: Point3) =>
  (point.cubeId !== null && point.cubeRole === 'dependent') ||
  (point.regularPolygonId !== null && point.regularPolygonRole === 'dependent')

const pointsInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.points.values()].filter((p) => !isConstrainedPoint(p))
})
const linesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.lines.values()].filter((l) => !l.faceOwned)
})
const hasHiddenConstrainedPoints = computed(() => {
  void commandRevision.value
  return [...props.scene.points.values()].some((p) => isConstrainedPoint(p))
})
const hasHiddenConstrainedLines = computed(() => {
  void commandRevision.value
  return [...props.scene.lines.values()].some((l) => l.faceOwned)
})
const straightLinesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.straightLines.values()]
})
const perpendicularLinesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.perpendicularLines.values()]
})
const parallelLinesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.parallelLines.values()]
})
const raysInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.rays.values()]
})
const vectorsInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.vectors.values()]
})
const facesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.faces.values()]
})
const circlesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.circles.values()]
})
const spheresInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.spheres.values()]
})
const conesInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.cones.values()]
})
const cylindersInScene = computed(() => {
  void commandRevision.value
  return [...props.scene.cylinders.values()]
})
const hexahedronsInScene = computed(() => {
  void commandRevision.value
  return props.editor.getCubeConstraints()
})
const regularPolygonsInScene = computed(() => {
  void commandRevision.value
  return props.editor.getRegularPolygonConstraints()
})
const fullySelectedHexahedronIds = computed(() => {
  void commandRevision.value
  return hexahedronsInScene.value
    .filter((cube) => cube.faceIds.every((faceId) => props.scene.selection.faces.has(faceId)))
    .map((cube) => cube.cubeId)
})
const selectedHexahedrons = computed(() => {
  void commandRevision.value
  return fullySelectedHexahedronIds.value
    .map((cubeId) => props.editor.getCubeConstraint(cubeId))
    .filter(
      (constraint): constraint is NonNullable<ReturnType<typeof props.editor.getCubeConstraint>> =>
        constraint !== null,
    )
})
const prismsInScene = computed(() => {
  void commandRevision.value
  return props.editor.getPrismConstraints()
})
const fullySelectedPrismIds = computed(() => {
  void commandRevision.value
  return prismsInScene.value
    .filter((prism) =>
      props.editor.getPrismFaceIds(prism.prismId).every((faceId) =>
        props.scene.selection.faces.has(faceId),
      ),
    )
    .map((prism) => prism.prismId)
})
const selectedPrisms = computed(() => {
  void commandRevision.value
  return fullySelectedPrismIds.value
    .map((prismId) => props.editor.getPrismConstraint(prismId))
    .filter(
      (constraint): constraint is NonNullable<ReturnType<typeof props.editor.getPrismConstraint>> =>
        constraint !== null,
    )
})
const pyramidsInScene = computed(() => {
  void commandRevision.value
  return props.editor.getPyramidConstraints()
})
const fullySelectedPyramidIds = computed(() => {
  void commandRevision.value
  return pyramidsInScene.value
    .filter((pyramid) =>
      props.editor.getPyramidFaceIds(pyramid.pyramidId).every((faceId) =>
        props.scene.selection.faces.has(faceId),
      ),
    )
    .map((pyramid) => pyramid.pyramidId)
})
const selectedPyramids = computed(() => {
  void commandRevision.value
  return fullySelectedPyramidIds.value
    .map((pyramidId) => props.editor.getPyramidConstraint(pyramidId))
    .filter(
      (constraint): constraint is NonNullable<ReturnType<typeof props.editor.getPyramidConstraint>> =>
        constraint !== null,
    )
})
const selectedRegularPolygons = computed(() => {
  void commandRevision.value
  return regularPolygonsInScene.value.filter((constraint) =>
    props.scene.selection.faces.has(constraint.faceId),
  )
})
const selectedEditableFaces = computed(() =>
  selectedFaces.value.filter(
    (face) =>
      (!face.cubeId || !fullySelectedHexahedronIds.value.includes(face.cubeId)) &&
      !face.regularPolygonId &&
      (!face.prismId || !fullySelectedPrismIds.value.includes(face.prismId)) &&
      (!face.pyramidId || !fullySelectedPyramidIds.value.includes(face.pyramidId)),
  ),
)

const editing = ref<{
  type:
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
    | 'regularPolygon'
    | 'prism'
    | 'pyramid'
    | 'sphere'
    | 'cone'
    | 'cylinder'
  id: string
} | null>(null)

const showDeleteConfirmDialog = ref(false)
const deleteConfirmTarget = ref<{ type: string; id: string; name: string } | null>(null)

const deleteByType: Record<string, (editor: Editor, id: string) => void> = {
  point: (e, id) => e.deletePoint(id),
  line: (e, id) => e.deleteLine(id),
  straightLine: (e, id) => e.deleteStraightLine(id),
  perpendicularLine: (e, id) => e.deletePerpendicularLine(id),
  parallelLine: (e, id) => e.deleteParallelLine(id),
  ray: (e, id) => e.deleteRay(id),
  vector: (e, id) => e.deleteVector(id),
  circle: (e, id) => e.deleteCircle(id),
  sphere: (e, id) => e.deleteSphere(id),
  cone: (e, id) => e.deleteCone(id),
  cylinder: (e, id) => e.deleteCylinder(id),
  face: (e, id) => e.deleteFace(id),
}

const handleDeleteElement = (type: string, id: string, name: string) => {
  if (appSettings.value.confirmBeforeDelete) {
    deleteConfirmTarget.value = { type, id, name }
    showDeleteConfirmDialog.value = true
  } else {
    deleteByType[type]?.(props.editor, id)
  }
}

const confirmDeleteElement = () => {
  if (deleteConfirmTarget.value) {
    deleteByType[deleteConfirmTarget.value.type]?.(props.editor, deleteConfirmTarget.value.id)
  }
  showDeleteConfirmDialog.value = false
  deleteConfirmTarget.value = null
}

const cancelDeleteElement = () => {
  showDeleteConfirmDialog.value = false
  deleteConfirmTarget.value = null
}

const isPointCoordinateLocked = (point: Point3 | undefined) =>
  Boolean(point && props.editor.isPointCoordinateLocked(point))
const isLineEndpointCoordinateLocked = (line: Line3 | undefined, point: Point3 | undefined) =>
  Boolean(line && point && (props.editor.isLineLocked(line) || isPointCoordinateLocked(point)))
const isRayEndpointCoordinateLocked = (ray: Ray3 | undefined, point: Point3 | undefined) =>
  Boolean(ray && point && (props.editor.isRayLocked(ray) || isPointCoordinateLocked(point)))
const isVectorEndpointCoordinateLocked = (
  vector: GeoVector3 | undefined,
  point: Point3 | undefined,
) =>
  Boolean(
    vector && point && (props.editor.isVectorLocked(vector) || isPointCoordinateLocked(point)),
  )
const isStraightLineEndpointCoordinateLocked = (
  line: StraightLine3 | undefined,
  point: Point3 | undefined,
) =>
  Boolean(
    line && point && (props.editor.isStraightLineLocked(line) || isPointCoordinateLocked(point)),
  )
const isLineConstraintLocked = (line: Line3 | undefined) =>
  Boolean(
    line &&
      (props.editor.isLineLocked(line) ||
        (isPointCoordinateLocked(line.p1) && isPointCoordinateLocked(line.p2))),
  )
const hasCubeConstraint = (point: Point3 | undefined) =>
  Boolean(point?.cubeId && point?.cubeRole === 'dependent')
const hasPrismConstraint = (point: Point3 | undefined) =>
  Boolean(point?.prismId && point?.prismRole === 'dependent')
const hasPyramidConstraint = (point: Point3 | undefined) =>
  Boolean(point?.pyramidId && point?.pyramidRole === 'dependent')
const hasRegularPolygonConstraint = (point: Point3 | undefined) => Boolean(point?.regularPolygonId)
const hasCircleConstraint = (point: Point3 | undefined) =>
  Boolean(point?.circleId && point?.circleRole === 'center')
const FACE_CONSTRAINT_BADGE: Record<string, string> = {
  polygon: '多边形约束',
  regularPolygon: '正多边形约束',
  hexahedron: '正六面体约束',
  tetrahedron: '正四面体约束',
  prism: '棱柱约束',
  pyramid: '棱锥约束',
}
const POINT_CONSTRAINT_BADGE: Record<string, string> = {
  line: '线段约束',
  straightLine: '直线约束',
  ray: '射线约束',
  vector: '向量约束',
  circle: '圆约束',
  face: '面约束',
  sphere: '球面约束',
  cone: '锥面约束',
  coneBase: '锥底约束',
  cylinder: '柱面约束',
  cylinderBottom: '柱底约束',
  cylinderTop: '柱顶约束',
  perpendicularLine: '垂线约束',
  parallelLine: '平行线约束',
  xAxis: 'X轴约束',
  yAxis: 'Y轴约束',
  zAxis: 'Z轴约束',
}
const getPointConstraintBadge = (point: Point3 | undefined): string => {
  if (!point?.constrainedTo) return ''
  const type = point.constrainedTo.type
  if (type === 'circle') {
    const circle = props.scene.circles.get(point.constrainedTo.id)
    if (circle?.isNormalCircle()) {
      for (const cone of props.scene.cones.values()) {
        if (cone.normalCircleId === circle.id) return '锥底约束'
      }
      for (const cylinder of props.scene.cylinders.values()) {
        if (cylinder.normalCircleId === circle.id) return '柱底约束'
        if (cylinder.topNormalCircleId === circle.id) return '柱顶约束'
      }
    }
  }
  return POINT_CONSTRAINT_BADGE[type] ?? ''
}
const getLineConstraintBadge = (line: Line3 | undefined): string => {
  if (!line?.faceConstraintType) return ''
  return FACE_CONSTRAINT_BADGE[line.faceConstraintType] ?? ''
}
const getCircleCenterPoint = (circleId: string) =>
  [...props.scene.points.values()].find((p) => p.circleId === circleId && p.circleRole === 'center')
const isCubeFace = (face: PlanarPolygon | undefined) => Boolean(face?.cubeId)
const isPrismFace = (face: PlanarPolygon | undefined) => Boolean(face?.prismId)
const isPyramidFace = (face: PlanarPolygon | undefined) => Boolean(face?.pyramidId)

const getConeForNormalCircle = (circle: Circle3) => {
  if (!circle.isNormalCircle()) return null
  for (const cone of props.scene.cones.values()) {
    if (cone.normalCircleId === circle.id) return cone
  }
  return null
}

const getCylinderForNormalCircle = (circle: Circle3) => {
  if (!circle.isNormalCircle()) return null
  for (const cylinder of props.scene.cylinders.values()) {
    if (cylinder.normalCircleId === circle.id || cylinder.topNormalCircleId === circle.id)
      return cylinder
  }
  return null
}

const DIRECTION_TYPE_COLLECTION: Record<
  string,
  Map<string, { p1: { position: Vec3 }; p2: { position: Vec3 } }>
> = {
  line: props.scene.lines,
  straightLine: props.scene.straightLines,
  perpendicularLine: props.scene.perpendicularLines,
  parallelLine: props.scene.parallelLines,
  ray: props.scene.rays,
  vector: props.scene.vectors,
}

const resolveDirectionVec = (circle: Circle3): Vec3 | null => {
  const cone = getConeForNormalCircle(circle)
  if (cone) {
    const center = cone.baseCenterPoint.position
    const apex = cone.apexPoint.position
    return new Vec3(apex.x - center.x, apex.y - center.y, apex.z - center.z)
  }
  const cylinder = getCylinderForNormalCircle(circle)
  if (cylinder) {
    const bottomCenter = cylinder.bottomCenterPoint.position
    const topCenter = cylinder.topCenterPoint.position
    return new Vec3(
      topCenter.x - bottomCenter.x,
      topCenter.y - bottomCenter.y,
      topCenter.z - bottomCenter.z,
    )
  }
  if (!circle.directionType) return null
  if (circle.directionType === 'point') return new Vec3(0, 1, 0)
  const directionId = circle.directionId
  if (!directionId) return null
  const collection = DIRECTION_TYPE_COLLECTION[circle.directionType]
  const obj = collection?.get(directionId)
  if (!obj) return null
  return new Vec3(
    obj.p2.position.x - obj.p1.position.x,
    obj.p2.position.y - obj.p1.position.y,
    obj.p2.position.z - obj.p1.position.z,
  )
}

const DIRECTION_TYPE_LABEL: Record<string, string> = {
  line: '线段',
  straightLine: '直线',
  perpendicularLine: '垂线',
  parallelLine: '平行线',
  ray: '射线',
  vector: '向量',
}

const getDirectionLabel = (circle: Circle3): string => {
  const cone = getConeForNormalCircle(circle)
  if (cone) {
    return `点${cone.baseCenterPoint.name ?? ''}-点${cone.apexPoint.name ?? ''}`
  }
  const cylinder = getCylinderForNormalCircle(circle)
  if (cylinder) {
    return `点${cylinder.bottomCenterPoint.name ?? ''}-点${cylinder.topCenterPoint.name ?? ''}`
  }
  if (!circle.directionType) return '未知'
  if (circle.directionType === 'point') {
    const pt = circle.directionId ? props.scene.points.get(circle.directionId) : null
    return `点${pt?.name ?? ''} · XOZ平面`
  }
  const directionId = circle.directionId
  const typeName = DIRECTION_TYPE_LABEL[circle.directionType] ?? ''
  const collection = DIRECTION_TYPE_COLLECTION[circle.directionType]
  const obj = directionId ? collection?.get(directionId) : undefined
  const directionName = (obj as { name?: string } | undefined)?.name ?? ''
  return `${typeName} ${directionName}`
}

const getNormalCircleRadius = (circle: Circle3): number => {
  if (!circle.isNormalCircle()) return circle.getRadius()
  return circle.getRadius(resolveDirectionVec(circle))
}

const getNormalCircleArea = (circle: Circle3): number => {
  if (!circle.isNormalCircle()) return circle.getArea()
  return circle.getArea(resolveDirectionVec(circle))
}

const getNormalCircleCircumference = (circle: Circle3): number => {
  if (!circle.isNormalCircle()) return circle.getCircumference()
  return circle.getCircumference(resolveDirectionVec(circle))
}

const formatPiCoeff = (coeff: number): string => {
  if (Math.abs(coeff) < 1e-10) return '0'
  if (Math.abs(coeff - 1) < 1e-10) return 'π'
  return `${coeff.toFixed(2)}π`
}

const formatPiCircumference = (radius: number): string => formatPiCoeff(2 * radius)

const formatPiArea = (radius: number): string => formatPiCoeff(radius * radius)

const formatPiConeVolume = (radius: number, height: number): string =>
  formatPiCoeff((1 / 3) * radius * radius * height)

const formatPiConeLateralArea = (radius: number, height: number): string => {
  const slantHeight = Math.hypot(radius, height)
  return formatPiCoeff(radius * slantHeight)
}

const formatPiConeBaseArea = (radius: number): string => formatPiCoeff(radius * radius)

const formatPiCylinderVolume = (radius: number, height: number): string =>
  formatPiCoeff(radius * radius * height)
const formatPiCylinderLateralArea = (radius: number, height: number): string =>
  formatPiCoeff(2 * radius * height)
const formatPiCylinderBaseArea = (radius: number): string => formatPiCoeff(radius * radius)
const formatPiCylinderSurfaceArea = (radius: number, height: number): string =>
  formatPiCoeff(2 * radius * height + 2 * radius * radius)

const formatPiSphereArea = (radius: number): string => formatPiCoeff(4 * radius * radius)

const formatPiSphereVolume = (radius: number): string =>
  formatPiCoeff((4 / 3) * radius * radius * radius)

const editPoint = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  x: '',
  y: '',
  z: '',
})

/** 约束点参数化编辑数据 */
const editConstrainedParams = reactive<Record<string, string>>({})
/** 约束点参数化范围缓存 */
const constrainedParamRanges = ref<ParametricRange[]>([])

/** 判断点是否有对象约束（用于决定显示参数化编辑器还是 xyz 编辑器） */
const isPointObjectConstrained = (point: Point3 | undefined): boolean => {
  return Boolean(point?.constrainedTo)
}

/** 判断点是否约束到面上（用于显示面上坐标编辑器标题） */
const isPointConstrainedToFace = (point: Point3 | undefined): boolean => {
  return point?.constrainedTo?.type === 'face'
}

/** 同步约束点参数化数据到编辑状态 */
const syncConstrainedParams = (point: Point3 | undefined) => {
  // 清空旧数据
  for (const key of Object.keys(editConstrainedParams)) {
    delete editConstrainedParams[key]
  }
  constrainedParamRanges.value = []
  if (!point?.constrainedTo) return
  const constraint = props.scene.getObjectConstrainedPointConstraint(point.id)
  if (!constraint || !constraint.parametricData) return
  const ranges = constraint.getParametricRanges()
  constrainedParamRanges.value = ranges
  for (const range of ranges) {
    const val = constraint.getParametricValue(range.key)
    editConstrainedParams[range.key] = val !== undefined ? toFixed2(val) : '0.00'
  }
}

/** 应用约束点参数化编辑（仅更新位置，不覆盖输入框值） */
const applyConstrainedParam = (key: string, direction?: 'up' | 'down') => {
  if (!editing.value || editing.value.type !== 'point') return
  const point = props.scene.points.get(editing.value.id)
  if (!point || isPointCoordinateLocked(point)) return
  const constraint = props.scene.getObjectConstrainedPointConstraint(point.id)
  if (!constraint) return
  const rawValue = Number(editConstrainedParams[key])
  if (!Number.isFinite(rawValue)) return
  hideLengthBubble(`constrained.${key}`)
  props.editor.beginCollabTransaction('UpdateConstrainedPointParam')
  const ok = constraint.setParametricValue(key, rawValue)
  props.scene.solveDirtyConstraints()
  props.scene.markAllRenderDirty()
  props.editor.commitCollabTransaction()
  if (ok && constraint.lastSetClamped) {
    const message = direction
      ? `已到达面边界，无法继续${direction === 'up' ? '增加' : '减少'}`
      : '已到达面边界'
    showLengthBubble(`constrained.${key}`, message)
  }
  editPoint.x = toFixed2(point.position.x)
  editPoint.y = toFixed2(point.position.y)
  editPoint.z = toFixed2(point.position.z)
  // 同步参数值（钳制后可能变化）
  const val = constraint.getParametricValue(key)
  if (val !== undefined) editConstrainedParams[key] = toFixed2(val)
}

/** 约束点参数增减（与普通点坐标增减行为一致，使用 stepCoordInput） */
const nudgeConstrainedParam = (key: string, direction: 'up' | 'down') => {
  const inputKey = `constrained.${key}`
  hideLengthBubble(inputKey)
  const nextValue = stepCoordInput(inputKey, direction)
  if (nextValue === null) return
  editConstrainedParams[key] = nextValue
  applyConstrainedParam(key, direction)
}

/** 约束点参数输入 focus 处理 */
const handleConstrainedParamFocus = (key: string) => {
  setCoordFocus(`constrained.${key}`, true)
}

/** 约束点参数输入 blur 处理：normalize 后 clamp 到范围，同步最终值 */
const handleConstrainedParamBlur = (key: string) => {
  editConstrainedParams[key] = normalizeCoord(editConstrainedParams[key] ?? '')
  setCoordFocus(`constrained.${key}`, false)
  applyConstrainedParam(key)
  // blur 后同步 clamp 后的最终值到输入框
  if (!editing.value || editing.value.type !== 'point') return
  const point = props.scene.points.get(editing.value.id)
  if (point) {
    const constraint = props.scene.getObjectConstrainedPointConstraint(point.id)
    if (constraint) {
      const val = constraint.getParametricValue(key)
      if (val !== undefined) editConstrainedParams[key] = toFixed2(val)
    }
  }
}
const editLine = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
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
  valueVisible: false,
  visible: true,
  userLocked: false,
  displayLength: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const editVector = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  length: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const editStraightLine = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  displayLength: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const editPerpendicularLine = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  displayLength: '',
  p1: { x: '', y: '', z: '' },
})
const editParallelLine = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  displayLength: '',
  p1: { x: '', y: '', z: '' },
})
const editFace = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  areaLocked: false,
  edgeLengths: [] as string[],
})
const circlePiModes = reactive(new Map<string, boolean>())
const getCirclePiMode = (circleId: string) => circlePiModes.get(circleId) ?? false
const toggleCirclePiMode = (circleId: string) => {
  circlePiModes.set(circleId, !getCirclePiMode(circleId))
}
const conePiModes = reactive(new Map<string, boolean>())
const getConePiMode = (coneId: string) => conePiModes.get(coneId) ?? false
const toggleConePiMode = (coneId: string) => {
  conePiModes.set(coneId, !getConePiMode(coneId))
}
const cylinderPiModes = reactive(new Map<string, boolean>())
const getCylinderPiMode = (cylinderId: string) => cylinderPiModes.get(cylinderId) ?? false
const toggleCylinderPiMode = (cylinderId: string) => {
  cylinderPiModes.set(cylinderId, !getCylinderPiMode(cylinderId))
}
const spherePiModes = reactive(new Map<string, boolean>())
const getSpherePiMode = (sphereId: string) => spherePiModes.get(sphereId) ?? false
const toggleSpherePiMode = (sphereId: string) => {
  spherePiModes.set(sphereId, !getSpherePiMode(sphereId))
}
const editCircle = reactive({
  name: '',
  nameVisible: true,
  valueVisible: false,
  visible: true,
  userLocked: false,
  centerVisible: true,
  lockedRadius: '',
  threePointRadius: '',
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
  p3: { x: '', y: '', z: '' },
})
const editHexahedron = reactive({
  nameSuffix: '',
  valueVisible: false,
  edgeLength: '',
  userLocked: false,
  edgeLengthLocked: false,
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const editPrism = reactive({
  nameSuffix: '',
  valueVisible: false,
  userLocked: false,
  keepVertical: false,
  topPoint: { x: '', y: '', z: '' },
  height: '',
  bottomEdgeLengths: [] as string[],
})
const editPyramid = reactive({
  nameSuffix: '',
  valueVisible: false,
  userLocked: false,
  keepVertical: false,
  apexPoint: { x: '', y: '', z: '' },
  height: '',
  bottomEdgeLengths: [] as string[],
})
const editRegularPolygon = reactive({
  nameSuffix: '',
  nameVisible: false,
  valueVisible: false,
  edgeLength: '',
  userLocked: false,
  edgeLengthLocked: false,
  p1: { x: '', y: '', z: '' },
  p2: { x: '', y: '', z: '' },
})
const editSphere = reactive({
  nameSuffix: '',
  nameVisible: false,
  valueVisible: false,
  userLocked: false,
  radius: '',
  centerPoint: { x: '', y: '', z: '' },
  radiusPoint: { x: '', y: '', z: '' },
})
const editCone = reactive({
  nameSuffix: '',
  nameVisible: false,
  valueVisible: false,
  userLocked: false,
  radius: '',
  height: '',
  baseCenterPoint: { x: '', y: '', z: '' },
  apexPoint: { x: '', y: '', z: '' },
})
const editCylinder = reactive({
  nameSuffix: '',
  nameVisible: false,
  valueVisible: false,
  userLocked: false,
  radius: '',
  height: '',
  bottomCenterPoint: { x: '', y: '', z: '' },
  topCenterPoint: { x: '', y: '', z: '' },
})
const focusedCoord = reactive<Record<string, boolean>>({})
const coordInputs = new Map<string, HTMLInputElement>()
const splitPaneRef = ref<HTMLElement | null>(null)
const splitPaneDividerRef = ref<HTMLElement | null>(null)
const selectedPaneHeight = ref(240)
const isDraggingSplitPane = ref(false)
const isSplitPaneEnabled = ref(true)
const MIN_SELECTED_PANE_HEIGHT = 120
const MIN_CONTENT_PANE_HEIGHT = 160

const selectedPointIds = computed(() => selectedPoints.value.map((p) => p?.id).filter(Boolean))
const selectedLineIds = computed(() => selectedLines.value.map((l) => l?.id).filter(Boolean))
const selectedStraightLineIds = computed(() =>
  selectedStraightLines.value.map((l) => l?.id).filter(Boolean),
)
const selectedPerpendicularLineIds = computed(() =>
  selectedPerpendicularLines.value.map((l) => l?.id).filter(Boolean),
)
const selectedParallelLineIds = computed(() =>
  selectedParallelLines.value.map((l) => l?.id).filter(Boolean),
)
const selectedRayIds = computed(() => selectedRays.value.map((r) => r?.id).filter(Boolean))
const selectedVectorIds = computed(() => selectedVectors.value.map((v) => v?.id).filter(Boolean))
const selectedEditableFaceIds = computed(() =>
  selectedEditableFaces.value.map((f) => f?.id).filter(Boolean),
)
const selectedFaceIds = computed(() => selectedFaces.value.map((f) => f?.id).filter(Boolean))
const selectedCircleIds = computed(() => selectedCircles.value.map((c) => c?.id).filter(Boolean))
const selectedHexahedronIds = computed(() => selectedHexahedrons.value.map((cube) => cube.cubeId))
const selectedPrismIds = computed(() => selectedPrisms.value.map((prism) => prism.prismId))
const selectedPyramidIds = computed(() =>
  selectedPyramids.value.map((pyramid) => pyramid.pyramidId),
)
const selectedSphereIds = computed(() => selectedSpheres.value.map((s) => s?.id).filter(Boolean))
const selectedConeIds = computed(() => selectedCones.value.map((c) => c?.id).filter(Boolean))
const selectedCylinderIds = computed(() =>
  selectedCylinders.value.map((c) => c?.id).filter(Boolean),
)
const totalContentCount = computed(
  () =>
    pointsInScene.value.length +
    linesInScene.value.length +
    straightLinesInScene.value.length +
    perpendicularLinesInScene.value.length +
    parallelLinesInScene.value.length +
    raysInScene.value.length +
    vectorsInScene.value.length +
    circlesInScene.value.length +
    facesInScene.value.length +
    hexahedronsInScene.value.length +
    prismsInScene.value.length +
    pyramidsInScene.value.length +
    spheresInScene.value.length +
    conesInScene.value.length +
    cylindersInScene.value.length,
)
const contentGroupLabels: Record<
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
  | 'prism'
  | 'pyramid'
  | 'sphere'
  | 'cone'
  | 'cylinder',
  string
> = {
  point: '点',
  line: '线段',
  straightLine: '直线',
  perpendicularLine: '垂线',
  parallelLine: '平行线',
  ray: '射线',
  vector: '向量',
  circle: '圆',
  face: '多边形',
  hexahedron: '立体',
  prism: '棱柱',
  pyramid: '棱锥',
  sphere: '球体',
  cone: '圆锥',
  cylinder: '圆柱',
}
const setContentGroupsCollapsed = (collapsed: boolean) => {
  uiStore.setContentGroupsCollapsed(collapsed)
}

const toggleContentGroup = (
  type:
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
    | 'prism'
    | 'pyramid'
    | 'sphere'
    | 'cone'
    | 'cylinder',
) => {
  uiStore.toggleContentGroup(type)
}

const emitToast = (msg: string, scope: 'global' | 'viewport' = 'global') => {
  window.dispatchEvent(
    new CustomEvent('toast', {
      detail: { msg, scope },
    }),
  )
}

const SELECT_FROM_CONTENT_MAP: Record<string, (id: string) => void> = {
  point: (id) => props.scene.selection.selectPoint(id),
  line: (id) => props.scene.selection.selectLine(id),
  straightLine: (id) => props.scene.selection.selectStraightLine(id),
  perpendicularLine: (id) => props.scene.selection.selectPerpendicularLine(id),
  parallelLine: (id) => props.scene.selection.selectParallelLine(id),
  ray: (id) => props.scene.selection.selectRay(id),
  vector: (id) => props.scene.selection.selectVector(id),
  face: (id) => props.scene.selection.selectFace(id),
  circle: (id) => props.scene.selection.selectCircle(id),
  sphere: (id) => props.scene.selection.selectSphere(id),
  cone: (id) => props.scene.selection.selectCone(id),
  cylinder: (id) => props.scene.selection.selectCylinder(id),
}

const selectFromContent = (type: string, id: string) => {
  editing.value = null
  SELECT_FROM_CONTENT_MAP[type]?.(id)
  props.scene.markAllRenderDirty()
}

const selectPointFromContent = (id: string) => selectFromContent('point', id)

const selectLineFromContent = (id: string) => selectFromContent('line', id)

const selectStraightLineFromContent = (id: string) => selectFromContent('straightLine', id)

const selectPerpendicularLineFromContent = (id: string) =>
  selectFromContent('perpendicularLine', id)

const selectParallelLineFromContent = (id: string) =>
  selectFromContent('parallelLine', id)

const selectRayFromContent = (id: string) => selectFromContent('ray', id)

const selectVectorFromContent = (id: string) => selectFromContent('vector', id)

const selectFaceFromContent = (id: string) => selectFromContent('face', id)

const selectCircleFromContent = (id: string) => selectFromContent('circle', id)

const selectSphereFromContent = (sphereId: string) => selectFromContent('sphere', sphereId)

const selectConeFromContent = (coneId: string) => selectFromContent('cone', coneId)

const selectCylinderFromContent = (cylinderId: string) => selectFromContent('cylinder', cylinderId)

const selectHexahedronFromContent = (cubeId: string) => {
  editing.value = null
  const constraint = props.editor.getCubeConstraint(cubeId)
  const firstFaceId = constraint?.faceIds[0]
  if (firstFaceId) props.editor.selectCubeByFaceId(firstFaceId)
  props.scene.markAllRenderDirty()
}

const selectPrismFromContent = (prismId: string) => {
  editing.value = null
  const constraint = props.editor.getPrismConstraint(prismId)
  const firstFaceId = constraint?.bottomFaceId
  if (firstFaceId) props.editor.selectPrismByFaceId(firstFaceId)
  props.scene.markAllRenderDirty()
}

const selectPyramidFromContent = (pyramidId: string) => {
  editing.value = null
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  const firstFaceId = constraint?.bottomFaceId
  if (firstFaceId) props.editor.selectPyramidByFaceId(firstFaceId)
  props.scene.markAllRenderDirty()
}

const clearContentSelection = () => {
  editing.value = null
  props.scene.selection.clear()
  props.scene.markAllRenderDirty()
}

const getSplitPaneMetrics = () => {
  const container = splitPaneRef.value
  const divider = splitPaneDividerRef.value
  if (!container || !divider) return null

  const dividerHeight = divider.offsetHeight || 10
  const availableHeight = container.clientHeight - dividerHeight
  if (availableHeight <= 0) return null

  const maxSelectedHeight = Math.max(
    MIN_SELECTED_PANE_HEIGHT,
    availableHeight - MIN_CONTENT_PANE_HEIGHT,
  )
  const minSelectedHeight = Math.min(MIN_SELECTED_PANE_HEIGHT, maxSelectedHeight)

  return { container, dividerHeight, availableHeight, minSelectedHeight, maxSelectedHeight }
}

const clampSelectedPaneHeight = (nextHeight: number) => {
  const metrics = getSplitPaneMetrics()
  if (!metrics) return nextHeight
  return Math.min(Math.max(nextHeight, metrics.minSelectedHeight), metrics.maxSelectedHeight)
}

const syncSplitPaneMode = () => {
  isSplitPaneEnabled.value = true
}

const syncSelectedPaneHeight = () => {
  if (!isSplitPaneEnabled.value) return
  const metrics = getSplitPaneMetrics()
  if (!metrics) return
  if (selectedPaneHeight.value <= 0) {
    selectedPaneHeight.value = Math.round(metrics.availableHeight * 0.38)
  }
  selectedPaneHeight.value = clampSelectedPaneHeight(selectedPaneHeight.value)
}

const handleSplitPaneDrag = (event: PointerEvent) => {
  if (!isDraggingSplitPane.value || !isSplitPaneEnabled.value) return
  event.preventDefault()
  const metrics = getSplitPaneMetrics()
  if (!metrics) return
  const bounds = metrics.container.getBoundingClientRect()
  const nextHeight = event.clientY - bounds.top
  selectedPaneHeight.value = clampSelectedPaneHeight(nextHeight)
}

const stopSplitPaneDrag = () => {
  isDraggingSplitPane.value = false
  document.body.classList.remove('sidebar-resizing')
}

const startSplitPaneDrag = (event: PointerEvent) => {
  if (!isSplitPaneEnabled.value) return
  event.preventDefault()
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
  isDraggingSplitPane.value = true
  document.body.classList.add('sidebar-resizing')
  handleSplitPaneDrag(event)
}

const selectedPaneStyle = computed(() => {
  if (!isSplitPaneEnabled.value) return undefined
  return {
    height: `${selectedPaneHeight.value}px`,
    flex: '0 0 auto',
  }
})

const updateCompactLineEditorMode = () => {
  const touchLike =
    navigator.maxTouchPoints > 0 ||
    'ontouchstart' in window ||
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(hover: none)').matches
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  uiStore.setCompactLineEditor(touchLike || mobileUA)
}

watch(
  [
    selectedPointIds,
    selectedLineIds,
    selectedStraightLineIds,
    selectedPerpendicularLineIds,
    selectedParallelLineIds,
    selectedRayIds,
    selectedVectorIds,
    selectedEditableFaceIds,
    selectedCircleIds,
    selectedHexahedronIds,
    selectedSphereIds,
    selectedConeIds,
    selectedCylinderIds,
  ],
  () => {
    if (!editing.value) return
    const { type, id } = editing.value
    const idsMap: Record<string, string[] | undefined> = {
      point: selectedPointIds.value,
      line: selectedLineIds.value,
      straightLine: selectedStraightLineIds.value,
      perpendicularLine: selectedPerpendicularLineIds.value,
      parallelLine: selectedParallelLineIds.value,
      ray: selectedRayIds.value,
      vector: selectedVectorIds.value,
      face: selectedEditableFaceIds.value,
      circle: selectedCircleIds.value,
      hexahedron: selectedHexahedronIds.value,
      prism: selectedPrismIds.value,
      pyramid: selectedPyramidIds.value,
      sphere: selectedSphereIds.value,
      cone: selectedConeIds.value,
      cylinder: selectedCylinderIds.value,
      regularPolygon: selectedRegularPolygons.value.map((rp) => rp.constraintId),
    }
    const ids = idsMap[type]
    if (ids && !ids.includes(id)) editing.value = null
  },
)

// 编辑态收起时，立即隐藏所有依附于输入框的气泡浮窗
watch(editing, (newVal, oldVal) => {
  if (!newVal && oldVal) {
    hideAllLengthBubbles()
  }
})

watch(
  contentGroupsCollapsed,
  (c) => {
    const activeKeys: (keyof typeof c)[] = []
    if (pointsInScene.value.length > 0) activeKeys.push('point')
    if (linesInScene.value.length > 0) activeKeys.push('line')
    if (straightLinesInScene.value.length > 0) activeKeys.push('straightLine')
    if (perpendicularLinesInScene.value.length > 0) activeKeys.push('perpendicularLine')
    if (parallelLinesInScene.value.length > 0) activeKeys.push('parallelLine')
    if (raysInScene.value.length > 0) activeKeys.push('ray')
    if (vectorsInScene.value.length > 0) activeKeys.push('vector')
    if (circlesInScene.value.length > 0) activeKeys.push('circle')
    if (facesInScene.value.length > 0) activeKeys.push('face')
    if (hexahedronsInScene.value.length > 0) activeKeys.push('hexahedron')
    if (prismsInScene.value.length > 0) activeKeys.push('prism')
    if (pyramidsInScene.value.length > 0) activeKeys.push('pyramid')
    if (spheresInScene.value.length > 0) activeKeys.push('sphere')
    if (conesInScene.value.length > 0) activeKeys.push('cone')
    if (cylindersInScene.value.length > 0) activeKeys.push('cylinder')
    if (activeKeys.length === 0) return
    const allCollapsed = activeKeys.every((k) => c[k])
    const allExpanded = activeKeys.every((k) => !c[k])
    if (allCollapsed) isAllGroupsCollapsed.value = true
    else if (allExpanded) isAllGroupsCollapsed.value = false
  },
  { deep: true },
)

watch(
  totalContentCount,
  (count) => {
    // 大场景自动折叠所有分类
    if (count > 10) {
      if (!hasAutoCollapsedContentGroups.value && !isAllGroupsCollapsed.value) {
        setContentGroupsCollapsed(true)
        isAllGroupsCollapsed.value = true
        emitToast('内容区元素数量大于10，已自动折叠')
      }
      hasAutoCollapsedContentGroups.value = true
      return
    }
    // 小场景下保留用户在 uiStore 里持久化的分组状态：
    //   - 之前被显式"全折叠"的（isAllGroupsCollapsed=true）→ 保持折叠
    //   - 其他情况（用户手动展开/折叠的混合状态）→ 不主动改写，让 contentGroupsCollapsed
    //     保持用户上次操作的结果
    // 之前的 else 分支会无条件 setContentGroupsCollapsed(false)，把持久化的"已折叠"
    // 状态清空，跨 Tab 重登后场景重新加载时所有分类被错误地"自动展开"。修复后仅在
    // 显式触发（如"全折叠/全展开"按钮）时改变 contentGroupsCollapsed。
    if (isAllGroupsCollapsed.value) {
      setContentGroupsCollapsed(true)
    }
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
  return Number.isFinite(n) ? Math.max(0.1, n).toFixed(2) : value
}
const normalizeVectorLength = (value: string) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0.1, n).toFixed(2) : value
}
const normalizeFaceEdgeLength = (value: string) => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0.1, n).toFixed(2) : value
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

const LENGTH_MIN = 0.1

const stepLengthValue = (current: number, step: number, direction: 'up' | 'down'): number => {
  if (direction === 'up') {
    let next = Math.ceil((current + 1e-9) / step) * step
    if (next <= current) next += step
    return next
  } else {
    let next = Math.floor((current - 1e-9) / step) * step
    if (next >= current) next -= step
    return Math.max(LENGTH_MIN, next)
  }
}

const bubbleState = reactive<
  Record<string, { show: boolean; message: string; x: number; y: number; below: boolean }>
>({})
const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const bubbleInputCleanups = new Map<string, () => void>()

const detachBubbleInputListener = (key: string) => {
  const cleanup = bubbleInputCleanups.get(key)
  if (cleanup) {
    cleanup()
    bubbleInputCleanups.delete(key)
  }
}

const hideLengthBubble = (key: string) => {
  if (bubbleState[key]) bubbleState[key].show = false
  const existing = bubbleTimers.get(key)
  if (existing) {
    clearTimeout(existing)
    bubbleTimers.delete(key)
  }
  detachBubbleInputListener(key)
}

const hideAllLengthBubbles = () => {
  for (const key of Object.keys(bubbleState)) {
    hideLengthBubble(key)
  }
}

const attachBubbleInputListener = (key: string) => {
  detachBubbleInputListener(key)
  const input = coordInputs.get(key)
  if (!input) return
  const handler = () => {
    hideLengthBubble(key)
    detachBubbleInputListener(key)
  }
  input.addEventListener('input', handler)
  bubbleInputCleanups.set(key, () => input.removeEventListener('input', handler))
}

// 当前可见的气泡列表，统一 Teleport 到 body 渲染，避免被祖先 overflow 容器裁剪
const visibleBubbles = computed(() => {
  const result: Record<
    string,
    { message: string; x: number; y: number; transform: string; below: boolean }
  > = {}
  for (const [key, val] of Object.entries(bubbleState)) {
    if (val.show) {
      const transform = val.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'
      result[key] = { message: val.message, x: val.x, y: val.y, transform, below: val.below }
    }
  }
  return result
})

const showLengthBubble = (key: string, message: string) => {
  // 计算气泡位置：默认显示在对应输入框上方，上方空间不足时改为下方
  // 左右方向自适应：确保气泡不超出视口边界
  let x = 0
  let y = 0
  let below = false
  // 估算气泡宽度（中文字符约 14px，英文约 7px，padding 20px），上限 300px
  const cjkCount = Array.from(message).filter((ch) => ch.charCodeAt(0) > 0x2e7f).length
  const asciiCount = message.length - cjkCount
  const estimatedWidth = Math.min(300, cjkCount * 14 + asciiCount * 7 + 20)
  const halfWidth = estimatedWidth / 2
  const viewW = window.innerWidth
  const clampX = (rawX: number) => {
    if (rawX + halfWidth > viewW - 8) return viewW - halfWidth - 8
    if (rawX - halfWidth < 8) return halfWidth + 8
    return rawX
  }
  const input = coordInputs.get(key)
  if (input) {
    const rect = input.getBoundingClientRect()
    x = clampX(rect.left + rect.width / 2)
    if (rect.top < 40) {
      y = rect.bottom + 6
      below = true
    } else {
      y = rect.top - 6
      below = false
    }
  } else {
    // 回退：尝试用 data-bubble-key 查找锚点
    const el = document.querySelector(`[data-bubble-key="${key}"]`)
    if (el) {
      const rect = el.getBoundingClientRect()
      x = clampX(rect.left + rect.width / 2)
      if (rect.top < 40) {
        y = rect.bottom + 6
        below = true
      } else {
        y = rect.top - 6
        below = false
      }
    }
  }
  bubbleState[key] = { show: true, message, x, y, below }
  const existing = bubbleTimers.get(key)
  if (existing) clearTimeout(existing)
  bubbleTimers.set(
    key,
    setTimeout(() => {
      if (bubbleState[key]) bubbleState[key].show = false
      bubbleTimers.delete(key)
      detachBubbleInputListener(key)
    }, 3000),
  )
  // 用户在输入框中输入时立即隐藏气泡
  attachBubbleInputListener(key)
}

const clampLengthValue = (key: string, value: string, previousValue: string): string => {
  const n = Number(value)
  if (!Number.isFinite(n)) return previousValue
  if (n < LENGTH_MIN) {
    showLengthBubble(key, '非法取值')
    return previousValue
  }
  return value
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
const handleRayCoordFocus = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`ray.${which}.${axis}`, true)
}
const handleRayCoordBlur = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editRay[which][axis] = normalizeCoord(editRay[which][axis])
  setCoordFocus(`ray.${which}.${axis}`, false)
  applyEditRay()
}
const handleStraightLineCoordFocus = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`straightLine.${which}.${axis}`, true)
}
const handleStraightLineCoordBlur = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editStraightLine[which][axis] = normalizeCoord(editStraightLine[which][axis])
  setCoordFocus(`straightLine.${which}.${axis}`, false)
  applyEditStraightLine()
}
const nudgePointCoord = (axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`point.${axis}`, direction)
  if (nextValue === null) return
  editPoint[axis] = nextValue
  applyEditPoint()
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
  hideLengthBubble('line.lockedLength')
  editLine.lockedLength = clampLengthValue(
    'line.lockedLength',
    editLine.lockedLength,
    editLine.lockedLength,
  )
  editLine.lockedLength = normalizeDisplayLength(editLine.lockedLength)
  setCoordFocus('line.lockedLength', false)
  applyEditLine()
}
const nudgeLineLength = (direction: 'up' | 'down') => {
  hideLengthBubble('line.lockedLength')
  const current = Number(editLine.lockedLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('line.lockedLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editLine.lockedLength = next.toFixed(2)
  applyEditLine()
}
const nudgeRayCoord = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`ray.${which}.${axis}`, direction)
  if (nextValue === null) return
  editRay[which][axis] = nextValue
  applyEditRay()
}
const nudgeStraightLineCoord = (
  which: 'p1' | 'p2',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`straightLine.${which}.${axis}`, direction)
  if (nextValue === null) return
  editStraightLine[which][axis] = nextValue
  applyEditStraightLine()
}
const handlePerpendicularLineCoordFocus = (axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`perpendicularLine.p1.${axis}`, true)
}
const handlePerpendicularLineCoordBlur = (axis: 'x' | 'y' | 'z') => {
  editPerpendicularLine.p1[axis] = normalizeCoord(editPerpendicularLine.p1[axis])
  setCoordFocus(`perpendicularLine.p1.${axis}`, false)
  applyEditPerpendicularLine()
}
const nudgePerpendicularLineCoord = (axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`perpendicularLine.p1.${axis}`, direction)
  if (nextValue === null) return
  editPerpendicularLine.p1[axis] = nextValue
  applyEditPerpendicularLine()
}
const handleRayDisplayLengthFocus = () => {
  setCoordFocus('ray.displayLength', true)
}
const handleRayDisplayLengthBlur = () => {
  hideLengthBubble('ray.displayLength')
  editRay.displayLength = clampLengthValue(
    'ray.displayLength',
    editRay.displayLength,
    editRay.displayLength,
  )
  editRay.displayLength = normalizeDisplayLength(editRay.displayLength)
  setCoordFocus('ray.displayLength', false)
  applyEditRay()
}
const nudgeRayDisplayLength = (direction: 'up' | 'down') => {
  hideLengthBubble('ray.displayLength')
  const current = Number(editRay.displayLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('ray.displayLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editRay.displayLength = next.toFixed(2)
  applyEditRay()
}
const handleVectorLengthFocus = () => {
  setCoordFocus('vector.length', true)
}
const handleVectorLengthBlur = () => {
  hideLengthBubble('vector.length')
  editVector.length = clampLengthValue('vector.length', editVector.length, editVector.length)
  editVector.length = normalizeVectorLength(editVector.length)
  setCoordFocus('vector.length', false)
  applyEditVector()
}
const nudgeVectorLength = (direction: 'up' | 'down') => {
  hideLengthBubble('vector.length')
  const current = Number(editVector.length)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('vector.length', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  setCoordFocus('vector.length', true)
  editVector.length = next.toFixed(2)
  applyEditVector()
  setCoordFocus('vector.length', false)
}
const handleVectorCoordFocus = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`vector.${which}.${axis}`, true)
}
const handleVectorCoordBlur = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editVector[which][axis] = normalizeCoord(editVector[which][axis])
  setCoordFocus(`vector.${which}.${axis}`, false)
  applyEditVector()
}
const nudgeVectorCoord = (which: 'p1' | 'p2', axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`vector.${which}.${axis}`, direction)
  if (nextValue === null) return
  editVector[which][axis] = nextValue
  applyEditVector()
}
const handleStraightLineDisplayLengthFocus = () => {
  setCoordFocus('straightLine.displayLength', true)
}
const handleStraightLineDisplayLengthBlur = () => {
  hideLengthBubble('straightLine.displayLength')
  editStraightLine.displayLength = clampLengthValue(
    'straightLine.displayLength',
    editStraightLine.displayLength,
    editStraightLine.displayLength,
  )
  editStraightLine.displayLength = normalizeDisplayLength(editStraightLine.displayLength)
  setCoordFocus('straightLine.displayLength', false)
  applyEditStraightLine()
}
const nudgeStraightLineDisplayLength = (direction: 'up' | 'down') => {
  hideLengthBubble('straightLine.displayLength')
  const current = Number(editStraightLine.displayLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('straightLine.displayLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editStraightLine.displayLength = next.toFixed(2)
  applyEditStraightLine()
}
const handlePerpendicularLineDisplayLengthFocus = () => {
  setCoordFocus('perpendicularLine.displayLength', true)
}
const handlePerpendicularLineDisplayLengthBlur = () => {
  hideLengthBubble('perpendicularLine.displayLength')
  editPerpendicularLine.displayLength = clampLengthValue(
    'perpendicularLine.displayLength',
    editPerpendicularLine.displayLength,
    editPerpendicularLine.displayLength,
  )
  editPerpendicularLine.displayLength = normalizeDisplayLength(editPerpendicularLine.displayLength)
  setCoordFocus('perpendicularLine.displayLength', false)
  applyEditPerpendicularLine()
}
const nudgePerpendicularLineDisplayLength = (direction: 'up' | 'down') => {
  hideLengthBubble('perpendicularLine.displayLength')
  const current = Number(editPerpendicularLine.displayLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('perpendicularLine.displayLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editPerpendicularLine.displayLength = next.toFixed(2)
  applyEditPerpendicularLine()
}
const handleParallelLineCoordFocus = (axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`parallelLine.p1.${axis}`, true)
}
const handleParallelLineCoordBlur = (axis: 'x' | 'y' | 'z') => {
  editParallelLine.p1[axis] = normalizeCoord(editParallelLine.p1[axis])
  setCoordFocus(`parallelLine.p1.${axis}`, false)
  applyEditParallelLine()
}
const nudgeParallelLineCoord = (axis: 'x' | 'y' | 'z', direction: 'up' | 'down') => {
  const nextValue = stepCoordInput(`parallelLine.p1.${axis}`, direction)
  if (nextValue === null) return
  editParallelLine.p1[axis] = nextValue
  applyEditParallelLine()
}
const handleParallelLineDisplayLengthFocus = () => {
  setCoordFocus('parallelLine.displayLength', true)
}
const handleParallelLineDisplayLengthBlur = () => {
  hideLengthBubble('parallelLine.displayLength')
  editParallelLine.displayLength = clampLengthValue(
    'parallelLine.displayLength',
    editParallelLine.displayLength,
    editParallelLine.displayLength,
  )
  editParallelLine.displayLength = normalizeDisplayLength(editParallelLine.displayLength)
  setCoordFocus('parallelLine.displayLength', false)
  applyEditParallelLine()
}
const nudgeParallelLineDisplayLength = (direction: 'up' | 'down') => {
  hideLengthBubble('parallelLine.displayLength')
  const current = Number(editParallelLine.displayLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('parallelLine.displayLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editParallelLine.displayLength = next.toFixed(2)
  applyEditParallelLine()
}
const handleFaceEdgeLengthFocus = (edgeIndex: number) => {
  setCoordFocus(`face.edge.${edgeIndex}`, true)
}
const handleFaceEdgeLengthBlur = (faceId: string, edgeIndex: number) => {
  const key = `face.edge.${edgeIndex}`
  hideLengthBubble(key)
  const prev = editFace.edgeLengths[edgeIndex] ?? ''
  editFace.edgeLengths[edgeIndex] = clampLengthValue(
    key,
    editFace.edgeLengths[edgeIndex] ?? '',
    prev,
  )
  editFace.edgeLengths[edgeIndex] = normalizeFaceEdgeLength(editFace.edgeLengths[edgeIndex] ?? '')
  setCoordFocus(key, false)
  applyFaceEdgeLength(faceId, edgeIndex)
}
const nudgeFaceEdgeLength = (faceId: string, edgeIndex: number, direction: 'up' | 'down') => {
  const key = `face.edge.${edgeIndex}`
  hideLengthBubble(key)
  const current = Number(editFace.edgeLengths[edgeIndex])
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble(key, '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editFace.edgeLengths[edgeIndex] = next.toFixed(2)
  const success = props.editor.updateFaceBoundaryEdgeLength(
    faceId,
    edgeIndex,
    next,
    getFaceEdgeTargets(faceId),
  )
  if (!success) {
    showLengthBubble(key, direction === 'up' ? '不满足三角形的三边关系，无法增加' : '不满足三角形的三边关系，无法减少')
    // 恢复为实际边长
    const face = props.scene.faces.get(faceId)
    if (face) {
      editFace.edgeLengths[edgeIndex] = toFixed2(face.getEdgeLength(props.scene.points, edgeIndex))
    }
  }
}
const handleHexahedronEdgeLengthFocus = () => {
  setCoordFocus('hexa.edgeLength', true)
}
const handleHexahedronEdgeLengthBlur = () => {
  hideLengthBubble('hexa.edgeLength')
  editHexahedron.edgeLength = clampLengthValue(
    'hexa.edgeLength',
    editHexahedron.edgeLength,
    editHexahedron.edgeLength,
  )
  const n = Number(editHexahedron.edgeLength)
  editHexahedron.edgeLength = Number.isFinite(n)
    ? Math.max(LENGTH_MIN, n).toFixed(2)
    : editHexahedron.edgeLength
  setCoordFocus('hexa.edgeLength', false)
  applyHexahedronEdgeLength()
}
const nudgeHexahedronEdgeLength = (direction: 'up' | 'down') => {
  hideLengthBubble('hexa.edgeLength')
  const current = Number(editHexahedron.edgeLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('hexa.edgeLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editHexahedron.edgeLength = next.toFixed(2)
  applyHexahedronEdgeLength()
}
const isHexahedronEdgeLengthInputDisabled = () =>
  editHexahedron.userLocked || editHexahedron.edgeLengthLocked
const handleHexahedronOwnerCoordFocus = (pointKey: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`hexa.${pointKey}.${axis}`, true)
}
const handleHexahedronOwnerCoordBlur = (pointKey: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editHexahedron[pointKey][axis] = normalizeCoord(editHexahedron[pointKey][axis])
  setCoordFocus(`hexa.${pointKey}.${axis}`, false)
  applyHexahedronOwnerPoint(pointKey)
}
const nudgeHexahedronOwnerCoord = (
  pointKey: 'p1' | 'p2',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`hexa.${pointKey}.${axis}`, direction)
  if (nextValue === null) return
  editHexahedron[pointKey][axis] = nextValue
  applyHexahedronOwnerPoint(pointKey)
}

const startEditPoint = (p: Point3 | undefined) => {
  if (!p) return
  if (p.id === Scene.ORIGIN_ID) return
  editing.value = { type: 'point', id: p.id }
  editPoint.name = p.name ?? ''
  editPoint.nameVisible = p.nameVisible !== false
  editPoint.valueVisible = p.valueVisible === true
  editPoint.visible = p.visible !== false
  editPoint.userLocked = isPointCoordinateLocked(p)
  editPoint.x = toFixed2(p.position.x)
  editPoint.y = toFixed2(p.position.y)
  editPoint.z = toFixed2(p.position.z)
  // 初始化约束点参数化数据
  syncConstrainedParams(p)
}

const startEditLine = (l: Line3 | undefined) => {
  if (!l) return
  editing.value = { type: 'line', id: l.id }
  editLine.name = l.name ?? ''
  editLine.nameVisible = l.nameVisible !== false
  editLine.valueVisible = l.valueVisible === true
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
const startEditStraightLine = (l: StraightLine3 | undefined) => {
  if (!l) return
  editing.value = { type: 'straightLine', id: l.id }
  editStraightLine.name = l.name ?? ''
  editStraightLine.nameVisible = l.nameVisible !== false
  editStraightLine.valueVisible = l.valueVisible === true
  editStraightLine.visible = l.visible !== false
  editStraightLine.userLocked = props.editor.isStraightLineLocked(l)
  editStraightLine.displayLength = toFixed2(l.displayLength)
  editStraightLine.p1.x = toFixed2(l.p1.position.x)
  editStraightLine.p1.y = toFixed2(l.p1.position.y)
  editStraightLine.p1.z = toFixed2(l.p1.position.z)
  editStraightLine.p2.x = toFixed2(l.p2.position.x)
  editStraightLine.p2.y = toFixed2(l.p2.position.y)
  editStraightLine.p2.z = toFixed2(l.p2.position.z)
}
const startEditPerpendicularLine = (l: PerpendicularLine3 | undefined) => {
  if (!l) return
  editing.value = { type: 'perpendicularLine', id: l.id }
  editPerpendicularLine.name = l.name ?? ''
  editPerpendicularLine.nameVisible = l.nameVisible !== false
  editPerpendicularLine.valueVisible = l.valueVisible === true
  editPerpendicularLine.visible = l.visible !== false
  editPerpendicularLine.userLocked = l.userLocked
  editPerpendicularLine.displayLength = toFixed2(l.displayLength)
  editPerpendicularLine.p1.x = toFixed2(l.p1.position.x)
  editPerpendicularLine.p1.y = toFixed2(l.p1.position.y)
  editPerpendicularLine.p1.z = toFixed2(l.p1.position.z)
}
const startEditParallelLine = (l: ParallelLine3 | undefined) => {
  if (!l) return
  editing.value = { type: 'parallelLine', id: l.id }
  editParallelLine.name = l.name ?? ''
  editParallelLine.nameVisible = l.nameVisible !== false
  editParallelLine.valueVisible = l.valueVisible === true
  editParallelLine.visible = l.visible !== false
  editParallelLine.userLocked = l.userLocked
  editParallelLine.displayLength = toFixed2(l.displayLength)
  editParallelLine.p1.x = toFixed2(l.p1.position.x)
  editParallelLine.p1.y = toFixed2(l.p1.position.y)
  editParallelLine.p1.z = toFixed2(l.p1.position.z)
}
const startEditRay = (r: Ray3 | undefined) => {
  if (!r) return
  editing.value = { type: 'ray', id: r.id }
  editRay.name = r.name ?? ''
  editRay.nameVisible = r.nameVisible !== false
  editRay.valueVisible = r.valueVisible === true
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
const startEditVector = (v: GeoVector3 | undefined) => {
  if (!v) return
  editing.value = { type: 'vector', id: v.id }
  editVector.name = v.name ?? ''
  editVector.nameVisible = v.nameVisible !== false
  editVector.valueVisible = v.valueVisible === true
  editVector.visible = v.visible !== false
  editVector.userLocked = props.editor.isVectorLocked(v)
  editVector.length = toFixed2(v.getLength())
  editVector.p1.x = toFixed2(v.p1.position.x)
  editVector.p1.y = toFixed2(v.p1.position.y)
  editVector.p1.z = toFixed2(v.p1.position.z)
  editVector.p2.x = toFixed2(v.p2.position.x)
  editVector.p2.y = toFixed2(v.p2.position.y)
  editVector.p2.z = toFixed2(v.p2.position.z)
}
const startEditFace = (face: PlanarPolygon | undefined) => {
  if (!face) return
  editing.value = { type: 'face', id: face.id }
  editFace.name = face.name ?? ''
  editFace.nameVisible = face.nameVisible !== false
  editFace.valueVisible = face.valueVisible === true
  editFace.visible = face.visible !== false
  editFace.userLocked = props.editor.isFaceLocked(face)
  editFace.areaLocked = face.areaLocked === true
  editFace.edgeLengths = face
    .getBoundaryPoints(props.scene.points)
    .map((_, index) => toFixed2(face.getEdgeLength(props.scene.points, index)))
}
const startEditCircle = (c: Circle3 | undefined) => {
  if (!c) return
  editing.value = { type: 'circle', id: c.id }
  editCircle.name = c.name ?? ''
  editCircle.nameVisible = c.nameVisible !== false
  editCircle.valueVisible = c.valueVisible === true
  editCircle.visible = c.visible !== false
  editCircle.userLocked = props.editor.isCircleLocked(c)
  editCircle.centerVisible = c.centerVisible !== false
  editCircle.lockedRadius = c.lockedRadius != null ? String(c.lockedRadius) : ''
  editCircle.threePointRadius = c.isNormalCircle() ? '' : toFixed2(c.getRadius())
  editCircle.p1.x = toFixed2(c.p1.position.x)
  editCircle.p1.y = toFixed2(c.p1.position.y)
  editCircle.p1.z = toFixed2(c.p1.position.z)
  editCircle.p2.x = toFixed2(c.p2.position.x)
  editCircle.p2.y = toFixed2(c.p2.position.y)
  editCircle.p2.z = toFixed2(c.p2.position.z)
  editCircle.p3.x = toFixed2(c.p3.position.x)
  editCircle.p3.y = toFixed2(c.p3.position.y)
  editCircle.p3.z = toFixed2(c.p3.position.z)
}
const startEditHexahedron = (cubeId: string) => {
  const constraint = props.editor.getCubeConstraint(cubeId)
  if (!constraint) return
  const ownerPoints = constraint.ownerPointIds
    .map((id) => props.scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined)
  if (ownerPoints.length < 2) return
  editing.value = { type: 'hexahedron', id: cubeId }
  editHexahedron.nameSuffix = props.editor.getCubeNameSuffix(cubeId)
  editHexahedron.valueVisible = constraint.valueVisible === true
  editHexahedron.userLocked = constraint.faceIds.every(
    (faceId) => props.scene.faces.get(faceId)?.userLocked,
  )
  editHexahedron.edgeLengthLocked = constraint.edgeLengthLocked
  editHexahedron.edgeLength = toFixed2(
    Math.hypot(
      ownerPoints[1]!.position.x - ownerPoints[0]!.position.x,
      ownerPoints[1]!.position.y - ownerPoints[0]!.position.y,
      ownerPoints[1]!.position.z - ownerPoints[0]!.position.z,
    ),
  )
  editHexahedron.p1.x = toFixed2(ownerPoints[0]!.position.x)
  editHexahedron.p1.y = toFixed2(ownerPoints[0]!.position.y)
  editHexahedron.p1.z = toFixed2(ownerPoints[0]!.position.z)
  editHexahedron.p2.x = toFixed2(ownerPoints[1]!.position.x)
  editHexahedron.p2.y = toFixed2(ownerPoints[1]!.position.y)
  editHexahedron.p2.z = toFixed2(ownerPoints[1]!.position.z)
}

const startEditPrism = (prismId: string) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  if (!constraint) return
  const ownerPoints = getPrismOwnerPoints(prismId)
  if (ownerPoints.length < 2) return
  const topPoint = ownerPoints[1]!
  editing.value = { type: 'prism', id: prismId }
  editPrism.nameSuffix = props.editor.getPrismNameSuffix(prismId)
  editPrism.valueVisible = constraint.valueVisible === true
  editPrism.userLocked = props.editor
    .getPrismFaceIds(prismId)
    .every((faceId) => props.scene.faces.get(faceId)?.userLocked)
  editPrism.keepVertical = constraint.keepVertical === true
  editPrism.topPoint.x = toFixed2(topPoint.position.x)
  editPrism.topPoint.y = toFixed2(topPoint.position.y)
  editPrism.topPoint.z = toFixed2(topPoint.position.z)
  editPrism.height = toFixed2(constraint.getHeight())
  const bottomFace = props.scene.faces.get(constraint.bottomFaceId)
  editPrism.bottomEdgeLengths = bottomFace
    ? bottomFace
        .getBoundaryPoints(props.scene.points)
        .map((_, index) => toFixed2(bottomFace.getEdgeLength(props.scene.points, index)))
    : []
}

const startEditPyramid = (pyramidId: string) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  if (!constraint) return
  const ownerPoints = getPyramidOwnerPoints(pyramidId)
  if (ownerPoints.length < 2) return
  const apexPoint = ownerPoints[1]!
  editing.value = { type: 'pyramid', id: pyramidId }
  editPyramid.nameSuffix = props.editor.getPyramidNameSuffix(pyramidId)
  editPyramid.valueVisible = constraint.valueVisible === true
  editPyramid.userLocked = props.editor
    .getPyramidFaceIds(pyramidId)
    .every((faceId) => props.scene.faces.get(faceId)?.userLocked)
  editPyramid.keepVertical = constraint.keepVertical === true
  editPyramid.apexPoint.x = toFixed2(apexPoint.position.x)
  editPyramid.apexPoint.y = toFixed2(apexPoint.position.y)
  editPyramid.apexPoint.z = toFixed2(apexPoint.position.z)
  editPyramid.height = toFixed2(constraint.getHeight())
  const bottomFace = props.scene.faces.get(constraint.bottomFaceId)
  editPyramid.bottomEdgeLengths = bottomFace
    ? bottomFace
        .getBoundaryPoints(props.scene.points)
        .map((_, index) => toFixed2(bottomFace.getEdgeLength(props.scene.points, index)))
    : []
}

const startEditRegularPolygon = (constraintId: string) => {
  const constraint = props.editor.getRegularPolygonConstraint(constraintId)
  if (!constraint) return
  const ownerPoints = props.editor.getRegularPolygonOwnerPoints(constraintId)
  if (ownerPoints.length < 2) return
  editing.value = { type: 'regularPolygon', id: constraintId }
  editRegularPolygon.nameSuffix = props.editor.getRegularPolygonNameSuffix(constraintId)
  editRegularPolygon.nameVisible = constraint.nameVisible === true
  editRegularPolygon.valueVisible = constraint.valueVisible === true
  const face = props.scene.faces.get(constraint.faceId)
  editRegularPolygon.userLocked = face?.userLocked === true
  editRegularPolygon.edgeLengthLocked = constraint.edgeLengthLocked
  editRegularPolygon.edgeLength = toFixed2(constraint.getEdgeLength())
  editRegularPolygon.p1.x = toFixed2(ownerPoints[0]!.position.x)
  editRegularPolygon.p1.y = toFixed2(ownerPoints[0]!.position.y)
  editRegularPolygon.p1.z = toFixed2(ownerPoints[0]!.position.z)
  editRegularPolygon.p2.x = toFixed2(ownerPoints[1]!.position.x)
  editRegularPolygon.p2.y = toFixed2(ownerPoints[1]!.position.y)
  editRegularPolygon.p2.z = toFixed2(ownerPoints[1]!.position.z)
}

const applyPointPosition = (id: string, xStr: string, yStr: string, zStr: string) => {
  const x = Number(xStr)
  const y = Number(yStr)
  const z = Number(zStr)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
  const point = props.scene.points.get(id)
  if (!point) return
  if (isPointCoordinateLocked(point)) return
  // 将当前实际坐标用 toFixed2 格式化后与输入值比较，
  // 避免因 toFixed2 截断精度导致每次编辑属性都产生无意义的 TransformCommand
  // （如实际坐标 1.23456 被 toFixed2 截为 "1.23"，若用户未修改坐标输入，
  //  不应将点移到 1.23）
  if (
    toFixed2(point.position.x) === xStr &&
    toFixed2(point.position.y) === yStr &&
    toFixed2(point.position.z) === zStr
  ) return
  props.editor.setPointPosition(id, new Vec3(x, y, z))
  props.scene.solveDirtyConstraints()
  props.scene.markAllRenderDirty()
}

const applyEditPoint = () => {
  if (!editing.value || editing.value.type !== 'point') return
  const point = props.scene.points.get(editing.value.id)
  if (point) {
    props.editor.beginCollabTransaction('UpdatePointCommand')
    props.editor.updatePoint(editing.value.id, {
      name: editPoint.name,
      nameVisible: editPoint.nameVisible,
      valueVisible: editPoint.valueVisible,
      visible: editPoint.visible,
    })
    if (editPoint.userLocked !== isPointCoordinateLocked(point)) {
      props.editor.setPointLockState(editing.value.id, editPoint.userLocked)
    }
    // 约束点不通过 xyz 编辑位置，由参数化编辑器处理
    if (!isPointObjectConstrained(point)) {
      applyPointPosition(editing.value.id, editPoint.x, editPoint.y, editPoint.z)
    }
    props.editor.commitCollabTransaction()
  } else {
    applyPointPosition(editing.value.id, editPoint.x, editPoint.y, editPoint.z)
  }
}

const applyEditLine = () => {
  if (!editing.value || editing.value.type !== 'line') return
  const line = props.scene.lines.get(editing.value.id)
  if (!line) return
  const previousUserLocked = props.editor.isLineLocked(line)
  const previousLengthLocked = line.lengthLocked
  const previousLockedLength = line.lockedLength
  const parsedLockedLength = Number(editLine.lockedLength)
  props.editor.beginCollabTransaction('UpdateLineCommand')
  props.editor.updateLine(editing.value.id, {
    name: editLine.name,
    nameVisible: editLine.nameVisible,
    valueVisible: editLine.valueVisible,
    visible: editLine.visible,
    lengthLocked: editLine.lengthLocked,
    lockedLength: Number.isFinite(parsedLockedLength) ? parsedLockedLength : undefined,
  })
  if (editLine.userLocked !== previousUserLocked) {
    props.editor.setLineLockState(editing.value.id, editLine.userLocked)
  }

  const updatedLine = props.scene.lines.get(editing.value.id)
  if (!updatedLine) { props.editor.commitCollabTransaction(); return }
  if (props.editor.isLineLocked(updatedLine)) { props.editor.commitCollabTransaction(); return }

  const constraintChanged =
    editLine.lengthLocked !== previousLengthLocked ||
    (editLine.lengthLocked &&
      Number.isFinite(parsedLockedLength) &&
      Math.abs(parsedLockedLength - previousLockedLength) > 1e-6)
  if (constraintChanged) { props.editor.commitCollabTransaction(); return }

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
    props.editor.commitCollabTransaction()
    return
  }

  if (!updatedLine.lengthLocked) {
    applyPointPosition(updatedLine.p1.id, editLine.p1.x, editLine.p1.y, editLine.p1.z)
    applyPointPosition(updatedLine.p2.id, editLine.p2.x, editLine.p2.y, editLine.p2.z)
    props.editor.commitCollabTransaction()
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
  props.editor.commitCollabTransaction()
}
const applyEditRay = () => {
  if (!editing.value || editing.value.type !== 'ray') return
  const ray = props.scene.rays.get(editing.value.id)
  if (!ray) return
  const previousUserLocked = props.editor.isRayLocked(ray)
  const displayLength = Number(editRay.displayLength)
  props.editor.beginCollabTransaction('UpdateRayCommand')
  props.editor.updateRay(editing.value.id, {
    name: editRay.name,
    nameVisible: editRay.nameVisible,
    valueVisible: editRay.valueVisible,
    visible: editRay.visible,
    displayLength: Number.isFinite(displayLength) ? displayLength : undefined,
  })
  if (editRay.userLocked !== previousUserLocked) {
    props.editor.setRayLockState(editing.value.id, editRay.userLocked)
  }
  const updatedRay = props.scene.rays.get(editing.value.id)
  if (!updatedRay || props.editor.isRayLocked(updatedRay)) { props.editor.commitCollabTransaction(); return }
  applyPointPosition(ray.p1.id, editRay.p1.x, editRay.p1.y, editRay.p1.z)
  applyPointPosition(ray.p2.id, editRay.p2.x, editRay.p2.y, editRay.p2.z)
  props.editor.commitCollabTransaction()
}
const applyEditVector = () => {
  if (!editing.value || editing.value.type !== 'vector') return
  const vector = props.scene.vectors.get(editing.value.id)
  if (!vector) return
  const previousUserLocked = props.editor.isVectorLocked(vector)
  props.editor.beginCollabTransaction('UpdateVectorCommand')
  props.editor.updateVector(editing.value.id, {
    name: editVector.name,
    nameVisible: editVector.nameVisible,
    valueVisible: editVector.valueVisible,
    visible: editVector.visible,
  })
  if (editVector.userLocked !== previousUserLocked) {
    props.editor.setVectorLockState(editing.value.id, editVector.userLocked)
  }

  const updatedVector = props.scene.vectors.get(editing.value.id)
  if (!updatedVector || props.editor.isVectorLocked(updatedVector)) { props.editor.commitCollabTransaction(); return }

  const isLengthFocused = !!focusedCoord['vector.length']
  const previousLength = updatedVector.getLength()
  const parsedLength = Number(editVector.length)
  const lengthChanged =
    Number.isFinite(parsedLength) &&
    parsedLength >= 0 &&
    Math.abs(parsedLength - previousLength) > 1e-6

  if (isLengthFocused && lengthChanged) {
    if (previousLength > 1e-6) {
      const scale = parsedLength / previousLength
      const newP2 = new Vec3(
        updatedVector.p1.position.x +
          (updatedVector.p2.position.x - updatedVector.p1.position.x) * scale,
        updatedVector.p1.position.y +
          (updatedVector.p2.position.y - updatedVector.p1.position.y) * scale,
        updatedVector.p1.position.z +
          (updatedVector.p2.position.z - updatedVector.p1.position.z) * scale,
      )
      props.editor.setPointPosition(updatedVector.p2.id, newP2)
    } else if (parsedLength > 1e-6) {
      const dir = updatedVector.getNormalizedDirectionVector()
      const newP2 = new Vec3(
        updatedVector.p1.position.x + dir.x * parsedLength,
        updatedVector.p1.position.y + dir.y * parsedLength,
        updatedVector.p1.position.z + dir.z * parsedLength,
      )
      props.editor.setPointPosition(updatedVector.p2.id, newP2)
    } else {
      props.editor.setPointPosition(
        updatedVector.p2.id,
        new Vec3(
          updatedVector.p1.position.x,
          updatedVector.p1.position.y,
          updatedVector.p1.position.z,
        ),
      )
    }
    props.editor.commitCollabTransaction()
    return
  }

  const p1x = Number(editVector.p1.x)
  const p1y = Number(editVector.p1.y)
  const p1z = Number(editVector.p1.z)
  const p2x = Number(editVector.p2.x)
  const p2y = Number(editVector.p2.y)
  const p2z = Number(editVector.p2.z)

  const p1Changed =
    Number.isFinite(p1x) &&
    Number.isFinite(p1y) &&
    Number.isFinite(p1z) &&
    (Math.abs(p1x - updatedVector.p1.position.x) > 1e-6 ||
      Math.abs(p1y - updatedVector.p1.position.y) > 1e-6 ||
      Math.abs(p1z - updatedVector.p1.position.z) > 1e-6)
  const p2Changed =
    Number.isFinite(p2x) &&
    Number.isFinite(p2y) &&
    Number.isFinite(p2z) &&
    (Math.abs(p2x - updatedVector.p2.position.x) > 1e-6 ||
      Math.abs(p2y - updatedVector.p2.position.y) > 1e-6 ||
      Math.abs(p2z - updatedVector.p2.position.z) > 1e-6)

  if (p1Changed) {
    applyPointPosition(updatedVector.p1.id, editVector.p1.x, editVector.p1.y, editVector.p1.z)
  }
  if (p2Changed) {
    applyPointPosition(updatedVector.p2.id, editVector.p2.x, editVector.p2.y, editVector.p2.z)
  }
  props.editor.commitCollabTransaction()
}
const applyEditStraightLine = () => {
  if (!editing.value || editing.value.type !== 'straightLine') return
  const line = props.scene.straightLines.get(editing.value.id)
  if (!line) return
  const previousUserLocked = props.editor.isStraightLineLocked(line)
  const displayLength = Number(editStraightLine.displayLength)
  props.editor.beginCollabTransaction('UpdateStraightLineCommand')
  props.editor.updateStraightLine(editing.value.id, {
    name: editStraightLine.name,
    nameVisible: editStraightLine.nameVisible,
    valueVisible: editStraightLine.valueVisible,
    visible: editStraightLine.visible,
    displayLength: Number.isFinite(displayLength) ? displayLength : undefined,
  })
  if (editStraightLine.userLocked !== previousUserLocked) {
    props.editor.setStraightLineLockState(editing.value.id, editStraightLine.userLocked)
  }
  const updatedLine = props.scene.straightLines.get(editing.value.id)
  if (!updatedLine || props.editor.isStraightLineLocked(updatedLine)) { props.editor.commitCollabTransaction(); return }
  applyPointPosition(
    line.p1.id,
    editStraightLine.p1.x,
    editStraightLine.p1.y,
    editStraightLine.p1.z,
  )
  applyPointPosition(
    line.p2.id,
    editStraightLine.p2.x,
    editStraightLine.p2.y,
    editStraightLine.p2.z,
  )
  props.editor.commitCollabTransaction()
}
const applyEditPerpendicularLine = () => {
  if (!editing.value || editing.value.type !== 'perpendicularLine') return
  const line = props.scene.perpendicularLines.get(editing.value.id)
  if (!line) return
  const displayLength = Number(editPerpendicularLine.displayLength)
  props.editor.beginCollabTransaction('UpdatePerpendicularLineCommand')
  props.editor.updatePerpendicularLine(editing.value.id, {
    name: editPerpendicularLine.name,
    nameVisible: editPerpendicularLine.nameVisible,
    valueVisible: editPerpendicularLine.valueVisible,
    visible: editPerpendicularLine.visible,
    displayLength: Number.isFinite(displayLength) ? displayLength : undefined,
  })
  if (editPerpendicularLine.userLocked !== line.userLocked) {
    props.editor.setPerpendicularLineLockState(editing.value.id, editPerpendicularLine.userLocked)
  }
  const updatedLine = props.scene.perpendicularLines.get(editing.value.id)
  if (!updatedLine || updatedLine.userLocked) { props.editor.commitCollabTransaction(); return }
  applyPointPosition(
    line.p1.id,
    editPerpendicularLine.p1.x,
    editPerpendicularLine.p1.y,
    editPerpendicularLine.p1.z,
  )
  props.editor.commitCollabTransaction()
}
const applyEditParallelLine = () => {
  if (!editing.value || editing.value.type !== 'parallelLine') return
  const line = props.scene.parallelLines.get(editing.value.id)
  if (!line) return
  const displayLength = Number(editParallelLine.displayLength)
  props.editor.beginCollabTransaction('UpdateParallelLineCommand')
  props.editor.updateParallelLine(editing.value.id, {
    name: editParallelLine.name,
    nameVisible: editParallelLine.nameVisible,
    valueVisible: editParallelLine.valueVisible,
    visible: editParallelLine.visible,
    displayLength: Number.isFinite(displayLength) ? displayLength : undefined,
  })
  if (editParallelLine.userLocked !== line.userLocked) {
    props.editor.setParallelLineLockState(editing.value.id, editParallelLine.userLocked)
  }
  const updatedLine = props.scene.parallelLines.get(editing.value.id)
  if (!updatedLine || updatedLine.userLocked) { props.editor.commitCollabTransaction(); return }
  applyPointPosition(
    line.p1.id,
    editParallelLine.p1.x,
    editParallelLine.p1.y,
    editParallelLine.p1.z,
  )
  props.editor.commitCollabTransaction()
}
const applyEditFace = () => {
  if (!editing.value || editing.value.type !== 'face') return
  const face = props.scene.faces.get(editing.value.id)
  if (!face) return
  props.editor.beginCollabTransaction('UpdateFaceCommand')
  props.editor.updateFace(editing.value.id, {
    name: editFace.name,
    nameVisible: editFace.nameVisible,
    valueVisible: editFace.valueVisible,
    visible: editFace.visible,
  })
  if (editFace.userLocked !== props.editor.isFaceLocked(face)) {
    props.editor.setFaceLockState(editing.value.id, editFace.userLocked)
  }
  if (editFace.areaLocked !== face.areaLocked) {
    props.editor.setFaceAreaLockState(editing.value.id, editFace.areaLocked)
  }
  props.editor.commitCollabTransaction()
}
const applyEditCircle = () => {
  if (!editing.value || editing.value.type !== 'circle') return
  const circle = props.scene.circles.get(editing.value.id)
  if (!circle) return
  props.editor.beginCollabTransaction('UpdateCircleCommand')
  const patch: Parameters<typeof props.editor.updateCircle>[1] = {
    name: editCircle.name,
    nameVisible: editCircle.nameVisible,
    valueVisible: editCircle.valueVisible,
    visible: editCircle.visible,
    centerVisible: editCircle.centerVisible,
  }
  if (circle.isNormalCircle()) {
    const r = parseFloat(editCircle.lockedRadius)
    if (!isNaN(r) && r >= LENGTH_MIN) {
      patch.lockedRadius = r
    }
  }
  props.editor.updateCircle(editing.value.id, patch)
  if (editCircle.userLocked !== props.editor.isCircleLocked(circle)) {
    props.editor.setCircleLockState(editing.value.id, editCircle.userLocked)
  }
  props.editor.commitCollabTransaction()
}
const getEditingHexahedronState = () => {
  if (!editing.value || editing.value.type !== 'hexahedron') return null
  const constraint = props.editor.getCubeConstraint(editing.value.id)
  if (!constraint) return null
  const ownerPoints = getHexahedronOwnerPoints(editing.value.id)
  if (ownerPoints.length < 2) return null
  return {
    cubeId: editing.value.id,
    constraint,
    ownerPoints: [ownerPoints[0]!, ownerPoints[1]!] as [Point3, Point3],
  }
}
const getEditingCircleState = () => {
  if (!editing.value || editing.value.type !== 'circle') return null
  const circle = props.scene.circles.get(editing.value.id)
  if (!circle) return null
  return { circleId: editing.value.id, circle }
}
const applyCirclePointCoord = (pointKey: 'p1' | 'p2' | 'p3') => {
  const state = getEditingCircleState()
  if (!state) return
  const point = state.circle[pointKey]
  const nextPosition = {
    x: Number(editCircle[pointKey].x),
    y: Number(editCircle[pointKey].y),
    z: Number(editCircle[pointKey].z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  )
    return
  if (isPointCoordinateLocked(point)) return
  props.editor.setPointPosition(point.id, new Vec3(nextPosition.x, nextPosition.y, nextPosition.z))
}
const nudgeCirclePointCoord = (
  pointKey: 'p1' | 'p2' | 'p3',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`circle.${pointKey}.${axis}`, direction)
  if (nextValue === null) return
  editCircle[pointKey][axis] = nextValue
  applyCirclePointCoord(pointKey)
}
const nudgeNormalCircleRadius = (direction: 'up' | 'down') => {
  hideLengthBubble('circle.lockedRadius')
  const state = getEditingCircleState()
  if (!state) return
  const current = parseFloat(editCircle.lockedRadius)
  if (isNaN(current) || current < 0) return
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('circle.lockedRadius', '已减到最小值')
    return
  }
  const step = 0.1
  let next: number
  if (direction === 'up') {
    next = Math.ceil((current + 1e-9) / step) * step
    if (next <= current) next += step
  } else {
    next = Math.floor((current - 1e-9) / step) * step
    if (next >= current) next -= step
  }
  next = Math.max(LENGTH_MIN, next)
  editCircle.lockedRadius = String(Math.round(next * 100) / 100)
  applyEditCircle()
}
const applyThreePointCircleRadius = () => {
  const state = getEditingCircleState()
  if (!state) return
  const circle = state.circle
  if (circle.isNormalCircle()) return
  const newRadius = parseFloat(editCircle.threePointRadius)
  if (isNaN(newRadius) || newRadius < LENGTH_MIN) return
  const frame = circle.getFrame()
  if (!frame) return
  const currentRadius = frame.radius
  if (Math.abs(currentRadius) < 1e-10) return
  const scale = newRadius / currentRadius
  const center = frame.center
  const points = [circle.p1, circle.p2, circle.p3]
  for (const p of points) {
    const dx = p.position.x - center.x
    const dy = p.position.y - center.y
    const dz = p.position.z - center.z
    props.editor.setPointPosition(
      p.id,
      new Vec3(center.x + dx * scale, center.y + dy * scale, center.z + dz * scale),
    )
  }
}
const nudgeThreePointCircleRadius = (direction: 'up' | 'down') => {
  hideLengthBubble('circle.threePointRadius')
  const current = parseFloat(editCircle.threePointRadius)
  if (isNaN(current) || current < 0) return
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('circle.threePointRadius', '已减到最小值')
    return
  }
  const step = 0.1
  let next: number
  if (direction === 'up') {
    next = Math.ceil((current + 1e-9) / step) * step
    if (next <= current) next += step
  } else {
    next = Math.floor((current - 1e-9) / step) * step
    if (next >= current) next -= step
  }
  next = Math.max(LENGTH_MIN, next)
  editCircle.threePointRadius = String(Math.round(next * 100) / 100)
  applyThreePointCircleRadius()
}
const handleCirclePointCoordFocus = (pointKey: 'p1' | 'p2' | 'p3', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`circle.${pointKey}.${axis}`, true)
}
const handleCirclePointCoordBlur = (pointKey: 'p1' | 'p2' | 'p3', axis: 'x' | 'y' | 'z') => {
  editCircle[pointKey][axis] = normalizeCoord(editCircle[pointKey][axis])
  setCoordFocus(`circle.${pointKey}.${axis}`, false)
  applyCirclePointCoord(pointKey)
}
const applyHexahedronMeta = () => {
  const state = getEditingHexahedronState()
  if (!state) return
  props.editor.beginCollabTransaction('UpdateHexahedronCommand')
  props.editor.updateCube(state.cubeId, {
    name: `${state.constraint.solidType === 'tetrahedron' ? '正四面体' : '正六面体'}${editHexahedron.nameSuffix.trim()}`,
    valueVisible: editHexahedron.valueVisible,
    edgeLengthLocked: editHexahedron.edgeLengthLocked,
  })
  props.editor.setCubeLockState(state.cubeId, editHexahedron.userLocked)
  props.editor.commitCollabTransaction()
}
const applyHexahedronEdgeLength = () => {
  const state = getEditingHexahedronState()
  if (!state) return
  const edgeLength = Number(editHexahedron.edgeLength)
  if (!Number.isFinite(edgeLength)) return
  props.editor.updateCubeEdgeLength(state.cubeId, edgeLength)
}
const applyHexahedronOwnerPoint = (pointKey: 'p1' | 'p2') => {
  const state = getEditingHexahedronState()
  if (!state) return
  const pointIndex = pointKey === 'p1' ? 0 : 1
  const point = state.ownerPoints[pointIndex]
  if (!point) return
  const nextPosition = {
    x: Number(editHexahedron[pointKey].x),
    y: Number(editHexahedron[pointKey].y),
    z: Number(editHexahedron[pointKey].z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  ) {
    return
  }
  if (
    Math.abs(nextPosition.x - point.position.x) <= 1e-6 &&
    Math.abs(nextPosition.y - point.position.y) <= 1e-6 &&
    Math.abs(nextPosition.z - point.position.z) <= 1e-6
  ) {
    return
  }
  props.editor.setPointPosition(point.id, new Vec3(nextPosition.x, nextPosition.y, nextPosition.z))
}

const getEditingPrismState = () => {
  if (!editing.value || editing.value.type !== 'prism') return null
  const constraint = props.editor.getPrismConstraint(editing.value.id)
  if (!constraint) return null
  const ownerPoints = getPrismOwnerPoints(editing.value.id)
  if (ownerPoints.length < 2) return null
  return {
    prismId: editing.value.id,
    constraint,
    ownerPoints: [ownerPoints[0]!, ownerPoints[1]!] as [Point3, Point3],
  }
}
const applyPrismMeta = () => {
  const state = getEditingPrismState()
  if (!state) return
  props.editor.beginCollabTransaction('UpdatePrismCommand')
  props.editor.updatePrism(state.prismId, {
    name: `棱柱${editPrism.nameSuffix.trim()}`,
    valueVisible: editPrism.valueVisible,
    keepVertical: editPrism.keepVertical,
  })
  props.editor.setPrismLockState(state.prismId, editPrism.userLocked)
  props.editor.commitCollabTransaction()
}
const applyPrismTopPoint = () => {
  const state = getEditingPrismState()
  if (!state) return
  const topPoint = state.ownerPoints[1]
  if (!topPoint) return
  if (props.editor.isPointCoordinateLocked(topPoint)) return
  const nextPosition = {
    x: Number(editPrism.topPoint.x),
    y: Number(editPrism.topPoint.y),
    z: Number(editPrism.topPoint.z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  ) {
    return
  }
  if (
    Math.abs(nextPosition.x - topPoint.position.x) <= 1e-6 &&
    Math.abs(nextPosition.y - topPoint.position.y) <= 1e-6 &&
    Math.abs(nextPosition.z - topPoint.position.z) <= 1e-6
  ) {
    return
  }

  let targetPosition = new Vec3(nextPosition.x, nextPosition.y, nextPosition.z)

  // 垂直保持模式下，将目标点约束到底面法线方向上，保证侧棱垂直。
  // 只使用与底面法线最对齐的坐标轴来反推高度，其余两轴在 UI 中已被禁用，
  // 避免 x/z 等法线小分量轴导致高度剧烈跳变。
  if (state.constraint.keepVertical) {
    const basis = state.constraint.getBottomPlaneBasis()
    const baseRefVertex = state.ownerPoints[0]
    const axis = getPrismVerticalDominantAxis(state.constraint.prismId)
    if (basis && baseRefVertex && axis) {
      const normal = basis.normal
      const getAxis = (v: Vec3, a: typeof axis) => (a === 'x' ? v.x : a === 'y' ? v.y : v.z)
      const n = getAxis(normal, axis)
      if (Math.abs(n) > 1e-3) {
        const signedHeight = (getAxis(targetPosition, axis) - getAxis(baseRefVertex.position, axis)) / n
        targetPosition = new Vec3(
          baseRefVertex.position.x + normal.x * signedHeight,
          baseRefVertex.position.y + normal.y * signedHeight,
          baseRefVertex.position.z + normal.z * signedHeight,
        )
      }
    }
  }

  props.editor.setPointPosition(topPoint.id, targetPosition)
  const axes = state.constraint.getResolvedAxes()
  if (axes) editPrism.height = toFixed2(axes.height)
}
const nudgePrismTopPointCoord = (
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const key = `prism.topPoint.${axis}`
  const nextValue = stepCoordInput(key, direction)
  if (nextValue === null) return
  editPrism.topPoint[axis] = toFixed2(Number(nextValue))
  // 保持输入框聚焦，避免垂直约束求解后马上把坐标刷新回实际位置，
  // 让用户先看到本次增减后的值。
  const input = coordInputs.get(key)
  if (input) input.focus()
  applyPrismTopPoint()
}
const handlePrismTopPointCoordFocus = (axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`prism.topPoint.${axis}`, true)
}
const handlePrismTopPointCoordBlur = (axis: 'x' | 'y' | 'z') => {
  editPrism.topPoint[axis] = normalizeCoord(editPrism.topPoint[axis])
  setCoordFocus(`prism.topPoint.${axis}`, false)
  applyPrismTopPoint()
}
const applyPrismHeight = () => {
  const state = getEditingPrismState()
  if (!state) return
  if (state.ownerPoints[1] && props.editor.isPointCoordinateLocked(state.ownerPoints[1])) return
  const axes = state.constraint.getResolvedAxes()
  if (!axes) return
  const nextHeight = Number(editPrism.height)
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) return
  if (Math.abs(nextHeight - axes.height) <= 1e-6) return

  const baseRefVertex = state.ownerPoints[0]
  if (!baseRefVertex) return

  let direction: Vec3
  if (state.constraint.keepVertical) {
    const basis = state.constraint.getBottomPlaneBasis()
    if (!basis) return
    // 保持当前所在侧：缓存高度为负表示最高点在法线反方向（底面下方）
    const rawHeight = state.constraint.getRawVerticalHeight()
    const sign = rawHeight !== null && rawHeight < 0 ? -1 : 1
    direction = new Vec3(basis.normal.x * sign, basis.normal.y * sign, basis.normal.z * sign)
  } else {
    const dirLength = Math.hypot(axes.translation.x, axes.translation.y, axes.translation.z)
    if (dirLength <= 1e-8) return
    direction = new Vec3(
      axes.translation.x / dirLength,
      axes.translation.y / dirLength,
      axes.translation.z / dirLength,
    )
  }

  const newPosition = new Vec3(
    baseRefVertex.position.x + direction.x * nextHeight,
    baseRefVertex.position.y + direction.y * nextHeight,
    baseRefVertex.position.z + direction.z * nextHeight,
  )
  props.editor.setPointPosition(state.ownerPoints[1]!.id, newPosition)
  editPrism.topPoint.x = toFixed2(newPosition.x)
  editPrism.topPoint.y = toFixed2(newPosition.y)
  editPrism.topPoint.z = toFixed2(newPosition.z)
}
const nudgePrismHeight = (direction: 'up' | 'down') => {
  const state = getEditingPrismState()
  if (!state) return
  if (state.ownerPoints[1] && props.editor.isPointCoordinateLocked(state.ownerPoints[1])) return
  const key = 'prism.height'
  hideLengthBubble(key)
  const current = Number(editPrism.height)
  if (direction === 'down' && current <= 0.1) {
    showLengthBubble(key, '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editPrism.height = next.toFixed(2)
  applyPrismHeight()
}
const handlePrismHeightFocus = () => {
  setCoordFocus('prism.height', true)
}
const handlePrismHeightBlur = () => {
  hideLengthBubble('prism.height')
  editPrism.height = normalizeFaceEdgeLength(editPrism.height)
  setCoordFocus('prism.height', false)
  applyPrismHeight()
}

const applyPrismBottomEdgeLength = (edgeIndex: number) => {
  const state = getEditingPrismState()
  if (!state) return
  const bottomFace = props.scene.faces.get(state.constraint.bottomFaceId)
  if (!bottomFace) return
  if (bottomFace.userLocked) return
  const nextLength = Number(editPrism.bottomEdgeLengths[edgeIndex])
  if (!Number.isFinite(nextLength)) return
  const key = `prism.bottomEdge.${edgeIndex}`
  const targets = editPrism.bottomEdgeLengths.map((value, index) => {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0.01, parsed)
    return bottomFace.getEdgeLength(props.scene.points, index)
  })
  const success = props.editor.updateFaceBoundaryEdgeLength(bottomFace.id, edgeIndex, nextLength, targets)
  if (!success) {
    showLengthBubble(key, '不满足多边形边长约束，无法更新')
    // 恢复为实际边长
    editPrism.bottomEdgeLengths[edgeIndex] = toFixed2(bottomFace.getEdgeLength(props.scene.points, edgeIndex))
  }
}
const nudgePrismBottomEdgeLength = (edgeIndex: number, direction: 'up' | 'down') => {
  const state = getEditingPrismState()
  if (!state) return
  const bottomFace = props.scene.faces.get(state.constraint.bottomFaceId)
  if (!bottomFace || bottomFace.userLocked) return
  const key = `prism.bottomEdge.${edgeIndex}`
  hideLengthBubble(key)
  const current = Number(editPrism.bottomEdgeLengths[edgeIndex])
  if (direction === 'down' && current <= 0.1) {
    showLengthBubble(key, '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editPrism.bottomEdgeLengths[edgeIndex] = next.toFixed(2)
  applyPrismBottomEdgeLength(edgeIndex)
}
const handlePrismBottomEdgeLengthFocus = (edgeIndex: number) => {
  setCoordFocus(`prism.bottomEdge.${edgeIndex}`, true)
}
const handlePrismBottomEdgeLengthBlur = (edgeIndex: number) => {
  const key = `prism.bottomEdge.${edgeIndex}`
  hideLengthBubble(key)
  const prev = editPrism.bottomEdgeLengths[edgeIndex] ?? ''
  editPrism.bottomEdgeLengths[edgeIndex] = clampLengthValue(
    key,
    editPrism.bottomEdgeLengths[edgeIndex] ?? '',
    prev,
  )
  editPrism.bottomEdgeLengths[edgeIndex] = normalizeFaceEdgeLength(editPrism.bottomEdgeLengths[edgeIndex] ?? '')
  setCoordFocus(key, false)
  applyPrismBottomEdgeLength(edgeIndex)
}

const getEditingPyramidState = () => {
  if (!editing.value || editing.value.type !== 'pyramid') return null
  const constraint = props.editor.getPyramidConstraint(editing.value.id)
  if (!constraint) return null
  const ownerPoints = getPyramidOwnerPoints(editing.value.id)
  if (ownerPoints.length < 2) return null
  return {
    pyramidId: editing.value.id,
    constraint,
    ownerPoints: [ownerPoints[0]!, ownerPoints[1]!] as [Point3, Point3],
  }
}
const applyPyramidMeta = () => {
  const state = getEditingPyramidState()
  if (!state) return
  props.editor.beginCollabTransaction('UpdatePyramidCommand')
  props.editor.updatePyramid(state.pyramidId, {
    name: `棱锥${editPyramid.nameSuffix.trim()}`,
    valueVisible: editPyramid.valueVisible,
    keepVertical: editPyramid.keepVertical,
  })
  props.editor.setPyramidLockState(state.pyramidId, editPyramid.userLocked)
  props.editor.commitCollabTransaction()
}
const applyPyramidApexPoint = () => {
  const state = getEditingPyramidState()
  if (!state) return
  const apexPoint = state.ownerPoints[1]
  if (!apexPoint) return
  if (props.editor.isPointCoordinateLocked(apexPoint)) return
  const nextPosition = {
    x: Number(editPyramid.apexPoint.x),
    y: Number(editPyramid.apexPoint.y),
    z: Number(editPyramid.apexPoint.z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  ) {
    return
  }
  if (
    Math.abs(nextPosition.x - apexPoint.position.x) <= 1e-6 &&
    Math.abs(nextPosition.y - apexPoint.position.y) <= 1e-6 &&
    Math.abs(nextPosition.z - apexPoint.position.z) <= 1e-6
  ) {
    return
  }

  let targetPosition = new Vec3(nextPosition.x, nextPosition.y, nextPosition.z)

  // 垂直保持模式下，将目标点约束到底面法线方向上，保证侧棱垂直。
  // 只使用与底面法线最对齐的坐标轴来反推高度，其余两轴在 UI 中已被禁用，
  // 避免 x/z 等法线小分量轴导致高度剧烈跳变。
  if (state.constraint.keepVertical) {
    const basis = state.constraint.getBottomPlaneBasis()
    const centroid = state.constraint.getBottomCentroid()
    const axis = getPyramidVerticalDominantAxis(state.constraint.pyramidId)
    if (basis && centroid && axis) {
      const normal = basis.normal
      const getAxis = (v: Vec3, a: typeof axis) => (a === 'x' ? v.x : a === 'y' ? v.y : v.z)
      const n = getAxis(normal, axis)
      if (Math.abs(n) > 1e-3) {
        const signedHeight = (getAxis(targetPosition, axis) - getAxis(centroid, axis)) / n
        targetPosition = new Vec3(
          centroid.x + normal.x * signedHeight,
          centroid.y + normal.y * signedHeight,
          centroid.z + normal.z * signedHeight,
        )
      }
    }
  }

  props.editor.setPointPosition(apexPoint.id, targetPosition)
  const axes = state.constraint.getResolvedAxes()
  if (axes) editPyramid.height = toFixed2(axes.height)
}
const nudgePyramidApexPointCoord = (
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const key = `pyramid.apexPoint.${axis}`
  const nextValue = stepCoordInput(key, direction)
  if (nextValue === null) return
  editPyramid.apexPoint[axis] = toFixed2(Number(nextValue))
  // 保持输入框聚焦，避免垂直约束求解后马上把坐标刷新回实际位置，
  // 让用户先看到本次增减后的值。
  const input = coordInputs.get(key)
  if (input) input.focus()
  applyPyramidApexPoint()
}
const handlePyramidApexPointCoordFocus = (axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`pyramid.apexPoint.${axis}`, true)
}
const handlePyramidApexPointCoordBlur = (axis: 'x' | 'y' | 'z') => {
  editPyramid.apexPoint[axis] = normalizeCoord(editPyramid.apexPoint[axis])
  setCoordFocus(`pyramid.apexPoint.${axis}`, false)
  applyPyramidApexPoint()
}
const applyPyramidHeight = () => {
  const state = getEditingPyramidState()
  if (!state) return
  if (state.ownerPoints[1] && props.editor.isPointCoordinateLocked(state.ownerPoints[1])) return
  const axes = state.constraint.getResolvedAxes()
  if (!axes) return
  const nextHeight = Number(editPyramid.height)
  if (!Number.isFinite(nextHeight) || nextHeight <= 0) return
  if (Math.abs(nextHeight - axes.height) <= 1e-6) return

  let direction: Vec3
  if (state.constraint.keepVertical) {
    const basis = state.constraint.getBottomPlaneBasis()
    if (!basis) return
    // 保持当前所在侧：缓存高度为负表示最高点在法线反方向（底面下方）
    const rawHeight = state.constraint.getRawVerticalHeight()
    const sign = rawHeight !== null && rawHeight < 0 ? -1 : 1
    direction = new Vec3(basis.normal.x * sign, basis.normal.y * sign, basis.normal.z * sign)
  } else {
    const dirLength = Math.hypot(axes.translation.x, axes.translation.y, axes.translation.z)
    if (dirLength <= 1e-8) return
    direction = new Vec3(
      axes.translation.x / dirLength,
      axes.translation.y / dirLength,
      axes.translation.z / dirLength,
    )
  }

  const newPosition = new Vec3(
    axes.origin.x + direction.x * nextHeight,
    axes.origin.y + direction.y * nextHeight,
    axes.origin.z + direction.z * nextHeight,
  )
  props.editor.setPointPosition(state.ownerPoints[1]!.id, newPosition)
  editPyramid.apexPoint.x = toFixed2(newPosition.x)
  editPyramid.apexPoint.y = toFixed2(newPosition.y)
  editPyramid.apexPoint.z = toFixed2(newPosition.z)
}
const nudgePyramidHeight = (direction: 'up' | 'down') => {
  const state = getEditingPyramidState()
  if (!state) return
  if (state.ownerPoints[1] && props.editor.isPointCoordinateLocked(state.ownerPoints[1])) return
  const key = 'pyramid.height'
  hideLengthBubble(key)
  const current = Number(editPyramid.height)
  if (direction === 'down' && current <= 0.1) {
    showLengthBubble(key, '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editPyramid.height = next.toFixed(2)
  applyPyramidHeight()
}
const handlePyramidHeightFocus = () => {
  setCoordFocus('pyramid.height', true)
}
const handlePyramidHeightBlur = () => {
  hideLengthBubble('pyramid.height')
  editPyramid.height = normalizeFaceEdgeLength(editPyramid.height)
  setCoordFocus('pyramid.height', false)
  applyPyramidHeight()
}

const applyPyramidBottomEdgeLength = (edgeIndex: number) => {
  const state = getEditingPyramidState()
  if (!state) return
  const bottomFace = props.scene.faces.get(state.constraint.bottomFaceId)
  if (!bottomFace) return
  if (bottomFace.userLocked) return
  const nextLength = Number(editPyramid.bottomEdgeLengths[edgeIndex])
  if (!Number.isFinite(nextLength)) return
  const key = `pyramid.bottomEdge.${edgeIndex}`
  const targets = editPyramid.bottomEdgeLengths.map((value, index) => {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0.01, parsed)
    return bottomFace.getEdgeLength(props.scene.points, index)
  })
  const success = props.editor.updateFaceBoundaryEdgeLength(bottomFace.id, edgeIndex, nextLength, targets)
  if (!success) {
    showLengthBubble(key, '不满足多边形边长约束，无法更新')
    // 恢复为实际边长
    editPyramid.bottomEdgeLengths[edgeIndex] = toFixed2(bottomFace.getEdgeLength(props.scene.points, edgeIndex))
  }
}
const nudgePyramidBottomEdgeLength = (edgeIndex: number, direction: 'up' | 'down') => {
  const state = getEditingPyramidState()
  if (!state) return
  const bottomFace = props.scene.faces.get(state.constraint.bottomFaceId)
  if (!bottomFace || bottomFace.userLocked) return
  const key = `pyramid.bottomEdge.${edgeIndex}`
  hideLengthBubble(key)
  const current = Number(editPyramid.bottomEdgeLengths[edgeIndex])
  if (direction === 'down' && current <= 0.1) {
    showLengthBubble(key, '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 1, direction)
  editPyramid.bottomEdgeLengths[edgeIndex] = next.toFixed(2)
  applyPyramidBottomEdgeLength(edgeIndex)
}
const handlePyramidBottomEdgeLengthFocus = (edgeIndex: number) => {
  setCoordFocus(`pyramid.bottomEdge.${edgeIndex}`, true)
}
const handlePyramidBottomEdgeLengthBlur = (edgeIndex: number) => {
  const key = `pyramid.bottomEdge.${edgeIndex}`
  hideLengthBubble(key)
  const prev = editPyramid.bottomEdgeLengths[edgeIndex] ?? ''
  editPyramid.bottomEdgeLengths[edgeIndex] = clampLengthValue(
    key,
    editPyramid.bottomEdgeLengths[edgeIndex] ?? '',
    prev,
  )
  editPyramid.bottomEdgeLengths[edgeIndex] = normalizeFaceEdgeLength(editPyramid.bottomEdgeLengths[edgeIndex] ?? '')
  setCoordFocus(key, false)
  applyPyramidBottomEdgeLength(edgeIndex)
}

const getEditingRegularPolygonState = () => {
  if (!editing.value || editing.value.type !== 'regularPolygon') return null
  const constraint = props.editor.getRegularPolygonConstraint(editing.value.id)
  if (!constraint) return null
  const ownerPoints = props.editor.getRegularPolygonOwnerPoints(editing.value.id)
  return { constraintId: editing.value.id, constraint, ownerPoints }
}

const applyRegularPolygonMeta = () => {
  const state = getEditingRegularPolygonState()
  if (!state) return
  props.editor.updateRegularPolygon(state.constraintId, {
    name: `正多边形${editRegularPolygon.nameSuffix.trim()}`,
    nameVisible: editRegularPolygon.nameVisible,
    valueVisible: editRegularPolygon.valueVisible,
    edgeLengthLocked: editRegularPolygon.edgeLengthLocked,
  })
  props.editor.setRegularPolygonLockState(state.constraintId, editRegularPolygon.userLocked)
}

const applyRegularPolygonEdgeLength = () => {
  const state = getEditingRegularPolygonState()
  if (!state) return
  const edgeLength = Number(editRegularPolygon.edgeLength)
  if (!Number.isFinite(edgeLength)) return
  props.editor.updateRegularPolygonEdgeLength(state.constraintId, edgeLength)
}

const applyRegularPolygonOwnerPoint = (pointKey: 'p1' | 'p2') => {
  const state = getEditingRegularPolygonState()
  if (!state) return
  const pointIndex = pointKey === 'p1' ? 0 : 1
  const point = state.ownerPoints[pointIndex]
  if (!point) return
  const nextPosition = {
    x: Number(editRegularPolygon[pointKey].x),
    y: Number(editRegularPolygon[pointKey].y),
    z: Number(editRegularPolygon[pointKey].z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  ) {
    return
  }
  if (
    Math.abs(nextPosition.x - point.position.x) <= 1e-6 &&
    Math.abs(nextPosition.y - point.position.y) <= 1e-6 &&
    Math.abs(nextPosition.z - point.position.z) <= 1e-6
  ) {
    return
  }
  props.editor.setPointPosition(point.id, new Vec3(nextPosition.x, nextPosition.y, nextPosition.z))
}

const nudgeRegularPolygonEdgeLength = (direction: 'up' | 'down') => {
  hideLengthBubble('rp.edgeLength')
  const current = Number(editRegularPolygon.edgeLength)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('rp.edgeLength', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editRegularPolygon.edgeLength = next.toFixed(2)
  applyRegularPolygonEdgeLength()
}

const isRegularPolygonEdgeLengthInputDisabled = () =>
  editRegularPolygon.userLocked || editRegularPolygon.edgeLengthLocked

const handleRegularPolygonEdgeLengthFocus = () => {
  setCoordFocus('rp.edgeLength', true)
}

const handleRegularPolygonEdgeLengthBlur = () => {
  hideLengthBubble('rp.edgeLength')
  editRegularPolygon.edgeLength = clampLengthValue(
    'rp.edgeLength',
    editRegularPolygon.edgeLength,
    editRegularPolygon.edgeLength,
  )
  const n = Number(editRegularPolygon.edgeLength)
  editRegularPolygon.edgeLength = Number.isFinite(n)
    ? Math.max(LENGTH_MIN, n).toFixed(2)
    : editRegularPolygon.edgeLength
  setCoordFocus('rp.edgeLength', false)
  applyRegularPolygonEdgeLength()
}

const nudgeRegularPolygonOwnerCoord = (
  pointKey: 'p1' | 'p2',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const current = Number(editRegularPolygon[pointKey][axis])
  if (!Number.isFinite(current)) return
  const step = 0.5
  const next = direction === 'up' ? current + step : current - step
  editRegularPolygon[pointKey][axis] = toFixed2(next)
  applyRegularPolygonOwnerPoint(pointKey)
}

const handleRegularPolygonOwnerCoordFocus = (pointKey: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  setCoordFocus(`rp.${pointKey}.${axis}`, true)
}

const handleRegularPolygonOwnerCoordBlur = (pointKey: 'p1' | 'p2', axis: 'x' | 'y' | 'z') => {
  editRegularPolygon[pointKey][axis] = normalizeCoord(editRegularPolygon[pointKey][axis])
  setCoordFocus(`rp.${pointKey}.${axis}`, false)
  applyRegularPolygonOwnerPoint(pointKey)
}

const startEditSphere = (sphereId: string) => {
  const sphere = props.editor.getSphere(sphereId)
  if (!sphere) return
  editing.value = { type: 'sphere', id: sphereId }
  editSphere.nameSuffix = props.editor.getSphereNameSuffix(sphereId)
  editSphere.nameVisible = sphere.nameVisible !== false
  editSphere.valueVisible = sphere.valueVisible === true
  editSphere.userLocked = props.editor.isSphereGeometryLocked(sphere)
  editSphere.radius = toFixed2(props.editor.getSphereRadius(sphereId))
  const centerPoint = props.editor.getSphereCenterPoint(sphereId)
  const radiusPoint = props.editor.getSphereRadiusPoint(sphereId)
  editSphere.centerPoint.x = centerPoint ? toFixed2(centerPoint.position.x) : ''
  editSphere.centerPoint.y = centerPoint ? toFixed2(centerPoint.position.y) : ''
  editSphere.centerPoint.z = centerPoint ? toFixed2(centerPoint.position.z) : ''
  editSphere.radiusPoint.x = radiusPoint ? toFixed2(radiusPoint.position.x) : ''
  editSphere.radiusPoint.y = radiusPoint ? toFixed2(radiusPoint.position.y) : ''
  editSphere.radiusPoint.z = radiusPoint ? toFixed2(radiusPoint.position.z) : ''
}

const getEditingSphereState = () => {
  if (!editing.value || editing.value.type !== 'sphere') return null
  const sphere = props.editor.getSphere(editing.value.id)
  if (!sphere) return null
  return { sphereId: editing.value.id, sphere }
}

const applyEditSphereMeta = () => {
  const state = getEditingSphereState()
  if (!state) return
  const prefix = state.sphere.name.startsWith('半径球') ? '半径球' : '两点球'
  props.editor.beginCollabTransaction('UpdateSphereCommand')
  props.editor.updateSphere(state.sphereId, {
    name: `${prefix}${editSphere.nameSuffix.trim()}`,
    nameVisible: editSphere.nameVisible,
    valueVisible: editSphere.valueVisible,
  })
  props.editor.setSphereLockState(state.sphereId, editSphere.userLocked)
  props.editor.commitCollabTransaction()
}

const applyEditSphereRadius = () => {
  const state = getEditingSphereState()
  if (!state) return
  const nextRadius = Number(editSphere.radius)
  if (!Number.isFinite(nextRadius) || nextRadius < LENGTH_MIN) return
  props.editor.updateSphereRadius(state.sphereId, nextRadius)
}

const applySpherePointCoord = (pointKey: 'centerPoint' | 'radiusPoint') => {
  const state = getEditingSphereState()
  if (!state) return
  const point =
    pointKey === 'centerPoint'
      ? props.editor.getSphereCenterPoint(state.sphereId)
      : props.editor.getSphereRadiusPoint(state.sphereId)
  if (!point) return
  const nextPosition = {
    x: Number(editSphere[pointKey].x),
    y: Number(editSphere[pointKey].y),
    z: Number(editSphere[pointKey].z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  )
    return
  if (isPointCoordinateLocked(point)) return
  props.editor.setPointPosition(point.id, new Vec3(nextPosition.x, nextPosition.y, nextPosition.z))
}

const handleSphereRadiusFocus = () => {
  setCoordFocus('sphere.radius', true)
}

const handleSphereRadiusBlur = () => {
  hideLengthBubble('sphere.radius')
  editSphere.radius = clampLengthValue('sphere.radius', editSphere.radius, editSphere.radius)
  const n = Number(editSphere.radius)
  editSphere.radius = Number.isFinite(n) ? Math.max(LENGTH_MIN, n).toFixed(2) : editSphere.radius
  setCoordFocus('sphere.radius', false)
  applyEditSphereRadius()
}

const nudgeSphereRadius = (direction: 'up' | 'down') => {
  hideLengthBubble('sphere.radius')
  const current = Number(editSphere.radius)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('sphere.radius', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editSphere.radius = next.toFixed(2)
  applyEditSphereRadius()
}

const handleSpherePointCoordFocus = (
  pointKey: 'centerPoint' | 'radiusPoint',
  axis: 'x' | 'y' | 'z',
) => {
  setCoordFocus(`sphere.${pointKey}.${axis}`, true)
}

const handleSpherePointCoordBlur = (
  pointKey: 'centerPoint' | 'radiusPoint',
  axis: 'x' | 'y' | 'z',
) => {
  editSphere[pointKey][axis] = normalizeCoord(editSphere[pointKey][axis])
  setCoordFocus(`sphere.${pointKey}.${axis}`, false)
  applySpherePointCoord(pointKey)
}

const nudgeSpherePointCoord = (
  pointKey: 'centerPoint' | 'radiusPoint',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`sphere.${pointKey}.${axis}`, direction)
  if (nextValue === null) return
  editSphere[pointKey][axis] = nextValue
  applySpherePointCoord(pointKey)
}

const startEditCone = (coneId: string) => {
  const cone = props.editor.getCone(coneId)
  if (!cone) return
  editing.value = { type: 'cone', id: coneId }
  editCone.nameSuffix = props.editor.getConeNameSuffix(coneId)
  editCone.nameVisible = cone.nameVisible !== false
  editCone.valueVisible = cone.valueVisible === true
  editCone.userLocked = props.editor.isConeGeometryLocked(cone)
  editCone.radius = toFixed2(props.editor.getConeRadius(coneId))
  editCone.height = toFixed2(props.editor.getConeHeight(coneId))
  const baseCenterPoint = props.editor.getConeBaseCenterPoint(coneId)
  const apexPoint = props.editor.getConeApexPoint(coneId)
  editCone.baseCenterPoint.x = baseCenterPoint ? toFixed2(baseCenterPoint.position.x) : ''
  editCone.baseCenterPoint.y = baseCenterPoint ? toFixed2(baseCenterPoint.position.y) : ''
  editCone.baseCenterPoint.z = baseCenterPoint ? toFixed2(baseCenterPoint.position.z) : ''
  editCone.apexPoint.x = apexPoint ? toFixed2(apexPoint.position.x) : ''
  editCone.apexPoint.y = apexPoint ? toFixed2(apexPoint.position.y) : ''
  editCone.apexPoint.z = apexPoint ? toFixed2(apexPoint.position.z) : ''
}

const getEditingConeState = () => {
  if (!editing.value || editing.value.type !== 'cone') return null
  const cone = props.editor.getCone(editing.value.id)
  if (!cone) return null
  return { coneId: editing.value.id, cone }
}

const applyEditConeMeta = () => {
  const state = getEditingConeState()
  if (!state) return
  const prefix = state.cone.coneType === 'normalCircle' ? '法向圆锥' : '圆锥'
  props.editor.beginCollabTransaction('UpdateConeCommand')
  props.editor.updateCone(state.coneId, {
    name: `${prefix}${editCone.nameSuffix.trim()}`,
    nameVisible: editCone.nameVisible,
    valueVisible: editCone.valueVisible,
  })
  props.editor.setConeLockState(state.coneId, editCone.userLocked)
  props.editor.commitCollabTransaction()
}

const applyEditConeRadius = () => {
  const state = getEditingConeState()
  if (!state) return
  const nextRadius = Number(editCone.radius)
  if (!Number.isFinite(nextRadius) || nextRadius < LENGTH_MIN) return
  props.editor.updateConeRadius(state.coneId, nextRadius)
}

const applyEditConeHeight = () => {
  const state = getEditingConeState()
  if (!state) return
  const nextHeight = Number(editCone.height)
  if (!Number.isFinite(nextHeight) || nextHeight < LENGTH_MIN) return
  props.editor.updateConeHeight(state.coneId, nextHeight)
}

const applyConePointCoord = (pointKey: 'baseCenterPoint' | 'apexPoint') => {
  const state = getEditingConeState()
  if (!state) return
  const point =
    pointKey === 'baseCenterPoint'
      ? props.editor.getConeBaseCenterPoint(state.coneId)
      : props.editor.getConeApexPoint(state.coneId)
  if (!point) return
  const nextPosition = {
    x: Number(editCone[pointKey].x),
    y: Number(editCone[pointKey].y),
    z: Number(editCone[pointKey].z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  )
    return
  if (isPointCoordinateLocked(point)) return
  props.editor.setPointPosition(point.id, new Vec3(nextPosition.x, nextPosition.y, nextPosition.z))
}

const handleConeRadiusFocus = () => {
  setCoordFocus('cone.radius', true)
}

const handleConeRadiusBlur = () => {
  hideLengthBubble('cone.radius')
  editCone.radius = clampLengthValue('cone.radius', editCone.radius, editCone.radius)
  editCone.radius = normalizeDisplayLength(editCone.radius)
  setCoordFocus('cone.radius', false)
  applyEditConeRadius()
}

const nudgeConeRadius = (direction: 'up' | 'down') => {
  hideLengthBubble('cone.radius')
  const current = Number(editCone.radius)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('cone.radius', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editCone.radius = next.toFixed(2)
  applyEditConeRadius()
}

const handleConeHeightFocus = () => {
  setCoordFocus('cone.height', true)
}

const handleConeHeightBlur = () => {
  hideLengthBubble('cone.height')
  editCone.height = clampLengthValue('cone.height', editCone.height, editCone.height)
  editCone.height = normalizeDisplayLength(editCone.height)
  setCoordFocus('cone.height', false)
  applyEditConeHeight()
}

const nudgeConeHeight = (direction: 'up' | 'down') => {
  hideLengthBubble('cone.height')
  const current = Number(editCone.height)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('cone.height', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editCone.height = next.toFixed(2)
  applyEditConeHeight()
}

const handleConePointCoordFocus = (
  pointKey: 'baseCenterPoint' | 'apexPoint',
  axis: 'x' | 'y' | 'z',
) => {
  setCoordFocus(`cone.${pointKey}.${axis}`, true)
}

const handleConePointCoordBlur = (
  pointKey: 'baseCenterPoint' | 'apexPoint',
  axis: 'x' | 'y' | 'z',
) => {
  editCone[pointKey][axis] = normalizeCoord(editCone[pointKey][axis])
  setCoordFocus(`cone.${pointKey}.${axis}`, false)
  applyConePointCoord(pointKey)
}

const nudgeConePointCoord = (
  pointKey: 'baseCenterPoint' | 'apexPoint',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`cone.${pointKey}.${axis}`, direction)
  if (nextValue === null) return
  editCone[pointKey][axis] = nextValue
  applyConePointCoord(pointKey)
}

const startEditCylinder = (cylinderId: string) => {
  const cylinder = props.editor.getCylinder(cylinderId)
  if (!cylinder) return
  editing.value = { type: 'cylinder', id: cylinderId }
  editCylinder.nameSuffix = props.editor.getCylinderNameSuffix(cylinderId)
  editCylinder.nameVisible = cylinder.nameVisible !== false
  editCylinder.valueVisible = cylinder.valueVisible === true
  editCylinder.userLocked = props.editor.isCylinderGeometryLocked(cylinder)
  editCylinder.radius = toFixed2(props.editor.getCylinderRadius(cylinderId))
  editCylinder.height = toFixed2(props.editor.getCylinderHeight(cylinderId))
  const bottomCenterPoint = props.editor.getCylinderBottomCenterPoint(cylinderId)
  const topCenterPoint = props.editor.getCylinderTopCenterPoint(cylinderId)
  if (bottomCenterPoint) {
    editCylinder.bottomCenterPoint.x = toFixed2(bottomCenterPoint.position.x)
    editCylinder.bottomCenterPoint.y = toFixed2(bottomCenterPoint.position.y)
    editCylinder.bottomCenterPoint.z = toFixed2(bottomCenterPoint.position.z)
  }
  if (topCenterPoint) {
    editCylinder.topCenterPoint.x = toFixed2(topCenterPoint.position.x)
    editCylinder.topCenterPoint.y = toFixed2(topCenterPoint.position.y)
    editCylinder.topCenterPoint.z = toFixed2(topCenterPoint.position.z)
  }
}

const currentEditCylinder = computed(() => {
  if (!editing.value || editing.value.type !== 'cylinder') return null
  const cylinder = props.editor.getCylinder(editing.value.id)
  if (!cylinder) return null
  return { cylinderId: editing.value.id, cylinder }
})

const applyEditCylinderMeta = () => {
  const state = currentEditCylinder.value
  if (!state) return
  const prefix = '圆柱'
  props.editor.beginCollabTransaction('UpdateCylinderCommand')
  props.editor.updateCylinder(state.cylinderId, {
    name: prefix + editCylinder.nameSuffix.trim(),
    nameVisible: editCylinder.nameVisible,
    valueVisible: editCylinder.valueVisible,
  })
  props.editor.setCylinderLockState(state.cylinderId, editCylinder.userLocked)
  props.editor.commitCollabTransaction()
}

const applyEditCylinderRadius = () => {
  const state = currentEditCylinder.value
  if (!state) return
  const nextRadius = Number(editCylinder.radius)
  if (!Number.isFinite(nextRadius) || nextRadius < LENGTH_MIN) return
  props.editor.updateCylinderRadius(state.cylinderId, nextRadius)
}

const applyEditCylinderHeight = () => {
  const state = currentEditCylinder.value
  if (!state) return
  const nextHeight = Number(editCylinder.height)
  if (!Number.isFinite(nextHeight) || nextHeight < LENGTH_MIN) return
  props.editor.updateCylinderHeight(state.cylinderId, nextHeight)
}

const applyCylinderPointCoord = (pointKey: 'bottomCenterPoint' | 'topCenterPoint') => {
  const state = currentEditCylinder.value
  if (!state) return
  const point =
    pointKey === 'bottomCenterPoint'
      ? props.editor.getCylinderBottomCenterPoint(state.cylinderId)
      : props.editor.getCylinderTopCenterPoint(state.cylinderId)
  if (!point) return
  const nextPosition = {
    x: Number(editCylinder[pointKey].x),
    y: Number(editCylinder[pointKey].y),
    z: Number(editCylinder[pointKey].z),
  }
  if (
    !Number.isFinite(nextPosition.x) ||
    !Number.isFinite(nextPosition.y) ||
    !Number.isFinite(nextPosition.z)
  )
    return
  if (isPointCoordinateLocked(point)) return
  props.editor.setPointPosition(point.id, new Vec3(nextPosition.x, nextPosition.y, nextPosition.z))
}

const handleCylinderRadiusFocus = () => {
  setCoordFocus('cylinder.radius', true)
}

const handleCylinderRadiusBlur = () => {
  hideLengthBubble('cylinder.radius')
  editCylinder.radius = clampLengthValue(
    'cylinder.radius',
    editCylinder.radius,
    editCylinder.radius,
  )
  editCylinder.radius = normalizeDisplayLength(editCylinder.radius)
  setCoordFocus('cylinder.radius', false)
  applyEditCylinderRadius()
}

const nudgeCylinderRadius = (direction: 'up' | 'down') => {
  hideLengthBubble('cylinder.radius')
  const current = Number(editCylinder.radius)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('cylinder.radius', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editCylinder.radius = next.toFixed(2)
  applyEditCylinderRadius()
}

const handleCylinderHeightFocus = () => {
  setCoordFocus('cylinder.height', true)
}

const handleCylinderHeightBlur = () => {
  hideLengthBubble('cylinder.height')
  editCylinder.height = clampLengthValue(
    'cylinder.height',
    editCylinder.height,
    editCylinder.height,
  )
  editCylinder.height = normalizeDisplayLength(editCylinder.height)
  setCoordFocus('cylinder.height', false)
  applyEditCylinderHeight()
}

const nudgeCylinderHeight = (direction: 'up' | 'down') => {
  hideLengthBubble('cylinder.height')
  const current = Number(editCylinder.height)
  if (direction === 'down' && current <= LENGTH_MIN) {
    showLengthBubble('cylinder.height', '已减到最小值')
    return
  }
  const next = stepLengthValue(current, 0.5, direction)
  editCylinder.height = next.toFixed(2)
  applyEditCylinderHeight()
}

const handleCylinderPointCoordFocus = (
  pointKey: 'bottomCenterPoint' | 'topCenterPoint',
  axis: 'x' | 'y' | 'z',
) => {
  setCoordFocus(`cylinder.${pointKey}.${axis}`, true)
}

const handleCylinderPointCoordBlur = (
  pointKey: 'bottomCenterPoint' | 'topCenterPoint',
  axis: 'x' | 'y' | 'z',
) => {
  editCylinder[pointKey][axis] = normalizeCoord(editCylinder[pointKey][axis])
  setCoordFocus(`cylinder.${pointKey}.${axis}`, false)
  applyCylinderPointCoord(pointKey)
}

const nudgeCylinderPointCoord = (
  pointKey: 'bottomCenterPoint' | 'topCenterPoint',
  axis: 'x' | 'y' | 'z',
  direction: 'up' | 'down',
) => {
  const nextValue = stepCoordInput(`cylinder.${pointKey}.${axis}`, direction)
  if (nextValue === null) return
  editCylinder[pointKey][axis] = nextValue
  applyCylinderPointCoord(pointKey)
}

const getRayDirection = (ray: Ray3) => ray.getDirectionVector()
const getRayDisplayEnd = (ray: Ray3) => ray.getDisplayEndPoint()
const getStraightLineDirection = (line: StraightLine3) => line.getDirectionVector()
const getPerpendicularLineSourceLabel = (line: PerpendicularLine3) => {
  const p1Name = line.p1.name ?? ''
  const target = line.target
  let targetLabel = ''
  if (target.type === 'line') {
    const obj = props.scene.lines.get(target.id)
    targetLabel = obj ? `线段${obj.name ?? ''}` : '线段'
  } else if (target.type === 'straightLine') {
    const obj = props.scene.straightLines.get(target.id)
    targetLabel = obj ? `直线${obj.name ?? ''}` : '直线'
  } else if (target.type === 'ray') {
    const obj = props.scene.rays.get(target.id)
    targetLabel = obj ? `射线${obj.name ?? ''}` : '射线'
  } else if (target.type === 'vector') {
    const obj = props.scene.vectors.get(target.id)
    targetLabel = obj ? `向量${obj.name ?? ''}` : '向量'
  } else if (target.type === 'face') {
    const obj = props.scene.faces.get(target.id)
    targetLabel = obj ? `多边形${obj.name ?? ''}` : '多边形'
  } else if (target.type === 'coneBase') {
    const obj = props.scene.cones.get(target.id)
    targetLabel = obj ? `圆锥底${obj.name ?? ''}` : '圆锥底'
  } else if (target.type === 'cylinderBottom') {
    const obj = props.scene.cylinders.get(target.id)
    targetLabel = obj ? `圆柱底${obj.name ?? ''}` : '圆柱底'
  } else if (target.type === 'cylinderTop') {
    const obj = props.scene.cylinders.get(target.id)
    targetLabel = obj ? `圆柱顶${obj.name ?? ''}` : '圆柱顶'
  } else if (target.type === 'perpendicularLine') {
    const obj = props.scene.perpendicularLines.get(target.id)
    targetLabel = obj ? `垂线${obj.name ?? ''}` : '垂线'
  } else if (target.type === 'parallelLine') {
    const obj = props.scene.parallelLines.get(target.id)
    targetLabel = obj ? `平行线${obj.name ?? ''}` : '平行线'
  }
  return `点${p1Name}-${targetLabel}`
}
const getParallelLineSourceLabel = (line: ParallelLine3) => {
  const p1Name = line.p1.name ?? ''
  const target = line.target
  let targetLabel = ''
  if (target.type === 'line') {
    const obj = props.scene.lines.get(target.id)
    targetLabel = obj ? `线段${obj.name ?? ''}` : '线段'
  } else if (target.type === 'straightLine') {
    const obj = props.scene.straightLines.get(target.id)
    targetLabel = obj ? `直线${obj.name ?? ''}` : '直线'
  } else if (target.type === 'ray') {
    const obj = props.scene.rays.get(target.id)
    targetLabel = obj ? `射线${obj.name ?? ''}` : '射线'
  } else if (target.type === 'vector') {
    const obj = props.scene.vectors.get(target.id)
    targetLabel = obj ? `向量${obj.name ?? ''}` : '向量'
  } else if (target.type === 'perpendicularLine') {
    const obj = props.scene.perpendicularLines.get(target.id)
    targetLabel = obj ? `垂线${obj.name ?? ''}` : '垂线'
  } else if (target.type === 'parallelLine') {
    const obj = props.scene.parallelLines.get(target.id)
    targetLabel = obj ? `平行线${obj.name ?? ''}` : '平行线'
  }
  return `点${p1Name}-${targetLabel}`
}
const getPointIntersectionSummary = (point: Point3 | undefined) =>
  point ? props.editor.getIntersectionSummary(point.id) : null
const hasPointIntersectionConstraint = (point: Point3 | undefined) =>
  getPointIntersectionSummary(point) !== null
const getFaceArea = (face: PlanarPolygon) => face.getArea(props.scene.points)
const getFaceCentroid = (face: PlanarPolygon) => face.getCentroid(props.scene.points)
const getFaceBoundaryPoints = (face: PlanarPolygon) => face.getBoundaryPoints(props.scene.points)
const getHexahedronOwnerPoints = (cubeId: string) => {
  const constraint = props.editor.getCubeConstraint(cubeId)
  if (!constraint) return [] as Point3[]
  return constraint.ownerPointIds
    .map((id) => props.scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined)
}
const getHexahedronEdgeLength = (cubeId: string) => {
  const ownerPoints = getHexahedronOwnerPoints(cubeId)
  if (ownerPoints.length < 2) return 0
  return Math.hypot(
    ownerPoints[1]!.position.x - ownerPoints[0]!.position.x,
    ownerPoints[1]!.position.y - ownerPoints[0]!.position.y,
    ownerPoints[1]!.position.z - ownerPoints[0]!.position.z,
  )
}
const getSolidConstraintBadge = (cubeId: string | null | undefined) => {
  const constraint = cubeId ? props.editor.getCubeConstraint(cubeId) : null
  return constraint?.solidType === 'tetrahedron' ? '四面体约束' : '六面体约束'
}
const getHexahedronVolume = (cubeId: string) => {
  const edgeLength = getHexahedronEdgeLength(cubeId)
  const constraint = props.editor.getCubeConstraint(cubeId)
  if (constraint?.solidType === 'tetrahedron') {
    return (Math.sqrt(2) / 12) * Math.pow(edgeLength, 3)
  }
  return Math.pow(edgeLength, 3)
}
const getPrismOwnerPoints = (prismId: string) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  if (!constraint) return [] as Point3[]
  return constraint.ownerPointIds
    .map((id) => props.scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined)
}
/**
 * 垂直保持模式下，与底面法线最对齐的世界坐标轴。
 * 只有该轴的坐标编辑器可用，其余两轴禁用，避免 x/z 小分量导致高度剧烈跳变。
 */
const getPrismVerticalDominantAxis = (prismId: string): 'x' | 'y' | 'z' | null => {
  const constraint = props.editor.getPrismConstraint(prismId)
  if (!constraint || !constraint.keepVertical) return null
  const basis = constraint.getBottomPlaneBasis()
  if (!basis) return null
  const n = basis.normal
  const abs = { x: Math.abs(n.x), y: Math.abs(n.y), z: Math.abs(n.z) }
  if (abs.x >= abs.y && abs.x >= abs.z) return 'x'
  if (abs.y >= abs.x && abs.y >= abs.z) return 'y'
  return 'z'
}
/**
 * 垂直保持模式下，指定坐标轴是否可用于编辑最高点坐标。
 * 只有与底面法线最对齐的轴可用，其余两轴禁用。
 */
const isPrismTopPointAxisEditable = (
  prismId: string,
  axis: 'x' | 'y' | 'z',
): boolean => {
  const dominant = getPrismVerticalDominantAxis(prismId)
  if (dominant === null) return true
  return dominant === axis
}
/** 棱柱来源标签：多边形F-点A（底面多边形 + 最高点）。 */
const getPrismSourceLabel = (prismId: string) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  if (!constraint) return ''
  const bottomFace = props.scene.faces.get(constraint.bottomFaceId)
  const topPoint = props.scene.points.get(constraint.ownerPointIds[1])
  const faceName = bottomFace?.name ?? ''
  const pointName = topPoint?.name ?? ''
  return `多边形${faceName}-点${pointName}`
}
const getPrismBottomEdgeLabel = (prismId: string, edgeIndex: number) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  if (!constraint) return `边 ${edgeIndex + 1}`
  const bottomFace = props.scene.faces.get(constraint.bottomFaceId)
  if (!bottomFace) return `边 ${edgeIndex + 1}`
  const points = bottomFace.getBoundaryPoints(props.scene.points)
  const current = points[edgeIndex]
  const next = points[(edgeIndex + 1) % points.length]
  if (!current || !next) return `边 ${edgeIndex + 1}`
  return `${current.name}${next.name}`
}
const getPrismHeight = (prismId: string) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  return constraint?.getHeight() ?? 0
}
const getPrismVolume = (prismId: string) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  return constraint?.getVolume() ?? 0
}
const getPrismSurfaceArea = (prismId: string) => {
  const constraint = props.editor.getPrismConstraint(prismId)
  return constraint?.getSurfaceArea() ?? 0
}
const getPyramidOwnerPoints = (pyramidId: string) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  if (!constraint) return [] as Point3[]
  return constraint.ownerPointIds
    .map((id) => props.scene.points.get(id))
    .filter((point): point is Point3 => point !== undefined)
}
/**
 * 垂直保持模式下，与底面法线最对齐的世界坐标轴。
 * 只有该轴的坐标编辑器可用，其余两轴禁用，避免 x/z 小分量导致高度剧烈跳变。
 */
const getPyramidVerticalDominantAxis = (pyramidId: string): 'x' | 'y' | 'z' | null => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  if (!constraint || !constraint.keepVertical) return null
  const basis = constraint.getBottomPlaneBasis()
  if (!basis) return null
  const n = basis.normal
  const abs = { x: Math.abs(n.x), y: Math.abs(n.y), z: Math.abs(n.z) }
  if (abs.x >= abs.y && abs.x >= abs.z) return 'x'
  if (abs.y >= abs.x && abs.y >= abs.z) return 'y'
  return 'z'
}
/**
 * 垂直保持模式下，指定坐标轴是否可用于编辑最高点坐标。
 * 只有与底面法线最对齐的轴可用，其余两轴禁用。
 */
const isPyramidApexAxisEditable = (
  pyramidId: string,
  axis: 'x' | 'y' | 'z',
): boolean => {
  const dominant = getPyramidVerticalDominantAxis(pyramidId)
  if (dominant === null) return true
  return dominant === axis
}
/** 棱锥来源标签：多边形F-点A（底面多边形 + 最高点）。 */
const getPyramidSourceLabel = (pyramidId: string) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  if (!constraint) return ''
  const bottomFace = props.scene.faces.get(constraint.bottomFaceId)
  const apexPoint = props.scene.points.get(constraint.ownerPointIds[1])
  const faceName = bottomFace?.name ?? ''
  const pointName = apexPoint?.name ?? ''
  return `多边形${faceName}-点${pointName}`
}
const getPyramidBottomEdgeLabel = (pyramidId: string, edgeIndex: number) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  if (!constraint) return `边 ${edgeIndex + 1}`
  const bottomFace = props.scene.faces.get(constraint.bottomFaceId)
  if (!bottomFace) return `边 ${edgeIndex + 1}`
  const points = bottomFace.getBoundaryPoints(props.scene.points)
  const current = points[edgeIndex]
  const next = points[(edgeIndex + 1) % points.length]
  if (!current || !next) return `边 ${edgeIndex + 1}`
  return `${current.name}${next.name}`
}
const getPyramidHeight = (pyramidId: string) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  return constraint?.getHeight() ?? 0
}
const getPyramidVolume = (pyramidId: string) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  return constraint?.getVolume() ?? 0
}
const getPyramidSurfaceArea = (pyramidId: string) => {
  const constraint = props.editor.getPyramidConstraint(pyramidId)
  return constraint?.getSurfaceArea() ?? 0
}
const getFaceMemberPointNames = (face: PlanarPolygon) =>
  face
    .getMemberPoints(props.scene.points)
    .map((point) => point.name)
    .join(', ')
const getFaceEdgeLabel = (face: PlanarPolygon, edgeIndex: number) => {
  const points = getFaceBoundaryPoints(face)
  const current = points[edgeIndex]
  const next = points[(edgeIndex + 1) % points.length]
  if (!current || !next) return `边 ${edgeIndex + 1}`
  return `${current.name}${next.name}`
}
const getFaceEdgeTargets = (faceId: string) => {
  const face = props.scene.faces.get(faceId)
  return editFace.edgeLengths.map((value, index) => {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0.01, parsed)
    return face ? face.getEdgeLength(props.scene.points, index) : null
  })
}
const applyFaceEdgeLength = (faceId: string, edgeIndex: number) => {
  const nextLength = Number(editFace.edgeLengths[edgeIndex])
  if (!Number.isFinite(nextLength)) return
  const key = `face.edge.${edgeIndex}`
  const success = props.editor.updateFaceBoundaryEdgeLength(
    faceId,
    edgeIndex,
    nextLength,
    getFaceEdgeTargets(faceId),
  )
  if (!success) {
    showLengthBubble(key, '不满足多边形边长约束，无法更新')
    // 恢复为实际边长
    const face = props.scene.faces.get(faceId)
    if (face) {
      editFace.edgeLengths[edgeIndex] = toFixed2(face.getEdgeLength(props.scene.points, edgeIndex))
    }
  }
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
          valueVisible: p.valueVisible === true,
          visible: p.visible !== false,
          userLocked: isPointCoordinateLocked(p),
          x: p.position.x,
          y: p.position.y,
          z: p.position.z,
          constrainedTo: p.constrainedTo,
        }
      : null
  },
  (newPos) => {
    if (!newPos) return
    editPoint.name = newPos.name
    editPoint.nameVisible = newPos.nameVisible
    editPoint.valueVisible = newPos.valueVisible
    editPoint.visible = newPos.visible
    editPoint.userLocked = newPos.userLocked
    if (!focusedCoord['point.x']) editPoint.x = toFixed2(newPos.x)
    if (!focusedCoord['point.y']) editPoint.y = toFixed2(newPos.y)
    if (!focusedCoord['point.z']) editPoint.z = toFixed2(newPos.z)
    // 约束点：同步参数化数据（父对象更新时传导更新范围）
    // 正在编辑的参数不覆盖，避免打断用户输入
    if (newPos.constrainedTo) {
      const point = props.scene.points.get(editing.value!.id)
      if (point) {
        const constraint = props.scene.getObjectConstrainedPointConstraint(point.id)
        if (constraint && constraint.parametricData) {
          const ranges = constraint.getParametricRanges()
          constrainedParamRanges.value = ranges
          for (const range of ranges) {
            if (!focusedCoord[`constrained.${range.key}`]) {
              const val = constraint.getParametricValue(range.key)
              editConstrainedParams[range.key] = val !== undefined ? toFixed2(val) : '0.00'
            }
          }
        }
      }
    }
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
      valueVisible: l.valueVisible === true,
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
    editLine.valueVisible = newLine.valueVisible
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
    if (!editing.value || editing.value.type !== 'perpendicularLine') return null
    const l = props.scene.perpendicularLines.get(editing.value.id)
    if (!l) return null
    return {
      name: l.name ?? '',
      nameVisible: l.nameVisible !== false,
      valueVisible: l.valueVisible === true,
      visible: l.visible !== false,
      userLocked: l.userLocked,
      displayLength: l.displayLength,
      p1: { x: l.p1.position.x, y: l.p1.position.y, z: l.p1.position.z },
    }
  },
  (newLine) => {
    if (!newLine) return
    editPerpendicularLine.name = newLine.name
    editPerpendicularLine.nameVisible = newLine.nameVisible
    editPerpendicularLine.valueVisible = newLine.valueVisible
    editPerpendicularLine.visible = newLine.visible
    editPerpendicularLine.userLocked = newLine.userLocked
    if (!focusedCoord['perpendicularLine.displayLength']) {
      editPerpendicularLine.displayLength = toFixed2(newLine.displayLength)
    }
    if (!focusedCoord['perpendicularLine.p1.x']) editPerpendicularLine.p1.x = toFixed2(newLine.p1.x)
    if (!focusedCoord['perpendicularLine.p1.y']) editPerpendicularLine.p1.y = toFixed2(newLine.p1.y)
    if (!focusedCoord['perpendicularLine.p1.z']) editPerpendicularLine.p1.z = toFixed2(newLine.p1.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'parallelLine') return null
    const l = props.scene.parallelLines.get(editing.value.id)
    if (!l) return null
    return {
      name: l.name ?? '',
      nameVisible: l.nameVisible !== false,
      valueVisible: l.valueVisible === true,
      visible: l.visible !== false,
      userLocked: l.userLocked,
      displayLength: l.displayLength,
      p1: { x: l.p1.position.x, y: l.p1.position.y, z: l.p1.position.z },
    }
  },
  (newLine) => {
    if (!newLine) return
    editParallelLine.name = newLine.name
    editParallelLine.nameVisible = newLine.nameVisible
    editParallelLine.valueVisible = newLine.valueVisible
    editParallelLine.visible = newLine.visible
    editParallelLine.userLocked = newLine.userLocked
    if (!focusedCoord['parallelLine.displayLength']) {
      editParallelLine.displayLength = toFixed2(newLine.displayLength)
    }
    if (!focusedCoord['parallelLine.p1.x']) editParallelLine.p1.x = toFixed2(newLine.p1.x)
    if (!focusedCoord['parallelLine.p1.y']) editParallelLine.p1.y = toFixed2(newLine.p1.y)
    if (!focusedCoord['parallelLine.p1.z']) editParallelLine.p1.z = toFixed2(newLine.p1.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'straightLine') return null
    const l = props.scene.straightLines.get(editing.value.id)
    if (!l) return null
    return {
      name: l.name ?? '',
      nameVisible: l.nameVisible !== false,
      valueVisible: l.valueVisible === true,
      visible: l.visible !== false,
      userLocked: props.editor.isStraightLineLocked(l),
      displayLength: l.displayLength,
      p1: { x: l.p1.position.x, y: l.p1.position.y, z: l.p1.position.z },
      p2: { x: l.p2.position.x, y: l.p2.position.y, z: l.p2.position.z },
    }
  },
  (newLine) => {
    if (!newLine) return
    editStraightLine.name = newLine.name
    editStraightLine.nameVisible = newLine.nameVisible
    editStraightLine.valueVisible = newLine.valueVisible
    editStraightLine.visible = newLine.visible
    editStraightLine.userLocked = newLine.userLocked
    if (!focusedCoord['straightLine.displayLength']) {
      editStraightLine.displayLength = toFixed2(newLine.displayLength)
    }
    if (!focusedCoord['straightLine.p1.x']) editStraightLine.p1.x = toFixed2(newLine.p1.x)
    if (!focusedCoord['straightLine.p1.y']) editStraightLine.p1.y = toFixed2(newLine.p1.y)
    if (!focusedCoord['straightLine.p1.z']) editStraightLine.p1.z = toFixed2(newLine.p1.z)
    if (!focusedCoord['straightLine.p2.x']) editStraightLine.p2.x = toFixed2(newLine.p2.x)
    if (!focusedCoord['straightLine.p2.y']) editStraightLine.p2.y = toFixed2(newLine.p2.y)
    if (!focusedCoord['straightLine.p2.z']) editStraightLine.p2.z = toFixed2(newLine.p2.z)
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
      valueVisible: r.valueVisible === true,
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
    editRay.valueVisible = newRay.valueVisible
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

watch(
  () => {
    if (!editing.value || editing.value.type !== 'face') return null
    const face = props.scene.faces.get(editing.value.id)
    if (!face) return null
    return {
      name: face.name ?? '',
      nameVisible: face.nameVisible !== false,
      valueVisible: face.valueVisible === true,
      visible: face.visible !== false,
      userLocked: props.editor.isFaceLocked(face),
      areaLocked: face.areaLocked === true,
      edgeLengths: face
        .getBoundaryPoints(props.scene.points)
        .map((_, index) => toFixed2(face.getEdgeLength(props.scene.points, index))),
    }
  },
  (nextFace) => {
    if (!nextFace) return
    editFace.name = nextFace.name
    editFace.nameVisible = nextFace.nameVisible
    editFace.valueVisible = nextFace.valueVisible
    editFace.visible = nextFace.visible
    editFace.userLocked = nextFace.userLocked
    editFace.areaLocked = nextFace.areaLocked
    nextFace.edgeLengths.forEach((length, index) => {
      if (!focusedCoord[`face.edge.${index}`]) {
        editFace.edgeLengths[index] = length
      }
    })
    if (editFace.edgeLengths.length > nextFace.edgeLengths.length) {
      editFace.edgeLengths = editFace.edgeLengths.slice(0, nextFace.edgeLengths.length)
    }
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'vector') return null
    const vec = props.scene.vectors.get(editing.value.id)
    if (!vec) return null
    return {
      name: vec.name ?? '',
      nameVisible: vec.nameVisible !== false,
      valueVisible: vec.valueVisible === true,
      visible: vec.visible !== false,
      userLocked: props.editor.isVectorLocked(vec),
      length: vec.getLength(),
      p1: { x: vec.p1.position.x, y: vec.p1.position.y, z: vec.p1.position.z },
      p2: { x: vec.p2.position.x, y: vec.p2.position.y, z: vec.p2.position.z },
    }
  },
  (newVec) => {
    if (!newVec) return
    editVector.name = newVec.name
    editVector.nameVisible = newVec.nameVisible
    editVector.valueVisible = newVec.valueVisible
    editVector.visible = newVec.visible
    editVector.userLocked = newVec.userLocked
    if (!focusedCoord['vector.length']) editVector.length = toFixed2(newVec.length)
    if (!focusedCoord['vector.p1.x']) editVector.p1.x = toFixed2(newVec.p1.x)
    if (!focusedCoord['vector.p1.y']) editVector.p1.y = toFixed2(newVec.p1.y)
    if (!focusedCoord['vector.p1.z']) editVector.p1.z = toFixed2(newVec.p1.z)
    if (!focusedCoord['vector.p2.x']) editVector.p2.x = toFixed2(newVec.p2.x)
    if (!focusedCoord['vector.p2.y']) editVector.p2.y = toFixed2(newVec.p2.y)
    if (!focusedCoord['vector.p2.z']) editVector.p2.z = toFixed2(newVec.p2.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'circle') return null
    const circle = props.scene.circles.get(editing.value.id)
    if (!circle) return null
    return {
      name: circle.name ?? '',
      nameVisible: circle.nameVisible !== false,
      valueVisible: circle.valueVisible === true,
      visible: circle.visible !== false,
      userLocked: props.editor.isCircleLocked(circle),
      centerVisible: circle.centerVisible !== false,
      lockedRadius: circle.lockedRadius,
      radius: circle.isNormalCircle() ? null : circle.getRadius(),
      p1: { x: circle.p1.position.x, y: circle.p1.position.y, z: circle.p1.position.z },
      p2: { x: circle.p2.position.x, y: circle.p2.position.y, z: circle.p2.position.z },
      p3: { x: circle.p3.position.x, y: circle.p3.position.y, z: circle.p3.position.z },
    }
  },
  (nextCircle) => {
    if (!nextCircle) return
    editCircle.name = nextCircle.name
    editCircle.nameVisible = nextCircle.nameVisible
    editCircle.valueVisible = nextCircle.valueVisible
    editCircle.visible = nextCircle.visible
    editCircle.userLocked = nextCircle.userLocked
    editCircle.centerVisible = nextCircle.centerVisible
    if (nextCircle.lockedRadius != null) {
      if (!focusedCoord['circle.lockedRadius'])
        editCircle.lockedRadius = String(nextCircle.lockedRadius)
    }
    if (nextCircle.radius != null) {
      if (!focusedCoord['circle.threePointRadius'])
        editCircle.threePointRadius = toFixed2(nextCircle.radius)
    }
    if (!focusedCoord['circle.p1.x']) editCircle.p1.x = toFixed2(nextCircle.p1.x)
    if (!focusedCoord['circle.p1.y']) editCircle.p1.y = toFixed2(nextCircle.p1.y)
    if (!focusedCoord['circle.p1.z']) editCircle.p1.z = toFixed2(nextCircle.p1.z)
    if (!focusedCoord['circle.p2.x']) editCircle.p2.x = toFixed2(nextCircle.p2.x)
    if (!focusedCoord['circle.p2.y']) editCircle.p2.y = toFixed2(nextCircle.p2.y)
    if (!focusedCoord['circle.p2.z']) editCircle.p2.z = toFixed2(nextCircle.p2.z)
    if (!focusedCoord['circle.p3.x']) editCircle.p3.x = toFixed2(nextCircle.p3.x)
    if (!focusedCoord['circle.p3.y']) editCircle.p3.y = toFixed2(nextCircle.p3.y)
    if (!focusedCoord['circle.p3.z']) editCircle.p3.z = toFixed2(nextCircle.p3.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'hexahedron') return null
    const constraint = props.editor.getCubeConstraint(editing.value.id)
    if (!constraint) return null
    const ownerPoints = getHexahedronOwnerPoints(editing.value.id)
    if (ownerPoints.length < 2) return null
    return {
      nameSuffix: props.editor.getCubeNameSuffix(editing.value.id),
      valueVisible: constraint.valueVisible === true,
      userLocked: constraint.faceIds.every((faceId) => props.scene.faces.get(faceId)?.userLocked),
      edgeLengthLocked: constraint.edgeLengthLocked,
      edgeLength: getHexahedronEdgeLength(editing.value.id),
      p1: {
        x: ownerPoints[0]!.position.x,
        y: ownerPoints[0]!.position.y,
        z: ownerPoints[0]!.position.z,
      },
      p2: {
        x: ownerPoints[1]!.position.x,
        y: ownerPoints[1]!.position.y,
        z: ownerPoints[1]!.position.z,
      },
    }
  },
  (nextCube) => {
    if (!nextCube) return
    editHexahedron.nameSuffix = nextCube.nameSuffix
    editHexahedron.valueVisible = nextCube.valueVisible
    editHexahedron.userLocked = nextCube.userLocked
    editHexahedron.edgeLengthLocked = nextCube.edgeLengthLocked
    if (!focusedCoord['hexa.edgeLength']) {
      editHexahedron.edgeLength = toFixed2(nextCube.edgeLength)
    }
    if (!focusedCoord['hexa.p1.x']) editHexahedron.p1.x = toFixed2(nextCube.p1.x)
    if (!focusedCoord['hexa.p1.y']) editHexahedron.p1.y = toFixed2(nextCube.p1.y)
    if (!focusedCoord['hexa.p1.z']) editHexahedron.p1.z = toFixed2(nextCube.p1.z)
    if (!focusedCoord['hexa.p2.x']) editHexahedron.p2.x = toFixed2(nextCube.p2.x)
    if (!focusedCoord['hexa.p2.y']) editHexahedron.p2.y = toFixed2(nextCube.p2.y)
    if (!focusedCoord['hexa.p2.z']) editHexahedron.p2.z = toFixed2(nextCube.p2.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'prism') return null
    const constraint = props.editor.getPrismConstraint(editing.value.id)
    if (!constraint) return null
    const ownerPoints = getPrismOwnerPoints(editing.value.id)
    if (ownerPoints.length < 2) return null
    return {
      nameSuffix: props.editor.getPrismNameSuffix(editing.value.id),
      valueVisible: constraint.valueVisible === true,
      keepVertical: constraint.keepVertical === true,
      userLocked: props.editor
        .getPrismFaceIds(editing.value.id)
        .every((faceId) => props.scene.faces.get(faceId)?.userLocked),
      topPoint: {
        x: ownerPoints[1]!.position.x,
        y: ownerPoints[1]!.position.y,
        z: ownerPoints[1]!.position.z,
      },
      height: constraint.getHeight(),
    }
  },
  (nextPrism) => {
    if (!nextPrism) return
    editPrism.nameSuffix = nextPrism.nameSuffix
    editPrism.valueVisible = nextPrism.valueVisible
    editPrism.keepVertical = nextPrism.keepVertical
    editPrism.userLocked = nextPrism.userLocked
    if (!focusedCoord['prism.topPoint.x']) editPrism.topPoint.x = toFixed2(nextPrism.topPoint.x)
    if (!focusedCoord['prism.topPoint.y']) editPrism.topPoint.y = toFixed2(nextPrism.topPoint.y)
    if (!focusedCoord['prism.topPoint.z']) editPrism.topPoint.z = toFixed2(nextPrism.topPoint.z)
    if (!focusedCoord['prism.height']) editPrism.height = toFixed2(nextPrism.height)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'pyramid') return null
    const constraint = props.editor.getPyramidConstraint(editing.value.id)
    if (!constraint) return null
    const ownerPoints = getPyramidOwnerPoints(editing.value.id)
    if (ownerPoints.length < 2) return null
    return {
      nameSuffix: props.editor.getPyramidNameSuffix(editing.value.id),
      valueVisible: constraint.valueVisible === true,
      keepVertical: constraint.keepVertical === true,
      userLocked: props.editor
        .getPyramidFaceIds(editing.value.id)
        .every((faceId) => props.scene.faces.get(faceId)?.userLocked),
      apexPoint: {
        x: ownerPoints[1]!.position.x,
        y: ownerPoints[1]!.position.y,
        z: ownerPoints[1]!.position.z,
      },
      height: constraint.getHeight(),
    }
  },
  (nextPyramid) => {
    if (!nextPyramid) return
    editPyramid.nameSuffix = nextPyramid.nameSuffix
    editPyramid.valueVisible = nextPyramid.valueVisible
    editPyramid.keepVertical = nextPyramid.keepVertical
    editPyramid.userLocked = nextPyramid.userLocked
    if (!focusedCoord['pyramid.apexPoint.x']) editPyramid.apexPoint.x = toFixed2(nextPyramid.apexPoint.x)
    if (!focusedCoord['pyramid.apexPoint.y']) editPyramid.apexPoint.y = toFixed2(nextPyramid.apexPoint.y)
    if (!focusedCoord['pyramid.apexPoint.z']) editPyramid.apexPoint.z = toFixed2(nextPyramid.apexPoint.z)
    if (!focusedCoord['pyramid.height']) editPyramid.height = toFixed2(nextPyramid.height)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'regularPolygon') return null
    const constraint = props.editor.getRegularPolygonConstraint(editing.value.id)
    if (!constraint) return null
    const ownerPoints = props.editor.getRegularPolygonOwnerPoints(editing.value.id)
    if (ownerPoints.length < 2) return null
    return {
      nameSuffix: props.editor.getRegularPolygonNameSuffix(editing.value.id),
      valueVisible: constraint.valueVisible === true,
      userLocked: props.scene.faces.get(constraint.faceId)?.userLocked === true,
      edgeLengthLocked: constraint.edgeLengthLocked,
      edgeLength: constraint.getEdgeLength(),
      p1: {
        x: ownerPoints[0]!.position.x,
        y: ownerPoints[0]!.position.y,
        z: ownerPoints[0]!.position.z,
      },
      p2: {
        x: ownerPoints[1]!.position.x,
        y: ownerPoints[1]!.position.y,
        z: ownerPoints[1]!.position.z,
      },
    }
  },
  (nextRp) => {
    if (!nextRp) return
    editRegularPolygon.nameSuffix = nextRp.nameSuffix
    editRegularPolygon.valueVisible = nextRp.valueVisible
    editRegularPolygon.userLocked = nextRp.userLocked
    editRegularPolygon.edgeLengthLocked = nextRp.edgeLengthLocked
    if (!focusedCoord['rp.edgeLength']) {
      editRegularPolygon.edgeLength = toFixed2(nextRp.edgeLength)
    }
    if (!focusedCoord['rp.p1.x']) editRegularPolygon.p1.x = toFixed2(nextRp.p1.x)
    if (!focusedCoord['rp.p1.y']) editRegularPolygon.p1.y = toFixed2(nextRp.p1.y)
    if (!focusedCoord['rp.p1.z']) editRegularPolygon.p1.z = toFixed2(nextRp.p1.z)
    if (!focusedCoord['rp.p2.x']) editRegularPolygon.p2.x = toFixed2(nextRp.p2.x)
    if (!focusedCoord['rp.p2.y']) editRegularPolygon.p2.y = toFixed2(nextRp.p2.y)
    if (!focusedCoord['rp.p2.z']) editRegularPolygon.p2.z = toFixed2(nextRp.p2.z)
  },
  { immediate: true },
)

watch(
  () => {
    if (!editing.value || editing.value.type !== 'sphere') return null
    const sphere = props.editor.getSphere(editing.value.id)
    if (!sphere) return null
    const centerPoint = props.editor.getSphereCenterPoint(editing.value.id)
    const radiusPoint = props.editor.getSphereRadiusPoint(editing.value.id)
    return {
      nameSuffix: props.editor.getSphereNameSuffix(editing.value.id),
      nameVisible: sphere.nameVisible !== false,
      valueVisible: sphere.valueVisible === true,
      userLocked: props.editor.isSphereGeometryLocked(sphere),
      radius: props.editor.getSphereRadius(editing.value.id),
      centerPoint: centerPoint
        ? { x: centerPoint.position.x, y: centerPoint.position.y, z: centerPoint.position.z }
        : null,
      radiusPoint: radiusPoint
        ? { x: radiusPoint.position.x, y: radiusPoint.position.y, z: radiusPoint.position.z }
        : null,
    }
  },
  (nextSphere) => {
    if (!nextSphere) return
    editSphere.nameSuffix = nextSphere.nameSuffix
    editSphere.nameVisible = nextSphere.nameVisible
    editSphere.valueVisible = nextSphere.valueVisible
    editSphere.userLocked = nextSphere.userLocked
    if (!focusedCoord['sphere.radius']) editSphere.radius = toFixed2(nextSphere.radius)
    if (nextSphere.centerPoint) {
      if (!focusedCoord['sphere.centerPoint.x'])
        editSphere.centerPoint.x = toFixed2(nextSphere.centerPoint.x)
      if (!focusedCoord['sphere.centerPoint.y'])
        editSphere.centerPoint.y = toFixed2(nextSphere.centerPoint.y)
      if (!focusedCoord['sphere.centerPoint.z'])
        editSphere.centerPoint.z = toFixed2(nextSphere.centerPoint.z)
    }
    if (nextSphere.radiusPoint) {
      if (!focusedCoord['sphere.radiusPoint.x'])
        editSphere.radiusPoint.x = toFixed2(nextSphere.radiusPoint.x)
      if (!focusedCoord['sphere.radiusPoint.y'])
        editSphere.radiusPoint.y = toFixed2(nextSphere.radiusPoint.y)
      if (!focusedCoord['sphere.radiusPoint.z'])
        editSphere.radiusPoint.z = toFixed2(nextSphere.radiusPoint.z)
    }
  },
  { immediate: true },
)

onMounted(() => {
  syncSplitPaneMode()
  updateCompactLineEditorMode()
  window.addEventListener('resize', updateCompactLineEditorMode)
  window.addEventListener('resize', syncSplitPaneMode)
  window.addEventListener('resize', syncSelectedPaneHeight)
  document.addEventListener('mousedown', handleGlobalClick)
  document.addEventListener('mousedown', dismissHintPopovers)
  document.addEventListener('touchstart', dismissHintPopovers, { passive: true })
  document.addEventListener('pointermove', handleSplitPaneDrag)
  document.addEventListener('pointerup', stopSplitPaneDrag)
  document.addEventListener('pointercancel', stopSplitPaneDrag)
  syncSelectedPaneHeight()
})

onUnmounted(() => {
  cancelAnimationFrame(hintRafId)
  window.removeEventListener('resize', updateCompactLineEditorMode)
  window.removeEventListener('resize', syncSplitPaneMode)
  window.removeEventListener('resize', syncSelectedPaneHeight)
  document.removeEventListener('mousedown', handleGlobalClick)
  document.removeEventListener('mousedown', dismissHintPopovers)
  document.removeEventListener('touchstart', dismissHintPopovers)
  document.removeEventListener('pointermove', handleSplitPaneDrag)
  document.removeEventListener('pointerup', stopSplitPaneDrag)
  document.removeEventListener('pointercancel', stopSplitPaneDrag)
  document.body.classList.remove('sidebar-resizing')
})
</script>

<template>
  <div class="sidebar">
    <p>当前操作模式：{{ modeName }}</p>
    <div v-if="modeHint" class="hint mode-hint">{{ modeHint }}</div>
    <div class="section-divider"></div>
    <h3>选中</h3>
    <div
      class="hint"
      v-if="
        selectedPoints.length > 0 ||
        selectedLines.length > 0 ||
        selectedStraightLines.length > 0 ||
        selectedRays.length > 0 ||
        selectedVectors.length > 0 ||
        selectedCircles.length > 0 ||
        selectedEditableFaces.length > 0 ||
        selectedHexahedrons.length > 0 ||
        selectedRegularPolygons.length > 0 ||
        selectedPrisms.length > 0 ||
        selectedSpheres.length > 0 ||
        selectedCones.length > 0 ||
        selectedCylinders.length > 0
      "
    >
      双击标签以编辑几何元素~
    </div>
    <div ref="splitPaneRef" class="split-pane">
      <div class="box selected-box" :style="selectedPaneStyle">
        <div
          v-if="
            selectedPoints.length === 0 &&
            selectedLines.length === 0 &&
            selectedStraightLines.length === 0 &&
            selectedRays.length === 0 &&
            selectedVectors.length === 0 &&
            selectedCircles.length === 0 &&
            selectedEditableFaces.length === 0 &&
            selectedHexahedrons.length === 0 &&
            selectedRegularPolygons.length === 0 &&
            selectedPrisms.length === 0 &&
            selectedSpheres.length === 0 &&
            selectedCones.length === 0 &&
            selectedCylinders.length === 0
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
                <input type="checkbox" v-model="editPoint.visible" @change="applyEditPoint" />
                {{ editPoint.visible ? '对象显示' : '对象隐藏' }}
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editPoint.nameVisible" @change="applyEditPoint" />
                {{ editPoint.nameVisible ? '名称显示' : '名称隐藏' }}
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editPoint.valueVisible" @change="applyEditPoint" />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPoint.userLocked"
                  @change="applyEditPoint"
                  :disabled="hasCircleConstraint(p!)"
                />
                锁定
              </label>
            </div>
            <!-- 约束点：参数化编辑器 -->
            <div v-if="isPointObjectConstrained(p!)" class="constrained-param-wrap">
              <!-- 面约束：专用标题 -->
              <div v-if="isPointConstrainedToFace(p!)" class="face-uv-title">面上位置</div>
              <!-- 通用参数化编辑器（支持所有约束类型，含面约束动态UV范围） -->
              <div class="coord-row constrained-param-row">
                <div
                  v-for="range in constrainedParamRanges"
                  :key="range.key"
                  class="axis-field"
                >
                  <label>{{ range.label }}</label>
                  <div class="coord-input">
                    <button
                      type="button"
                      class="step-btn"
                      @click="nudgeConstrainedParam(range.key, 'down')"
                      :disabled="isPointCoordinateLocked(p!)"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      :ref="(el) => setCoordInputRef(`constrained.${range.key}`, el)"
                      v-model="editConstrainedParams[range.key]"
                      @input="applyConstrainedParam(range.key)"
                      @focus="handleConstrainedParamFocus(range.key)"
                      @blur="handleConstrainedParamBlur(range.key)"
                      :step="range.step"
                      :min="range.min"
                      :max="range.max"
                      :disabled="isPointCoordinateLocked(p!)"
                    />
                    <button
                      type="button"
                      class="step-btn"
                      @click="nudgeConstrainedParam(range.key, 'up')"
                      :disabled="isPointCoordinateLocked(p!)"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- 非约束点：xyz 编辑器 -->
            <div v-else class="coord-row">
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
            <div class="point-summary-line">
              点{{ p!.name ?? '' }}
              <span
                v-if="isPointCoordinateLocked(p!) && !hasCircleConstraint(p!)"
                class="lock-badge"
                >🔒</span
              >
              <span v-if="hasPointIntersectionConstraint(p!)" class="constraint-badge"
                >交点约束</span
              >
              <span v-if="hasCubeConstraint(p!)" class="constraint-badge">{{
                getSolidConstraintBadge(p!.cubeId)
              }}</span>
              <span
                v-if="hasRegularPolygonConstraint(p!) && p!.regularPolygonRole === 'dependent'"
                class="constraint-badge"
                >正多边形约束</span
              >
              <span
                v-if="hasPrismConstraint(p!) && p!.prismRole === 'dependent'"
                class="constraint-badge"
                >棱柱约束</span
              >
              <span
                v-if="hasPyramidConstraint(p!) && p!.pyramidRole === 'dependent'"
                class="constraint-badge"
                >棱锥约束</span
              >
              <span v-if="hasCircleConstraint(p!)" class="constraint-badge">圆心约束</span>
              <span v-if="getPointConstraintBadge(p!)" class="constraint-badge">{{
                getPointConstraintBadge(p!)
              }}</span>
              <span v-if="p!.visible === false" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                v-if="p!.id !== Scene.ORIGIN_ID"
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('point', p!.id, '点' + (p!.name ?? ''))"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>
              x: {{ p!.position.x.toFixed(2) }}, y: {{ p!.position.y.toFixed(2) }}, z:
              {{ p!.position.z.toFixed(2) }}
            </div>
            <div v-if="getPointIntersectionSummary(p!)">
              来源：{{ getPointIntersectionSummary(p!)?.left }} ×
              {{ getPointIntersectionSummary(p!)?.right }}
              {{ getPointIntersectionSummary(p!)?.valid ? '' : '（约束失效）' }}
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
                <input type="checkbox" v-model="editLine.valueVisible" @change="applyEditLine" />
                数值显示
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
                  min="0.1"
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
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeLineCoord('p1', 'x', 'up')"
                  :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeLineCoord('p2', 'x', 'up')"
                  :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeLineCoord('p1', 'y', 'up')"
                  :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeLineCoord('p2', 'y', 'up')"
                  :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeLineCoord('p1', 'z', 'up')"
                  :disabled="isLineEndpointCoordinateLocked(l!, l!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeLineCoord('p2', 'z', 'up')"
                  :disabled="isLineEndpointCoordinateLocked(l!, l!.p2)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              线段{{ l!.name ?? '' }}
              <span v-if="props.editor.isLineLocked(l!)" class="lock-badge">🔒</span>
              <span v-if="getLineConstraintBadge(l!)" class="constraint-badge">{{
                getLineConstraintBadge(l!)
              }}</span>
              <span v-if="l!.visible === false" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('line', l!.id, '线段' + (l!.name ?? ''))"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
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
          v-for="sl in selectedStraightLines"
          :key="sl!.id"
          class="selectedStraightLine-info"
          @dblclick="startEditStraightLine(sl)"
        >
          <div v-if="editing?.type === 'straightLine' && editing?.id === sl!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editStraightLine.name" @input="applyEditStraightLine" />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editStraightLine.visible"
                  @change="applyEditStraightLine"
                />
                直线显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editStraightLine.nameVisible"
                  @change="applyEditStraightLine"
                />
                名称显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editStraightLine.valueVisible"
                  @change="applyEditStraightLine"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editStraightLine.userLocked"
                  @change="applyEditStraightLine"
                />
                锁定
              </label>
            </div>
            <div class="name-row length-row">
              <label>显示长度</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineDisplayLength('down')"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.displayLength', el)"
                  v-model="editStraightLine.displayLength"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineDisplayLengthFocus"
                  @blur="handleStraightLineDisplayLengthBlur"
                  step="1"
                  min="0.1"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineDisplayLength('up')"
                >
                  +
                </button>
              </div>
            </div>
            <div
              class="line-editor-grid"
              :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
            >
              <div class="line-editor-head"></div>
              <div class="line-editor-head">
                <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                  点{{ sl!.p1.name ?? '' }}(x,y,z)
                </span>
                <span v-else class="line-editor-title-short">点A</span>
                <span v-if="isPointCoordinateLocked(sl!.p1)" class="lock-badge">🔒</span>
              </div>
              <div class="line-editor-head">
                <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                  点{{ sl!.p2.name ?? '' }}(x,y,z)
                </span>
                <span v-else class="line-editor-title-short">点B</span>
                <span v-if="isPointCoordinateLocked(sl!.p2)" class="lock-badge">🔒</span>
              </div>

              <div class="line-axis-label">x</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p1', 'x', 'down')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.p1.x', el)"
                  v-model="editStraightLine.p1.x"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineCoordFocus('p1', 'x')"
                  @blur="handleStraightLineCoordBlur('p1', 'x')"
                  step="0.5"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p1', 'x', 'up')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p2', 'x', 'down')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.p2.x', el)"
                  v-model="editStraightLine.p2.x"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineCoordFocus('p2', 'x')"
                  @blur="handleStraightLineCoordBlur('p2', 'x')"
                  step="0.5"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p2', 'x', 'up')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p1', 'y', 'down')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.p1.y', el)"
                  v-model="editStraightLine.p1.y"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineCoordFocus('p1', 'y')"
                  @blur="handleStraightLineCoordBlur('p1', 'y')"
                  step="0.5"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p1', 'y', 'up')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p2', 'y', 'down')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.p2.y', el)"
                  v-model="editStraightLine.p2.y"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineCoordFocus('p2', 'y')"
                  @blur="handleStraightLineCoordBlur('p2', 'y')"
                  step="0.5"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p2', 'y', 'up')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p1', 'z', 'down')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.p1.z', el)"
                  v-model="editStraightLine.p1.z"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineCoordFocus('p1', 'z')"
                  @blur="handleStraightLineCoordBlur('p1', 'z')"
                  step="0.5"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p1', 'z', 'up')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p2', 'z', 'down')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('straightLine.p2.z', el)"
                  v-model="editStraightLine.p2.z"
                  @input="applyEditStraightLine"
                  @focus="handleStraightLineCoordFocus('p2', 'z')"
                  @blur="handleStraightLineCoordBlur('p2', 'z')"
                  step="0.5"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeStraightLineCoord('p2', 'z', 'up')"
                  :disabled="isStraightLineEndpointCoordinateLocked(sl!, sl!.p2)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              直线{{ sl!.name ?? '' }}
              <span v-if="props.editor.isStraightLineLocked(sl!)" class="lock-badge">🔒</span>
              <span v-if="sl!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('straightLine', sl!.id, '直线' + (sl!.name ?? ''))"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>显示长度：{{ sl!.displayLength.toFixed(2) }}</div>
            <div>
              点{{ sl!.p1.name ?? '' }}（{{ sl!.p1.position.x.toFixed(2) }},
              {{ sl!.p1.position.y.toFixed(2) }}, {{ sl!.p1.position.z.toFixed(2) }}）
            </div>
            <div>
              点{{ sl!.p2.name ?? '' }}（{{ sl!.p2.position.x.toFixed(2) }},
              {{ sl!.p2.position.y.toFixed(2) }}, {{ sl!.p2.position.z.toFixed(2) }}）
            </div>
            <div>
              方向向量（{{ getStraightLineDirection(sl!).x.toFixed(2) }},
              {{ getStraightLineDirection(sl!).y.toFixed(2) }},
              {{ getStraightLineDirection(sl!).z.toFixed(2) }}）
            </div>
          </div>
        </div>

        <div
          v-for="pl in selectedPerpendicularLines"
          :key="pl!.id"
          class="selectedPerpendicularLine-info"
          @dblclick="startEditPerpendicularLine(pl)"
        >
          <div
            v-if="editing?.type === 'perpendicularLine' && editing?.id === pl!.id"
            class="edit-grid"
          >
            <div class="name-row">
              <label>名称</label>
              <input
                type="text"
                v-model="editPerpendicularLine.name"
                @input="applyEditPerpendicularLine"
              />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPerpendicularLine.visible"
                  @change="applyEditPerpendicularLine"
                />
                垂线显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPerpendicularLine.nameVisible"
                  @change="applyEditPerpendicularLine"
                />
                名称显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPerpendicularLine.valueVisible"
                  @change="applyEditPerpendicularLine"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPerpendicularLine.userLocked"
                  @change="applyEditPerpendicularLine"
                />
                锁定
              </label>
            </div>
            <div class="name-row length-row">
              <label>显示长度</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePerpendicularLineDisplayLength('down')"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('perpendicularLine.displayLength', el)"
                  v-model="editPerpendicularLine.displayLength"
                  @input="applyEditPerpendicularLine"
                  @focus="handlePerpendicularLineDisplayLengthFocus"
                  @blur="handlePerpendicularLineDisplayLengthBlur"
                  step="1"
                  min="0.1"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePerpendicularLineDisplayLength('up')"
                >
                  +
                </button>
              </div>
            </div>
            <div class="readonly-value-row">
              垂足坐标：（{{ pl!.p2.position.x.toFixed(2) }}, {{ pl!.p2.position.y.toFixed(2) }},
              {{ pl!.p2.position.z.toFixed(2) }}）
            </div>
            <div class="coord-row-title">
              点{{ pl!.p1.name ?? '' }}(x,y,z)
              <span v-if="isPointCoordinateLocked(pl!.p1)" class="lock-badge">🔒</span>
            </div>
            <div class="coord-row">
              <div class="axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePerpendicularLineCoord('x', 'down')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('perpendicularLine.p1.x', el)"
                    v-model="editPerpendicularLine.p1.x"
                    @input="applyEditPerpendicularLine"
                    @focus="handlePerpendicularLineCoordFocus('x')"
                    @blur="handlePerpendicularLineCoordBlur('x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePerpendicularLineCoord('x', 'up')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
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
                    @click="nudgePerpendicularLineCoord('y', 'down')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('perpendicularLine.p1.y', el)"
                    v-model="editPerpendicularLine.p1.y"
                    @input="applyEditPerpendicularLine"
                    @focus="handlePerpendicularLineCoordFocus('y')"
                    @blur="handlePerpendicularLineCoordBlur('y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePerpendicularLineCoord('y', 'up')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
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
                    @click="nudgePerpendicularLineCoord('z', 'down')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('perpendicularLine.p1.z', el)"
                    v-model="editPerpendicularLine.p1.z"
                    @input="applyEditPerpendicularLine"
                    @focus="handlePerpendicularLineCoordFocus('z')"
                    @blur="handlePerpendicularLineCoordBlur('z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePerpendicularLineCoord('z', 'up')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              垂线{{ pl!.name ?? '' }}
              <span v-if="pl!.userLocked" class="lock-badge">🔒</span>
              <span v-if="pl!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="
                  handleDeleteElement('perpendicularLine', pl!.id, '垂线' + (pl!.name ?? ''))
                "
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>显示长度：{{ pl!.displayLength.toFixed(2) }}</div>
            <div>
              点{{ pl!.p1.name ?? '' }}（{{ pl!.p1.position.x.toFixed(2) }},
              {{ pl!.p1.position.y.toFixed(2) }}, {{ pl!.p1.position.z.toFixed(2) }}）
            </div>
            <div>
              垂足坐标：（{{ pl!.p2.position.x.toFixed(2) }}, {{ pl!.p2.position.y.toFixed(2) }},
              {{ pl!.p2.position.z.toFixed(2) }}）
            </div>
            <div>来源：{{ getPerpendicularLineSourceLabel(pl!) }}</div>
          </div>
        </div>

        <div
          v-for="pl in selectedParallelLines"
          :key="pl!.id"
          class="selectedParallelLine-info"
          @dblclick="startEditParallelLine(pl)"
        >
          <div
            v-if="editing?.type === 'parallelLine' && editing?.id === pl!.id"
            class="edit-grid"
          >
            <div class="name-row">
              <label>名称</label>
              <input
                type="text"
                v-model="editParallelLine.name"
                @input="applyEditParallelLine"
              />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editParallelLine.visible"
                  @change="applyEditParallelLine"
                />
                平行线显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editParallelLine.nameVisible"
                  @change="applyEditParallelLine"
                />
                名称显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editParallelLine.valueVisible"
                  @change="applyEditParallelLine"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editParallelLine.userLocked"
                  @change="applyEditParallelLine"
                />
                锁定
              </label>
            </div>
            <div class="name-row length-row">
              <label>显示长度</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeParallelLineDisplayLength('down')"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('parallelLine.displayLength', el)"
                  v-model="editParallelLine.displayLength"
                  @input="applyEditParallelLine"
                  @focus="handleParallelLineDisplayLengthFocus"
                  @blur="handleParallelLineDisplayLengthBlur"
                  step="1"
                  min="0.1"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeParallelLineDisplayLength('up')"
                >
                  +
                </button>
              </div>
            </div>
            <div class="coord-row-title">
              点{{ pl!.p1.name ?? '' }}(x,y,z)
              <span v-if="isPointCoordinateLocked(pl!.p1)" class="lock-badge">🔒</span>
            </div>
            <div class="coord-row">
              <div class="axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeParallelLineCoord('x', 'down')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('parallelLine.p1.x', el)"
                    v-model="editParallelLine.p1.x"
                    @input="applyEditParallelLine"
                    @focus="handleParallelLineCoordFocus('x')"
                    @blur="handleParallelLineCoordBlur('x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeParallelLineCoord('x', 'up')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
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
                    @click="nudgeParallelLineCoord('y', 'down')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('parallelLine.p1.y', el)"
                    v-model="editParallelLine.p1.y"
                    @input="applyEditParallelLine"
                    @focus="handleParallelLineCoordFocus('y')"
                    @blur="handleParallelLineCoordBlur('y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeParallelLineCoord('y', 'up')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
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
                    @click="nudgeParallelLineCoord('z', 'down')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('parallelLine.p1.z', el)"
                    v-model="editParallelLine.p1.z"
                    @input="applyEditParallelLine"
                    @focus="handleParallelLineCoordFocus('z')"
                    @blur="handleParallelLineCoordBlur('z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeParallelLineCoord('z', 'up')"
                    :disabled="isPointCoordinateLocked(pl!.p1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              平行线{{ pl!.name ?? '' }}
              <span v-if="pl!.userLocked" class="lock-badge">🔒</span>
              <span v-if="pl!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="
                  handleDeleteElement('parallelLine', pl!.id, '平行线' + (pl!.name ?? ''))
                "
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>显示长度：{{ pl!.displayLength.toFixed(2) }}</div>
            <div>
              点{{ pl!.p1.name ?? '' }}（{{ pl!.p1.position.x.toFixed(2) }},
              {{ pl!.p1.position.y.toFixed(2) }}, {{ pl!.p1.position.z.toFixed(2) }}）
            </div>
            <div>来源：{{ getParallelLineSourceLabel(pl!) }}</div>
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
                <input type="checkbox" v-model="editRay.valueVisible" @change="applyEditRay" />
                数值显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editRay.userLocked" @change="applyEditRay" />
                锁定
              </label>
            </div>
            <div class="name-row length-row">
              <label>长度</label>
              <div class="coord-input compact-length-input">
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
                  min="0.1"
                />
                <button type="button" class="step-btn" @click="nudgeRayDisplayLength('up')">
                  +
                </button>
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
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeRayCoord('p1', 'x', 'up')"
                  :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeRayCoord('p2', 'x', 'up')"
                  :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeRayCoord('p1', 'y', 'up')"
                  :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeRayCoord('p2', 'y', 'up')"
                  :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeRayCoord('p1', 'z', 'up')"
                  :disabled="isRayEndpointCoordinateLocked(r!, r!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
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
                  @click="nudgeRayCoord('p2', 'z', 'up')"
                  :disabled="isRayEndpointCoordinateLocked(r!, r!.p2)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              射线{{ r!.name ?? '' }}
              <span v-if="props.editor.isRayLocked(r!)" class="lock-badge">🔒</span>
              <span v-if="r!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('ray', r!.id, '射线' + (r!.name ?? ''))"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
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

        <div
          v-for="v in selectedVectors"
          :key="v!.id"
          class="selectedVector-info"
          @dblclick="startEditVector(v)"
        >
          <div v-if="editing?.type === 'vector' && editing?.id === v!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editVector.name" @input="applyEditVector" />
              <label class="toggle-label">
                <input type="checkbox" v-model="editVector.visible" @change="applyEditVector" />
                {{ editVector.visible ? '向量显示' : '向量隐藏' }}
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editVector.nameVisible" @change="applyEditVector" />
                {{ editVector.nameVisible ? '名称显示' : '名称隐藏' }}
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editVector.valueVisible"
                  @change="applyEditVector"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editVector.userLocked" @change="applyEditVector" />
                锁定
              </label>
            </div>
            <div class="name-row length-row">
              <label>长度</label>
              <div class="coord-input compact-length-input">
                <button type="button" class="step-btn" @click="nudgeVectorLength('down')">-</button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.length', el)"
                  v-model="editVector.length"
                  @input="applyEditVector"
                  @focus="handleVectorLengthFocus"
                  @blur="handleVectorLengthBlur"
                  step="0.5"
                  min="0.1"
                />
                <button type="button" class="step-btn" @click="nudgeVectorLength('up')">+</button>
              </div>
            </div>
            <div
              class="line-editor-grid"
              :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
            >
              <div class="line-editor-head"></div>
              <div class="line-editor-head">
                <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                  起点{{ v!.p1.name ?? '' }}(x,y,z)
                </span>
                <span v-else class="line-editor-title-short">起点{{ v!.p1.name ?? '' }}</span>
                <span v-if="isPointCoordinateLocked(v!.p1)" class="lock-badge">🔒</span>
              </div>
              <div class="line-editor-head">
                <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                  终点{{ v!.p2.name ?? '' }}(x,y,z)
                </span>
                <span v-else class="line-editor-title-short">终点{{ v!.p2.name ?? '' }}</span>
                <span v-if="isPointCoordinateLocked(v!.p2)" class="lock-badge">🔒</span>
              </div>

              <div class="line-axis-label">x</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p1', 'x', 'down')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.p1.x', el)"
                  v-model="editVector.p1.x"
                  @input="applyEditVector"
                  @focus="handleVectorCoordFocus('p1', 'x')"
                  @blur="handleVectorCoordBlur('p1', 'x')"
                  step="0.5"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p1', 'x', 'up')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p2', 'x', 'down')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.p2.x', el)"
                  v-model="editVector.p2.x"
                  @input="applyEditVector"
                  @focus="handleVectorCoordFocus('p2', 'x')"
                  @blur="handleVectorCoordBlur('p2', 'x')"
                  step="0.5"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p2', 'x', 'up')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p1', 'y', 'down')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.p1.y', el)"
                  v-model="editVector.p1.y"
                  @input="applyEditVector"
                  @focus="handleVectorCoordFocus('p1', 'y')"
                  @blur="handleVectorCoordBlur('p1', 'y')"
                  step="0.5"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p1', 'y', 'up')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p2', 'y', 'down')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.p2.y', el)"
                  v-model="editVector.p2.y"
                  @input="applyEditVector"
                  @focus="handleVectorCoordFocus('p2', 'y')"
                  @blur="handleVectorCoordBlur('p2', 'y')"
                  step="0.5"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p2', 'y', 'up')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                >
                  +
                </button>
              </div>

              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p1', 'z', 'down')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.p1.z', el)"
                  v-model="editVector.p1.z"
                  @input="applyEditVector"
                  @focus="handleVectorCoordFocus('p1', 'z')"
                  @blur="handleVectorCoordBlur('p1', 'z')"
                  step="0.5"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p1', 'z', 'up')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p1)"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p2', 'z', 'down')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('vector.p2.z', el)"
                  v-model="editVector.p2.z"
                  @input="applyEditVector"
                  @focus="handleVectorCoordFocus('p2', 'z')"
                  @blur="handleVectorCoordBlur('p2', 'z')"
                  step="0.5"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeVectorCoord('p2', 'z', 'up')"
                  :disabled="isVectorEndpointCoordinateLocked(v!, v!.p2)"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              向量{{ v!.name ?? '' }}
              <span v-if="props.editor.isVectorLocked(v!)" class="lock-badge">🔒</span>
              <span v-if="v!.visible === false" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('vector', v!.id, '向量' + (v!.name ?? ''))"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>长度：{{ v!.getLength().toFixed(2) }}</div>
            <div>
              起点{{ v!.p1.name ?? '' }}（{{ v!.p1.position.x.toFixed(2) }},
              {{ v!.p1.position.y.toFixed(2) }}, {{ v!.p1.position.z.toFixed(2) }}）
            </div>
            <div>
              终点{{ v!.p2.name ?? '' }}（{{ v!.p2.position.x.toFixed(2) }},
              {{ v!.p2.position.y.toFixed(2) }}, {{ v!.p2.position.z.toFixed(2) }}）
            </div>
            <div>
              向量（{{ v!.getDirectionVector().x.toFixed(2) }},
              {{ v!.getDirectionVector().y.toFixed(2) }},
              {{ v!.getDirectionVector().z.toFixed(2) }}）
            </div>
          </div>
        </div>

        <div
          v-for="c in selectedCircles"
          :key="c!.id"
          class="selectedCircle-info"
          @dblclick="startEditCircle(c)"
        >
          <div v-if="editing?.type === 'circle' && editing?.id === c!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editCircle.name" @input="applyEditCircle" />
              <label class="toggle-label">
                <input type="checkbox" v-model="editCircle.visible" @change="applyEditCircle" />
                {{ editCircle.visible ? '圆显示' : '圆隐藏' }}
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editCircle.nameVisible" @change="applyEditCircle" />
                {{ editCircle.nameVisible ? '名称显示' : '名称隐藏' }}
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editCircle.valueVisible"
                  @change="applyEditCircle"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editCircle.userLocked" @change="applyEditCircle" />
                锁定
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editCircle.centerVisible"
                  @change="applyEditCircle"
                />
                圆心显示
              </label>
            </div>
            <template v-if="c!.isNormalCircle()">
              <div class="normal-circle-direction-row" style="grid-column: 1 / -1">
                法向量：{{ getDirectionLabel(c!) }}
              </div>
              <div class="length-row">
                <label>半径</label>
                <div class="coord-input compact-length-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeNormalCircleRadius('down')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.lockedRadius', el)"
                    v-model="editCircle.lockedRadius"
                    @input="applyEditCircle"
                    @focus="focusedCoord['circle.lockedRadius'] = true"
                    @blur="focusedCoord['circle.lockedRadius'] = false"
                    min="0.1"
                    step="0.1"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeNormalCircleRadius('up')"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="face-metric-row">
                <span class="metric-item"
                  >周长：{{
                    getCirclePiMode(c!.id)
                      ? formatPiCircumference(getNormalCircleRadius(c!))
                      : getNormalCircleCircumference(c!).toFixed(2)
                  }}</span
                >
                <span class="metric-sep">/</span>
                <span class="metric-item"
                  >面积：{{
                    getCirclePiMode(c!.id)
                      ? formatPiArea(getNormalCircleRadius(c!))
                      : getNormalCircleArea(c!).toFixed(2)
                  }}</span
                >
                <label class="pi-mode-toggle"
                  ><input
                    type="checkbox"
                    :checked="getCirclePiMode(c!.id)"
                    @change="toggleCirclePiMode(c!.id)"
                  />π模式</label
                >
              </div>
              <div class="line-editor-grid normal-circle-center-grid">
                <div class="line-editor-head"></div>
                <div class="line-editor-head">
                  <span class="line-editor-title-full">圆心点{{ c!.p1.name ?? 'A' }}(x,y,z)</span>
                  <span v-if="isPointCoordinateLocked(c!.p1)" class="lock-badge">🔒</span>
                </div>
                <div class="line-axis-label">x</div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'x', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p1.x', el)"
                    v-model="editCircle.p1.x"
                    @input="applyCirclePointCoord('p1')"
                    @focus="handleCirclePointCoordFocus('p1', 'x')"
                    @blur="handleCirclePointCoordBlur('p1', 'x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'x', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    +
                  </button>
                </div>
                <div class="line-axis-label">y</div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'y', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p1.y', el)"
                    v-model="editCircle.p1.y"
                    @input="applyCirclePointCoord('p1')"
                    @focus="handleCirclePointCoordFocus('p1', 'y')"
                    @blur="handleCirclePointCoordBlur('p1', 'y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'y', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    +
                  </button>
                </div>
                <div class="line-axis-label">z</div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'z', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p1.z', el)"
                    v-model="editCircle.p1.z"
                    @input="applyCirclePointCoord('p1')"
                    @focus="handleCirclePointCoordFocus('p1', 'z')"
                    @blur="handleCirclePointCoordBlur('p1', 'z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'z', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="length-row">
                <label>半径</label>
                <div class="coord-input compact-length-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeThreePointCircleRadius('down')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.threePointRadius', el)"
                    v-model="editCircle.threePointRadius"
                    @input="applyThreePointCircleRadius"
                    @focus="focusedCoord['circle.threePointRadius'] = true"
                    @blur="focusedCoord['circle.threePointRadius'] = false"
                    min="0.1"
                    step="0.1"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeThreePointCircleRadius('up')"
                  >
                    +
                  </button>
                </div>
              </div>
              <div class="face-metric-row">
                <span class="metric-item"
                  >周长：{{
                    getCirclePiMode(c!.id)
                      ? formatPiCircumference(c!.getRadius())
                      : c!.getCircumference().toFixed(2)
                  }}</span
                >
                <span class="metric-sep">/</span>
                <span class="metric-item"
                  >面积：{{
                    getCirclePiMode(c!.id) ? formatPiArea(c!.getRadius()) : c!.getArea().toFixed(2)
                  }}</span
                >
                <label class="pi-mode-toggle"
                  ><input
                    type="checkbox"
                    :checked="getCirclePiMode(c!.id)"
                    @change="toggleCirclePiMode(c!.id)"
                  />π模式</label
                >
              </div>
              <div class="line-editor-grid circle-editor-grid line-editor-grid--compact">
                <div class="line-editor-head"></div>
                <div class="line-editor-head">
                  <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                    点{{ c!.p1.name ?? 'A' }}(x,y,z)
                  </span>
                  <span v-else class="line-editor-title-short">点{{ c!.p1.name ?? 'A' }}</span>
                  <span v-if="isPointCoordinateLocked(c!.p1)" class="lock-badge">🔒</span>
                </div>
                <div class="line-editor-head">
                  <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                    点{{ c!.p2.name ?? 'B' }}(x,y,z)
                  </span>
                  <span v-else class="line-editor-title-short">点{{ c!.p2.name ?? 'B' }}</span>
                  <span v-if="isPointCoordinateLocked(c!.p2)" class="lock-badge">🔒</span>
                </div>
                <div class="line-editor-head">
                  <span v-if="!isCompactLineEditor" class="line-editor-title-full">
                    点{{ c!.p3.name ?? 'C' }}(x,y,z)
                  </span>
                  <span v-else class="line-editor-title-short">点{{ c!.p3.name ?? 'C' }}</span>
                  <span v-if="isPointCoordinateLocked(c!.p3)" class="lock-badge">🔒</span>
                </div>
                <div class="line-axis-label">x</div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'x', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p1.x', el)"
                    v-model="editCircle.p1.x"
                    @input="applyCirclePointCoord('p1')"
                    @focus="handleCirclePointCoordFocus('p1', 'x')"
                    @blur="handleCirclePointCoordBlur('p1', 'x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'x', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    +
                  </button>
                </div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p2', 'x', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p2.x', el)"
                    v-model="editCircle.p2.x"
                    @input="applyCirclePointCoord('p2')"
                    @focus="handleCirclePointCoordFocus('p2', 'x')"
                    @blur="handleCirclePointCoordBlur('p2', 'x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p2', 'x', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  >
                    +
                  </button>
                </div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p3', 'x', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p3.x', el)"
                    v-model="editCircle.p3.x"
                    @input="applyCirclePointCoord('p3')"
                    @focus="handleCirclePointCoordFocus('p3', 'x')"
                    @blur="handleCirclePointCoordBlur('p3', 'x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p3', 'x', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  >
                    +
                  </button>
                </div>
                <div class="line-axis-label">y</div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'y', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p1.y', el)"
                    v-model="editCircle.p1.y"
                    @input="applyCirclePointCoord('p1')"
                    @focus="handleCirclePointCoordFocus('p1', 'y')"
                    @blur="handleCirclePointCoordBlur('p1', 'y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'y', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    +
                  </button>
                </div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p2', 'y', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p2.y', el)"
                    v-model="editCircle.p2.y"
                    @input="applyCirclePointCoord('p2')"
                    @focus="handleCirclePointCoordFocus('p2', 'y')"
                    @blur="handleCirclePointCoordBlur('p2', 'y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p2', 'y', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  >
                    +
                  </button>
                </div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p3', 'y', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p3.y', el)"
                    v-model="editCircle.p3.y"
                    @input="applyCirclePointCoord('p3')"
                    @focus="handleCirclePointCoordFocus('p3', 'y')"
                    @blur="handleCirclePointCoordBlur('p3', 'y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p3', 'y', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  >
                    +
                  </button>
                </div>
                <div class="line-axis-label">z</div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'z', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p1.z', el)"
                    v-model="editCircle.p1.z"
                    @input="applyCirclePointCoord('p1')"
                    @focus="handleCirclePointCoordFocus('p1', 'z')"
                    @blur="handleCirclePointCoordBlur('p1', 'z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p1', 'z', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p1)"
                  >
                    +
                  </button>
                </div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p2', 'z', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p2.z', el)"
                    v-model="editCircle.p2.z"
                    @input="applyCirclePointCoord('p2')"
                    @focus="handleCirclePointCoordFocus('p2', 'z')"
                    @blur="handleCirclePointCoordBlur('p2', 'z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p2', 'z', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p2)"
                  >
                    +
                  </button>
                </div>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p3', 'z', 'down')"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('circle.p3.z', el)"
                    v-model="editCircle.p3.z"
                    @input="applyCirclePointCoord('p3')"
                    @focus="handleCirclePointCoordFocus('p3', 'z')"
                    @blur="handleCirclePointCoordBlur('p3', 'z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @pointerdown.prevent
                    @click="nudgeCirclePointCoord('p3', 'z', 'up')"
                    :disabled="isPointCoordinateLocked(c!.p3)"
                  >
                    +
                  </button>
                </div>
              </div>
            </template>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ c!.isNormalCircle() ? '法向圆' : '三点圆' }}{{ c!.name ?? '' }}
              <span v-if="props.editor.isCircleLocked(c!)" class="lock-badge">🔒</span>
              <span v-if="getConeForNormalCircle(c!)" class="constraint-badge">圆锥约束</span>
              <span v-if="c!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="
                  handleDeleteElement(
                    'circle',
                    c!.id,
                    (c!.isNormalCircle() ? '法向圆' : '三点圆') + (c!.name ?? ''),
                  )
                "
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <template v-if="c!.isNormalCircle()">
              <div class="face-metric-row">
                <span class="metric-item">半径：{{ getNormalCircleRadius(c!).toFixed(2) }}</span>
              </div>
              <div class="face-metric-row">
                <span class="metric-item"
                  >周长：{{
                    getCirclePiMode(c!.id)
                      ? formatPiCircumference(getNormalCircleRadius(c!))
                      : getNormalCircleCircumference(c!).toFixed(2)
                  }}</span
                >
                <span class="metric-sep">/</span>
                <span class="metric-item"
                  >面积：{{
                    getCirclePiMode(c!.id)
                      ? formatPiArea(getNormalCircleRadius(c!))
                      : getNormalCircleArea(c!).toFixed(2)
                  }}</span
                >
              </div>
              <div>
                圆心{{ c!.p1.name ?? '' }}（{{ c!.p1.position.x.toFixed(2) }},
                {{ c!.p1.position.y.toFixed(2) }}, {{ c!.p1.position.z.toFixed(2) }}）
              </div>
              <div>法向量：{{ getDirectionLabel(c!) }}</div>
            </template>
            <template v-else>
              <div class="face-metric-row">
                <span class="metric-item">半径：{{ c!.getRadius().toFixed(2) }}</span>
              </div>
              <div class="face-metric-row">
                <span class="metric-item"
                  >周长：{{
                    getCirclePiMode(c!.id)
                      ? formatPiCircumference(c!.getRadius())
                      : c!.getCircumference().toFixed(2)
                  }}</span
                >
                <span class="metric-sep">/</span>
                <span class="metric-item"
                  >面积：{{
                    getCirclePiMode(c!.id) ? formatPiArea(c!.getRadius()) : c!.getArea().toFixed(2)
                  }}</span
                >
              </div>
              <div>
                点{{ c!.p1.name ?? '' }}（{{ c!.p1.position.x.toFixed(2) }},
                {{ c!.p1.position.y.toFixed(2) }}, {{ c!.p1.position.z.toFixed(2) }}）
              </div>
              <div>
                点{{ c!.p2.name ?? '' }}（{{ c!.p2.position.x.toFixed(2) }},
                {{ c!.p2.position.y.toFixed(2) }}, {{ c!.p2.position.z.toFixed(2) }}）
              </div>
              <div>
                点{{ c!.p3.name ?? '' }}（{{ c!.p3.position.x.toFixed(2) }},
                {{ c!.p3.position.y.toFixed(2) }}, {{ c!.p3.position.z.toFixed(2) }}）
              </div>
              <div v-if="getCircleCenterPoint(c!.id)" class="point-summary-line">
                <span class="point-summary-text">
                  点{{ getCircleCenterPoint(c!.id)!.name }}（{{
                    getCircleCenterPoint(c!.id)!.position.x.toFixed(2)
                  }}, {{ getCircleCenterPoint(c!.id)!.position.y.toFixed(2) }},
                  {{ getCircleCenterPoint(c!.id)!.position.z.toFixed(2) }}）
                </span>
                <span class="constraint-badge">圆心约束</span>
              </div>
            </template>
          </div>
        </div>

        <div
          v-for="cube in selectedHexahedrons"
          :key="cube.cubeId"
          class="selectedFace-info"
          @dblclick="startEditHexahedron(cube.cubeId)"
        >
          <div
            v-if="editing?.type === 'hexahedron' && editing?.id === cube.cubeId"
            class="edit-grid"
          >
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editHexahedron.nameSuffix" @input="applyHexahedronMeta" />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editHexahedron.userLocked"
                  @change="applyHexahedronMeta"
                />
                锁定
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editHexahedron.valueVisible"
                  @change="applyHexahedronMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editHexahedron.edgeLengthLocked"
                  @change="applyHexahedronMeta"
                />
                边长锁定
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{
                  props.editor.getCubeConstraint(cube.cubeId)?.getArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{ getHexahedronVolume(cube.cubeId).toFixed(2) }}</span
              >
            </div>
            <div class="length-row">
              <label>边长：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronEdgeLength('down')"
                  :disabled="isHexahedronEdgeLengthInputDisabled()"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('hexa.edgeLength', el)"
                  v-model="editHexahedron.edgeLength"
                  @input="applyHexahedronEdgeLength"
                  @focus="handleHexahedronEdgeLengthFocus"
                  @blur="handleHexahedronEdgeLengthBlur"
                  :disabled="isHexahedronEdgeLengthInputDisabled()"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronEdgeLength('up')"
                  :disabled="isHexahedronEdgeLengthInputDisabled()"
                >
                  +
                </button>
              </div>
            </div>
            <div class="face-metric-row">原始点坐标</div>
            <div
              class="line-editor-grid"
              :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
            >
              <div class="line-editor-head"></div>
              <div class="line-editor-head">
                {{ getHexahedronOwnerPoints(cube.cubeId)[0]?.name ?? 'A' }}(x,y,z)
              </div>
              <div class="line-editor-head">
                {{ getHexahedronOwnerPoints(cube.cubeId)[1]?.name ?? 'B' }}(x,y,z)
              </div>
              <div class="line-axis-label">x</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p1', 'x', 'down')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('hexa.p1.x', el)"
                  v-model="editHexahedron.p1.x"
                  @input="applyHexahedronOwnerPoint('p1')"
                  @focus="handleHexahedronOwnerCoordFocus('p1', 'x')"
                  @blur="handleHexahedronOwnerCoordBlur('p1', 'x')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p1', 'x', 'up')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p2', 'x', 'down')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('hexa.p2.x', el)"
                  v-model="editHexahedron.p2.x"
                  @input="applyHexahedronOwnerPoint('p2')"
                  @focus="handleHexahedronOwnerCoordFocus('p2', 'x')"
                  @blur="handleHexahedronOwnerCoordBlur('p2', 'x')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p2', 'x', 'up')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p1', 'y', 'down')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('hexa.p1.y', el)"
                  v-model="editHexahedron.p1.y"
                  @input="applyHexahedronOwnerPoint('p1')"
                  @focus="handleHexahedronOwnerCoordFocus('p1', 'y')"
                  @blur="handleHexahedronOwnerCoordBlur('p1', 'y')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p1', 'y', 'up')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p2', 'y', 'down')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('hexa.p2.y', el)"
                  v-model="editHexahedron.p2.y"
                  @input="applyHexahedronOwnerPoint('p2')"
                  @focus="handleHexahedronOwnerCoordFocus('p2', 'y')"
                  @blur="handleHexahedronOwnerCoordBlur('p2', 'y')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p2', 'y', 'up')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p1', 'z', 'down')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('hexa.p1.z', el)"
                  v-model="editHexahedron.p1.z"
                  @input="applyHexahedronOwnerPoint('p1')"
                  @focus="handleHexahedronOwnerCoordFocus('p1', 'z')"
                  @blur="handleHexahedronOwnerCoordBlur('p1', 'z')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p1', 'z', 'up')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[0])"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p2', 'z', 'down')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('hexa.p2.z', el)"
                  v-model="editHexahedron.p2.z"
                  @input="applyHexahedronOwnerPoint('p2')"
                  @focus="handleHexahedronOwnerCoordFocus('p2', 'z')"
                  @blur="handleHexahedronOwnerCoordBlur('p2', 'z')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeHexahedronOwnerCoord('p2', 'z', 'up')"
                  :disabled="isPointCoordinateLocked(getHexahedronOwnerPoints(cube.cubeId)[1])"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ cube.name }}
              <span
                v-if="cube.faceIds.every((faceId) => props.scene.faces.get(faceId)?.userLocked)"
                class="lock-badge"
                >🔒</span
              >
              <span v-if="cube.faceIds.some((faceId) => props.scene.faces.get(faceId)?.visible === false)" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('face', cube.faceIds[0]!, cube.name)"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>边长：{{ getHexahedronEdgeLength(cube.cubeId).toFixed(2) }}</div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{
                  props.editor.getCubeConstraint(cube.cubeId)?.getArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{ getHexahedronVolume(cube.cubeId).toFixed(2) }}</span
              >
            </div>
            <div>
              原始点：{{
                getHexahedronOwnerPoints(cube.cubeId)
                  .map((point) => point.name)
                  .join(' - ')
              }}
            </div>
          </div>
        </div>

        <div
          v-for="prism in selectedPrisms"
          :key="prism.prismId"
          class="selectedFace-info prism-info"
          @dblclick="startEditPrism(prism.prismId)"
        >
          <div
            v-if="editing?.type === 'prism' && editing?.id === prism.prismId"
            class="edit-grid"
          >
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editPrism.nameSuffix" @input="applyPrismMeta" />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPrism.userLocked"
                  @change="applyPrismMeta"
                />
                锁定
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPrism.valueVisible"
                  @change="applyPrismMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPrism.keepVertical"
                  @change="applyPrismMeta"
                />
                垂直保持
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{ getPrismSurfaceArea(prism.prismId).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{ getPrismVolume(prism.prismId).toFixed(2) }}</span
              >
            </div>
            <div class="length-row">
              <label>高度：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePrismHeight('down')"
                  :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1])"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('prism.height', el)"
                  v-model="editPrism.height"
                  @input="applyPrismHeight"
                  @focus="handlePrismHeightFocus"
                  @blur="handlePrismHeightBlur"
                  :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePrismHeight('up')"
                  :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1])"
                >
                  +
                </button>
              </div>
            </div>
            <div class="face-metric-row">
              最高点{{ getPrismOwnerPoints(prism.prismId)[1]?.name ?? '' }}坐标
            </div>
            <div class="coord-row">
              <div class="axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePrismTopPointCoord('x', 'down')"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'x')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('prism.topPoint.x', el)"
                    v-model="editPrism.topPoint.x"
                    @input="applyPrismTopPoint"
                    @focus="handlePrismTopPointCoordFocus('x')"
                    @blur="handlePrismTopPointCoordBlur('x')"
                    step="0.5"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'x')"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePrismTopPointCoord('x', 'up')"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'x')"
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
                    @click="nudgePrismTopPointCoord('y', 'down')"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'y')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('prism.topPoint.y', el)"
                    v-model="editPrism.topPoint.y"
                    @input="applyPrismTopPoint"
                    @focus="handlePrismTopPointCoordFocus('y')"
                    @blur="handlePrismTopPointCoordBlur('y')"
                    step="0.5"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'y')"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePrismTopPointCoord('y', 'up')"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'y')"
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
                    @click="nudgePrismTopPointCoord('z', 'down')"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'z')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('prism.topPoint.z', el)"
                    v-model="editPrism.topPoint.z"
                    @input="applyPrismTopPoint"
                    @focus="handlePrismTopPointCoordFocus('z')"
                    @blur="handlePrismTopPointCoordBlur('z')"
                    step="0.5"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'z')"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePrismTopPointCoord('z', 'up')"
                    :disabled="editPrism.userLocked || isPointCoordinateLocked(getPrismOwnerPoints(prism.prismId)[1]) || !isPrismTopPointAxisEditable(prism.prismId, 'z')"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div class="face-metric-row">多边形边长</div>
            <div class="face-edge-grid">
              <div
                v-for="(_, edgeIndex) in editPrism.bottomEdgeLengths"
                :key="`prism-bottom-edge-${edgeIndex}`"
                class="face-edge-row length-row axis-field"
              >
                <label>{{ getPrismBottomEdgeLabel(prism.prismId, edgeIndex) }}</label>
                <div class="coord-input compact-length-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePrismBottomEdgeLength(edgeIndex, 'down')"
                    :disabled="editPrism.userLocked || props.scene.faces.get(prism.bottomFaceId)?.userLocked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    :ref="(el) => setCoordInputRef(`prism.bottomEdge.${edgeIndex}`, el)"
                    v-model="editPrism.bottomEdgeLengths[edgeIndex]"
                    @input="applyPrismBottomEdgeLength(edgeIndex)"
                    @focus="handlePrismBottomEdgeLengthFocus(edgeIndex)"
                    @blur="handlePrismBottomEdgeLengthBlur(edgeIndex)"
                    :disabled="editPrism.userLocked || props.scene.faces.get(prism.bottomFaceId)?.userLocked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePrismBottomEdgeLength(edgeIndex, 'up')"
                    :disabled="editPrism.userLocked || props.scene.faces.get(prism.bottomFaceId)?.userLocked"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ prism.name }}
              <span
                v-if="props.editor.getPrismFaceIds(prism.prismId).every((faceId) => props.scene.faces.get(faceId)?.userLocked)"
                class="lock-badge"
                >🔒</span
              >
              <span v-if="props.editor.getPrismFaceIds(prism.prismId).some((faceId) => props.scene.faces.get(faceId)?.visible === false)" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('face', prism.bottomFaceId, prism.name)"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{ getPrismSurfaceArea(prism.prismId).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{ getPrismVolume(prism.prismId).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >高度：{{ getPrismHeight(prism.prismId).toFixed(2) }}</span
              >
            </div>
            <div>
              来源：{{ getPrismSourceLabel(prism.prismId) }}
            </div>
          </div>
        </div>

        <div
          v-for="pyramid in selectedPyramids"
          :key="pyramid.pyramidId"
          class="selectedFace-info pyramid-info"
          @dblclick="startEditPyramid(pyramid.pyramidId)"
        >
          <div
            v-if="editing?.type === 'pyramid' && editing?.id === pyramid.pyramidId"
            class="edit-grid"
          >
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editPyramid.nameSuffix" @input="applyPyramidMeta" />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPyramid.userLocked"
                  @change="applyPyramidMeta"
                />
                锁定
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPyramid.valueVisible"
                  @change="applyPyramidMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editPyramid.keepVertical"
                  @change="applyPyramidMeta"
                />
                垂直保持
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{ getPyramidSurfaceArea(pyramid.pyramidId).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{ getPyramidVolume(pyramid.pyramidId).toFixed(2) }}</span
              >
            </div>
            <div class="length-row">
              <label>高度：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePyramidHeight('down')"
                  :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1])"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('pyramid.height', el)"
                  v-model="editPyramid.height"
                  @input="applyPyramidHeight"
                  @focus="handlePyramidHeightFocus"
                  @blur="handlePyramidHeightBlur"
                  :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1])"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgePyramidHeight('up')"
                  :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1])"
                >
                  +
                </button>
              </div>
            </div>
            <div class="face-metric-row">
              最高点{{ getPyramidOwnerPoints(pyramid.pyramidId)[1]?.name ?? '' }}坐标
            </div>
            <div class="coord-row">
              <div class="axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePyramidApexPointCoord('x', 'down')"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'x')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('pyramid.apexPoint.x', el)"
                    v-model="editPyramid.apexPoint.x"
                    @input="applyPyramidApexPoint"
                    @focus="handlePyramidApexPointCoordFocus('x')"
                    @blur="handlePyramidApexPointCoordBlur('x')"
                    step="0.5"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'x')"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePyramidApexPointCoord('x', 'up')"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'x')"
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
                    @click="nudgePyramidApexPointCoord('y', 'down')"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'y')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('pyramid.apexPoint.y', el)"
                    v-model="editPyramid.apexPoint.y"
                    @input="applyPyramidApexPoint"
                    @focus="handlePyramidApexPointCoordFocus('y')"
                    @blur="handlePyramidApexPointCoordBlur('y')"
                    step="0.5"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'y')"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePyramidApexPointCoord('y', 'up')"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'y')"
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
                    @click="nudgePyramidApexPointCoord('z', 'down')"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'z')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('pyramid.apexPoint.z', el)"
                    v-model="editPyramid.apexPoint.z"
                    @input="applyPyramidApexPoint"
                    @focus="handlePyramidApexPointCoordFocus('z')"
                    @blur="handlePyramidApexPointCoordBlur('z')"
                    step="0.5"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'z')"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePyramidApexPointCoord('z', 'up')"
                    :disabled="editPyramid.userLocked || isPointCoordinateLocked(getPyramidOwnerPoints(pyramid.pyramidId)[1]) || !isPyramidApexAxisEditable(pyramid.pyramidId, 'z')"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <div class="face-metric-row">多边形边长</div>
            <div class="face-edge-grid">
              <div
                v-for="(_, edgeIndex) in editPyramid.bottomEdgeLengths"
                :key="`pyramid-bottom-edge-${edgeIndex}`"
                class="face-edge-row length-row axis-field"
              >
                <label>{{ getPyramidBottomEdgeLabel(pyramid.pyramidId, edgeIndex) }}</label>
                <div class="coord-input compact-length-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePyramidBottomEdgeLength(edgeIndex, 'down')"
                    :disabled="editPyramid.userLocked || props.scene.faces.get(pyramid.bottomFaceId)?.userLocked"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    :ref="(el) => setCoordInputRef(`pyramid.bottomEdge.${edgeIndex}`, el)"
                    v-model="editPyramid.bottomEdgeLengths[edgeIndex]"
                    @input="applyPyramidBottomEdgeLength(edgeIndex)"
                    @focus="handlePyramidBottomEdgeLengthFocus(edgeIndex)"
                    @blur="handlePyramidBottomEdgeLengthBlur(edgeIndex)"
                    :disabled="editPyramid.userLocked || props.scene.faces.get(pyramid.bottomFaceId)?.userLocked"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgePyramidBottomEdgeLength(edgeIndex, 'up')"
                    :disabled="editPyramid.userLocked || props.scene.faces.get(pyramid.bottomFaceId)?.userLocked"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ pyramid.name }}
              <span
                v-if="props.editor.getPyramidFaceIds(pyramid.pyramidId).every((faceId) => props.scene.faces.get(faceId)?.userLocked)"
                class="lock-badge"
                >🔒</span
              >
              <span v-if="props.editor.getPyramidFaceIds(pyramid.pyramidId).some((faceId) => props.scene.faces.get(faceId)?.visible === false)" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('face', pyramid.bottomFaceId, pyramid.name)"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{ getPyramidSurfaceArea(pyramid.pyramidId).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{ getPyramidVolume(pyramid.pyramidId).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >高度：{{ getPyramidHeight(pyramid.pyramidId).toFixed(2) }}</span
              >
            </div>
            <div>
              来源：{{ getPyramidSourceLabel(pyramid.pyramidId) }}
            </div>
          </div>
        </div>

        <div
          v-for="rp in selectedRegularPolygons"
          :key="rp.constraintId"
          class="selectedFace-info"
          @dblclick="startEditRegularPolygon(rp.constraintId)"
        >
          <div
            v-if="editing?.type === 'regularPolygon' && editing?.id === rp.constraintId"
            class="edit-grid"
          >
            <div class="name-row">
              <label>名称</label>
              <input
                type="text"
                v-model="editRegularPolygon.nameSuffix"
                @input="applyRegularPolygonMeta"
              />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editRegularPolygon.nameVisible"
                  @change="applyRegularPolygonMeta"
                />
                名称显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editRegularPolygon.userLocked"
                  @change="applyRegularPolygonMeta"
                />
                锁定
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editRegularPolygon.valueVisible"
                  @change="applyRegularPolygonMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editRegularPolygon.edgeLengthLocked"
                  @change="applyRegularPolygonMeta"
                />
                边长锁定
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >周长：{{
                  props.editor
                    .getRegularPolygonConstraint(rp.constraintId)
                    ?.getPerimeter()
                    .toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >面积：{{ props.editor.getRegularPolygonArea(rp.constraintId).toFixed(2) }}</span
              >
            </div>
            <div class="length-row">
              <label>边长：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonEdgeLength('down')"
                  :disabled="isRegularPolygonEdgeLengthInputDisabled()"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('rp.edgeLength', el)"
                  v-model="editRegularPolygon.edgeLength"
                  @input="applyRegularPolygonEdgeLength"
                  @focus="handleRegularPolygonEdgeLengthFocus"
                  @blur="handleRegularPolygonEdgeLengthBlur"
                  :disabled="isRegularPolygonEdgeLengthInputDisabled()"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonEdgeLength('up')"
                  :disabled="isRegularPolygonEdgeLengthInputDisabled()"
                >
                  +
                </button>
              </div>
            </div>
            <div class="face-metric-row">原始点坐标</div>
            <div
              class="line-editor-grid"
              :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
            >
              <div class="line-editor-head"></div>
              <div class="line-editor-head">
                {{
                  props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0]?.name ?? 'A'
                }}(x,y,z)
              </div>
              <div class="line-editor-head">
                {{
                  props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1]?.name ?? 'B'
                }}(x,y,z)
              </div>
              <div class="line-axis-label">x</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p1', 'x', 'down')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('rp.p1.x', el)"
                  v-model="editRegularPolygon.p1.x"
                  @input="applyRegularPolygonOwnerPoint('p1')"
                  @focus="handleRegularPolygonOwnerCoordFocus('p1', 'x')"
                  @blur="handleRegularPolygonOwnerCoordBlur('p1', 'x')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p1', 'x', 'up')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p2', 'x', 'down')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('rp.p2.x', el)"
                  v-model="editRegularPolygon.p2.x"
                  @input="applyRegularPolygonOwnerPoint('p2')"
                  @focus="handleRegularPolygonOwnerCoordFocus('p2', 'x')"
                  @blur="handleRegularPolygonOwnerCoordBlur('p2', 'x')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p2', 'x', 'up')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p1', 'y', 'down')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('rp.p1.y', el)"
                  v-model="editRegularPolygon.p1.y"
                  @input="applyRegularPolygonOwnerPoint('p1')"
                  @focus="handleRegularPolygonOwnerCoordFocus('p1', 'y')"
                  @blur="handleRegularPolygonOwnerCoordBlur('p1', 'y')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p1', 'y', 'up')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p2', 'y', 'down')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('rp.p2.y', el)"
                  v-model="editRegularPolygon.p2.y"
                  @input="applyRegularPolygonOwnerPoint('p2')"
                  @focus="handleRegularPolygonOwnerCoordFocus('p2', 'y')"
                  @blur="handleRegularPolygonOwnerCoordBlur('p2', 'y')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p2', 'y', 'up')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p1', 'z', 'down')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('rp.p1.z', el)"
                  v-model="editRegularPolygon.p1.z"
                  @input="applyRegularPolygonOwnerPoint('p1')"
                  @focus="handleRegularPolygonOwnerCoordFocus('p1', 'z')"
                  @blur="handleRegularPolygonOwnerCoordBlur('p1', 'z')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p1', 'z', 'up')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[0],
                    )
                  "
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p2', 'z', 'down')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('rp.p2.z', el)"
                  v-model="editRegularPolygon.p2.z"
                  @input="applyRegularPolygonOwnerPoint('p2')"
                  @focus="handleRegularPolygonOwnerCoordFocus('p2', 'z')"
                  @blur="handleRegularPolygonOwnerCoordBlur('p2', 'z')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeRegularPolygonOwnerCoord('p2', 'z', 'up')"
                  :disabled="
                    isPointCoordinateLocked(
                      props.editor.getRegularPolygonOwnerPoints(rp.constraintId)[1],
                    )
                  "
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ rp.name }}
              <span v-if="props.scene.faces.get(rp.faceId)?.userLocked" class="lock-badge">🔒</span>
              <span v-if="props.scene.faces.get(rp.faceId)?.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('face', rp.faceId, rp.name)"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div>边长：{{ rp.getEdgeLength().toFixed(2) }}</div>
            <div class="face-metric-row">
              <span class="metric-item">周长：{{ rp.getPerimeter().toFixed(2) }}</span>
              <span class="metric-sep">/</span>
              <span class="metric-item">面积：{{ rp.getArea().toFixed(2) }}</span>
            </div>
            <div>
              原始点：{{
                props.editor
                  .getRegularPolygonOwnerPoints(rp.constraintId)
                  .map((point) => point.name)
                  .join(' - ')
              }}
            </div>
          </div>
        </div>

        <div
          v-for="s in selectedSpheres"
          :key="s!.id"
          class="selectedCircle-info"
          @dblclick="startEditSphere(s!.id)"
        >
          <div v-if="editing?.type === 'sphere' && editing?.id === s!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editSphere.nameSuffix" @input="applyEditSphereMeta" />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editSphere.nameVisible"
                  @change="applyEditSphereMeta"
                />
                {{ editSphere.nameVisible ? '名称显示' : '名称隐藏' }}
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editSphere.valueVisible"
                  @change="applyEditSphereMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editSphere.userLocked"
                  @change="applyEditSphereMeta"
                  :disabled="s!.centerPoint.id === Scene.ORIGIN_ID"
                />
                锁定
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{
                  getSpherePiMode(s!.id)
                    ? formatPiSphereArea(props.editor.getSphereRadius(s!.id))
                    : s!.getArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{
                  getSpherePiMode(s!.id)
                    ? formatPiSphereVolume(props.editor.getSphereRadius(s!.id))
                    : s!.getVolume().toFixed(2)
                }}</span
              >
              <label class="pi-mode-toggle"
                ><input
                  type="checkbox"
                  :checked="getSpherePiMode(s!.id)"
                  @change="toggleSpherePiMode(s!.id)"
                />π模式</label
              >
            </div>
            <div class="length-row">
              <label>半径：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeSphereRadius('down')"
                  :disabled="!s!.isRadiusSphere() && editSphere.userLocked"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('sphere.radius', el)"
                  v-model="editSphere.radius"
                  @input="applyEditSphereRadius"
                  @focus="handleSphereRadiusFocus"
                  @blur="handleSphereRadiusBlur"
                  :disabled="!s!.isRadiusSphere() && editSphere.userLocked"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeSphereRadius('up')"
                  :disabled="!s!.isRadiusSphere() && editSphere.userLocked"
                >
                  +
                </button>
              </div>
            </div>
            <div class="coord-row-title">
              球心{{ props.editor.getSphereCenterPoint(s!.id)?.name ?? 'A' }}(x,y,z)
            </div>
            <div class="coord-row">
              <div class="axis-field">
                <label>x</label>
                <div class="coord-input">
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeSpherePointCoord('centerPoint', 'x', 'down')"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('sphere.centerPoint.x', el)"
                    v-model="editSphere.centerPoint.x"
                    @input="applySpherePointCoord('centerPoint')"
                    @focus="handleSpherePointCoordFocus('centerPoint', 'x')"
                    @blur="handleSpherePointCoordBlur('centerPoint', 'x')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeSpherePointCoord('centerPoint', 'x', 'up')"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
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
                    @click="nudgeSpherePointCoord('centerPoint', 'y', 'down')"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('sphere.centerPoint.y', el)"
                    v-model="editSphere.centerPoint.y"
                    @input="applySpherePointCoord('centerPoint')"
                    @focus="handleSpherePointCoordFocus('centerPoint', 'y')"
                    @blur="handleSpherePointCoordBlur('centerPoint', 'y')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeSpherePointCoord('centerPoint', 'y', 'up')"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
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
                    @click="nudgeSpherePointCoord('centerPoint', 'z', 'down')"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    :ref="(el) => setCoordInputRef('sphere.centerPoint.z', el)"
                    v-model="editSphere.centerPoint.z"
                    @input="applySpherePointCoord('centerPoint')"
                    @focus="handleSpherePointCoordFocus('centerPoint', 'z')"
                    @blur="handleSpherePointCoordBlur('centerPoint', 'z')"
                    step="0.5"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    @click="nudgeSpherePointCoord('centerPoint', 'z', 'up')"
                    :disabled="isPointCoordinateLocked(props.editor.getSphereCenterPoint(s!.id))"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <template v-if="props.editor.getSphereRadiusPoint(s!.id)">
              <div class="coord-row-title">
                半径{{ props.editor.getSphereRadiusPoint(s!.id)?.name ?? 'B' }}(x,y,z)
              </div>
              <div class="coord-row">
                <div class="axis-field">
                  <label>x</label>
                  <div class="coord-input">
                    <button
                      type="button"
                      class="step-btn"
                      @click="nudgeSpherePointCoord('radiusPoint', 'x', 'down')"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      :ref="(el) => setCoordInputRef('sphere.radiusPoint.x', el)"
                      v-model="editSphere.radiusPoint.x"
                      @input="applySpherePointCoord('radiusPoint')"
                      @focus="handleSpherePointCoordFocus('radiusPoint', 'x')"
                      @blur="handleSpherePointCoordBlur('radiusPoint', 'x')"
                      step="0.5"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    />
                    <button
                      type="button"
                      class="step-btn"
                      @click="nudgeSpherePointCoord('radiusPoint', 'x', 'up')"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
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
                      @click="nudgeSpherePointCoord('radiusPoint', 'y', 'down')"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      :ref="(el) => setCoordInputRef('sphere.radiusPoint.y', el)"
                      v-model="editSphere.radiusPoint.y"
                      @input="applySpherePointCoord('radiusPoint')"
                      @focus="handleSpherePointCoordFocus('radiusPoint', 'y')"
                      @blur="handleSpherePointCoordBlur('radiusPoint', 'y')"
                      step="0.5"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    />
                    <button
                      type="button"
                      class="step-btn"
                      @click="nudgeSpherePointCoord('radiusPoint', 'y', 'up')"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
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
                      @click="nudgeSpherePointCoord('radiusPoint', 'z', 'down')"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      :ref="(el) => setCoordInputRef('sphere.radiusPoint.z', el)"
                      v-model="editSphere.radiusPoint.z"
                      @input="applySpherePointCoord('radiusPoint')"
                      @focus="handleSpherePointCoordFocus('radiusPoint', 'z')"
                      @blur="handleSpherePointCoordBlur('radiusPoint', 'z')"
                      step="0.5"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    />
                    <button
                      type="button"
                      class="step-btn"
                      @click="nudgeSpherePointCoord('radiusPoint', 'z', 'up')"
                      :disabled="isPointCoordinateLocked(props.editor.getSphereRadiusPoint(s!.id))"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ s!.name ?? '' }}
              <span v-if="props.editor.isSphereGeometryLocked(s!)" class="lock-badge">🔒</span>
              <span v-if="s!.visible === false" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('sphere', s!.id, s!.name ?? '')"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >半径：{{ props.editor.getSphereRadius(s!.id).toFixed(2) }}</span
              >
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >表面积：{{
                  getSpherePiMode(s!.id)
                    ? formatPiSphereArea(props.editor.getSphereRadius(s!.id))
                    : s!.getArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{
                  getSpherePiMode(s!.id)
                    ? formatPiSphereVolume(props.editor.getSphereRadius(s!.id))
                    : s!.getVolume().toFixed(2)
                }}</span
              >
            </div>
          </div>
        </div>

        <div
          v-for="c in selectedCones"
          :key="c!.id"
          class="selectedCone-info"
          @dblclick="startEditCone(c!.id)"
        >
          <div v-if="editing?.type === 'cone' && editing?.id === c!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editCone.nameSuffix" @input="applyEditConeMeta" />
              <label class="toggle-label">
                <input type="checkbox" v-model="editCone.nameVisible" @change="applyEditConeMeta" />
                {{ editCone.nameVisible ? '名称显示' : '名称隐藏' }}
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editCone.valueVisible"
                  @change="applyEditConeMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editCone.userLocked" @change="applyEditConeMeta" />
                锁定
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >侧面积：{{
                  getConePiMode(c!.id)
                    ? formatPiConeLateralArea(
                        props.editor.getConeRadius(c!.id),
                        props.editor.getConeHeight(c!.id),
                      )
                    : c!.getLateralArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >底面积：{{
                  getConePiMode(c!.id)
                    ? formatPiConeBaseArea(props.editor.getConeRadius(c!.id))
                    : c!.getBaseArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{
                  getConePiMode(c!.id)
                    ? formatPiConeVolume(
                        props.editor.getConeRadius(c!.id),
                        props.editor.getConeHeight(c!.id),
                      )
                    : c!.getVolume().toFixed(2)
                }}</span
              >
              <label class="pi-mode-toggle"
                ><input
                  type="checkbox"
                  :checked="getConePiMode(c!.id)"
                  @change="toggleConePiMode(c!.id)"
                />π模式</label
              >
            </div>
            <div class="length-row">
              <label>半径：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConeRadius('down')"
                  :disabled="editCone.userLocked"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('cone.radius', el)"
                  v-model="editCone.radius"
                  @input="applyEditConeRadius"
                  @focus="handleConeRadiusFocus"
                  @blur="handleConeRadiusBlur"
                  :disabled="editCone.userLocked"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConeRadius('up')"
                  :disabled="editCone.userLocked"
                >
                  +
                </button>
              </div>
            </div>
            <div class="length-row">
              <label>高度：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConeHeight('down')"
                  :disabled="editCone.userLocked"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('cone.height', el)"
                  v-model="editCone.height"
                  @input="applyEditConeHeight"
                  @focus="handleConeHeightFocus"
                  @blur="handleConeHeightBlur"
                  :disabled="editCone.userLocked"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConeHeight('up')"
                  :disabled="editCone.userLocked"
                >
                  +
                </button>
              </div>
            </div>
            <div
              class="line-editor-grid"
              :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
            >
              <div class="line-editor-head"></div>
              <div class="line-editor-head">
                底心{{ props.editor.getConeBaseCenterPoint(c!.id)?.name ?? 'A' }}(x,y,z)
              </div>
              <div class="line-editor-head">
                顶点{{ props.editor.getConeApexPoint(c!.id)?.name ?? 'B' }}(x,y,z)
              </div>
              <div class="line-axis-label">x</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('baseCenterPoint', 'x', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cone.baseCenterPoint.x', el)"
                  v-model="editCone.baseCenterPoint.x"
                  @input="applyConePointCoord('baseCenterPoint')"
                  @focus="handleConePointCoordFocus('baseCenterPoint', 'x')"
                  @blur="handleConePointCoordBlur('baseCenterPoint', 'x')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('baseCenterPoint', 'x', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('apexPoint', 'x', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cone.apexPoint.x', el)"
                  v-model="editCone.apexPoint.x"
                  @input="applyConePointCoord('apexPoint')"
                  @focus="handleConePointCoordFocus('apexPoint', 'x')"
                  @blur="handleConePointCoordBlur('apexPoint', 'x')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('apexPoint', 'x', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('baseCenterPoint', 'y', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cone.baseCenterPoint.y', el)"
                  v-model="editCone.baseCenterPoint.y"
                  @input="applyConePointCoord('baseCenterPoint')"
                  @focus="handleConePointCoordFocus('baseCenterPoint', 'y')"
                  @blur="handleConePointCoordBlur('baseCenterPoint', 'y')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('baseCenterPoint', 'y', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('apexPoint', 'y', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cone.apexPoint.y', el)"
                  v-model="editCone.apexPoint.y"
                  @input="applyConePointCoord('apexPoint')"
                  @focus="handleConePointCoordFocus('apexPoint', 'y')"
                  @blur="handleConePointCoordBlur('apexPoint', 'y')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('apexPoint', 'y', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('baseCenterPoint', 'z', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cone.baseCenterPoint.z', el)"
                  v-model="editCone.baseCenterPoint.z"
                  @input="applyConePointCoord('baseCenterPoint')"
                  @focus="handleConePointCoordFocus('baseCenterPoint', 'z')"
                  @blur="handleConePointCoordBlur('baseCenterPoint', 'z')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('baseCenterPoint', 'z', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeBaseCenterPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('apexPoint', 'z', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cone.apexPoint.z', el)"
                  v-model="editCone.apexPoint.z"
                  @input="applyConePointCoord('apexPoint')"
                  @focus="handleConePointCoordFocus('apexPoint', 'z')"
                  @blur="handleConePointCoordBlur('apexPoint', 'z')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeConePointCoord('apexPoint', 'z', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getConeApexPoint(c!.id))"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ c!.name ?? '' }}
              <span v-if="props.editor.isConeGeometryLocked(c!)" class="lock-badge">🔒</span>
              <span v-if="c!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('cone', c!.id, c!.name ?? '')"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >半径：{{ props.editor.getConeRadius(c!.id).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >高度：{{ props.editor.getConeHeight(c!.id).toFixed(2) }}</span
              >
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >体积：{{
                  getConePiMode(c!.id)
                    ? formatPiConeVolume(
                        props.editor.getConeRadius(c!.id),
                        props.editor.getConeHeight(c!.id),
                      )
                    : c!.getVolume().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >表面积：{{
                  getConePiMode(c!.id)
                    ? formatPiConeLateralArea(
                        props.editor.getConeRadius(c!.id),
                        props.editor.getConeHeight(c!.id),
                      )
                    : c!.getLateralArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >底面积：{{
                  getConePiMode(c!.id)
                    ? formatPiConeBaseArea(props.editor.getConeRadius(c!.id))
                    : c!.getBaseArea().toFixed(2)
                }}</span
              >
            </div>
            <div>
              来源：点{{ props.editor.getConeBaseCenterPoint(c!.id)?.name ?? '' }}-点{{
                props.editor.getConeApexPoint(c!.id)?.name ?? ''
              }}<template v-if="c!.isNormalCircleCone() && c!.normalCircleId"
                >（法向圆{{ props.scene.circles.get(c!.normalCircleId)?.name ?? '' }}-点{{
                  props.editor.getConeApexPoint(c!.id)?.name ?? ''
                }}）</template
              >
            </div>
          </div>
        </div>

        <div
          v-for="c in selectedCylinders"
          :key="c!.id"
          class="selectedCylinder-info"
          @dblclick="startEditCylinder(c!.id)"
        >
          <div v-if="editing?.type === 'cylinder' && editing?.id === c!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editCylinder.nameSuffix" @input="applyEditCylinderMeta" />
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editCylinder.nameVisible"
                  @change="applyEditCylinderMeta"
                />
                {{ editCylinder.nameVisible ? '名称显示' : '名称隐藏' }}
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editCylinder.valueVisible"
                  @change="applyEditCylinderMeta"
                />
                数值显示
              </label>
              <label class="toggle-label">
                <input
                  type="checkbox"
                  v-model="editCylinder.userLocked"
                  @change="applyEditCylinderMeta"
                />
                锁定
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >侧面积：{{
                  getCylinderPiMode(c!.id)
                    ? formatPiCylinderLateralArea(
                        props.editor.getCylinderRadius(c!.id),
                        props.editor.getCylinderHeight(c!.id),
                      )
                    : c!.getLateralArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >底面积：{{
                  getCylinderPiMode(c!.id)
                    ? formatPiCylinderBaseArea(props.editor.getCylinderRadius(c!.id))
                    : c!.getBottomArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >体积：{{
                  getCylinderPiMode(c!.id)
                    ? formatPiCylinderVolume(
                        props.editor.getCylinderRadius(c!.id),
                        props.editor.getCylinderHeight(c!.id),
                      )
                    : c!.getVolume().toFixed(2)
                }}</span
              >
              <label class="pi-mode-toggle"
                ><input
                  type="checkbox"
                  :checked="getCylinderPiMode(c!.id)"
                  @change="toggleCylinderPiMode(c!.id)"
                />π模式</label
              >
            </div>
            <div class="length-row">
              <label>半径：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderRadius('down')"
                  :disabled="editCylinder.userLocked"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('cylinder.radius', el)"
                  v-model="editCylinder.radius"
                  @input="applyEditCylinderRadius"
                  @focus="handleCylinderRadiusFocus"
                  @blur="handleCylinderRadiusBlur"
                  :disabled="editCylinder.userLocked"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderRadius('up')"
                  :disabled="editCylinder.userLocked"
                >
                  +
                </button>
              </div>
            </div>
            <div class="length-row">
              <label>高度：</label>
              <div class="coord-input compact-length-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderHeight('down')"
                  :disabled="editCylinder.userLocked"
                >
                  -
                </button>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  :ref="(el) => setCoordInputRef('cylinder.height', el)"
                  v-model="editCylinder.height"
                  @input="applyEditCylinderHeight"
                  @focus="handleCylinderHeightFocus"
                  @blur="handleCylinderHeightBlur"
                  :disabled="editCylinder.userLocked"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderHeight('up')"
                  :disabled="editCylinder.userLocked"
                >
                  +
                </button>
              </div>
            </div>
            <div
              class="line-editor-grid"
              :class="{ 'line-editor-grid--compact': isCompactLineEditor }"
            >
              <div class="line-editor-head"></div>
              <div class="line-editor-head">
                底心{{ props.editor.getCylinderBottomCenterPoint(c!.id)?.name ?? 'A' }}(x,y,z)
              </div>
              <div class="line-editor-head">
                顶心{{ props.editor.getCylinderTopCenterPoint(c!.id)?.name ?? 'B' }}(x,y,z)
              </div>
              <div class="line-axis-label">x</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('bottomCenterPoint', 'x', 'down')"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cylinder.bottomCenterPoint.x', el)"
                  v-model="editCylinder.bottomCenterPoint.x"
                  @input="applyCylinderPointCoord('bottomCenterPoint')"
                  @focus="handleCylinderPointCoordFocus('bottomCenterPoint', 'x')"
                  @blur="handleCylinderPointCoordBlur('bottomCenterPoint', 'x')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('bottomCenterPoint', 'x', 'up')"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('topCenterPoint', 'x', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cylinder.topCenterPoint.x', el)"
                  v-model="editCylinder.topCenterPoint.x"
                  @input="applyCylinderPointCoord('topCenterPoint')"
                  @focus="handleCylinderPointCoordFocus('topCenterPoint', 'x')"
                  @blur="handleCylinderPointCoordBlur('topCenterPoint', 'x')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('topCenterPoint', 'x', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">y</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('bottomCenterPoint', 'y', 'down')"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cylinder.bottomCenterPoint.y', el)"
                  v-model="editCylinder.bottomCenterPoint.y"
                  @input="applyCylinderPointCoord('bottomCenterPoint')"
                  @focus="handleCylinderPointCoordFocus('bottomCenterPoint', 'y')"
                  @blur="handleCylinderPointCoordBlur('bottomCenterPoint', 'y')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('bottomCenterPoint', 'y', 'up')"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('topCenterPoint', 'y', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cylinder.topCenterPoint.y', el)"
                  v-model="editCylinder.topCenterPoint.y"
                  @input="applyCylinderPointCoord('topCenterPoint')"
                  @focus="handleCylinderPointCoordFocus('topCenterPoint', 'y')"
                  @blur="handleCylinderPointCoordBlur('topCenterPoint', 'y')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('topCenterPoint', 'y', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                >
                  +
                </button>
              </div>
              <div class="line-axis-label">z</div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('bottomCenterPoint', 'z', 'down')"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cylinder.bottomCenterPoint.z', el)"
                  v-model="editCylinder.bottomCenterPoint.z"
                  @input="applyCylinderPointCoord('bottomCenterPoint')"
                  @focus="handleCylinderPointCoordFocus('bottomCenterPoint', 'z')"
                  @blur="handleCylinderPointCoordBlur('bottomCenterPoint', 'z')"
                  step="0.5"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('bottomCenterPoint', 'z', 'up')"
                  :disabled="
                    isPointCoordinateLocked(props.editor.getCylinderBottomCenterPoint(c!.id))
                  "
                >
                  +
                </button>
              </div>
              <div class="coord-input">
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('topCenterPoint', 'z', 'down')"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                >
                  -
                </button>
                <input
                  type="number"
                  :ref="(el) => setCoordInputRef('cylinder.topCenterPoint.z', el)"
                  v-model="editCylinder.topCenterPoint.z"
                  @input="applyCylinderPointCoord('topCenterPoint')"
                  @focus="handleCylinderPointCoordFocus('topCenterPoint', 'z')"
                  @blur="handleCylinderPointCoordBlur('topCenterPoint', 'z')"
                  step="0.5"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                />
                <button
                  type="button"
                  class="step-btn"
                  @click="nudgeCylinderPointCoord('topCenterPoint', 'z', 'up')"
                  :disabled="isPointCoordinateLocked(props.editor.getCylinderTopCenterPoint(c!.id))"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ c!.name ?? '' }}
              <span v-if="props.editor.isCylinderGeometryLocked(c!)" class="lock-badge">🔒</span>
              <span v-if="c!.visible === false" class="hidden-badge" title="对象隐藏">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              </span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="handleDeleteElement('cylinder', c!.id, c!.name ?? '')"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >半径：{{ props.editor.getCylinderRadius(c!.id).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >高度：{{ props.editor.getCylinderHeight(c!.id).toFixed(2) }}</span
              >
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >体积：{{
                  getCylinderPiMode(c!.id)
                    ? formatPiCylinderVolume(
                        props.editor.getCylinderRadius(c!.id),
                        props.editor.getCylinderHeight(c!.id),
                      )
                    : c!.getVolume().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >表面积：{{
                  getCylinderPiMode(c!.id)
                    ? formatPiCylinderSurfaceArea(
                        props.editor.getCylinderRadius(c!.id),
                        props.editor.getCylinderHeight(c!.id),
                      )
                    : c!.getSurfaceArea().toFixed(2)
                }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item"
                >底面积：{{
                  getCylinderPiMode(c!.id)
                    ? formatPiCylinderBaseArea(props.editor.getCylinderRadius(c!.id))
                    : c!.getBottomArea().toFixed(2)
                }}</span
              >
            </div>
            <div>
              来源：点{{ props.editor.getCylinderBottomCenterPoint(c!.id)?.name ?? '' }}-点{{
                props.editor.getCylinderTopCenterPoint(c!.id)?.name ?? ''
              }}
            </div>
          </div>
        </div>

        <div
          v-for="face in selectedEditableFaces"
          :key="face!.id"
          class="selectedFace-info"
          @dblclick="startEditFace(face)"
        >
          <div v-if="editing?.type === 'face' && editing?.id === face!.id" class="edit-grid">
            <div class="name-row">
              <label>名称</label>
              <input type="text" v-model="editFace.name" @input="applyEditFace" />
              <label class="toggle-label">
                <input type="checkbox" v-model="editFace.visible" @change="applyEditFace" />
                多边形显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editFace.nameVisible" @change="applyEditFace" />
                名称显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editFace.valueVisible" @change="applyEditFace" />
                数值显示
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editFace.userLocked" @change="applyEditFace" />
                锁定
              </label>
              <label class="toggle-label">
                <input type="checkbox" v-model="editFace.areaLocked" @change="applyEditFace" />
                面积锁定
              </label>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >周长：{{ face!.getPerimeter(props.scene.points).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item">面积：{{ getFaceArea(face!).toFixed(2) }}</span>
            </div>
            <div class="face-edge-grid">
              <div
                v-for="(_, edgeIndex) in getFaceBoundaryPoints(face!)"
                :key="`${face!.id}-edge-${edgeIndex}`"
                class="face-edge-row length-row axis-field"
              >
                <label>{{ getFaceEdgeLabel(face!, edgeIndex) }}</label>
                <div class="coord-input compact-length-input">
                  <button
                    type="button"
                    class="step-btn"
                    :disabled="editFace.areaLocked"
                    @click="nudgeFaceEdgeLength(face!.id, edgeIndex, 'down')"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    :value="editFace.edgeLengths[edgeIndex]"
                    :disabled="editFace.areaLocked"
                    :ref="(el) => setCoordInputRef(`face.edge.${edgeIndex}`, el)"
                    @input="
                      editFace.edgeLengths[edgeIndex] = ($event.target as HTMLInputElement).value
                    "
                    @focus="handleFaceEdgeLengthFocus(edgeIndex)"
                    @blur="handleFaceEdgeLengthBlur(face!.id, edgeIndex)"
                  />
                  <button
                    type="button"
                    class="step-btn"
                    :disabled="editFace.areaLocked"
                    @click="nudgeFaceEdgeLength(face!.id, edgeIndex, 'up')"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div v-else>
            <div class="card-summary-header">
              {{ face!.isRegularPolygon ? '正多边形' : '多边形' }}{{ face!.name ?? '' }}
              <span v-if="face!.isRegularPolygon" class="constraint-badge"
                >正{{ face!.regularPolygonVertexCount }}边形</span
              >
              <span v-if="props.editor.isFaceLocked(face!)" class="lock-badge">🔒</span>
              <span v-if="isCubeFace(face!)" class="constraint-badge">{{
                getSolidConstraintBadge(face!.cubeId)
              }}</span>
              <span v-if="isPrismFace(face!)" class="constraint-badge">棱柱约束</span>
              <span v-if="isPyramidFace(face!)" class="constraint-badge">棱锥约束</span>
              <span v-if="face!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <button
                class="card-delete-btn"
                title="删除"
                @click.stop="
                  handleDeleteElement(
                    'face',
                    face!.id,
                    (face!.isRegularPolygon ? '正多边形' : '多边形') + (face!.name ?? ''),
                  )
                "
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </button>
            </div>
            <div class="face-metric-row">
              <span class="metric-item"
                >周长：{{ face!.getPerimeter(props.scene.points).toFixed(2) }}</span
              >
              <span class="metric-sep">/</span>
              <span class="metric-item">面积：{{ getFaceArea(face!).toFixed(2) }}</span>
              <span v-if="face!.areaLocked" class="lock-badge">🔒</span>
            </div>
            <div>
              质心（{{ getFaceCentroid(face!).x.toFixed(2) }},
              {{ getFaceCentroid(face!).y.toFixed(2) }}, {{ getFaceCentroid(face!).z.toFixed(2) }}）
            </div>
            <div>
              边界点：{{
                getFaceBoundaryPoints(face!)
                  .map((p) => p.name)
                  .join(' - ')
              }}
            </div>
            <div>共面点：{{ getFaceMemberPointNames(face!) }}</div>
          </div>
        </div>
      </div>
      <div
        ref="splitPaneDividerRef"
        class="panel-resizer"
        :class="{ 'is-dragging': isDraggingSplitPane, 'is-disabled': !isSplitPaneEnabled }"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整选中区和内容区高度"
        @pointerdown="startSplitPaneDrag"
      >
        <span class="panel-resizer-handle"></span>
      </div>
      <div class="content-heading">
        <h3>内容</h3>
        <button
          v-if="totalContentCount > 0"
          type="button"
          class="toggle-all-groups-btn"
          :title="isAllGroupsCollapsed ? '展开全部' : '折叠全部'"
          @click="toggleAllContentGroups"
        >
          <svg
            class="toggle-all-icon"
            :class="{ 'is-collapsed': isAllGroupsCollapsed }"
            viewBox="0 0 16 16"
            fill="currentColor"
            width="1em"
            height="1em"
          >
            <path class="toggle-all-icon-chevron" d="M4.5 6l3.5 4 3.5-4z" />
          </svg>
        </button>
      </div>
      <div class="box content-box" @click.self="clearContentSelection">
        <div
          v-if="
            pointsInScene.length === 0 &&
            linesInScene.length === 0 &&
            straightLinesInScene.length === 0 &&
            perpendicularLinesInScene.length === 0 &&
            raysInScene.length === 0 &&
            circlesInScene.length === 0 &&
            facesInScene.length === 0
          "
        >
          无
        </div>
        <div v-if="pointsInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.point"
            @click="toggleContentGroup('point')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.point ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.point }}</span>
            <span v-if="hasHiddenConstrainedPoints" class="hidden-hint-wrapper">
              <button
                type="button"
                class="hidden-hint-trigger"
                :class="{ active: hiddenPointHintPinned }"
                :ref="(el: any) => (hiddenPointHintTriggerRef = el)"
                @pointerenter="
                  (e: PointerEvent) => {
                    if (e.pointerType !== 'touch') showHiddenPointHint = true
                  }
                "
                @pointerleave="
                  (e: PointerEvent) => {
                    if (e.pointerType !== 'touch' && !hiddenPointHintPinned)
                      showHiddenPointHint = false
                  }
                "
                @click.stop="
                  hiddenPointHintPinned = !hiddenPointHintPinned;
                  showHiddenPointHint = hiddenPointHintPinned
                "
              >
                ?
              </button>
            </span>
            <span class="content-group-count">{{ pointsInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.point" class="content-group-body">
            <div
              v-for="p in pointsInScene"
              :key="p!.id"
              class="point-info selectable-geo"
              :class="{ 'is-selected': selectedPointIds.includes(p!.id) }"
              @click="selectPointFromContent(p!.id)"
            >
              <div class="point-summary-line">
                <span class="point-summary-text">
                  点{{ p!.name ?? '' }}（{{ p!.position.x.toFixed(2) }},
                  {{ p!.position.y.toFixed(2) }}, {{ p!.position.z.toFixed(2) }}）
                </span>
                <span
                  v-if="isPointCoordinateLocked(p!) && !hasCircleConstraint(p!)"
                  class="lock-badge"
                  >🔒</span
                >
                <span v-if="hasPointIntersectionConstraint(p!)" class="constraint-badge"
                  >交点约束</span
                >
                <span v-if="hasCubeConstraint(p!)" class="constraint-badge">{{
                  getSolidConstraintBadge(p!.cubeId)
                }}</span>
                <span
                  v-if="hasRegularPolygonConstraint(p!) && p!.regularPolygonRole === 'dependent'"
                  class="constraint-badge"
                  >正多边形约束</span
                >
                <span
                  v-if="hasPrismConstraint(p!) && p!.prismRole === 'dependent'"
                  class="constraint-badge"
                  >棱柱约束</span
                >
                <span
                  v-if="hasPyramidConstraint(p!) && p!.pyramidRole === 'dependent'"
                  class="constraint-badge"
                  >棱锥约束</span
                >
                <span v-if="hasCircleConstraint(p!)" class="constraint-badge">圆心约束</span>
                <span v-if="getPointConstraintBadge(p!)" class="constraint-badge">{{
                  getPointConstraintBadge(p!)
                }}</span>
                <span v-if="p!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
            </div>
          </div>
        </div>
        <div v-if="linesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.line"
            @click="toggleContentGroup('line')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.line ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.line }}</span>
            <span v-if="hasHiddenConstrainedLines" class="hidden-hint-wrapper">
              <button
                type="button"
                class="hidden-hint-trigger"
                :class="{ active: hiddenLineHintPinned }"
                :ref="(el: any) => (hiddenLineHintTriggerRef = el)"
                @pointerenter="
                  (e: PointerEvent) => {
                    if (e.pointerType !== 'touch') showHiddenLineHint = true
                  }
                "
                @pointerleave="
                  (e: PointerEvent) => {
                    if (e.pointerType !== 'touch' && !hiddenLineHintPinned)
                      showHiddenLineHint = false
                  }
                "
                @click.stop="
                  hiddenLineHintPinned = !hiddenLineHintPinned;
                  showHiddenLineHint = hiddenLineHintPinned
                "
              >
                ?
              </button>
            </span>
            <span class="content-group-count">{{ linesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.line" class="content-group-body">
            <div
              v-for="l in linesInScene"
              :key="l!.id"
              class="line-info selectable-geo"
              :class="{ 'is-selected': selectedLineIds.includes(l!.id) }"
              @click="selectLineFromContent(l!.id)"
            >
              <div class="card-summary-header">
                线段{{ l!.name ?? '' }}
                <span v-if="props.editor.isLineLocked(l!)" class="lock-badge">🔒</span>
                <span v-if="l!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
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
        <div v-if="straightLinesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.straightLine"
            @click="toggleContentGroup('straightLine')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.straightLine ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.straightLine }}</span>
            <span class="content-group-count">{{ straightLinesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.straightLine" class="content-group-body">
            <div
              v-for="sl in straightLinesInScene"
              :key="sl!.id"
              class="straight-line-info selectable-geo"
              :class="{ 'is-selected': selectedStraightLineIds.includes(sl!.id) }"
              @click="selectStraightLineFromContent(sl!.id)"
            >
              <div class="card-summary-header">
                直线{{ sl!.name ?? '' }}
                <span v-if="props.editor.isStraightLineLocked(sl!)" class="lock-badge">🔒</span>
                <span v-if="sl!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div>
                点{{ sl!.p1.name ?? '' }}（{{ sl!.p1.position.x.toFixed(2) }},
                {{ sl!.p1.position.y.toFixed(2) }}, {{ sl!.p1.position.z.toFixed(2) }}）
              </div>
              <div>
                点{{ sl!.p2.name ?? '' }}（{{ sl!.p2.position.x.toFixed(2) }},
                {{ sl!.p2.position.y.toFixed(2) }}, {{ sl!.p2.position.z.toFixed(2) }}）
              </div>
            </div>
          </div>
        </div>
        <div v-if="perpendicularLinesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.perpendicularLine"
            @click="toggleContentGroup('perpendicularLine')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.perpendicularLine ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.perpendicularLine }}</span>
            <span class="content-group-count">{{ perpendicularLinesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.perpendicularLine" class="content-group-body">
            <div
              v-for="pl in perpendicularLinesInScene"
              :key="pl!.id"
              class="perpendicular-line-info selectable-geo"
              :class="{ 'is-selected': selectedPerpendicularLineIds.includes(pl!.id) }"
              @click="selectPerpendicularLineFromContent(pl!.id)"
            >
              <div class="card-summary-header">
                垂线{{ pl!.name ?? '' }}
                <span v-if="pl!.userLocked" class="lock-badge">🔒</span>
                <span v-if="pl!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div>显示长度：{{ pl!.displayLength.toFixed(2) }}</div>
              <div>来源：{{ getPerpendicularLineSourceLabel(pl!) }}</div>
            </div>
          </div>
        </div>
        <div v-if="parallelLinesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.parallelLine"
            @click="toggleContentGroup('parallelLine')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.parallelLine ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.parallelLine }}</span>
            <span class="content-group-count">{{ parallelLinesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.parallelLine" class="content-group-body">
            <div
              v-for="pl in parallelLinesInScene"
              :key="pl!.id"
              class="parallel-line-info selectable-geo"
              :class="{ 'is-selected': selectedParallelLineIds.includes(pl!.id) }"
              @click="selectParallelLineFromContent(pl!.id)"
            >
              <div>
                平行线{{ pl!.name ?? '' }}
                <span v-if="pl!.userLocked" class="lock-badge">🔒</span>
                <span v-if="pl!.visible === false" class="hidden-badge" title="对象隐藏">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </span>
              </div>
              <div>来源：{{ getParallelLineSourceLabel(pl!) }}</div>
            </div>
          </div>
        </div>
        <div v-if="raysInScene.length > 0" class="content-group">
          <button
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
          <div v-show="!collapsedContentGroups.ray" class="content-group-body">
            <div
              v-for="r in raysInScene"
              :key="r!.id"
              class="ray-info selectable-geo"
              :class="{ 'is-selected': selectedRayIds.includes(r!.id) }"
              @click="selectRayFromContent(r!.id)"
            >
              <div class="card-summary-header">
                射线{{ r!.name ?? '' }}
                <span v-if="props.editor.isRayLocked(r!)" class="lock-badge">🔒</span>
                <span v-if="r!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
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
        <div v-if="vectorsInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.vector"
            @click="toggleContentGroup('vector')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.vector ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.vector }}</span>
            <span class="content-group-count">{{ vectorsInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.vector" class="content-group-body">
            <div
              v-for="vec in vectorsInScene"
              :key="vec!.id"
              class="vector-info selectable-geo"
              :class="{ 'is-selected': selectedVectorIds.includes(vec!.id) }"
              @click="selectVectorFromContent(vec!.id)"
            >
              <div class="card-summary-header">
                向量{{ vec!.name ?? '' }}
                <span v-if="props.editor.isVectorLocked(vec!)" class="lock-badge">🔒</span>
                <span v-if="vec!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div>
                起点{{ vec!.p1.name ?? '' }}（{{ vec!.p1.position.x.toFixed(2) }},
                {{ vec!.p1.position.y.toFixed(2) }}, {{ vec!.p1.position.z.toFixed(2) }}）
              </div>
              <div>
                终点{{ vec!.p2.name ?? '' }}（{{ vec!.p2.position.x.toFixed(2) }},
                {{ vec!.p2.position.y.toFixed(2) }}, {{ vec!.p2.position.z.toFixed(2) }}）
              </div>
            </div>
          </div>
        </div>
        <div v-if="circlesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.circle"
            @click="toggleContentGroup('circle')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.circle ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.circle }}</span>
            <span class="content-group-count">{{ circlesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.circle" class="content-group-body">
            <div
              v-for="c in circlesInScene"
              :key="c!.id"
              class="circle-info selectable-geo"
              :class="{ 'is-selected': selectedCircleIds.includes(c!.id) }"
              @click="selectCircleFromContent(c!.id)"
            >
              <div>
                {{ c!.isNormalCircle() ? '法向圆' : '三点圆' }}{{ c!.name ?? '' }}
                <span v-if="props.editor.isCircleLocked(c!)" class="lock-badge">🔒</span>
                <span v-if="getConeForNormalCircle(c!)" class="constraint-badge">圆锥约束</span>
                <span v-if="getCylinderForNormalCircle(c!)" class="constraint-badge">圆柱约束</span>
                <span v-if="c!.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <template v-if="c!.isNormalCircle()">
                <div>半径：{{ getNormalCircleRadius(c!).toFixed(2) }}</div>
                <div>
                  圆心：{{ c!.p1.name ?? '' }}（{{ c!.p1.position.x.toFixed(2) }},
                  {{ c!.p1.position.y.toFixed(2) }}, {{ c!.p1.position.z.toFixed(2) }}）
                </div>
                <div>法向量：{{ getDirectionLabel(c!) }}</div>
              </template>
              <template v-else>
                <div>半径：{{ c!.getRadius().toFixed(2) }}</div>
                <div>
                  构造点：{{ c!.p1.name ?? '' }}-{{ c!.p2.name ?? '' }}-{{ c!.p3.name ?? '' }}
                </div>
                <div v-if="getCircleCenterPoint(c!.id)">
                  <span class="point-summary-text">
                    圆心：{{ getCircleCenterPoint(c!.id)!.name }}
                  </span>
                  <span class="constraint-badge">圆心约束</span>
                </div>
              </template>
            </div>
          </div>
        </div>
        <div v-if="hexahedronsInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.hexahedron"
            @click="toggleContentGroup('hexahedron')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.hexahedron ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.hexahedron }}</span>
            <span class="content-group-count">{{ hexahedronsInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.hexahedron" class="content-group-body">
            <div
              v-for="cube in hexahedronsInScene"
              :key="cube.cubeId"
              class="face-info selectable-geo"
              :class="{ 'is-selected': selectedHexahedronIds.includes(cube.cubeId) }"
              @click="selectHexahedronFromContent(cube.cubeId)"
            >
              <div class="card-summary-header">
                {{ cube.name }}
                <span
                  v-if="cube.faceIds.every((faceId) => props.scene.faces.get(faceId)?.userLocked)"
                  class="lock-badge"
                  >🔒</span
                >
                <span v-if="cube.faceIds.some((faceId) => props.scene.faces.get(faceId)?.visible === false)" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div>边长：{{ getHexahedronEdgeLength(cube.cubeId).toFixed(2) }}</div>
              <div>
                原始点：{{
                  getHexahedronOwnerPoints(cube.cubeId)
                    .map((point) => point.name)
                    .join(' - ')
                }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="prismsInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.prism"
            @click="toggleContentGroup('prism')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.prism ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.prism }}</span>
            <span class="content-group-count">{{ prismsInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.prism" class="content-group-body">
            <div
              v-for="prism in prismsInScene"
              :key="prism.prismId"
              class="face-info prism-info selectable-geo"
              :class="{ 'is-selected': selectedPrismIds.includes(prism.prismId) }"
              @click="selectPrismFromContent(prism.prismId)"
              @dblclick="startEditPrism(prism.prismId)"
            >
              <div class="card-summary-header">
                {{ prism.name }}
                <span
                  v-if="props.editor.getPrismFaceIds(prism.prismId).every((faceId) => props.scene.faces.get(faceId)?.userLocked)"
                  class="lock-badge"
                  >🔒</span
                >
                <span v-if="props.editor.getPrismFaceIds(prism.prismId).some((faceId) => props.scene.faces.get(faceId)?.visible === false)" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
                <button
                  class="card-delete-btn"
                  title="删除"
                  @click.stop="handleDeleteElement('face', prism.bottomFaceId, prism.name)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
              <div>体积：{{ getPrismVolume(prism.prismId).toFixed(2) }}</div>
              <div>
                来源：{{ getPrismSourceLabel(prism.prismId) }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="pyramidsInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.pyramid"
            @click="toggleContentGroup('pyramid')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.pyramid ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.pyramid }}</span>
            <span class="content-group-count">{{ pyramidsInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.pyramid" class="content-group-body">
            <div
              v-for="pyramid in pyramidsInScene"
              :key="pyramid.pyramidId"
              class="face-info pyramid-info selectable-geo"
              :class="{ 'is-selected': selectedPyramidIds.includes(pyramid.pyramidId) }"
              @click="selectPyramidFromContent(pyramid.pyramidId)"
              @dblclick="startEditPyramid(pyramid.pyramidId)"
            >
              <div class="card-summary-header">
                {{ pyramid.name }}
                <span
                  v-if="props.editor.getPyramidFaceIds(pyramid.pyramidId).every((faceId) => props.scene.faces.get(faceId)?.userLocked)"
                  class="lock-badge"
                  >🔒</span
                >
                <span v-if="props.editor.getPyramidFaceIds(pyramid.pyramidId).some((faceId) => props.scene.faces.get(faceId)?.visible === false)" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
                <button
                  class="card-delete-btn"
                  title="删除"
                  @click.stop="handleDeleteElement('face', pyramid.bottomFaceId, pyramid.name)"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
              <div>体积：{{ getPyramidVolume(pyramid.pyramidId).toFixed(2) }}</div>
              <div>
                来源：{{ getPyramidSourceLabel(pyramid.pyramidId) }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="spheresInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.sphere"
            @click="toggleContentGroup('sphere')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.sphere ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.sphere }}</span>
            <span class="content-group-count">{{ spheresInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.sphere" class="content-group-body">
            <div
              v-for="sphere in spheresInScene"
              :key="sphere.id"
              class="face-info selectable-geo"
              :class="{ 'is-selected': selectedSphereIds.includes(sphere.id) }"
              @click="selectSphereFromContent(sphere.id)"
            >
              <div class="card-summary-header">
                {{ sphere.name ?? '' }}
                <span v-if="props.editor.isSphereGeometryLocked(sphere)" class="lock-badge"
                  >🔒</span
                >
                <span v-if="sphere.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div>半径：{{ props.editor.getSphereRadius(sphere.id).toFixed(2) }}</div>
              <div>
                球心点：{{ props.editor.getSphereCenterPoint(sphere.id)?.name ?? ''
                }}<template v-if="props.editor.getSphereRadiusPoint(sphere.id)"
                  >　半径点：{{ props.editor.getSphereRadiusPoint(sphere.id)!.name }}</template
                >
              </div>
            </div>
          </div>
        </div>
        <div v-if="conesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.cone"
            @click="toggleContentGroup('cone')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.cone ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.cone }}</span>
            <span class="content-group-count">{{ conesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.cone" class="content-group-body">
            <div
              v-for="cone in conesInScene"
              :key="cone.id"
              class="cone-info selectable-geo"
              :class="{ 'is-selected': selectedConeIds.includes(cone.id) }"
              @click="selectConeFromContent(cone.id)"
            >
              <div>
                {{ cone.name ?? '' }}
                <span v-if="props.editor.isConeGeometryLocked(cone)" class="lock-badge">🔒</span>
                <span v-if="cone.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div class="face-metric-row">
                <span class="metric-item"
                  >半径：{{ props.editor.getConeRadius(cone.id).toFixed(2) }}</span
                >
                <span class="metric-sep">/</span>
                <span class="metric-item"
                  >高度：{{ props.editor.getConeHeight(cone.id).toFixed(2) }}</span
                >
              </div>
              <div>
                来源：点{{ props.editor.getConeBaseCenterPoint(cone.id)?.name ?? '' }}-点{{
                  props.editor.getConeApexPoint(cone.id)?.name ?? ''
                }}<template v-if="cone.isNormalCircleCone() && cone.normalCircleId"
                  >（法向圆{{ props.scene.circles.get(cone.normalCircleId)?.name ?? '' }}-点{{
                    props.editor.getConeApexPoint(cone.id)?.name ?? ''
                  }}）</template
                >
              </div>
            </div>
          </div>
        </div>
        <div v-if="cylindersInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.cylinder"
            @click="toggleContentGroup('cylinder')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.cylinder ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.cylinder }}</span>
            <span class="content-group-count">{{ cylindersInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.cylinder" class="content-group-body">
            <div
              v-for="cylinder in cylindersInScene"
              :key="cylinder.id"
              class="cylinder-info selectable-geo"
              :class="{ 'is-selected': selectedCylinderIds.includes(cylinder.id) }"
              @click="selectCylinderFromContent(cylinder.id)"
            >
              <div class="card-summary-header">
                {{ cylinder.name ?? '' }}
                <span v-if="props.editor.isCylinderGeometryLocked(cylinder)" class="lock-badge"
                  >🔒</span
                >
                <span v-if="cylinder.visible === false" class="hidden-badge" title="对象隐藏"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              </div>
              <div class="face-metric-row">
                <span class="metric-item"
                  >半径：{{ props.editor.getCylinderRadius(cylinder.id).toFixed(2) }}</span
                >
                <span class="metric-sep">/</span>
                <span class="metric-item"
                  >高度：{{ props.editor.getCylinderHeight(cylinder.id).toFixed(2) }}</span
                >
              </div>
              <div>
                来源：点{{
                  props.editor.getCylinderBottomCenterPoint(cylinder.id)?.name ?? ''
                }}-点{{ props.editor.getCylinderTopCenterPoint(cylinder.id)?.name ?? '' }}
              </div>
            </div>
          </div>
        </div>
        <div v-if="facesInScene.length > 0" class="content-group">
          <button
            type="button"
            class="content-group-header content-group-toggle"
            :aria-expanded="!collapsedContentGroups.face"
            @click="toggleContentGroup('face')"
          >
            <span class="content-group-toggle-icon">
              {{ collapsedContentGroups.face ? '▸' : '▾' }}
            </span>
            <span class="content-group-label">{{ contentGroupLabels.face }}</span>
            <span class="content-group-count">{{ facesInScene.length }}</span>
          </button>
          <div v-show="!collapsedContentGroups.face" class="content-group-body">
            <div
              v-for="face in facesInScene"
              :key="face!.id"
              class="face-info selectable-geo"
              :class="{ 'is-selected': selectedFaceIds.includes(face!.id) }"
              @click="selectFaceFromContent(face!.id)"
            >
              <div class="card-summary-header">
                {{ face!.isRegularPolygon ? '正多边形' : '多边形' }}{{ face!.name ?? '' }}
                <span v-if="face!.isRegularPolygon" class="constraint-badge"
                  >正{{ face!.regularPolygonVertexCount }}边形</span
                >
                <span v-if="props.editor.isFaceLocked(face!)" class="lock-badge">🔒</span>
                <span v-if="isCubeFace(face!)" class="constraint-badge">{{
                  getSolidConstraintBadge(face!.cubeId)
                }}</span>
                <span v-if="isPrismFace(face!)" class="constraint-badge">棱柱约束</span>
                <span v-if="isPyramidFace(face!)" class="constraint-badge">棱锥约束</span>
                <span v-if="face!.visible === false" class="hidden-badge" title="对象隐藏">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                </span>
              </div>
              <div>
                边界点：{{
                  getFaceBoundaryPoints(face!)
                    .map((p) => p.name)
                    .join(' - ')
                }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="showHiddenPointHint"
      ref="hiddenPointHintPopoverRef"
      class="hidden-hint-popover"
      :style="hiddenPointHintStyle"
      @mousedown.stop
      @touchstart.stop
    >
      已隐藏由复杂几何对象约束生成的点（圆心点、交点等除外），但是你仍然可以在选中区查看
    </div>
    <div
      v-if="showHiddenLineHint"
      ref="hiddenLineHintPopoverRef"
      class="hidden-hint-popover"
      :style="hiddenLineHintStyle"
      @mousedown.stop
      @touchstart.stop
    >
      已隐藏由复杂几何对象约束生成的线段，但是你仍然可以在选中区查看
    </div>
  </Teleport>

  <Teleport to="body">
    <Transition name="confirm-fade">
      <div
        v-if="showDeleteConfirmDialog"
        class="delete-confirm-overlay"
        @click="cancelDeleteElement"
      >
        <div class="delete-confirm-dialog" @click.stop>
          <div class="delete-confirm-header">
            <h4 class="delete-confirm-title">确认删除</h4>
          </div>
          <div class="delete-confirm-body">
            <p class="delete-confirm-message">确定要删除「{{ deleteConfirmTarget?.name }}」吗？</p>
          </div>
          <div class="delete-confirm-footer">
            <button
              class="delete-confirm-btn delete-confirm-btn-cancel"
              @click="cancelDeleteElement"
            >
              取消
            </button>
            <button
              class="delete-confirm-btn delete-confirm-btn-danger"
              @click="confirmDeleteElement"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <Teleport to="body">
    <TransitionGroup name="bubble-fade">
      <div
        v-for="(bubble, bKey) in visibleBubbles"
        :key="bKey"
        class="length-bubble-fixed"
        :class="{ 'below-anchor': bubble.below }"
        :style="{
          left: bubble.x + 'px',
          top: bubble.y + 'px',
          transform: bubble.transform,
        }"
      >
        {{ bubble.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.sidebar {
  width: 100%;
  min-width: 0;
  max-width: none;
  background: #1a1a1a;
  color: #ddd;
  padding: 12px;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow-y: hidden;
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
.selectedStraightLine-info,
.selectedPerpendicularLine-info,
.selectedParallelLine-info,
.selectedRay-info,
.selectedVector-info,
.selectedCircle-info,
.selectedCone-info,
.selectedCylinder-info,
.selectedFace-info,
.line-info,
.straight-line-info,
.perpendicular-line-info,
.parallel-line-info,
.ray-info,
.vector-info,
.circle-info,
.cone-info,
.cylinder-info,
.face-info {
  background-color: rgba(44, 90, 52, 0.4); /* 使用半透明绿色 */
  border-left: 3px solid #43f260; /* 增加一个亮色左边框提升质感 */
  margin-bottom: 6px;
  padding: 8px;
  font-size: 13px;
}
.selectedLine-info,
.line-info {
  background-color: rgba(124, 122, 34, 0.24);
  border-left-color: #d7d05a;
}
.selectedStraightLine-info,
.straight-line-info {
  background-color: rgba(176, 118, 66, 0.22);
  border-left-color: #ff9460;
}
.selectedPerpendicularLine-info,
.perpendicular-line-info {
  background-color: rgba(0, 180, 150, 0.18);
  border-left-color: rgb(0, 180, 150);
}
.selectedParallelLine-info,
.parallel-line-info {
  background-color: rgba(139, 124, 246, 0.18);
  border-left-color: #8b7cf6;
}
.selectedRay-info,
.ray-info {
  background-color: rgba(80, 136, 194, 0.28);
  border-left-color: #7fc8ff;
}
.selectedVector-info,
.vector-info {
  background-color: rgba(0, 170, 160, 0.22);
  border-left-color: #00d4c8;
}
.selectedCircle-info,
.circle-info {
  background-color: rgba(180, 100, 200, 0.22);
  border-left-color: #d08fff;
}
.selectedFace-info,
.face-info {
  background-color: rgba(122, 108, 207, 0.2);
  border-left-color: #d9d0ff;
}
.prism-info {
  background-color: rgba(255, 140, 66, 0.2);
  border-left-color: #ff8c42;
}
.pyramid-info {
  background-color: rgba(236, 72, 153, 0.18);
  border-left-color: #ec4899;
}
.selectedCone-info,
.cone-info {
  background-color: rgba(200, 120, 30, 0.22);
  border-left-color: #f0a030;
}
.selectedCylinder-info,
.cylinder-info {
  background-color: rgba(232, 96, 122, 0.22);
  border-left-color: #e8607a;
}
.selectable-geo {
  cursor: pointer;
}
.selectable-geo.is-selected {
  background-color: rgba(67, 242, 96, 0.18);
  border-left-color: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(67, 242, 96, 0.35);
}
.section-divider {
  width: 100%;
  height: 1px;
  background: #444;
  margin-top: 5px;
  margin-bottom: 5px;
  flex-shrink: 0;
}
.split-pane {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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
.content-heading {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.toggle-all-groups-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: #9fd8ff;
  cursor: pointer;
  font-size: inherit;
  line-height: 1;
  border-radius: 3px;
  transition: background-color 0.15s ease;
}
.toggle-all-groups-btn:hover {
  background-color: rgba(159, 216, 255, 0.12);
}
.toggle-all-icon {
  display: block;
  transition: transform 0.25s ease;
}
.toggle-all-icon.is-collapsed {
  transform: rotate(-90deg);
}
.content-box {
  flex: 1 1 auto;
  min-height: 140px;
}
.panel-resizer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 12px;
  flex-shrink: 0;
  cursor: row-resize;
  touch-action: none;
}
.panel-resizer::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: #444;
  transform: translateY(-50%);
}
.panel-resizer-handle {
  position: relative;
  z-index: 1;
  width: 42px;
  height: 4px;
  border-radius: 999px;
  background: #6f6f6f;
  box-shadow: 0 0 0 2px #1a1a1a;
}
.panel-resizer:hover .panel-resizer-handle,
.panel-resizer.is-dragging .panel-resizer-handle {
  background: #9fd8ff;
}
.panel-resizer.is-dragging::before {
  background: #9fd8ff;
}
.panel-resizer.is-disabled {
  cursor: default;
}
.panel-resizer.is-disabled .panel-resizer-handle {
  background: #5a5a5a;
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
.hidden-hint-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  flex-shrink: 0;
}
.hidden-hint-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  cursor: help;
  user-select: none;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease;
}
.hidden-hint-trigger:hover {
  border-color: rgba(255, 255, 255, 0.9);
  color: #fff;
}
.hidden-hint-trigger:active {
  transform: scale(0.85);
}
.hidden-hint-trigger.active {
  border-color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.content-group-body {
  display: flex;
  flex-direction: column;
  padding-top: 6px;
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
.readonly-value-row {
  font-size: 12px;
  color: #ffffff;
  padding: 2px 0;
  grid-column: 1 / -1;
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
  appearance: textfield;
  -moz-appearance: textfield;
}
.edit-grid input[type='number']::-webkit-outer-spin-button,
.edit-grid input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.coord-input {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
  position: relative;
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
.step-btn:first-of-type {
  border-radius: 4px 0 0 4px;
  border-right: none;
}
.step-btn:last-of-type {
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
.constrained-param-row {
  background: rgba(100, 200, 255, 0.06);
  border-radius: 4px;
  padding: 4px;
}
.constrained-param-wrap {
  grid-column: 1 / -1;
}
.face-uv-title {
  font-size: 12px;
  color: #b8d4ff;
  margin-bottom: 4px;
  padding-left: 2px;
}
.coord-row-title {
  font-size: 12px;
  color: #e6ffe9;
  grid-column: 1 / -1;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  grid-column: 1 / -1;
  flex-wrap: wrap;
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
  grid-column: 1 / -1;
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
  white-space: nowrap;
}
.line-editor-grid {
  display: grid;
  grid-template-columns: 14px max-content max-content;
  gap: 6px 8px;
  align-items: center;
  justify-content: start;
  justify-items: start;
  grid-column: 1 / -1;
  width: fit-content;
  max-width: 100%;
}
.line-editor-head {
  font-size: 12px;
  color: #e6ffe9;
  white-space: nowrap;
  justify-self: start;
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
  font-size: 10px;
  padding: 0 2px;
  border-radius: 3px;
  margin-left: 2px;
  flex-shrink: 0;
}
.constraint-badge {
  display: inline-block;
  margin-left: 2px;
  padding: 0 4px;
  border-radius: 999px;
  font-size: 9px;
  line-height: 1.4;
  white-space: nowrap;
  color: #ffe2b7;
  background: rgba(255, 179, 71, 0.18);
  border: 1px solid rgba(255, 179, 71, 0.42);
  vertical-align: middle;
  flex-shrink: 0;
}
.hidden-badge {
  display: inline-flex;
  align-items: center;
  margin-left: 2px;
  padding: 0 2px;
  border-radius: 3px;
  font-size: 11px;
  line-height: 1;
  color: #999;
  opacity: 0.7;
  vertical-align: middle;
  flex-shrink: 0;
}
.point-summary-line {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}
.point-summary-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.face-metric-row {
  grid-column: 1 / -1;
  margin-top: 4px;
  color: #f3f3f3;
}
.metric-item {
  display: inline-block;
  white-space: nowrap;
}
.metric-sep {
  display: inline-block;
  white-space: nowrap;
  margin: 0 6px;
  color: #888;
}
.pi-mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  font-size: 11px;
  color: #8fdc9b;
  cursor: pointer;
  user-select: none;
}
.pi-mode-toggle input {
  margin: 0;
  cursor: pointer;
}
.normal-circle-direction-row {
  color: #ddd;
  font-size: 12px;
  margin-top: 4px;
}
.normal-circle-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}
.normal-circle-label {
  color: #8fdc9b;
  font-size: 11px;
  min-width: 28px;
  flex-shrink: 0;
}
.normal-circle-value {
  color: #ddd;
  font-size: 12px;
}
.normal-circle-center-grid {
  grid-column: 1 / -1;
  grid-template-columns: 14px max-content !important;
}
.face-edge-grid {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  align-items: start;
}
.face-edge-row { min-width: 0; flex: 0 1 auto; }
.face-edge-row.axis-field {
  grid-template-columns: 14px 1fr;
  gap: 4px;
}
.face-edge-row label {
  color: #d9d0ff !important;
  font-size: 11px;
  white-space: nowrap;
}
.face-edge-row .coord-input {
  display: inline-flex;
  align-items: stretch;
  min-width: 0;
  position: relative;
}
.face-edge-row .coord-input input[type='number'] {
  width: 54px;
  text-align: center;
  border-radius: 0;
  min-width: 0;
}
.face-edge-row .step-btn {
  min-width: 24px;
  padding: 0 4px;
  font-size: 13px;
}
@media (max-width: 1024px) and (orientation: landscape) {
  .sidebar {
    padding: 8px;
    padding-top: 4px;
    font-size: 12px;
  }

  .sidebar > p {
    margin-top: 0;
    margin-bottom: 2px;
    font-size: 14px;
  }

  .selectedPoint-info,
  .selectedLine-info,
  .selectedFace-info,
  .selectedRay-info,
  .selectedVector-info,
  .selectedCircle-info,
  .selectedCone-info,
  .selectedCylinder-info,
  .point-info,
  .line-info,
  .face-info,
  .ray-info,
  .vector-info,
  .circle-info,
  .cone-info,
  .pyramid-info,
  .cylinder-info {
    padding: 6px;
    font-size: 12px;
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
    grid-template-columns: 14px max-content max-content;
    gap: 4px 6px;
  }

  .face-edge-grid {
    grid-template-columns: 1fr;
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

.line-editor-grid--single-col {
  grid-template-columns: 14px minmax(0, 1fr);
}

.line-editor-grid--compact.line-editor-grid--single-col {
  grid-template-columns: 12px minmax(0, 1fr);
}

.line-editor-grid--single-col > .coord-input {
  width: 100%;
}

.line-editor-grid--compact.line-editor-grid--single-col > .coord-input {
  margin-left: 0;
  margin-right: 0;
}

.line-editor-grid--compact > .coord-input input[type='number'] {
  width: 100%;
  min-width: 0;
  padding-left: 2px;
  padding-right: 2px;
  font-size: 11px;
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

.circle-editor-grid {
  grid-template-columns: 10px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 3px 4px;
  justify-items: stretch;
  max-width: 320px;
}

.circle-editor-grid.line-editor-grid--compact {
  grid-template-columns: 10px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
  gap: 3px 4px;
  justify-items: stretch;
  max-width: 320px;
}

.circle-editor-grid.line-editor-grid--compact > .line-editor-head:nth-child(n + 2) {
  padding-right: 0;
  padding-left: 0;
  text-align: center;
}

.circle-editor-grid.line-editor-grid--compact > .coord-input {
  margin: 0;
  grid-template-columns: 18px minmax(0, 1fr) 18px;
  width: 100%;
  min-width: 0;
}

.circle-editor-grid.line-editor-grid--compact > .coord-input .step-btn {
  min-width: 18px;
  min-height: 22px;
  font-size: 11px;
  padding: 0;
}

.circle-editor-grid.line-editor-grid--compact > .coord-input input[type='number'] {
  font-size: 10px;
  padding-left: 1px;
  padding-right: 1px;
  width: 100%;
  min-width: 0;
}

.circle-editor-grid.line-editor-grid--compact .line-axis-label {
  font-size: 9px;
  text-align: left;
}

.circle-editor-grid > .coord-input:nth-child(4n + 2) {
  margin-right: 0;
}

.circle-editor-grid > .coord-input:nth-child(4n) {
  margin-left: 0;
}

@media (hover: none) and (pointer: coarse) {
  .sidebar {
    padding-top: 4px;
  }

  .sidebar > p {
    margin-top: 0;
    margin-bottom: 2px;
  }

  .section-divider {
    margin-top: 2px;
    margin-bottom: 2px;
  }

  .hint {
    font-size: 10px;
    margin-top: -2px;
    margin-bottom: 2px;
  }

  .selectedPoint-info,
  .selectedLine-info,
  .selectedRay-info,
  .selectedCircle-info,
  .selectedCone-info,
  .selectedCylinder-info,
  .point-info,
  .line-info,
  .ray-info,
  .circle-info,
  .cone-info,
  .pyramid-info,
  .cylinder-info {
    padding: 4px;
    font-size: 10px;
  }
}

.length-bubble-fixed {
  position: fixed;
  background: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  color: #333333;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 99999;
  pointer-events: none;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
  width: max-content;
  max-width: 300px;
}

.length-bubble-fixed::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -4px;
  transform: translateX(-50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: #ffffff;
}

.length-bubble-fixed.below-anchor::after {
  top: -4px;
  bottom: auto;
}

.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 0.3s ease;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
}

@media (max-width: 820px) and (orientation: landscape) {
  .sidebar {
    display: block;
    padding: 6px;
    padding-top: 2px;
    font-size: 11px;
    overflow-y: auto;
  }

  .sidebar > p {
    margin-top: 0;
    margin-bottom: 2px;
    font-size: 13px;
  }

  .section-divider {
    margin-top: 2px;
    margin-bottom: 2px;
  }

  .sidebar > p,
  h3,
  .section-divider,
  .hint {
    margin-bottom: 4px;
  }

  .hint {
    font-size: 9px;
  }

  .selectedPoint-info,
  .selectedLine-info,
  .selectedFace-info,
  .selectedRay-info,
  .selectedVector-info,
  .selectedCircle-info,
  .selectedCone-info,
  .selectedCylinder-info,
  .point-info,
  .line-info,
  .face-info,
  .ray-info,
  .vector-info,
  .circle-info,
  .cone-info,
  .pyramid-info,
  .cylinder-info {
    margin-bottom: 4px;
    padding: 5px;
    font-size: 11px;
  }

  .split-pane {
    display: flex;
  }

  .box,
  .selected-box,
  .content-box {
    min-height: 96px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .panel-resizer {
    display: flex;
  }

  .edit-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: start;
  }

  .edit-grid input[type='text'] {
    width: 48px;
    flex: 0 0 auto;
  }

  .edit-grid input[type='number'] {
    width: 40px;
  }

  .coord-input input[type='number'] {
    width: 40px;
  }

  .step-btn {
    min-width: 28px;
    min-height: 28px;
    font-size: 14px;
    padding: 0 4px;
  }

  .compact-length-input {
    width: 92px;
  }

  .compact-length-input .step-btn {
    min-width: 22px;
    min-height: 22px;
    font-size: 12px;
  }

  .name-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .length-row {
    display: flex;
    justify-content: start;
    align-items: center;
    gap: 3px;
    flex-wrap: nowrap;
    width: fit-content;
  }

  .length-row .toggle-label {
    flex: 0 0 auto;
    min-width: 0;
    font-size: 10px;
    gap: 2px;
  }

  .toggle-label {
    white-space: nowrap;
  }

  .line-editor-grid {
    grid-template-columns: 14px max-content max-content;
  }

  .compact-axis {
    grid-column: 1 / -1;
  }

  .face-edge-grid {
    grid-template-columns: 1fr;
  }

  .face-edge-row {
    grid-template-columns: 22px minmax(0, 1fr);
    width: fit-content;
  }

  .face-edge-row .coord-input {
    width: auto;
  }

  .line-editor-grid--single-col {
    grid-template-columns: 14px max-content;
  }

  .edit-grid .line-editor-grid--single-col > .coord-input {
    width: auto !important;
  }

  .edit-grid .line-editor-grid--single-col > .coord-input input[type='number'] {
    width: 40px;
  }

  .line-editor-grid--compact.line-editor-grid--single-col {
    grid-template-columns: 12px max-content;
  }

  .edit-grid .line-editor-grid--compact > .coord-input input[type='number'] {
    width: 40px;
  }

  .edit-grid
    .line-editor-grid--compact:not(.circle-editor-grid):not(.line-editor-grid--single-col) {
    grid-template-columns: 12px max-content max-content;
  }

  .edit-grid
    .line-editor-grid--compact:not(.circle-editor-grid):not(.line-editor-grid--single-col)
    > .coord-input {
    width: auto !important;
    grid-template-columns: 22px 36px 22px;
  }

  .edit-grid
    .line-editor-grid--compact:not(.circle-editor-grid):not(.line-editor-grid--single-col)
    > .coord-input
    .step-btn {
    min-width: 22px;
    min-height: 22px;
    font-size: 12px;
    padding: 0 2px;
  }

  .edit-grid
    .line-editor-grid--compact:not(.circle-editor-grid):not(.line-editor-grid--single-col)
    > .coord-input
    input[type='number'] {
    width: 36px;
    padding-left: 2px;
    padding-right: 2px;
    font-size: 11px;
  }

  .normal-circle-center-grid {
    grid-template-columns: 14px max-content;
  }

  .edit-grid .normal-circle-center-grid > .coord-input {
    width: auto !important;
    display: inline-flex;
  }

  .edit-grid .normal-circle-center-grid > .coord-input input[type='number'] {
    width: 36px;
    padding-left: 2px;
    padding-right: 2px;
    font-size: 11px;
  }

  .edit-grid .normal-circle-center-grid > .coord-input .step-btn {
    min-width: 22px;
    min-height: 22px;
    font-size: 12px;
    padding: 0 2px;
  }

  .edit-grid .line-editor-grid--single-col > .coord-input .step-btn {
    min-width: 22px;
    min-height: 22px;
    font-size: 12px;
    padding: 0 2px;
  }

  .edit-grid .line-editor-grid--single-col > .coord-input input[type='number'] {
    width: 36px;
    padding-left: 2px;
    padding-right: 2px;
    font-size: 11px;
  }
}

.card-summary-header {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.card-delete-btn {
  margin-left: auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  padding: 2px;
  flex-shrink: 0;
  transition: all 0.15s;
}

.card-delete-btn svg {
  width: 14px;
  height: 14px;
}

.card-delete-btn:hover {
  background: rgba(255, 77, 79, 0.2);
  color: #ff4d4f;
}

.card-delete-btn:active {
  background: rgba(255, 77, 79, 0.35);
  color: #ff7875;
}

.delete-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}

.delete-confirm-dialog {
  width: 340px;
  max-width: calc(100vw - 32px);
  background: #1e1e1e;
  border: 1px solid #444;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.delete-confirm-header {
  padding: 14px 16px 0;
}

.delete-confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #f0f0f0;
}

.delete-confirm-body {
  padding: 10px 16px 14px;
}

.delete-confirm-message {
  margin: 0;
  font-size: 13px;
  color: #ccc;
  line-height: 1.5;
}

.delete-confirm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid #333;
}

.delete-confirm-btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.delete-confirm-btn-cancel {
  background: transparent;
  color: #ccc;
  border-color: #444;
}

.delete-confirm-btn-cancel:hover {
  background: #2a2a2a;
  color: #fff;
}

.delete-confirm-btn-danger {
  background: #ff4d4f;
  color: #fff;
  border-color: #ff4d4f;
  font-weight: 600;
}

.delete-confirm-btn-danger:hover {
  background: #ff7875;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.15s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-fade-enter-active .delete-confirm-dialog,
.confirm-fade-leave-active .delete-confirm-dialog {
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.confirm-fade-enter-from .delete-confirm-dialog,
.confirm-fade-leave-to .delete-confirm-dialog {
  opacity: 0;
  transform: scale(0.95);
}
</style>
<style>
.hidden-hint-popover {
  padding: 6px 8px;
  background: #2a2d35;
  border: 1px solid #555;
  border-radius: 4px;
  color: #ccc;
  font-size: 11px;
  line-height: 1.4;
  white-space: normal;
  width: max-content;
  max-width: 200px;
  z-index: 9999;
  pointer-events: auto;
}
</style>
