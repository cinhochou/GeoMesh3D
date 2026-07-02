// src/core/features/plugins/BasicElementFeature.ts
// 通用基础几何元素 Feature 插件：处理 point、line、straightLine、ray、vector。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene, SceneConstraint } from '../../scene/Scene'
import { Point3 } from '../../geometry/Point3'
import { Circle3 } from '../../geometry/Circle3'
import { Sphere3 } from '../../geometry/Sphere3'
import type { Cone3 } from '../../geometry/Cone3'
import type { Cylinder3 } from '../../geometry/Cylinder3'
import { Line3 } from '../../geometry/Line3'
import { StraightLine3 } from '../../geometry/StraightLine3'
import { Ray3 } from '../../geometry/Ray3'
import { GeoVector3 } from '../../geometry/GeoVector3'
import { Vec3 } from '../../geometry/Vec3'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import type { CubeConstraint } from '../../constraints/CubeConstraint'
import type { RegularPolygonConstraint } from '../../constraints/RegularPolygonConstraint'

export interface PointFeatureParams {
  position: { x: number; y: number; z: number }
  name?: string
  visible?: boolean
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  locked?: boolean
  userLocked?: boolean
  circleId?: string | null
  circleRole?: 'center' | null
  sphereId?: string | null
  sphereRole?: 'center' | 'radius' | null
  coneId?: string | null
  coneRole?: 'baseCenter' | 'apex' | null
  cylinderId?: string | null
  cylinderRole?: 'bottomCenter' | 'topCenter' | null
}

export interface TwoPointFeatureParams {
  p1Id: string
  p2Id: string
  name?: string
  visible?: boolean
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  userLocked?: boolean
  displayLength?: number
}

