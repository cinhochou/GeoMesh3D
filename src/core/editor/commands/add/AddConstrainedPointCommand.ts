import { Point3 } from '../../../geometry/Point3'
import { Scene } from '../../../scene/Scene'
import { ObjectConstrainedPointConstraint } from '../../../constraints/ObjectConstrainedPointConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddConstrainedPointCommand(
  scene: Scene,
  point: Point3,
  constraint: ObjectConstrainedPointConstraint,
): ReturnType<typeof createAddFeatureCommand> {
  return createAddFeatureCommand(scene, point.id, 'constrainedPoint', {
    point,
    constraint,
  })
}
