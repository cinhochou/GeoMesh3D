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
  // 同 AddHexahedronCommand：必须用约束自身的 prismId，否则 intent.targetId
  // 在场景里查不到（聚焦失效），PrismFeature.update() 也会找不到约束。
  return createAddFeatureCommand(scene, constraint.prismId, 'prism', {
    points,
    boundaryLines,
    faces,
    bottomFaceId,
    bottomOwnerPointIds,
    topPointId,
    constraint,
  })
}
