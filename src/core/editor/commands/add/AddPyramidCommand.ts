import { Scene } from '../../../scene/Scene'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { PyramidConstraint } from '../../../constraints/PyramidConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddPyramidCommand(
  scene: Scene,
  boundaryLines: Line3[],
  faces: PlanarPolygon[],
  bottomFaceId: string,
  bottomOwnerPointIds: string[],
  apexPointId: string,
  constraint: PyramidConstraint,
): ReturnType<typeof createAddFeatureCommand> {
  const featureId = `pyramid_${crypto.randomUUID()}`
  return createAddFeatureCommand(scene, featureId, 'pyramid', {
    boundaryLines,
    faces,
    bottomFaceId,
    bottomOwnerPointIds,
    apexPointId,
    constraint,
  })
}
