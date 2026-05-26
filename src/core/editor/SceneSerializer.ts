import { Point3, type ConstrainedToRef } from '../geometry/Point3'
import { Line3, type FaceConstraintType } from '../geometry/Line3'
import { Ray3 } from '../geometry/Ray3'
import { GeoVector3 } from '../geometry/GeoVector3'
import { Circle3, type CircleType, type DirectionType } from '../geometry/Circle3'
import { StraightLine3 } from '../geometry/StraightLine3'
import { PlanarPolygon } from '../geometry/PlanarPolygon'
import { Sphere3 } from '../geometry/Sphere3'
import { Cone3, type ConeType } from '../geometry/Cone3'
import { Cylinder3, type CylinderType } from '../geometry/Cylinder3'
import { CylinderConstraint } from '../constraints/CylinderConstraint'
import { ObjectConstrainedPointConstraint, type ParametricData } from '../constraints/ObjectConstrainedPointConstraint'
import { Vec3 } from '../geometry/Vec3'
import { Scene, type SceneConstraint } from '../scene/Scene'
import { CubeConstraint } from '../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../constraints/IntersectionPointConstraint'
import { RegularPolygonConstraint } from '../constraints/RegularPolygonConstraint'
import { PlanarPolygonConstraint } from '../constraints/PlanarFaceConstraint'
import type { IntersectionTargetRef } from '../geometry/IntersectionPoint3'

type SerializedVec3 = { x: number; y: number; z: number }

type SerializedPoint = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  position: SerializedVec3
  locked: boolean
  userLocked: boolean
  cubeId: string | null
  cubeRole: 'owner' | 'dependent' | null
  circleId: string | null
  circleRole: 'center' | null
  regularPolygonId: string | null
  regularPolygonRole: 'owner' | 'dependent' | null
  sphereId: string | null
  sphereRole: 'center' | 'radius' | null
  coneId: string | null
  coneRole: 'baseCenter' | 'apex' | null
  cylinderId: string | null
  cylinderRole: 'bottomCenter' | 'topCenter' | null
  constrainedTo: { type: string; id: string } | null
}

type SerializedLine = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  lengthLocked: boolean
  lockedLength: number
  faceOwned: boolean
  faceConstraintType: FaceConstraintType | null
  p1Id: string
  p2Id: string
}

type SerializedStraightLine = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Id: string
  displayLength: number
}

type SerializedRay = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Id: string
  displayLength: number
}

type SerializedVector = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  p1Id: string
  p2Id: string
}

type SerializedCircle = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerVisible: boolean
  p1Id: string
  p2Id: string
  p3Id: string
  circleType: CircleType
  directionType: DirectionType | null
  directionId: string | null
  lockedRadius: number | null
}

type SerializedFace = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  fillColor: number | null
  fillOpacity: number | null
  cubeId: string | null
  cubeOwnerPointIds: string[]
  cubeDependentPointIds: string[]
  userLocked: boolean
  areaLocked: boolean
  lockedArea: number
  edgeLengthLocks: Array<number | null>
  boundaryPointIds: string[]
  memberPointIds: string[]
  boundaryLineIds: string[]
  supportPointIds: string[]
  isRegularPolygon: boolean
  regularPolygonVertexCount: number
  regularPolygonId: string | null
  regularPolygonOwnerPointIds: string[]
  regularPolygonDependentPointIds: string[]
}

type SerializedSphere = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  centerPointId: string
  radiusPointId: string | null
  radiusValue: number
}

type SerializedCone = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  baseCenterPointId: string
  apexPointId: string
  radiusValue: number
  coneType: ConeType
  normalCircleId: string | null
}

type SerializedCylinder = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
  visible: boolean
  userLocked: boolean
  bottomCenterPointId: string
  topCenterPointId: string
  radiusValue: number
  cylinderType: CylinderType
  normalCircleId: string | null
  topNormalCircleId: string | null
}

type SerializedCubeConstraint = {
  type: 'cube'
  cubeId: string
  solidType: 'hexahedron' | 'tetrahedron'
  ownerPointIds: [string, string]
  dependentLayouts: Array<{ pointId: string; x: number; y: number; z: number }>
  faceIds: string[]
  sourceLineId: string | null
  vAxisHint: SerializedVec3
  name: string
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
  valueVisible: boolean
}

type SerializedIntersectionConstraint = {
  type: 'intersection'
  pointId: string
  sourceA: IntersectionTargetRef
  sourceB: IntersectionTargetRef
}

type SerializedRegularPolygonConstraint = {
  type: 'regularPolygon'
  constraintId: string
  ownerPointIds: [string, string]
  dependentLayouts: Array<{ pointId: string; angleIndex: number }>
  faceId: string
  vertexCount: number
  vAxisHint: SerializedVec3
  name: string
  edgeLengthLocked: boolean
  lockedEdgeLength: number | null
  valueVisible: boolean
}

type SerializedPlanarConstraint = {
  type: 'planar'
  faceId: string
}

type SerializedCylinderConstraint = {
  type: 'cylinder'
  cylinderId: string
  bottomCircleId: string
  topCircleId: string
  name: string
  valueVisible: boolean
}

type SerializedObjectConstrainedPointConstraint = {
  type: 'objectConstrainedPoint'
  pointId: string
  targetType: string
  targetId: string
  parametricData: ParametricData | null
}

type SerializedConstraint =
  | SerializedCubeConstraint
  | SerializedIntersectionConstraint
  | SerializedRegularPolygonConstraint
  | SerializedPlanarConstraint
  | SerializedCylinderConstraint
  | SerializedObjectConstrainedPointConstraint

type SceneMetadata = {
  exportedAt: string
  totalElements: number
  pointCount: number
  lineCount: number
  straightLineCount: number
  rayCount: number
  vectorCount: number
  circleCount: number
  faceCount: number
  sphereCount: number
  coneCount: number
  cylinderCount: number
  constraintCount: number
}

export type SerializedScene = {
  version: 1
  metadata?: SceneMetadata
  points: SerializedPoint[]
  lines: SerializedLine[]
  straightLines: SerializedStraightLine[]
  rays: SerializedRay[]
  vectors: SerializedVector[]
  circles: SerializedCircle[]
  faces: SerializedFace[]
  spheres: SerializedSphere[]
  cones: SerializedCone[]
  cylinders: SerializedCylinder[]
  constraints: SerializedConstraint[]
}

const SCENE_FILE_VERSION = 1

function serializeVec3(v: Vec3): SerializedVec3 {
  return { x: v.x, y: v.y, z: v.z }
}

type BaseSerializableFields = {
  id: string
  name: string
  nameVisible: boolean
  valueVisible: boolean
  labelOffsetX: number
  labelOffsetY: number
}

function pickBaseFields<T extends BaseSerializableFields>(obj: T): BaseSerializableFields {
  return {
    id: obj.id,
    name: obj.name,
    nameVisible: obj.nameVisible,
    valueVisible: obj.valueVisible,
    labelOffsetX: obj.labelOffsetX,
    labelOffsetY: obj.labelOffsetY,
  }
}