export interface DeleteLineParams {
  line: Line3
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  dependentCubes: Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: CubeConstraint
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }>
  dependentFaces: PlanarPolygon[]
  dependentRegularPolygons: Array<{
    face: PlanarPolygon
    constraint: RegularPolygonConstraint
    dependentPoints: Point3[]
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface DeleteStraightLineParams {
  line: StraightLine3
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface DeleteRayParams {
  ray: Ray3
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface DeleteVectorParams {
  vector: GeoVector3
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface DeletePointParams {
  point: Point3
  relatedLines: Line3[]
  relatedStraightLines: StraightLine3[]
  relatedRays: Ray3[]
  relatedVectors: GeoVector3[]
  relatedCircles: Circle3[]
  relatedFaces: PlanarPolygon[]
  pointConstraint: SceneConstraint | null
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  dependentCubes: Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: CubeConstraint
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }>
  relatedSpheres: Sphere3[]
  dependentRegularPolygons: Array<{
    face: PlanarPolygon
    constraint: RegularPolygonConstraint
    dependentPoints: Point3[]
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
  relatedCones: Cone3[]
  relatedCylinders: Cylinder3[]
}

export type BasicElementFeatureParams = PointFeatureParams | TwoPointFeatureParams

function isPointParams(params: BasicElementFeatureParams): params is PointFeatureParams {
  return 'position' in params
}

function createPoint(scene: Scene, feature: Feature<PointFeatureParams>): GeneratedGeometry {
  const params = feature.params
  const point = new Point3(
    feature.id,
    params.name ?? '',
    new Vec3(params.position.x, params.position.y, params.position.z),
    params.locked ?? false,
    params.nameVisible ?? true,
    params.userLocked ?? false,
    params.labelOffsetX ?? Point3.DEFAULT_LABEL_OFFSET_X,
    params.labelOffsetY ?? Point3.DEFAULT_LABEL_OFFSET_Y,
    params.valueVisible ?? false,
    params.visible ?? true,
  )
  point.circleId = params.circleId ?? null
  point.circleRole = params.circleRole ?? null
  point.sphereId = params.sphereId ?? null
  point.sphereRole = params.sphereRole ?? null
  point.coneId = params.coneId ?? null
  point.coneRole = params.coneRole ?? null
  point.cylinderId = params.cylinderId ?? null
  point.cylinderRole = params.cylinderRole ?? null

  scene.addPoint(point)
  return { elementIds: { points: [point.id] } }
}

function createTwoPointElement(
  scene: Scene,
  feature: Feature<TwoPointFeatureParams>,
  type: 'line' | 'straightLine' | 'ray' | 'vector',
): GeneratedGeometry {
  const params = feature.params
  const p1 = scene.points.get(params.p1Id)
  const p2 = scene.points.get(params.p2Id)
  if (!p1 || !p2) {
    throw new Error(`${type}Feature: required points not found`)
  }

  const kindMap: Record<
    typeof type,
    { ctor: new (...args: unknown[]) => unknown; elementKey: string }
  > = {
    line: {
      ctor: Line3 as unknown as new (...args: unknown[]) => unknown,
      elementKey: 'lines',
    },
    straightLine: {
      ctor: StraightLine3 as unknown as new (...args: unknown[]) => unknown,
      elementKey: 'straightLines',
    },
    ray: {
      ctor: Ray3 as unknown as new (...args: unknown[]) => unknown,
      elementKey: 'rays',
    },
    vector: {
      ctor: GeoVector3 as unknown as new (...args: unknown[]) => unknown,
      elementKey: 'vectors',
    },
  }

  const { ctor, elementKey } = kindMap[type]
  const args = [
    feature.id,
    params.name ?? '',
    p1,
    p2,
    params.nameVisible ?? false,
    params.visible ?? true,
  ] as unknown[]

  if (type === 'line') {
    args.push(false, undefined, params.userLocked ?? false)
  } else if (type === 'straightLine' || type === 'ray') {
    args.push(params.displayLength ?? (type === 'straightLine' ? StraightLine3.DEFAULT_DISPLAY_LENGTH : Ray3.DEFAULT_DISPLAY_LENGTH))
    args.push(params.userLocked ?? false)
  } else if (type === 'vector') {
    args.push(params.userLocked ?? false)
  }

  args.push(params.labelOffsetX ?? 0, params.labelOffsetY ?? 0, params.valueVisible ?? false)

  const element = new ctor(...args)
  const addMethod = (scene as unknown as Record<string, (el: unknown) => void>)[`add${elementKey.charAt(0).toUpperCase()}${elementKey.slice(1, -1)}`]
  if (typeof addMethod !== 'function') {
    throw new Error(`${type}Feature: add method not found on scene`)
  }
  addMethod.call(scene, element)

  return { elementIds: { [elementKey]: [feature.id] } }
}

function deleteLine(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
  void _geometry
  const params = feature.params as unknown as DeleteLineParams

  params.relatedPerpendicularLines?.forEach((line) => {
    scene.removePerpendicularLine(line.id)
    scene.selection.perpendicularLines.delete(line.id)
  })
  params.relatedParallelLines?.forEach((line) => {
    scene.removeParallelLine(line.id)
    scene.selection.parallelLines.delete(line.id)
  })

  params.dependentCubes?.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
    scene.removeCubeConstraint(constraint.cubeId)
    faces.forEach((face) => scene.removeFace(face.id))

    const allBoundaryLineIds = new Set(faces.flatMap((face) => face.boundaryLineIds))
    const deletedBoundaryLines = [...allBoundaryLineIds]
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })

    dependentIntersectionPoints?.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    dependentPoints?.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
  })

  params.dependentRegularPolygons?.forEach(({ face, constraint, dependentPoints, dependentIntersectionPoints }) => {
    dependentIntersectionPoints?.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    dependentPoints?.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    scene.removeRegularPolygonConstraint(constraint.constraintId)
    scene.removeFace(face.id)

    const deletedBoundaryLines = face.boundaryLineIds
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)
      .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, line.id, face.id))

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })
  })

  params.dependentFaces?.forEach((face) => {
    scene.removeFace(face.id)
  })
  params.dependentFaces?.forEach((face) => {
    face.boundaryLineIds.forEach((lineId) => {
      if (lineId === params.line.id) return
      const boundaryLine = scene.lines.get(lineId)
      if (!boundaryLine || !boundaryLine.faceOwned) return
      if (PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, lineId, face.id)) return
      scene.lines.delete(lineId)
      scene.selection.lines.delete(lineId)
    })
  })

  params.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
    scene.removeIntersectionConstraint(constraint.pointId)
    scene.points.delete(point.id)
    scene.selection.points.delete(point.id)
  })

  scene.lines.delete(params.line.id)
  scene.selection.lines.delete(params.line.id)
}

