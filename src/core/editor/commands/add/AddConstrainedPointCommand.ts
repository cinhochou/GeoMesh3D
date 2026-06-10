import { SnapshotCommand } from '../SnapshotCommand'
import { Point3 } from '../../../geometry/Point3'
import { Scene } from '../../../scene/Scene'
import { ObjectConstrainedPointConstraint } from '../../../constraints/ObjectConstrainedPointConstraint'

export function createAddConstrainedPointCommand(
  scene: Scene,
  point: Point3,
  constraint: ObjectConstrainedPointConstraint,
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddConstrainedPointCommand', scene, () => {
    scene.addPoint(point)
    scene.addObjectConstrainedPointConstraint(constraint)
  })

  cmd.executeAndCapture()
  return cmd
}
