import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeletePerpendicularLineCommand(
  scene: Scene,
  line: PerpendicularLine3,
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
    'perpendicularLine',
    {
      elementIds: {
        perpendicularLines: [
          line.id,
          ...relatedPerpendicularLines.map((l) => l.id),
        ],
        parallelLines: relatedParallelLines.map((l) => l.id),
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
