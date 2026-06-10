import { SnapshotCommand } from '../SnapshotCommand'
import { Point3 } from '../../../geometry/Point3'
import { Scene } from '../../../scene/Scene'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'

export function createAddIntersectionPointCommand(
  scene: Scene,
  point: Point3,
  constraint: IntersectionPointConstraint,
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddIntersectionPointCommand', scene, () => {
    scene.addPoint(point)
    scene.addIntersectionConstraint(constraint)
  })

  cmd.executeAndCapture()
  return cmd
}
