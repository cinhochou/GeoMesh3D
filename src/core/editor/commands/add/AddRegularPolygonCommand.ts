import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddRegularPolygonCommand(
  scene: Scene,
  points: Point3[],
  face: PlanarPolygon,
  constraint: RegularPolygonConstraint,
  boundaryLines: Line3[] = [],
): ReturnType<typeof createAddFeatureCommand> {
  const featureId = `regpoly_${crypto.randomUUID()}`
  return createAddFeatureCommand(scene, featureId, 'regularPolygon', {
    points,
    boundaryLines,
    face,
    constraint,
  })
}
