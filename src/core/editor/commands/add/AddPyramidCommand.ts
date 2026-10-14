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
  // 同 AddHexahedronCommand：必须用约束自身的 pyramidId，否则 intent.targetId
  // 在场景里查不到（聚焦失效），PyramidFeature.update() 也会找不到约束。
  return createAddFeatureCommand(scene, constraint.pyramidId, 'pyramid', {
    boundaryLines,
    faces,
    bottomFaceId,
    bottomOwnerPointIds,
    apexPointId,
    constraint,
  })
}
