import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'

export function createAddRegularPolygonCommand(
  scene: Scene,
  points: Point3[],
  face: PlanarPolygon,
  constraint: RegularPolygonConstraint,
  boundaryLines: Line3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddRegularPolygonCommand', scene, () => {
    points.forEach((point) => scene.addPoint(point))
    boundaryLines.forEach((line) => scene.addLine(line))
    scene.addFace(face)
    scene.addRegularPolygonConstraint(constraint)
  })

  cmd.executeAndCapture()
  return cmd
}
