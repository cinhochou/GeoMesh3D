import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Cone3 } from '../../../geometry/Cone3'

export function createAddConeCommand(
  scene: Scene,
  cone: Cone3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddConeCommand', scene, () => {
    scene.addCone(cone)
    cone.baseCenterPoint.coneId = cone.id
    cone.baseCenterPoint.coneRole = 'baseCenter'
    cone.apexPoint.coneId = cone.id
    cone.apexPoint.coneRole = 'apex'
  })

  cmd.executeAndCapture()
  return cmd
}