function serializePoint(p: Point3): SerializedPoint {
  return {
    ...pickBaseFields(p),
    position: serializeVec3(p.position),
    locked: p.locked,
    userLocked: p.userLocked,
    cubeId: p.cubeId,
    cubeRole: p.cubeRole,
    circleId: p.circleId,
    circleRole: p.circleRole,
    regularPolygonId: p.regularPolygonId,
    regularPolygonRole: p.regularPolygonRole,
    sphereId: p.sphereId,
    sphereRole: p.sphereRole,
    coneId: p.coneId,
    coneRole: p.coneRole,
    cylinderId: p.cylinderId,
    cylinderRole: p.cylinderRole,
    constrainedTo: p.constrainedTo,
  }
}

function serializeLine(l: Line3): SerializedLine {
  return {
    ...pickBaseFields(l),
    visible: l.visible,
    userLocked: l.userLocked,
    lengthLocked: l.lengthLocked,
    lockedLength: l.lockedLength,
    faceOwned: l.faceOwned,
    faceConstraintType: l.faceConstraintType,
    p1Id: l.p1.id,
    p2Id: l.p2.id,
  }
}

function serializeStraightLine(l: StraightLine3): SerializedStraightLine {
  return {
    ...pickBaseFields(l),
    visible: l.visible,
    userLocked: l.userLocked,
    p1Id: l.p1.id,
    p2Id: l.p2.id,
    displayLength: l.displayLength,
  }
}

function serializeRay(r: Ray3): SerializedRay {
  return {
    ...pickBaseFields(r),
    visible: r.visible,
    userLocked: r.userLocked,
    p1Id: r.p1.id,
    p2Id: r.p2.id,
    displayLength: r.displayLength,
  }
}

function serializeVector(v: GeoVector3): SerializedVector {
  return {
    ...pickBaseFields(v),
    visible: v.visible,
    userLocked: v.userLocked,
    p1Id: v.p1.id,
    p2Id: v.p2.id,
  }
}

function serializeCircle(c: Circle3): SerializedCircle {
  return {
    ...pickBaseFields(c),
    visible: c.visible,
    userLocked: c.userLocked,
    centerVisible: c.centerVisible,
    p1Id: c.p1.id,
    p2Id: c.p2.id,
    p3Id: c.p3.id,
    circleType: c.circleType,
    directionType: c.directionType,
    directionId: c.directionId,
    lockedRadius: c.lockedRadius,
  }
}

function serializeFace(f: PlanarPolygon): SerializedFace {
  return {
    ...pickBaseFields(f),
    visible: f.visible,
    fillColor: f.fillColor,
    fillOpacity: f.fillOpacity,
    cubeId: f.cubeId,
    cubeOwnerPointIds: f.cubeOwnerPointIds,
    cubeDependentPointIds: f.cubeDependentPointIds,
    userLocked: f.userLocked,
    areaLocked: f.areaLocked,
    lockedArea: f.lockedArea,
    edgeLengthLocks: f.edgeLengthLocks,
    boundaryPointIds: f.boundaryPointIds,
    memberPointIds: f.memberPointIds,
    boundaryLineIds: f.boundaryLineIds,
    supportPointIds: f.supportPointIds,
    isRegularPolygon: f.isRegularPolygon,
    regularPolygonVertexCount: f.regularPolygonVertexCount,
    regularPolygonId: f.regularPolygonId,
    regularPolygonOwnerPointIds: f.regularPolygonOwnerPointIds,
    regularPolygonDependentPointIds: f.regularPolygonDependentPointIds,
  }
}

function serializeSphere(s: Sphere3): SerializedSphere {
  return {
    ...pickBaseFields(s),
    visible: s.visible,
    userLocked: s.userLocked,
    centerPointId: s.centerPoint.id,
    radiusPointId: s.radiusPoint?.id ?? null,
    radiusValue: s.radiusValue,
  }
}

function serializeCone(c: Cone3): SerializedCone {
  return {
    ...pickBaseFields(c),
    visible: c.visible,
    userLocked: c.userLocked,
    baseCenterPointId: c.baseCenterPoint.id,
    apexPointId: c.apexPoint.id,
    radiusValue: c.radiusValue,
    coneType: c.coneType,
    normalCircleId: c.normalCircleId,
  }
}

function serializeCylinder(c: Cylinder3): SerializedCylinder {
  return {
    ...pickBaseFields(c),
    visible: c.visible,
    userLocked: c.userLocked,
    bottomCenterPointId: c.bottomCenterPoint.id,
    topCenterPointId: c.topCenterPoint.id,
    radiusValue: c.radiusValue,
    cylinderType: c.cylinderType,
    normalCircleId: c.normalCircleId,
    topNormalCircleId: c.topNormalCircleId,
  }
}

function serializeConstraint(c: SceneConstraint): SerializedConstraint | null {
  if (c instanceof CubeConstraint) {
    return {
      type: 'cube',
      cubeId: c.cubeId,
      solidType: c.solidType,
      ownerPointIds: c.ownerPointIds,
      dependentLayouts: c.dependentLayouts.map((layout) => ({
        pointId: layout.pointId,
        x: layout.x,
        y: layout.y,
        z: layout.z,
      })),
      faceIds: c.faceIds,
      sourceLineId: c.sourceLineId,
      vAxisHint: serializeVec3(c.getVAxisHint()),
      name: c.name,
      edgeLengthLocked: c.edgeLengthLocked,
      lockedEdgeLength: c.lockedEdgeLength,
      valueVisible: c.valueVisible,
    }
  }
  if (c instanceof IntersectionPointConstraint) {
    return {
      type: 'intersection',
      pointId: c.pointId,
      sourceA: c.sourceA,
      sourceB: c.sourceB,
    }
  }
  if (c instanceof RegularPolygonConstraint) {
    return {
      type: 'regularPolygon',
      constraintId: c.constraintId,
      ownerPointIds: c.ownerPointIds,
      dependentLayouts: c.dependentLayouts.map((layout) => ({
        pointId: layout.pointId,
        angleIndex: layout.angleIndex,
      })),
      faceId: c.faceId,
      vertexCount: c.vertexCount,
      vAxisHint: serializeVec3(c.getVAxisHint()),
      name: c.name,
      edgeLengthLocked: c.edgeLengthLocked,
      lockedEdgeLength: c.lockedEdgeLength,
      valueVisible: c.valueVisible,
    }
  }
  if (c instanceof PlanarPolygonConstraint) {
    return {
      type: 'planar',
      faceId: c.faceId,
    }
  }
  if (c instanceof CylinderConstraint) {
    return {
      type: 'cylinder',
      cylinderId: c.cylinderId,
      bottomCircleId: c.bottomCircleId,
      topCircleId: c.topCircleId,
      name: c.name,
      valueVisible: c.valueVisible,
    }
  }
  if (c instanceof ObjectConstrainedPointConstraint) {
    return {
      type: 'objectConstrainedPoint',
      pointId: c.pointId,
      targetType: c.target.type,
      targetId: c.target.id,
      parametricData: c.parametricData,
    }
  }
  return null
}

