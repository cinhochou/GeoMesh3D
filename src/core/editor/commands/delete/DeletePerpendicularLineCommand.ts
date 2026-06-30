import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeletePerpendicularLineCommand(
  scene: Scene,
  line: PerpendicularLine3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    line.id,
    'perpendicularLine',
    {
      elementIds: {
        perpendicularLines: [line.id],
      },
    },
    {
      line,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
