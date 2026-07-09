import { Scene, type SceneConstraint } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { Ray3 } from '../../../geometry/Ray3'
import { GeoVector3 } from '../../../geometry/GeoVector3'
import { Circle3 } from '../../../geometry/Circle3'
import { Sphere3 } from '../../../geometry/Sphere3'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'
import { Cone3 } from '../../../geometry/Cone3'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { createDeleteFeatureCommand } from '../../../features'
import type { DependentPrismCascade, DependentPyramidCascade } from '../../../features/plugins/BasicElementFeature'

export function createDeletePointCommand(
  scene: Scene,
  point: Point3,
  relatedLines: Line3[],
  relatedStraightLines: StraightLine3[],
  relatedRays: Ray3[],
  relatedVectors: GeoVector3[],
  relatedCircles: Circle3[],
  relatedFaces: PlanarPolygon[],
  pointConstraint: SceneConstraint | null = null,
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
  relatedSpheres: Sphere3[] = [],
  dependentRegularPolygons: Array<{
    face: PlanarPolygon
    constraint: RegularPolygonConstraint
    dependentPoints: Point3[]
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  dependentPrisms: DependentPrismCascade[] = [],
  dependentPyramids: DependentPyramidCascade[] = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
  relatedCones: Cone3[] = [],
  relatedCylinders: Cylinder3[] = [],
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(
    scene,
    point.id,
    'point',
    {
      elementIds: {
        points: [point.id],
        lines: relatedLines.map((l) => l.id),
        straightLines: relatedStraightLines.map((l) => l.id),
        rays: relatedRays.map((r) => r.id),
        vectors: relatedVectors.map((v) => v.id),
        circles: relatedCircles.map((c) => c.id),
        spheres: relatedSpheres.map((s) => s.id),
        cones: relatedCones.map((c) => c.id),
        cylinders: relatedCylinders.map((c) => c.id),
        faces: [
          ...relatedFaces.map((f) => f.id),
          ...dependentCubes.flatMap(({ faces }) => faces.map((f) => f.id)),
          ...dependentRegularPolygons.map(({ face }) => face.id),
          ...dependentPrisms.flatMap(({ faces }) => faces.map((f) => f.id)),
          ...dependentPyramids.flatMap(({ faces }) => faces.map((f) => f.id)),
        ],
      },
    },
    {
      point,
      relatedLines,
      relatedStraightLines,
      relatedRays,
      relatedVectors,
      relatedCircles,
      relatedFaces,
      pointConstraint,
      dependentIntersectionPoints,
      dependentCubes,
      relatedSpheres,
      dependentRegularPolygons,
      dependentPrisms,
      dependentPyramids,
      relatedPerpendicularLines,
      relatedParallelLines,
      relatedCones,
      relatedCylinders,
    },
  )
}
