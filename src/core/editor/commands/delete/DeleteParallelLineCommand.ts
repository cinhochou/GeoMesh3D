import { Scene } from '../../../scene/Scene'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteParallelLineCommand(
  scene: Scene,
  line: ParallelLine3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    line.id,
    'parallelLine',
    {
      elementIds: {
        parallelLines: [
          line.id,
          ...relatedParallelLines.map((l) => l.id),
        ],
        perpendicularLines: relatedPerpendicularLines.map((l) => l.id),
        points: [
          ...dependentIntersectionPoints.map(({ point }) => point.id),
        ],
      },
    },
    {
      line,
      dependentIntersectionPoints,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
