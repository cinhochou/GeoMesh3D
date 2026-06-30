import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { createAddFeatureCommand } from '../../../features'

export function createAddHexahedronCommand(
  scene: Scene,
  points: Point3[],
  faces: PlanarPolygon[],
  constraint: CubeConstraint,
  boundaryLines: Line3[] = [],
): ReturnType<typeof createAddFeatureCommand> {
  const featureId = `hexa_${crypto.randomUUID()}`
  return createAddFeatureCommand(scene, featureId, 'hexahedron', {
    points,
    boundaryLines,
    faces,
    constraint,
  })
}