export function exportScene(scene: Scene): SerializedScene {
  const points = [...scene.points.values()].map(serializePoint)
  const lines = [...scene.lines.values()].map(serializeLine)
  const straightLines = [...scene.straightLines.values()].map(serializeStraightLine)
  const rays = [...scene.rays.values()].map(serializeRay)
  const vectors = [...scene.vectors.values()].map(serializeVector)
  const circles = [...scene.circles.values()].map(serializeCircle)
  const faces = [...scene.faces.values()].map(serializeFace)
  const spheres = [...scene.spheres.values()].map(serializeSphere)
  const cones = [...scene.cones.values()].map(serializeCone)
  const cylinders = [...scene.cylinders.values()].map(serializeCylinder)
  const constraints = scene.constraints.map(serializeConstraint).filter((c): c is SerializedConstraint => c !== null)

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const exportedAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

  const metadata: SceneMetadata = {
    exportedAt,
    totalElements: points.length + lines.length + straightLines.length + rays.length + vectors.length + circles.length + faces.length + spheres.length + cones.length + cylinders.length,
    pointCount: points.length,
    lineCount: lines.length,
    straightLineCount: straightLines.length,
    rayCount: rays.length,
    vectorCount: vectors.length,
    circleCount: circles.length,
    faceCount: faces.length,
    sphereCount: spheres.length,
    coneCount: cones.length,
    cylinderCount: cylinders.length,
    constraintCount: constraints.length,
  }

  return {
    version: SCENE_FILE_VERSION,
    metadata,
    points,
    lines,
    straightLines,
    rays,
    vectors,
    circles,
    faces,
    spheres,
    cones,
    cylinders,
    constraints,
  }
}

function validateId(id: unknown, typeName: string): string | null {
  if (typeof id !== 'string' || id === '') {
    return `${typeName}数据包含无效或空的 id`
  }
  return null
}

function validateIdUnique(id: string, idSet: Set<string>, typeName: string): string | null {
  if (idSet.has(id)) {
    return `${typeName} id 重复：${id}`
  }
  return null
}

function validateName(name: unknown, typeName: string, id: string): string | null {
  if (typeof name !== 'string') {
    return `${typeName} "${id}" 缺少 name 字段`
  }
  return null
}

function validateReference(refId: unknown, idSet: Set<string>, errorMsg: string): string | null {
  if (typeof refId !== 'string' || !idSet.has(refId)) {
    return errorMsg
  }
  return null
}

function validatePositiveFiniteNumber(value: unknown, errorMsg: string): string | null {
  if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
    return errorMsg
  }
  return null
}

function validateVec3(v: unknown, errorMsg: string): string | null {
  if (typeof v !== 'object' || v === null) return errorMsg
  const o = v as Record<string, unknown>
  if (typeof o.x !== 'number' || typeof o.y !== 'number' || typeof o.z !== 'number' ||
    !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.z)) {
    return errorMsg
  }
  return null
}

function validateNullableStringId(value: unknown, errorMsg: string): string | null {
  if (value !== null && typeof value !== 'string') {
    return errorMsg
  }
  return null
}

