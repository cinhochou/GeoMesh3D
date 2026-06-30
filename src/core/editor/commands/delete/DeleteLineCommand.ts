import { Scene } from '../../../scene/Scene'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteLineCommand(
  scene: Scene,
  line: Line3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  dependentCubes: Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: CubeConstraint
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  dependentFaces: PlanarPolygon[] = [],
  dependentRegularPolygons: Array<{
    face: PlanarPolygon
    constraint: RegularPolygonConstraint
    dependentPoints: Point3[]
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  const cubeBoundaryLineIds = dependentCubes.flatMap(({ faces }) =>
    faces.flatMap((face) => face.boundaryLineIds),
  )
  const regularPolygonBoundaryLineIds = dependentRegularPolygons.flatMap(({ face }) =>
    face.boundaryLineIds,
  )
  const faceBoundaryLineIds = dependentFaces.flatMap((face) => face.boundaryLineIds)

  return createDeleteFeatureCommand(
    scene,
    line.id,
    'line',
    {
      elementIds: {
        lines: [
          line.id,
          ...new Set([...cubeBoundaryLineIds, ...regularPolygonBoundaryLineIds, ...faceBoundaryLineIds]),
        ],
        faces: [
          ...dependentCubes.flatMap(({ faces }) => faces.map((f) => f.id)),
          ...dependentRegularPolygons.map(({ face }) => face.id),
          ...dependentFaces.map((f) => f.id),
        ],
        points: [
          ...new Set([
            ...dependentIntersectionPoints.map(({ point }) => point.id),
            ...dependentCubes.flatMap(({ dependentPoints, dependentIntersectionPoints }) => [
              ...dependentPoints.map((p) => p.id),
              ...dependentIntersectionPoints.map(({ point }) => point.id),
            ]),
            ...dependentRegularPolygons.flatMap(({ dependentPoints, dependentIntersectionPoints }) => [
              ...dependentPoints.map((p) => p.id),
              ...dependentIntersectionPoints.map(({ point }) => point.id),
            ]),
          ]),
        ],
      },
    },
    {
      line,
      dependentIntersectionPoints,
      dependentCubes,
      dependentFaces,
      dependentRegularPolygons,
      relatedPerpendicularLines,
      relatedParallelLines,
    },
  )
}
