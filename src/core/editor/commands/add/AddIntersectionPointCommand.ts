import { Point3 } from '../../../geometry/Point3'
import { Scene } from '../../../scene/Scene'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddIntersectionPointCommand(
  scene: Scene,
  point: Point3,
  constraint: IntersectionPointConstraint,
): ReturnType<typeof createAddFeatureCommand> {
  return createAddFeatureCommand(scene, point.id, 'intersectionPoint', {
    point,
    constraint,
  })
}
