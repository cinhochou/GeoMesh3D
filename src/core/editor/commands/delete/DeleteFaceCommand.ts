import { Scene } from '../../../scene/Scene'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteFaceCommand(
  scene: Scene,
  face: PlanarPolygon,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    face.id,
    'face',
    {
      elementIds: {
        faces: [face.id],
        points: dependentIntersectionPoints.map(({ point }) => point.id),
      },
    },
    {
      face,
      dependentIntersectionPoints,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
