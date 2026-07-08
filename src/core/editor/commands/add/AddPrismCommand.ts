import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { PrismConstraint } from '../../../constraints/PrismConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddPrismCommand(
  scene: Scene,
  points: Point3[],
  boundaryLines: Line3[],
  faces: PlanarPolygon[],
  bottomFaceId: string,
  bottomOwnerPointIds: string[],
  topPointId: string,
  constraint: PrismConstraint,
): ReturnType<typeof createAddFeatureCommand> {
  const featureId = `prism_${crypto.randomUUID()}`
  return createAddFeatureCommand(scene, featureId, 'prism', {
    points,
    boundaryLines,
    faces,
    bottomFaceId,
    bottomOwnerPointIds,
    topPointId,
    constraint,
  })
}
