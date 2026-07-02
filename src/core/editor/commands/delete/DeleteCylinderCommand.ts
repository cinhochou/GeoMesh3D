import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteCylinderCommand(
  scene: Scene,
  cylinder: Cylinder3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    cylinder.id,
    'cylinder',
    { elementIds: { cylinders: [cylinder.id], circles: [cylinder.normalCircleId, cylinder.topNormalCircleId].filter((id): id is string => !!id), points: [...dependentIntersectionPoints.map(({ point }) => point.id)] } },
    { dependentIntersectionPoints, relatedPerpendicularLines, relatedParallelLines },
  )
}
