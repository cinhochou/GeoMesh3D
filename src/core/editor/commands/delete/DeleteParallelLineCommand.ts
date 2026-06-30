import { Scene } from '../../../scene/Scene'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteParallelLineCommand(
  scene: Scene,
  line: ParallelLine3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    line.id,
    'parallelLine',
    {
      elementIds: {
        parallelLines: [line.id],
      },
    },
    {
      line,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
