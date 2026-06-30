import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { Circle3 } from '../../../geometry/Circle3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createAddFeatureCommand } from '../../../features'
import type { FeatureType } from '../../../features'

export type ElementType = 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'face' | 'perpendicularLine' | 'parallelLine'

function buildFeatureParams(
  element: Point3 | Line3 | StraightLine3 | Ray3 | GeoVector3 | Circle3 | PlanarPolygon | PerpendicularLine3 | ParallelLine3,
  type: ElementType,
  boundaryLines: Line3[] = [],
): Record<string, unknown> {
  if (type === 'point') {
    const p = element as Point3
    return {
      position: { x: p.position.x, y: p.position.y, z: p.position.z },
      name: p.name,
      visible: p.visible,
      nameVisible: p.nameVisible,
      valueVisible: p.valueVisible,
      labelOffsetX: p.labelOffsetX,
      labelOffsetY: p.labelOffsetY,
      locked: p.locked,
      userLocked: p.userLocked,
      circleId: p.circleId,
      circleRole: p.circleRole,
      sphereId: p.sphereId,
      sphereRole: p.sphereRole,
      coneId: p.coneId,
      coneRole: p.coneRole,
      cylinderId: p.cylinderId,
      cylinderRole: p.cylinderRole,
    }
  }

  if (type === 'circle') {
    return { circle: element as Circle3 }
  }

  if (type === 'face') {
    return { face: element as PlanarPolygon, boundaryLines }
  }

  if (type === 'perpendicularLine') {
    return { line: element as PerpendicularLine3 }
  }

  if (type === 'parallelLine') {
    return { line: element as ParallelLine3 }
  }

  const twoPoint = element as Line3 | StraightLine3 | Ray3 | GeoVector3
  const params: Record<string, unknown> = {
    p1Id: twoPoint.p1.id,
    p2Id: twoPoint.p2.id,
    name: twoPoint.name,
    visible: twoPoint.visible,
    nameVisible: twoPoint.nameVisible,
    valueVisible: twoPoint.valueVisible,
    labelOffsetX: twoPoint.labelOffsetX,
    labelOffsetY: twoPoint.labelOffsetY,
    userLocked: twoPoint.userLocked,
  }
  if (type === 'straightLine') {
    params.displayLength = (twoPoint as StraightLine3).displayLength
  }
  if (type === 'ray') {
    params.displayLength = (twoPoint as Ray3).displayLength
  }
  return params
}

export function createAddElementCommand(
  scene: Scene,
  element: Point3 | Line3 | StraightLine3 | Ray3 | GeoVector3 | Circle3 | PlanarPolygon | PerpendicularLine3 | ParallelLine3,
  type: ElementType,
  boundaryLines: Line3[] = [],
): ReturnType<typeof createAddFeatureCommand> {
  const featureType = type as FeatureType
  const params = buildFeatureParams(element, type, boundaryLines)

  return createAddFeatureCommand(scene, element.id, featureType, params)
}
