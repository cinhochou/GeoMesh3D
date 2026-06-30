import { Scene } from '../../../scene/Scene'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteVectorCommand(
  scene: Scene,
  vector: GeoVector3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    vector.id,
    'vector',
    {
      elementIds: {
        vectors: [vector.id],
      },
    },
    {
      vector,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
