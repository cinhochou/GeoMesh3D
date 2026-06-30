import { Scene } from '../../../scene/Scene'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Point3 } from '../../../geometry/Point3'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteRegularPolygonCommand(
  scene: Scene,
  face: PlanarPolygon,
  constraint: RegularPolygonConstraint,
  dependentPoints: Point3[],
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    constraint.constraintId,
    'regularPolygon',
    {
      elementIds: {
        points: dependentPoints.map((p) => p.id),
        lines: face.boundaryLineIds,
        faces: [face.id],
      },
    },
    {
      face,
      constraint,
      dependentPoints,
      dependentIntersectionPoints,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
