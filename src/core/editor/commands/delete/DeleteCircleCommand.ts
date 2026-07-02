import { Scene } from '../../../scene/Scene'
import { Circle3 } from '../../../geometry/Circle3'
import { Cone3 } from '../../../geometry/Cone3'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteCircleCommand(
  scene: Scene,
  circle: Circle3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedCones: Cone3[] = [],
  relatedCylinders: Cylinder3[] = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    circle.id,
    'circle',
    {
      elementIds: {
        circles: [circle.id],
        cones: relatedCones.map((c) => c.id),
        cylinders: relatedCylinders.map((c) => c.id),
        points: [...dependentIntersectionPoints.map(({ point }) => point.id)],
      },
    },
    {
      circle,
      dependentIntersectionPoints,
      relatedCones,
      relatedCylinders,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
