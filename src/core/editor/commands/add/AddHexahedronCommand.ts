import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'

export function createAddHexahedronCommand(
  scene: Scene,
  points: Point3[],
  faces: PlanarPolygon[],
  constraint: CubeConstraint,
  boundaryLines: Line3[] = [],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dependentIntersectionPoints: Array<{
    point: Point3
    constraint: import('../../../constraints/IntersectionPointConstraint').IntersectionPointConstraint
  }> = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddHexahedronCommand', scene, () => {
    points.forEach((point) => scene.addPoint(point))
    boundaryLines.forEach((line) => scene.addLine(line))
    faces.forEach((face) => scene.addFace(face))
    scene.addCubeConstraint(constraint)
  })

  cmd.executeAndCapture()
  return cmd
}
