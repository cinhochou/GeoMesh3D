import { Scene } from '../../../scene/Scene'
import { Ray3 } from '../../../geometry/Ray3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteRayCommand(
  scene: Scene,
  ray: Ray3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    ray.id,
    'ray',
    {
      elementIds: {
        rays: [ray.id],
        points: dependentIntersectionPoints.map(({ point }) => point.id),
      },
    },
    {
      ray,
      dependentIntersectionPoints,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