function deleteStraightLine(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
  void _geometry
  const params = feature.params as unknown as DeleteStraightLineParams

  params.relatedPerpendicularLines?.forEach((line) => {
    scene.removePerpendicularLine(line.id)
    scene.selection.perpendicularLines.delete(line.id)
  })
  params.relatedParallelLines?.forEach((line) => {
    scene.removeParallelLine(line.id)
    scene.selection.parallelLines.delete(line.id)
  })
  params.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
    scene.removeIntersectionConstraint(constraint.pointId)
    scene.points.delete(point.id)
    scene.selection.points.delete(point.id)
  })
  scene.straightLines.delete(params.line.id)
  scene.selection.straightLines.delete(params.line.id)
}

function deleteRay(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
  void _geometry
  const params = feature.params as unknown as DeleteRayParams

  params.relatedPerpendicularLines?.forEach((line) => {
    scene.removePerpendicularLine(line.id)
    scene.selection.perpendicularLines.delete(line.id)
  })
  params.relatedParallelLines?.forEach((line) => {
    scene.removeParallelLine(line.id)
    scene.selection.parallelLines.delete(line.id)
  })
  params.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
    scene.removeIntersectionConstraint(constraint.pointId)
    scene.points.delete(point.id)
    scene.selection.points.delete(point.id)
  })
  scene.rays.delete(params.ray.id)
  scene.selection.rays.delete(params.ray.id)
}

function deleteVector(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
  void _geometry
  const params = feature.params as unknown as DeleteVectorParams

  params.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
    scene.removeIntersectionConstraint(constraint.pointId)
    scene.points.delete(point.id)
    scene.selection.points.delete(point.id)
  })

  params.relatedPerpendicularLines?.forEach((line) => {
    scene.removePerpendicularLine(line.id)
    scene.selection.perpendicularLines.delete(line.id)
  })
  params.relatedParallelLines?.forEach((line) => {
    scene.removeParallelLine(line.id)
    scene.selection.parallelLines.delete(line.id)
  })
  scene.vectors.delete(params.vector.id)
  scene.selection.vectors.delete(params.vector.id)
  scene.markAllRenderDirty()
}

