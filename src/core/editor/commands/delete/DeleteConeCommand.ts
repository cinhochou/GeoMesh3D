import { Cone3 } from '../../../geometry/Cone3'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteConeCommand(
  scene: Scene,
  cone: Cone3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    cone.id,
    'cone',
    { elementIds: { cones: [cone.id] } },
    { relatedPerpendicularLines, relatedParallelLines },
  )
}
