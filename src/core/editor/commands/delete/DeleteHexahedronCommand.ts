import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteHexahedronCommand(
  scene: Scene,
  faces: PlanarPolygon[],
  dependentPoints: Point3[],
  constraint: CubeConstraint,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    constraint.cubeId,
    'hexahedron',
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
      dependentIntersectionPoints,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