function deletePoint(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
  void _geometry
  const params = feature.params as unknown as DeletePointParams
  const point = params.point

  params.relatedLines?.forEach((line) => {
    scene.lines.delete(line.id)
    scene.selection.lines.delete(line.id)
  })
  params.relatedStraightLines?.forEach((line) => {
    scene.straightLines.delete(line.id)
    scene.selection.straightLines.delete(line.id)
  })
  params.relatedRays?.forEach((ray) => {
    scene.rays.delete(ray.id)
    scene.selection.rays.delete(ray.id)
  })
  params.relatedVectors?.forEach((vector) => {
    scene.vectors.delete(vector.id)
    scene.selection.vectors.delete(vector.id)
  })
  params.relatedCircles?.forEach((circle) => {
    scene.circles.delete(circle.id)
    scene.selection.circles.delete(circle.id)
  })
  params.relatedSpheres?.forEach((sphere) => {
    scene.removeSphere(sphere.id)
    sphere.centerPoint.sphereId = null
    sphere.centerPoint.sphereRole = null
    if (sphere.radiusPoint) {
      sphere.radiusPoint.sphereId = null
      sphere.radiusPoint.sphereRole = null
    }
  })
  const centerPoints = params.relatedCircles
    .map((circle) =>
      [...scene.points.values()].find(
        (p) => p.circleId === circle.id && p.circleRole === 'center',
      ),
    )
    .filter((p): p is Point3 => p !== undefined)
  centerPoints.forEach((p) => {
    scene.points.delete(p.id)
    scene.selection.points.delete(p.id)
  })
  params.relatedFaces?.forEach((face) => {
    const deletedBoundaryLines = face.boundaryLineIds
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)
      .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, line.id, face.id))

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })
    scene.removeFace(face.id)
  })
  params.dependentCubes?.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
    scene.removeCubeConstraint(constraint.cubeId)
    faces.forEach((face) => scene.removeFace(face.id))

    const allBoundaryLineIds = new Set(faces.flatMap((face) => face.boundaryLineIds))
    const deletedBoundaryLines = [...allBoundaryLineIds]
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })

    dependentIntersectionPoints?.forEach(({ point: p, constraint: c }) => {
      scene.removeIntersectionConstraint(c.pointId)
      scene.points.delete(p.id)
      scene.selection.points.delete(p.id)
    })
    dependentPoints?.forEach((p) => {
      scene.points.delete(p.id)
      scene.selection.points.delete(p.id)
    })
  })
  params.dependentRegularPolygons?.forEach(({ face, constraint, dependentPoints, dependentIntersectionPoints }) => {
    dependentIntersectionPoints?.forEach(({ point: p, constraint: c }) => {
      scene.removeIntersectionConstraint(c.pointId)
      scene.points.delete(p.id)
      scene.selection.points.delete(p.id)
    })
    dependentPoints?.forEach((p) => {
      scene.points.delete(p.id)
      scene.selection.points.delete(p.id)
    })
    scene.removeRegularPolygonConstraint(constraint.constraintId)
    scene.removeFace(face.id)

    const deletedBoundaryLines = face.boundaryLineIds
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)
      .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, line.id, face.id))

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })
  })
  params.relatedPerpendicularLines?.forEach((line) => {
    scene.removePerpendicularLine(line.id)
    scene.selection.perpendicularLines.delete(line.id)
  })
  params.relatedParallelLines?.forEach((line) => {
    scene.removeParallelLine(line.id)
    scene.selection.parallelLines.delete(line.id)
  })
  params.relatedCones?.forEach((cone) => {
    if (cone.normalCircleId) {
      const circle = scene.circles.get(cone.normalCircleId)
      if (circle) {
        scene.circles.delete(circle.id)
        scene.selection.circles.delete(circle.id)
        circle.p1.circleId = null
        circle.p1.circleRole = null
      }
    }
    scene.removeCone(cone.id)
    cone.baseCenterPoint.coneId = null
    cone.baseCenterPoint.coneRole = null
    cone.apexPoint.coneId = null
    cone.apexPoint.coneRole = null
    scene.selection.cones.delete(cone.id)
  })
  params.relatedCylinders?.forEach((cylinder) => {
    if (cylinder.normalCircleId) {
      const circle = scene.circles.get(cylinder.normalCircleId)
      if (circle) {
        scene.circles.delete(circle.id)
        scene.selection.circles.delete(circle.id)
        circle.p1.circleId = null
        circle.p1.circleRole = null
      }
    }
    if (cylinder.topNormalCircleId) {
      const circle = scene.circles.get(cylinder.topNormalCircleId)
      if (circle) {
        scene.circles.delete(circle.id)
        scene.selection.circles.delete(circle.id)
        circle.p1.circleId = null
        circle.p1.circleRole = null
      }
    }
    scene.removeCylinder(cylinder.id)
    cylinder.bottomCenterPoint.cylinderId = null
    cylinder.bottomCenterPoint.cylinderRole = null
    cylinder.topCenterPoint.cylinderId = null
    cylinder.topCenterPoint.cylinderRole = null
    scene.selection.cylinders.delete(cylinder.id)
  })
  params.dependentIntersectionPoints?.forEach(({ point: p, constraint: c }) => {
    scene.removeIntersectionConstraint(c.pointId)
    scene.points.delete(p.id)
    scene.selection.points.delete(p.id)
  })

  if (params.pointConstraint?.pointId) {
    scene.removeIntersectionConstraint(params.pointConstraint.pointId)
  }

  scene.points.delete(point.id)
  scene.selection.points.delete(point.id)
}

export interface PointUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  visible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  userLocked?: boolean
}

export interface TwoPointUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  userLocked?: boolean
  lengthLocked?: boolean
  lockedLength?: number
  displayLength?: number
  p1Position?: { x: number; y: number; z: number }
  p2Position?: { x: number; y: number; z: number }
}

function updatePoint(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
  const state = params as unknown as PointUpdateState
  const point = scene.points.get(feature.id)
  if (!point) {
    throw new Error(`PointFeature: point "${feature.id}" not found for update`)
  }

  if (state.name !== undefined) point.name = state.name
  if (state.nameVisible !== undefined) point.nameVisible = state.nameVisible
  if (state.valueVisible !== undefined) point.valueVisible = state.valueVisible
  if (state.visible !== undefined) {
    point.visible = state.visible
    // 同步圆心点的 visible 到圆的 centerVisible
    if (point.circleRole === 'center' && point.circleId) {
      const circle = scene.circles.get(point.circleId)
      if (circle) {
        circle.centerVisible = state.visible
      }
    }
  }
  if (state.labelOffsetX !== undefined) point.labelOffsetX = state.labelOffsetX
  if (state.labelOffsetY !== undefined) point.labelOffsetY = state.labelOffsetY
  if (state.userLocked !== undefined) point.userLocked = state.userLocked

  return { elementIds: { points: [point.id] } }
}

