import { Scene } from '../../../scene/Scene'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteStraightLineCommand(
  scene: Scene,
  line: StraightLine3,
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
    'straightLine',
    {
      elementIds: {
        straightLines: [line.id],
        points: dependentIntersectionPoints.map(({ point }) => point.id),
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