export function validateSerializedScene(data: unknown): { valid: boolean; error?: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: '文件内容不是有效的 JSON 对象' }
  }

  const obj = data as Record<string, unknown>

  if (obj.version !== SCENE_FILE_VERSION) {
    return { valid: false, error: `不支持的文件版本：${obj.version}，当前仅支持版本 ${SCENE_FILE_VERSION}` }
  }

  const requiredArrays: Array<keyof SerializedScene> = [
    'points',
    'lines',
    'straightLines',
    'rays',
    'vectors',
    'circles',
    'faces',
    'spheres',
    'cones',
    'constraints',
  ]

  for (const key of requiredArrays) {
    if (!Array.isArray(obj[key])) {
      return { valid: false, error: `缺少必要字段 "${key}" 或其不是数组` }
    }
  }

  if (!Array.isArray(obj.cylinders)) {
    obj.cylinders = []
  }

  const points = obj.points as SerializedPoint[]
  const lineIdSet = new Set<string>()
  const straightLineIdSet = new Set<string>()
  const rayIdSet = new Set<string>()
  const vectorIdSet = new Set<string>()
  const circleIdSet = new Set<string>()
  const faceIdSet = new Set<string>()
  const sphereIdSet = new Set<string>()

  const pointIdSet = new Set<string>()
  for (const p of points) {
    let err = validateId(p.id, '点')
    if (err) return { valid: false, error: err }
    err = validateName(p.name, '点', p.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(p.id, pointIdSet, '点')
    if (err) return { valid: false, error: err }
    pointIdSet.add(p.id)
    err = validateVec3(p.position, `点 "${p.name}" 的坐标数据无效或包含非有限值`)
    if (err) return { valid: false, error: err }
    if (typeof p.locked !== 'boolean') {
      return { valid: false, error: `点 "${p.name}" 缺少 locked 字段` }
    }
    if (typeof p.userLocked !== 'boolean') {
      return { valid: false, error: `点 "${p.name}" 缺少 userLocked 字段` }
    }
    err = validateNullableStringId(p.cubeId, `点 "${p.name}" 的 cubeId 无效`)
    if (err) return { valid: false, error: err }
    if (p.cubeRole !== null && p.cubeRole !== 'owner' && p.cubeRole !== 'dependent') {
      return { valid: false, error: `点 "${p.name}" 的 cubeRole 无效` }
    }
    err = validateNullableStringId(p.circleId, `点 "${p.name}" 的 circleId 无效`)
    if (err) return { valid: false, error: err }
    if (p.circleRole !== null && p.circleRole !== 'center') {
      return { valid: false, error: `点 "${p.name}" 的 circleRole 无效` }
    }
    err = validateNullableStringId(p.sphereId, `点 "${p.name}" 的 sphereId 无效`)
    if (err) return { valid: false, error: err }
    if (p.sphereRole !== null && p.sphereRole !== 'center' && p.sphereRole !== 'radius') {
      return { valid: false, error: `点 "${p.name}" 的 sphereRole 无效` }
    }
    err = validateNullableStringId(p.coneId, `点 "${p.name}" 的 coneId 无效`)
    if (err) return { valid: false, error: err }
    if (p.coneRole !== null && p.coneRole !== 'baseCenter' && p.coneRole !== 'apex') {
      return { valid: false, error: `点 "${p.name}" 的 coneRole 无效` }
    }
    err = validateNullableStringId(p.cylinderId ?? null, `点 "${p.name}" 的 cylinderId 无效`)
    if (err) return { valid: false, error: err }
    const cylinderRole = p.cylinderRole ?? null
    if (cylinderRole !== null && cylinderRole !== 'bottomCenter' && cylinderRole !== 'topCenter') {
      return { valid: false, error: `点 "${p.name}" 的 cylinderRole 无效` }
    }
    err = validateNullableStringId(p.regularPolygonId, `点 "${p.name}" 的 regularPolygonId 无效`)
    if (err) return { valid: false, error: err }
    if (p.regularPolygonRole !== null && p.regularPolygonRole !== 'owner' && p.regularPolygonRole !== 'dependent') {
      return { valid: false, error: `点 "${p.name}" 的 regularPolygonRole 无效` }
    }
  }

  if (!pointIdSet.has(Scene.ORIGIN_ID)) {
    return { valid: false, error: '缺少原点（origin）' }
  }

  const lines = obj.lines as SerializedLine[]
  for (const l of lines) {
    let err = validateId(l.id, '线段')
    if (err) return { valid: false, error: err }
    err = validateName(l.name, '线段', l.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(l.id, lineIdSet, '线段')
    if (err) return { valid: false, error: err }
    lineIdSet.add(l.id)
    err = validateReference(l.p1Id, pointIdSet, `线段 "${l.name}" 引用了不存在的起点`)
    if (err) return { valid: false, error: err }
    err = validateReference(l.p2Id, pointIdSet, `线段 "${l.name}" 引用了不存在的终点`)
    if (err) return { valid: false, error: err }
    if (l.p1Id === l.p2Id) {
      return { valid: false, error: `线段 "${l.name}" 的起点和终点不能相同` }
    }
    if (typeof l.lengthLocked !== 'boolean') {
      return { valid: false, error: `线段 "${l.name}" 缺少 lengthLocked 字段` }
    }
    if (l.faceConstraintType !== null && l.faceConstraintType !== 'polygon' && l.faceConstraintType !== 'regularPolygon' && l.faceConstraintType !== 'hexahedron' && l.faceConstraintType !== 'tetrahedron') {
      return { valid: false, error: `线段 "${l.name}" 的 faceConstraintType 无效` }
    }
  }

  const straightLines = obj.straightLines as SerializedStraightLine[]
  for (const l of straightLines) {
    let err = validateId(l.id, '直线')
    if (err) return { valid: false, error: err }
    err = validateName(l.name, '直线', l.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(l.id, straightLineIdSet, '直线')
    if (err) return { valid: false, error: err }
    straightLineIdSet.add(l.id)
    err = validateReference(l.p1Id, pointIdSet, `直线 "${l.name}" 引用了不存在的起点`)
    if (err) return { valid: false, error: err }
    err = validateReference(l.p2Id, pointIdSet, `直线 "${l.name}" 引用了不存在的终点`)
    if (err) return { valid: false, error: err }
    if (l.p1Id === l.p2Id) {
      return { valid: false, error: `直线 "${l.name}" 的起点和终点不能相同` }
    }
  }

  const rays = obj.rays as SerializedRay[]
  for (const r of rays) {
    let err = validateId(r.id, '射线')
    if (err) return { valid: false, error: err }
    err = validateName(r.name, '射线', r.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(r.id, rayIdSet, '射线')
    if (err) return { valid: false, error: err }
    rayIdSet.add(r.id)
    err = validateReference(r.p1Id, pointIdSet, `射线 "${r.name}" 引用了不存在的起点`)
    if (err) return { valid: false, error: err }
    err = validateReference(r.p2Id, pointIdSet, `射线 "${r.name}" 引用了不存在的终点`)
    if (err) return { valid: false, error: err }
    if (r.p1Id === r.p2Id) {
      return { valid: false, error: `射线 "${r.name}" 的起点和终点不能相同` }
    }
  }

  const vectors = obj.vectors as SerializedVector[]
  for (const v of vectors) {
    let err = validateId(v.id, '向量')
    if (err) return { valid: false, error: err }
    err = validateName(v.name, '向量', v.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(v.id, vectorIdSet, '向量')
    if (err) return { valid: false, error: err }
    vectorIdSet.add(v.id)
    err = validateReference(v.p1Id, pointIdSet, `向量 "${v.name}" 引用了不存在的起点`)
    if (err) return { valid: false, error: err }
    err = validateReference(v.p2Id, pointIdSet, `向量 "${v.name}" 引用了不存在的终点`)
    if (err) return { valid: false, error: err }
    if (v.p1Id === v.p2Id) {
      return { valid: false, error: `向量 "${v.name}" 的起点和终点不能相同` }
    }
  }

  const circles = obj.circles as SerializedCircle[]
  for (const c of circles) {
    let err = validateId(c.id, '圆')
    if (err) return { valid: false, error: err }
    err = validateName(c.name, '圆', c.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(c.id, circleIdSet, '圆')
    if (err) return { valid: false, error: err }
    circleIdSet.add(c.id)
    err = validateReference(c.p1Id, pointIdSet, `圆 "${c.name}" 引用了不存在的点 p1`)
    if (err) return { valid: false, error: err }
    err = validateReference(c.p2Id, pointIdSet, `圆 "${c.name}" 引用了不存在的点 p2`)
    if (err) return { valid: false, error: err }
    err = validateReference(c.p3Id, pointIdSet, `圆 "${c.name}" 引用了不存在的点 p3`)
    if (err) return { valid: false, error: err }
    if (c.circleType !== 'threePoint' && c.circleType !== 'normal') {
      return { valid: false, error: `圆 "${c.name}" 的 circleType 无效` }
    }
    if (c.circleType === 'normal') {
      if (c.directionType === null || c.directionType === undefined) {
        return { valid: false, error: `法向圆 "${c.name}" 缺少 directionType` }
      }
      const validDirectionTypes: DirectionType[] = ['line', 'straightLine', 'ray', 'vector', 'point']
      if (!validDirectionTypes.includes(c.directionType)) {
        return { valid: false, error: `法向圆 "${c.name}" 的 directionType 无效` }
      }
      if (c.directionId === null || c.directionId === undefined || typeof c.directionId !== 'string') {
        return { valid: false, error: `法向圆 "${c.name}" 缺少 directionId` }
      }
      if (c.directionType === 'line' && !lineIdSet.has(c.directionId)) {
        return { valid: false, error: `法向圆 "${c.name}" 的方向引用了不存在的线段` }
      }
      if (c.directionType === 'straightLine' && !straightLineIdSet.has(c.directionId)) {
        return { valid: false, error: `法向圆 "${c.name}" 的方向引用了不存在的直线` }
      }
      if (c.directionType === 'ray' && !rayIdSet.has(c.directionId)) {
        return { valid: false, error: `法向圆 "${c.name}" 的方向引用了不存在的射线` }
      }
      if (c.directionType === 'vector' && !vectorIdSet.has(c.directionId)) {
        return { valid: false, error: `法向圆 "${c.name}" 的方向引用了不存在的向量` }
      }
      if (c.directionType === 'point' && !pointIdSet.has(c.directionId)) {
        return { valid: false, error: `法向圆 "${c.name}" 的方向引用了不存在的点` }
      }
      err = validatePositiveFiniteNumber(c.lockedRadius, `法向圆 "${c.name}" 的 lockedRadius 无效`)
      if (err) return { valid: false, error: err }
    }
  }

  const faces = obj.faces as SerializedFace[]
  for (const f of faces) {
    let err = validateId(f.id, '面')
    if (err) return { valid: false, error: err }
    err = validateName(f.name, '面', f.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(f.id, faceIdSet, '面')
    if (err) return { valid: false, error: err }
    faceIdSet.add(f.id)
    if (!Array.isArray(f.boundaryPointIds) || f.boundaryPointIds.length < 3) {
      return { valid: false, error: `面 "${f.name}" 的 boundaryPointIds 至少需要 3 个点` }
    }
    const boundarySet = new Set(f.boundaryPointIds)
    if (boundarySet.size !== f.boundaryPointIds.length) {
      return { valid: false, error: `面 "${f.name}" 的 boundaryPointIds 包含重复点` }
    }
    for (const pid of f.boundaryPointIds) {
      err = validateReference(pid, pointIdSet, `面 "${f.name}" 的边界引用了不存在的点`)
      if (err) return { valid: false, error: err }
    }
    for (const lid of f.boundaryLineIds) {
      err = validateReference(lid, lineIdSet, `面 "${f.name}" 的边界引用了不存在的线段`)
      if (err) return { valid: false, error: err }
    }
    err = validateNullableStringId(f.cubeId, `面 "${f.name}" 的 cubeId 无效`)
    if (err) return { valid: false, error: err }
    if (f.isRegularPolygon && (typeof f.regularPolygonVertexCount !== 'number' || f.regularPolygonVertexCount < 3 || !Number.isFinite(f.regularPolygonVertexCount))) {
      return { valid: false, error: `面 "${f.name}" 是正多边形但 vertexCount 无效` }
    }
    if (f.areaLocked && (typeof f.lockedArea !== 'number' || f.lockedArea <= 0 || !Number.isFinite(f.lockedArea))) {
      return { valid: false, error: `面 "${f.name}" 锁定了面积但 lockedArea 无效` }
    }
  }

  const spheres = obj.spheres as SerializedSphere[]
  for (const s of spheres) {
    let err = validateId(s.id, '球')
    if (err) return { valid: false, error: err }
    err = validateName(s.name, '球', s.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(s.id, sphereIdSet, '球')
    if (err) return { valid: false, error: err }
    sphereIdSet.add(s.id)
    err = validateReference(s.centerPointId, pointIdSet, `球 "${s.name}" 引用了不存在的中心点`)
    if (err) return { valid: false, error: err }
    if (s.radiusPointId !== null) {
      err = validateReference(s.radiusPointId, pointIdSet, `球 "${s.name}" 引用了不存在的半径点`)
      if (err) return { valid: false, error: err }
    }
    if (s.radiusPointId === null) {
      err = validatePositiveFiniteNumber(s.radiusValue, `球 "${s.name}" 缺少半径点但 radiusValue 无效`)
      if (err) return { valid: false, error: err }
    }
  }

  const coneIdSet = new Set<string>()
  const cones = obj.cones as SerializedCone[]
  for (const c of cones) {
    let err = validateId(c.id, '圆锥')
    if (err) return { valid: false, error: err }
    err = validateName(c.name, '圆锥', c.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(c.id, coneIdSet, '圆锥')
    if (err) return { valid: false, error: err }
    coneIdSet.add(c.id)
    err = validateReference(c.baseCenterPointId, pointIdSet, `圆锥 "${c.name}" 引用了不存在的底面中心点`)
    if (err) return { valid: false, error: err }
    err = validateReference(c.apexPointId, pointIdSet, `圆锥 "${c.name}" 引用了不存在的顶点`)
    if (err) return { valid: false, error: err }
    err = validatePositiveFiniteNumber(c.radiusValue, `圆锥 "${c.name}" 的 radiusValue 无效`)
    if (err) return { valid: false, error: err }
    if (c.coneType !== 'twoPoint' && c.coneType !== 'normalCircle') {
      return { valid: false, error: `圆锥 "${c.name}" 的 coneType 无效` }
    }
    err = validateNullableStringId(c.normalCircleId, `圆锥 "${c.name}" 的 normalCircleId 无效`)
    if (err) return { valid: false, error: err }
  }

  const cylinderIdSet = new Set<string>()
  const cylinders = obj.cylinders as SerializedCylinder[]
  for (const c of cylinders) {
    let err = validateId(c.id, '圆柱')
    if (err) return { valid: false, error: err }
    err = validateName(c.name, '圆柱', c.id)
    if (err) return { valid: false, error: err }
    err = validateIdUnique(c.id, cylinderIdSet, '圆柱')
    if (err) return { valid: false, error: err }
    cylinderIdSet.add(c.id)
    err = validateReference(c.bottomCenterPointId, pointIdSet, `圆柱 "${c.name}" 引用了不存在的底面中心点`)
    if (err) return { valid: false, error: err }
    err = validateReference(c.topCenterPointId, pointIdSet, `圆柱 "${c.name}" 引用了不存在的顶面中心点`)
    if (err) return { valid: false, error: err }
    err = validatePositiveFiniteNumber(c.radiusValue, `圆柱 "${c.name}" 的 radiusValue 无效`)
    if (err) return { valid: false, error: err }
    if (c.cylinderType !== 'twoPoint' && c.cylinderType !== 'normalCircle') {
      return { valid: false, error: `圆柱 "${c.name}" 的 cylinderType 无效` }
    }
    err = validateNullableStringId(c.normalCircleId, `圆柱 "${c.name}" 的 normalCircleId 无效`)
    if (err) return { valid: false, error: err }
    if (c.normalCircleId !== null && !circleIdSet.has(c.normalCircleId)) {
      return { valid: false, error: `圆柱 "${c.name}" 的 normalCircleId 引用了不存在的圆` }
    }
    err = validateNullableStringId(c.topNormalCircleId, `圆柱 "${c.name}" 的 topNormalCircleId 无效`)
    if (err) return { valid: false, error: err }
    if (c.topNormalCircleId !== null && !circleIdSet.has(c.topNormalCircleId)) {
      return { valid: false, error: `圆柱 "${c.name}" 的 topNormalCircleId 引用了不存在的圆` }
    }
  }

  const constraints = obj.constraints as SerializedConstraint[]
  const validTypes = new Set(['cube', 'intersection', 'regularPolygon', 'planar', 'cylinder', 'objectConstrainedPoint'])
  const constraintPointIds = new Set<string>()
  for (const c of constraints) {
    if (!validTypes.has(c.type)) {
      return { valid: false, error: '约束数据包含未知的约束类型' }
    }
    if (c.type === 'cube') {
      const cc = c as SerializedCubeConstraint
      if (typeof cc.cubeId !== 'string' || cc.cubeId === '') {
        return { valid: false, error: '立方体约束缺少 cubeId' }
      }
      if (cc.solidType !== 'hexahedron' && cc.solidType !== 'tetrahedron') {
        return { valid: false, error: `立方体约束 "${cc.name}" 的 solidType 无效` }
      }
      if (!Array.isArray(cc.ownerPointIds) || cc.ownerPointIds.length !== 2) {
        return { valid: false, error: `立方体约束 "${cc.name}" 的 ownerPointIds 必须包含 2 个点` }
      }
      if (!pointIdSet.has(cc.ownerPointIds[0]) || !pointIdSet.has(cc.ownerPointIds[1])) {
        return { valid: false, error: `立方体约束 "${cc.name}" 引用了不存在的拥有者点` }
      }
      if (cc.ownerPointIds[0] === cc.ownerPointIds[1]) {
        return { valid: false, error: `立方体约束 "${cc.name}" 的两个拥有者点不能相同` }
      }
      if (!Array.isArray(cc.dependentLayouts)) {
        return { valid: false, error: `立方体约束 "${cc.name}" 缺少 dependentLayouts` }
      }
      for (const layout of cc.dependentLayouts) {
        let err = validateReference(layout.pointId, pointIdSet, `立方体约束 "${cc.name}" 的依赖布局引用了不存在的点`)
        if (err) return { valid: false, error: err }
        err = validateVec3(layout, `立方体约束 "${cc.name}" 的依赖布局坐标无效`)
        if (err) return { valid: false, error: err }
      }
      if (!Array.isArray(cc.faceIds)) {
        return { valid: false, error: `立方体约束 "${cc.name}" 缺少 faceIds` }
      }
      for (const fid of cc.faceIds) {
        const err = validateReference(fid, faceIdSet, `立方体约束 "${cc.name}" 引用了不存在的面`)
        if (err) return { valid: false, error: err }
      }
      {
        const err = validateVec3(cc.vAxisHint, `立方体约束 "${cc.name}" 的 vAxisHint 无效`)
        if (err) return { valid: false, error: err }
      }
      if (cc.edgeLengthLocked) {
        const err = validatePositiveFiniteNumber(cc.lockedEdgeLength, `立方体约束 "${cc.name}" 锁定了边长但 lockedEdgeLength 无效`)
        if (err) return { valid: false, error: err }
      }
    }
    if (c.type === 'intersection') {
      const ic = c as SerializedIntersectionConstraint
      if (typeof ic.pointId !== 'string' || ic.pointId === '' || !pointIdSet.has(ic.pointId)) {
        return { valid: false, error: '交点约束引用了不存在的点' }
      }
      if (constraintPointIds.has(ic.pointId)) {
        return { valid: false, error: `交点约束的 pointId 重复：${ic.pointId}` }
      }
      constraintPointIds.add(ic.pointId)
      if (typeof ic.sourceA !== 'object' || ic.sourceA === null || typeof ic.sourceA.type !== 'string' || typeof ic.sourceA.id !== 'string') {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceA 无效` }
      }
      if (typeof ic.sourceB !== 'object' || ic.sourceB === null || typeof ic.sourceB.type !== 'string' || typeof ic.sourceB.id !== 'string') {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceB 无效` }
      }
      const validTargetTypes = new Set(['line', 'straightLine', 'ray', 'vector', 'face'])
      if (!validTargetTypes.has(ic.sourceA.type)) {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceA.type 无效` }
      }
      if (!validTargetTypes.has(ic.sourceB.type)) {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceB.type 无效` }
      }
      const resolveTargetId = (type: string, id: string): boolean => {
        if (type === 'line') return lineIdSet.has(id)
        if (type === 'straightLine') return straightLineIdSet.has(id)
        if (type === 'ray') return rayIdSet.has(id)
        if (type === 'vector') return vectorIdSet.has(id)
        if (type === 'face') return faceIdSet.has(id)
        return false
      }
      if (!resolveTargetId(ic.sourceA.type, ic.sourceA.id)) {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceA 引用了不存在的对象` }
      }
      if (!resolveTargetId(ic.sourceB.type, ic.sourceB.id)) {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceB 引用了不存在的对象` }
      }
      if (ic.sourceA.type === ic.sourceB.type && ic.sourceA.id === ic.sourceB.id) {
        return { valid: false, error: `交点约束 (pointId=${ic.pointId}) 的 sourceA 和 sourceB 不能相同` }
      }
    }
    if (c.type === 'regularPolygon') {
      const rc = c as SerializedRegularPolygonConstraint
      if (typeof rc.constraintId !== 'string' || rc.constraintId === '') {
        return { valid: false, error: '正多边形约束缺少 constraintId' }
      }
      if (!Array.isArray(rc.ownerPointIds) || rc.ownerPointIds.length !== 2) {
        return { valid: false, error: `正多边形约束 "${rc.name}" 的 ownerPointIds 必须包含 2 个点` }
      }
      if (!pointIdSet.has(rc.ownerPointIds[0]) || !pointIdSet.has(rc.ownerPointIds[1])) {
        return { valid: false, error: `正多边形约束 "${rc.name}" 引用了不存在的拥有者点` }
      }
      if (rc.ownerPointIds[0] === rc.ownerPointIds[1]) {
        return { valid: false, error: `正多边形约束 "${rc.name}" 的两个拥有者点不能相同` }
      }
      if (typeof rc.vertexCount !== 'number' || rc.vertexCount < 3 || !Number.isFinite(rc.vertexCount)) {
        return { valid: false, error: `正多边形约束 "${rc.name}" 的 vertexCount 无效（必须 ≥3）` }
      }
      {
        const err = validateReference(rc.faceId, faceIdSet, `正多边形约束 "${rc.name}" 引用了不存在的面`)
        if (err) return { valid: false, error: err }
      }
      if (!Array.isArray(rc.dependentLayouts)) {
        return { valid: false, error: `正多边形约束 "${rc.name}" 缺少 dependentLayouts` }
      }
      for (const layout of rc.dependentLayouts) {
        const err = validateReference(layout.pointId, pointIdSet, `正多边形约束 "${rc.name}" 的依赖布局引用了不存在的点`)
        if (err) return { valid: false, error: err }
        if (typeof layout.angleIndex !== 'number' || !Number.isFinite(layout.angleIndex)) {
          return { valid: false, error: `正多边形约束 "${rc.name}" 的依赖布局 angleIndex 无效` }
        }
      }
      {
        const err = validateVec3(rc.vAxisHint, `正多边形约束 "${rc.name}" 的 vAxisHint 无效`)
        if (err) return { valid: false, error: err }
      }
      if (rc.edgeLengthLocked) {
        const err = validatePositiveFiniteNumber(rc.lockedEdgeLength, `正多边形约束 "${rc.name}" 锁定了边长但 lockedEdgeLength 无效`)
        if (err) return { valid: false, error: err }
      }
    }
    if (c.type === 'planar') {
      const pc = c as SerializedPlanarConstraint
      const err = validateReference(pc.faceId, faceIdSet, '平面约束引用了不存在的面')
      if (err) return { valid: false, error: err }
    }
    if (c.type === 'cylinder') {
      const yc = c as SerializedCylinderConstraint
      if (typeof yc.cylinderId !== 'string' || yc.cylinderId === '' || !cylinderIdSet.has(yc.cylinderId)) {
        return { valid: false, error: '圆柱约束引用了不存在的圆柱' }
      }
      if (typeof yc.bottomCircleId !== 'string' || yc.bottomCircleId === '' || !circleIdSet.has(yc.bottomCircleId)) {
        return { valid: false, error: `圆柱约束 "${yc.name}" 引用了不存在的底面圆` }
      }
      if (typeof yc.topCircleId !== 'string' || yc.topCircleId === '' || !circleIdSet.has(yc.topCircleId)) {
        return { valid: false, error: `圆柱约束 "${yc.name}" 引用了不存在的顶面圆` }
      }
    }
  }

  return { valid: true }
}

export function importScene(scene: Scene, data: SerializedScene): void {
  scene.selection.clear()
  scene.clearAllConstraints()

  scene.points.clear()
  scene.lines.clear()
  scene.straightLines.clear()
  scene.rays.clear()
  scene.vectors.clear()
  scene.circles.clear()
  scene.faces.clear()
  scene.spheres.clear()
  scene.cones.clear()
  scene.cylinders.clear()

  const pointMap = new Map<string, Point3>()

  const origin = new Point3(Scene.ORIGIN_ID, 'O', new Vec3(0, 0, 0), true, true)
  origin.onPositionChanged = (point) => {
    scene.markPointDirty(point.id)
  }
  pointMap.set(origin.id, origin)
  scene.points.set(origin.id, origin)

  for (const sp of data.points) {
    if (sp.id === Scene.ORIGIN_ID) {
      const existing = scene.points.get(Scene.ORIGIN_ID)!
      existing.name = sp.name
      existing.nameVisible = sp.nameVisible
      existing.valueVisible = sp.valueVisible
      existing.labelOffsetX = sp.labelOffsetX
      existing.labelOffsetY = sp.labelOffsetY
      existing.userLocked = sp.userLocked
      existing.cubeId = sp.cubeId
      existing.cubeRole = sp.cubeRole
      existing.circleId = sp.circleId
      existing.circleRole = sp.circleRole
      existing.regularPolygonId = sp.regularPolygonId
      existing.regularPolygonRole = sp.regularPolygonRole
      existing.sphereId = sp.sphereId
      existing.sphereRole = sp.sphereRole
      existing.coneId = sp.coneId
      existing.coneRole = sp.coneRole
      existing.cylinderId = sp.cylinderId ?? null
      existing.cylinderRole = sp.cylinderRole ?? null
      existing.constrainedTo = (sp.constrainedTo as ConstrainedToRef | null) ?? null
      continue
    }

    const p = new Point3(
      sp.id,
      sp.name,
      new Vec3(sp.position.x, sp.position.y, sp.position.z),
      sp.locked,
      sp.nameVisible,
      sp.userLocked,
      sp.labelOffsetX,
      sp.labelOffsetY,
      sp.valueVisible,
    )
    p.cubeId = sp.cubeId
    p.cubeRole = sp.cubeRole
    p.circleId = sp.circleId
    p.circleRole = sp.circleRole
    p.regularPolygonId = sp.regularPolygonId
    p.regularPolygonRole = sp.regularPolygonRole
    p.sphereId = sp.sphereId
    p.sphereRole = sp.sphereRole
    p.coneId = sp.coneId
    p.coneRole = sp.coneRole
    p.cylinderId = sp.cylinderId ?? null
    p.cylinderRole = sp.cylinderRole ?? null
    p.constrainedTo = (sp.constrainedTo as ConstrainedToRef | null) ?? null
    scene.addPoint(p)
    pointMap.set(p.id, p)
  }

  for (const sl of data.lines) {
    const p1 = scene.points.get(sl.p1Id)
    const p2 = scene.points.get(sl.p2Id)
    if (!p1 || !p2) continue
    const l = new Line3(
      sl.id,
      sl.name,
      p1,
      p2,
      sl.nameVisible,
      sl.visible,
      sl.lengthLocked,
      sl.lockedLength,
      sl.userLocked,
      sl.labelOffsetX,
      sl.labelOffsetY,
      sl.valueVisible,
    )
    l.faceOwned = sl.faceOwned
    l.faceConstraintType = sl.faceConstraintType
    scene.addLine(l)
  }

  for (const sl of data.straightLines) {
    const p1 = scene.points.get(sl.p1Id)
    const p2 = scene.points.get(sl.p2Id)
    if (!p1 || !p2) continue
    const l = new StraightLine3(
      sl.id,
      sl.name,
      p1,
      p2,
      sl.nameVisible,
      sl.visible,
      sl.displayLength,
      sl.userLocked,
      sl.labelOffsetX,
      sl.labelOffsetY,
      sl.valueVisible,
    )
    scene.addStraightLine(l)
  }

  for (const sr of data.rays) {
    const p1 = scene.points.get(sr.p1Id)
    const p2 = scene.points.get(sr.p2Id)
    if (!p1 || !p2) continue
    const r = new Ray3(
      sr.id,
      sr.name,
      p1,
      p2,
      sr.nameVisible,
      sr.visible,
      sr.displayLength,
      sr.userLocked,
      sr.labelOffsetX,
      sr.labelOffsetY,
      sr.valueVisible,
    )
    scene.addRay(r)
  }

  for (const sv of data.vectors) {
    const p1 = scene.points.get(sv.p1Id)
    const p2 = scene.points.get(sv.p2Id)
    if (!p1 || !p2) continue
    const v = new GeoVector3(
      sv.id,
      sv.name,
      p1,
      p2,
      sv.nameVisible,
      sv.visible,
      sv.userLocked,
      sv.labelOffsetX,
      sv.labelOffsetY,
      sv.valueVisible,
    )
    scene.addVector(v)
  }

  for (const sc of data.circles) {
    const p1 = scene.points.get(sc.p1Id)
    const p2 = scene.points.get(sc.p2Id)
    const p3 = scene.points.get(sc.p3Id)
    if (!p1 || !p2 || !p3) continue
    const c = new Circle3(
      sc.id,
      sc.name,
      p1,
      p2,
      p3,
      sc.nameVisible,
      sc.visible,
      sc.userLocked,
      sc.labelOffsetX,
      sc.labelOffsetY,
      sc.valueVisible,
      sc.centerVisible,
      sc.circleType,
      sc.directionType,
      sc.directionId,
      sc.lockedRadius,
    )
    scene.addCircle(c)
  }

  for (const sf of data.faces) {
    const f = new PlanarPolygon(
      sf.id,
      sf.name,
      sf.boundaryPointIds,
      sf.memberPointIds,
      sf.boundaryLineIds,
      sf.nameVisible,
      sf.visible,
      sf.userLocked,
      sf.supportPointIds,
      sf.areaLocked,
      sf.lockedArea,
      sf.edgeLengthLocks,
      sf.labelOffsetX,
      sf.labelOffsetY,
      sf.valueVisible,
      sf.isRegularPolygon,
      sf.regularPolygonVertexCount,
    )
    f.fillColor = sf.fillColor
    f.fillOpacity = sf.fillOpacity
    f.cubeId = sf.cubeId
    f.cubeOwnerPointIds = sf.cubeOwnerPointIds
    f.cubeDependentPointIds = sf.cubeDependentPointIds
    f.regularPolygonId = sf.regularPolygonId
    f.regularPolygonOwnerPointIds = sf.regularPolygonOwnerPointIds
    f.regularPolygonDependentPointIds = sf.regularPolygonDependentPointIds
    scene.addFace(f)
  }

  for (const ss of data.spheres) {
    const centerPoint = scene.points.get(ss.centerPointId)
    const radiusPoint = ss.radiusPointId ? scene.points.get(ss.radiusPointId) ?? null : null
    if (!centerPoint) continue
    const s = new Sphere3(
      ss.id,
      ss.name,
      centerPoint,
      radiusPoint,
      ss.nameVisible,
      ss.visible,
      ss.userLocked,
      ss.labelOffsetX,
      ss.labelOffsetY,
      ss.valueVisible,
      ss.radiusValue,
    )
    scene.addSphere(s)
  }

  for (const sc of data.cones) {
    const baseCenterPoint = scene.points.get(sc.baseCenterPointId)
    const apexPoint = scene.points.get(sc.apexPointId)
    if (!baseCenterPoint || !apexPoint) continue
    const c = new Cone3(
      sc.id,
      sc.name,
      baseCenterPoint,
      apexPoint,
      sc.coneType,
      sc.nameVisible,
      sc.visible,
      sc.userLocked,
      sc.labelOffsetX,
      sc.labelOffsetY,
      sc.valueVisible,
      sc.radiusValue,
      sc.normalCircleId,
    )
    scene.addCone(c)
  }

  for (const sc of data.cylinders) {
    const bottomCenterPoint = scene.points.get(sc.bottomCenterPointId)
    const topCenterPoint = scene.points.get(sc.topCenterPointId)
    if (!bottomCenterPoint || !topCenterPoint) continue
    const c = new Cylinder3(
      sc.id,
      sc.name,
      bottomCenterPoint,
      topCenterPoint,
      sc.cylinderType,
      sc.nameVisible,
      sc.visible,
      sc.userLocked,
      sc.labelOffsetX,
      sc.labelOffsetY,
      sc.valueVisible,
      sc.radiusValue,
      sc.normalCircleId,
      sc.topNormalCircleId,
    )
    scene.addCylinder(c)
    bottomCenterPoint.cylinderId = c.id
    bottomCenterPoint.cylinderRole = 'bottomCenter'
    topCenterPoint.cylinderId = c.id
    topCenterPoint.cylinderRole = 'topCenter'
  }

  for (const sc of data.constraints) {
    if (sc.type === 'cube') {
      const cc = sc as SerializedCubeConstraint
      const constraint = new CubeConstraint(
        scene,
        cc.cubeId,
        cc.solidType,
        cc.ownerPointIds,
        cc.dependentLayouts,
        cc.faceIds,
        cc.sourceLineId,
        new Vec3(cc.vAxisHint.x, cc.vAxisHint.y, cc.vAxisHint.z),
        cc.name,
        cc.edgeLengthLocked,
        cc.lockedEdgeLength,
        cc.valueVisible,
      )
      scene.addCubeConstraint(constraint)
    } else if (sc.type === 'intersection') {
      const ic = sc as SerializedIntersectionConstraint
      const constraint = new IntersectionPointConstraint(
        scene,
        ic.pointId,
        ic.sourceA,
        ic.sourceB,
      )
      scene.addIntersectionConstraint(constraint)
    } else if (sc.type === 'regularPolygon') {
      const rc = sc as SerializedRegularPolygonConstraint
      const constraint = new RegularPolygonConstraint(
        scene,
        rc.constraintId,
        rc.ownerPointIds,
        rc.dependentLayouts,
        rc.faceId,
        rc.vertexCount,
        new Vec3(rc.vAxisHint.x, rc.vAxisHint.y, rc.vAxisHint.z),
        rc.name,
        rc.edgeLengthLocked,
        rc.lockedEdgeLength,
        rc.valueVisible,
      )
      scene.addRegularPolygonConstraint(constraint)
    } else if (sc.type === 'planar') {
      const pc = sc as SerializedPlanarConstraint
      const constraint = new PlanarPolygonConstraint(scene, pc.faceId)
      scene.addConstraint(constraint)
    } else if (sc.type === 'cylinder') {
      const yc = sc as SerializedCylinderConstraint
      const constraint = new CylinderConstraint(
        scene,
        yc.cylinderId,
        yc.bottomCircleId,
        yc.topCircleId,
        yc.name,
        yc.valueVisible,
      )
      scene.addCylinderConstraint(constraint)
    } else if (sc.type === 'objectConstrainedPoint') {
      const oc = sc as SerializedObjectConstrainedPointConstraint
      const point = scene.points.get(oc.pointId)
      if (point) {
        point.constrainedTo = { type: oc.targetType as ConstrainedToRef['type'], id: oc.targetId }
        const constraint = new ObjectConstrainedPointConstraint(scene, oc.pointId, point.constrainedTo)
        constraint.parametricData = oc.parametricData
        scene.addObjectConstrainedPointConstraint(constraint)
      }
    }
  }

  scene.markAllRenderDirty()
}

type SceneElementCounts = {
  points: number
  lines: number
  straightLines: number
  rays: number
  vectors: number
  circles: number
  faces: number
  spheres: number
  cones: number
  cylinders: number
}

function checkSceneEmpty(counts: SceneElementCounts): boolean {
  if (counts.points > 1) return false
  if (counts.lines > 0) return false
  if (counts.straightLines > 0) return false
  if (counts.rays > 0) return false
  if (counts.vectors > 0) return false
  if (counts.circles > 0) return false
  if (counts.faces > 0) return false
  if (counts.spheres > 0) return false
  if (counts.cones > 0) return false
  if (counts.cylinders > 0) return false
  return true
}

export function isSceneEmpty(scene: Scene): boolean {
  return checkSceneEmpty({
    points: scene.points.size,
    lines: scene.lines.size,
    straightLines: scene.straightLines.size,
    rays: scene.rays.size,
    vectors: scene.vectors.size,
    circles: scene.circles.size,
    faces: scene.faces.size,
    spheres: scene.spheres.size,
    cones: scene.cones.size,
    cylinders: scene.cylinders.size,
  })
}

export function isSerializedSceneEmpty(data: SerializedScene): boolean {
  return checkSceneEmpty({
    points: data.points.length,
    lines: data.lines.length,
    straightLines: data.straightLines.length,
    rays: data.rays.length,
    vectors: data.vectors.length,
    circles: data.circles.length,
    faces: data.faces.length,
    spheres: data.spheres.length,
    cones: data.cones.length,
    cylinders: data.cylinders?.length ?? 0,
  })
}

function localTimestampFileName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = now.getFullYear()
  const m = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  const h = pad(now.getHours())
  const min = pad(now.getMinutes())
  const s = pad(now.getSeconds())
  return `scene_${y}-${m}-${d}_${h}-${min}-${s}.json`
}

export async function downloadSceneAsJson(scene: Scene): Promise<boolean> {
  const serialized = exportScene(scene)
  const jsonStr = JSON.stringify(serialized, null, 2)
  const fileName = localTimestampFileName()

  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: 'JSON 场景文件',
            accept: { 'application/json': ['.json'] },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(jsonStr)
      await writable.close()
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return false
    }
  }

  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}

export function openJsonFileForImport(): Promise<{ data: unknown; fileName: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.style.display = 'none'
    document.body.appendChild(input)

    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        document.body.removeChild(input)
        resolve(null)
        return
      }

      try {
        const text = await file.text()
        const data = JSON.parse(text)
        document.body.removeChild(input)
        resolve({ data, fileName: file.name })
      } catch {
        document.body.removeChild(input)
        resolve(null)
      }
    }

    input.oncancel = () => {
      document.body.removeChild(input)
      resolve(null)
    }

    input.click()
  })
}