function updateTwoPointElement(
  scene: Scene,
  feature: Feature,
  _geometry: GeneratedGeometry,
  params: Record<string, unknown>,
  type: 'line' | 'straightLine' | 'ray' | 'vector',
): GeneratedGeometry {
  const state = params as unknown as TwoPointUpdateState

  const containerMap = {
    line: scene.lines,
    straightLine: scene.straightLines,
    ray: scene.rays,
    vector: scene.vectors,
  } as const
  const container = containerMap[type]
  const element = container.get(feature.id)
  if (!element) {
    throw new Error(`${type}Feature: element "${feature.id}" not found for update`)
  }

  if (state.name !== undefined) element.name = state.name
  if (state.nameVisible !== undefined) element.nameVisible = state.nameVisible
  if (state.valueVisible !== undefined) element.valueVisible = state.valueVisible
  if (state.labelOffsetX !== undefined) element.labelOffsetX = state.labelOffsetX
  if (state.labelOffsetY !== undefined) element.labelOffsetY = state.labelOffsetY
  if (state.visible !== undefined) element.visible = state.visible
  if (state.userLocked !== undefined) element.userLocked = state.userLocked

  if (type === 'line') {
    const line = element as Line3
    if (state.lengthLocked !== undefined) line.lengthLocked = state.lengthLocked
    if (state.lockedLength !== undefined) line.lockedLength = Line3.normalizeLockedLength(state.lockedLength)
    if (state.p1Position) line.p1.setPosition(new Vec3(state.p1Position.x, state.p1Position.y, state.p1Position.z))
    if (state.p2Position) line.p2.setPosition(new Vec3(state.p2Position.x, state.p2Position.y, state.p2Position.z))
  } else if (type === 'straightLine') {
    const line = element as StraightLine3
    if (state.displayLength !== undefined) line.displayLength = StraightLine3.normalizeDisplayLength(state.displayLength)
  } else if (type === 'ray') {
    const ray = element as Ray3
    if (state.displayLength !== undefined) ray.displayLength = Ray3.normalizeDisplayLength(state.displayLength)
  }

  return { elementIds: { [`${type}s`]: [feature.id] } }
}

function makePlugin(type: 'point' | 'line' | 'straightLine' | 'ray' | 'vector'): FeaturePlugin {
  return {
    type,

    getDependencies(params) {
      const p = params as unknown as BasicElementFeatureParams
      if (isPointParams(p)) return []
      return [p.p1Id, p.p2Id]
    },

    create(scene: Scene, feature: Feature): GeneratedGeometry {
      const params = feature.params as unknown as BasicElementFeatureParams
      if (type === 'point') {
        if (!isPointParams(params)) {
          throw new Error('PointFeature: expected position in params')
        }
        return createPoint(scene, { ...feature, params })
      }
      if (!isPointParams(params)) {
        return createTwoPointElement(scene, { ...feature, params }, type)
      }
      throw new Error(`${type}Feature: expected p1Id/p2Id in params`)
    },

    update(scene: Scene, feature: Feature, geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
      if (type === 'point') {
        return updatePoint(scene, feature, geometry, params)
      }
      return updateTwoPointElement(scene, feature, geometry, params, type)
    },

    delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
      switch (type) {
        case 'point':
          deletePoint(scene, feature, geometry)
          break
        case 'line':
          deleteLine(scene, feature, geometry)
          break
        case 'straightLine':
          deleteStraightLine(scene, feature, geometry)
          break
        case 'ray':
          deleteRay(scene, feature, geometry)
          break
        case 'vector':
          deleteVector(scene, feature, geometry)
          break
      }
    },
  }
}

export const pointFeaturePlugin = makePlugin('point')
export const lineFeaturePlugin = makePlugin('line')
export const straightLineFeaturePlugin = makePlugin('straightLine')
export const rayFeaturePlugin = makePlugin('ray')
export const vectorFeaturePlugin = makePlugin('vector')
