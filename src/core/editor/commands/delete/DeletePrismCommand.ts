import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { PrismConstraint } from '../../../constraints/PrismConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeletePrismCommand(
  scene: Scene,
  faces: PlanarPolygon[],
  dependentPoints: Point3[],
  constraint: PrismConstraint,
  bottomFaceId: string,
  bottomOwnerPointIds: string[],
  topPointId: string,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    constraint.prismId,
    'prism',
    {
      elementIds: {
        points: dependentPoints.map((p) => p.id),
        lines: [...new Set(faces.flatMap((f) => f.boundaryLineIds))],
        faces: faces.map((f) => f.id),
      },
    },
    {
      faces,
      dependentPoints,
      constraint,
      bottomFaceId,
      bottomOwnerPointIds,
      topPointId,
      dependentIntersectionPoints,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
