import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddRegularPolygonCommand(
  scene: Scene,
  points: Point3[],
  face: PlanarPolygon,
  constraint: RegularPolygonConstraint,
  boundaryLines: Line3[] = [],
): ReturnType<typeof createAddFeatureCommand> {
  // 同 AddHexahedronCommand：必须用约束自身的 constraintId，否则 intent.targetId
  // 在场景里查不到（聚焦失效），RegularPolygonFeature.update() 也会找不到约束。
  return createAddFeatureCommand(scene, constraint.constraintId, 'regularPolygon', {
    points,
    boundaryLines,
    face,
    constraint,
  })
}
